'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');

const dailyBoardCache = require('../services/dailyBoardCache');
const {
    liveStreamHub,
    parseLiveScoreEsd,
    recordRecentFinishedMatch,
    recentFinishedMatches
} = require('../controllers/footballApiController');

const ROOT = path.join(__dirname, '..');

test.after(async () => {
    try {
        await mongoose.disconnect();
    } catch (_) {}
});

test('parseLiveScoreEsd parses 14-digit and 12-digit LiveScore timestamps as UTC dates instead of epoch ms (Year 8390 bug)', () => {
    const d14 = parseLiveScoreEsd(20261126140000);
    assert.equal(d14.toISOString(), '2026-11-26T14:00:00.000Z');

    const d12 = parseLiveScoreEsd('202611261945');
    assert.equal(d12.toISOString(), '2026-11-26T19:45:00.000Z');

    const dIso = parseLiveScoreEsd('2026-11-26T20:00:00.000Z');
    assert.equal(dIso.toISOString(), '2026-11-26T20:00:00.000Z');
});

test('dailyBoardCache heals auto-finalized 1st-half FT scores via authoritative patchMatchesInBoards without user click', () => {
    dailyBoardCache.clearBoardCache();
    const dateKey = dailyBoardCache.getWatDateKey();
    const oldKickoff = new Date(Date.now() - 165 * 60 * 1000).toISOString();

    dailyBoardCache.setReadyBoard(dateKey, [
        {
            id: 'ls_ft_heal_1',
            league: { slug: 'eng.1', name: 'Premier League' },
            league_slug: 'eng.1',
            date: oldKickoff,
            status: { state: 'in', clock: 'HT', detail: 'HT', isLive: true, completed: false },
            home: { name: 'Arsenal', score: 1 },
            away: { name: 'Chelsea', score: 0 },
            source: { event_id: 'ls_ft_heal_1', livescore_id: 'ls_ft_heal_1' }
        },
        {
            id: 'ls_ft_heal_2',
            league: { slug: 'esp.1', name: 'La Liga' },
            league_slug: 'esp.1',
            date: oldKickoff,
            status: { state: 'in', clock: 'HT', detail: 'HT', isLive: true, completed: false },
            home: { name: 'Sevilla', score: 1 },
            away: { name: 'Valencia', score: 0 },
            source: { event_id: 'ls_ft_heal_2', livescore_id: 'ls_ft_heal_2' }
        }
    ]);

    // Stale board auto-finalizes at >155m with 1st-half score (1-0)
    const before = dailyBoardCache.getReadyBoard(dateKey, { status: 'all' });
    assert.equal(before.matches[0].status.clock, 'FT');
    assert.equal(before.matches[0]._autoFinalized, true);
    assert.equal(before.matches[0].home.score, 1);
    assert.equal(before.matches[0].away.score, 0);

    // Background sync / upstream feed delivers authoritative FT scores (2-1 and 0-1)
    const patched = dailyBoardCache.patchMatchesInBoards([
        {
            id: 'ls_ft_heal_1',
            status: { state: 'post', clock: 'FT', detail: 'FT', completed: true, isLive: false },
            home: { name: 'Arsenal', score: 2 },
            away: { name: 'Chelsea', score: 1 },
            source: { event_id: 'ls_ft_heal_1', livescore_id: 'ls_ft_heal_1' }
        },
        {
            id: 'ls_ft_heal_2',
            status: { state: 'post', clock: 'FT', detail: 'FT', completed: true, isLive: false },
            home: { name: 'Sevilla', score: 0 },
            away: { name: 'Valencia', score: 1 },
            source: { event_id: 'ls_ft_heal_2', livescore_id: 'ls_ft_heal_2' }
        }
    ], { authoritative: true });

    assert.equal(patched, 2);
    const m1 = dailyBoardCache.findMatchInBoards('ls_ft_heal_1');
    const m2 = dailyBoardCache.findMatchInBoards('ls_ft_heal_2');
    assert.equal(m1.home.score, 2);
    assert.equal(m1.away.score, 1);
    assert.equal(m1.home.winner, true);
    assert.equal(m1._autoFinalized, false);

    assert.equal(m2.home.score, 0);
    assert.equal(m2.away.score, 1);
    assert.equal(m2.away.winner, true);
    assert.equal(m2._autoFinalized, false);
});

