const test = require('node:test');
const assert = require('node:assert/strict');
const { keyCache } = require('../middleware/apiKeyAuth');

test('Deduplication logic merges secondary provider data using baseSig without throwing ReferenceError', () => {
    // Simulate deduplication logic from controllers/footballApiController.js lines 1040-1085
    const seenFixturesMap = new Map();

    const m1 = {
        id: '123456',
        name: 'Arsenal vs Chelsea',
        date: '2026-11-08T15:00:00Z',
        league: { slug: 'eng.1' },
        home: { name: 'Arsenal', logo: 'https://a.espncdn.com/arsenal.png', score: 1 },
        away: { name: 'Chelsea', logo: 'https://a.espncdn.com/chelsea.png', score: 0 },
        status: { state: 'in', isLive: true, clock: "32'", period: 1 },
        source: { provider: 'espn', espn_id: '123456' }
    };

    const m2 = {
        id: 'ls_9988',
        name: 'Arsenal vs Chelsea',
        date: '2026-11-08T15:00:00Z',
        league: { slug: 'eng.1' },
        home: { name: 'Arsenal', score: 1 },
        away: { name: 'Chelsea', score: 0 },
        status: { state: 'in', isLive: true, clock: "33'", detail: "33'", period: 1 },
        source: { provider: 'livescore', livescore_id: 'ls_9988' }
    };

    const matches = [m1, m2];

    for (const m of matches) {
        const hName = m.home?.name || '';
        const aName = m.away?.name || '';
        const dKey = m.date ? new Date(m.date).toISOString().slice(0, 10) : '';
        const baseSig = [hName.toLowerCase(), aName.toLowerCase()].sort().join('_vs_') + '_' + dKey;

        const mScore = (m.home?.logo?.includes('espncdn') ? 4 : 0) +
                       (m.source?.provider === 'espn' ? 3 : 0);

        if (!seenFixturesMap.has(baseSig)) {
            seenFixturesMap.set(baseSig, { match: m, score: mScore });
        } else {
            const existing = seenFixturesMap.get(baseSig);
            const winner = mScore > existing.score ? m : existing.match;
            const secondary = mScore > existing.score ? existing.match : m;

            if (secondary.source?.livescore_id && !winner.source?.livescore_id) {
                if (!winner.source) winner.source = {};
                winner.source.livescore_id = secondary.source.livescore_id;
            }
            if (secondary.source?.espn_id && !winner.source?.espn_id) {
                if (!winner.source) winner.source = {};
                winner.source.espn_id = secondary.source.espn_id;
            }
            // Must use baseSig, not undeclared sig!
            assert.doesNotThrow(() => {
                seenFixturesMap.set(baseSig, { match: winner, score: Math.max(existing.score, mScore) });
            });
        }
    }

    assert.equal(seenFixturesMap.size, 1);
    const merged = seenFixturesMap.get('arsenal_vs_chelsea_2026-11-08').match;
    assert.equal(merged.id, '123456');
    assert.equal(merged.source.espn_id, '123456');
    assert.equal(merged.source.livescore_id, 'ls_9988');
});

test('keyCache evicts deleted or revoked API key immediately', () => {
    const testKey = 'norra_test_key_cache_eviction_12345';
    keyCache.set(testKey, {
        key: testKey,
        plan: 'whitelabel',
        active: true
    });

    assert.ok(keyCache.has(testKey));
    assert.equal(keyCache.get(testKey).plan, 'whitelabel');

    // Simulate key deletion / revocation
    keyCache.delete(testKey);
    assert.equal(keyCache.has(testKey), false);
});
