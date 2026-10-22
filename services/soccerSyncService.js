/**
 * Norra AI Soccer Live Telemetry & Scoreboard Synchronization Service
 * 
 * Ingests multi-date match schedules, real-time scores, standings,
 * club rosters and crests across the top 7 world leagues into MongoDB Atlas.
 */

const https = require('https');
const zlib = require('zlib');
const SoccerLeague = require('../models/soccerLeague');
const SoccerClub = require('../models/soccerClub');
const SoccerMatch = require('../models/soccerMatch');
const SoccerStanding = require('../models/soccerStanding');
const SoccerSyncState = require('../models/soccerSyncState');

const TARGET_LEAGUES = [
    { slug: 'eng.1', name: 'English Premier League', abbreviation: 'Premier League', country: 'England', kind: 'club', sort_order: 1 },
    { slug: 'esp.1', name: 'Spanish La Liga', abbreviation: 'La Liga', country: 'Spain', kind: 'club', sort_order: 2 },
    { slug: 'uefa.champions', name: 'UEFA Champions League', abbreviation: 'Champions League', country: 'International', kind: 'club', sort_order: 3 },
    { slug: 'ita.1', name: 'Italian Serie A', abbreviation: 'Serie A', country: 'Italy', kind: 'club', sort_order: 4 },
    { slug: 'ger.1', name: 'German Bundesliga', abbreviation: 'Bundesliga', country: 'Germany', kind: 'club', sort_order: 5 },
    { slug: 'fra.1', name: 'French Ligue 1', abbreviation: 'Ligue 1', country: 'France', kind: 'club', sort_order: 6 },
    { slug: 'uefa.europa', name: 'UEFA Europa League', abbreviation: 'Europa League', country: 'International', kind: 'club', sort_order: 7 },
    { slug: 'uefa.europa.conf', name: 'UEFA Conference League', abbreviation: 'Conference League', country: 'International', kind: 'club', sort_order: 8 },
    { slug: 'ned.1', name: 'Dutch Eredivisie', abbreviation: 'Eredivisie', country: 'Netherlands', kind: 'club', sort_order: 9 },
    { slug: 'por.1', name: 'Portuguese Primeira Liga', abbreviation: 'Primeira Liga', country: 'Portugal', kind: 'club', sort_order: 10 },
    { slug: 'eng.2', name: 'EFL Championship', abbreviation: 'Championship', country: 'England', kind: 'club', sort_order: 11 },
    { slug: 'esp.2', name: 'Spanish Segunda División', abbreviation: 'La Liga 2', country: 'Spain', kind: 'club', sort_order: 12 },
    { slug: 'ita.2', name: 'Italian Serie B', abbreviation: 'Serie B', country: 'Italy', kind: 'club', sort_order: 13 },
    { slug: 'ger.2', name: 'German 2. Bundesliga', abbreviation: '2. Bundesliga', country: 'Germany', kind: 'club', sort_order: 14 },
    { slug: 'fra.2', name: 'French Ligue 2', abbreviation: 'Ligue 2', country: 'France', kind: 'club', sort_order: 15 },
    { slug: 'bel.1', name: 'Belgian Pro League', abbreviation: 'Pro League', country: 'Belgium', kind: 'club', sort_order: 16 },
    { slug: 'tur.1', name: 'Turkish Süper Lig', abbreviation: 'Süper Lig', country: 'Turkey', kind: 'club', sort_order: 17 },
    { slug: 'sco.1', name: 'Scottish Premiership', abbreviation: 'Premiership', country: 'Scotland', kind: 'club', sort_order: 18 },
    { slug: 'usa.1', name: 'Major League Soccer', abbreviation: 'MLS', country: 'United States', kind: 'club', sort_order: 19 },
    { slug: 'ksa.1', name: 'Saudi Pro League', abbreviation: 'Saudi League', country: 'Saudi Arabia', kind: 'club', sort_order: 20 },
    { slug: 'bra.1', name: 'Brasileirão Série A', abbreviation: 'Brasileirão', country: 'Brazil', kind: 'club', sort_order: 21 },
    { slug: 'arg.1', name: 'Argentine Primera División', abbreviation: 'Liga Profesional', country: 'Argentina', kind: 'club', sort_order: 22 },
    { slug: 'mex.1', name: 'Liga MX', abbreviation: 'Liga MX', country: 'Mexico', kind: 'club', sort_order: 23 },
    { slug: 'conmebol.libertadores', name: 'Copa Libertadores', abbreviation: 'Libertadores', country: 'South America', kind: 'club', sort_order: 24 },
    { slug: 'conmebol.sudamericana', name: 'Copa Sudamericana', abbreviation: 'Sudamericana', country: 'South America', kind: 'club', sort_order: 25 },
    { slug: 'uefa.nations', name: 'UEFA Nations League', abbreviation: 'Nations League', country: 'International', kind: 'international', sort_order: 26 },
    { slug: 'eng.fa', name: 'English FA Cup', abbreviation: 'FA Cup', country: 'England', kind: 'club', sort_order: 27 },
    { slug: 'eng.league_cup', name: 'English Carabao Cup', abbreviation: 'EFL Cup', country: 'England', kind: 'club', sort_order: 28 },
    { slug: 'esp.copa_del_rey', name: 'Copa del Rey', abbreviation: 'Copa del Rey', country: 'Spain', kind: 'club', sort_order: 29 },
    { slug: 'ita.coppa_italia', name: 'Coppa Italia', abbreviation: 'Coppa Italia', country: 'Italy', kind: 'club', sort_order: 30 },
    { slug: 'ger.dfb_pokal', name: 'German Cup', abbreviation: 'DFB-Pokal', country: 'Germany', kind: 'club', sort_order: 31 },
    { slug: 'fra.coupe_de_france', name: 'Coupe de France', abbreviation: 'Coupe de France', country: 'France', kind: 'club', sort_order: 32 },
    { slug: 'aut.1', name: 'Austrian Bundesliga', abbreviation: 'Austrian Bundesliga', country: 'Austria', kind: 'club', sort_order: 33 },
    { slug: 'sui.1', name: 'Swiss Super League', abbreviation: 'Swiss Super League', country: 'Switzerland', kind: 'club', sort_order: 34 },
    { slug: 'den.1', name: 'Danish Superliga', abbreviation: 'Superliga', country: 'Denmark', kind: 'club', sort_order: 35 },
    { slug: 'gre.1', name: 'Super League Greece', abbreviation: 'Super League', country: 'Greece', kind: 'club', sort_order: 36 },
    { slug: 'swe.1', name: 'Swedish Allsvenskan', abbreviation: 'Allsvenskan', country: 'Sweden', kind: 'club', sort_order: 37 },
    { slug: 'nor.1', name: 'Norwegian Eliteserien', abbreviation: 'Eliteserien', country: 'Norway', kind: 'club', sort_order: 38 },
    { slug: 'jpn.1', name: 'Japanese J1 League', abbreviation: 'J1 League', country: 'Japan', kind: 'club', sort_order: 39 },
    { slug: 'aus.1', name: 'Australian A-League', abbreviation: 'A-League', country: 'Australia', kind: 'club', sort_order: 40 },
    { slug: 'chn.1', name: 'Chinese Super League', abbreviation: 'CSL', country: 'China', kind: 'club', sort_order: 41 },
    { slug: 'fin.1', name: 'Finnish Veikkausliiga', abbreviation: 'Veikkausliiga', country: 'Finland', kind: 'club', sort_order: 42 },
    { slug: 'concacaf.champions', name: 'CONCACAF Champions Cup', abbreviation: 'Champions Cup', country: 'International', kind: 'club', sort_order: 43 },
    { slug: 'caf.champions', name: 'CAF Champions League', abbreviation: 'CAF Champions', country: 'International', kind: 'club', sort_order: 44 },
    { slug: 'afc.champions', name: 'AFC Champions League Elite', abbreviation: 'AFC Champions', country: 'International', kind: 'club', sort_order: 45 },
    { slug: 'fifa.cwc', name: 'FIFA Club World Cup', abbreviation: 'Club World Cup', country: 'International', kind: 'club', sort_order: 46 },
    { slug: 'uefa.super_cup', name: 'UEFA Super Cup', abbreviation: 'Super Cup', country: 'International', kind: 'club', sort_order: 47 },
    { slug: 'conmebol.recopa', name: 'CONMEBOL Recopa', abbreviation: 'Recopa', country: 'International', kind: 'club', sort_order: 48 },
    { slug: 'eng.w.1', name: 'Women\'s Super League', abbreviation: 'WSL', country: 'England', kind: 'club', sort_order: 49 },
    { slug: 'usa.w.1', name: 'National Women\'s Soccer League', abbreviation: 'NWSL', country: 'United States', kind: 'club', sort_order: 50 },
    { slug: 'usa.usl.1', name: 'USL Championship', abbreviation: 'USL Championship', country: 'United States', kind: 'club', sort_order: 51 },
    { slug: 'usa.open', name: 'U.S. Open Cup', abbreviation: 'US Open Cup', country: 'United States', kind: 'cup', sort_order: 52 },
    { slug: 'caf.confed', name: 'CAF Confederation Cup', abbreviation: 'CAF Confed Cup', country: 'International', kind: 'club', sort_order: 53 },
    { slug: 'caf.nations', name: 'Africa Cup of Nations', abbreviation: 'AFCON', country: 'International', kind: 'international', sort_order: 54 },
    { slug: 'rsa.1', name: 'South African Premiership', abbreviation: 'PSL', country: 'South Africa', kind: 'club', sort_order: 55 },
    { slug: 'egy.1', name: 'Egyptian Premier League', abbreviation: 'Egyptian PL', country: 'Egypt', kind: 'club', sort_order: 56 },
    { slug: 'mar.1', name: 'Moroccan Botola Pro', abbreviation: 'Botola Pro', country: 'Morocco', kind: 'club', sort_order: 57 },
    { slug: 'nga.1', name: 'Nigeria Premier Football League', abbreviation: 'NPFL', country: 'Nigeria', kind: 'club', sort_order: 58 },
    { slug: 'eng.3', name: 'EFL League One', abbreviation: 'League One', country: 'England', kind: 'club', sort_order: 59 },
    { slug: 'eng.4', name: 'EFL League Two', abbreviation: 'League Two', country: 'England', kind: 'club', sort_order: 60 },
    { slug: 'col.1', name: 'Colombian Primera A', abbreviation: 'Liga BetPlay', country: 'Colombia', kind: 'club', sort_order: 61 },
    { slug: 'mex.2', name: 'Liga de Expansión MX', abbreviation: 'Expansión MX', country: 'Mexico', kind: 'club', sort_order: 62 },
    { slug: 'bra.2', name: 'Brasileirão Série B', abbreviation: 'Série B', country: 'Brazil', kind: 'club', sort_order: 63 },
    { slug: 'arg.copa', name: 'Copa Argentina', abbreviation: 'Copa Argentina', country: 'Argentina', kind: 'cup', sort_order: 64 },
    { slug: 'bol.copa', name: 'Copa Bolivia', abbreviation: 'Copa Bolivia', country: 'Bolivia', kind: 'cup', sort_order: 65 },
    { slug: 'fifa.youth', name: 'FIFA Youth World Cup', abbreviation: 'FIFA Youth', country: 'International', kind: 'international', sort_order: 66 },
    { slug: 'club.friendly', name: 'Club Friendlies', abbreviation: 'Friendlies', country: 'International', kind: 'club', sort_order: 67 },
    { slug: 'idn.1', name: 'Indonesian Super League', abbreviation: 'Liga 1', country: 'Indonesia', kind: 'club', sort_order: 68 },
    { slug: 'tha.1', name: 'Thai League 1', abbreviation: 'Thai League 1', country: 'Thailand', kind: 'club', sort_order: 69 },
    { slug: 'mys.1', name: 'Malaysian Super League', abbreviation: 'Super League', country: 'Malaysia', kind: 'club', sort_order: 70 },
    { slug: 'sgp.1', name: 'Singapore Premier League', abbreviation: 'SPL', country: 'Singapore', kind: 'club', sort_order: 71 },
    { slug: 'ken.1', name: 'Kenyan Premier League', abbreviation: 'FKF Premier', country: 'Kenya', kind: 'club', sort_order: 72 },
    { slug: 'gha.1', name: 'Ghana Premier League', abbreviation: 'Ghana Premier', country: 'Ghana', kind: 'club', sort_order: 73 },
    { slug: 'uga.1', name: 'Uganda Premier League', abbreviation: 'Uganda Premier', country: 'Uganda', kind: 'club', sort_order: 74 },
    { slug: 'ind.1', name: 'Indian Super League', abbreviation: 'ISL', country: 'India', kind: 'club', sort_order: 75 },
    { slug: 'ind.2', name: 'Indian I-League', abbreviation: 'I-League', country: 'India', kind: 'club', sort_order: 76 },
    { slug: 'afc.cup', name: 'AFC Champions League Two', abbreviation: 'ACL Two', country: 'International', kind: 'club', sort_order: 77 },
    { slug: 'per.1', name: 'Peruvian Liga 1', abbreviation: 'Liga 1 Peru', country: 'Peru', kind: 'club', sort_order: 78 },
    { slug: 'bol.1', name: 'Bolivian Liga Profesional', abbreviation: 'Liga Bolivia', country: 'Bolivia', kind: 'club', sort_order: 79 },
    { slug: 'ecu.1', name: 'LigaPro Ecuador', abbreviation: 'LigaPro', country: 'Ecuador', kind: 'club', sort_order: 80 },
    { slug: 'par.1', name: 'Paraguayan Primera División', abbreviation: 'División de Honor', country: 'Paraguay', kind: 'club', sort_order: 81 },
    { slug: 'ven.1', name: 'Venezuelan Primera División', abbreviation: 'Liga FUTVE', country: 'Venezuela', kind: 'club', sort_order: 82 },
    { slug: 'uru.1', name: 'Liga AUF Uruguaya', abbreviation: 'Primera Uruguay', country: 'Uruguay', kind: 'club', sort_order: 83 },
    { slug: 'crc.1', name: 'Costa Rican Primera División', abbreviation: 'Primera Costa Rica', country: 'Costa Rica', kind: 'club', sort_order: 84 },
    { slug: 'hon.1', name: 'Honduran Liga Nacional', abbreviation: 'Liga Betcris', country: 'Honduras', kind: 'club', sort_order: 85 },
    { slug: 'gua.1', name: 'Guatemalan Liga Nacional', abbreviation: 'Liga Mayor', country: 'Guatemala', kind: 'club', sort_order: 86 },
    { slug: 'vie.1', name: 'Vietnamese V.League 1', abbreviation: 'V.League 1', country: 'Vietnam', kind: 'club', sort_order: 87 },
    { slug: 'irn.1', name: 'Persian Gulf Pro League', abbreviation: 'Pro League', country: 'Iran', kind: 'club', sort_order: 88 },
    { slug: 'uae.1', name: 'UAE President\'s Cup', abbreviation: 'President\'s Cup', country: 'United Arab Emirates', kind: 'cup', sort_order: 89 },
    { slug: 'uzb.1', name: 'Uzbekistan Super League', abbreviation: 'Superliga', country: 'Uzbekistan', kind: 'club', sort_order: 90 },
    { slug: 'rou.2', name: 'Romanian Liga II', abbreviation: 'Liga II', country: 'Romania', kind: 'club', sort_order: 91 },
    { slug: 'mne.1', name: 'Montenegrin First League', abbreviation: '1. CFL', country: 'Montenegro', kind: 'club', sort_order: 92 },
    { slug: 'qat.1', name: 'Qatar Stars League', abbreviation: 'Stars League', country: 'Qatar', kind: 'club', sort_order: 93 },
    { slug: 'irq.1', name: 'Iraq Stars League', abbreviation: 'Stars League', country: 'Iraq', kind: 'club', sort_order: 94 },
    { slug: 'jor.1', name: 'Jordanian Pro League', abbreviation: 'Pro League', country: 'Jordan', kind: 'club', sort_order: 95 },
    { slug: 'bhr.1', name: 'Bahraini Premier League', abbreviation: 'Premier League', country: 'Bahrain', kind: 'club', sort_order: 96 },
    { slug: 'isl.1', name: 'Icelandic Besta deild', abbreviation: 'Besta deild', country: 'Iceland', kind: 'club', sort_order: 97 }
];

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, {
            headers: {
                'User-Agent': 'NorraScores/2.1',
                'Accept-Encoding': 'gzip, deflate'
            }
        }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return fetchJson(res.headers.location).then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) {
                return reject(new Error(`HTTP ${res.statusCode} fetching ${url}`));
            }

            const encoding = res.headers['content-encoding'];
            let stream = res;
            if (encoding === 'gzip') {
                stream = res.pipe(zlib.createGunzip());
            } else if (encoding === 'deflate') {
                stream = res.pipe(zlib.createInflate());
            }

            let data = '';
            stream.on('data', chunk => data += chunk);
            stream.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
            stream.on('error', reject);
        });
        req.on('error', reject);
        req.setTimeout(14000, () => {
            req.destroy(new Error(`Timeout fetching ${url}`));
        });
    });
}

