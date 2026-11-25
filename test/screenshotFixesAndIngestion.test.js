'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const express = require('express');
const mongoose = require('mongoose');

const {
    resolveLeagueSlug,
    demoteToJuniorOrLowerTier,
    isSeniorTopLeagueSlug,
    normalizeTeamName,
    areTeamNamesMatching
} = require('../services/soccerSyncService');
const emailService = require('../services/emailService');
const SiteSetting = require('../models/siteSetting');
const SoccerMatch = require('../models/soccerMatch');
const dailyBoardCache = require('../services/dailyBoardCache');
const { config } = require('../config/env');
const { generateToken } = require('../middleware/auth');
const adminRouter = require('../controllers/adminController');
const footballApiRouter = require('../controllers/footballApiController');

const ROOT = path.join(__dirname, '..');

function startTempServer(registerFn) {
    const app = express();
    app.use(express.json());
    registerFn(app);
    return new Promise((resolve) => {
        const server = http.createServer(app);
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
        });
    });
}

test.after(async () => {
    try {
        await mongoose.disconnect();
    } catch (_) {}
});

test('UEFA Youth League (U19) never leaks into senior UEFA Champions League (uefa.champions)', () => {
    assert.equal(isSeniorTopLeagueSlug('uefa.champions'), true);
    assert.equal(isSeniorTopLeagueSlug('uefa.europa'), true);
    assert.equal(isSeniorTopLeagueSlug('uefa.youth'), false);
    assert.equal(isSeniorTopLeagueSlug('uefa.w.champions'), false);

    // Even when upstream UID is explicitly uefa.champions, youth/U19 text must classify to uefa.youth
    assert.equal(resolveLeagueSlug('Como U19 vs AEK Athens U19', 'Europe', 'uefa.champions'), 'uefa.youth');
    assert.equal(resolveLeagueSlug('UEFA Youth League', 'Europe', 'uefa.champions'), 'uefa.youth');
    assert.equal(resolveLeagueSlug('Galatasaray vs Aston Villa', 'Europe', 'uefa.champions'), 'uefa.champions');

    // Demotion helper moves U19 matches out of senior UCL without touching senior clubs
    assert.equal(
        demoteToJuniorOrLowerTier('uefa.champions', 'Como U19', 'AEK Athens U19', 'UEFA Champions League'),
        'uefa.youth'
    );
    assert.equal(
        demoteToJuniorOrLowerTier('uefa.champions', 'Slovan Bratislava U19', 'Real Betis U19', 'UEFA Champions League'),
        'uefa.youth'
    );
    assert.equal(
        demoteToJuniorOrLowerTier('uefa.champions', 'Bodo/Glimt', 'LASK Linz', 'UEFA Champions League'),
        'uefa.champions'
    );
    assert.equal(
        demoteToJuniorOrLowerTier('uefa.champions', 'Galatasaray', 'Aston Villa', 'UEFA Champions League'),
        'uefa.champions'
    );

    // Frontend mirror parity check + teamNamesFuzzyEqual behavioral guardrail
    const appJs = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
    const appV9 = fs.readFileSync(path.join(ROOT, 'public', 'app-v9.js'), 'utf8');
    const androidAppJs = fs.readFileSync(path.join(ROOT, 'android', 'assets', 'app.js'), 'utf8');
    assert.equal(appJs, appV9, 'public/app-v9.js must stay mirrored with public/app.js');
    assert.equal(appJs, androidAppJs, 'android/assets/app.js must stay mirrored with public/app.js');
    assert.match(appJs, /slug\.startsWith\('uefa\.'\) && isYouth/);
});

test('Frontend teamNamesFuzzyEqual prevents Western United vs West Ham United false collision', () => {
    const appJs = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
    const fnMatch = appJs.match(/function teamNamesFuzzyEqual\(a, b\) \{[\s\S]*?\n    \}/);
    assert.ok(fnMatch, 'teamNamesFuzzyEqual must exist in public/app.js');
    const teamNamesFuzzyEqual = new Function('a', 'b', fnMatch[0].replace(/^function teamNamesFuzzyEqual\(a, b\) \{/, '').replace(/\}$/, ''));

    assert.equal(teamNamesFuzzyEqual('suwonbluewings', 'suwonsamsungbluewings'), true);
    assert.equal(teamNamesFuzzyEqual('westernunited', 'westhamunited'), false);
    assert.equal(teamNamesFuzzyEqual('southendunited', 'southamptonunited'), false);
});

