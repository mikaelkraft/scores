const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const https = require('node:https');
const { EventEmitter } = require('node:events');
const mongoose = require('mongoose');

const footballApiController = require('../controllers/footballApiController');
const dailyBoardCache = require('../services/dailyBoardCache');
const SoccerMatch = require('../models/soccerMatch');
const SoccerLeague = require('../models/soccerLeague');

test.after(async () => {
    try { await mongoose.disconnect(); } catch (_) {}
});

function mockHttpsGet(handler) {
    const origGet = https.get;
    https.get = (url, opts, cb) => {
        if (typeof opts === 'function') {
            cb = opts;
        }
        const req = new EventEmitter();
        req.destroy = () => {};
        process.nextTick(() => {
            const payload = handler(String(url));
            const res = new EventEmitter();
            res.statusCode = payload ? 200 : 404;
            res.headers = {};
            if (typeof cb === 'function') cb(res);
            if (payload) {
                res.emit('data', JSON.stringify(payload));
            }
            res.emit('end');
        });
        return req;
    };
    return () => { https.get = origGet; };
}

const {
    doesMatchBelongToDate,
    getMatchUtcDateKey,
    isActivelyLiveMatch,
    fetchEspnLeagueScoreboard,
    fetchLiveScoreDayMatches
} = footballApiController;

function utcKeyFromMs(ms) {
    const d = new Date(ms);
    return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}

test('doesMatchBelongToDate strictly filters out yesterday/older/future matches while keeping today and cross-midnight live', () => {
    // Fixed reference time: 2026-11-27T00:45:00Z (45 minutes past UTC midnight)
    const nowMs = Date.parse('2026-11-27T00:45:00.000Z');
    const todayKey = '20261127';
    const yesterdayKey = '20261126';

    // Today's scheduled match -> KEEP
    assert.equal(doesMatchBelongToDate({
        date: '2026-11-27T19:45:00.000Z',
        scoreboard_date: '20261127',
        status: { state: 'pre', isLive: false, completed: false }
    }, todayKey, { nowMs, isToday: true }), true);

    // Today's finished match -> KEEP
    assert.equal(doesMatchBelongToDate({
        date: '2026-11-27T00:05:00.000Z',
        scoreboard_date: '20261127',
        status: { state: 'post', isLive: false, completed: true, detail: 'FT' }
    }, todayKey, { nowMs, isToday: true }), true);

    // Yesterday's completed match -> REJECT
    assert.equal(doesMatchBelongToDate({
        date: '2026-11-26T20:00:00.000Z',
        scoreboard_date: '20261126',
        status: { state: 'post', isLive: false, completed: true, detail: 'FT' }
    }, todayKey, { nowMs, isToday: true }), false);

    // 3-day-old UCL completed match -> REJECT
    assert.equal(doesMatchBelongToDate({
        date: '2026-11-24T20:00:00.000Z',
        scoreboard_date: '20261124',
        status: { state: 'post', isLive: false, completed: true, detail: 'FT' }
    }, todayKey, { nowMs, isToday: true }), false);

    // Tomorrow's scheduled match -> REJECT
    assert.equal(doesMatchBelongToDate({
        date: '2026-11-28T15:00:00.000Z',
        scoreboard_date: '20261128',
        status: { state: 'pre', isLive: false, completed: false }
    }, todayKey, { nowMs, isToday: true }), false);

    // Corrupted doc: scoreboard_date wrongly stamped as today, but actual date is yesterday -> REJECT
    assert.equal(doesMatchBelongToDate({
        date: '2026-11-26T22:00:00.000Z',
        scoreboard_date: '20261127',
        status: { state: 'post', isLive: false, completed: true, detail: 'FT' }
    }, todayKey, { nowMs, isToday: true }), false);

    // Legitimate cross-midnight LIVE in-play match (kicked off 23:30 UTC yesterday, now 75' at 00:45 UTC today) -> KEEP
    assert.equal(doesMatchBelongToDate({
        date: '2026-11-26T23:30:00.000Z',
        scoreboard_date: '20261126',
        status: { state: 'in', isLive: true, completed: false, clock: "75'", detail: "75'" }
    }, todayKey, { nowMs, isToday: true }), true);

    // Same cross-midnight match after finishing (FT) -> REJECT from today's board
    assert.equal(doesMatchBelongToDate({
        date: '2026-11-26T23:30:00.000Z',
        scoreboard_date: '20261126',
        status: { state: 'post', isLive: false, completed: true, clock: 'FT', detail: 'FT' }
    }, todayKey, { nowMs, isToday: true }), false);

    // Stale stuck "live" match from 4 hours ago yesterday (>160m) -> REJECT
    assert.equal(doesMatchBelongToDate({
        date: '2026-11-26T20:30:00.000Z',
        scoreboard_date: '20261126',
        status: { state: 'in', isLive: true, completed: false, clock: "90'", detail: "90'" }
    }, todayKey, { nowMs, isToday: true }), false);

    // Querying yesterday (isToday: false): yesterday's FT -> KEEP, today's match -> REJECT
    assert.equal(doesMatchBelongToDate({
        date: '2026-11-26T20:00:00.000Z',
        status: { state: 'post', isLive: false, completed: true }
    }, yesterdayKey, { nowMs, isToday: false }), true);
    assert.equal(doesMatchBelongToDate({
        date: '2026-11-27T15:00:00.000Z',
        status: { state: 'pre', isLive: false, completed: false }
    }, yesterdayKey, { nowMs, isToday: false }), false);

    assert.equal(getMatchUtcDateKey({ date: '2026-11-26T23:59:00.000Z', scoreboard_date: '20261127' }), '20261126');
    assert.equal(isActivelyLiveMatch({ date: '2026-11-26T23:30:00.000Z', status: { state: 'in', isLive: true } }, nowMs), true);
    assert.equal(isActivelyLiveMatch({ date: '2026-11-26T20:00:00.000Z', status: { state: 'in', isLive: true } }, nowMs), false);
});

