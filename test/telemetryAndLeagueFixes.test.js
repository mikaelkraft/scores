const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { resolveLeagueSlug, inferCountryFromTeamNames, normalizeTeamName, cleanCompetitionName, hasTopFlightClub, demoteIfNotTopFlight, demoteToJuniorOrLowerTier, LIVESCORE_STAGE_TABLE_MAP, TARGET_LEAGUES } = require('../services/soccerSyncService');
const { serializeLeague, serializeStandingGroup } = require('../services/soccerSerializer');

test.after(async () => {
    try {
        if (mongoose.connection && mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
        }
    } catch (_) {}
    process.exit(0);
});

test('resolveLeagueSlug correctly identifies CONCACAF Nations League and does not map American teams to AFCON', () => {
    // Curaçao vs Panama
    const curacaoPanama = resolveLeagueSlug(
        'CONCACAF Nations League',
        'Curaçao vs Panama',
        'concacaf.nations'
    );
    assert.equal(curacaoPanama, 'concacaf.nations');

    // Bermuda vs St. Lucia when generic nations league text passed with team names
    const bermudaStLucia = resolveLeagueSlug(
        'Nations League',
        'Bermuda vs Saint Lucia',
        'nations'
    );
    assert.equal(bermudaStLucia, 'concacaf.nations');

    // If upstream misattributed Curaçao vs Panama to caf.nations, inferCountryFromTeamNames repairs it to concacaf.nations
    const repairedFromAfcon = inferCountryFromTeamNames('Curaçao', 'Panama', 'caf.nations');
    assert.equal(repairedFromAfcon, 'concacaf.nations');

    const repairedBermuda = inferCountryFromTeamNames('Bermuda', 'Saint Lucia', 'caf.nations');
    assert.equal(repairedBermuda, 'concacaf.nations');

    // Genuine AFCON match remains caf.nations
    const nigeriaBenin = resolveLeagueSlug(
        'Africa Cup of Nations',
        'Nigeria vs Benin',
        'caf.nations'
    );
    assert.equal(nigeriaBenin, 'caf.nations');
});

test('normalizeTeamName handles St. and Saint consistently', () => {
    const stLucia = normalizeTeamName('St. Lucia');
    const saintLucia = normalizeTeamName('Saint Lucia');
    assert.equal(stLucia, saintLucia);

    const stMartin = normalizeTeamName('St-Martin');
    const saintMartin = normalizeTeamName('Saint-Martin');
    assert.equal(stMartin, saintMartin);

    const stKitts = normalizeTeamName('St. Kitts and Nevis');
    const saintKitts = normalizeTeamName('Saint Kitts and Nevis');
    assert.equal(stKitts, saintKitts);
});

test('serializeLeague never assigns Premier League 23.png to other leagues and upgrades stale seasons', () => {
    const chnCup = serializeLeague({
        slug: 'chn.cup',
        name: 'Chinese FA Cup',
        country: 'China',
        logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/23.png',
        season: {
            year: 2025,
            display_name: '2025 Chinese FA Cup'
        }
    });

    // Logo must NOT be 23.png
    assert.notEqual(chnCup.logo, 'https://a.espncdn.com/i/leaguelogos/soccer/500/23.png');
    assert.equal(chnCup.logo, null);

    // Stale 2025 season must be upgraded to 2026
    assert.equal(chnCup.season.year, 2026);
    assert.ok(chnCup.season.display_name.includes('2026'));

    const npfl = serializeLeague({
        slug: 'nga.1',
        name: 'Nigeria Premier Football League',
        country: 'Nigeria',
        logo: 'https://flagcdn.com/w80/ng.png',
        season: {
            year: 2025,
            display_name: '2025-26 Nigerian Professional League'
        }
    });

    assert.equal(npfl.season.year, 2026);
    assert.ok(npfl.season.display_name.includes('2026-27'));
});