test('dailyBoardCache.patchLiveMatchesInBoard prevents lagging 1st-half snapshot from regressing newer 2nd-half live score', () => {
    dailyBoardCache.clearBoardCache();
    const dateKey = dailyBoardCache.getWatDateKey();
    const kickoff = new Date(Date.now() - 80 * 60 * 1000).toISOString();

    dailyBoardCache.setReadyBoard(dateKey, [
        {
            id: 'live_noregress_1',
            league: { slug: 'ita.1', name: 'Serie A' },
            league_slug: 'ita.1',
            date: kickoff,
            status: { state: 'in', clock: "78'", detail: "78'", isLive: true, completed: false },
            home: { name: 'Inter', score: 2 },
            away: { name: 'Milan', score: 1 },
            source: { event_id: 'live_noregress_1' }
        }
    ]);

    // Stale DB/provider reports 45' 1-0
    dailyBoardCache.patchLiveMatchesInBoard(dateKey, [
        {
            id: 'live_noregress_1',
            league: { slug: 'ita.1', name: 'Serie A' },
            date: kickoff,
            status: { state: 'in', clock: "45'", detail: "45'", isLive: true, completed: false },
            home: { name: 'Inter', score: 1 },
            away: { name: 'Milan', score: 0 },
            source: { event_id: 'live_noregress_1' }
        }
    ]);

    const m = dailyBoardCache.findMatchInBoards('live_noregress_1');
    assert.equal(m.home.score, 2);
    assert.equal(m.away.score, 1);
    assert.equal(m.status.clock, "78'");
});

test('liveStreamHub never emits bogus 1st-half/HT matchFinished on temporary dropout, and uses authoritative FT score when finished', () => {
    liveStreamHub.previousStateMap.clear();
    recentFinishedMatches.clear();
    dailyBoardCache.clearBoardCache();

    const htMatch = {
        id: 'sse_ht_guard_1',
        league_slug: 'eng.1',
        date: new Date(Date.now() - 50 * 60 * 1000).toISOString(),
        home: { displayName: 'Liverpool', score: 1, logo: '' },
        away: { displayName: 'Everton', score: 0, logo: '' },
        status: { clock: 'HT', detail: 'HT', state: 'in' }
    };

    liveStreamHub.seedMatches([htMatch]);

    // Match briefly disappears from live feed at HT -> MUST NOT emit FT 1-0!
    const htDropDeltas = liveStreamHub.computeDeltas([]);
    assert.equal(htDropDeltas.length, 0, 'Must not emit premature matchFinished at HT');
    assert.equal(liveStreamHub.previousStateMap.has('sse_ht_guard_1'), true);

    // Match returns in 2nd half with goal (2-0 at 65')
    const secondHalfDeltas = liveStreamHub.computeDeltas([
        {
            ...htMatch,
            home: { ...htMatch.home, score: 2 },
            status: { clock: "65'", detail: "65'", state: 'in' }
        }
    ]);
    assert.equal(secondHalfDeltas.length, 1);
    assert.equal(secondHalfDeltas[0].isGoal, true);
    assert.equal(secondHalfDeltas[0].homeScore, 2);

    // Now authoritative FT arrives (2-1) before/as match leaves live feed
    recordRecentFinishedMatch({
        id: 'sse_ht_guard_1',
        home: { score: 2 },
        away: { score: 1 },
        status: { clock: 'FT', detail: 'FT', state: 'post', completed: true }
    });

    const ftDeltas = liveStreamHub.computeDeltas([]);
    assert.equal(ftDeltas.length, 1);
    assert.equal(ftDeltas[0].matchFinished, true);
    assert.equal(ftDeltas[0].homeScore, 2);
    assert.equal(ftDeltas[0].awayScore, 1);
    assert.equal(ftDeltas[0].clock, 'FT');
    assert.equal(liveStreamHub.previousStateMap.has('sse_ht_guard_1'), false);
});

