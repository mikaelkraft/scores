const test = require('node:test');
const assert = require('node:assert/strict');
const ss = require('../services/sportScoreService');

test('SportScore Aggregator resolves short club names to canonical slugs', () => {
    assert.ok(ss.generateTeamSlugVariants('Brighton').includes('brighton-hove-albion'));
    assert.ok(ss.generateTeamSlugVariants('Brighton & Hove Albion').includes('brighton-hove-albion'));
    assert.ok(ss.generateTeamSlugVariants('Wolves').includes('wolverhampton-wanderers'));
    assert.ok(ss.generateTeamSlugVariants('Spurs').includes('tottenham-hotspur'));
    assert.ok(ss.generateTeamSlugVariants('PSG').includes('paris-saint-germain'));
    assert.ok(ss.generateTeamSlugVariants('Inter').includes('inter-milan'));
    assert.ok(ss.generateTeamSlugVariants('Hull').includes('hull-city'));
});

test('SportScore Aggregator converts SportScore lineups into standard rosters shape', () => {
    const rosters = ss.lineupsToRosters({
        home: 'Hull City',
        away: 'Brighton Hove Albion',
        home_logo: 'https://img.thesports.com/h.png',
        away_logo: 'https://img.thesports.com/a.png',
        lineups: {
            confirmed: true,
            home_formation: '4-2-3-1',
            away_formation: '4-3-3',
            home_xi: [{ name: 'Lewie Coyle', number: 2, position: 'D', captain: true, rating: '7.4' }],
            away_xi: [{ name: 'Lewis Dunk', number: 5, position: 'D', captain: true, rating: '6.9' }]
        }
    });

    assert.equal(rosters.length, 2);
    assert.equal(rosters[0].homeAway, 'home');
    assert.equal(rosters[0].formation, '4-2-3-1');
    assert.equal(rosters[0].roster[0].athlete.displayName, 'Lewie Coyle');
    assert.equal(rosters[0].roster[0].captain, true);
    assert.equal(rosters[1].homeAway, 'away');
    assert.equal(rosters[1].formation, '4-3-3');
});

test('SportScore Aggregator fetches real Hull City vs Brighton H2H even with short name "Brighton"', async () => {
    const h2h = await ss.fetchSportScoreH2H({ homeName: 'Hull City', awayName: 'Brighton' });
    assert.ok(h2h, 'Expected SportScore H2H result for Hull City vs Brighton');
    assert.ok(Array.isArray(h2h.matches) && h2h.matches.length >= 10, `Expected >=10 H2H meetings, got ${h2h?.matches?.length}`);
    assert.ok(h2h.summary.meetings >= 10);
});