function formatDateToScoreboard(date = new Date()) {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return `${y}${m}${d}`;
}

async function processEvents(events, slug, leagueDef, season, now) {
    let count = 0;
    if (!Array.isArray(events) || !events.length) return count;

    for (const ev of events) {
        const comp = ev.competitions?.[0];
        if (!comp) continue;

        const competitors = comp.competitors || [];
        const homeComp = competitors.find(c => c.homeAway === 'home') || competitors[0];
        const awayComp = competitors.find(c => c.homeAway === 'away') || competitors[1];

        if (!homeComp || !awayComp) continue;

        const homeTeam = homeComp.team || {};
        const awayTeam = awayComp.team || {};

        // Club Profiles Upsert
        if (homeTeam.id) {
            await SoccerClub.updateOne(
                { 'source.provider': 'upstream', 'source.club_id': String(homeTeam.id) },
                {
                    $set: {
                        slug: String(homeTeam.name || homeTeam.displayName || '').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
                        name: homeTeam.name || homeTeam.displayName || 'Home Club',
                        display_name: homeTeam.displayName || homeTeam.name || 'Home Club',
                        short_display_name: homeTeam.shortDisplayName || homeTeam.abbreviation || '',
                        abbreviation: homeTeam.abbreviation || '',
                        country: leagueDef.country,
                        logo: homeTeam.logo || '',
                        color: homeTeam.color || '',
                        alternate_color: homeTeam.alternateColor || '',
                        active: true,
                        last_synced_at: now
                    },
                    $addToSet: { league_slugs: slug },
                    $setOnInsert: { created_at: now }
                },
                { upsert: true }
            );
        }

        if (awayTeam.id) {
            await SoccerClub.updateOne(
                { 'source.provider': 'upstream', 'source.club_id': String(awayTeam.id) },
                {
                    $set: {
                        slug: String(awayTeam.name || awayTeam.displayName || '').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
                        name: awayTeam.name || awayTeam.displayName || 'Away Club',
                        display_name: awayTeam.displayName || awayTeam.name || 'Away Club',
                        short_display_name: awayTeam.shortDisplayName || awayTeam.abbreviation || '',
                        abbreviation: awayTeam.abbreviation || '',
                        country: leagueDef.country,
                        logo: awayTeam.logo || '',
                        color: awayTeam.color || '',
                        alternate_color: awayTeam.alternateColor || '',
                        active: true,
                        last_synced_at: now
                    },
                    $addToSet: { league_slugs: slug },
                    $setOnInsert: { created_at: now }
                },
                { upsert: true }
            );
        }

        const matchDate = new Date(ev.date || comp.date || now);
        const scoreboardDate = formatDateToScoreboard(matchDate);
        const statusType = ev.status?.type || {};
        const state = ['pre', 'in', 'post'].includes(statusType.state) ? statusType.state : 'pre';

        const homeScore = parseInt(homeComp.score, 10);
        const awayScore = parseInt(awayComp.score, 10);

        const matchDoc = {
            source: {
                provider: 'upstream',
                event_id: String(ev.id),
                competition_id: String(comp.id || ev.id),
                uid: ev.uid || comp.uid || '',
                modified_at: now
            },
            league_slug: slug,
            scoreboard_date: scoreboardDate,
            date: matchDate,
            name: ev.name || `${homeTeam.displayName || 'Home'} vs ${awayTeam.displayName || 'Away'}`,
            short_name: ev.shortName || `${homeTeam.abbreviation || 'HOM'} vs ${awayTeam.abbreviation || 'AWY'}`,
            season: {
                year: season.year || 2026,
                type_id: String(season.type?.id || '1'),
                slug: 'regular-season',
                name: season.displayName || `${leagueDef.name} ${season.year || 2026}`
            },
            status: {
                state,
                name: statusType.name || (state === 'in' ? 'STATUS_IN_PROGRESS' : state === 'post' ? 'STATUS_FINAL' : 'STATUS_SCHEDULED'),
                description: statusType.description || (state === 'in' ? 'In Progress' : state === 'post' ? 'Full Time' : 'Scheduled'),
                detail: statusType.detail || ev.status?.displayClock || (state === 'in' ? "45'" : state === 'post' ? 'FT' : 'Scheduled'),
                short_detail: statusType.shortDetail || (state === 'in' ? "45'" : state === 'post' ? 'FT' : 'Scheduled'),
                clock: ev.status?.displayClock || '',
                clock_seconds: ev.status?.clock || 0,
                period: ev.status?.period || 1,
                completed: statusType.completed || state === 'post',
                suspended: false
            },
            home: {
                source_id: String(homeTeam.id || '1'),
                name: homeTeam.name || homeTeam.displayName || 'Home Club',
                display_name: homeTeam.displayName || homeTeam.name || 'Home Club',
                abbreviation: homeTeam.abbreviation || '',
                logo: homeTeam.logo || '',
                score: isNaN(homeScore) ? 0 : homeScore,
                winner: homeComp.winner === true,
                form: homeComp.form || ''
            },
            away: {
                source_id: String(awayTeam.id || '2'),
                name: awayTeam.name || awayTeam.displayName || 'Away Club',
                display_name: awayTeam.displayName || awayTeam.name || 'Away Club',
                abbreviation: awayTeam.abbreviation || '',
                logo: awayTeam.logo || '',
                score: isNaN(awayScore) ? 0 : awayScore,
                winner: awayComp.winner === true,
                form: awayComp.form || ''
            },
            venue: {
                source_id: String(comp.venue?.id || ''),
                name: comp.venue?.fullName || 'Stadium',
                city: comp.venue?.address?.city || '',
                country: comp.venue?.address?.country || leagueDef.country
            },
            attendance: comp.attendance || 0,
            note: leagueDef.name,
            play_by_play_available: true,
            broadcasts: (comp.broadcasts || []).map(b => ({
                market: b.market || 'National',
                names: b.names || []
            })),
            key_events: [],
            last_synced_at: now
        };

        await SoccerMatch.updateOne(
            { 'source.provider': 'upstream', 'source.event_id': String(ev.id) },
            {
                $set: matchDoc,
                $setOnInsert: { created_at: now }
            },
            { upsert: true }
        );
        count++;
    }
    return count;
}

