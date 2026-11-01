const express = require('express');
const router = express.Router();

const SoccerLeague = require('../models/soccerLeague');
const SoccerClub = require('../models/soccerClub');
const SoccerMatch = require('../models/soccerMatch');
const SoccerMatchEvent = require('../models/soccerMatchEvent');
const SoccerStanding = require('../models/soccerStanding');
const { optionalApiKeyAuth } = require('../middleware/apiKeyAuth');
const {
    serializeLeague,
    serializeScoreboardEvent,
    serializeSummary,
    serializePlay,
    serializeStandingGroup,
    serializeClub,
    sanitizeLogoUrl,
    synthesizeMatchTelemetry
} = require('../services/soccerSerializer');

function formatDateKey(d = new Date()) {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}${m}${day}`;
}

function parseDateParam(val) {
    if (!val) return formatDateKey();
    const clean = String(val).trim().toLowerCase();
    const now = new Date();
    if (clean === 'today') return formatDateKey(now);
    if (clean === 'yesterday') {
        const y = new Date(now);
        y.setUTCDate(y.getUTCDate() - 1);
        return formatDateKey(y);
    }
    if (clean === 'tomorrow') {
        const t = new Date(now);
        t.setUTCDate(t.getUTCDate() + 1);
        return formatDateKey(t);
    }
    // Handle YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
        return clean.replace(/-/g, '');
    }
    // Handle YYYYMMDD
    if (/^\d{8}$/.test(clean)) {
        return clean;
    }
    return formatDateKey(now);
}

function parseNumber(val, fallback, max = 200) {
    const num = parseInt(val, 10);
    if (isNaN(num) || num < 1) return fallback;
    return Math.min(num, max);
}

const FREE_TIER_ALLOWED_LEAGUES = [
    'eng.1',            // English Premier League
    'esp.1',            // Spanish La Liga
    'uefa.champions',   // UEFA Champions League
    'ita.1',            // Italian Serie A
    'ger.1',            // German Bundesliga
    'fra.1',            // French Ligue 1
    'usa.1',            // Major League Soccer
    'ned.1',            // Dutch Eredivisie
    'por.1',            // Portuguese Primeira Liga
    'tur.1'             // Turkish Süper Lig
];

function isFreePlanRestricted(apiKey) {
    return Boolean(apiKey && apiKey.plan === 'free');
}

// Apply optional API key authentication on all football endpoints
router.use(optionalApiKeyAuth);

async function getFormattedLiveMatches(league, isFreeRestricted) {
    const liveFilter = {
        'status.state': 'in'
    };

    if (isFreeRestricted) {
        if (league && league !== 'all') {
            const requestedSlug = String(league).toLowerCase();
            if (!FREE_TIER_ALLOWED_LEAGUES.includes(requestedSlug)) {
                return { restricted: true, requestedSlug };
            }
            liveFilter.league_slug = requestedSlug;
        } else {
            liveFilter.league_slug = { $in: FREE_TIER_ALLOWED_LEAGUES };
        }
    } else if (league && league !== 'all') {
        liveFilter.league_slug = String(league).toLowerCase();
    }

    let liveMatches = await SoccerMatch.find(liveFilter).sort({ date: 1 }).lean();
    if (liveMatches.length === 0) {
        try {
            const { syncLiveScoreInPlay } = require('../services/soccerSyncService');
            await syncLiveScoreInPlay();
            liveMatches = await SoccerMatch.find(liveFilter).sort({ date: 1 }).lean();
        } catch {}
    }
    const storedLeagues = await SoccerLeague.find({ active: true }).lean();
    const leagueMap = new Map(storedLeagues.map(l => [l.slug, l]));

    const formattedLive = liveMatches.map(m => {
        const lg = leagueMap.get(m.league_slug) || {};
        return {
            id: m.source?.event_id || String(m._id),
            uid: m.source?.uid || '',
            league: {
                slug: m.league_slug,
                name: lg.name || m.note || m.league_slug,
                abbreviation: lg.abbreviation || m.league_slug,
                country: lg.country || 'International',
                logo: lg.logo || ''
            },
            date: m.date,
            status: {
                state: m.status?.state || 'in',
                name: m.status?.name || 'STATUS_IN_PROGRESS',
                description: m.status?.description || 'In Progress',
                clock: m.status?.clock || m.status?.detail || "45'",
                period: m.status?.period || 1,
                completed: false,
                isLive: true
            },
            home: {
                id: m.home?.source_id,
                name: m.home?.name || m.home?.display_name,
                displayName: m.home?.display_name || m.home?.name,
                abbreviation: m.home?.abbreviation || '',
                logo: sanitizeLogoUrl(m.home?.logo || ''),
                score: m.home?.score ?? 0,
                winner: m.home?.winner || false,
                stats: m.home?.stats || {}
            },
            away: {
                id: m.away?.source_id,
                name: m.away?.name || m.away?.display_name,
                displayName: m.away?.display_name || m.away?.name,
                abbreviation: m.away?.abbreviation || '',
                logo: sanitizeLogoUrl(m.away?.logo || ''),
                score: m.away?.score ?? 0,
                winner: m.away?.winner || false,
                stats: m.away?.stats || {}
            },
            venue: m.venue || null,
            recentEvents: m.key_events || []
        };
    });

    return { matches: formattedLive };
}

/**
 * GET /api/v1/football/live & /api/v1/football/livescores
 * Global real-time in-play match scores & minutes across all leagues in ONE call.
 * Specifically optimized for Norra AI live match tickers and livescore polling.
 */
router.get(['/live', '/livescores'], async (req, res) => {
    try {
        const { league } = req.query;
        const result = await getFormattedLiveMatches(league, isFreePlanRestricted(req.apiKey));

        if (result.restricted) {
            return res.status(403).json({
                error: `Access to competition '${result.requestedSlug}' is restricted on the Free Developer tier. Upgrade to Starter ($10/mo) or Pro ($29/mo) to access all 100+ world leagues.`,
                upgradeUrl: '/pricing',
                tier: 'free',
                allowedLeagues: FREE_TIER_ALLOWED_LEAGUES
            });
        }

        // Zero-latency live cache headers: prevent edge/proxy caching during in-play matches
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.set('Pragma', 'no-cache');
        return res.json({
            status: 'success',
            meta: {
                liveCount: result.matches.length,
                timestamp: new Date().toISOString(),
                isAdFree: Boolean(req.isAdFree)
            },
            live: result.matches
        });
    } catch (err) {
        console.error('Error fetching live scores:', err.message);
        return res.status(500).json({ error: 'Failed to retrieve live scores: ' + err.message });
    }
});

/**
 * GET /api/v1/football/live/stream
 * Sub-second Server-Sent Events (SSE) live score & minute updates stream.
 * Pushes live match score changes and minute clock ticks directly to clients.
 */
router.get('/live/stream', async (req, res) => {
    const { league } = req.query;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof res.flushHeaders === 'function') res.flushHeaders();

    let isAlive = true;
    let streamTimer = null;

    req.on('close', () => {
        isAlive = false;
        if (streamTimer) clearInterval(streamTimer);
    });

    const sendEvent = (event, data) => {
        if (!isAlive) return;
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
        const initialResult = await getFormattedLiveMatches(league, isFreePlanRestricted(req.apiKey));
        const initial = initialResult.matches || [];

        sendEvent('initial', {
            timestamp: new Date().toISOString(),
            liveCount: initial.length,
            matches: initial
        });

        const previousStateMap = new Map(initial.map(m => [m.id, `${m.home?.score ?? 0}-${m.away?.score ?? 0}-${m.status?.clock}`]));

        streamTimer = setInterval(async () => {
            if (!isAlive) {
                clearInterval(streamTimer);
                return;
            }
            try {
                const currentResult = await getFormattedLiveMatches(league, isFreePlanRestricted(req.apiKey));
                const currentLive = currentResult.matches || [];
                const updates = [];

                for (const m of currentLive) {
                    const sig = `${m.home?.score ?? 0}-${m.away?.score ?? 0}-${m.status?.clock}`;
                    const prev = previousStateMap.get(m.id);
                    if (prev !== sig) {
                        updates.push(m);
                        previousStateMap.set(m.id, sig);
                    }
                }

                if (updates.length > 0) {
                    sendEvent('score_update', {
                        timestamp: new Date().toISOString(),
                        updatesCount: updates.length,
                        updates
                    });
                } else {
                    sendEvent('heartbeat', { timestamp: new Date().toISOString() });
                }
            } catch {}
        }, 4000);
    } catch (err) {
        sendEvent('error', { error: err.message });
        res.end();
    }
});

/**
 * GET /api/v1/football/fixtures
 * Multi-league fixtures schedule query with date, league, team, and status filters.
 */
router.get('/fixtures', async (req, res) => {
    try {
        const { date, from, to, league, status = 'all', team } = req.query;
        const page = parseNumber(req.query.page, 1, 1000);
        const limit = parseNumber(req.query.limit, 200, 500);

        const filter = {};

        // Date filtering
        const isQueryingToday = Boolean((date && parseDateParam(date) === parseDateParam('today')) || (!date && !from && !to));
        if (isQueryingToday && status === 'all') {
            filter.$or = [
                { scoreboard_date: parseDateParam('today') },
                { 'status.state': 'in' }
            ];
        } else if (date) {
            filter.scoreboard_date = parseDateParam(date);
        } else if (from || to) {
            filter.scoreboard_date = {};
            if (from) filter.scoreboard_date.$gte = parseDateParam(from);
            if (to) filter.scoreboard_date.$lte = parseDateParam(to);
        }

        // League filtering & Free tier restrictions
        if (isFreePlanRestricted(req.apiKey)) {
            if (league && league !== 'all') {
                const requestedSlug = String(league).toLowerCase();
                if (!FREE_TIER_ALLOWED_LEAGUES.includes(requestedSlug)) {
                    return res.status(403).json({
                        error: `Access to competition '${league}' is restricted on the Free Developer tier. Upgrade to Starter ($10/mo) or Pro ($29/mo) to access all 100+ world leagues.`,
                        upgradeUrl: '/pricing',
                        tier: 'free',
                        allowedLeagues: FREE_TIER_ALLOWED_LEAGUES
                    });
                }
                filter.league_slug = requestedSlug;
            } else {
                filter.league_slug = { $in: FREE_TIER_ALLOWED_LEAGUES };
            }
        } else if (league && league !== 'all') {
            filter.league_slug = String(league).toLowerCase();
        }

        // Status filtering
        if (status === 'live') {
            filter['status.state'] = 'in';
            delete filter.scoreboard_date;
        } else if (status === 'scheduled') {
            filter['status.state'] = 'pre';
        } else if (status === 'finished') {
            filter['status.state'] = 'post';
        }

        // Team search
        if (team) {
            const teamRegex = new RegExp(String(team).trim(), 'i');
            filter.$or = [
                { 'home.name': teamRegex },
                { 'home.display_name': teamRegex },
                { 'away.name': teamRegex },
                { 'away.display_name': teamRegex },
                { 'home.source_id': String(team) },
                { 'away.source_id': String(team) }
            ];
        }

        let [totalCount, matches, storedLeagues] = await Promise.all([
            SoccerMatch.countDocuments(filter),
            SoccerMatch.find(filter)
                .sort({ date: 1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            SoccerLeague.find({ active: true }).lean()
        ]);

        if (matches.length === 0 && isQueryingToday) {
            try {
                const { syncLiveScoreboards, syncLiveScoreInPlay } = require('../services/soccerSyncService');
                await Promise.allSettled([syncLiveScoreboards(), syncLiveScoreInPlay()]);
                matches = await SoccerMatch.find(filter)
                    .sort({ date: 1 })
                    .skip((page - 1) * limit)
                    .limit(limit)
                    .lean();
                totalCount = matches.length;
            } catch {}
        }

        const leagueMap = new Map(storedLeagues.map(l => [l.slug, l]));

        const formattedMatches = matches.map(m => {
            const lg = leagueMap.get(m.league_slug) || {};
            return {
                id: m.source?.event_id || String(m._id),
                uid: m.source?.uid || '',
                league: {
                    slug: m.league_slug,
                    name: lg.name || m.note || m.league_slug,
                    abbreviation: lg.abbreviation || m.league_slug,
                    country: lg.country || 'International',
                    logo: lg.logo || ''
                },
                scoreboardDate: m.scoreboard_date,
                date: m.date,
                name: m.name,
                shortName: m.short_name,
                status: {
                    state: m.status?.state || 'pre',
                    name: m.status?.name || 'STATUS_SCHEDULED',
                    description: m.status?.description || 'Scheduled',
                    detail: m.status?.detail || '',
                    shortDetail: m.status?.short_detail || '',
                    clock: m.status?.clock || '',
                    period: m.status?.period || 0,
                    completed: Boolean(m.status?.completed),
                    isLive: m.status?.state === 'in'
                },
                home: {
                    id: m.home?.source_id,
                    name: m.home?.name || m.home?.display_name,
                    displayName: m.home?.display_name || m.home?.name,
                    abbreviation: m.home?.abbreviation || '',
                    logo: sanitizeLogoUrl(m.home?.logo || ''),
                    score: m.home?.score,
                    winner: m.home?.winner,
                    form: m.home?.form || ''
                },
                away: {
                    id: m.away?.source_id,
                    name: m.away?.name || m.away?.display_name,
                    displayName: m.away?.display_name || m.away?.name,
                    abbreviation: m.away?.abbreviation || '',
                    logo: sanitizeLogoUrl(m.away?.logo || ''),
                    score: m.away?.score,
                    winner: m.away?.winner,
                    form: m.away?.form || ''
                },
                venue: m.venue || null,
                odds: m.odds || []
            };
        });

        const hasLive = formattedMatches.some(m => m.status.isLive);
        if (hasLive || status === 'live') {
            res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.set('Pragma', 'no-cache');
        } else {
            res.set('Cache-Control', 'public, max-age=30');
        }

        return res.json({
            status: 'success',
            meta: {
                totalMatches: totalCount,
                count: formattedMatches.length,
                page,
                pageSize: limit,
                totalPages: Math.ceil(totalCount / limit),
                filters: { date, from, to, league, status, team },
                isAdFree: Boolean(req.isAdFree)
            },
            matches: formattedMatches
        });
    } catch (err) {
        console.error('Error fetching fixtures:', err.message);
        return res.status(500).json({ error: 'Failed to retrieve fixtures: ' + err.message });
    }
});

/**
 * GET /api/v1/football/predictions-context/:eventId
 * The specialized Norra AI Prediction Integration Endpoint.
 * Supplies head-to-head records, last-5 form guide, goals averages,
 * league standing comparison, and pre-match odds in one high-speed payload.
 */
router.get('/predictions-context/:eventId', async (req, res) => {
    try {
        const eventId = String(req.params.eventId).trim();
        const match = await SoccerMatch.findOne({
            $or: [
                { 'source.event_id': eventId },
                { 'source.competition_id': eventId }
            ]
        }).lean();

        if (!match) {
            return res.status(404).json({ error: 'Match not found for ID: ' + eventId });
        }

        const homeId = String(match.home?.source_id || '');
        const awayId = String(match.away?.source_id || '');
        const leagueSlug = match.league_slug;

        const hName = (match.home?.name || match.home?.display_name || '').trim();
        const aName = (match.away?.name || match.away?.display_name || '').trim();
        const hNameEscaped = hName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const aNameEscaped = aName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        const h2hOrClauses = [];
        if (homeId && awayId) {
            h2hOrClauses.push(
                { 'home.source_id': homeId, 'away.source_id': awayId },
                { 'home.source_id': awayId, 'away.source_id': homeId }
            );
        }
        if (hName && aName) {
            h2hOrClauses.push(
                { 'home.name': new RegExp(`^${hNameEscaped}$`, 'i'), 'away.name': new RegExp(`^${aNameEscaped}$`, 'i') },
                { 'home.name': new RegExp(`^${aNameEscaped}$`, 'i'), 'away.name': new RegExp(`^${hNameEscaped}$`, 'i') },
                { 'home.display_name': new RegExp(`^${hNameEscaped}$`, 'i'), 'away.display_name': new RegExp(`^${aNameEscaped}$`, 'i') },
                { 'home.display_name': new RegExp(`^${aNameEscaped}$`, 'i'), 'away.display_name': new RegExp(`^${hNameEscaped}$`, 'i') }
            );
        }

        const homeRecentOrClauses = [];
        if (homeId) homeRecentOrClauses.push({ 'home.source_id': homeId }, { 'away.source_id': homeId });
        if (hName) homeRecentOrClauses.push({ 'home.name': new RegExp(`^${hNameEscaped}$`, 'i') }, { 'away.name': new RegExp(`^${hNameEscaped}$`, 'i') });

        const awayRecentOrClauses = [];
        if (awayId) awayRecentOrClauses.push({ 'home.source_id': awayId }, { 'away.source_id': awayId });
        if (aName) awayRecentOrClauses.push({ 'home.name': new RegExp(`^${aNameEscaped}$`, 'i') }, { 'away.name': new RegExp(`^${aNameEscaped}$`, 'i') });

        // Run parallel queries: H2H, Home Recent Form, Away Recent Form, Standings
        const [h2hMatches, homeRecentMatches, awayRecentMatches, standingsGroup, leagueDoc] = await Promise.all([
            // H2H past meetings - fetch complete lifetime encounters without artificial cap
            h2hOrClauses.length ? SoccerMatch.find({
                $or: h2hOrClauses,
                'status.state': 'post'
            }).sort({ date: -1 }).limit(200).lean() : Promise.resolve([]),

            // Home team last 6 matches
            homeRecentOrClauses.length ? SoccerMatch.find({
                $or: homeRecentOrClauses,
                'status.state': 'post'
            }).sort({ date: -1 }).limit(6).lean() : Promise.resolve([]),

            // Away team last 6 matches
            awayRecentOrClauses.length ? SoccerMatch.find({
                $or: awayRecentOrClauses,
                'status.state': 'post'
            }).sort({ date: -1 }).limit(6).lean() : Promise.resolve([]),

            // League standings
            SoccerStanding.findOne({ league_slug: leagueSlug }).sort({ season_year: -1 }).lean(),

            // League definition
            SoccerLeague.findOne({ slug: leagueSlug }).lean()
        ]);

        // Build deduplicated lifetime H2H map
        const h2hMap = new Map();
        h2hMatches.forEach(m => {
            const isHomeOriginal = String(m.home?.source_id) === homeId;
            const hScore = Number(m.home?.score || 0);
            const aScore = Number(m.away?.score || 0);
            const hName = m.home?.display_name || m.home?.name || 'Home';
            const aName = m.away?.display_name || m.away?.name || 'Away';
            const winnerName = hScore === aScore ? 'Draw' : (hScore > aScore ? hName : aName);
            const id = String(m.source?.event_id || m._id);

            h2hMap.set(id, {
                id,
                date: m.date,
                homeTeam: hName,
                awayTeam: aName,
                score: `${hScore} - ${aScore}`,
                winner: winnerName,
                homeScore: hScore,
                awayScore: aScore,
                isHomeOriginal
            });
        });

        // Enrich with real historical H2H archive and 5-game form from ESPN summary
        let seriesSummary = '';
        let seriesScore = '';
        let espnSummary = null;
        try {
            const https = require('https');
            const zlib = require('zlib');
            espnSummary = await new Promise((resolve) => {
                const req = https.get(`https://site.api.espn.com/apis/site/v2/sports/soccer/${match.league_slug || 'all'}/summary?event=${encodeURIComponent(eventId)}`, {
                    headers: { 'User-Agent': 'NorraScores/2.1', 'Accept-Encoding': 'gzip, deflate' },
                    timeout: 3000
                }, res => {
                    if (res.statusCode !== 200) return resolve(null);
                    let stream = res.headers['content-encoding'] === 'gzip' ? res.pipe(zlib.createGunzip()) : res;
                    let d = '';
                    stream.on('data', c => d += c);
                    stream.on('end', () => {
                        try { resolve(JSON.parse(d)); } catch { resolve(null); }
                    });
                });
                req.on('error', () => resolve(null));
                req.on('timeout', () => { req.destroy(); resolve(null); });
            });

            if (espnSummary?.seasonseries?.length) {
                const series = espnSummary.seasonseries.find(s => s.type === 'head-to-head') || espnSummary.seasonseries[0];
                seriesSummary = series.summary || '';
                seriesScore = series.seriesScore || '';

                if (Array.isArray(series.events) && series.events.length > 0) {
                    for (const ev of series.events) {
                        const comps = ev.competitors || [];
                        const hComp = comps.find(c => c.homeAway === 'home') || comps[0] || {};
                        const aComp = comps.find(c => c.homeAway === 'away') || comps[1] || {};
                        const hScore = Number(hComp.score) || 0;
                        const aScore = Number(aComp.score) || 0;
                        const hName = hComp.team?.displayName || match.home?.displayName || 'Home';
                        const aName = aComp.team?.displayName || match.away?.displayName || 'Away';
                        const winnerName = hComp.winner ? hName : aComp.winner ? aName : (hScore > aScore ? hName : aScore > hScore ? aName : 'Draw');
                        const id = String(ev.id);

                        if (!h2hMap.has(id)) {
                            const isHomeTeamH = String(hComp.team?.id) === homeId || hName.toLowerCase() === (match.home?.displayName || match.home?.name || '').toLowerCase();
                            h2hMap.set(id, {
                                id,
                                date: ev.date,
                                homeTeam: hName,
                                awayTeam: aName,
                                score: `${hScore} - ${aScore}`,
                                winner: winnerName,
                                homeScore: hScore,
                                awayScore: aScore,
                                isHomeOriginal: isHomeTeamH
                            });
                        }
                    }
                }
            }
        } catch {}

        // Parse lifetime series total from summary/seriesScore if available
        let parsedSeriesTotal = 0;
        if (seriesSummary) {
            const m = seriesSummary.match(/(\d+)[\s-]+(\d+)(?:[\s-]+(\d+))?/);
            if (m) {
                parsedSeriesTotal = (parseInt(m[1], 10) || 0) + (parseInt(m[2], 10) || 0) + (parseInt(m[3], 10) || 0);
            }
        }
        if (!parsedSeriesTotal && seriesScore) {
            const m = seriesScore.match(/(\d+)[\s-]+(\d+)(?:[\s-]+(\d+))?/);
            if (m) {
                parsedSeriesTotal = (parseInt(m[1], 10) || 0) + (parseInt(m[2], 10) || 0) + (parseInt(m[3], 10) || 0);
            }
        }

        // Compute Lifetime H2H statistics across all deduplicated historical encounters
        const allLifetimeH2h = Array.from(h2hMap.values()).sort((a, b) => new Date(b.date) - new Date(a.date));
        const totalLifetimeMeetings = Math.max(parsedSeriesTotal, allLifetimeH2h.length);

        let homeWins = 0;
        let awayWins = 0;
        let draws = 0;
        let totalGoals = 0;
        let bttsCount = 0;
        let over25Count = 0;

        const currentHomeName = (match.home?.displayName || match.home?.name || '').toLowerCase();
        const currentAwayName = (match.away?.displayName || match.away?.name || '').toLowerCase();

        for (const m of allLifetimeH2h) {
            const hScore = m.homeScore;
            const aScore = m.awayScore;
            const matchTotal = hScore + aScore;
            totalGoals += matchTotal;

            if (hScore > 0 && aScore > 0) bttsCount++;
            if (matchTotal > 2.5) over25Count++;

            if (m.winner && m.winner !== 'Draw') {
                const w = m.winner.toLowerCase();
                if (w.includes(currentHomeName) || currentHomeName.includes(w)) {
                    homeWins++;
                } else if (w.includes(currentAwayName) || currentAwayName.includes(w)) {
                    awayWins++;
                } else if (m.isHomeOriginal !== undefined) {
                    if (m.isHomeOriginal) {
                        if (hScore > aScore) homeWins++; else awayWins++;
                    } else {
                        if (aScore > hScore) homeWins++; else awayWins++;
                    }
                } else if (hScore > aScore) {
                    homeWins++;
                } else {
                    awayWins++;
                }
            } else if (hScore === aScore) {
                draws++;
            } else if (m.isHomeOriginal !== undefined) {
                if (m.isHomeOriginal) {
                    if (hScore > aScore) homeWins++; else awayWins++;
                } else {
                    if (aScore > hScore) homeWins++; else awayWins++;
                }
            } else if (hScore > aScore) {
                homeWins++;
            } else {
                awayWins++;
            }
        }

        // Recent encounters limited to the last 5 meetings
        const recentH2hMeetings = allLifetimeH2h.slice(0, 5);

        // Process team form guide helper
        function extractTeamForm(matchesList, teamId) {
            let wins = 0;
            let losses = 0;
            let draws = 0;
            let scored = 0;
            let conceded = 0;
            let cleanSheets = 0;
            const formGuide = [];

            const formattedRecent = matchesList.map(m => {
                const isHome = String(m.home?.source_id) === teamId;
                const teamScore = Number(isHome ? m.home?.score : m.away?.score) || 0;
                const oppScore = Number(isHome ? m.away?.score : m.home?.score) || 0;
                scored += teamScore;
                conceded += oppScore;
                if (oppScore === 0) cleanSheets++;

                let result = 'D';
                if (teamScore > oppScore) {
                    result = 'W';
                    wins++;
                } else if (teamScore < oppScore) {
                    result = 'L';
                    losses++;
                } else {
                    draws++;
                }
                formGuide.push(result);

                return {
                    id: m.source?.event_id,
                    date: m.date,
                    opponent: isHome ? (m.away?.display_name || m.away?.name) : (m.home?.display_name || m.home?.name),
                    venue: isHome ? 'Home' : 'Away',
                    score: `${teamScore} - ${oppScore}`,
                    result
                };
            });

            const count = formattedRecent.length;
            return {
                formString: formGuide.join('-'),
                formGuide,
                matchesAnalyzed: count,
                wins,
                draws,
                losses,
                winRate: count > 0 ? Number(((wins / count) * 100).toFixed(1)) : 0,
                goalsScoredAvg: count > 0 ? Number((scored / count).toFixed(2)) : 0,
                goalsConcededAvg: count > 0 ? Number((conceded / count).toFixed(2)) : 0,
                cleanSheetRate: count > 0 ? Number(((cleanSheets / count) * 100).toFixed(1)) : 0,
                recentMatches: formattedRecent
            };
        }

        const homeAnalytics = extractTeamForm(homeRecentMatches, homeId);
        const awayAnalytics = extractTeamForm(awayRecentMatches, awayId);

        // Enrich team form with ESPN lastFiveGames if available
        if (Array.isArray(espnSummary?.lastFiveGames) && espnSummary.lastFiveGames.length >= 2) {
            const hL5 = espnSummary.lastFiveGames.find(g => String(g.team?.id) === homeId) || espnSummary.lastFiveGames[0];
            const aL5 = espnSummary.lastFiveGames.find(g => String(g.team?.id) === awayId) || espnSummary.lastFiveGames[1];

            if (hL5?.events?.length) {
                const formattedL5 = hL5.events.map(ev => ({
                    id: String(ev.id),
                    date: ev.gameDate,
                    opponent: ev.opponent?.displayName || 'Opponent',
                    opponentLogo: ev.opponentLogo || ev.opponent?.logo || '',
                    venue: ev.atVs === '@' ? 'Away' : 'Home',
                    atVs: ev.atVs || 'vs',
                    score: ev.score,
                    result: ev.gameResult || 'D',
                    competition: ev.leagueName || ev.competitionName || ''
                }));
                homeAnalytics.recentMatches = formattedL5;
                homeAnalytics.matchesAnalyzed = formattedL5.length;
                homeAnalytics.formGuide = formattedL5.map(e => e.result);
                homeAnalytics.formString = homeAnalytics.formGuide.join('-');
                homeAnalytics.wins = formattedL5.filter(e => e.result === 'W').length;
                homeAnalytics.draws = formattedL5.filter(e => e.result === 'D').length;
                homeAnalytics.losses = formattedL5.filter(e => e.result === 'L').length;
                homeAnalytics.winRate = Number(((homeAnalytics.wins / formattedL5.length) * 100).toFixed(1));
            }

            if (aL5?.events?.length) {
                const formattedL5 = aL5.events.map(ev => ({
                    id: String(ev.id),
                    date: ev.gameDate,
                    opponent: ev.opponent?.displayName || 'Opponent',
                    opponentLogo: ev.opponentLogo || ev.opponent?.logo || '',
                    venue: ev.atVs === '@' ? 'Away' : 'Home',
                    atVs: ev.atVs || 'vs',
                    score: ev.score,
                    result: ev.gameResult || 'D',
                    competition: ev.leagueName || ev.competitionName || ''
                }));
                awayAnalytics.recentMatches = formattedL5;
                awayAnalytics.matchesAnalyzed = formattedL5.length;
                awayAnalytics.formGuide = formattedL5.map(e => e.result);
                awayAnalytics.formString = awayAnalytics.formGuide.join('-');
                awayAnalytics.wins = formattedL5.filter(e => e.result === 'W').length;
                awayAnalytics.draws = formattedL5.filter(e => e.result === 'D').length;
                awayAnalytics.losses = formattedL5.filter(e => e.result === 'L').length;
                awayAnalytics.winRate = Number(((awayAnalytics.wins / formattedL5.length) * 100).toFixed(1));
            }
        }

        // Fallback to match document form string if fewer than 3 matches recorded locally
        if (homeAnalytics.formGuide.length < 3 && match.home?.form) {
            const formLetters = String(match.home.form).replace(/[^WDLwdl]/g, '').toUpperCase().split('');
            if (formLetters.length > 0) {
                homeAnalytics.formGuide = formLetters;
                homeAnalytics.formString = formLetters.join('-');
                homeAnalytics.matchesAnalyzed = Math.max(homeAnalytics.matchesAnalyzed, formLetters.length);
            }
        }
        if (awayAnalytics.formGuide.length < 3 && match.away?.form) {
            const formLetters = String(match.away.form).replace(/[^WDLwdl]/g, '').toUpperCase().split('');
            if (formLetters.length > 0) {
                awayAnalytics.formGuide = formLetters;
                awayAnalytics.formString = formLetters.join('-');
                awayAnalytics.matchesAnalyzed = Math.max(awayAnalytics.matchesAnalyzed, formLetters.length);
            }
        }

        // Standing comparison
        let homeStanding = null;
        let awayStanding = null;
        if (standingsGroup && Array.isArray(standingsGroup.entries)) {
            const findStanding = (id) => standingsGroup.entries.find(e => String(e.club?.source_id) === id);
            const hEntry = findStanding(homeId);
            const aEntry = findStanding(awayId);

            if (hEntry) {
                homeStanding = {
                    rank: hEntry.rank,
                    points: hEntry.stats?.get ? hEntry.stats.get('points') : hEntry.stats?.points ?? null,
                    goalDifferential: hEntry.stats?.get ? hEntry.stats.get('pointDifferential') : hEntry.stats?.pointDifferential ?? null
                };
            }
            if (aEntry) {
                awayStanding = {
                    rank: aEntry.rank,
                    points: aEntry.stats?.get ? aEntry.stats.get('points') : aEntry.stats?.points ?? null,
                    goalDifferential: aEntry.stats?.get ? aEntry.stats.get('pointDifferential') : aEntry.stats?.pointDifferential ?? null
                };
            }
        }

        // Norra AI Baseline Probabilities (Heuristic calculation for seamless model feeding)
        const homeStrength = (homeAnalytics.winRate * 0.4) + (homeStanding ? (21 - Math.min(20, homeStanding.rank)) * 2.5 : 25) + 10; // Home advantage
        const awayStrength = (awayAnalytics.winRate * 0.4) + (awayStanding ? (21 - Math.min(20, awayStanding.rank)) * 2.5 : 25);
        const drawFactor = 28;
        const totalWeight = homeStrength + awayStrength + drawFactor;

        const homeWinPct = Number(((homeStrength / totalWeight) * 100).toFixed(1));
        const awayWinPct = Number(((awayStrength / totalWeight) * 100).toFixed(1));
        const drawPct = Number((100 - homeWinPct - awayWinPct).toFixed(1));

        const avgGoalsCombined = Number(((homeAnalytics.goalsScoredAvg + awayAnalytics.goalsScoredAvg + homeAnalytics.goalsConcededAvg + awayAnalytics.goalsConcededAvg) / 2).toFixed(2)) || 2.5;

        res.set('Cache-Control', 'public, max-age=15');
        return res.json({
            status: 'success',
            match: {
                id: match.source?.event_id,
                date: match.date,
                league: {
                    slug: match.league_slug,
                    name: leagueDoc?.name || match.note || match.league_slug,
                    country: leagueDoc?.country || 'International',
                    logo: leagueDoc?.logo || ''
                },
                status: match.status?.state || 'pre',
                statusDescription: match.status?.description || 'Scheduled',
                venue: match.venue || null
            },
            teams: {
                home: {
                    id: homeId,
                    name: match.home?.display_name || match.home?.name,
                    abbreviation: match.home?.abbreviation,
                    logo: match.home?.logo,
                    standing: homeStanding,
                    analytics: homeAnalytics
                },
                away: {
                    id: awayId,
                    name: match.away?.display_name || match.away?.name,
                    abbreviation: match.away?.abbreviation,
                    logo: match.away?.logo,
                    standing: awayStanding,
                    analytics: awayAnalytics
                }
            },
            h2h: {
                totalMeetings: totalLifetimeMeetings,
                neverMetBefore: totalLifetimeMeetings === 0,
                homeWins,
                awayWins,
                draws,
                seriesSummary,
                seriesScore,
                averageGoalsPerMatch: totalLifetimeMeetings > 0 ? Number((totalGoals / totalLifetimeMeetings).toFixed(2)) : 0,
                bttsPercentage: totalLifetimeMeetings > 0 ? Number(((bttsCount / totalLifetimeMeetings) * 100).toFixed(1)) : 0,
                over25Percentage: totalLifetimeMeetings > 0 ? Number(((over25Count / totalLifetimeMeetings) * 100).toFixed(1)) : 0,
                recentMeetings: recentH2hMeetings,
                allMeetings: allLifetimeH2h
            },
            odds: match.odds || [],
            inPlayTelemetry: match.status?.state === 'in' ? {
                clock: match.status?.clock,
                period: match.status?.period,
                homeScore: match.home?.score,
                awayScore: match.away?.score,
                homeStats: match.home?.stats || {},
                awayStats: match.away?.stats || {}
            } : null,
            norraAiPredictionHints: {
                homeWinProb: homeWinPct,
                drawProb: drawPct,
                awayWinProb: awayWinPct,
                expectedGoals: avgGoalsCombined,
                bttsRecommendation: (homeAnalytics.goalsScoredAvg > 1 && awayAnalytics.goalsScoredAvg > 0.9) ? 'Yes' : 'No'
            }
        });
    } catch (err) {
        console.error('Error compiling prediction context:', err.message);
        return res.status(500).json({ error: 'Failed to compile predictions context: ' + err.message });
    }
});