test('soccerSyncService patches dailyBoardCache in background loops, enforces 160m DB cutoff, and frontend assets are mirrored', () => {
    const syncSrc = fs.readFileSync(path.join(ROOT, 'services', 'soccerSyncService.js'), 'utf8');
    assert.ok(syncSrc.includes("require('./dailyBoardCache')"), 'soccerSyncService must import dailyBoardCache');
    assert.ok(syncSrc.includes('dailyBoardCache.patchMatchesInBoards(boardPatchUpdates'), 'syncLiveScoreInPlay must patch dailyBoardCache');
    assert.ok(syncSrc.includes('dailyBoardCache.patchMatchesInBoards(sbBoardPatchUpdates'), 'syncLiveScoreboards must patch dailyBoardCache');
    assert.ok(syncSrc.includes('Date.now() - 160 * 60 * 1000'), 'syncLiveScoreInPlay DB auto-finalize must use 160m cutoff');
    assert.ok(!syncSrc.includes('Date.now() - 135 * 60 * 1000'), 'syncLiveScoreInPlay must not auto-finalize DB matches at 135m');

    const appJs = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
    const appV9 = fs.readFileSync(path.join(ROOT, 'public', 'app-v9.js'), 'utf8');
    const androidApp = fs.readFileSync(path.join(ROOT, 'android', 'assets', 'app.js'), 'utf8');
    assert.equal(appJs, appV9, 'public/app-v9.js must mirror public/app.js');
    assert.equal(appJs, androidApp, 'android/assets/app.js must mirror public/app.js');
    assert.ok(appJs.includes('scheduleFinishedBoardRefresh'), 'public/app.js must trigger board reconciliation on SSE matchFinished');
    assert.ok(appJs.includes('fs-status-ft'), 'public/app.js must transition finished rows to .fs-status-ft');
    assert.ok(appJs.includes('scheduleFinishedBoardRefresh(retryCount + 1)'), 'scheduleFinishedBoardRefresh must retry if user is interacting');

    // Verify liveData stages come before dateData stages so live feed is not shadowed by stale CDN dateData
    const livePushIdx = syncSrc.indexOf('if (liveData && Array.isArray(liveData.Stages)) stages.push');
    const datePushIdx = syncSrc.indexOf('if (dateData && Array.isArray(dateData.Stages)) stages.push');
    assert.ok(livePushIdx > 0 && datePushIdx > livePushIdx, 'getCachedOrFetchLiveScoreStages must push liveData.Stages before dateData.Stages');

    // Verify /fixtures dedup handles completed-vs-completed score upgrades and live non-regression
    const apiSrc = fs.readFileSync(path.join(ROOT, 'controllers', 'footballApiController.js'), 'utf8');
    assert.ok(apiSrc.includes('else if (secIsCompleted && winIsCompleted)'), '/fixtures dedup must upgrade winner score when both duplicates are completed');
    assert.ok(apiSrc.includes('ev.Epr === 2'), 'footballApiController must classify LiveScore Epr === 2 as FT');
    assert.ok(syncSrc.includes('ev.Epr === 2'), 'soccerSyncService must classify LiveScore Epr === 2 as FT');
});

test('dailyBoardCache treats HT as minute 45.5 so HT 2-0 resists 38m 1-0 regression and 45m advances to HT', () => {
    dailyBoardCache.clearBoardCache();
    const dateKey = dailyBoardCache.getWatDateKey();
    const kickoff = new Date(Date.now() - 55 * 60 * 1000).toISOString();

    dailyBoardCache.setReadyBoard(dateKey, [
        {
            id: 'ht_guard_1',
            league: { slug: 'eng.1', name: 'Premier League' },
            league_slug: 'eng.1',
            date: kickoff,
            status: { state: 'in', clock: 'HT', detail: 'HT', isLive: true, completed: false },
            home: { name: 'Man City', score: 2 },
            away: { name: 'Tottenham', score: 0 },
            source: { event_id: 'ht_guard_1' }
        },
        {
            id: 'ht_advance_2',
            league: { slug: 'eng.1', name: 'Premier League' },
            league_slug: 'eng.1',
            date: kickoff,
            status: { state: 'in', clock: "45'", detail: "45'", isLive: true, completed: false },
            home: { name: 'Newcastle', score: 1 },
            away: { name: 'Aston Villa', score: 1 },
            source: { event_id: 'ht_advance_2' }
        }
    ]);

    // Stale 38' 1-0 live snapshot must NOT regress HT 2-0
    dailyBoardCache.patchLiveMatchesInBoard(dateKey, [
        {
            id: 'ht_guard_1',
            league: { slug: 'eng.1', name: 'Premier League' },
            date: kickoff,
            status: { state: 'in', clock: "38'", detail: "38'", isLive: true, completed: false },
            home: { name: 'Man City', score: 1 },
            away: { name: 'Tottenham', score: 0 },
            source: { event_id: 'ht_guard_1' }
        }
    ]);
    const m1 = dailyBoardCache.findMatchInBoards('ht_guard_1');
    assert.equal(m1.home.score, 2);
    assert.equal(m1.away.score, 0);
    assert.equal(m1.status.clock, 'HT');

    // patchMatchInBoards must advance 45' -> HT and refuse to regress HT -> 40'
    const advanced = dailyBoardCache.patchMatchInBoards({
        id: 'ht_advance_2',
        status: { state: 'in', clock: 'HT', detail: 'HT', isLive: true, completed: false },
        home: { name: 'Newcastle', score: 1 },
        away: { name: 'Aston Villa', score: 1 },
        source: { event_id: 'ht_advance_2' }
    });
    assert.equal(advanced, true);
    assert.equal(dailyBoardCache.findMatchInBoards('ht_advance_2').status.clock, 'HT');

    const regressed = dailyBoardCache.patchMatchInBoards({
        id: 'ht_advance_2',
        status: { state: 'in', clock: "40'", detail: "40'", isLive: true, completed: false },
        home: { name: 'Newcastle', score: 1 },
        away: { name: 'Aston Villa', score: 1 },
        source: { event_id: 'ht_advance_2' }
    });
    assert.equal(regressed, false);
    assert.equal(dailyBoardCache.findMatchInBoards('ht_advance_2').status.clock, 'HT');
});