async function syncLeague(leagueDef) {
    const slug = leagueDef.slug;
    const now = new Date();
    let matchCount = 0;
    let standingCount = 0;

    try {
        // 1. Fetch Primary Scoreboard Data
        const scoreboardUrl = `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/scoreboard`;
        let sbData;
        try {
            sbData = await fetchJson(scoreboardUrl);
        } catch (fetchErr) {
            // Regional leagues and domestic cups that only air via master all/scoreboard
            return {
                league: slug,
                matchesSynced: 0,
                standingsSynced: 0,
                status: 'skipped'
            };
        }

        const espnLeague = sbData.leagues?.[0] || {};
        const season = espnLeague.season || {};
        const logoUrl = espnLeague.logos?.[0]?.href || '';

        // Upsert League Record
        await SoccerLeague.updateOne(
            { slug },
            {
                $set: {
                    name: leagueDef.name,
                    abbreviation: leagueDef.abbreviation,
                    country: leagueDef.country,
                    kind: leagueDef.kind,
                    logo: logoUrl || `https://a.espncdn.com/i/leaguelogos/soccer/500/${espnLeague.id || '23'}.png`,
                    active: true,
                    sort_order: leagueDef.sort_order,
                    source: { provider: 'upstream', source_id: String(espnLeague.id || '') },
                    season: {
                        year: season.year || 2026,
                        display_name: season.displayName || `${leagueDef.name} ${season.year || 2026}`,
                        current: true,
                        type_id: String(season.type?.id || '1'),
                        type_name: season.type?.name || 'Regular Season'
                    },
                    last_synced_at: now
                },
                $setOnInsert: { created_at: now }
            },
            { upsert: true }
        );

        // Process default scoreboard events
        matchCount += await processEvents(sbData.events || [], slug, leagueDef, season, now);

        // 2. Discover and sync multi-date rounds from league calendar
        const calendarDates = (espnLeague.calendar || [])
            .map(entry => typeof entry === 'string' ? entry : entry.date)
            .filter(Boolean);

        if (calendarDates.length > 0) {
            const pastCutoff = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);   // past 8 days
            const futureCutoff = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000); // next 14 days
            const targetDates = new Set();

            for (const calStr of calendarDates) {
                const d = new Date(calStr);
                if (!isNaN(d.getTime()) && d >= pastCutoff && d <= futureCutoff) {
                    targetDates.add(formatDateToScoreboard(d));
                }
            }

            // Sync up to 6 match dates per league
            const dateList = Array.from(targetDates).slice(0, 6);
            for (const dateKey of dateList) {
                try {
                    const dateUrl = `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/scoreboard?dates=${dateKey}`;
                    const dateData = await fetchJson(dateUrl);
                    matchCount += await processEvents(dateData.events || [], slug, leagueDef, season, now);
                } catch (e) {
                    // Non-blocking for individual round dates
                }
            }
        }

        // 3. Sync Standings
        try {
            const standingsUrl = `https://site.api.espn.com/apis/v2/sports/soccer/${slug}/standings`;
            const standData = await fetchJson(standingsUrl);
            const children = standData.children || [];
            const seasonYear = Number(season.year) || 2026;

            for (let idx = 0; idx < children.length; idx++) {
                const grp = children[idx];
                const standingsObj = grp.standings || {};
                const entries = standingsObj.entries || [];

                const normalizedEntries = entries.map((entry, eIdx) => {
                    const statsMap = new Map();
                    for (const st of (entry.stats || [])) {
                        if (st.name && typeof st.value === 'number') {
                            statsMap.set(st.name, st.value);
                        }
                    }

                    return {
                        rank: eIdx + 1,
                        club: {
                            source_id: String(entry.team?.id || `club-${eIdx}`),
                            display_name: entry.team?.displayName || entry.team?.name || 'Club',
                            abbreviation: entry.team?.abbreviation || '',
                            logo: entry.team?.logos?.[0]?.href || entry.team?.logo || ''
                        },
                        stats: statsMap
                    };
                });

                await SoccerStanding.updateOne(
                    { league_slug: slug, season_year: seasonYear, group_id: grp.id || 'overall' },
                    {
                        $set: {
                            group_name: grp.name || 'League Table',
                            entries: normalizedEntries,
                            last_synced_at: now
                        },
                        $setOnInsert: { created_at: now }
                    },
                    { upsert: true }
                );
                standingCount++;
            }
        } catch (stErr) {
            console.warn(`[LiveSync] Standings notice for ${slug}:`, stErr.message);
        }

        // 4. Update Sync State
        await SoccerSyncState.updateOne(
            { league_slug: slug },
            {
                $set: {
                    last_status: 'success',
                    last_sync_completed_at: now,
                    last_error: null,
                    consecutive_failures: 0
                },
                $inc: { sync_count: 1 }
            },
            { upsert: true }
        );

        return { slug, matchesSynced: matchCount, standingsSynced: standingCount };
    } catch (error) {
        await SoccerSyncState.updateOne(
            { league_slug: slug },
            {
                $set: {
                    last_status: 'error',
                    last_error: error.message
                },
                $inc: { consecutive_failures: 1 }
            },
            { upsert: true }
        );
        throw error;
    }
}

