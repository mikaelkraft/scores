const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');

const dailyBoardCache = require('../services/dailyBoardCache');
const sportScoreService = require('../services/sportScoreService');
const footballApi = require('../controllers/footballApiController');

test.after(async () => {
    try { await mongoose.disconnect(); } catch (_) {}
});

test('dailyBoardCache never prematurely finalizes a live match to FT during mid-game provider hiccups (Istanbul Basaksehir regression)', () => {
    dailyBoardCache.clearBoardCache();
    const dateKey = '20261123';
    // Match kicked off 93 minutes ago (e.g. 18:00 kickoff at 19:33 -> ~78' in 2nd half)
    const kickoffIso = new Date(Date.now() - 93 * 60 * 1000).toISOString();

    dailyBoardCache.setReadyBoard(dateKey, [
        {
            id: 'tur-basaksehir-corum',
            league_slug: 'tur.1',
            league: { slug: 'tur.1', name: 'Turkish Süper Lig', country: 'Turkey' },
            date: kickoffIso,
            scoreboard_date: dateKey,
            home: { name: 'Istanbul Basaksehir', score: 0 },
            away: { name: 'Çorum FK', score: 0 },
            status: { state: 'in', isLive: true, completed: false, clock: "78'", detail: "78'" }
        }
    ]);

    // Simulate 3 consecutive full live snapshots where the match temporarily drops out due to upstream blip
    dailyBoardCache.patchLiveMatchesInBoard(dateKey, [], { isFullSnapshot: true });
    dailyBoardCache.patchLiveMatchesInBoard(dateKey, [], { isFullSnapshot: true });
    dailyBoardCache.patchLiveMatchesInBoard(dateKey, [], { isFullSnapshot: true });

    const board = dailyBoardCache.getReadyBoard(dateKey);
    assert.equal(board.matches.length, 1);
    assert.equal(board.matches[0].status.state, 'in', 'Match at 93m elapsed must stay LIVE, never prematurely marked FT');
    assert.equal(board.matches[0].status.isLive, true);
    assert.equal(board.matches[0].status.completed, false);
});

test('dailyBoardCache revives an auto-finalized match when live feed resumes with updated score, while protecting old completed matches', () => {
    dailyBoardCache.clearBoardCache();
    const dateKey = '20261123';
    const kickoffIso = new Date(Date.now() - 125 * 60 * 1000).toISOString();
    const oldFinishedKickoff = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();

    dailyBoardCache.setReadyBoard(dateKey, [
        {
            id: 'tur-revive-1',
            league_slug: 'tur.1',
            league: { slug: 'tur.1', name: 'Turkish Süper Lig', country: 'Turkey' },
            date: kickoffIso,
            scoreboard_date: dateKey,
            home: { name: 'Istanbul Basaksehir', score: 0 },
            away: { name: 'Çorum FK', score: 0 },
            status: { state: 'in', isLive: true, completed: false, clock: "90'", detail: "90'" }
        },
        {
            id: 'eng-finished-1',
            league_slug: 'eng.1',
            league: { slug: 'eng.1', name: 'Premier League', country: 'England' },
            date: oldFinishedKickoff,
            scoreboard_date: dateKey,
            home: { name: 'Arsenal', score: 2 },
            away: { name: 'Chelsea', score: 1 },
            status: { state: 'post', isLive: false, completed: true, clock: 'FT', detail: 'FT' }
        }
    ]);

    // Auto-finalize tur-revive-1 because it left snapshot at 90' + 125m elapsed
    dailyBoardCache.patchLiveMatchesInBoard(dateKey, [], { isFullSnapshot: true });
    let board = dailyBoardCache.getReadyBoard(dateKey);
    const autoFin = board.matches.find(m => m.id === 'tur-revive-1');
    assert.equal(autoFin.status.state, 'post');
    assert.equal(autoFin._autoFinalized, true);

    // Live feed resumes reporting tur-revive-1 in extra time / late 2H at 0-2, and stale live noise tries to revert eng-finished-1
    dailyBoardCache.patchLiveMatchesInBoard(dateKey, [
        {
            id: 'tur-revive-1',
            league_slug: 'tur.1',
            home: { name: 'Istanbul Basaksehir', score: 0 },
            away: { name: 'Çorum FK', score: 2 },
            status: { state: 'in', isLive: true, completed: false, clock: "88'", detail: "88'" }
        },
        {
            id: 'eng-finished-1',
            league_slug: 'eng.1',
            home: { name: 'Arsenal', score: 2 },
            away: { name: 'Chelsea', score: 1 },
            status: { state: 'in', isLive: true, completed: false, clock: "89'", detail: "89'" }
        }
    ], { isFullSnapshot: false });

    board = dailyBoardCache.getReadyBoard(dateKey);
    const revived = board.matches.find(m => m.id === 'tur-revive-1');
    const protectedFin = board.matches.find(m => m.id === 'eng-finished-1');

    assert.equal(revived.status.state, 'in', 'Auto-finalized match must revive when live feed resumes');
    assert.equal(revived.home.score, 0);
    assert.equal(revived.away.score, 2);
    assert.equal(revived.status.clock, "88'");

    assert.equal(protectedFin.status.state, 'post', 'Old upstream-finished match must remain FT');
    assert.equal(protectedFin.status.completed, true);
});