/**
 * GET /api/v1/football/training-data
 * GET /api/v1/football/analytics/training-data
 * High-performance Norra AI Training Dataset API.
 * Streams normalized, feature-engineered in-game telemetry and match outcomes
 * for machine learning pipelines, pandas DataFrames, and AI model training.
 */
router.get(['/training-data', '/analytics/training-data'], optionalApiKeyAuth, async (req, res) => {
    try {
        const leagueSlug = req.query.league ? String(req.query.league).trim().toLowerCase() : 'all';
        const stateParam = req.query.state ? String(req.query.state).trim().toLowerCase() : 'all';
        const limit = Math.min(1000, Math.max(1, parseInt(req.query.limit, 10) || 100));
        const format = String(req.query.format || 'json').trim().toLowerCase();
        const minStats = req.query.minStats !== 'false';

        const filter = {};
        if (leagueSlug && leagueSlug !== 'all') {
            filter.league_slug = leagueSlug;
        }
        if (stateParam && stateParam !== 'all') {
            filter['status.state'] = stateParam;
        } else {
            filter['status.state'] = { $in: ['post', 'in'] };
        }

        if (minStats) {
            filter['home.stats'] = { $exists: true, $ne: null };
        }

        const matches = await SoccerMatch.find(filter)
            .sort({ date: -1 })
            .limit(limit)
            .lean();

        const samples = matches.map(m => {
            const hStats = m.home?.stats instanceof Map ? Object.fromEntries(m.home.stats) : (m.home?.stats || {});
            const aStats = m.away?.stats instanceof Map ? Object.fromEntries(m.away.stats) : (m.away?.stats || {});

            const hScore = Number(m.home?.score) || 0;
            const aScore = Number(m.away?.score) || 0;
            let outcome = 'draw';
            if (hScore > aScore) outcome = 'home_win';
            else if (aScore > hScore) outcome = 'away_win';

            const hPoss = Number(hStats.possessionPct) || 50;
            const aPoss = Number(aStats.possessionPct) || (100 - hPoss);
            const hShots = Number(hStats.totalShots) || 0;
            const aShots = Number(aStats.totalShots) || 0;
            const hShotsOn = Number(hStats.shotsOnTarget) || 0;
            const aShotsOn = Number(aStats.shotsOnTarget) || 0;
            const hCorners = Number(hStats.wonCorners) || 0;
            const aCorners = Number(aStats.wonCorners) || 0;
            const hFouls = Number(hStats.foulsCommitted ?? hStats.foulsCommited) || 0;
            const aFouls = Number(aStats.foulsCommitted ?? aStats.foulsCommited) || 0;
            const hYellows = Number(hStats.yellowCards) || 0;
            const aYellows = Number(aStats.yellowCards) || 0;
            const hReds = Number(hStats.redCards) || 0;
            const aReds = Number(aStats.redCards) || 0;
            const hSaves = Number(hStats.saves) || 0;
            const aSaves = Number(aStats.saves) || 0;
            const hXg = Number(hStats.expectedGoals) || (parseFloat(((hShotsOn * 0.32) + (Math.max(0, hShots - hShotsOn) * 0.05) + (hScore * 0.35)).toFixed(2)));
            const aXg = Number(aStats.expectedGoals) || (parseFloat(((aShotsOn * 0.32) + (Math.max(0, aShots - aShotsOn) * 0.05) + (aScore * 0.35)).toFixed(2)));

            const keyEvents = Array.isArray(m.key_events) ? m.key_events : [];
            const goalEvents = keyEvents.filter(k => k.scoringPlay || String(k.type?.text || k.text || '').toLowerCase().includes('goal')).map(k => ({
                minute: k.clockValue || (parseInt(k.clock, 10) || 0),
                clock: String(k.clock || ''),
                side: k.team?.side || 'unknown',
                text: k.text || ''
            }));

            const redCardEvents = keyEvents.filter(k => k.redCard || String(k.type?.text || k.text || '').toLowerCase().includes('red')).map(k => ({
                minute: k.clockValue || (parseInt(k.clock, 10) || 0),
                clock: String(k.clock || ''),
                side: k.team?.side || 'unknown',
                text: k.text || ''
            }));

            return {
                eventId: m.source?.event_id,
                provider: m.source?.provider || 'upstream',
                leagueSlug: m.league_slug,
                date: m.date,
                scoreboardDate: m.scoreboard_date,
                homeTeam: {
                    id: m.home?.source_id,
                    name: m.home?.name || m.home?.display_name,
                    score: hScore
                },
                awayTeam: {
                    id: m.away?.source_id,
                    name: m.away?.name || m.away?.display_name,
                    score: aScore
                },
                status: {
                    state: m.status?.state,
                    detail: m.status?.detail || m.status?.clock,
                    completed: Boolean(m.status?.completed)
                },
                outcome: {
                    winner: outcome,
                    totalGoals: hScore + aScore,
                    goalDifferential: hScore - aScore,
                    bothTeamsScored: hScore > 0 && aScore > 0
                },
                features: {
                    possessionPctHome: hPoss,
                    possessionPctAway: aPoss,
                    possessionDifferential: hPoss - aPoss,
                    shotsHome: hShots,
                    shotsAway: aShots,
                    shotsDifferential: hShots - aShots,
                    shotsOnTargetHome: hShotsOn,
                    shotsOnTargetAway: aShotsOn,
                    shotsOnTargetDifferential: hShotsOn - aShotsOn,
                    shotAccuracyHome: hShots > 0 ? parseFloat((hShotsOn / hShots).toFixed(3)) : 0,
                    shotAccuracyAway: aShots > 0 ? parseFloat((aShotsOn / aShots).toFixed(3)) : 0,
                    cornersHome: hCorners,
                    cornersAway: aCorners,
                    cornersDifferential: hCorners - aCorners,
                    foulsHome: hFouls,
                    foulsAway: aFouls,
                    foulsDifferential: hFouls - aFouls,
                    yellowCardsHome: hYellows,
                    yellowCardsAway: aYellows,
                    redCardsHome: hReds,
                    redCardsAway: aReds,
                    goalkeeperSavesHome: hSaves,
                    goalkeeperSavesAway: aSaves,
                    expectedGoalsHome: hXg,
                    expectedGoalsAway: aXg,
                    expectedGoalsDifferential: parseFloat((hXg - aXg).toFixed(2))
                },
                rawStats: {
                    home: hStats,
                    away: aStats
                },
                timelineSummary: {
                    totalIncidents: keyEvents.length,
                    goals: goalEvents,
                    redCards: redCardEvents
                }
            };
        });

        res.set('Cache-Control', 'public, max-age=60');

        if (format === 'jsonl' || format === 'ndjson') {
            res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
            for (const sample of samples) {
                res.write(JSON.stringify(sample) + '\n');
            }
            return res.end();
        }

        return res.json({
            status: 'success',
            meta: {
                totalSamples: samples.length,
                league: leagueSlug,
                state: stateParam,
                generatedAt: new Date().toISOString()
            },
            samples
        });
    } catch (err) {
        console.error('Error generating training dataset:', err.message);
        return res.status(500).json({ error: 'Failed to generate training data: ' + err.message });
    }
});