test('serializeStandingGroup ensures current season_year', () => {
    const currentYear = new Date().getFullYear();
    const group = serializeStandingGroup({
        group_id: 'npfl_table',
        group_name: 'NPFL Table',
        season_year: 2025,
        entries: [
            {
                club: { name: 'Enugu Rangers', source_id: '123' },
                rank: 1,
                stats: { points: 15, gamesPlayed: 7, wins: 4 }
            }
        ]
    });

    assert.equal(group.standings.season, currentYear);
});

test('frontend app-v9 has patchLiveMatchRowsInDom without requiring all global matches to match', () => {
    const appV9 = fs.readFileSync(path.join(__dirname, '..', 'public', 'app-v9.js'), 'utf8');
    assert.ok(appV9.includes('return matchedCount > 0;'), 'patchLiveMatchRowsInDom should return matchedCount > 0');
    assert.ok(!appV9.includes('return matchedCount > 0 && matchedCount === liveMatches.length;'), 'patchLiveMatchRowsInDom should not require all matches');
    assert.ok(appV9.includes('isUserInteracting'), 'app-v9 must track isUserInteracting to protect scrolling');
});

test('Turkish, Austrian, and Bosnian lower division matches are strictly separated from senior top flight', () => {
    // Turkish 2. Lig and 3. Lig teams must not be mapped to tur.1
    const tur2Lig = resolveLeagueSlug('2. Lig: Kirmizi', 'Turkey', 'tur.3');
    assert.equal(tur2Lig, 'tur.3');

    const tur3Lig = resolveLeagueSlug('3. Lig: Grup 2', 'Turkey', 'tur.4');
    assert.equal(tur3Lig, 'tur.4');

    const turCup = resolveLeagueSlug('Ziraat Turkiye Kupasi', 'Turkey', 'tur.cup');
    assert.equal(turCup, 'tur.cup');

    const superLig = resolveLeagueSlug('Süper Lig', 'Turkey', 'tur.1');
    assert.equal(superLig, 'tur.1');

    // Demotion check: 2. Lig clubs under tur.1 are demoted off top board
    assert.equal(hasTopFlightClub('tur.1', 'Iskenderunspor', 'Erbaaspor'), false);
    assert.equal(demoteIfNotTopFlight('tur.1', 'Iskenderunspor', 'Erbaaspor', '2. Lig'), 'tur.lower');

    // Genuine top-flight club is kept on tur.1
    assert.equal(hasTopFlightClub('tur.1', 'Galatasaray', 'Fenerbahce'), true);
    assert.equal(demoteIfNotTopFlight('tur.1', 'Galatasaray', 'Fenerbahce', 'Süper Lig'), 'tur.1');

    // Austrian 2. Liga and Regionalliga separation
    const aut2 = resolveLeagueSlug('2. Liga', 'Austria', 'aut.2');
    assert.equal(aut2, 'aut.2');

    const autLower = resolveLeagueSlug('Regionalliga Mitte', 'Austria', 'aut.3');
    assert.equal(autLower, 'aut.lower');

    assert.equal(hasTopFlightClub('aut.1', 'FC Liefering', 'SV Stripfing'), false);
    assert.equal(hasTopFlightClub('aut.1', 'Red Bull Salzburg', 'SK Sturm Graz'), true);

    // Bosnian Prva Liga RS / FBiH separation
    const bih2 = resolveLeagueSlug('Prva Liga RS', 'Bosnia and Herzegovina', 'bih.2');
    assert.equal(bih2, 'bih.2');

    assert.equal(hasTopFlightClub('bih.1', 'FK Zvijezda 09', 'Slavija Sarajevo'), false);
    assert.equal(hasTopFlightClub('bih.1', 'FK Sarajevo', 'Zrinjski Mostar'), true);

    // Kosovo Superliga registered and resolved
    const kvxDef = TARGET_LEAGUES.find(l => l.slug === 'kvx.1');
    assert.ok(kvxDef, 'Kosovar Superliga kvx.1 must be registered in TARGET_LEAGUES');
    assert.equal(kvxDef.country, 'Kosovo');

    const kvx = resolveLeagueSlug('Superliga e Kosovës', 'Kosovo', 'kvx.1');
    assert.equal(kvx, 'kvx.1');
});