test('fetchEspnLeagueScoreboard passes ?dates=YYYYMMDD and filters out old/future matchweek events', async () => {
    const requestedUrls = [];
    const targetKey = utcKeyFromMs(Date.now());
    const todayIso = `${targetKey.slice(0, 4)}-${targetKey.slice(4, 6)}-${targetKey.slice(6, 8)}T18:00:00Z`;
    const oldDate = new Date(Date.now() - 2 * 86400000);
    const oldIso = oldDate.toISOString();
    const futureDate = new Date(Date.now() + 2 * 86400000);
    const futureIso = futureDate.toISOString();

    const restoreHttps = mockHttpsGet((url) => {
        requestedUrls.push(String(url));
        return {
            leagues: [{ name: 'UEFA Champions League', abbreviation: 'UCL', countryCode: 'INT' }],
            events: [
                {
                    id: 'espn_old_1',
                    date: oldIso,
                    status: { type: { state: 'post', name: 'STATUS_FULL_TIME', detail: 'FT' } },
                    competitions: [{
                        competitors: [
                            { homeAway: 'home', score: '2', team: { id: '1', displayName: 'Real Madrid' } },
                            { homeAway: 'away', score: '1', team: { id: '2', displayName: 'AC Milan' } }
                        ]
                    }]
                },
                {
                    id: 'espn_today_1',
                    date: todayIso,
                    status: { type: { state: 'pre', name: 'STATUS_SCHEDULED', detail: '18:00' } },
                    competitions: [{
                        competitors: [
                            { homeAway: 'home', score: null, team: { id: '3', displayName: 'Arsenal' } },
                            { homeAway: 'away', score: null, team: { id: '4', displayName: 'Inter Milan' } }
                        ]
                    }]
                },
                {
                    id: 'espn_future_1',
                    date: futureIso,
                    status: { type: { state: 'pre', name: 'STATUS_SCHEDULED', detail: '20:00' } },
                    competitions: [{
                        competitors: [
                            { homeAway: 'home', score: null, team: { id: '5', displayName: 'Barcelona' } },
                            { homeAway: 'away', score: null, team: { id: '6', displayName: 'Bayern Munich' } }
                        ]
                    }]
                }
            ]
        };
    });

    try {
        const matches = await fetchEspnLeagueScoreboard('uefa.champions', targetKey);
        assert.equal(requestedUrls.length, 1);
        assert.ok(requestedUrls[0].includes(`?dates=${targetKey}`), `Expected ?dates=${targetKey} in ${requestedUrls[0]}`);
        assert.equal(matches.length, 1);
        assert.equal(matches[0].id, 'espn_today_1');
        assert.equal(matches[0].scoreboard_date, targetKey);
    } finally {
        restoreHttps();
    }
});

