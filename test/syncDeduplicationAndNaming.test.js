const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveLeagueSlug, normalizeTeamName, areTeamNamesMatching, getTeamCategory, getMatchTier } = require('../services/soccerSyncService');

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
    assert.equal(resolveLeagueSlug('Tanzanian Premier League', 'Tanzania', 'tza.1'), 'tza.1');
    assert.equal(resolveLeagueSlug('Premier League', 'Tanzania', '26057'), 'tza.1');
    assert.equal(resolveLeagueSlug('Mbeya City vs Singida Black Stars', 'Premier League', ''), 'tza.1');
    assert.equal(resolveLeagueSlug('NBC Premier League', 'Tanzania', ''), 'tza.1');
    assert.equal(resolveLeagueSlug('Singapore Premier League', 'Singapore', 'sgp.1'), 'sgp.1');
    assert.equal(resolveLeagueSlug('Canadian Premier League', 'Canada', 'can.1'), 'can.1');
    assert.equal(resolveLeagueSlug('Bahraini Premier League', 'Bahrain', 'bhr.1'), 'bhr.1');
    assert.equal(resolveLeagueSlug('Scottish Premiership', 'Scotland', 'sco.1'), 'sco.1');
    assert.equal(resolveLeagueSlug('Kuwait Premier League', 'Kuwait', 'kwt.1'), 'kwt.1');
    assert.equal(resolveLeagueSlug('Russian Premier League', 'Russia', 'rus.1'), 'rus.1');
    assert.equal(resolveLeagueSlug('Ukrainian Premier League', 'Ukraine', 'ukr.1'), 'ukr.1');
    assert.equal(resolveLeagueSlug('Botswana Premier League', 'Botswana', 'bwa.1'), 'bwa.1');
    assert.equal(resolveLeagueSlug('Jamaica Premier League', 'Jamaica', 'jam.1'), 'jam.1');
    assert.equal(resolveLeagueSlug('Israeli Premier League', 'Israel', 'isr.1'), 'isr.1');
});

test('resolveLeagueSlug correctly separates Women competitions', () => {
    assert.equal(resolveLeagueSlug('Barclays Women\'s Super League', 'England', 'eng.w.1'), 'eng.w.1');
    assert.equal(resolveLeagueSlug('Women\'s Super League', 'England', ''), 'eng.w.1');
    assert.equal(resolveLeagueSlug('WSL Players Cup, League Phase', '', ''), 'eng.w.cup');
    assert.equal(resolveLeagueSlug('Women\'s FA Cup, First Round', '', ''), 'eng.w.fa');
    assert.equal(resolveLeagueSlug('A-League Women', '', ''), 'aus.w.1');
    assert.equal(resolveLeagueSlug('NWSL Regular Season', 'United States', 'usa.w.1'), 'usa.w.1');
    assert.equal(resolveLeagueSlug('Liga F Femenina', 'Spain', 'esp.w.1'), 'esp.w.1');
    assert.equal(resolveLeagueSlug('Frauen-Bundesliga', 'Germany', 'ger.w.1'), 'ger.w.1');
    assert.equal(resolveLeagueSlug('D1 Arkema', 'France', 'fra.w.1'), 'fra.w.1');
    assert.equal(resolveLeagueSlug('Serie A Femminile', 'Italy', 'ita.w.1'), 'ita.w.1');
    assert.equal(resolveLeagueSlug('UEFA Women\'s Champions League', 'International', 'uefa.w.champions'), 'uefa.w.champions');

    // Foreign Women's Super Leagues must NEVER be lumped into English WSL or International w.other
    assert.equal(resolveLeagueSlug('Swiss Women\'s Super League', 'Switzerland', 'sui.w.1'), 'sui.w.1');
    assert.equal(resolveLeagueSlug('Super League Women', 'Switzerland', ''), 'sui.w.1');
    assert.equal(resolveLeagueSlug('Belgian Women\'s Super League', 'Belgium', 'bel.w.1'), 'bel.w.1');
    assert.equal(resolveLeagueSlug('Scottish Women\'s Premier League', 'Scotland', 'sco.w.1'), 'sco.w.1');
    assert.equal(resolveLeagueSlug('Brasileirão Feminino', 'Brazil', 'bra.w.1'), 'bra.w.1');
    assert.equal(resolveLeagueSlug('Damallsvenskan', 'Sweden', 'swe.w.1'), 'swe.w.1');
    assert.equal(resolveLeagueSlug('Toppserien Women', 'Norway', 'nor.w.1'), 'nor.w.1');

    // Unmapped women's games route cleanly to w.international instead of dumping under WSL
    assert.equal(resolveLeagueSlug('International Friendly Women', 'International', ''), 'w.international');
});

