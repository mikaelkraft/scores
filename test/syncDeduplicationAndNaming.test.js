const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveLeagueSlug, normalizeTeamName, areTeamNamesMatching, getTeamCategory } = require('../services/soccerSyncService');

test('resolveLeagueSlug explicitly rejects NCAA basketball and college non-soccer events', () => {
    assert.equal(resolveLeagueSlug('NCAA Men\'s Basketball', 'College Basketball', 's:40~l:41'), null);
    assert.equal(resolveLeagueSlug('NCAAM Tournament', 'NCAA Division I', 's:40'), null);
    assert.equal(resolveLeagueSlug('Mens College Basketball', 'NCAA', 'ncaa.m.1'), null);
});

test('resolveLeagueSlug correctly resolves African continental and domestic premier competitions', () => {
    assert.equal(resolveLeagueSlug('CAF Champions League', 'Africa', 'caf.champions'), 'caf.champions');
    assert.equal(resolveLeagueSlug('TotalEnergies CAF CL', 'Africa', ''), 'caf.champions');
    assert.equal(resolveLeagueSlug('CAF Confederation Cup', 'Africa', 'caf.confed'), 'caf.confed');
    assert.equal(resolveLeagueSlug('Africa Cup of Nations', 'International', 'caf.nations'), 'caf.nations');
    assert.equal(resolveLeagueSlug('Nigeria Premier Football League', 'Nigeria', 'nga.1'), 'nga.1');
    assert.equal(resolveLeagueSlug('NPFL Matchday 8', 'Nigeria', ''), 'nga.1');
    assert.equal(resolveLeagueSlug('Egyptian Premier League', 'Egypt', 'egy.1'), 'egy.1');
    assert.equal(resolveLeagueSlug('Kenyan Premier League', 'Kenya', 'ken.1'), 'ken.1');
    assert.equal(resolveLeagueSlug('Ghana Premier League', 'Ghana', 'gha.1'), 'gha.1');
    assert.equal(resolveLeagueSlug('Uganda Premier League', 'Uganda', 'uga.1'), 'uga.1');
    assert.equal(resolveLeagueSlug('South African Premier Soccer League', 'South Africa', 'rsa.1'), 'rsa.1');
});

test('resolveLeagueSlug prevents non-English Premier Leagues from colliding with eng.1', () => {
    // Other nations with "Premier League" in their title must NEVER resolve to eng.1
    assert.equal(resolveLeagueSlug('Singapore Premier League', 'Singapore', 'sgp.1'), 'sgp.1');
    assert.equal(resolveLeagueSlug('Canadian Premier League', 'Canada', 'can.1'), 'can.1');
    assert.equal(resolveLeagueSlug('Bahraini Premier League', 'Bahrain', 'bhr.1'), 'bhr.1');
    assert.equal(resolveLeagueSlug('Scottish Premiership', 'Scotland', 'sco.1'), 'sco.1');
    assert.equal(resolveLeagueSlug('Kuwait Premier League', 'Kuwait', 'kwt.1'), 'kwt.1');
    assert.equal(resolveLeagueSlug('Russian Premier League', 'Russia', 'rus.1'), 'rus.1');
    assert.equal(resolveLeagueSlug('Ukrainian Premier League', 'Ukraine', 'ukr.1'), 'ukr.1');
});

test('resolveLeagueSlug correctly separates Women competitions', () => {
    assert.equal(resolveLeagueSlug('Barclays Women\'s Super League', 'England', 'eng.w.1'), 'eng.w.1');
    assert.equal(resolveLeagueSlug('NWSL Regular Season', 'United States', 'usa.w.1'), 'usa.w.1');
    assert.equal(resolveLeagueSlug('Liga F Femenina', 'Spain', 'esp.w.1'), 'esp.w.1');
    assert.equal(resolveLeagueSlug('Frauen-Bundesliga', 'Germany', 'ger.w.1'), 'ger.w.1');
    assert.equal(resolveLeagueSlug('D1 Arkema', 'France', 'fra.w.1'), 'fra.w.1');
    assert.equal(resolveLeagueSlug('Serie A Femminile', 'Italy', 'ita.w.1'), 'ita.w.1');
    assert.equal(resolveLeagueSlug('UEFA Women\'s Champions League', 'International', 'uefa.w.champions'), 'uefa.w.champions');
});