test('fetchLiveScoreDayMatches drops previous-day completed events instead of blindly stamping target dateKey', async () => {
    const origLeagueFind = SoccerLeague.find;
    const targetKey = utcKeyFromMs(Date.now());
    const yesterdayKey = utcKeyFromMs(Date.now() - 86400000);

    SoccerLeague.find = () => ({
        maxTimeMS: () => ({ lean: async () => [] })
    });
    const restoreHttps = mockHttpsGet(() => ({
        Stages: [{
            Cnm: 'England',
            Snm: 'Premier League',
            Scd: 'premier-league',
            Events: [
                {
                    Eid: 'ls_old_yesterday',
                    Esd: `${yesterdayKey}200000`,
                    Eps: 'FT',
                    Tr1: '3',
                    Tr2: '0',
                    T1: [{ ID: '10', Nm: 'Liverpool' }],
                    T2: [{ ID: '11', Nm: 'Everton' }]
                },
                {
                    Eid: 'ls_today_ok',
                    Esd: `${targetKey}193000`,
                    Eps: 'NS',
                    T1: [{ ID: '12', Nm: 'Chelsea' }],
                    T2: [{ ID: '13', Nm: 'Tottenham' }]
                }
            ]
        }]
    }));

    try {
        const matches = await fetchLiveScoreDayMatches(targetKey);
        assert.equal(matches.length, 1);
        assert.equal(matches[0].id, 'ls_today_ok');
        assert.equal(matches[0].scoreboard_date, targetKey);
    } finally {
        restoreHttps();
        SoccerLeague.find = origLeagueFind;
    }
});