test('resolveLeagueSlug correctly differentiates youth, reserves, and lower tiers from eng.1', () => {
    // English Youth / Reserves (PL2 / U21)
    assert.equal(resolveLeagueSlug('Premier League 2 Division One', 'England', 'eng.u21'), 'eng.u21');
    assert.equal(resolveLeagueSlug('U21 Premier League Cup', 'England', ''), 'eng.u21');
    assert.equal(resolveLeagueSlug('Campionato Primavera 1', 'Italy', 'ita.primavera'), 'ita.primavera');
    assert.equal(resolveLeagueSlug('UEFA Youth League', 'International', 'uefa.youth'), 'uefa.youth');
    assert.equal(resolveLeagueSlug('UEFA Youth League - Group Stage', 'Europe', ''), 'uefa.youth');
    assert.equal(resolveLeagueSlug('FIFA U-20 World Cup', 'International', 'fifa.u20'), 'fifa.u20');

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

    // Como & Venezia foundation year and FC variations
    assert.equal(areTeamNamesMatching('Como 1907', 'Como'), true);
    assert.equal(areTeamNamesMatching('Venezia FC', 'Venezia'), true);

    // Non-matching teams do not collide
    assert.equal(areTeamNamesMatching('Chelsea', 'Arsenal'), false);
    assert.equal(areTeamNamesMatching('Real Madrid', 'Barcelona'), false);

    // QPR vs Queens Park Rangers
    assert.equal(areTeamNamesMatching('QPR', 'Queens Park Rangers'), true);
    assert.equal(areTeamNamesMatching('QPR', 'Burnley'), false);

    // Bodoe/Glimt vs Bodo/Glimt
    assert.equal(areTeamNamesMatching('Bodoe/Glimt', 'Bodo/Glimt'), true);
});

test('resolveLeagueSlug correctly resolves youth tournaments and AFC Champions League Two', () => {
    // AFC Champions League Two must NEVER resolve to English League Two (eng.4)
    assert.equal(resolveLeagueSlug('AFC Champions League Two: Group D', 'Asia', 'afc-champions-league-two-group-d'), 'afc.cup');
    assert.equal(resolveLeagueSlug('ACL Two Group Stage', 'Asia', ''), 'afc.cup');

    // UEFA Youth League stages must NEVER resolve to FIFA U-20 World Cup (fifa.u20)
    assert.equal(resolveLeagueSlug('UEFA Youth League - Champions League Path', 'Europe', 'champions-league-path-2024'), 'uefa.youth');
    assert.equal(resolveLeagueSlug('UEFA Youth League - Domestic Champions Path', 'Europe', 'domestic-champions-path-2024'), 'uefa.youth');
    assert.equal(resolveLeagueSlug('Premier League U18', 'England', ''), 'eng.u18');
});

test('normalizeTeamName accurately strips foundation years and club noise', () => {
    assert.equal(normalizeTeamName('Como 1907'), 'como');
    assert.equal(normalizeTeamName('Venezia FC'), 'venezia');
    assert.equal(normalizeTeamName('Schalke 04'), 'schalke');
    assert.equal(normalizeTeamName('Bayer 04 Leverkusen'), 'bayerleverkusen');
    assert.equal(normalizeTeamName('Hannover 96'), 'hannover');
    assert.equal(normalizeTeamName('Como Calcio 1907'), 'como');
    assert.equal(normalizeTeamName('AC Milan'), 'acmilan');
    assert.equal(normalizeTeamName('QPR'), 'queensparkrangers');
    assert.equal(normalizeTeamName('Queens Park Rangers'), 'queensparkrangers');
    assert.equal(normalizeTeamName('Bodoe/Glimt'), 'bodoglimt');
    assert.equal(normalizeTeamName('Bodo/Glimt'), 'bodoglimt');
});

test('synthesizeMatchTelemetry returns authentic empty statistics without synthesizing dummy stats', () => {
    const { synthesizeMatchTelemetry } = require('../services/soccerSerializer');
    const result = synthesizeMatchTelemetry({
        home: { name: 'Galatasaray' },
        away: { name: 'VfB Stuttgart' },
        status: { state: 'in' }
    });
    assert.equal(result.isDerivedTelemetry, false);
    assert.equal(result.teams[0].statistics.length, 0);
    assert.equal(result.teams[1].statistics.length, 0);
});