/**
 * GET /api/v1/football/h2h/:team1Id/:team2Id
 * Direct Head-to-Head analytics between any two team IDs.
 */
router.get('/h2h/:team1Id/:team2Id', async (req, res) => {
    try {
        const { team1Id, team2Id } = req.params;
        const matches = await SoccerMatch.find({
            $or: [
                { 'home.source_id': team1Id, 'away.source_id': team2Id },
                { 'home.source_id': team2Id, 'away.source_id': team1Id }
            ],
            'status.state': 'post'
        }).sort({ date: -1 }).limit(15).lean();

        let team1Wins = 0;
        let team2Wins = 0;
        let draws = 0;
        let totalGoals = 0;

        const results = matches.map(m => {
            const isTeam1Home = String(m.home?.source_id) === String(team1Id);
            const hScore = Number(m.home?.score || 0);
            const aScore = Number(m.away?.score || 0);
            totalGoals += (hScore + aScore);

            if (hScore === aScore) {
                draws++;
            } else if (isTeam1Home) {
                if (hScore > aScore) team1Wins++; else team2Wins++;
            } else {
                if (aScore > hScore) team1Wins++; else team2Wins++;
            }

            return {
                id: m.source?.event_id,
                date: m.date,
                homeTeam: m.home?.display_name || m.home?.name,
                awayTeam: m.away?.display_name || m.away?.name,
                score: `${hScore} - ${aScore}`
            };
        });

        const count = results.length;
        res.set('Cache-Control', 'public, max-age=60');
        return res.json({
            status: 'success',
            team1Id,
            team2Id,
            totalMatches: count,
            team1Wins,
            team2Wins,
            draws,
            averageGoals: count > 0 ? Number((totalGoals / count).toFixed(2)) : 0,
            matches: results
        });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to fetch H2H data: ' + err.message });
    }
});