test('dailyBoardCache.patchLiveMatchesInBoard rejects completed/stale/future live matches and hides legitimate cross-day live once finished', () => {
    dailyBoardCache.clearBoardCache();
    const todayKey = utcKeyFromMs(Date.now());
    const tomorrowKey = utcKeyFromMs(Date.now() + 24 * 60 * 60 * 1000);
    const yesterdayIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const staleLiveKickoff = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(); // 25h ago (stale)
    const futureBogusLiveKickoff = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(); // 2 days ahead
    const activeKickoff = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 60m ago (genuinely live)

    dailyBoardCache.setReadyBoard(todayKey, []);
    dailyBoardCache.setReadyBoard(tomorrowKey, []);

    // 1. Attempting to pass a completed, stale (>160m), or future (<-10m) match must NOT append it
    dailyBoardCache.patchLiveMatchesInBoard(todayKey, [
        {
            id: 'old_ft_1',
            league: { slug: 'eng.1', name: 'Premier League' },
            league_slug: 'eng.1',
            date: yesterdayIso,
            status: { state: 'post', isLive: false, completed: true, clock: 'FT', detail: 'FT' },
            home: { name: 'Arsenal', score: 2 },
            away: { name: 'Chelsea', score: 1 }
        },
        {
            id: 'stale_live_1',
            league: { slug: 'bra.1', name: 'Brasileirao' },
            league_slug: 'bra.1',
            date: staleLiveKickoff,
            status: { state: 'in', isLive: true, completed: false, clock: "88'", detail: "88'" },
            home: { name: 'Flamengo', score: 1 },
            away: { name: 'Botafogo', score: 1 }
        },
        {
            id: 'future_bogus_live_1',
            league: { slug: 'esp.1', name: 'La Liga' },
            league_slug: 'esp.1',
            date: futureBogusLiveKickoff,
            status: { state: 'in', isLive: true, completed: false, clock: "12'", detail: "12'" },
            home: { name: 'Real Madrid', score: 0 },
            away: { name: 'Sevilla', score: 0 }
        }
    ], { isFullSnapshot: false });

    let board = dailyBoardCache.getReadyBoard(todayKey, { status: 'all' });
    assert.equal(board.matches.length, 0);

    // 2. A genuinely active cross-day LIVE match (activeKickoff has UTC date !== tomorrowKey) IS visible while live...
    dailyBoardCache.patchLiveMatchesInBoard(tomorrowKey, [
        {
            id: 'cross_day_live_ok',
            league: { slug: 'bra.1', name: 'Brasileirao' },
            league_slug: 'bra.1',
            date: activeKickoff,
            status: { state: 'in', isLive: true, completed: false, clock: "60'", detail: "60'" },
            home: { name: 'Palmeiras', score: 2 },
            away: { name: 'Santos', score: 1 }
        }
    ], { isFullSnapshot: false });

    board = dailyBoardCache.getReadyBoard(tomorrowKey, { status: 'all' });
    assert.equal(board.matches.length, 1);
    assert.equal(board.matches[0]._crossDayLive, true);

    // ...and once it finishes (FT patch), it disappears immediately from that board!
    dailyBoardCache.patchMatchInBoards({
        id: 'cross_day_live_ok',
        status: { state: 'post', isLive: false, completed: true, clock: 'FT', detail: 'FT' },
        home: { name: 'Palmeiras', score: 2 },
        away: { name: 'Santos', score: 1 }
    }, { authoritative: true });

    board = dailyBoardCache.getReadyBoard(tomorrowKey, { status: 'all' });
    assert.equal(board.matches.length, 0);
    dailyBoardCache.clearBoardCache();
});