test('dailyBoardCache revives a DB-loaded premature FT 0-0 match inside the impossible-FT window (<102m) when live feed reports active clock', () => {
    dailyBoardCache.clearBoardCache();
    const dateKey = '20261123';
    const kickoffIso = new Date(Date.now() - 80 * 60 * 1000).toISOString();

    // Loaded from DB with no _autoFinalized flag and 0-0 score
    dailyBoardCache.setReadyBoard(dateKey, [
        {
            id: 'tur-db-premature-ft',
            league_slug: 'tur.1',
            league: { slug: 'tur.1', name: 'Turkish Süper Lig', country: 'Turkey' },
            date: kickoffIso,
            scoreboard_date: dateKey,
            home: { name: 'Istanbul Basaksehir', score: 0 },
            away: { name: 'Çorum FK', score: 0 },
            status: { state: 'post', isLive: false, completed: true, clock: 'FT', detail: 'FT' }
        }
    ]);

    dailyBoardCache.patchLiveMatchesInBoard(dateKey, [
        {
            id: 'tur-db-premature-ft',
            league_slug: 'tur.1',
            home: { name: 'Istanbul Basaksehir', score: 0 },
            away: { name: 'Çorum FK', score: 0 },
            status: { state: 'in', isLive: true, completed: false, clock: "65'", detail: "65'" }
        }
    ], { isFullSnapshot: false });

    const board = dailyBoardCache.getReadyBoard(dateKey);
    assert.equal(board.matches[0].status.state, 'in', 'Premature FT 0-0 at 80m elapsed must revive when live feed reports 65\'');
    assert.equal(board.matches[0].status.clock, "65'");
});

test('sportScoreService.statisticsToBoxscore does not let totalShots shadow shotsInsideBox/shotsOutsideBox or xGOT shadow xG', () => {
    const box = sportScoreService.statisticsToBoxscore({
        home: 'Team A',
        away: 'Team B',
        statistics: [
            { name: 'Expected goals on target (xGOT)', home: '1.10', away: '2.40' },
            { name: 'Expected goals', home: '0.85', away: '2.15' },
            { name: 'Shots inside box', home: 4, away: 8 },
            { name: 'Shots outside box', home: 2, away: 4 },
            { name: 'Total shots', home: 6, away: 12 }
        ]
    });
    const hMap = footballApi.extractBoxscoreStatsMap(box, 'home');
    const aMap = footballApi.extractBoxscoreStatsMap(box, 'away');
    assert.equal(hMap.shotsInsideBox, 4);
    assert.equal(hMap.shotsOutsideBox, 2);
    assert.equal(hMap.totalShots, 6);
    assert.equal(aMap.shotsInsideBox, 8);
    assert.equal(aMap.totalShots, 12);
    assert.equal(hMap.expectedGoals, 0.85);
    assert.equal(hMap.expectedGoalsOnTarget, 1.1);
});