/**
 * GET /api/v1/football/leagues
 * Returns all active competitions with coverage counts and seasons.
 */
router.get('/leagues', async (req, res) => {
    try {
        const leagues = await SoccerLeague.find({ active: true }).sort({ sort_order: 1, name: 1 }).lean();
        const counts = await SoccerMatch.aggregate([
            { $group: { _id: '$league_slug', count: { $sum: 1 } } }
        ]);
        const countMap = new Map(counts.map(c => [c._id, c.count]));

        res.set('Cache-Control', 'public, max-age=60');
        return res.json({
            status: 'success',
            count: leagues.length,
            leagues: leagues.map(l => ({
                id: l.source?.source_id || l.slug,
                name: l.name,
                abbreviation: l.abbreviation,
                slug: l.slug,
                country: l.country,
                kind: l.kind,
                logo: l.logo,
                season: l.season,
                matchCount: countMap.get(l.slug) || 0,
                lastSyncedAt: l.lastSyncedAt,
                isAccessibleOnTier: isFreePlanRestricted(req.apiKey) ? FREE_TIER_ALLOWED_LEAGUES.includes(l.slug) : true
            }))
        });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to fetch leagues: ' + err.message });
    }
});

/**
 * GET /api/v1/football/standings & /api/v1/football/standings/:league
 * Full league standings tables.
 */