async function syncAllLeagues() {
    console.log(`⚡ [LiveSync] Ingesting match rounds and standings across ${TARGET_LEAGUES.length} premier leagues...`);
    const results = [];
    for (const l of TARGET_LEAGUES) {
        try {
            const res = await syncLeague(l);
            console.log(`✅ [LiveSync] ${l.name} (${l.slug}): ${res.matchesSynced} matches, ${res.standingsSynced} tables.`);
            results.push(res);
        } catch (e) {
            console.error(`❌ [LiveSync] ${l.slug} sync error: ${e.message}`);
        }
    }
    return results;
}

function resolveLeagueSlug(altGameNote = '', compDesc = '', uid = '') {
    const text = `${altGameNote} ${compDesc} ${uid}`.toLowerCase();
    if (text.includes('uefa.champions') || text.includes('champions league')) return 'uefa.champions';
    if (text.includes('uefa.europa.conf') || text.includes('conference league')) return 'uefa.europa.conf';
    if (text.includes('uefa.europa') || text.includes('europa league')) return 'uefa.europa';
    if (text.includes('uefa.nations') || text.includes('nations league')) return 'uefa.nations';
    if (text.includes('premier league') || text.includes('eng.1')) return 'eng.1';

    // United States competitions first (prevents USL Championship matching 'championship')
    if (text.includes('usl') || text.includes('united soccer league') || text.includes('usa.usl')) return 'usa.usl.1';
    if (text.includes('u.s. open') || text.includes('us open cup') || text.includes('usa.open')) return 'usa.open';
    if (text.includes('nwsl') || text.includes('usa.w.1')) return 'usa.w.1';
    if (text.includes('mls') || text.includes('major league soccer') || text.includes('usa.1')) return 'usa.1';
    if (text.includes('ncaa') || text.includes('ncaam')) return 'usa.ncaa';

    // English Championship (specifically EFL / English Championship, avoiding bare 'championship')
    if (text.includes('efl championship') || text.includes('english championship') || (text.includes('championship') && (text.includes('eng') || text.includes('efl') || text.includes('sky bet'))) || text.includes('eng.2')) return 'eng.2';
    if (text.includes('fa cup') || text.includes('eng.fa')) return 'eng.fa';
    if (text.includes('carabao') || text.includes('league cup') || text.includes('eng.league_cup')) return 'eng.league_cup';
    if (text.includes('wsl') || text.includes('eng.w.1')) return 'eng.w.1';

    if (text.includes('laliga 2') || text.includes('segunda') || text.includes('esp.2')) return 'esp.2';
    if (text.includes('laliga') || text.includes('la liga') || text.includes('esp.1')) return 'esp.1';
    if (text.includes('copa del rey') || text.includes('esp.copa_del_rey')) return 'esp.copa_del_rey';
    if (text.includes('serie b') || text.includes('ita.2')) return 'ita.2';
    if (text.includes('serie a') || text.includes('ita.1')) return 'ita.1';
    if (text.includes('coppa italia') || text.includes('ita.coppa_italia')) return 'ita.coppa_italia';
    if (text.includes('2. bundesliga') || text.includes('ger.2')) return 'ger.2';
    if (text.includes('bundesliga') || text.includes('ger.1')) return 'ger.1';
    if (text.includes('dfb-pokal') || text.includes('ger.dfb_pokal')) return 'ger.dfb_pokal';
    if (text.includes('ligue 2') || text.includes('fra.2')) return 'fra.2';
    if (text.includes('ligue 1') || text.includes('fra.1')) return 'fra.1';
    if (text.includes('coupe de france') || text.includes('fra.coupe_de_france')) return 'fra.coupe_de_france';
    if (text.includes('eredivisie') || text.includes('ned.1')) return 'ned.1';
    if (text.includes('primeira') || text.includes('por.1')) return 'por.1';
    if (text.includes('saudi') || text.includes('ksa.1')) return 'ksa.1';
    if (text.includes('belgian') || text.includes('jupiler') || text.includes('bel.1')) return 'bel.1';
    if (text.includes('super lig') || text.includes('süper lig') || text.includes('tur.1')) return 'tur.1';
    if (text.includes('scottish') || text.includes('premiership') || text.includes('sco.1')) return 'sco.1';
    if (text.includes('brasileir') || text.includes('bra.1')) return 'bra.1';
    if (text.includes('serie b brasil') || text.includes('bra.2')) return 'bra.2';
    if (text.includes('copa argentina') || text.includes('arg.copa')) return 'arg.copa';
    if (text.includes('argentin') || text.includes('arg.1')) return 'arg.1';
    if (text.includes('expansión') || text.includes('expansion') || text.includes('mex.2')) return 'mex.2';
    if (text.includes('liga mx') || text.includes('mex.1')) return 'mex.1';
    if (text.includes('colombia') || text.includes('primera a') || text.includes('col.1')) return 'col.1';
    if (text.includes('bolivia') || text.includes('bol.1') || text.includes('bol.copa')) return 'bol.copa';
    if (text.includes('libertadores') || text.includes('conmebol.libertadores')) return 'conmebol.libertadores';
    if (text.includes('sudamericana') || text.includes('conmebol.sudamericana')) return 'conmebol.sudamericana';
    if (text.includes('recopa') || text.includes('conmebol.recopa')) return 'conmebol.recopa';
    if (text.includes('super cup') || text.includes('uefa.super_cup')) return 'uefa.super_cup';
    if (text.includes('club world cup') || text.includes('fifa.cwc')) return 'fifa.cwc';
    if (text.includes('concacaf') || text.includes('concacaf.champions')) return 'concacaf.champions';
    if (text.includes('club friendly') || text.includes('friendly')) return 'club.friendly';
    if (text.includes('u-17') || text.includes('u17') || text.includes('u-20') || text.includes('u20')) return 'fifa.youth';

    // English lower divisions (League One, League Two)
    if (text.includes('league one') || text.includes('eng.3')) return 'eng.3';
    if (text.includes('league two') || text.includes('eng.4')) return 'eng.4';

    // African continental and domestic leagues
    if (text.includes('caf confederation') || text.includes('caf.confed')) return 'caf.confed';
    if (text.includes('caf champions') || text.includes('caf.champions')) return 'caf.champions';
    if (text.includes('africa cup') || text.includes('afcon') || text.includes('caf.nations')) return 'caf.nations';
    if (text.includes('chan') || text.includes('african nations championship') || text.includes('caf.championship')) return 'caf.championship';
    if (text.includes('cosafa') || text.includes('caf.cosafa')) return 'caf.cosafa';
    if (text.includes('botola') || (text.includes('morocco') && text.includes('league')) || text.includes('mar.1')) return 'mar.1';
    if (text.includes('egypt') || text.includes('egy.1')) return 'egy.1';
    if (text.includes('south africa') || text.includes('psl') || text.includes('betway premiership') || text.includes('rsa.1')) return 'rsa.1';
    if (text.includes('npfl') || text.includes('nigeria') || text.includes('nga.1')) return 'nga.1';
    if (text.includes('kenya') || text.includes('ken.1')) return 'ken.1';
    if (text.includes('ghana') || text.includes('gha.1')) return 'gha.1';
    if (text.includes('uganda') || text.includes('uga.1')) return 'uga.1';

    // Asian & Oceanic leagues
    if (text.includes('indonesia') || text.includes('liga 1') || text.includes('idn.1')) return 'idn.1';
    if (text.includes('thailand') || text.includes('thai league') || text.includes('tha.1')) return 'tha.1';
    if (text.includes('malaysia') || text.includes('mys.1')) return 'mys.1';
    if (text.includes('singapore') || text.includes('sgp.1')) return 'sgp.1';
    if (text.includes('i-league') || text.includes('ind.2')) return 'ind.2';
    if (text.includes('indian super league') || text.includes('ind.1')) return 'ind.1';
    if (text.includes('afc champions league two') || text.includes('acl two') || text.includes('afc.cup')) return 'afc.cup';
    if (text.includes('afc') || text.includes('afc.champions')) return 'afc.champions';

    // South & Central America
    if (text.includes('peru') || text.includes('per.1')) return 'per.1';
    if (text.includes('ecuador') || text.includes('ligapro') || text.includes('ecu.1')) return 'ecu.1';
    if (text.includes('paraguay') || text.includes('par.1')) return 'par.1';
    if (text.includes('venezuela') || text.includes('futve') || text.includes('ven.1')) return 'ven.1';
    if (text.includes('uruguay') || text.includes('uru.1')) return 'uru.1';
    if (text.includes('costa rica') || text.includes('crc.1')) return 'crc.1';
    if (text.includes('honduras') || text.includes('hon.1')) return 'hon.1';
    if (text.includes('guatemala') || text.includes('gua.1')) return 'gua.1';

    // Asian & Regional Additions
    if (text.includes('vietnam') || text.includes('vie.1')) return 'vie.1';
    if (text.includes('iran') || text.includes('irn.1')) return 'irn.1';
    if (text.includes('emirates') || text.includes('uae.1')) return 'uae.1';
    if (text.includes('uzbekistan') || text.includes('uzb.1')) return 'uzb.1';
    if (text.includes('romania') || text.includes('rou.2')) return 'rou.2';
    if (text.includes('montenegro') || text.includes('mne.1')) return 'mne.1';
    if (text.includes('qatar') || text.includes('qat.1')) return 'qat.1';
    if (text.includes('iraq') || text.includes('irq.1')) return 'irq.1';
    if (text.includes('jordan') || text.includes('jor.1')) return 'jor.1';
    if (text.includes('bahrain') || text.includes('bhr.1')) return 'bhr.1';

    if (text.includes('austrian') || text.includes('aut.1')) return 'aut.1';
    if (text.includes('swiss') || text.includes('sui.1')) return 'sui.1';
    if (text.includes('danish') || text.includes('den.1')) return 'den.1';
    if (text.includes('greek') || text.includes('gre.1')) return 'gre.1';
    if (text.includes('allsvenskan') || text.includes('swe.1')) return 'swe.1';
    if (text.includes('eliteserien') || text.includes('nor.1')) return 'nor.1';
    if (text.includes('j1') || text.includes('j.league') || text.includes('jpn.1')) return 'jpn.1';
    if (text.includes('a-league') || text.includes('aus.1')) return 'aus.1';
    if (text.includes('chinese') || text.includes('csl') || text.includes('chn.1')) return 'chn.1';
    if (text.includes('veikkausliiga') || text.includes('fin.1')) return 'fin.1';
    if (text.includes('iceland') || text.includes('besta deild') || text.includes('isl.1')) return 'isl.1';

    // Universal clean fallback: derive from altGameNote or compDesc so NO live matches are ever dropped
    const cleanTitle = (altGameNote || compDesc || '').split(',')[0].trim();
    if (cleanTitle) {
        const slugified = cleanTitle.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '').slice(0, 32);
        if (slugified.length >= 3) return slugified;
    }
    return null;
}

