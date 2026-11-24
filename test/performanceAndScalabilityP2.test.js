'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');

const SoccerMatch = require('../models/soccerMatch');
const { usageBuffer, recordApiKeyUsage, flushApiKeyUsage } = require('../middleware/apiKeyAuth');
const { liveStreamHub, MAX_SSE_CLIENTS } = require('../controllers/footballApiController');

const ROOT = path.join(__dirname, '..');

test.after(async () => {
    try {
        await mongoose.disconnect();
    } catch (_) {}
});

test('P2-1: liveStreamHub computes score deltas, emits FT match_finished on disappearance, and prunes previousStateMap', () => {
    liveStreamHub.previousStateMap.clear();

    const m1 = {
        id: 'evt_1001',
        league_slug: 'eng.1',
        home: { displayName: 'Arsenal', score: 1, logo: '' },
        away: { displayName: 'Chelsea', score: 0, logo: '' },
        status: { clock: "52'", state: 'in' }
    };

    liveStreamHub.seedMatches([m1]);
    assert.equal(liveStreamHub.previousStateMap.size, 1);

    // Goal scored: 1-0 -> 2-0
    const goalDeltas = liveStreamHub.computeDeltas([
        { ...m1, home: { ...m1.home, score: 2 }, status: { clock: "60'", state: 'in' } }
    ]);
    assert.equal(goalDeltas.length, 1);
    assert.equal(goalDeltas[0].isGoal, true);
    assert.equal(goalDeltas[0].scoringTeam, 'Arsenal');
    assert.equal(goalDeltas[0].homeScore, 2);

    // Match leaves live feed -> emits FT / matchFinished delta and prunes map
    const finishDeltas = liveStreamHub.computeDeltas([]);
    assert.equal(finishDeltas.length, 1);
    assert.equal(finishDeltas[0].matchFinished, true);
    assert.equal(finishDeltas[0].clock, 'FT');
    assert.equal(finishDeltas[0].state, 'post');
    assert.equal(liveStreamHub.previousStateMap.size, 0);
});

test('P2-1: liveStreamHub starts single shared timer for multiple clients, enforces MAX_SSE_CLIENTS, and stops timer when empty', () => {
    assert.ok(MAX_SSE_CLIENTS >= 100);
    const c1 = { isAlive: true, sendEvent() {} };
    const c2 = { isAlive: true, sendEvent() {} };

    assert.equal(liveStreamHub.addClient(c1), true);
    const firstTimer = liveStreamHub.timer;
    assert.ok(firstTimer, 'Shared timer should start on first client');

    assert.equal(liveStreamHub.addClient(c2), true);
    assert.equal(liveStreamHub.timer, firstTimer, 'Second client must reuse the same shared timer');

    liveStreamHub.removeClient(c1);
    assert.ok(liveStreamHub.timer, 'Timer stays active while c2 is connected');

    liveStreamHub.removeClient(c2);
    assert.equal(liveStreamHub.timer, null, 'Timer stops automatically when last client disconnects');
});

test('P2-2: SoccerMatch defines targeted event_id & team indexes and drops redundant/bloating indexes', () => {
    const indexes = SoccerMatch.schema.indexes();
    const names = indexes.map(([, opts]) => opts && opts.name).filter(Boolean);

    assert.ok(names.includes('soccer_match_event_id'), 'Expected soccer_match_event_id index');
    assert.ok(names.includes('soccer_match_home_team_date'), 'Expected soccer_match_home_team_date index');
    assert.ok(names.includes('soccer_match_away_team_date'), 'Expected soccer_match_away_team_date index');

    assert.equal(names.includes('soccer_match_league_slug'), false, 'Redundant league_slug index should be removed');
    assert.equal(names.includes('soccer_match_stats_date_desc'), false, 'Bloating home.stats index should be removed');
});

test('P2-2: ApiKey usage tracking buffers increments in memory and skips virtual master key', () => {
    usageBuffer.clear();
    recordApiKeyUsage('norra_master_internal_key');
    assert.equal(usageBuffer.size, 0);

    const fakeId = '507f1f77bcf86cd799439011';
    recordApiKeyUsage(fakeId);
    recordApiKeyUsage(fakeId);
    recordApiKeyUsage(fakeId);

    assert.equal(usageBuffer.size, 1);
    assert.equal(usageBuffer.get(fakeId).count, 3);
    assert.equal(typeof flushApiKeyUsage, 'function');
    usageBuffer.clear();
});

test('P2-2 & P2-3: index.js has liveSyncInFlight mutex, graceful shutdown, and immutable /assets/crests caching', () => {
    const src = fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8');
    assert.match(src, /let liveSyncInFlight = false/);
    assert.match(src, /process\.once\('SIGTERM'/);
    assert.match(src, /flushApiKeyUsage\(\)/);
    assert.match(src, /\/public\/crests\//);
    assert.match(src, /max-age=31536000, immutable/);
});

test('P2-3: Frontend SSE-aware polling, hidden-tab timer guard, sw.js shared-shell cache, and legacy v8 cleanup', () => {
    const appSrc = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
    assert.match(appSrc, /state\.sseConnected = true/);
    assert.match(appSrc, /const sseHealthy = Boolean/);
    assert.match(appSrc, /state\.matchTimer = window\.setInterval\(\(\) => \{\s*if \(document\.hidden\) return;/);

    const swSrc = fs.readFileSync(path.join(ROOT, 'public', 'sw.js'), 'utf8');
    assert.ok(swSrc.includes('/assets/shared-shell.js'), 'sw.js should precache /assets/shared-shell.js');

    assert.equal(fs.existsSync(path.join(ROOT, 'public', 'app-v8.js')), false, 'Dead public/app-v8.js should be removed');
    assert.equal(fs.existsSync(path.join(ROOT, 'public', 'styles-v8.css')), false, 'Dead public/styles-v8.css should be removed');
});