test('Senior Champions League matches NEVER collide or overwrite Youth League matches', () => {
    // 1. Validate getMatchTier differentiates senior vs youth competitions even if club names are stripped
    const seniorGalaTier = getMatchTier('Galatasaray', 'VfB Stuttgart', 'uefa.champions');
    const youthGalaTier = getMatchTier('Galatasaray U19', 'VfB Stuttgart U19', 'uefa.youth');
    const youthGalaStrippedTier = getMatchTier('Galatasaray', 'VfB Stuttgart', 'uefa.youth');

    assert.equal(seniorGalaTier, 'm_s');
    assert.equal(youthGalaTier, 'm_y');
    assert.equal(youthGalaStrippedTier, 'm_y');

    const seniorSportingTier = getMatchTier('Shakhtar Donetsk', 'Sporting CP', 'uefa.champions');
    const youthSportingTier = getMatchTier('Shakhtar Donetsk U19', 'Sporting CP U19', 'uefa.youth');

    assert.equal(seniorSportingTier, 'm_s');
    assert.equal(youthSportingTier, 'm_y');

    // 2. Validate deduplication signatures in sync and API controllers never collide
    const dKey = '20261103';
    const seniorGalaSig = [normalizeTeamName('Galatasaray'), normalizeTeamName('VfB Stuttgart')].sort().join('_vs_') + '_' + dKey + '_' + seniorGalaTier;
    const youthGalaSig = [normalizeTeamName('Galatasaray U19'), normalizeTeamName('VfB Stuttgart U19')].sort().join('_vs_') + '_' + dKey + '_' + youthGalaTier;

    assert.notEqual(seniorGalaSig, youthGalaSig);
    assert.equal(seniorGalaSig, 'galatasaray_vs_vfbstuttgart_20261103_m_s');
    assert.equal(youthGalaSig, 'galatasaray_vs_vfbstuttgart_20261103_m_y');

    const seniorSportingSig = [normalizeTeamName('Shakhtar Donetsk'), normalizeTeamName('Sporting CP')].sort().join('_vs_') + '_' + dKey + '_' + seniorSportingTier;
    const youthSportingSig = [normalizeTeamName('Shakhtar Donetsk U19'), normalizeTeamName('Sporting CP U19')].sort().join('_vs_') + '_' + dKey + '_' + youthSportingTier;

    assert.notEqual(seniorSportingSig, youthSportingSig);
    assert.equal(seniorSportingSig, 'shakhtardonetsk_vs_sportingcp_20261103_m_s');
    assert.equal(youthSportingSig, 'shakhtardonetsk_vs_sportingcp_20261103_m_y');

    // 3. areTeamNamesMatching with competition context rejects cross-tier matches
    assert.equal(areTeamNamesMatching('Galatasaray', 'Galatasaray U19'), false);
    assert.equal(areTeamNamesMatching('Galatasaray', 'Galatasaray', 'uefa.champions', 'uefa.youth'), false);
    assert.equal(areTeamNamesMatching('Sporting CP', 'Sporting CP', 'uefa.champions', 'uefa.youth'), false);
    assert.equal(areTeamNamesMatching('Shakhtar Donetsk', 'Shakhtar Donetsk U19', 'uefa.champions', 'uefa.youth'), false);
});

test('resolveLeagueSlug correctly resolves Latin American and African domestic leagues without European collisions', () => {
    // Brazil Série A and B
    assert.equal(resolveLeagueSlug('Brasileiro Serie A', 'Brazil'), 'bra.1');
    assert.equal(resolveLeagueSlug('Serie A', 'Brazil'), 'bra.1');
    assert.equal(resolveLeagueSlug('Serie B', 'Brazil'), 'bra.2');
    assert.equal(resolveLeagueSlug('Copa do Brasil', 'Brazil'), 'bra.copa');

    // Guatemala Liga Nacional (prevents "guatemaLA LIGA" matching esp.1)
    assert.equal(resolveLeagueSlug('Liga Nacional', 'Guatemala'), 'gua.1');
    assert.equal(resolveLeagueSlug('Liga Guat - Clausura', 'Guatemala'), 'gua.1');

    // Mexico Liga MX (prevents matching Spanish Primera)
    assert.equal(resolveLeagueSlug('Liga MX', 'Mexico'), 'mex.1');
    assert.equal(resolveLeagueSlug('Liga de Expansión MX', 'Mexico'), 'mex.2');

    // Ecuador LigaPro / Serie A (prevents matching Italian Serie A)
    assert.equal(resolveLeagueSlug('Serie A', 'Ecuador'), 'ecu.1');
    assert.equal(resolveLeagueSlug('LigaPro Serie A', 'Ecuador'), 'ecu.1');

    // Egypt Cup / League Cup (prevents matching English League Cup / Carabao Cup)
    assert.equal(resolveLeagueSlug('Egypt Cup', 'Egypt'), 'egy.cup');
    assert.equal(resolveLeagueSlug('Egyptian League Cup', 'Egypt'), 'egy.cup');
    assert.equal(resolveLeagueSlug('Premier League', 'Egypt'), 'egy.1');

    // Colombia
    assert.equal(resolveLeagueSlug('Primera A', 'Colombia'), 'col.1');
});