router.get(['/standings', '/standings/:league'], async (req, res) => {
    try {
        const filter = {};

        if (isFreePlanRestricted(req.apiKey)) {
            if (req.params.league && req.params.league !== 'all') {
                const requestedSlug = String(req.params.league).toLowerCase();
                if (!FREE_TIER_ALLOWED_LEAGUES.includes(requestedSlug)) {
                    return res.status(403).json({
                        error: `Access to standings for '${req.params.league}' is restricted on the Free Developer tier. Upgrade to Starter ($10/mo) or Pro ($29/mo) to access all 100+ world leagues.`,
                        upgradeUrl: '/pricing',
                        tier: 'free',
                        allowedLeagues: FREE_TIER_ALLOWED_LEAGUES
                    });
                }
                filter.league_slug = requestedSlug;
            } else {
                filter.league_slug = { $in: FREE_TIER_ALLOWED_LEAGUES };
            }
        } else if (req.params.league && req.params.league !== 'all') {
            filter.league_slug = String(req.params.league).toLowerCase();
        }

        const groups = await SoccerStanding.find(filter).sort({ group_name: 1 }).lean();
        res.set('Cache-Control', 'public, max-age=30');
        return res.json({
            status: 'success',
            count: groups.length,
            standings: groups.map(serializeStandingGroup)
        });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to fetch standings: ' + err.message });
    }
});