test('cleanCompetitionName collapses duplicate words like Friendlies Friendlies', () => {
    assert.equal(cleanCompetitionName('Friendlies Friendlies'), 'Friendlies');
    assert.equal(cleanCompetitionName('International Friendlies Friendlies'), 'International Friendlies');
    assert.equal(cleanCompetitionName('Club Friendlies Friendlies'), 'Club Friendlies');
    assert.equal(cleanCompetitionName('Premier League'), 'Premier League');
});

test('frontend app-v9 caps Starting XI at 11 and slices H2H to recent 5 with expandable toggle', () => {
    const appV9 = fs.readFileSync(path.join(__dirname, '..', 'public', 'app-v9.js'), 'utf8');

    // Lineups: starters capped at 11
    assert.ok(appV9.includes('if (starters.length > 11) {'), 'Starters must be capped at 11');

    // H2H: sliced to 5 by default with toggle for remaining lifetime encounters
    assert.ok(appV9.includes('uniqueMeetings.slice(0, 5)'), 'H2H should display 5 recent encounters by default');
    assert.ok(appV9.includes('btn-toggle-h2h-all'), 'H2H toggle button should exist to view all lifetime encounters');

    // Live score protection: prevents stale pre-match cache from masking active live game
    assert.ok(appV9.includes('(!isCurrentlyLive || !cachedIsPrematch)'), 'Must not serve pre-match cache when game is in-play');
    assert.ok(!appV9.includes("{ fullName: 'Stadium Venue' }"), 'Stadium Venue fake fallback must be removed');
});

test('robots.txt exists on disk with proper crawlers and sitemap directive', () => {
    const robotsPath = path.join(__dirname, '..', 'public', 'robots.txt');
    assert.ok(fs.existsSync(robotsPath), 'public/robots.txt must exist on disk');

    const robotsContent = fs.readFileSync(robotsPath, 'utf8');
    assert.ok(robotsContent.includes('User-agent: *'), 'Must include User-agent: *');
    assert.ok(robotsContent.includes('Sitemap: https://scores.mynorra.xyz/sitemap.xml'), 'Must link to sitemap.xml');
    assert.ok(robotsContent.includes('Disallow: /admin/'), 'Must disallow admin');
});

test('frontend deduplication and live sync properly retain finished scores and transition live matches', () => {
    const appV9 = fs.readFileSync(path.join(__dirname, '..', 'public', 'app-v9.js'), 'utf8');

    // mergeMatches handles completed secondary matches so final scores are never dropped
    assert.ok(appV9.includes('else if (secIsCompleted && !winIsCompleted)'), 'mergeMatches must adopt completed secondary status');
    assert.ok(appV9.includes('winner.status.state = \'post\''), 'mergeMatches must mark winner as post when secondary is completed');

    // Quality score awards bonus for completed games so stale pre-match records never beat finished scores
    assert.ok(appV9.includes('isCompletedBonus ='), 'getEventQualityScore must grant completed bonus');

    // initLiveSync tracks live IDs so matches ending or starting trigger clean fixture reload
    assert.ok(appV9.includes('liveIdsChanged ='), 'initLiveSync must track live match id set changes');
    assert.ok(appV9.includes('!liveIdsChanged && digestChanged && patchLiveMatchRowsInDom'), 'patchLiveMatchRowsInDom must only short-circuit when live ID set is stable');
});