test('resolveLeagueSlug correctly differentiates youth, reserves, and lower tiers from eng.1', () => {
    // English Youth / Reserves (PL2 / U21)
    assert.equal(resolveLeagueSlug('Premier League 2 Division One', 'England', 'eng.u21'), 'eng.u21');
    assert.equal(resolveLeagueSlug('U21 Premier League Cup', 'England', ''), 'eng.u21');
    assert.equal(resolveLeagueSlug('Campionato Primavera 1', 'Italy', 'ita.primavera'), 'ita.primavera');

    // English Tier 5-8 non-league competitions with "Premier" in their names
    assert.equal(resolveLeagueSlug('Northern Premier League Premier Division', 'England', 'eng.northern'), 'eng.northern');
    assert.equal(resolveLeagueSlug('Southern Premier League', 'England', 'eng.southern'), 'eng.southern');
    assert.equal(resolveLeagueSlug('Isthmian Premier League', 'England', 'eng.isthmian'), 'eng.isthmian');
    assert.equal(resolveLeagueSlug('National League', 'England', 'eng.5'), 'eng.5');
    assert.equal(resolveLeagueSlug('EFL League Two', 'England', 'eng.4'), 'eng.4');
    assert.equal(resolveLeagueSlug('EFL League One', 'England', 'eng.3'), 'eng.3');
    assert.equal(resolveLeagueSlug('EFL Championship', 'England', 'eng.2'), 'eng.2');
});

test('resolveLeagueSlug accurately resolves Senior English Premier League and continental cups', () => {
    assert.equal(resolveLeagueSlug('English Premier League', 'England', 'eng.1'), 'eng.1');
    assert.equal(resolveLeagueSlug('Premier League', 'England', ''), 'eng.1');
    assert.equal(resolveLeagueSlug('USL Championship', 'United States', 'usa.usl.1'), 'usa.usl.1');
    assert.equal(resolveLeagueSlug('UEFA Champions League', 'International', 'uefa.champions'), 'uefa.champions');
    assert.equal(resolveLeagueSlug('UEFA Europa League', 'International', 'uefa.europa'), 'uefa.europa');
});

test('areTeamNamesMatching differentiates gender and age tiers cleanly', () => {
    // Women vs Men teams must NEVER match
    assert.equal(areTeamNamesMatching('Chelsea Women', 'Chelsea'), false);
    assert.equal(areTeamNamesMatching('Arsenal Women', 'Arsenal'), false);
    assert.equal(areTeamNamesMatching('Real Madrid Femenino', 'Real Madrid'), false);

    // Women aliases DO match each other
    assert.equal(areTeamNamesMatching('Chelsea Women', 'Chelsea Ladies'), true);
    assert.equal(areTeamNamesMatching('Arsenal Women', 'Arsenal WFC'), true);

    // Youth / Reserves vs Senior teams must NEVER match
    assert.equal(areTeamNamesMatching('Chelsea U21', 'Chelsea'), false);
    assert.equal(areTeamNamesMatching('Liverpool U23', 'Liverpool'), false);
    assert.equal(areTeamNamesMatching('Arsenal Reserves', 'Arsenal'), false);

    // Youth aliases DO match each other
    assert.equal(areTeamNamesMatching('Chelsea U21', 'Chelsea U-21'), true);

    // Distinct clubs sharing common words must NEVER collide
    assert.equal(areTeamNamesMatching('Bristol City', 'Bristol Rovers'), false);
    assert.equal(areTeamNamesMatching('Manchester United', 'Manchester City'), false);
});

test('areTeamNamesMatching accurately deduplicates teams between ESPN and LiveScore variants', () => {
    // Manchester United aliases
    assert.equal(areTeamNamesMatching('Manchester United', 'Man Utd'), true);
    assert.equal(areTeamNamesMatching('Man United', 'Manchester United FC'), true);

    // Tottenham aliases
    assert.equal(areTeamNamesMatching('Tottenham Hotspur', 'Spurs'), true);

    // Paris Saint-Germain aliases
    assert.equal(areTeamNamesMatching('Paris Saint-Germain', 'PSG'), true);

    // Atletico Madrid aliases
    assert.equal(areTeamNamesMatching('Atlético Madrid', 'Atl. Madrid'), true);

    // Wolves aliases
    assert.equal(areTeamNamesMatching('Wolverhampton Wanderers', 'Wolves'), true);

    // Non-matching teams do not collide
    assert.equal(areTeamNamesMatching('Chelsea', 'Arsenal'), false);
    assert.equal(areTeamNamesMatching('Real Madrid', 'Barcelona'), false);
});
