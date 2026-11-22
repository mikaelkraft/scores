const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dailyBoardCache = require('../services/dailyBoardCache');

test('dailyBoardCache stores render-ready board and filters by status in memory', () => {
    dailyBoardCache.clearBoardCache();
    const dateKey = '20261122';
    const sampleMatches = [
        {
            id: '1810740',
            league_slug: 'esp.1',
            league: { slug: 'esp.1', name: 'Spanish La Liga', country: 'Spain' },
            date: '2026-11-22T13:00:00.000Z',
            scoreboard_date: dateKey,
            home: { name: 'Barcelona', score: 0 },
            away: { name: 'Villarreal', score: 2 },
            status: { state: 'in', isLive: true, completed: false, clock: "44'", detail: "44'" }
        },
        {
            id: '1810743',
            league_slug: 'esp.1',
            league: { slug: 'esp.1', name: 'Spanish La Liga', country: 'Spain' },
            date: '2026-11-22T15:15:00.000Z',
            scoreboard_date: dateKey,
            home: { name: 'Racing Santander', score: null },
            away: { name: 'Real Sociedad', score: null },
            status: { state: 'pre', isLive: false, completed: false, clock: '', detail: 'Scheduled' }
        },
        {
            id: '1810799',
            league_slug: 'eng.1',
            league: { slug: 'eng.1', name: 'Premier League', country: 'England' },
            date: '2026-11-22T10:30:00.000Z',
            scoreboard_date: dateKey,
            home: { name: 'Arsenal', score: 3 },
            away: { name: 'Chelsea', score: 1 },
            status: { state: 'post', isLive: false, completed: true, clock: 'FT', detail: 'FT' }
        }
    ];

    dailyBoardCache.setReadyBoard(dateKey, sampleMatches);
    const allBoard = dailyBoardCache.getReadyBoard(dateKey, { status: 'all' });
    assert.ok(allBoard);
    assert.equal(allBoard.matches.length, 3);

    const liveBoard = dailyBoardCache.getReadyBoard(dateKey, { status: 'live' });
    assert.equal(liveBoard.matches.length, 1);
    assert.equal(liveBoard.matches[0].id, '1810740');

    const finBoard = dailyBoardCache.getReadyBoard(dateKey, { status: 'finished' });
    assert.equal(finBoard.matches.length, 1);
    assert.equal(finBoard.matches[0].id, '1810799');

    const schedBoard = dailyBoardCache.getReadyBoard(dateKey, { status: 'scheduled' });
    assert.equal(schedBoard.matches.length, 1);
    assert.equal(schedBoard.matches[0].id, '1810743');
});

test('dailyBoardCache.patchLiveMatchesInBoard preserves canonical league_slug (esp.1) during HT updates', () => {
    dailyBoardCache.clearBoardCache();
    const dateKey = '20261122';
    dailyBoardCache.setReadyBoard(dateKey, [
        {
            id: '1810740',
            league_slug: 'esp.1',
            league: { slug: 'esp.1', name: 'Spanish La Liga', country: 'Spain' },
            date: '2026-11-22T13:00:00.000Z',
            scoreboard_date: dateKey,
            home: { name: 'Barcelona', score: 0 },
            away: { name: 'Villarreal', score: 2 },
            status: { state: 'in', isLive: true, completed: false, clock: "44'", detail: "44'" }
        }
    ]);

    // Simulate live feed sending HT update with degraded/generic league slug
    dailyBoardCache.patchLiveMatchesInBoard(dateKey, [
        {
            id: '1810740',
            league_slug: 'other',
            league: { slug: 'other', name: 'Spain', country: '' },
            date: '2026-11-22T13:00:00.000Z',
            home: { name: 'Barcelona', score: 1 },
            away: { name: 'Villarreal', score: 2 },
            status: { state: 'in', isLive: true, completed: false, clock: 'HT', detail: 'HT' }
        }
    ]);

    const board = dailyBoardCache.getReadyBoard(dateKey);
    assert.equal(board.matches.length, 1);
    assert.equal(board.matches[0].league.slug, 'esp.1', 'canonical esp.1 slug must never be overwritten by other');
    assert.equal(board.matches[0].league_slug, 'esp.1');
    assert.equal(board.matches[0].home.score, 1);
    assert.equal(board.matches[0].status.clock, 'HT');
});