test('resolveLeagueSlug correctly resolves Moldovan competitions without colliding with Turkish Süper Lig', () => {
    // Moldovan Super Liga and Cup must NEVER resolve to Turkish Süper Lig (tur.1)
    assert.equal(resolveLeagueSlug('Moldovan Super Liga', 'Moldova'), 'mda.1');
    assert.equal(resolveLeagueSlug('Moldovan Super Liga', 'International'), 'mda.1');
    assert.equal(resolveLeagueSlug('Super Liga', 'Moldova'), 'mda.1');
    assert.equal(resolveLeagueSlug('Zimbru v Real Sireti', 'Moldova'), 'mda.1');
    assert.equal(resolveLeagueSlug('Zimbru v Real Sireti', ''), 'mda.1');
    assert.equal(resolveLeagueSlug('Sheriff Tiraspol v Petrocub', 'Moldova'), 'mda.1');
    assert.equal(resolveLeagueSlug('Cupa Moldovei - Turul 2', 'Moldova'), 'mda.cup');

    // Genuine Turkish Süper Lig competitions must resolve accurately to tur.1
    assert.equal(resolveLeagueSlug('Turkish Süper Lig', 'Turkey'), 'tur.1');
    assert.equal(resolveLeagueSlug('Süper Lig', 'Turkey'), 'tur.1');
    assert.equal(resolveLeagueSlug('Süper Lig', 'International'), 'tur.1');
    assert.equal(resolveLeagueSlug('Super Lig', ''), 'tur.1');
    assert.equal(resolveLeagueSlug('Galatasaray vs Fenerbahce', ''), 'tur.1');
});

test('normalizeTeamName and deduplication properly harmonize club suffixes like CEIF and W', () => {
    // Colombian Primera A Fortaleza CEIF vs Independiente Medellín variants
    assert.equal(normalizeTeamName('Fortaleza CEIF'), 'fortaleza');
    assert.equal(normalizeTeamName('Fortaleza FC'), 'fortaleza');
    assert.equal(normalizeTeamName('Fortaleza CEIF'), normalizeTeamName('Fortaleza FC'));

    assert.equal(normalizeTeamName('Independiente Medellín'), 'independientemedellin');
    assert.equal(normalizeTeamName('Independiente Medellin'), 'independientemedellin');
    assert.equal(normalizeTeamName('Independiente Medellín'), normalizeTeamName('Independiente Medellin'));

    const dKey = '20261107';
    const sigCeif = [normalizeTeamName('Fortaleza CEIF'), normalizeTeamName('Independiente Medellín')].sort().join('_vs_') + '_' + dKey + '_col.1_m_s';
    const sigFc = [normalizeTeamName('Fortaleza FC'), normalizeTeamName('Independiente Medellin')].sort().join('_vs_') + '_' + dKey + '_col.1_m_s';
    assert.equal(sigCeif, sigFc);

    // Spanish Liga F Granada W vs Espanyol W variants
    assert.equal(normalizeTeamName('Granada W'), 'granada');
    assert.equal(normalizeTeamName('Granada'), 'granada');
    assert.equal(normalizeTeamName('Granada W'), normalizeTeamName('Granada'));

    assert.equal(normalizeTeamName('Espanyol W'), 'espanyol');
    assert.equal(normalizeTeamName('Espanyol'), 'espanyol');
    assert.equal(normalizeTeamName('Espanyol W'), normalizeTeamName('Espanyol'));

    assert.equal(getMatchTier('Granada W', 'Espanyol W', 'esp.w.1'), 'w_s');
    assert.equal(getMatchTier('Granada', 'Espanyol', 'esp.w.1'), 'w_s');

    const sigGranadaW = [normalizeTeamName('Granada W'), normalizeTeamName('Espanyol W')].sort().join('_vs_') + '_' + dKey + '_esp.w.1_w_s';
    const sigGranadaPlain = [normalizeTeamName('Granada'), normalizeTeamName('Espanyol')].sort().join('_vs_') + '_' + dKey + '_esp.w.1_w_s';
    assert.equal(sigGranadaW, sigGranadaPlain);
});