test('GET /api/v1/football/fixtures?date=today strips stale Mongo/ESPN/LiveScore old matches and preserves date scope on ?team=', async () => {
    dailyBoardCache.clearBoardCache();
    const origCount = SoccerMatch.countDocuments;
    const origFind = SoccerMatch.find;
    const origLeagueFind = SoccerLeague.find;

    const todayKey = utcKeyFromMs(Date.now());
    const yesterdayKey = utcKeyFromMs(Date.now() - 86400000);
    const todayIso = `${todayKey.slice(0, 4)}-${todayKey.slice(4, 6)}-${todayKey.slice(6, 8)}T17:00:00.000Z`;
    const yesterdayIso = `${yesterdayKey.slice(0, 4)}-${yesterdayKey.slice(4, 6)}-${yesterdayKey.slice(6, 8)}T20:00:00.000Z`;

    const capturedFilters = [];
    const makeChain = (rows) => ({
        select() { return this; },
        sort() { return this; },
        skip() { return this; },
        limit() { return this; },
        maxTimeMS() { return this; },
        lean() { return Promise.resolve(rows); }
    });

    const mockDbDocs = [
        {
            _id: 'doc_old_stale',
            source: { event_id: 'ev_old_stale', provider: 'espn' },
            league_slug: 'eng.1',
            scoreboard_date: todayKey, // corrupted scoreboard_date!
            date: new Date(yesterdayIso), // actual date is YESTERDAY
            status: { state: 'post', completed: true, detail: 'FT', clock: 'FT' },
            home: { name: 'Old Home FC', score: 3 },
            away: { name: 'Old Away FC', score: 1 }
        },
        {
            _id: 'doc_today_ok',
            source: { event_id: 'ev_today_ok', provider: 'espn' },
            league_slug: 'eng.1',
            scoreboard_date: todayKey,
            date: new Date(todayIso),
            status: { state: 'pre', completed: false, detail: 'Scheduled', clock: '' },
            home: { name: 'Arsenal', score: null },
            away: { name: 'Chelsea', score: null }
        }
    ];

    SoccerMatch.countDocuments = (f) => {
        capturedFilters.push(f);
        return { maxTimeMS: () => Promise.resolve(mockDbDocs.length) };
    };
    SoccerMatch.find = () => makeChain(mockDbDocs);
    SoccerLeague.find = () => makeChain([]);
    const restoreHttps = mockHttpsGet((url) => {
        const u = String(url);
        if (u.includes('site.api.espn.com')) {
            return {
                leagues: [{ name: 'UEFA Champions League', abbreviation: 'UCL', countryCode: 'INT' }],
                events: [{
                    id: 'espn_old_ucl',
                    date: yesterdayIso,
                    status: { type: { state: 'post', detail: 'FT' } },
                    competitions: [{
                        competitors: [
                            { homeAway: 'home', score: '1', team: { id: '1', displayName: 'Old UCL Home' } },
                            { homeAway: 'away', score: '0', team: { id: '2', displayName: 'Old UCL Away' } }
                        ]
                    }]
                }]
            };
        }
        if (u.includes('prod-public-api.livescore.com/v1/api/app/date/soccer/')) {
            return {
                Stages: [{
                    Cnm: 'England',
                    Snm: 'Premier League',
                    Scd: 'premier-league',
                    Events: [{
                        Eid: 'ls_today_unrelated',
                        Esd: `${todayKey}190000`,
                        Eps: 'NS',
                        T1: [{ ID: '20', Nm: 'Liverpool' }],
                        T2: [{ ID: '21', Nm: 'Everton' }]
                    }]
                }]
            };
        }
        return { Stages: [], events: [] };
    });

    let footballRouter = null;
    footballApiController({
        use(prefix, r) { if (prefix === '/api/v1/football') footballRouter = r; },
        get() {}
    });
    const layer = footballRouter.stack.find(l => l.route && l.route.path === '/fixtures' && l.route.methods.get);
    assert.ok(layer, 'GET /fixtures route handler should exist');
    const handler = layer.route.stack[layer.route.stack.length - 1].handle;

    const invokeFixtures = async (query) => {
        let payload = null;
        const req = {
            query,
            originalUrl: `/api/v1/football/fixtures?${new URLSearchParams(query).toString()}&_t=${Math.random()}`,
            apiKey: null,
            isAdFree: false
        };
        const res = {
            headers: {},
            set(k, v) { this.headers[k] = v; },
            status(code) { this.statusCode = code; return this; },
            json(body) { payload = body; return this; }
        };
        await handler(req, res);
        return payload;
    };

    try {
        const resToday = await invokeFixtures({ date: 'today', limit: '50' });
        assert.equal(resToday.status, 'success');
        const ids = resToday.matches.map(m => m.id);
        assert.ok(ids.includes('ev_today_ok'), 'Today match must be included');
        assert.ok(!ids.includes('ev_old_stale'), 'Yesterday match with corrupted scoreboard_date must be excluded');
        assert.ok(!ids.includes('espn_old_ucl'), 'Yesterday ESPN match must be excluded');

        // Also verify ?date=today&team=Arsenal combines date and team with $and AND does not leak unrelated LiveScore matches
        capturedFilters.length = 0;
        const resTeam = await invokeFixtures({ date: 'today', team: 'Arsenal', limit: '50' });
        assert.ok(capturedFilters.length > 0);
        assert.ok(Array.isArray(capturedFilters[0].$and), 'team + date query must combine filters with $and');
        assert.equal(capturedFilters[0].$and.length, 2);
        const teamIds = resTeam.matches.map(m => m.id);
        assert.ok(teamIds.includes('ev_today_ok'), 'Arsenal match must be included');
        assert.ok(!teamIds.includes('ls_today_unrelated'), 'Unrelated LiveScore match must not leak into ?team=Arsenal');

        // Verify ?from=...&to=... historical range does NOT merge today's LiveScore/ESPN matches
        const resRange = await invokeFixtures({ from: '2026-10-01', to: '2026-10-02', limit: '50' });
        const rangeIds = resRange.matches.map(m => m.id);
        assert.ok(!rangeIds.includes('ls_today_unrelated'), 'Today LiveScore match must not leak into historical from..to query');

        // Verify ?date=today&status=live filters out stale/future bogus live matches on dailyBoardCache fast-path
        dailyBoardCache.setReadyBoard(todayKey, [
            {
                id: 'bogus_future_live',
                league: { slug: 'eng.1', name: 'Premier League' },
                league_slug: 'eng.1',
                date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                status: { state: 'in', isLive: true, completed: false, clock: "15'" },
                home: { name: 'Future Home', score: 0 },
                away: { name: 'Future Away', score: 0 }
            },
            {
                id: 'real_live_now',
                league: { slug: 'eng.1', name: 'Premier League' },
                league_slug: 'eng.1',
                date: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
                status: { state: 'in', isLive: true, completed: false, clock: "45'" },
                home: { name: 'Live Home', score: 1 },
                away: { name: 'Live Away', score: 0 }
            }
        ]);
        const resLive = await invokeFixtures({ date: 'today', status: 'live', limit: '50' });
        const liveIds = resLive.matches.map(m => m.id);
        assert.deepEqual(liveIds, ['real_live_now'], 'Only genuinely active live matches should survive ?status=live');
    } finally {
        SoccerMatch.countDocuments = origCount;
        SoccerMatch.find = origFind;
        SoccerLeague.find = origLeagueFind;
        restoreHttps();
        dailyBoardCache.clearBoardCache();
    }
});