function formatLiveScoreLogo(img) {
    if (!img) return '';
    if (img.startsWith('http')) {
        return img.replace('https://static.livescore.com/', 'https://storage.livescore.com/images/team/medium/');
    }
    const clean = img.replace(/^\/+/, '');
    return `https://storage.livescore.com/images/team/medium/${clean}`;
}

async function fetchLiveScoreMatchDetails(eventId) {
    if (!eventId) return null;
    const eid = String(eventId).trim();

    try {
        const [statsData, incsData, lineupsData, infoData] = await Promise.all([
            fetchJson(`https://prod-public-api.livescore.com/v1/api/app/statistics/soccer/${eid}`).catch(() => null),
            fetchJson(`https://prod-public-api.livescore.com/v1/api/app/incidents/soccer/${eid}`).catch(() => null),
            fetchJson(`https://prod-public-api.livescore.com/v1/api/app/lineups/soccer/${eid}`).catch(() => null),
            fetchJson(`https://prod-public-api.livescore.com/v1/api/app/info/soccer/${eid}`).catch(() => null)
        ]);

        const result = {};

        // 1. In-play boxscore statistics
        if (statsData?.Stat?.length) {
            const hStat = statsData.Stat.find(s => s.Tnb === 1) || statsData.Stat[0] || {};
            const aStat = statsData.Stat.find(s => s.Tnb === 2) || statsData.Stat[1] || {};

            const mapStats = (s) => [
                { name: 'possessionPct', displayName: 'Possession', displayValue: `${s.Pss ?? 50}%`, value: s.Pss ?? 50 },
                { name: 'shotsOnTarget', displayName: 'Shots on Target', displayValue: `${s.Shon ?? 0}`, value: s.Shon ?? 0 },
                { name: 'shotsOffTarget', displayName: 'Shots off Target', displayValue: `${s.Shof ?? 0}`, value: s.Shof ?? 0 },
                { name: 'totalShots', displayName: 'Total Shots', displayValue: `${(s.Shon || 0) + (s.Shof || 0) + (s.Shbl || 0)}`, value: (s.Shon || 0) + (s.Shof || 0) + (s.Shbl || 0) },
                { name: 'wonCorners', displayName: 'Corner Kicks', displayValue: `${s.Cos ?? 0}`, value: s.Cos ?? 0 },
                { name: 'foulsCommited', displayName: 'Fouls', displayValue: `${s.Fls ?? 0}`, value: s.Fls ?? 0 },
                { name: 'offsides', displayName: 'Offsides', displayValue: `${s.Ofs ?? 0}`, value: s.Ofs ?? 0 },
                { name: 'yellowCards', displayName: 'Yellow Cards', displayValue: `${s.Ycs ?? 0}`, value: s.Ycs ?? 0 },
                { name: 'redCards', displayName: 'Red Cards', displayValue: `${s.Rcs ?? 0}`, value: s.Rcs ?? 0 },
                { name: 'saves', displayName: 'Goalkeeper Saves', displayValue: `${s.Gks ?? 0}`, value: s.Gks ?? 0 }
            ];

            result.boxscore = {
                teams: [
                    { id: 'home', homeAway: 'home', statistics: mapStats(hStat) },
                    { id: 'away', homeAway: 'away', statistics: mapStats(aStat) }
                ]
            };
        }

        // 2. Key events / match timeline (goals, cards, substitutions)
        if (incsData?.Incs) {
            const keyEvents = [];
            const periods = Object.keys(incsData.Incs);
            for (const p of periods) {
                for (const inc of (incsData.Incs[p] || [])) {
                    const min = inc.Min || 0;
                    const isHome = inc.Nm === 1;
                    let type = 'event';
                    let text = inc.Pn || inc.Fn ? `${inc.Fn || ''} ${inc.Ln || inc.Pn || ''}`.trim() : 'Event';
                    let scoringPlay = false;
                    let yellowCard = false;
                    let redCard = false;
                    let substitution = false;

                    if (inc.IT === 36 || inc.IT === 37) {
                        type = 'Goal';
                        scoringPlay = true;
                        text = `Goal! ${text}`;
                        if (inc.Sc) text += ` (${inc.Sc[0]}-${inc.Sc[1]})`;
                    } else if (inc.IT === 43) {
                        type = 'Yellow Card';
                        yellowCard = true;
                        text = `Yellow Card: ${text}`;
                    } else if (inc.IT === 44 || inc.IT === 45) {
                        type = 'Red Card';
                        redCard = true;
                        text = `Red Card: ${text}`;
                    } else if (inc.IT === 46 || inc.IT === 47) {
                        type = 'Substitution';
                        substitution = true;
                        text = `Substitution: ${text}`;
                    }

                    keyEvents.push({
                        id: `ls-${min}-${inc.IT || 0}-${inc.ID || Math.random()}`,
                        clock: `${min}'`,
                        clockValue: min,
                        scoringPlay,
                        yellowCard,
                        redCard,
                        substitution,
                        text,
                        type: { text: type, type },
                        team: { side: isHome ? 'home' : 'away' },
                        athletesInvolved: inc.Pn ? [{ displayName: inc.Pn, shortName: inc.Ln || inc.Pn }] : []
                    });
                }
            }
            if (keyEvents.length) result.keyEvents = keyEvents;
        }

        // 3. Lineups and rosters
        if (lineupsData?.Lu?.length) {
            const rosters = [];
            for (const lu of lineupsData.Lu) {
                const isHome = lu.Tnb === 1;
                const roster = (lu.Ps || []).map(p => ({
                    jersey: String(p.Snu || ''),
                    starter: true,
                    athlete: {
                        displayName: `${p.Fn || ''} ${p.Ln || ''}`.trim() || p.Pn || 'Player',
                        position: { abbreviation: p.Pon ? p.Pon.slice(0, 3).toUpperCase() : 'POS' }
                    },
                    position: { abbreviation: p.Pon ? p.Pon.slice(0, 3).toUpperCase() : 'POS' }
                }));
                rosters.push({
                    team: { side: isHome ? 'home' : 'away' },
                    roster
                });
            }
            if (rosters.length) result.rosters = rosters;
        }

        // 4. Stadium / venue info
        if (infoData?.Vnm) {
            result.gameInfo = {
                venue: {
                    fullName: infoData.Vnm,
                    address: {
                        city: infoData.Vcy || '',
                        country: infoData.VCnm || ''
                    }
                }
            };
        }

        return Object.keys(result).length > 0 ? result : null;
    } catch {
        return null;
    }
}