test('recomputeAnalyticsFromFormattedRecent computes PPG, goal averages, BTTS/Over rates, and streak from ESPN lastFiveGames', () => {
    const analytics = footballApi.recomputeAnalyticsFromFormattedRecent([
        { id: '1', venue: 'Home', atVs: 'vs', score: '2-1', result: 'W' },
        { id: '2', venue: 'Away', atVs: '@', score: '0-3', result: 'W' }, // ESPN away score formatted home-away
        { id: '3', venue: 'Home', atVs: 'vs', score: '1-1', result: 'D' },
        { id: '4', venue: 'Away', atVs: '@', score: '2-0', result: 'L' },
        { id: '5', venue: 'Home', atVs: 'vs', score: '1-0', result: 'W' }
    ]);
    assert.equal(analytics.matchesAnalyzed, 5);
    assert.equal(analytics.wins, 3);
    assert.equal(analytics.draws, 1);
    assert.equal(analytics.losses, 1);
    assert.equal(analytics.pointsPerGame, 2.0);
    assert.equal(analytics.winRate, 60);
    assert.equal(analytics.goalsScoredAvg, 1.4); // (2+3+1+0+1)/5 = 1.4
    assert.equal(analytics.goalsConcededAvg, 0.8); // (1+0+1+2+0)/5 = 0.8
    assert.equal(analytics.bttsRate, 40); // 2-1, 1-1 -> 2/5
    assert.equal(analytics.over25Rate, 40); // 2-1, 0-3 -> 2/5
    assert.equal(analytics.cleanSheetRate, 40); // 3-0, 1-0 -> 2/5
    assert.equal(analytics.recentStreak, 'W2');
});

test('sportScoreService.statisticsToBoxscore normalizes grouped & flat telemetry and returns null when empty', () => {
    assert.equal(sportScoreService.statisticsToBoxscore({ home: 'A', away: 'B' }), null);

    const box = sportScoreService.statisticsToBoxscore({
        home: 'Istanbul Basaksehir',
        away: 'Çorum FK',
        home_logo: 'https://img.example/h.png',
        away_logo: 'https://img.example/a.png',
        statistics: [
            {
                group: 'Attack',
                items: [
                    { name: 'Ball possession', home: '58%', away: '42%' },
                    { name: 'Expected goals', home: '0.84', away: '2.15' },
                    { name: 'Shots on target', home: 2, away: 6 },
                    { name: 'Big chances', home: 1, away: 4 },
                    { name: 'Dangerous attacks', home: 34, away: 51 }
                ]
            }
        ]
    });

    assert.ok(box && box.teams.length === 2);
    const hMap = footballApi.extractBoxscoreStatsMap(box, 'home');
    const aMap = footballApi.extractBoxscoreStatsMap(box, 'away');
    assert.equal(hMap.possessionPct, 58);
    assert.equal(aMap.expectedGoals, 2.15);
    assert.equal(aMap.shotsOnTarget, 6);
    assert.equal(aMap.bigChances, 4);
    assert.equal(aMap.dangerousAttacks, 51);
});

test('computeAttackingPressureIndex returns null for empty stats and ranks dominant telemetry higher', () => {
    assert.equal(footballApi.computeAttackingPressureIndex({}), null);
    assert.equal(footballApi.computeAttackingPressureIndex(null), null);

    const weakPressure = footballApi.computeAttackingPressureIndex({
        possessionPct: 40, totalShots: 4, shotsOnTarget: 1, wonCorners: 2, expectedGoals: 0.3
    });
    const strongPressure = footballApi.computeAttackingPressureIndex({
        possessionPct: 60, totalShots: 16, shotsOnTarget: 7, wonCorners: 8, expectedGoals: 2.3, bigChances: 3
    });

    assert.ok(weakPressure > 0 && strongPressure > weakPressure, `Expected strong (${strongPressure}) > weak (${weakPressure})`);
});