test('Frontend app.js, app-v9.js, and android/assets/app.js are mirrored and enforce strict client-side date guard', () => {
    const root = path.resolve(__dirname, '..');
    const appJs = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
    const appV9Js = fs.readFileSync(path.join(root, 'public/app-v9.js'), 'utf8');
    const androidAppJs = fs.readFileSync(path.join(root, 'android/assets/app.js'), 'utf8');

    assert.equal(appJs, appV9Js, 'public/app-v9.js must mirror public/app.js');
    assert.equal(appJs, androidAppJs, 'android/assets/app.js must mirror public/app.js');
    assert.ok(appJs.includes('function doesEventBelongToDateParam('), 'Client must define doesEventBelongToDateParam');

    // Extract and evaluate the two client helpers in a clean VM sandbox
    const startIdx = appJs.indexOf('function resolveExpectedUtcDateKey(');
    const endIdx = appJs.indexOf('let inFlightAllFixturesPromise');
    assert.ok(startIdx > 0 && endIdx > startIdx);
    const snippet = appJs.slice(startIdx, endIdx);
    const ctx = vm.createContext({});
    vm.runInContext(snippet, ctx);

    const nowMs = Date.parse('2026-11-27T01:00:00.000Z');
    assert.equal(ctx.resolveExpectedUtcDateKey('today', nowMs), '20261127');
    assert.equal(ctx.resolveExpectedUtcDateKey('yesterday', nowMs), '20261126');
    assert.equal(ctx.doesEventBelongToDateParam({
        date: '2026-11-26T20:00:00.000Z',
        status: { state: 'post', completed: true, detail: 'FT' }
    }, 'today', nowMs), false);
    assert.equal(ctx.doesEventBelongToDateParam({
        date: '2026-11-26T23:45:00.000Z',
        status: { state: 'in', isLive: true, completed: false, clock: "60'" }
    }, 'today', nowMs), true);
    assert.equal(ctx.doesEventBelongToDateParam({
        date: '2026-11-27T18:00:00.000Z',
        status: { state: 'pre', isLive: false, completed: false }
    }, 'today', nowMs), true);
});