/**
 * GET /api/v1/football/matches/:eventId
 * Full match telemetry, lineups, and timeline plays.
 */
router.get('/matches/:eventId', async (req, res) => {
    try {
        const eventId = String(req.params.eventId).trim();
        const match = await SoccerMatch.findOne({
            $or: [
                { 'source.event_id': eventId },
                { 'source.competition_id': eventId }
            ]
        }).lean();

        if (!match) {
            return res.status(404).json({ error: 'Match not found' });
        }

        const [league, plays] = await Promise.all([
            SoccerLeague.findOne({ slug: match.league_slug }).lean(),
            SoccerMatchEvent.find({
                $or: [
                    { event_id: eventId },
                    { match_id: eventId }
                ]
            }).sort({ sequence_number: 1, clock_seconds: 1 }).limit(200).lean()
        ]);

        const summary = serializeSummary(match, league || { slug: match.league_slug, name: match.note });

        // Enrich with real-time ESPN match telemetry
        try {
            const https = require('https');
            const zlib = require('zlib');
            const espnData = await new Promise((resolve, reject) => {
                const req = https.get(`https://site.api.espn.com/apis/site/v2/sports/soccer/${match.league_slug || 'all'}/summary?event=${encodeURIComponent(eventId)}`, {
                    headers: { 'User-Agent': 'NorraScores/2.1', 'Accept-Encoding': 'gzip, deflate' },
                    timeout: 4000
                }, res => {
                    if (res.statusCode !== 200) return resolve(null);
                    let stream = res;
                    if (res.headers['content-encoding'] === 'gzip') stream = res.pipe(zlib.createGunzip());
                    else if (res.headers['content-encoding'] === 'deflate') stream = res.pipe(zlib.createInflate());
                    let d = '';
                    stream.on('data', c => d += c);
                    stream.on('end', () => {
                        try { resolve(JSON.parse(d)); } catch { resolve(null); }
                    });
                });
                req.on('error', () => resolve(null));
                req.on('timeout', () => { req.destroy(); resolve(null); });
            });

            if (espnData) {
                if (espnData.boxscore?.teams?.length) summary.boxscore = espnData.boxscore;
                if (espnData.keyEvents?.length) summary.keyEvents = espnData.keyEvents;
                if (espnData.rosters?.length) summary.rosters = espnData.rosters;
                if (espnData.gameInfo) summary.gameInfo = espnData.gameInfo;
                if (espnData.header?.competitions?.[0]) summary.header.competitions = espnData.header.competitions;
                if (espnData.seasonseries) summary.seasonseries = espnData.seasonseries;
                if (espnData.lastFiveGames) summary.lastFiveGames = espnData.lastFiveGames;
                if (espnData.predictor) summary.predictor = espnData.predictor;
                if (espnData.pickcenter) summary.pickcenter = espnData.pickcenter;
            }

            // If ESPN provided no boxscore or for LiveScore matches, enrich with LiveScore telemetry
            const hasStats = Boolean(
                summary.boxscore?.teams?.[0]?.statistics?.length ||
                summary.boxscore?.teams?.[1]?.statistics?.length
            );
            const isLiveScoreEvent = String(match.source?.provider || '').toLowerCase() === 'livescore'
                || String(match.source?.event_id || eventId).length <= 8;

            if (!hasStats || isLiveScoreEvent || !summary.keyEvents?.length) {
                try {
                    const { fetchLiveScoreMatchDetails } = require('../services/soccerSyncService');
                    const lsData = await fetchLiveScoreMatchDetails(match.source?.event_id || eventId);
                    if (lsData) {
                        if (lsData.boxscore && !hasStats) {
                            summary.boxscore = lsData.boxscore;
                        }
                        if (lsData.keyEvents?.length) {
                            summary.keyEvents = lsData.keyEvents;
                            if (summary.header?.competitions?.[0]) {
                                summary.header.competitions[0].details = lsData.keyEvents;
                            }
                        }
                        if (lsData.rosters?.length && !summary.rosters?.length) {
                            summary.rosters = lsData.rosters;
                        }
                        if (lsData.gameInfo && !summary.gameInfo?.venue?.fullName) {
                            summary.gameInfo = lsData.gameInfo;
                        }
                    }
                } catch {}
            }

            // If neither provider broadcasted granular boxscore telemetry (e.g. youth matches, U17 WC, or lower US divisions)
            const finalHasStats = Boolean(
                summary.boxscore?.teams?.[0]?.statistics?.length ||
                summary.boxscore?.teams?.[1]?.statistics?.length
            );
            if (!finalHasStats) {
                summary.boxscore = synthesizeMatchTelemetry(match, summary);
            }
        } catch {}

        let timelinePlays = plays.map(serializePlay);
        if (timelinePlays.length === 0 && summary.keyEvents?.length) {
            timelinePlays = summary.keyEvents.map((ke, idx) => ({
                id: ke.id || `play-${idx}`,
                sequence: idx + 1,
                type: ke.type || { text: 'Play' },
                text: ke.text || '',
                clock: typeof ke.clock === 'string' ? { displayValue: ke.clock, value: ke.clockValue || 0 } : (ke.clock || { displayValue: '', value: 0 }),
                scoringPlay: Boolean(ke.scoringPlay),
                team: ke.team || null,
                participants: (ke.athletesInvolved || []).map(a => ({ athlete: a }))
            }));
        }

        res.set('Cache-Control', `public, max-age=${match.status?.state === 'in' ? 4 : 30}`);
        return res.json({
            status: 'success',
            match: summary,
            summary: summary,
            timeline: timelinePlays
        });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to fetch match details: ' + err.message });
    }
});

/**
 * GET /api/v1/football/teams/:teamId
 * Team profile and recent form.
 */
router.get('/teams/:teamId', async (req, res) => {
    try {
        const teamId = String(req.params.teamId).trim();
        const club = await SoccerClub.findOne({
            $or: [
                { 'source.club_id': teamId },
                { slug: teamId }
            ]
        }).lean();

        if (!club) {
            return res.status(404).json({ error: 'Team not found' });
        }

        const recentMatches = await SoccerMatch.find({
            $or: [
                { 'home.source_id': club.source?.club_id || teamId },
                { 'away.source_id': club.source?.club_id || teamId }
            ],
            'status.state': 'post'
        }).sort({ date: -1 }).limit(10).lean();

        res.set('Cache-Control', 'public, max-age=60');
        return res.json({
            status: 'success',
            team: serializeClub(club),
            recentMatches: recentMatches.map(serializeScoreboardEvent)
        });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to fetch team: ' + err.message });
    }
});

module.exports = app => {
    app.use('/api/v1/football', router);
};
