const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');

const {
    resolveLeagueSlug,
    inferCountryFromTeamNames,
    demoteToJuniorOrLowerTier,
    TARGET_LEAGUES
} = require('../services/soccerSyncService');

test('Free Developer Tier is strictly locked to 3 free leagues (eng.1, esp.1, nga.1)', () => {
    const controllerSource = fs.readFileSync('./controllers/footballApiController.js', 'utf8');
    const match = controllerSource.match(/const FREE_TIER_ALLOWED_LEAGUES = (\[[\s\S]*?\]);/);
    assert.ok(match, 'FREE_TIER_ALLOWED_LEAGUES array must be defined');
    const parsed = eval(match[1]);
    assert.deepEqual(parsed, ['eng.1', 'esp.1', 'nga.1']);

    const { PLAN_LIMITS } = require('../middleware/apiKeyAuth');
    assert.deepEqual(PLAN_LIMITS.free.allowedLeagues, ['eng.1', 'esp.1', 'nga.1']);

    // Verify docs reflect 3 free leagues
    const docsSource = fs.readFileSync('./public/docs/index.html', 'utf8');
    assert.match(docsSource, /3 free leagues \(<code>eng\.1<\/code> - Premier League, <code>esp\.1<\/code> - La Liga, <code>nga\.1<\/code> - NPFL\)/);
    assert.match(docsSource, /3 Free Leagues<br><small style="color:var\(--text-muted\);">\(eng\.1, esp\.1, nga\.1\)<\/small>/);

    // Verify index.html & pricing reflect 3 free leagues
    const indexSource = fs.readFileSync('./public/index.html', 'utf8');
    assert.match(indexSource, /3 Free Leagues \(Premier League, La Liga, NPFL\)/);

    const pricingSource = fs.readFileSync('./public/pricing/index.html', 'utf8');
    assert.match(pricingSource, /3 Free Leagues \(EPL, La Liga, NPFL\)/);
});

test("Japan Women's WE League resolves to jpn.w.1 and does not collide with Liga MX Femenil", () => {
    // 1. Registered in TARGET_LEAGUES
    const weLeague = TARGET_LEAGUES.find(l => l.slug === 'jpn.w.1');
    assert.ok(weLeague, 'jpn.w.1 must be present in TARGET_LEAGUES');
    assert.equal(weLeague.country, 'Japan');

    // 2. resolveLeagueSlug correctly resolves Japan WE League
    assert.equal(resolveLeagueSlug("Women's WE League", 'Japan', 'we-league'), 'jpn.w.1');
    assert.equal(resolveLeagueSlug("Japan WE League", 'Japan', 'jpn.w.1'), 'jpn.w.1');
    assert.equal(resolveLeagueSlug("WE League", 'Japan', ''), 'jpn.w.1');

    // 3. inferCountryFromTeamNames maps Japanese women clubs to jpn.w.1 even if incoming slug is mex.w.1
    assert.equal(inferCountryFromTeamNames('INAC Kobe Leonessa W', 'Cerezo Osaka Sakai W', 'mex.w.1'), 'jpn.w.1');
    assert.equal(inferCountryFromTeamNames('Urawa Reds Ladies', 'Tokyo Verdy Beleza', 'mex.w.1'), 'jpn.w.1');
    assert.equal(inferCountryFromTeamNames('AS Elfen Saitama W', 'Cerezo Osaka Sakai W', 'w.international'), 'jpn.w.1');
});

test('Bolivia Primera and Copa Bolivia resolve cleanly without collapsing into Liga de Expansión or 2nd.1', () => {
    // 1. resolveLeagueSlug resolves Copa Bolivia even when headline contains 2nd Leg
    assert.equal(resolveLeagueSlug('Copa Bolivia, Semifinals', '2nd Leg - Always Ready win 2-0 on aggregate', 's:600~l:23284~e:401930228'), 'bol.copa');
    assert.equal(resolveLeagueSlug('Bolivian Liga Profesional', 'Bolivia', 'bol.1'), 'bol.1');

    // 2. inferCountryFromTeamNames maps Bolivian clubs
    assert.equal(inferCountryFromTeamNames('Always Ready', 'Independiente Petrolero', 'bol.copa'), 'bol.copa');
    assert.equal(inferCountryFromTeamNames('The Strongest', 'Bolivar', '2nd.1'), 'bol.1');

    // 3. demoteToJuniorOrLowerTier never produces 2nd.1 or 2nd.2
    assert.equal(demoteToJuniorOrLowerTier('2nd.1', 'Always Ready', 'Independiente Petrolero'), '2nd.1');
});

test('Liga de Expansión MX resolves to mex.2 with country Mexico, never International', () => {
    assert.equal(resolveLeagueSlug('Liga de Expansión MX, Semifinals', '2nd Leg - Leones Negros win 3-1', 's:600~l:23284~e:401930229'), 'mex.2');
    assert.equal(inferCountryFromTeamNames('Leones Negros', 'Club Atlético Morelia', '2nd.1'), 'mex.2');
    assert.equal(inferCountryFromTeamNames('Piratas', 'Atletico La Paz', '1st.1'), 'mex.2');
});

test('Foreign Country Fallback rejects stage names like 1st Leg, 2nd Leg, Semifinals', () => {
    // If a match has no country and only a leg/stage descriptor, it should never produce 1st.1 or 2nd.1
    const leg1 = resolveLeagueSlug('Cup', '1st Leg - Aggregate 0-0', '');
    assert.notEqual(leg1, '1st.1');

    const leg2 = resolveLeagueSlug('Cup', '2nd Leg - Aggregate 3-1', '');
    assert.notEqual(leg2, '2nd.1');
});