async function syncLiveScoreInPlay() {
    const now = new Date();
    let updatedCount = 0;
    try {
        const todayStr = formatDateToScoreboard(now);
        const [liveData, dateData] = await Promise.all([
            fetchJson('https://prod-public-api.livescore.com/v1/api/app/live/soccer/0').catch(() => null),
            fetchJson(`https://prod-public-api.livescore.com/v1/api/app/date/soccer/${todayStr}/0`).catch(() => null)
        ]);

        const stages = [];
        if (dateData && Array.isArray(dateData.Stages)) stages.push(...dateData.Stages);
        if (liveData && Array.isArray(liveData.Stages)) stages.push(...liveData.Stages);

        if (stages.length === 0) return 0;

        const activeLiveEventIds = new Set();
        if (liveData && Array.isArray(liveData.Stages)) {
            for (const stage of liveData.Stages) {
                for (const ev of (stage.Events || [])) {
                    if (ev.Eid) activeLiveEventIds.add(String(ev.Eid));
                }
            }
        }

        for (const stage of stages) {
            const country = stage.Cnm || stage.Sdn || 'International';
            const leagueName = stage.Snm || 'Football Competition';
            const cLower = country.toLowerCase();

            let targetSlug = 'int.misc';
            if (cLower.includes('indonesia')) targetSlug = 'idn.1';
            else if (cLower.includes('vietnam')) targetSlug = 'vie.1';
            else if (cLower.includes('thailand')) targetSlug = 'tha.1';
            else if (cLower.includes('malaysia')) targetSlug = 'mys.1';
            else if (cLower.includes('singapore')) targetSlug = 'sgp.1';
            else if (cLower.includes('kenya')) targetSlug = 'ken.1';
            else if (cLower.includes('ghana')) targetSlug = 'gha.1';
            else if (cLower.includes('uganda')) targetSlug = 'uga.1';
            else if (cLower.includes('india')) targetSlug = 'ind.1';
            else if (cLower.includes('iran')) targetSlug = 'irn.1';
            else if (cLower.includes('emirates') || cLower.includes('uae')) targetSlug = 'uae.1';
            else if (cLower.includes('uzbekistan')) targetSlug = 'uzb.1';
            else if (cLower.includes('romania')) targetSlug = 'rou.2';
            else if (cLower.includes('montenegro')) targetSlug = 'mne.1';
            else if (cLower.includes('qatar')) targetSlug = 'qat.1';
            else if (cLower.includes('iraq')) targetSlug = 'irq.1';
            else if (cLower.includes('jordan')) targetSlug = 'jor.1';
            else if (cLower.includes('bahrain')) targetSlug = 'bhr.1';
            else if (cLower.includes('egypt')) targetSlug = 'egy.1';
            else if (cLower.includes('saudi')) targetSlug = 'ksa.1';
            else if (cLower.includes('colombia')) targetSlug = 'col.1';
            else if (cLower.includes('morocco')) targetSlug = 'mar.1';
            else if (cLower.includes('nigeria')) targetSlug = 'nga.1';
            else if (cLower.includes('south africa')) targetSlug = 'rsa.1';
            else if (cLower.includes('brazil')) targetSlug = 'bra.1';
            else if (cLower.includes('argentina')) targetSlug = 'arg.1';
            else if (cLower.includes('england')) targetSlug = 'eng.1';
            else if (cLower.includes('spain')) targetSlug = 'esp.1';
            else if (cLower.includes('italy')) targetSlug = 'ita.1';
            else if (cLower.includes('germany')) targetSlug = 'ger.1';
            else if (cLower.includes('france')) targetSlug = 'fra.1';
            else if (cLower.includes('peru')) targetSlug = 'per.1';
            else if (cLower.includes('bolivia')) targetSlug = 'bol.1';
            else if (cLower.includes('ecuador')) targetSlug = 'ecu.1';
            else if (cLower.includes('paraguay')) targetSlug = 'par.1';
            else if (cLower.includes('venezuela')) targetSlug = 'ven.1';
            else if (cLower.includes('uruguay')) targetSlug = 'uru.1';
            else if (cLower.includes('costa rica')) targetSlug = 'crc.1';
            else if (cLower.includes('honduras')) targetSlug = 'hon.1';
            else if (cLower.includes('guatemala')) targetSlug = 'gua.1';
            else if (cLower.includes('iceland')) targetSlug = 'isl.1';
            else {
                const cSlug = (stage.Ccd || country).toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 3);
                const sSlug = (stage.Scd || leagueName).toLowerCase().replace(/[^a-z0-9]+/g, '.').slice(0, 16);
                targetSlug = `${cSlug}.${sSlug}`.replace(/^\.+|\.+$/g, '');
            }

            const leagueDef = TARGET_LEAGUES.find(l => l.slug === targetSlug) || {
                slug: targetSlug,
                name: `${country} ${leagueName}`,
                abbreviation: leagueName.slice(0, 16),
                country,
                kind: 'club'
            };

            await SoccerLeague.updateOne(
                { slug: targetSlug },
                {
                    $setOnInsert: {
                        slug: targetSlug,
                        name: leagueDef.name,
                        abbreviation: leagueDef.abbreviation || leagueName.slice(0, 16),
                        country: leagueDef.country || country,
                        kind: 'club',
                        active: true,
                        sort_order: 90
                    }
                },
                { upsert: true }
            ).catch(() => {});

            for (const ev of (stage.Events || [])) {
                const eid = String(ev.Eid);
                const h = ev.T1?.[0] || {};
                const a = ev.T2?.[0] || {};
                const homeName = h.Nm || 'Home Club';
                const awayName = a.Nm || 'Away Club';
                const homeScore = parseInt(ev.Tr1 || 0, 10);
                const awayScore = parseInt(ev.Tr2 || 0, 10);
                const rawClock = String(ev.Eps || ev.Epr || 'NS');

                const isNotStarted = rawClock === 'NS' || rawClock === 'Upcoming' || rawClock.includes(':');
                const isFinished = rawClock === 'FT' || rawClock === 'AET' || rawClock === 'AP';
                const isPostponed = rawClock.includes('Postp') || rawClock.includes('Canc');
                const isInPlay = !isNotStarted && !isFinished && !isPostponed && (rawClock.includes("'") || rawClock === 'HT' || rawClock === 'Live' || (!isNaN(parseInt(rawClock, 10)) && rawClock !== 'FT'));
                const state = isInPlay ? 'in' : (isFinished || isPostponed) ? 'post' : 'pre';
                const displayClock = isFinished ? 'FT' : isPostponed ? 'Postp.' : (isInPlay ? rawClock : 'NS');

                let matchDate = now;
                if (ev.Esd && String(ev.Esd).length >= 12) {
                    const s = String(ev.Esd);
                    const yr = parseInt(s.slice(0, 4), 10);
                    const mo = parseInt(s.slice(4, 6), 10) - 1;
                    const da = parseInt(s.slice(6, 8), 10);
                    const hr = parseInt(s.slice(8, 10), 10);
                    const mi = parseInt(s.slice(10, 12), 10);
                    matchDate = new Date(Date.UTC(yr, mo, da, hr, mi));
                }

                const scoreboardDate = formatDateToScoreboard(matchDate);
                const homeCrest = formatLiveScoreLogo(h.Img);
                const awayCrest = formatLiveScoreLogo(a.Img);

                const existingMatch = await SoccerMatch.findOne({
                    $or: [
                        { 'source.event_id': eid },
                        {
                            league_slug: targetSlug,
                            scoreboard_date: scoreboardDate,
                            'home.name': homeName,
                            'away.name': awayName
                        }
                    ]
                }).select('home.logo away.logo').lean();

                const finalHomeLogo = homeCrest || existingMatch?.home?.logo || '';
                const finalAwayLogo = awayCrest || existingMatch?.away?.logo || '';

                const matchDoc = {
                    source: {
                        provider: 'livescore',
                        event_id: eid,
                        competition_id: String(stage.CompId || stage.Sid || targetSlug),
                        uid: `ls:${eid}`,
                        modified_at: now
                    },
                    league_slug: targetSlug,
                    scoreboard_date: scoreboardDate,
                    date: matchDate,
                    name: `${homeName} vs ${awayName}`,
                    short_name: `${h.Abr || homeName.slice(0, 3)} vs ${a.Abr || awayName.slice(0, 3)}`,
                    season: {
                        year: matchDate.getUTCFullYear(),
                        type_id: '1',
                        slug: 'regular-season',
                        name: `${leagueDef.name} ${matchDate.getUTCFullYear()}`
                    },
                    status: {
                        state,
                        name: state === 'in' ? 'STATUS_IN_PROGRESS' : state === 'post' ? 'STATUS_FINAL' : 'STATUS_SCHEDULED',
                        description: state === 'in' ? 'In Progress' : state === 'post' ? (isPostponed ? 'Postponed' : 'Full Time') : 'Scheduled',
                        detail: displayClock,
                        short_detail: displayClock,
                        clock: displayClock,
                        clock_seconds: parseInt(displayClock, 10) ? parseInt(displayClock, 10) * 60 : (displayClock === 'HT' ? 2700 : 0),
                        period: ev.Epr || (displayClock === 'HT' ? 1 : 2),
                        completed: isFinished,
                        suspended: isPostponed
                    },
                    home: {
                        source_id: String(h.ID || homeName.toLowerCase().replace(/[^a-z0-9]+/g, '-')),
                        name: homeName,
                        display_name: homeName,
                        abbreviation: h.Abr || homeName.slice(0, 3).toUpperCase(),
                        logo: finalHomeLogo,
                        score: isNaN(homeScore) ? 0 : homeScore,
                        winner: isFinished && homeScore > awayScore,
                        form: ''
                    },
                    away: {
                        source_id: String(a.ID || awayName.toLowerCase().replace(/[^a-z0-9]+/g, '-')),
                        name: awayName,
                        display_name: awayName,
                        abbreviation: a.Abr || awayName.slice(0, 3).toUpperCase(),
                        logo: finalAwayLogo,
                        score: isNaN(awayScore) ? 0 : awayScore,
                        winner: isFinished && awayScore > homeScore,
                        form: ''
                    },
                    venue: {
                        name: 'Stadium',
                        city: country,
                        country
                    },
                    attendance: 0,
                    note: leagueDef.name,
                    play_by_play_available: true,
                    broadcasts: [],
                    key_events: [],
                    last_synced_at: now
                };

                await SoccerMatch.updateOne(
                    {
                        $or: [
                            { 'source.event_id': eid },
                            {
                                league_slug: targetSlug,
                                scoreboard_date: scoreboardDate,
                                'home.name': homeName,
                                'away.name': awayName
                            }
                        ]
                    },
                    {
                        $set: matchDoc,
                        $setOnInsert: { created_at: now }
                    },
                    { upsert: true }
                );

                const homeClubSet = {
                    name: homeName,
                    display_name: homeName,
                    abbreviation: h.Abr || homeName.slice(0, 3).toUpperCase(),
                    country,
                    active: true,
                    last_synced_at: now
                };
                if (finalHomeLogo) homeClubSet.logo = finalHomeLogo;

                await SoccerClub.updateOne(
                    { source_id: String(h.ID || homeName.toLowerCase().replace(/[^a-z0-9]+/g, '-')) },
                    {
                        $set: homeClubSet,
                        $addToSet: { league_slugs: targetSlug },
                        $setOnInsert: {
                            slug: homeName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
                            created_at: now
                        }
                    },
                    { upsert: true }
                ).catch(() => {});

                const awayClubSet = {
                    name: awayName,
                    display_name: awayName,
                    abbreviation: a.Abr || awayName.slice(0, 3).toUpperCase(),
                    country,
                    active: true,
                    last_synced_at: now
                };
                if (finalAwayLogo) awayClubSet.logo = finalAwayLogo;

                await SoccerClub.updateOne(
                    { source_id: String(a.ID || awayName.toLowerCase().replace(/[^a-z0-9]+/g, '-')) },
                    {
                        $set: awayClubSet,
                        $addToSet: { league_slugs: targetSlug },
                        $setOnInsert: {
                            slug: awayName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
                            created_at: now
                        }
                    },
                    { upsert: true }
                ).catch(() => {});

                updatedCount++;
            }
        }

        // Clean up any stale livescore in-play matches that have concluded (started > 130 minutes ago) and are no longer in the active live feed
        const twoHoursTenMinsAgo = new Date(Date.now() - 130 * 60 * 1000);
        await SoccerMatch.updateMany(
            {
                'source.provider': 'livescore',
                'status.state': 'in',
                date: { $lt: twoHoursTenMinsAgo },
                'source.event_id': { $nin: [...activeLiveEventIds] }
            },
            {
                $set: {
                    'status.state': 'post',
                    'status.name': 'STATUS_FINAL',
                    'status.description': 'Full Time',
                    'status.detail': 'FT',
                    'status.short_detail': 'FT',
                    'status.clock': 'FT',
                    'status.completed': true
                }
            }
        );
    } catch (err) {
        console.warn('[LiveSync] LiveScore in-play ingest notice:', err.message);
    }
    return updatedCount;
}

