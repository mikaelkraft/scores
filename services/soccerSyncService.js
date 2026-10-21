/**
 * Norra AI Soccer Live Telemetry & Scoreboard Synchronization Service
 * 
 * Fetches real-time scores, schedules, standings and club profiles
 * and normalizes them into MongoDB Atlas (soccer_* collections).
 */

const https = require('https');
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
    { slug: 'uefa.europa', name: 'UEFA Europa League', abbreviation: 'Europa League', country: 'International', kind: 'club', sort_order: 7 }
];

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, { headers: { 'User-Agent': 'NorraScores/2.1' } }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return fetchJson(res.headers.location).then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) {
                return reject(new Error(`HTTP ${res.statusCode} fetching ${url}`));
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        });
        req.on('error', reject);
        req.setTimeout(12000, () => {
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

async function syncLeague(leagueDef) {
    const slug = leagueDef.slug;
    const now = new Date();
    let matchCount = 0;
    let standingCount = 0;

    try {
        // 1. Fetch Scoreboard Data
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

        // 2. Process Matches / Events
        const events = sbData.events || [];
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
                { 'source.provider': 'upstream', league_slug: slug, 'source.event_id': String(ev.id) },
                {
                    $set: matchDoc,
                    $setOnInsert: { created_at: now }
                },
                { upsert: true }
            );
            matchCount++;
        }

        // 3. Process Standings
        try {
            const standingsUrl = `https://site.api.espn.com/apis/v2/sports/soccer/${slug}/standings`;
            const stData = await fetchJson(standingsUrl);
            const standingsEntries = stData.children?.[0]?.standings?.entries || [];

            if (standingsEntries.length > 0) {
                const mappedEntries = standingsEntries.map((e, idx) => {
                    const statsMap = {};
                    (e.stats || []).forEach(s => {
                        if (s.name && typeof s.value === 'number') {
                            statsMap[s.name] = s.value;
                        }
                    });

                    return {
                        rank: typeof statsMap.rank === 'number' ? statsMap.rank : idx + 1,
                        club: {
                            source_id: String(e.team?.id || idx + 1),
                            display_name: e.team?.displayName || e.team?.name || 'Club',
                            abbreviation: e.team?.abbreviation || '',
                            logo: e.team?.logos?.[0]?.href || e.team?.logo || ''
                        },
                        stats: statsMap
                    };
                });

                await SoccerStanding.updateOne(
                    { league_slug: slug, season_year: season.year || 2026, group_id: 'overall' },
                    {
                        $set: {
                            group_name: 'League Table',
                            entries: mappedEntries,
                            last_synced_at: now
                        },
                        $setOnInsert: { created_at: now }
                    },
                    { upsert: true }
                );
                standingCount++;
            }
        } catch (stErr) {
            // Some knockout/tournament cups do not have round-robin standings
        }

        // Record healthy sync state
        await SoccerSyncState.updateOne(
            { provider: 'upstream', league_slug: slug, resource_type: 'scoreboard', resource_key: 'latest' },
            {
                $set: {
                    status: 'healthy',
                    last_polled_at: now,
                    last_success_at: now,
                    consecutive_errors: 0
                }
            },
            { upsert: true }
        );

        return { slug, success: true, matches: matchCount, standings: standingCount };
    } catch (err) {
        console.warn(`[Sync Warning] Failed syncing ${slug}:`, err.message);
        await SoccerSyncState.updateOne(
            { provider: 'upstream', league_slug: slug, resource_type: 'scoreboard', resource_key: 'latest' },
            {
                $set: {
                    status: 'error',
                    last_polled_at: now,
                    error_message: err.message
                },
                $inc: { consecutive_errors: 1 }
            },
            { upsert: true }
        );
        return { slug, success: false, error: err.message };
    }
}

async function syncAllLeagues() {
    console.log('⚡ [SoccerSync] Starting live telemetry synchronization across world leagues...');
    const results = [];
    for (const league of TARGET_LEAGUES) {
        const res = await syncLeague(league);
        results.push(res);
    }
    const successful = results.filter(r => r.success).length;
    console.log(`✅ [SoccerSync] Completed sync for ${successful}/${TARGET_LEAGUES.length} leagues.`);
    return results;
}

module.exports = {
    TARGET_LEAGUES,
    syncLeague,
    syncAllLeagues
};
