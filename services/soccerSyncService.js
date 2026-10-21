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
    { slug: 'fra.coupe_de_france', name: 'Coupe de France', abbreviation: 'Coupe de France', country: 'France', kind: 'club', sort_order: 32 }
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
        const sbData = await fetchJson(scoreboardUrl);

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
    if (text.includes('championship') || text.includes('eng.2')) return 'eng.2';
    if (text.includes('fa cup') || text.includes('eng.fa')) return 'eng.fa';
    if (text.includes('carabao') || text.includes('league cup') || text.includes('eng.league_cup')) return 'eng.league_cup';
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
    if (text.includes('belgian') || text.includes('pro league') || text.includes('bel.1')) return 'bel.1';
    if (text.includes('super lig') || text.includes('süper lig') || text.includes('tur.1')) return 'tur.1';
    if (text.includes('scottish') || text.includes('premiership') || text.includes('sco.1')) return 'sco.1';
    if (text.includes('mls') || text.includes('major league soccer') || text.includes('usa.1')) return 'usa.1';
    if (text.includes('saudi') || text.includes('ksa.1')) return 'ksa.1';
    if (text.includes('brasileir') || text.includes('bra.1')) return 'bra.1';
    if (text.includes('argentin') || text.includes('arg.1')) return 'arg.1';
    if (text.includes('liga mx') || text.includes('mex.1')) return 'mex.1';
    if (text.includes('libertadores') || text.includes('conmebol.libertadores')) return 'conmebol.libertadores';
    if (text.includes('sudamericana') || text.includes('conmebol.sudamericana')) return 'conmebol.sudamericana';
    return null;
}

async function syncLiveScoreboards() {
    const now = new Date();
    let updatedCount = 0;
    try {
        const todayStr = formatDateToScoreboard(now);
        const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard?dates=${todayStr}&limit=300`;
        const data = await fetchJson(url);
        const events = data.events || [];

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

            let targetSlug = existingMatch?.league_slug;
            if (!targetSlug) {
                targetSlug = resolveLeagueSlug(comp.altGameNote || '', comp.notes?.[0]?.headline || '', ev.uid || '');
            }

            if (!targetSlug) {
                continue;
            }

            const leagueDef = TARGET_LEAGUES.find(l => l.slug === targetSlug) || {
                slug: targetSlug,
                name: comp.altGameNote || 'Football Competition',
                country: 'International'
            };

            const updateFields = {
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
    } catch (err) {
        console.warn('[LiveSync] Real-time scoreboard tick warning:', err.message);
    }
    return updatedCount;
}

module.exports = {
    syncLeague,
    syncAllLeagues,
    syncLiveScoreboards,
    resolveLeagueSlug,
    TARGET_LEAGUES
};