test('demoteToJuniorOrLowerTier accurately separates junior/reserve leagues from senior .1 flights', () => {
    assert.equal(demoteToJuniorOrLowerTier('intl.friendly', 'England U21', 'Spain U21'), 'intl.u21');
    assert.equal(demoteToJuniorOrLowerTier('eng.1', 'Arsenal U21', 'Chelsea U21'), 'eng.u21');
    assert.equal(demoteToJuniorOrLowerTier('eng.1', 'Manchester United Reserves', 'Liverpool Reserves'), 'eng.u21');
    assert.equal(demoteToJuniorOrLowerTier('ita.1', 'Juventus Primavera', 'Milan Primavera'), 'ita.u19');
    assert.equal(demoteToJuniorOrLowerTier('esp.1', 'Real Madrid Castilla', 'Barcelona Atlètic'), 'esp.3');
    assert.equal(demoteToJuniorOrLowerTier('esp.1', 'Atletico Madrid Juvenil', 'Real Betis Juvenil'), 'esp.u19');
    assert.equal(demoteToJuniorOrLowerTier('ger.1', 'Bayern Munich II', 'Borussia Dortmund II'), 'ger.3');
    assert.equal(demoteToJuniorOrLowerTier('ger.1', 'Schalke 04 U19', 'Leverkusen U19'), 'ger.u19');
    assert.equal(demoteToJuniorOrLowerTier('fra.1', 'PSG U19', 'Lyon U19'), 'fra.u19');
    assert.equal(demoteToJuniorOrLowerTier('tur.1', 'Galatasaray B', 'Fenerbahce B'), 'tur.2');

    // Senior fixtures remain strictly on senior top flight
    assert.equal(demoteToJuniorOrLowerTier('eng.1', 'Arsenal', 'Chelsea'), 'eng.1');
    assert.equal(demoteToJuniorOrLowerTier('esp.1', 'Real Madrid', 'Barcelona'), 'esp.1');
    assert.equal(demoteToJuniorOrLowerTier('ita.1', 'Inter Milan', 'Juventus'), 'ita.1');
});

test('LIVESCORE_STAGE_TABLE_MAP contains verified live stage URLs for African leagues and Kosovo', () => {
    assert.ok(LIVESCORE_STAGE_TABLE_MAP['nga.1'].includes('/nigeria/npfl/1'));
    assert.ok(LIVESCORE_STAGE_TABLE_MAP['gha.1'].includes('/ghana/premier-league/1'));
    assert.ok(LIVESCORE_STAGE_TABLE_MAP['ken.1'].includes('/kenya/premier-league/1'));
    assert.ok(LIVESCORE_STAGE_TABLE_MAP['tza.1'].includes('/tanzania/premier-league/1'));
    assert.ok(LIVESCORE_STAGE_TABLE_MAP['egy.1'].includes('/egypt/premier-league/1'));
    assert.ok(LIVESCORE_STAGE_TABLE_MAP['rsa.1'].includes('/south-africa/premier-league/1'));
    assert.ok(LIVESCORE_STAGE_TABLE_MAP['mar.1'].includes('/morocco/botola-pro/1'));
    assert.ok(LIVESCORE_STAGE_TABLE_MAP['kvx.1'].includes('/kosovo/superliga/1'));

    const slugs = TARGET_LEAGUES.map(l => l.slug);
    assert.ok(slugs.includes('ita.u19'), 'Must include Campionato Primavera 1');
    assert.ok(slugs.includes('esp.u19'), 'Must include Spanish División de Honor Juvenil');
    assert.ok(slugs.includes('ger.u19'), 'Must include German U19 Bundesliga');
    assert.ok(slugs.includes('fra.u19'), 'Must include French Championnat National U19');
    assert.ok(slugs.includes('esp.3'), 'Must include Spanish Primera Federación');
    assert.ok(slugs.includes('ger.3'), 'Must include German 3. Liga');
    assert.ok(slugs.includes('intl.u21'), 'Must include International U21');
});