test('AFC Champions League duplicate team naming (Daejeon Citizen vs Daejeon Hana Citizen FC) deduplicates cleanly', () => {
    assert.equal(
        normalizeTeamName('Daejeon Citizen'),
        normalizeTeamName('Daejeon Hana Citizen FC')
    );
    assert.equal(
        areTeamNamesMatching('Daejeon Citizen', 'Daejeon Hana Citizen FC', 'afc.champions', 'afc.champions'),
        true
    );
    assert.equal(
        areTeamNamesMatching('Jeonbuk Motors', 'Jeonbuk Hyundai Motors FC', 'afc.champions', 'afc.champions'),
        true
    );
    // Generic middle-word sponsor insertion via token-subset matching
    assert.equal(
        areTeamNamesMatching('Suwon Bluewings', 'Suwon Samsung Bluewings FC', 'kor.1', 'kor.1'),
        true
    );
    // Guardrails: rivals, women, and youth must NEVER collide
    assert.equal(areTeamNamesMatching('Manchester United', 'Manchester City', 'eng.1', 'eng.1'), false);
    assert.equal(areTeamNamesMatching('Bristol City', 'Bristol Rovers', 'eng.2', 'eng.2'), false);
    assert.equal(areTeamNamesMatching('Real Betis', 'Real Betis U19', 'esp.1', 'esp.1'), false);
    assert.equal(areTeamNamesMatching('Arsenal', 'Arsenal Women', 'eng.1', 'eng.1'), false);
});