test('dailyBoardCache.patchMatchInBoards revives prematurely finalized FT match back to live and patches cross-midnight yesterday board', () => {
    dailyBoardCache.clearBoardCache();
    const todayKey = dailyBoardCache.getWatDateKey();
    const yesterdayKey = dailyBoardCache.getWatDateKey(Date.now() - 24 * 60 * 60 * 1000);
    const kickoff60mAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    dailyBoardCache.setReadyBoard(yesterdayKey, [
        {
            id: 'midnight_match_1',
            league: { slug: 'bra.1', name: 'Brasileirao' },
            league_slug: 'bra.1',
            date: kickoff60mAgo,
            status: { state: 'post', clock: 'FT', detail: 'FT', isLive: false, completed: true },
            home: { name: 'Flamengo', score: 1, winner: true },
            away: { name: 'Palmeiras', score: 0, winner: false },
            source: { event_id: 'midnight_match_1' }
        }
    ]);
    dailyBoardCache.setReadyBoard(todayKey, []);

    // Background sync reports the match is still LIVE at 65' with score 2-0 (inside <102m impossible-FT window)
    const revived = dailyBoardCache.patchMatchesInBoards([
        {
            id: 'midnight_match_1',
            status: { state: 'in', clock: "65'", detail: "65'", isLive: true, completed: false },
            home: { name: 'Flamengo', score: 2 },
            away: { name: 'Palmeiras', score: 0 },
            source: { event_id: 'midnight_match_1' }
        }
    ], { authoritative: true });

    assert.equal(revived, 1);
    const liveM = dailyBoardCache.findMatchInBoards('midnight_match_1');
    assert.equal(liveM.status.state, 'in');
    assert.equal(liveM.status.isLive, true);
    assert.equal(liveM.status.completed, false);
    assert.equal(liveM.status.clock, "65'");
    assert.equal(liveM.home.score, 2);
    assert.equal(liveM.away.score, 0);

    // Then authoritative FT arrives (2-1) and patches yesterday's board cleanly
    const finalized = dailyBoardCache.patchMatchesInBoards([
        {
            id: 'midnight_match_1',
            status: { state: 'post', clock: 'FT', detail: 'FT', isLive: false, completed: true },
            home: { name: 'Flamengo', score: 2 },
            away: { name: 'Palmeiras', score: 1 },
            source: { event_id: 'midnight_match_1' }
        }
    ], { authoritative: true });

    assert.equal(finalized, 1);
    const ftM = dailyBoardCache.findMatchInBoards('midnight_match_1');
    assert.equal(ftM.status.state, 'post');
    assert.equal(ftM.status.completed, true);
    assert.equal(ftM.status.clock, 'FT');
    assert.equal(ftM.home.score, 2);
    assert.equal(ftM.away.score, 1);
    assert.equal(ftM.home.winner, true);
});