test('normalizeTeamName harmonizes French and Spanish club abbreviations to resolve cross-provider duplicates', () => {
    // French clubs
    assert.equal(normalizeTeamName('Dijon FCO'), normalizeTeamName('Dijon'));
    assert.equal(normalizeTeamName('Orléans'), normalizeTeamName('Orleans'));
    assert.equal(normalizeTeamName('Philbert De Grandlieu'), normalizeTeamName('US Saint-Philbert-de-Grand-Lieu'));
    assert.equal(normalizeTeamName('La Roche VF'), normalizeTeamName('La Roche-sur-Yon'));
    assert.equal(normalizeTeamName('Is-Selongey Football'), normalizeTeamName('Selongey'));
    assert.equal(normalizeTeamName('Dijon ASPTT'), normalizeTeamName('Asptt Dijon'));

    // Latin American / Spanish clubs
    assert.equal(normalizeTeamName('Atlético Morelia'), normalizeTeamName('Atltico Morelia'));
    assert.equal(normalizeTeamName('Club Atlético Morelia'), normalizeTeamName('Atlético Morelia'));
    assert.equal(normalizeTeamName('C.D. Platense'), normalizeTeamName('Platense'));
    assert.equal(normalizeTeamName('SD Eibar'), normalizeTeamName('Eibar'));
    assert.equal(normalizeTeamName('AD Alcorcón'), normalizeTeamName('Alcorcon'));

    // Verify /fixtures filter does not pull stale unstarted games from yesterday
    const apiControllerSrc = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'footballApiController.js'), 'utf8');
    assert.ok(apiControllerSrc.includes("scoreboard_date: yesterdayKey, 'status.state': 'post'"), 'Fixtures query for yesterday must only fetch completed post matches');
});

test('PWA manifest and service worker provide offline shell and fast caching while protecting live telemetry', () => {
    // 1. Manifest
    const manifestPath = path.join(__dirname, '..', 'public', 'manifest.webmanifest');
    assert.ok(fs.existsSync(manifestPath), 'manifest.webmanifest must exist');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.equal(manifest.name, 'NorraScore - Live Football Scores & Telemetry');
    assert.equal(manifest.short_name, 'NorraScore');
    assert.equal(manifest.display, 'standalone');
    assert.ok(Array.isArray(manifest.icons) && manifest.icons.length > 0, 'manifest must specify icons');

    // 2. Service Worker
    const swPath = path.join(__dirname, '..', 'public', 'sw.js');
    assert.ok(fs.existsSync(swPath), 'sw.js must exist');
    const swContent = fs.readFileSync(swPath, 'utf8');
    assert.ok(swContent.includes('caches.open'), 'sw.js must open cache');
    assert.ok(swContent.includes("url.pathname.startsWith('/api/')"), 'sw.js must exempt /api/ from stale caching');
    assert.ok(swContent.includes('request.mode === \'navigate\''), 'sw.js must handle offline navigation fallback');

    // 3. Service Worker registration & Sound Toggle in index.html
    const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
    assert.ok(indexHtml.includes("navigator.serviceWorker.register('/sw.js')"), 'index.html must register sw.js');
    assert.ok(indexHtml.includes('id="sound-toggle"'), 'index.html must include sound toggle in header');
    assert.ok(indexHtml.includes('id="sticky-sound-toggle"'), 'index.html must include sticky sound toggle');

    // 4. Goal Alert sound synthesizer in app-v9.js
    const appV9 = fs.readFileSync(path.join(__dirname, '..', 'public', 'app-v9.js'), 'utf8');
    assert.ok(appV9.includes('function playGoalSound()'), 'app-v9 must have playGoalSound');
    assert.ok(appV9.includes('initGoalAlertToggle()'), 'app-v9 must have initGoalAlertToggle');
    assert.ok(appV9.includes('curH > prev.h || curA > prev.a'), 'app-v9 must detect live goal score increments');
});