test('computeEnrichedPredictionModel adjusts live 0-2 late match away from 1X and flags sparse cold-start data', () => {
    // Live scenario: Home team losing 0-2 at 82' -> must NOT recommend 1X!
    const liveRes = footballApi.computeEnrichedPredictionModel({
        homeAnalytics: { matchesAnalyzed: 5, pointsPerGame: 1.8, winRate: 60, goalsScoredAvg: 1.6, goalsConcededAvg: 1.0, bttsRate: 60 },
        awayAnalytics: { matchesAnalyzed: 5, pointsPerGame: 1.4, winRate: 40, goalsScoredAvg: 1.4, goalsConcededAvg: 1.2, bttsRate: 60 },
        homeStanding: { rank: 6, points: 24 },
        awayStanding: { rank: 12, points: 17 },
        h2h: { totalMeetings: 4, homeWins: 2, awayWins: 1, draws: 1, averageGoalsPerMatch: 2.5, bttsPercentage: 50 },
        matchStatus: { state: 'in', isLive: true, clock: "82'" },
        liveScore: { home: 0, away: 2 },
        liveStats: {
            home: { possessionPct: 52, totalShots: 6, shotsOnTarget: 1, wonCorners: 3, expectedGoals: 0.45 },
            away: { possessionPct: 48, totalShots: 12, shotsOnTarget: 6, wonCorners: 6, expectedGoals: 2.2 }
        },
        homeName: 'Istanbul Basaksehir',
        awayName: 'Çorum FK',
        providersUsed: ['livescore', 'sportscore']
    });

    assert.equal(liveRes.norraAiPredictionHints.isLiveAdjusted, true);
    assert.ok(liveRes.norraAiPredictionHints.awayWinProb > 80, `Expected awayWinProb > 80%, got ${liveRes.norraAiPredictionHints.awayWinProb}`);
    assert.ok(liveRes.norraAiPredictionHints.doubleChance['1X'] < 20, `Expected 1X < 20% when losing 0-2 at 82', got ${liveRes.norraAiPredictionHints.doubleChance['1X']}`);
    assert.ok(liveRes.norraAiPredictionHints.doubleChance['X2'] > 85);
    assert.equal(liveRes.norraAiPredictionHints.bttsRecommendation, 'No', 'Must not predict BTTS Yes at 82\' when home has 0 goals');
    assert.ok(liveRes.norraAiPredictionHints.bttsProbability < 25, `Expected live BTTS < 25% at 82' (0-2), got ${liveRes.norraAiPredictionHints.bttsProbability}`);
    assert.ok(liveRes.norraAiPredictionHints.over25Probability < 35, `Expected live Over 2.5 < 35% at 82' (0-2), got ${liveRes.norraAiPredictionHints.over25Probability}`);
    assert.equal(liveRes.telemetryQuality.tier, 'rich');
    assert.ok(liveRes.telemetryQuality.score >= 75);

    // Cold-start sparse pre-match scenario -> must report limited data & Low Data confidence
    const sparseRes = footballApi.computeEnrichedPredictionModel({
        homeAnalytics: { matchesAnalyzed: 0, winRate: 0, goalsScoredAvg: 0, goalsConcededAvg: 0 },
        awayAnalytics: { matchesAnalyzed: 0, winRate: 0, goalsScoredAvg: 0, goalsConcededAvg: 0 },
        matchStatus: { state: 'pre', isLive: false },
        homeName: 'Club A',
        awayName: 'Club B'
    });
    assert.equal(sparseRes.telemetryQuality.tier, 'limited');
    assert.equal(sparseRes.norraAiPredictionHints.confidenceRating, 'Low Data');
});

test('Frontend app.js, app-v9.js, and android/assets/app.js are synchronized with enriched telemetry labels & display', () => {
    const appJs = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
    const appV9 = fs.readFileSync(path.join(__dirname, '../public/app-v9.js'), 'utf8');
    const androidApp = fs.readFileSync(path.join(__dirname, '../android/assets/app.js'), 'utf8');

    assert.equal(appJs, appV9, 'public/app-v9.js must mirror public/app.js');
    assert.equal(appJs, androidApp, 'android/assets/app.js must mirror public/app.js');
    assert.match(appJs, /expectedGoals:\s*'Expected Goals \(xG\)'/);
    assert.match(appJs, /dangerousAttacks:\s*'Dangerous Attacks'/);
    assert.match(appJs, /Deep Telemetry Feed \(Norra AI Signals\)/);
    assert.match(appJs, /LIVE-ADJUSTED/);
});
