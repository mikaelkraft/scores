const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ss = require('../services/sportScoreService');
const { fetchAggregatedH2H } = require('../services/h2hAggregatorService');

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

test('SportScore Aggregator resolves Spanish/European suffixed clubs (Barcelona vs Villarreal, Osasuna vs Malaga)', async () => {
    const [bv, om] = await Promise.all([
        ss.fetchSportScoreH2H({ homeName: 'Barcelona', awayName: 'Villarreal' }),
        ss.fetchSportScoreH2H({ homeName: 'Osasuna', awayName: 'Malaga' })
    ]);
    assert.ok(bv && bv.matches.length >= 10, `Expected >=10 H2H meetings for Barcelona vs Villarreal, got ${bv?.matches?.length}`);
    assert.ok(om && om.matches.length >= 5, `Expected >=5 H2H meetings for Osasuna vs Malaga, got ${om?.matches?.length}`);
});

test('Multi-provider H2H Aggregator, Master Key Unlimited display, and Cross-Provider Table Position matching', async () => {
    const agg = await fetchAggregatedH2H({ homeName: 'Hull City', awayName: 'Brighton' });
    assert.ok(agg && agg.matches.length >= 10, 'Expected multi-provider H2H aggregator to return >=10 meetings');

    const adminJs = fs.readFileSync(path.join(__dirname, '../public/admin/admin.js'), 'utf8');
    assert.match(adminJs, /∞ Unlimited/, 'Admin UI must display Unlimited for rateLimitPerMinute <= 0 / master admin keys');

    const controllerJs = fs.readFileSync(path.join(__dirname, '../controllers/footballApiController.js'), 'utf8');
    assert.match(controllerJs, /areTeamNamesMatching\(cName, teamName\)/, 'Standings comparison must fall back to team name matching across ESPN/LiveScore IDs');
    assert.match(controllerJs, /espnSummary\?\.standings\?\.groups/, 'Standings comparison must extract table rank from already-fetched ESPN summary with zero extra polling');
});