test('dailyBoardCache.hasActiveMatchWindow detects active kickoff windows and backs off when idle', () => {
    dailyBoardCache.clearBoardCache();
    const dateKey = '20261122';
    const kickoffIso = '2026-11-22T15:00:00.000Z';
    dailyBoardCache.setReadyBoard(dateKey, [
        {
            id: 'sched1',
            league_slug: 'esp.1',
            league: { slug: 'esp.1', name: 'Spanish La Liga', country: 'Spain' },
            date: kickoffIso,
            scoreboard_date: dateKey,
            home: { name: 'Osasuna', score: null },
            away: { name: 'Malaga', score: null },
            status: { state: 'pre', isLive: false, completed: false }
        }
    ]);

    // 2 hours before kickoff -> idle
    assert.equal(dailyBoardCache.hasActiveMatchWindow(Date.parse('2026-11-22T13:00:00.000Z'), dateKey), false);
    // 3 minutes before kickoff -> active window
    assert.equal(dailyBoardCache.hasActiveMatchWindow(Date.parse('2026-11-22T14:57:00.000Z'), dateKey), true);
    // 60 minutes after kickoff -> active window
    assert.equal(dailyBoardCache.hasActiveMatchWindow(Date.parse('2026-11-22T16:00:00.000Z'), dateKey), true);
    // 3 hours after kickoff (past 135m window) -> idle
    assert.equal(dailyBoardCache.hasActiveMatchWindow(Date.parse('2026-11-22T18:00:00.000Z'), dateKey), false);
});

test('dailyBoardCache.getNextWatSyncDelayMs computes next WAT (UTC+1) schedule slot accurately', () => {
    // 08:30 WAT = 07:30 UTC -> next slot is 09:00 WAT (30 minutes = 1,800,000 ms)
    const nowMs = Date.parse('2026-11-22T07:30:00.000Z');
    const info = dailyBoardCache.getNextWatSyncDelayMs(nowMs);
    assert.equal(info.delayMs, 30 * 60 * 1000);
    assert.equal(info.label, '09:00 WAT');
});

test('Frontend fixes: competitionName hoisted before H2H synthesis, unified live badge sync, skeleton loading & smooth drawer-tabs', () => {
    const appJs = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
    const stylesCss = fs.readFileSync(path.join(__dirname, '../public/styles.css'), 'utf8');
    const indexHtml = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');

    const declIdx = appJs.indexOf('let competitionName =');
    const h2hUseIdx = appJs.indexOf("competition: competitionName || 'Match'");
    assert.ok(declIdx > 0, 'competitionName must be declared in app.js');
    assert.ok(h2hUseIdx > 0, 'H2H synthesis must reference competitionName');
    assert.ok(declIdx < h2hUseIdx, 'competitionName MUST be declared before H2H synthesis to avoid TDZ ReferenceError');

    assert.match(appJs, /function syncAllLiveCountBadges\(/, 'app.js must centralize live badge updates in syncAllLiveCountBadges');
    assert.match(appJs, /renderFixturesSkeleton\(/, 'app.js must use renderFixturesSkeleton');
    assert.match(appJs, /el\.innerHTML\s*=\s*renderFixturesSkeleton\(/, 'setLoading must inject shimmer skeleton into #fixtures-loading');
    assert.doesNotMatch(indexHtml, /id="fixtures-loading"[^>]*><span class="loader"><\/span><p>Loading fixtures/, 'index.html should not show bare Loading fixtures text');
    assert.match(stylesCss, /\.drawer-tabs\s*\{[^}]*-webkit-overflow-scrolling:\s*touch/s, '.drawer-tabs must enable smooth mobile touch scrolling');
    assert.match(stylesCss, /\.drawer-tabs\s*\{[^}]*touch-action:\s*pan-x/s, '.drawer-tabs must declare touch-action: pan-x');
});