test('SMTP service exposes sendEmail and POST /api/admin/test-smtp never sends to placeholder admin@mynorra.xyz', async () => {
    assert.equal(typeof emailService.sendEmail, 'function', 'emailService.sendEmail must exist for password resets');
    const badRes = await emailService.sendEmail({ to: '', subject: 'Test', text: 'hi' });
    assert.equal(badRes.success, false);

    const origGetSettings = SiteSetting.getGlobalSettings;
    const origGetTransporter = emailService.getTransporter;
    const origSmtpUser = config.SMTP_USER;
    const origAdminEmail = config.ADMIN_EMAIL;
    const sentPayloads = [];

    const { server, baseUrl } = await startTempServer(adminRouter);
    try {
        const adminToken = generateToken({ id: 'admin_test', role: 'admin', email: 'admin@mynorra.xyz' });

        // Case 1: DB smtp user & admin email are placeholders -> must fall through to real config.SMTP_USER
        SiteSetting.getGlobalSettings = async () => ({ smtpSettings: { user: 'admin@mynorra.xyz' } });
        emailService.getTransporter = async () => ({
            transporter: {
                verify: async () => true,
                sendMail: async (payload) => { sentPayloads.push(payload); return { messageId: 'msg-1' }; }
            },
            from: 'Norra AI <support@mynorra.xyz>',
            user: 'support@mynorra.xyz',
            isMock: false
        });
        config.SMTP_USER = 'plugboxnet@gmail.com';
        config.ADMIN_EMAIL = 'admin@mynorra.xyz';

        const r1 = await fetch(`${baseUrl}/api/admin/test-smtp`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        const j1 = await r1.json();
        assert.equal(r1.status, 200);
        assert.equal(j1.to, 'plugboxnet@gmail.com');
        assert.equal(sentPayloads.length, 1);
        assert.equal(sentPayloads[0].to, 'plugboxnet@gmail.com');

        // Case 2: Every candidate is an unroutable placeholder -> must reject with 400 and never sendMail
        config.SMTP_USER = '';
        const r2 = await fetch(`${baseUrl}/api/admin/test-smtp`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        assert.equal(r2.status, 400);
        assert.equal(sentPayloads.length, 1);
    } finally {
        SiteSetting.getGlobalSettings = origGetSettings;
        emailService.getTransporter = origGetTransporter;
        config.SMTP_USER = origSmtpUser;
        config.ADMIN_EMAIL = origAdminEmail;
        await new Promise((r) => server.close(r));
    }
});

test('NorraAI training-data endpoint preserves odds projection, league filtering, and serialized dailyBoardCache fallback', async () => {
    const apiCtrl = fs.readFileSync(path.join(ROOT, 'controllers', 'footballApiController.js'), 'utf8');
    assert.match(apiCtrl, /TRAINING_DATA_PROJECTION[^\n]*\bodds\b/);
    assert.match(apiCtrl, /richStatsCriteria/);
    assert.match(apiCtrl, /maxTimeMS\(15000\)/);
    assert.match(apiCtrl, /dailyFixtureCount/);

    const origFind = SoccerMatch.find;
    const dateKey = dailyBoardCache.getWatDateKey();
    dailyBoardCache.setReadyBoard(dateKey, [
        {
            id: 'epl_fin_1',
            league: { slug: 'eng.1', name: 'Premier League' },
            date: new Date().toISOString(),
            scoreboardDate: dateKey,
            home: { id: 'h1', name: 'Arsenal', score: 2, stats: { possessionPct: 60, totalShots: 14, shotsOnTarget: 6 } },
            away: { id: 'a1', name: 'Chelsea', score: 1, stats: { possessionPct: 40, totalShots: 8, shotsOnTarget: 3 } },
            status: { state: 'post', detail: 'FT', completed: true, isLive: false }
        },
        {
            id: 'esp_fin_1',
            league: { slug: 'esp.1', name: 'LaLiga' },
            date: new Date().toISOString(),
            scoreboardDate: dateKey,
            home: { id: 'h2', name: 'Real Madrid', score: 3 },
            away: { id: 'a2', name: 'Sevilla', score: 0 },
            status: { state: 'post', detail: 'FT', completed: true, isLive: false }
        },
        {
            id: 'epl_postp_1',
            league: { slug: 'eng.1', name: 'Premier League' },
            date: new Date().toISOString(),
            scoreboardDate: dateKey,
            home: { id: 'h3', name: 'Liverpool', score: 0 },
            away: { id: 'a3', name: 'Everton', score: 0 },
            status: { state: 'post', detail: 'Postponed', completed: true, isLive: false }
        },
        {
            id: 'epl_live_1',
            league: { slug: 'eng.1', name: 'Premier League' },
            date: new Date().toISOString(),
            scoreboardDate: dateKey,
            home: { id: 'h4', name: 'Man City', score: 1 },
            away: { id: 'a4', name: 'Tottenham', score: 1 },
            status: { state: 'in', detail: "55'", completed: false, isLive: true }
        }
    ]);

    const { server, baseUrl } = await startTempServer(footballApiRouter);
    try {
        // Force DB query to return empty so state-aware dailyBoardCache fallback runs
        SoccerMatch.find = () => ({
            select() { return this; },
            sort() { return this; },
            limit() { return this; },
            maxTimeMS() { return this; },
            lean: async () => []
        });

        const res = await fetch(`${baseUrl}/api/v1/football/training-data?league=eng.1&state=post&limit=10`);
        const json = await res.json();
        assert.equal(res.status, 200);
        assert.equal(json.samples.length, 1, 'Should return only finished non-postponed eng.1 match');
        const sample = json.samples[0];
        assert.equal(sample.eventId, 'epl_fin_1');
        assert.equal(sample.leagueSlug, 'eng.1');
        assert.equal(sample.scoreboardDate, dateKey);
        assert.equal(sample.homeTeam.id, 'h1');
        assert.equal(sample.homeTeam.name, 'Arsenal');
        assert.equal(sample.awayTeam.id, 'a1');
        assert.equal(sample.awayTeam.name, 'Chelsea');
        assert.equal(sample.outcome.winner, 'home_win');
        assert.equal(sample.features.possessionPctHome, 60);
    } finally {
        SoccerMatch.find = origFind;
        await new Promise((r) => server.close(r));
    }
});

test('GitGuardian keystore secret alert: build-apk.sh has zero hardcoded passwords, uses env: passing, and .gitignore ignores keystores', () => {
    const script = fs.readFileSync(path.join(ROOT, 'scripts', 'build-apk.sh'), 'utf8');
    const gitignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
    assert.equal(/--ks-pass\s+pass:/.test(script), false, 'Inline --ks-pass pass: must never exist in build-apk.sh');
    assert.equal(/norrascore\d{4}/.test(script), false, 'Hardcoded keystore password pattern must never exist in build-apk.sh');
    assert.match(script, /--ks-pass env:ANDROID_KEYSTORE_PASS/);
    assert.match(script, /--key-pass env:ANDROID_KEY_PASS/);
    assert.match(script, /-storepass:env ANDROID_KEYSTORE_PASS/);
    assert.match(gitignore, /\*\.keystore/);
});

test('Home Display vs Telemetry Modal reconciliation fixes Northeast United (1-1 FT vs 0-0 Live) and Botswana (0-0 FT vs 3-2 Live)', () => {
    const dateKey = dailyBoardCache.getWatDateKey();
    const fiveHoursAgo = new Date(Date.now() - 5 * 3600 * 1000).toISOString();

    dailyBoardCache.setReadyBoard(dateKey, [
        {
            id: 'isl_ne_hyd',
            league: { slug: 'ind.1', name: 'Indian Super League' },
            date: fiveHoursAgo,
            home: { id: 'ne', name: 'Northeast United FC', score: 1 },
            away: { id: 'hyd', name: 'Hyderabad FC', score: 1 },
            status: { state: 'post', detail: 'FT', clock: 'FT', completed: true, isLive: false }
        },
        {
            id: 'bwa_bdf_ext',
            league: { slug: 'bwa.1', name: 'Botswana Premier League' },
            date: fiveHoursAgo,
            home: { id: 'bdf', name: 'Botswana Defence Force', score: 0 },
            away: { id: 'ext', name: 'Extension Gunners', score: 0 },
            status: { state: 'post', detail: 'FT', clock: 'FT', completed: true, isLive: false }
        }
    ]);

    // Case 1: Northeast United FC vs Hyderabad FC — stale DB 0-0 Live summary vs FT 1-1 board & goal timeline
    const neSummary = {
        header: {
            competitions: [{
                id: 'isl_ne_hyd',
                date: fiveHoursAgo,
                status: { state: 'in', detail: 'Live', clock: 'Live', completed: false, isLive: true, type: { state: 'in', shortDetail: 'Live' } },
                competitors: [
                    { homeAway: 'home', score: '0', team: { displayName: 'Northeast United FC' } },
                    { homeAway: 'away', score: '0', team: { displayName: 'Hyderabad FC' } }
                ]
            }]
        },
        keyEvents: [
            { scoringPlay: true, text: 'Goal! Mohammed Aimen (0-1)', team: { side: 'away' } },
            { scoringPlay: true, text: 'Goal! Antonio Moyano (assist: Nikhil Barla) (1-1)', team: { side: 'home' } }
        ]
    };
    const neBoard = dailyBoardCache.findMatchInBoards('isl_ne_hyd');
    const neRes = dailyBoardCache.reconcileSummaryWithBoardAndEvents(neSummary, { boardMatch: neBoard });
    assert.equal(neRes.reconciled.homeScore, 1);
    assert.equal(neRes.reconciled.awayScore, 1);
    assert.equal(neSummary.header.competitions[0].competitors[0].score, '1');
    assert.equal(neSummary.header.competitions[0].competitors[1].score, '1');
    assert.equal(neSummary.header.competitions[0].status.type.state, 'post');
    assert.equal(neSummary.header.competitions[0].status.type.shortDetail, 'FT');

    // Case 2: Botswana Defence Force vs Extension Gunners — stale board 0-0 FT vs summary 3-2 stuck in Live 5h past kickoff
    const bwaSummary = {
        header: {
            competitions: [{
                id: 'bwa_bdf_ext',
                date: fiveHoursAgo,
                status: { state: 'in', detail: 'Live', clock: 'Live', completed: false, isLive: true, type: { state: 'in', shortDetail: 'Live' } },
                competitors: [
                    { homeAway: 'home', score: '3', team: { displayName: 'Botswana Defence Force' } },
                    { homeAway: 'away', score: '2', team: { displayName: 'Extension Gunners' } }
                ]
            }]
        },
        keyEvents: []
    };
    const bwaBoard = dailyBoardCache.findMatchInBoards('bwa_bdf_ext');
    const bwaRes = dailyBoardCache.reconcileSummaryWithBoardAndEvents(bwaSummary, { boardMatch: bwaBoard });
    assert.equal(bwaRes.reconciled.homeScore, 3);
    assert.equal(bwaRes.reconciled.awayScore, 2);
    assert.equal(bwaSummary.header.competitions[0].status.type.state, 'post', 'Stale Live 5h past kickoff must auto-finalize to FT');
    assert.equal(bwaRes.boardNeedsHeal, true, 'Board 0-0 must be flagged for healing to 3-2');

    const healed = dailyBoardCache.patchMatchInBoards({
        id: 'bwa_bdf_ext',
        league_slug: 'bwa.1',
        home: { name: 'Botswana Defence Force', score: 3 },
        away: { name: 'Extension Gunners', score: 2 },
        status: bwaRes.reconciled.status
    });
    assert.equal(healed, true);
    const healedBoardMatch = dailyBoardCache.findMatchInBoards('bwa_bdf_ext');
    assert.equal(healedBoardMatch.home.score, 3);
    assert.equal(healedBoardMatch.away.score, 2);
});

test('Same-day UEFA Youth League (U19) matches NEVER hide or collide with Senior UEFA Champions League pre-match fixtures', () => {
    const dateKey = dailyBoardCache.getWatDateKey();
    const u19Kickoff = new Date(Date.now() - 4 * 3600 * 1000).toISOString();
    const seniorKickoff = new Date(Date.now() + 2 * 3600 * 1000).toISOString();

    dailyBoardCache.setReadyBoard(dateKey, [
        {
            id: 'u19_ars_bvb',
            league: { slug: 'uefa.youth', name: 'UEFA Youth League' },
            league_slug: 'uefa.youth',
            date: u19Kickoff,
            home: { name: 'Arsenal U19', score: 2 },
            away: { name: 'Borussia Dortmund U19', score: 1 },
            status: { state: 'post', detail: 'FT', clock: 'FT', completed: true, isLive: false }
        },
        {
            id: 'ucl_ars_bvb',
            league: { slug: 'uefa.champions', name: 'UEFA Champions League' },
            league_slug: 'uefa.champions',
            date: seniorKickoff,
            home: { name: 'Arsenal', score: null },
            away: { name: 'Borussia Dortmund', score: null },
            status: { state: 'pre', detail: 'Scheduled', clock: '', completed: false, isLive: false }
        }
    ]);

    // Live patch for senior UCL match must update ONLY senior match and never touch U19
    dailyBoardCache.patchLiveMatchesInBoard(dateKey, [{
        id: 'ucl_ars_bvb_live',
        league: { slug: 'uefa.champions', name: 'UEFA Champions League' },
        league_slug: 'uefa.champions',
        date: seniorKickoff,
        home: { name: 'Arsenal', score: 1 },
        away: { name: 'Borussia Dortmund', score: 0 },
        status: { state: 'in', detail: "12'", clock: "12'", completed: false, isLive: true }
    }], { isFullSnapshot: false });

    const board = dailyBoardCache.getReadyBoard(dateKey, { status: 'all' });
    const u19 = board.matches.find(m => m.id === 'u19_ars_bvb');
    const senior = board.matches.find(m => m.id === 'ucl_ars_bvb');
    assert.ok(u19 && senior, 'Both U19 and Senior UCL matches must coexist in dailyBoardCache');
    assert.equal(u19.status.state, 'post');
    assert.equal(u19.home.score, 2);
    assert.equal(senior.status.state, 'in');
    assert.equal(senior.home.score, 1);

    // Structural guardrail: syncLiveScoreboards must not fall back to tierless byNormSig.get(`${hNorm}_vs_${aNorm}`)
    const syncSrc = fs.readFileSync(path.join(ROOT, 'services', 'soccerSyncService.js'), 'utf8');
    assert.equal(syncSrc.includes('byNormSig.get(`${hNorm}_vs_${aNorm}`)'), false);
    const apiSrc = fs.readFileSync(path.join(ROOT, 'controllers', 'footballApiController.js'), 'utf8');
    assert.match(apiSrc, /vTier === mTier && \[mh, ma\]\.sort\(\)\.join\('_vs_'\) === \[h, a\]\.sort\(\)\.join\('_vs_'\)/);
});

test('Frontend timeline filters Start/End Delay noise and sorts clockless halftime substitutions after first-half events', () => {
    const appJs = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
    assert.match(appJs, /\/\^\(start\|end\)\\s\+delay\$\/i/);
    assert.match(appJs, /if \(kind === 'substitution' && !clockDisplay && clockValue === 0\) \{\s*clockValue = 45\.99;/);
    assert.match(appJs, /function reconcileClientSummaryWithBoard\(summary, plays, matchContext, eventId\)/);
    assert.equal(appJs.includes('.fixture-row[data-event-id='), false, 'Must use real .fs-match-row selector, not non-existent .fixture-row');
});

test('Reconciliation edge cases: missed penalties never fabricate goals, null scores never coerce to 0, B. Dortmund stays senior, and .fs-match-row DOM heals', () => {
    // 1. Missed penalty / disallowed goal must NOT be counted as a goal
    const scoreFromNonGoals = dailyBoardCache.extractScoreFromKeyEvents([
        { scoringPlay: false, type: { text: 'Penalty - Missed' }, text: 'Penalty missed by Player X', team: { side: 'home' } },
        { scoringPlay: false, type: { text: 'Goal Disallowed' }, text: 'Goal Disallowed - Offside', team: { side: 'away' } },
        { scoringPlay: false, type: { text: 'Penalty Saved' }, text: 'Penalty saved by Keeper', team: { side: 'home' } }
    ]);
    assert.equal(scoreFromNonGoals, null, 'Missed penalties and disallowed goals must not fabricate scores');

    // 2. patchMatchInBoards must NOT coerce null/empty scores to 0 on scheduled matches
    const dateKey = dailyBoardCache.getWatDateKey();
    const futureDate = new Date(Date.now() + 3 * 3600 * 1000).toISOString();
    dailyBoardCache.setReadyBoard(dateKey, [
        {
            id: 'pre_bvb_1',
            league: { slug: 'ger.1', name: 'Bundesliga' },
            date: futureDate,
            home: { name: 'B. Dortmund', score: null },
            away: { name: 'RB Leipzig', score: null },
            status: { state: 'pre', detail: 'Scheduled', clock: '', completed: false, isLive: false }
        }
    ]);
    const nullPatched = dailyBoardCache.patchMatchInBoards({
        id: 'pre_bvb_1',
        league_slug: 'ger.1',
        home: { name: 'B. Dortmund', score: null },
        away: { name: 'RB Leipzig', score: '' },
        status: { state: 'pre', detail: 'Scheduled', completed: false, isLive: false }
    });
    assert.equal(nullPatched, false, 'Null/empty scores must not overwrite scheduled match scores with 0');
    const preMatch = dailyBoardCache.findMatchInBoards('pre_bvb_1');
    assert.equal(preMatch.home.score, null);
    assert.equal(preMatch.away.score, null);

    // 3. "B. Dortmund" must NOT be misclassified as youth (m_y) when looking up by pair
    const bvbByPair = dailyBoardCache.findMatchInBoards({
        league_slug: 'ger.1',
        home: { name: 'B. Dortmund' },
        away: { name: 'RB Leipzig' }
    });
    assert.ok(bvbByPair, 'B. Dortmund must match as senior tier (m_s)');

    // 4. Execute real reconcileClientSummaryWithBoard from public/app.js against ESPN-shaped matchContext & mock .fs-match-row DOM
    const appJs = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
    const fnMatch = appJs.match(/function reconcileClientSummaryWithBoard\(summary, plays, matchContext, eventId\) \{[\s\S]*?\n    \}\n\n    function parseTimelineClockMinute/);
    assert.ok(fnMatch, 'reconcileClientSummaryWithBoard must be extractable from public/app.js');
    const fnBody = fnMatch[0].replace(/\n\n    function parseTimelineClockMinute$/, '');

    const makeClassList = (initial = []) => {
        const set = new Set(initial);
        return {
            add: (c) => set.add(c),
            remove: (c) => set.delete(c),
            toggle: (c, force) => { if (force) set.add(c); else set.delete(c); },
            contains: (c) => set.has(c)
        };
    };
    const scoreEls = [
        { textContent: '0', classList: makeClassList(['fs-score-digit', 'score-live']) },
        { textContent: '0', classList: makeClassList(['fs-score-digit', 'score-live']) }
    ];
    const teamLines = [
        { classList: makeClassList(['fs-team-line']) },
        { classList: makeClassList(['fs-team-line']) }
    ];
    const statusCol = {
        innerHTML: '<div class="fs-status-live-col"><span class="fs-status-live">Live</span></div>',
        querySelector: () => ({ textContent: '15:00' })
    };
    const mockRow = {
        classList: makeClassList(['fs-match-row', 'is-live-row']),
        querySelectorAll: (sel) => sel === '.fs-score-digit' ? scoreEls : (sel === '.fs-team-line' ? teamLines : []),
        querySelector: (sel) => sel === '.fs-col-status' ? statusCol : null
    };
    let queriedSelector = '';
    const mockDocument = {
        querySelector: (sel) => { queriedSelector = sel; return sel.includes('.fs-match-row[data-event-id="bwa_dom_1"]') ? mockRow : null; }
    };

    const runReconcile = new Function('document', 'escapeHtml', 'formatTime', 'summary', 'plays', 'matchContext', 'eventId', `
        ${fnBody}
        return reconcileClientSummaryWithBoard(summary, plays, matchContext, eventId);
    `);

    const fiveHoursAgo = new Date(Date.now() - 5 * 3600 * 1000).toISOString();
    // Case A: ESPN-shaped matchContext (like state.renderedMatchesById) has 1-1 FT while summary has 0-0 Live
    const espnRenderedCtx = {
        id: 'ne_espn_1',
        date: fiveHoursAgo,
        competitions: [{
            date: fiveHoursAgo,
            status: { type: { state: 'post', completed: true, shortDetail: 'FT' } },
            competitors: [
                { homeAway: 'home', score: '1', team: { displayName: 'Northeast United FC' } },
                { homeAway: 'away', score: '1', team: { displayName: 'Hyderabad FC' } }
            ]
        }]
    };
    const staleSummary = {
        header: {
            competitions: [{
                date: fiveHoursAgo,
                status: { state: 'in', detail: 'Live', isLive: true, completed: false, type: { state: 'in', shortDetail: 'Live' } },
                competitors: [
                    { homeAway: 'home', score: '0', team: { displayName: 'Northeast United FC' } },
                    { homeAway: 'away', score: '0', team: { displayName: 'Hyderabad FC' } }
                ]
            }]
        },
        keyEvents: [
            { scoringPlay: false, type: { text: 'Penalty - Missed' }, text: 'Missed penalty (0-0)' }
        ]
    };
    runReconcile(mockDocument, (s) => String(s), () => '15:00', staleSummary, [], espnRenderedCtx, 'ne_espn_1');
    assert.equal(staleSummary.header.competitions[0].competitors[0].score, '1', 'Must read score from ESPN-shaped matchContext');
    assert.equal(staleSummary.header.competitions[0].competitors[1].score, '1');
    assert.equal(staleSummary.header.competitions[0].status.type.state, 'post');
    assert.equal(staleSummary.header.competitions[0].status.type.shortDetail, 'FT');

    // Case B: Summary has 3-2 stuck in Live 5h past kickoff -> auto-finalizes to FT and heals .fs-match-row DOM
    const bwaSummary = {
        header: {
            competitions: [{
                date: fiveHoursAgo,
                status: { state: 'in', detail: 'Live', isLive: true, completed: false, type: { state: 'in', shortDetail: 'Live' } },
                competitors: [
                    { homeAway: 'home', score: '3', team: { displayName: 'Botswana Defence Force' } },
                    { homeAway: 'away', score: '2', team: { displayName: 'Extension Gunners' } }
                ]
            }]
        },
        keyEvents: []
    };
    const bwaCtx = {
        id: 'bwa_dom_1',
        date: fiveHoursAgo,
        competitions: [{
            status: { type: { state: 'in', completed: false, shortDetail: 'Live' } },
            competitors: [
                { homeAway: 'home', score: '0' },
                { homeAway: 'away', score: '0' }
            ]
        }]
    };
    runReconcile(mockDocument, (s) => String(s), () => '15:00', bwaSummary, [], bwaCtx, 'bwa_dom_1');
    assert.equal(queriedSelector, '.fs-match-row[data-event-id="bwa_dom_1"]');
    assert.equal(scoreEls[0].textContent, '3');
    assert.equal(scoreEls[1].textContent, '2');
    assert.equal(scoreEls[0].classList.contains('score-live'), false);
    assert.equal(mockRow.classList.contains('is-live-row'), false);
    assert.equal(teamLines[0].classList.contains('team-winner'), true);
    assert.equal(teamLines[1].classList.contains('team-winner'), false);
    assert.match(statusCol.innerHTML, /fs-status-ft">FT<\/span>/);
    assert.equal(bwaCtx.competitions[0].competitors[0].score, '3');
    assert.equal(bwaCtx.competitions[0].status.type.state, 'post');
});

test('Training-data endpoint: excludes future-dated post fixtures, avoids null->0 card fabrication, filters non-scoring goalEvents, and exposes dailyFixtureCount', async () => {
    const origGetReadyBoard = dailyBoardCache.getReadyBoard;
    const origFind = SoccerMatch.find;
    const origReadyStateDesc = Object.getOwnPropertyDescriptor(mongoose.connection, 'readyState');

    const nowMs = Date.now();
    const pastIso = new Date(nowMs - 3 * 3600 * 1000).toISOString();
    const futureIso = new Date(nowMs + 48 * 3600 * 1000).toISOString();

    const boardFinished = [
        {
            id: 'td_past_real_1',
            source: { event_id: 'td_past_real_1', provider: 'espn' },
            league_slug: 'eng.1',
            date: pastIso,
            home: { id: 'h1', name: 'Arsenal', score: 2, stats: { possessionPct: 60, totalShots: 14, shotsOnTarget: 6 } },
            away: { id: 'a1', name: 'Chelsea', score: 1, stats: { possessionPct: 40, totalShots: 8, shotsOnTarget: 3 } },
            status: { state: 'post', detail: 'FT', completed: true },
            key_events: [
                { scoringPlay: true, clockValue: 22, clock: "22'", side: 'home', type: { text: 'Goal' }, text: 'Goal! Arsenal 1, Chelsea 0.' },
                { scoringPlay: false, clockValue: 41, clock: "41'", side: 'away', type: { text: 'Goal - Disallowed' }, text: 'Goal disallowed after VAR review' },
                { scoringPlay: false, clockValue: 55, clock: "55'", side: 'home', type: { text: 'Penalty - Missed' }, text: 'Missed penalty goal attempt' },
                { scoringPlay: false, clockValue: 78, clock: "78'", side: 'away', type: { text: 'Goal' }, text: 'Goal! Arsenal 2, Chelsea 1.' }
            ]
        },
        {
            id: 'td_past_no_events_2',
            source: { event_id: 'td_past_no_events_2', provider: 'espn' },
            league_slug: 'eng.1',
            date: pastIso,
            home: { id: 'h2', name: 'Liverpool', score: 1, stats: { possessionPct: 55 } },
            away: { id: 'a2', name: 'Everton', score: 0, stats: { possessionPct: 45 } },
            status: { state: 'post', detail: 'FT', completed: true },
            key_events: []
        },
        {
            id: 'td_future_bad_post_3',
            source: { event_id: 'td_future_bad_post_3', provider: 'espn' },
            league_slug: 'eng.1',
            date: futureIso,
            home: { id: 'h3', name: 'Future FC', score: 0, stats: {} },
            away: { id: 'a3', name: 'Tomorrow Utd', score: 0, stats: {} },
            status: { state: 'post', detail: 'FT', completed: true },
            key_events: []
        }
    ];

    const capturedFilters = [];
    Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true, writable: true });
    SoccerMatch.find = (filter) => {
        capturedFilters.push(filter);
        return {
            select() { return this; },
            sort() { return this; },
            limit() { return this; },
            maxTimeMS() { return this; },
            lean() { return Promise.resolve([]); }
        };
    };

    dailyBoardCache.getReadyBoard = (_dateKey, opts = {}) => {
        if (opts.status === 'finished') {
            return { matches: boardFinished };
        }
        return { matches: [...boardFinished, { id: 'sched_1', status: { state: 'pre' } }] };
    };

    const { server, baseUrl } = await startTempServer((app) => {
        footballApiRouter(app);
    });

    try {
        const res = await fetch(`${baseUrl}/api/v1/football/training-data?league=eng.1&state=post&limit=11`);
        assert.equal(res.status, 200);
        const body = await res.json();
        assert.equal(body.status, 'success');
        assert.equal(body.meta.dailyFixtureCount, 4);

        // Unconditionally verify DB query filter bounded date <= now + 2h for state=post
        assert.ok(capturedFilters.length > 0, 'Expected SoccerMatch.find to be invoked when DB is connected');
        assert.ok(capturedFilters[0].date && capturedFilters[0].date.$lte instanceof Date, 'DB filter must bound date.$lte for state=post');
        assert.ok(
            capturedFilters[0].date.$lte.getTime() <= Date.now() + 2.5 * 3600 * 1000,
            'DB filter date.$lte must be bounded within ~2h of now'
        );

        const ids = body.samples.map(s => s.eventId);
        assert.ok(ids.includes('td_past_real_1'), 'Expected past real match in training-data');
        assert.ok(ids.includes('td_past_no_events_2'), 'Expected second past match in training-data');
        assert.ok(!ids.includes('td_future_bad_post_3'), 'Future-dated post fixture must be excluded');

        const s1 = body.samples.find(s => s.eventId === 'td_past_real_1');
        assert.equal(s1.features.yellowCardsHome, null, 'Missing yellowCardsHome must be null, not 0');
        assert.equal(s1.features.yellowCardsAway, null, 'Missing yellowCardsAway must be null, not 0');
        assert.equal(s1.features.redCardsHome, 0, 'redCardsHome derived from non-empty keyEvents');
        assert.equal(s1.timelineSummary.goals.length, 2, 'Non-scoring disallowed/missed penalty goal events must be excluded');

        const s2 = body.samples.find(s => s.eventId === 'td_past_no_events_2');
        assert.equal(s2.features.yellowCardsHome, null);
        assert.equal(s2.features.redCardsHome, null, 'redCardsHome must be null when stats.redCards missing and keyEvents empty');
        assert.equal(s2.features.disciplinaryScoreHome, null, 'disciplinaryScoreHome must be null when both yellow and red cards are null');
    } finally {
        if (origReadyStateDesc) {
            Object.defineProperty(mongoose.connection, 'readyState', origReadyStateDesc);
        } else {
            delete mongoose.connection.readyState;
        }
        dailyBoardCache.getReadyBoard = origGetReadyBoard;
        SoccerMatch.find = origFind;
        await new Promise((resolve) => server.close(resolve));
    }
});

test('Secret-scanner hygiene: no static Flutterwave tokens in docs or static master key in account portal', () => {
    const docSrc = fs.readFileSync(path.join(ROOT, 'docs', 'DEPLOYMENT_AND_SUBDOMAIN_GUIDE.md'), 'utf8');
    assert.equal(docSrc.includes('FLWPUBK-'), false, 'Docs must not contain static FLWPUBK- token pattern');
    assert.equal(docSrc.includes('FLWSECK-'), false, 'Docs must not contain static FLWSECK- token pattern');

    const accountHtml = fs.readFileSync(path.join(ROOT, 'public', 'account', 'index.html'), 'utf8');
    const accountJs = fs.readFileSync(path.join(ROOT, 'public', 'account', 'account.js'), 'utf8');
    const staticKey = 'norra_live_' + 'master_internal_access_2026';
    assert.equal(accountHtml.includes(staticKey), false, 'public/account/index.html must not hardcode static master key');
    assert.equal(accountJs.includes(staticKey), false, 'public/account/account.js must not hardcode static master key');
    assert.equal(accountHtml.includes('<NORRA_INTERNAL_API_KEY>'), false, 'HTML placeholder must be entity-escaped so browsers do not strip it as an unknown tag');
    assert.equal(accountHtml.includes('&lt;NORRA_INTERNAL_API_KEY&gt;'), true, 'HTML placeholder must use &lt;NORRA_INTERNAL_API_KEY&gt; so textContent contains <NORRA_INTERNAL_API_KEY>');
});