const REGIONAL_SCOREBOARD_FEEDS = [
    'idn.1', 'tha.1', 'mys.1', 'sgp.1', 'ken.1', 'gha.1', 'uga.1',
    'afc.cup', 'ind.1', 'ind.2', 'per.1', 'bol.1', 'ecu.1', 'par.1', 'ven.1', 'uru.1'
];

async function syncLiveScoreboards() {
    const now = new Date();
    let updatedCount = 0;
    try {
        const todayStr = formatDateToScoreboard(now);
        const allUrl = `https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard?dates=${todayStr}&limit=300`;

        const scoreboardFetches = [
            fetchJson(allUrl).catch(() => ({ events: [] })),
            ...REGIONAL_SCOREBOARD_FEEDS.map(slug =>
                fetchJson(`https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/scoreboard`)
                    .then(data => ({
                        events: (data.events || []).map(e => ({ ...e, _forcedLeagueSlug: slug }))
                    }))
                    .catch(() => ({ events: [] }))
            )
        ];

        const feedResults = await Promise.all(scoreboardFetches);
        const events = [];
        const seenEvIds = new Set();
        for (const res of feedResults) {
            for (const ev of (res.events || [])) {
                if (!seenEvIds.has(String(ev.id))) {
                    seenEvIds.add(String(ev.id));
                    events.push(ev);
                }
            }
        }

        for (const ev of events) {
            const comp = ev.competitions?.[0];
            if (!comp) continue;

            const competitors = comp.competitors || [];
            const homeComp = competitors.find(c => c.homeAway === 'home') || competitors[0];
            const awayComp = competitors.find(c => c.homeAway === 'away') || competitors[1];
            if (!homeComp || !awayComp) continue;

            const statusType = ev.status?.type || {};
            const state = ['pre', 'in', 'post'].includes(statusType.state) ? statusType.state : 'pre';
            const homeScore = parseInt(homeComp.score, 10);
            const awayScore = parseInt(awayComp.score, 10);

            const existingMatch = await SoccerMatch.findOne({ 'source.event_id': String(ev.id) }).select('_id league_slug status').lean();

            let targetSlug = ev._forcedLeagueSlug || resolveLeagueSlug(comp.altGameNote || '', comp.notes?.[0]?.headline || '', ev.uid || '');
            if (!targetSlug) {
                targetSlug = existingMatch?.league_slug;
            }

            if (!targetSlug) {
                continue;
            }

            const leagueDef = TARGET_LEAGUES.find(l => l.slug === targetSlug) || {
                slug: targetSlug,
                name: comp.altGameNote ? comp.altGameNote.split(',')[0].trim() : 'Football Competition',
                abbreviation: comp.altGameNote ? comp.altGameNote.split(',')[0].trim().slice(0, 16) : 'Soccer',
                country: 'International',
                kind: 'club'
            };

            if (!TARGET_LEAGUES.some(l => l.slug === targetSlug)) {
                await SoccerLeague.updateOne(
                    { slug: targetSlug },
                    {
                        $setOnInsert: {
                            slug: targetSlug,
                            name: leagueDef.name,
                            abbreviation: leagueDef.abbreviation || leagueDef.name.slice(0, 16),
                            country: leagueDef.country || 'International',
                            kind: 'club',
                            active: true,
                            sort_order: 99
                        }
                    },
                    { upsert: true }
                ).catch(() => {});
            }

            const updateFields = {
                league_slug: targetSlug,
                'status.state': state,
                'status.name': statusType.name || (state === 'in' ? 'STATUS_IN_PROGRESS' : state === 'post' ? 'STATUS_FINAL' : 'STATUS_SCHEDULED'),
                'status.description': statusType.description || (state === 'in' ? 'In Progress' : state === 'post' ? 'Full Time' : 'Scheduled'),
                'status.detail': statusType.detail || ev.status?.displayClock || (state === 'in' ? "45'" : state === 'post' ? 'FT' : 'Scheduled'),
                'status.short_detail': statusType.shortDetail || (state === 'in' ? "45'" : state === 'post' ? 'FT' : 'Scheduled'),
                'status.clock': ev.status?.displayClock || '',
                'status.clock_seconds': ev.status?.clock || 0,
                'status.period': ev.status?.period || 1,
                'status.completed': statusType.completed || state === 'post',
                'home.score': isNaN(homeScore) ? 0 : homeScore,
                'away.score': isNaN(awayScore) ? 0 : awayScore,
                'home.winner': homeComp.winner === true,
                'away.winner': awayComp.winner === true,
                'last_synced_at': now
            };

            if (existingMatch) {
                await SoccerMatch.updateOne(
                    { _id: existingMatch._id },
                    { $set: updateFields }
                );
            } else {
                await processEvents([ev], targetSlug, leagueDef, ev.season || {}, now);
            }
            updatedCount++;
        }

        // Ingest real-time in-play matches across Asian, African, and European regional leagues
        const liveInPlayCount = await syncLiveScoreInPlay();
        updatedCount += liveInPlayCount;
    } catch (err) {
        console.warn('[LiveSync] Real-time scoreboard tick warning:', err.message);
    }
    return updatedCount;
}

module.exports = {
    syncLeague,
    syncAllLeagues,
    syncLiveScoreboards,
    syncLiveScoreInPlay,
    fetchLiveScoreMatchDetails,
    formatLiveScoreLogo,
    resolveLeagueSlug,
    TARGET_LEAGUES
};
