const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

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
const { normalizeTeamName, getTeamCategory, resolveMatchEspnId, resolveLeagueSlug, formatLiveScoreLogo } = require('../services/soccerSyncService');

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

function inferMatchCountry(m) {
    if (!m) return 'International';
    const slug = String(m.league_slug || '').toLowerCase();
    const txt = `${m.note || ''} ${m.name || ''} ${slug}`.toLowerCase();
    
    // Check league slug prefix first to avoid false positives (e.g. sui.w.1 != England WSL)
    if (slug.startsWith('eng.')) return 'England';
    if (slug.startsWith('esp.')) return 'Spain';
    if (slug.startsWith('ita.')) return 'Italy';
    if (slug.startsWith('ger.')) return 'Germany';
    if (slug.startsWith('fra.')) return 'France';
    if (slug.startsWith('ned.')) return 'Netherlands';
    if (slug.startsWith('por.')) return 'Portugal';
    if (slug.startsWith('sco.')) return 'Scotland';
    if (slug.startsWith('sui.')) return 'Switzerland';
    if (slug.startsWith('bel.')) return 'Belgium';
    if (slug.startsWith('gre.')) return 'Greece';
    if (slug.startsWith('tur.')) return 'Turkey';
    if (slug.startsWith('bra.')) return 'Brazil';
    if (slug.startsWith('arg.')) return 'Argentina';
    if (slug.startsWith('usa.')) return 'United States';
    if (slug.startsWith('mex.')) return 'Mexico';
    if (slug.startsWith('aus.')) return 'Australia';
    if (slug.startsWith('swe.')) return 'Sweden';
    if (slug.startsWith('nor.')) return 'Norway';
    if (slug.startsWith('den.')) return 'Denmark';
    if (slug.startsWith('pol.')) return 'Poland';
    if (slug.startsWith('tza.')) return 'Tanzania';
    if (slug.startsWith('gha.')) return 'Ghana';
    if (slug.startsWith('ken.')) return 'Kenya';
    if (slug.startsWith('uga.')) return 'Uganda';
    if (slug.startsWith('egy.')) return 'Egypt';
    if (slug.startsWith('bwa.')) return 'Botswana';
    if (slug.startsWith('jam.')) return 'Jamaica';
    if (slug.startsWith('isr.')) return 'Israel';
    if (slug.startsWith('kwt.')) return 'Kuwait';
    if (slug.startsWith('bhr.')) return 'Bahrain';
    if (slug.startsWith('aze.')) return 'Azerbaijan';
    if (slug.startsWith('blr.')) return 'Belarus';
    if (slug.startsWith('arm.')) return 'Armenia';
    if (slug.startsWith('lby.')) return 'Libya';
    if (slug.startsWith('nga.')) return 'Nigeria';
    if (slug.startsWith('rsa.')) return 'South Africa';
    if (slug.startsWith('jpn.')) return 'Japan';
    if (slug.startsWith('kor.')) return 'South Korea';
    if (slug.startsWith('sau.')) return 'Saudi Arabia';
    if (slug.startsWith('caf.')) return 'Africa';
    if (slug.startsWith('uefa.')) return 'Europe';
    if (slug.startsWith('conmebol.')) return 'South America';
    if (slug.startsWith('concacaf.')) return 'North America';
    if (slug.startsWith('afc.')) return 'Asia';
    if (slug.startsWith('fifa.')) return 'International';

    // Text inspection with foreign countries checked before generic WSL
    if (txt.includes('switzerland') || txt.includes('swiss')) return 'Switzerland';
    if (txt.includes('belgium') || txt.includes('belgian')) return 'Belgium';
    if (txt.includes('greece') || txt.includes('greek')) return 'Greece';
    if (txt.includes('scotland') || txt.includes('scottish') || txt.includes('swpl')) return 'Scotland';
    if (txt.includes('sweden') || txt.includes('swedish') || txt.includes('damallsvenskan')) return 'Sweden';
    if (txt.includes('norway') || txt.includes('norwegian') || txt.includes('toppserien')) return 'Norway';
    if (txt.includes('denmark') || txt.includes('danish')) return 'Denmark';
    if (txt.includes('poland') || txt.includes('polish')) return 'Poland';
    if (txt.includes('wsl') || txt.includes("women's super league") || txt.includes('womens super league') || txt.includes('players cup') || txt.includes('fa cup')) return 'England';
    if (txt.includes('nwsl') || txt.includes('usl')) return 'United States';
    if (txt.includes('femenil')) return 'Mexico';
    if (txt.includes('a-league')) return 'Australia';
    if (txt.includes('femminile')) return 'Italy';
    if (txt.includes('liga f')) return 'Spain';
    if (txt.includes('frauen')) return 'Germany';
    if (txt.includes('arkema')) return 'France';
    if (txt.includes('eredivisie')) return 'Netherlands';
    if (txt.includes('portugal') || txt.includes('liga bpi')) return 'Portugal';
    if (txt.includes('turkey') || txt.includes('süper lig')) return 'Turkey';
    if (txt.includes('brazil') || txt.includes('brasileir')) return 'Brazil';
    if (txt.includes('argentina')) return 'Argentina';
    if (txt.includes('nigeria') || txt.includes('npfl') || txt.includes('nwfl')) return 'Nigeria';
    if (txt.includes('south africa') || txt.includes('psl')) return 'South Africa';
    if (txt.includes('caf') || txt.includes('afcon')) return 'Africa';
    if (txt.includes('uefa') || txt.includes('champions') || txt.includes('europa') || txt.includes('conference')) return 'Europe';
    return 'International';
}

function makeFlexibleTeamRegex(rawName) {
    if (!rawName) return null;
    const base = String(rawName)
        .replace(/\b(18\d{2}|19\d{2}|20\d{2})\b/g, '')
        .replace(/\b(04|05|96|98)\b/g, '')
        .replace(/\b(fc|cf|sc|ac|cd|afc|fk|sk|sv|ssc|as|rc|ud|rb|calcio)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
    if (base.length >= 3) {
        const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`(^|\\b)${escaped}(\\b|$)`, 'i');
    }
    const escaped = String(rawName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^${escaped}$`, 'i');
}

// Apply optional API key authentication on all football endpoints
router.use(optionalApiKeyAuth);

// High-speed in-memory cache for worldwide live in-play scores (15-second TTL)
let liveFeedMemoryCache = {
    timestamp: 0,
    matches: [],
    inFlightPromise: null
};

function fetchUpstreamJsonFast(url, timeoutMs = 3500) {
    return new Promise((resolve) => {
        const https = require('https');
        const zlib = require('zlib');
        const req = https.get(url, {
            headers: { 'User-Agent': 'NorraScores/2.1', 'Accept-Encoding': 'gzip, deflate' },
            timeout: timeoutMs
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
}

async function fetchFreshWorldwideLiveMatches() {
    const sixHoursAgo = new Date(Date.now() - 6 * 3600 * 1000);
    const liveFilter = {
        'status.state': 'in',
        date: { $gte: sixHoursAgo }
    };

    // Parallel fetch from upstream LiveScore worldwide feed, ESPN scoreboard, and MongoDB
    const [liveScoreData, espnScoreboard, dbLiveMatches, storedLeagues] = await Promise.all([
        fetchUpstreamJsonFast('https://prod-public-api.livescore.com/v1/api/app/live/soccer/0', 3200),
        fetchUpstreamJsonFast('https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard', 3200),
        SoccerMatch.find(liveFilter).maxTimeMS(2500).sort({ date: 1 }).lean().catch(() => []),
        SoccerLeague.find({ active: true }).maxTimeMS(2500).lean().catch(() => [])
    ]);

    const leagueMap = new Map((storedLeagues || []).map(l => [l.slug, l]));
    const candidateMatches = [];

    // 1. Ingest all in-play matches from LiveScore worldwide in-play feed
    if (liveScoreData && Array.isArray(liveScoreData.Stages)) {
        for (const stage of liveScoreData.Stages) {
            const country = stage.Cnm || stage.Sdn || 'International';
            const leagueName = stage.Snm || 'Football Competition';
            const slug = resolveLeagueSlug(leagueName, country, stage.Scd || '');
            if (!slug || slug === 'usa.ncaa') continue;
            const lg = leagueMap.get(slug) || {};

            for (const ev of (stage.Events || [])) {
                const eid = String(ev.Eid);
                const h = ev.T1?.[0] || {};
                const a = ev.T2?.[0] || {};
                const hScore = parseInt(ev.Tr1 || 0, 10);
                const aScore = parseInt(ev.Tr2 || 0, 10);
                const rawClock = String(ev.Eps || ev.Epr || 'NS').trim();

                const isNotStarted = rawClock === 'NS' || rawClock === 'Upcoming' || rawClock === '' || rawClock === 'Sched' || rawClock.includes(':');
                const isFinished = rawClock === 'FT' || rawClock === 'AET' || rawClock === 'AP';
                const isPostponed = rawClock.includes('Postp') || rawClock.includes('Canc');
                const isInPlay = !isNotStarted && !isFinished && !isPostponed;

                // For the dedicated in-play feed, only collect active live matches
                if (!isInPlay) continue;

                const clock = rawClock === 'HT' ? 'HT' : (rawClock.includes("'") ? rawClock : `${rawClock}'`);

                candidateMatches.push({
                    id: eid,
                    uid: `ls:${eid}`,
                    league: {
                        slug,
                        name: lg.name || leagueName,
                        abbreviation: lg.abbreviation || leagueName.slice(0, 16),
                        country: lg.country || country,
                        logo: lg.logo || ''
                    },
                    date: ev.Esd ? new Date(ev.Esd) : new Date(),
                    status: {
                        state: 'in',
                        name: 'STATUS_IN_PROGRESS',
                        description: 'In Progress',
                        clock: clock,
                        detail: clock,
                        period: ev.Epr || 1,
                        completed: false,
                        isLive: true
                    },
                    home: {
                        id: h.ID ? String(h.ID) : undefined,
                        name: h.Nm || 'Home',
                        displayName: h.Nm || 'Home',
                        abbreviation: h.Abr || '',
                        logo: formatLiveScoreLogo(h.Img),
                        score: isNaN(hScore) ? 0 : hScore,
                        winner: false
                    },
                    away: {
                        id: a.ID ? String(a.ID) : undefined,
                        name: a.Nm || 'Away',
                        displayName: a.Nm || 'Away',
                        abbreviation: a.Abr || '',
                        logo: formatLiveScoreLogo(a.Img),
                        score: isNaN(aScore) ? 0 : aScore,
                        winner: false
                    },
                    source: { provider: 'livescore', livescore_id: eid, event_id: eid }
                });
            }
        }
    }

    // 2. Ingest in-play matches from ESPN scoreboard
    if (espnScoreboard && Array.isArray(espnScoreboard.events)) {
        for (const ev of espnScoreboard.events) {
            const comp = ev.competitions?.[0];
            if (!comp) continue;
            const state = ev.status?.type?.state;
            if (state !== 'in') continue; // only in-play

            const competitors = comp.competitors || [];
            const homeComp = competitors.find(c => c.homeAway === 'home') || competitors[0] || {};
            const awayComp = competitors.find(c => c.homeAway === 'away') || competitors[1] || {};
            if (/ncaa|college basketball/i.test(`${comp.altGameNote || ''} ${ev.name || ''} ${ev.uid || ''}`)) continue;
            const targetSlug = resolveLeagueSlug(comp.altGameNote || '', comp.notes?.[0]?.headline || '', ev.uid || '');
            if (!targetSlug || targetSlug === 'usa.ncaa') continue;
            const lg = leagueMap.get(targetSlug) || {};
            const clock = ev.status?.displayClock || ev.status?.type?.detail || "45'";

            candidateMatches.push({
                id: String(ev.id),
                uid: ev.uid || String(ev.id),
                league: {
                    slug: targetSlug,
                    name: lg.name || comp.altGameNote || targetSlug,
                    abbreviation: lg.abbreviation || targetSlug,
                    country: lg.country || 'International',
                    logo: lg.logo || ''
                },
                date: ev.date ? new Date(ev.date) : new Date(),
                status: {
                    state: 'in',
                    name: 'STATUS_IN_PROGRESS',
                    description: 'In Progress',
                    clock: clock,
                    detail: clock,
                    period: ev.status?.period || 1,
                    completed: false,
                    isLive: true
                },
                home: {
                    id: homeComp.team?.id,
                    name: homeComp.team?.name || homeComp.team?.displayName || 'Home',
                    displayName: homeComp.team?.displayName || homeComp.team?.name || 'Home',
                    abbreviation: homeComp.team?.abbreviation || '',
                    logo: sanitizeLogoUrl(homeComp.team?.logo || ''),
                    score: parseInt(homeComp.score || 0, 10),
                    winner: Boolean(homeComp.winner)
                },
                away: {
                    id: awayComp.team?.id,
                    name: awayComp.team?.name || awayComp.team?.displayName || 'Away',
                    displayName: awayComp.team?.displayName || awayComp.team?.name || 'Away',
                    abbreviation: awayComp.team?.abbreviation || '',
                    logo: sanitizeLogoUrl(awayComp.team?.logo || ''),
                    score: parseInt(awayComp.score || 0, 10),
                    winner: Boolean(awayComp.winner)
                },
                source: { provider: 'espn', espn_id: String(ev.id), event_id: String(ev.id) }
            });
        }
    }

    // 3. Ingest in-play matches from MongoDB
    if (Array.isArray(dbLiveMatches)) {
        for (const m of dbLiveMatches) {
            const lg = leagueMap.get(m.league_slug) || {};
            candidateMatches.push({
                id: m.source?.event_id || String(m._id),
                uid: m.source?.uid || '',
                league: {
                    slug: m.league_slug,
                    name: lg.name || m.note || m.league_slug,
                    abbreviation: lg.abbreviation || m.league_slug,
                    country: lg.country || inferMatchCountry(m),
                    logo: lg.logo || ''
                },
                date: m.date,
                status: {
                    state: 'in',
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
                recentEvents: m.key_events || [],
                source: m.source || {}
            });
        }
    }

    // 4. Deduplicate across feeds into canonical matches
    const seenLiveMap = new Map();
    for (const m of candidateMatches) {
        const hName = m.home?.displayName || m.home?.name || '';
        const aName = m.away?.displayName || m.away?.name || '';
        const hNorm = normalizeTeamName(hName);
        const aNorm = normalizeTeamName(aName);
        const catH = getTeamCategory(hName);
        const catA = getTeamCategory(aName);
        const sig = [hNorm, aNorm].sort().join('_vs_') + '_' + (catH.isWomen || catA.isWomen ? 'w' : 'm') + '_' + (catH.isYouth || catA.isYouth ? 'y' : 's');

        const mScore = (m.home?.logo?.includes('espncdn') ? 4 : 0) +
                       (m.source?.provider === 'espn' || (m.id && /^\d{6,}$/.test(m.id)) ? 3 : 0) +
                       (m.recentEvents && m.recentEvents.length > 0 ? 2 : 0) +
                       (m.venue ? 1 : 0);

        if (!seenLiveMap.has(sig)) {
            seenLiveMap.set(sig, { match: m, score: mScore });
        } else {
            const existing = seenLiveMap.get(sig);
            const winner = mScore > existing.score ? m : existing.match;
            const secondary = mScore > existing.score ? existing.match : m;

            if (secondary.status?.clock && secondary.status.clock !== "45'") {
                winner.status.clock = secondary.status.clock;
            }
            if (secondary.status?.detail) winner.status.detail = secondary.status.detail;
            if (secondary.home?.score !== undefined) winner.home.score = secondary.home.score;
            if (secondary.away?.score !== undefined) winner.away.score = secondary.away.score;
            if (secondary.source?.livescore_id && !winner.source?.livescore_id) {
                if (!winner.source) winner.source = {};
                winner.source.livescore_id = secondary.source.livescore_id;
            }
            if (secondary.source?.espn_id && !winner.source?.espn_id) {
                if (!winner.source) winner.source = {};
                winner.source.espn_id = secondary.source.espn_id;
            }
            seenLiveMap.set(sig, { match: winner, score: Math.max(existing.score, mScore) });
        }
    }

    const dedupedLive = Array.from(seenLiveMap.values()).map(e => e.match);
    return dedupedLive;
}

function filterLiveMatchesResponse(matches, league, isFreeRestricted) {
    let result = matches || [];
    if (isFreeRestricted) {
        if (league && league !== 'all') {
            const requestedSlug = String(league).toLowerCase();
            if (!FREE_TIER_ALLOWED_LEAGUES.includes(requestedSlug)) {
                return { restricted: true, requestedSlug, matches: [] };
            }
            result = result.filter(m => m.league?.slug === requestedSlug);
        } else {
            result = result.filter(m => FREE_TIER_ALLOWED_LEAGUES.includes(m.league?.slug));
        }
    } else if (league && league !== 'all') {
        const requestedSlug = String(league).toLowerCase();
        result = result.filter(m => m.league?.slug === requestedSlug);
    }
    return { matches: result };
}

async function getFormattedLiveMatches(league, isFreeRestricted) {
    const now = Date.now();
    const CACHE_TTL_MS = 10000; // 10 seconds

    // Stale-While-Revalidate: If we have live matches in memory, return immediately (< 5ms)
    // and trigger background refresh if cache is older than TTL
    if (liveFeedMemoryCache.matches.length > 0) {
        if (now - liveFeedMemoryCache.timestamp >= CACHE_TTL_MS && !liveFeedMemoryCache.inFlightPromise) {
            liveFeedMemoryCache.inFlightPromise = (async () => {
                try {
                    const matches = await fetchFreshWorldwideLiveMatches();
                    if (matches && matches.length > 0) {
                        liveFeedMemoryCache.matches = matches;
                        liveFeedMemoryCache.timestamp = Date.now();
                    }
                } finally {
                    liveFeedMemoryCache.inFlightPromise = null;
                }
            })();
        }
        return filterLiveMatchesResponse(liveFeedMemoryCache.matches, league, isFreeRestricted);
    }

    // Only on initial cold boot with empty cache do we wait
    if (!liveFeedMemoryCache.inFlightPromise) {
        liveFeedMemoryCache.inFlightPromise = (async () => {
            try {
                const matches = await fetchFreshWorldwideLiveMatches();
                if (matches && matches.length > 0) {
                    liveFeedMemoryCache.matches = matches;
                    liveFeedMemoryCache.timestamp = Date.now();
                }
            } finally {
                liveFeedMemoryCache.inFlightPromise = null;
            }
        })();
    }

    try {
        await liveFeedMemoryCache.inFlightPromise;
    } catch {}

    return filterLiveMatchesResponse(liveFeedMemoryCache.matches, league, isFreeRestricted);
}

// Proactive background cache warming & continuous refresh loop
setTimeout(() => {
    fetchFreshWorldwideLiveMatches().then(m => {
        if (m && m.length > 0) {
            liveFeedMemoryCache.matches = m;
            liveFeedMemoryCache.timestamp = Date.now();
        }
    }).catch(() => {});
}, 800);

setInterval(() => {
    fetchFreshWorldwideLiveMatches().then(m => {
        if (m && m.length > 0) {
            liveFeedMemoryCache.matches = m;
            liveFeedMemoryCache.timestamp = Date.now();
        }
    }).catch(() => {});
}, 12000);

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
            live: result.matches,
            matches: result.matches
        });
    } catch (err) {
        console.error('Error fetching live scores:', err.message);
        return res.status(500).json({ error: 'Failed to retrieve live scores: ' + err.message, live: [], matches: [] });
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

const fixturesResponseCache = new Map();
const FIXTURES_CACHE_MAX_SIZE = 100;

/**
 * GET /api/v1/football/fixtures
 * Multi-league fixtures schedule query with date, league, team, and status filters.
 */
router.get('/fixtures', async (req, res) => {
    const cacheKey = req.originalUrl || `/fixtures?${new URLSearchParams(req.query).toString()}`;
    const now = Date.now();
    const cached = fixturesResponseCache.get(cacheKey);

    // Stale-While-Revalidate TTL: 10s for today/live queries; 120s for past or future dates
    const isQueryingToday = Boolean((req.query.date && parseDateParam(req.query.date) === parseDateParam('today')) || (!req.query.date && !req.query.from && !req.query.to));
    const isLiveFilter = req.query.status === 'live';
    const cacheTtlMs = (isQueryingToday || isLiveFilter) ? 10000 : 120000;

    if (cached && (now - cached.timestamp < cacheTtlMs)) {
        if (cached.hasLive || isLiveFilter) {
            res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.set('Pragma', 'no-cache');
        } else {
            res.set('Cache-Control', 'public, max-age=30');
        }
        return res.json(cached.body);
    }

    try {
        const { date, from, to, league, status = 'all', team } = req.query;
        const page = parseNumber(req.query.page, 1, 1000);
        const limit = parseNumber(req.query.limit, 200, 500);

        const filter = {};

        // Date filtering
        const sixHoursAgo = new Date(Date.now() - 6 * 3600 * 1000);
        if (isQueryingToday && status === 'all') {
            filter.$or = [
                { scoreboard_date: parseDateParam('today') },
                { 'status.state': 'in', date: { $gte: sixHoursAgo } }
            ];
        } else if (date) {
            filter.scoreboard_date = parseDateParam(date);
        } else if (isQueryingToday) {
            filter.scoreboard_date = parseDateParam('today');
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
            filter.date = { $gte: sixHoursAgo };
            delete filter.scoreboard_date;
        } else if (status === 'scheduled') {
            filter['status.state'] = { $in: ['pre', 'scheduled'] };
        } else if (status === 'finished') {
            filter['status.state'] = { $in: ['post', 'final', 'completed'] };
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
            SoccerMatch.countDocuments(filter).maxTimeMS(2500).catch(() => 0),
            SoccerMatch.find(filter)
                .select('source league_slug name short_name date scoreboard_date status home away note venue broadcasts attendance odds')
                .sort({ date: 1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .maxTimeMS(2500)
                .lean()
                .catch(() => []),
            SoccerLeague.find({ active: true }).select('slug name abbreviation country logo').maxTimeMS(2500).lean().catch(() => [])
        ]);

        // If querying today, always merge real-time live in-play matches into the fixture results
        if (isQueryingToday && (status === 'all' || status === 'live')) {
            if (liveFeedMemoryCache.matches && liveFeedMemoryCache.matches.length > 0) {
                let liveCandidates = liveFeedMemoryCache.matches;
                if (league && league !== 'all') {
                    const requestedSlug = String(league).toLowerCase();
                    liveCandidates = liveCandidates.filter(m => (m.league?.slug || m.league_slug) === requestedSlug);
                }
                if (status === 'live') {
                    liveCandidates = liveCandidates.filter(m => m.status?.isLive || m.status?.state === 'in');
                }

                if (liveCandidates.length > 0) {
                    const seenSignatures = new Set();
                    matches.forEach(m => {
                        const h = (m.home?.name || m.home?.displayName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                        const a = (m.away?.name || m.away?.displayName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                        const id = String(m.source?.event_id || m.id || m._id || '');
                        if (id) seenSignatures.add(id);
                        if (h && a) seenSignatures.add(`${h}_vs_${a}`);
                    });

                    const liveToPrepend = [];
                    for (const lm of liveCandidates) {
                        const h = (lm.home?.name || lm.home?.displayName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                        const a = (lm.away?.name || lm.away?.displayName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                        const id = String(lm.source?.event_id || lm.id || lm._id || '');
                        const sig = `${h}_vs_${a}`;

                        if ((id && seenSignatures.has(id)) || (h && a && seenSignatures.has(sig))) {
                            // Update existing match in array if it was found as scheduled but is now live
                            const idx = matches.findIndex(m => {
                                const mh = (m.home?.name || m.home?.displayName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                                const ma = (m.away?.name || m.away?.displayName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                                const mid = String(m.source?.event_id || m.id || m._id || '');
                                return (id && mid === id) || (h && a && mh === h && ma === a);
                            });
                            if (idx !== -1) {
                                matches[idx] = { ...matches[idx], ...lm, status: lm.status, home: lm.home, away: lm.away };
                            }
                        } else {
                            if (id) seenSignatures.add(id);
                            if (h && a) seenSignatures.add(sig);
                            liveToPrepend.push(lm);
                        }
                    }

                    if (liveToPrepend.length > 0) {
                        matches = [...liveToPrepend, ...matches];
                    }
                    totalCount = matches.length;
                }
            }
        }

        const leagueMap = new Map((storedLeagues || []).map(l => [l.slug, l]));

        const formattedMatches = matches.map(m => {
            const leagueSlug = m.league_slug || m.league?.slug;
            const lg = leagueMap.get(leagueSlug) || m.league || {};
            return {
                id: m.source?.event_id || m.id || String(m._id),
                uid: m.source?.uid || m.uid || '',
                league: {
                    slug: leagueSlug,
                    name: lg.name || m.note || leagueSlug,
                    abbreviation: lg.abbreviation || leagueSlug,
                    country: lg.country || inferMatchCountry(m),
                    logo: lg.logo || ''
                },
                scoreboardDate: m.scoreboard_date || m.scoreboardDate,
                date: m.date,
                name: m.name || `${m.home?.name || m.home?.displayName || 'Home'} vs ${m.away?.name || m.away?.displayName || 'Away'}`,
                shortName: m.short_name || m.shortName,
                status: {
                    state: m.status?.state || 'pre',
                    name: m.status?.name || 'STATUS_SCHEDULED',
                    description: m.status?.description || 'Scheduled',
                    detail: m.status?.detail || '',
                    shortDetail: m.status?.short_detail || m.status?.shortDetail || '',
                    clock: m.status?.clock || '',
                    period: m.status?.period || 0,
                    completed: Boolean(m.status?.completed),
                    isLive: m.status?.state === 'in' || Boolean(m.status?.isLive)
                },
                home: {
                    id: m.home?.source_id || m.home?.id,
                    name: m.home?.name || m.home?.displayName,
                    displayName: m.home?.display_name || m.home?.displayName || m.home?.name,
                    abbreviation: m.home?.abbreviation || '',
                    logo: sanitizeLogoUrl(m.home?.logo || ''),
                    score: m.home?.score,
                    winner: m.home?.winner,
                    form: m.home?.form || ''
                },
                away: {
                    id: m.away?.source_id || m.away?.id,
                    name: m.away?.name || m.away?.displayName,
                    displayName: m.away?.display_name || m.away?.displayName || m.away?.name,
                    abbreviation: m.away?.abbreviation || '',
                    logo: sanitizeLogoUrl(m.away?.logo || ''),
                    score: m.away?.score,
                    winner: m.away?.winner,
                    form: m.away?.form || ''
                },
                venue: m.venue || null,
                odds: m.odds || [],
                source: m.source || {}
            };
        });

        // In-memory deduplication across providers with canonical scoring & live telemetry merge
        const seenFixturesMap = new Map();
        for (const m of formattedMatches) {
            const hName = m.home?.displayName || m.home?.name || '';
            const aName = m.away?.displayName || m.away?.name || '';
            const hNorm = normalizeTeamName(hName);
            const aNorm = normalizeTeamName(aName);
            const catH = getTeamCategory(hName);
            const catA = getTeamCategory(aName);
            const dKey = m.scoreboardDate || (m.date ? new Date(m.date).toISOString().slice(0, 10) : '');
            const sig = [hNorm, aNorm].sort().join('_vs_') + '_' + dKey + '_' + (catH.isWomen || catA.isWomen ? 'w' : 'm') + '_' + (catH.isYouth || catA.isYouth ? 'y' : 's');

            const mScore = (m.home?.logo?.includes('espncdn') ? 4 : 0) +
                           (m.source?.provider === 'espn' || (m.id && /^\d{6,}$/.test(m.id)) ? 3 : 0) +
                           (m.odds && m.odds.length > 0 ? 1 : 0) +
                           (m.venue ? 1 : 0);

            if (!seenFixturesMap.has(sig)) {
                seenFixturesMap.set(sig, { match: m, score: mScore });
            } else {
                const existing = seenFixturesMap.get(sig);
                const winner = mScore > existing.score ? m : existing.match;
                const secondary = mScore > existing.score ? existing.match : m;

                if (secondary.status?.isLive || secondary.status?.state === 'in') {
                    if (secondary.status?.clock && secondary.status.clock !== "45'") {
                        winner.status.clock = secondary.status.clock;
                    }
                    if (secondary.status?.detail) winner.status.detail = secondary.status.detail;
                    if (secondary.status?.period) winner.status.period = secondary.status.period;
                    if (secondary.home?.score !== undefined) winner.home.score = secondary.home.score;
                    if (secondary.away?.score !== undefined) winner.away.score = secondary.away.score;
                }
                if (secondary.source?.livescore_id && !winner.source?.livescore_id) {
                    if (!winner.source) winner.source = {};
                    winner.source.livescore_id = secondary.source.livescore_id;
                }
                if (secondary.source?.espn_id && !winner.source?.espn_id) {
                    if (!winner.source) winner.source = {};
                    winner.source.espn_id = secondary.source.espn_id;
                }
                seenFixturesMap.set(sig, { match: winner, score: Math.max(existing.score, mScore) });
            }
        }

        const dedupedMatches = Array.from(seenFixturesMap.values()).map(e => e.match);

        const hasLive = dedupedMatches.some(m => m.status.isLive);
        if (hasLive || status === 'live') {
            res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.set('Pragma', 'no-cache');
        } else {
            res.set('Cache-Control', 'public, max-age=30');
        }

        const responsePayload = {
            status: 'success',
            meta: {
                totalMatches: dedupedMatches.length,
                count: dedupedMatches.length,
                page,
                pageSize: limit,
                totalPages: Math.ceil(dedupedMatches.length / limit) || 1,
                filters: { date, from, to, league, status, team },
                isAdFree: Boolean(req.isAdFree)
            },
            matches: dedupedMatches,
            fixtures: dedupedMatches
        };

        // Cache successful response in memory
        fixturesResponseCache.set(cacheKey, {
            timestamp: Date.now(),
            hasLive,
            body: responsePayload
        });
        if (fixturesResponseCache.size > FIXTURES_CACHE_MAX_SIZE) {
            const oldestKey = fixturesResponseCache.keys().next().value;
            fixturesResponseCache.delete(oldestKey);
        }

        return res.json(responsePayload);
    } catch (err) {
        console.error('Error fetching fixtures:', err.message);
        if (cached && cached.body) {
            return res.json(cached.body);
        }
        return res.json({
            status: 'success',
            meta: {
                totalMatches: 0,
                count: 0,
                page: 1,
                pageSize: 200,
                totalPages: 1,
                filters: req.query,
                notice: 'Serving offline fallback'
            },
            matches: [],
            fixtures: []
        });
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
        const isMongoId = /^[0-9a-fA-F]{24}$/.test(eventId);
        const match = await SoccerMatch.findOne({
            $or: [
                { 'source.event_id': eventId },
                { 'source.competition_id': eventId },
                { 'source.livescore_id': eventId },
                { 'source.espn_id': eventId },
                ...(isMongoId ? [{ _id: eventId }] : [])
            ]
        }).lean();

        if (!match) {
            return res.status(404).json({ error: 'Match not found for ID: ' + eventId });
        }

        const targetEspnId = await resolveMatchEspnId(match, eventId);

        const homeId = String(match.home?.source_id || '');
        const awayId = String(match.away?.source_id || '');
        const leagueSlug = match.league_slug;

        const hName = (match.home?.name || match.home?.display_name || '').trim();
        const aName = (match.away?.name || match.away?.display_name || '').trim();
        const hRegex = makeFlexibleTeamRegex(hName);
        const aRegex = makeFlexibleTeamRegex(aName);

        const homeNameOrId = [];
        if (homeId) homeNameOrId.push({ 'home.source_id': homeId }, { 'away.source_id': homeId });
        if (hRegex) homeNameOrId.push({ 'home.name': hRegex }, { 'away.name': hRegex }, { 'home.display_name': hRegex }, { 'away.display_name': hRegex });

        const awayNameOrId = [];
        if (awayId) awayNameOrId.push({ 'home.source_id': awayId }, { 'away.source_id': awayId });
        if (aRegex) awayNameOrId.push({ 'home.name': aRegex }, { 'away.name': aRegex }, { 'home.display_name': aRegex }, { 'away.display_name': aRegex });

        const homeSpecificTeamOr = [
            ...(homeId ? [{ 'home.source_id': homeId }] : []),
            ...(hRegex ? [{ 'home.name': hRegex }, { 'home.display_name': hRegex }] : [])
        ];
        const awaySpecificTeamOr = [
            ...(awayId ? [{ 'away.source_id': awayId }] : []),
            ...(aRegex ? [{ 'away.name': aRegex }, { 'away.display_name': aRegex }] : [])
        ];
        const homeReversedTeamOr = [
            ...(awayId ? [{ 'home.source_id': awayId }] : []),
            ...(aRegex ? [{ 'home.name': aRegex }, { 'home.display_name': aRegex }] : [])
        ];
        const awayReversedTeamOr = [
            ...(homeId ? [{ 'away.source_id': homeId }] : []),
            ...(hRegex ? [{ 'away.name': hRegex }, { 'away.display_name': hRegex }] : [])
        ];

        const h2hOrClauses = [];
        if (homeSpecificTeamOr.length && awaySpecificTeamOr.length) {
            h2hOrClauses.push({
                $and: [
                    { $or: homeSpecificTeamOr },
                    { $or: awaySpecificTeamOr }
                ]
            });
        }
        if (homeReversedTeamOr.length && awayReversedTeamOr.length) {
            h2hOrClauses.push({
                $and: [
                    { $or: homeReversedTeamOr },
                    { $or: awayReversedTeamOr }
                ]
            });
        }

        const finishedFilter = {
            $or: [
                { 'status.state': { $in: ['post', 'final', 'completed'] } },
                { 'status.completed': true },
                { 'status.name': { $in: ['STATUS_FINAL', 'STATUS_FULL_TIME', 'STATUS_AFTER_ET', 'STATUS_AFTER_PK', 'FT', 'AET', 'AP'] } },
                { date: { $lt: new Date(Date.now() - 3 * 3600 * 1000) } }
            ]
        };

        // Run parallel queries: H2H, Home Recent Form, Away Recent Form, Standings
        const [h2hMatches, homeRecentMatches, awayRecentMatches, standingsGroup, leagueDoc] = await Promise.all([
            // H2H past meetings - fetch complete lifetime encounters without artificial cap
            h2hOrClauses.length ? SoccerMatch.find({
                $and: [
                    { $or: h2hOrClauses },
                    finishedFilter
                ]
            }).sort({ date: -1 }).limit(200).lean() : Promise.resolve([]),

            // Home team last 6 matches
            homeNameOrId.length ? SoccerMatch.find({
                $and: [
                    { $or: homeNameOrId },
                    finishedFilter
                ]
            }).sort({ date: -1 }).limit(6).lean() : Promise.resolve([]),

            // Away team last 6 matches
            awayNameOrId.length ? SoccerMatch.find({
                $and: [
                    { $or: awayNameOrId },
                    finishedFilter
                ]
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
        const queryEspnId = targetEspnId || (/^\d{6,}$/.test(eventId) ? eventId : null);
        if (queryEspnId) {
            try {
                const https = require('https');
                const zlib = require('zlib');
                espnSummary = await new Promise((resolve) => {
                    const req = https.get(`https://site.api.espn.com/apis/site/v2/sports/soccer/all/summary?event=${encodeURIComponent(queryEspnId)}`, {
                        headers: { 'User-Agent': 'NorraScores/2.1', 'Accept-Encoding': 'gzip, deflate' },
                        timeout: 6000
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
    }

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
            const isMatchClubName = (candName, targetName) => {
                if (!candName || !targetName) return false;
                const c = candName.toLowerCase().replace(/[^a-z0-9]/g, '');
                const t = targetName.toLowerCase().replace(/[^a-z0-9]/g, '');
                return c.includes(t) || t.includes(c);
            };
            const hL5 = espnSummary.lastFiveGames.find(g => String(g.team?.id) === homeId || isMatchClubName(g.team?.displayName || g.team?.name, hName)) || espnSummary.lastFiveGames[0];
            const aL5 = espnSummary.lastFiveGames.find(g => String(g.team?.id) === awayId || isMatchClubName(g.team?.displayName || g.team?.name, aName)) || espnSummary.lastFiveGames[1];

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

        let matches = [];
        if (mongoose.connection && mongoose.connection.readyState === 1) {
            try {
                matches = await SoccerMatch.find(filter)
                    .sort({ date: -1 })
                    .limit(limit)
                    .lean();
            } catch (dbErr) {
                console.warn('Training data query warning:', dbErr.message);
                matches = [];
            }
        }

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
const apiMatchDetailsCache = new Map();

router.get('/matches/:eventId', async (req, res) => {
    try {
        const eventId = String(req.params.eventId).trim();
        const cached = apiMatchDetailsCache.get(eventId);
        if (cached && Date.now() < cached.expiresAt) {
            res.set('Cache-Control', `public, max-age=${cached.ttl}`);
            return res.json(cached.data);
        }

        const isMongoId = /^[0-9a-fA-F]{24}$/.test(eventId);
        const match = await SoccerMatch.findOne({
            $or: [
                { 'source.event_id': eventId },
                { 'source.competition_id': eventId },
                { 'source.livescore_id': eventId },
                { 'source.espn_id': eventId },
                ...(isMongoId ? [{ _id: eventId }] : [])
            ]
        }).lean();

        if (!match) {
            // Check if this is an ESPN event ID or LiveScore event ID that can be fetched live on-demand
            if (/^\d{5,}$/.test(eventId)) {
                try {
                    const https = require('https');
                    const zlib = require('zlib');
                    const espnUrl = `https://site.api.espn.com/apis/site/v2/sports/soccer/all/summary?event=${encodeURIComponent(eventId)}`;
                    const liveEspnData = await new Promise((resolve) => {
                        const req = https.get(espnUrl, {
                            headers: { 'User-Agent': 'NorraScores/2.1', 'Accept-Encoding': 'gzip, deflate' },
                            timeout: 4500
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

                    if (liveEspnData && liveEspnData.header) {
                        const comp = liveEspnData.header?.competitions?.[0] || {};
                        const summary = {
                            id: eventId,
                            header: liveEspnData.header,
                            boxscore: liveEspnData.boxscore || { teams: [] },
                            keyEvents: liveEspnData.keyEvents || [],
                            rosters: liveEspnData.rosters || [],
                            gameInfo: liveEspnData.gameInfo || {},
                            seasonseries: liveEspnData.seasonseries || [],
                            lastFiveGames: liveEspnData.lastFiveGames || [],
                            predictor: liveEspnData.predictor,
                            pickcenter: liveEspnData.pickcenter,
                            status: comp.status?.type || { state: 'pre' }
                        };

                        let timelinePlays = (summary.keyEvents || []).map((ke, idx) => ({
                            id: ke.id || `play-${idx}`,
                            sequence: idx + 1,
                            type: ke.type || { text: 'Play' },
                            text: ke.text || '',
                            clock: typeof ke.clock === 'string' ? { displayValue: ke.clock, value: ke.clockValue || 0 } : (ke.clock || { displayValue: '', value: 0 }),
                            scoringPlay: Boolean(ke.scoringPlay),
                            team: ke.team || null,
                            participants: (ke.athletesInvolved || []).map(a => ({ athlete: a }))
                        }));

                        res.set('Cache-Control', 'public, max-age=10');
                        return res.json({
                            status: 'success',
                            match: summary,
                            summary: summary,
                            timeline: timelinePlays
                        });
                    }
                } catch (liveFetchErr) {
                    console.error('[LiveMatchFetch] On-demand ESPN match summary fetch failed:', liveFetchErr.message);
                }
            }

            // Fallback for LiveScore match IDs
            try {
                const { fetchLiveScoreMatchDetails } = require('../services/soccerSyncService');
                const lsData = await fetchLiveScoreMatchDetails(eventId);
                if (lsData && (lsData.boxscore || lsData.keyEvents?.length || lsData.rosters?.length)) {
                    const summary = {
                        id: eventId,
                        header: {
                            competitions: [{
                                id: eventId,
                                status: { type: { state: 'in', description: 'Live' } },
                                details: lsData.keyEvents || []
                            }]
                        },
                        boxscore: lsData.boxscore || { teams: [] },
                        keyEvents: lsData.keyEvents || [],
                        rosters: lsData.rosters || [],
                        gameInfo: lsData.gameInfo || {},
                        status: { state: 'in' }
                    };
                    res.set('Cache-Control', 'public, max-age=10');
                    return res.json({
                        status: 'success',
                        match: summary,
                        summary: summary,
                        timeline: (lsData.keyEvents || []).map((ke, idx) => ({
                            id: ke.id || `play-${idx}`,
                            sequence: idx + 1,
                            type: { text: ke.type || 'Play' },
                            text: ke.text || '',
                            clock: { displayValue: `${ke.clock || 0}'`, value: ke.clock || 0 },
                            scoringPlay: Boolean(ke.scoringPlay),
                            team: ke.team || null,
                            participants: (ke.athletesInvolved || []).map(a => ({ athlete: a }))
                        }))
                    });
                }
            } catch (lsErr) {}

            return res.status(404).json({ error: 'Match not found' });
        }

        const targetEspnId = await resolveMatchEspnId(match, eventId);

        const [league, plays] = await Promise.all([
            SoccerLeague.findOne({ slug: match.league_slug }).lean(),
            SoccerMatchEvent.find({
                $or: [
                    { event_id: eventId },
                    { match_id: eventId },
                    ...(targetEspnId ? [{ event_id: targetEspnId }, { match_id: targetEspnId }] : [])
                ]
            }).sort({ sequence_number: 1, clock_seconds: 1 }).limit(200).lean()
        ]);

        const summary = serializeSummary(match, league || { slug: match.league_slug, name: match.note });

        // Enrich with real-time ESPN match telemetry
        const queryEspnId = targetEspnId || (/^\d{6,}$/.test(eventId) ? eventId : null);
        if (queryEspnId) {
            try {
                const https = require('https');
                const zlib = require('zlib');
                const espnData = await new Promise((resolve, reject) => {
                    const req = https.get(`https://site.api.espn.com/apis/site/v2/sports/soccer/${match.league_slug || 'all'}/summary?event=${encodeURIComponent(queryEspnId)}`, {
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
            } catch {}
        }

        // If ESPN provided no boxscore or for LiveScore matches, enrich with LiveScore telemetry
        const hasStats = Boolean(
            summary.boxscore?.teams?.[0]?.statistics?.length ||
            summary.boxscore?.teams?.[1]?.statistics?.length
        );
        const isLiveScoreEvent = String(match.source?.provider || '').toLowerCase() === 'livescore'
            || Boolean(match.source?.livescore_id)
            || String(match.source?.event_id || eventId).length <= 8;

        if (!hasStats || isLiveScoreEvent || !summary.keyEvents?.length) {
            try {
                const { fetchLiveScoreMatchDetails } = require('../services/soccerSyncService');
                const lsId = match.source?.livescore_id || (String(match.source?.provider || '').toLowerCase() === 'livescore' ? match.source?.event_id : null) || eventId;
                const lsData = await fetchLiveScoreMatchDetails(lsId);
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

            // If neither provider broadcasted granular boxscore telemetry (e.g. youth matches, U17 WC, or lower domestic divisions),
            // preserve authentic empty statistics rather than synthesizing dummy figures (possession %, shots, corners)
            if (!summary.boxscore) {
                summary.boxscore = {
                    isDerivedTelemetry: false,
                    teams: [
                        { id: 'home', homeAway: 'home', team: match.home, statistics: [] },
                        { id: 'away', homeAway: 'away', team: match.away, statistics: [] }
                    ]
                };
            }

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

        const isLive = match.status?.state === 'in';
        const ttl = isLive ? 5 : 60;
        const responsePayload = {
            status: 'success',
            match: summary,
            summary: summary,
            timeline: timelinePlays
        };
        apiMatchDetailsCache.set(eventId, {
            data: responsePayload,
            expiresAt: Date.now() + ttl * 1000,
            ttl
        });

        res.set('Cache-Control', `public, max-age=${ttl}`);
        return res.json(responsePayload);
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

const CREST_DIR = path.join(__dirname, '..', 'public', 'crests');
try { fs.mkdirSync(CREST_DIR, { recursive: true }); } catch {}

async function handleCrestProxy(req, res) {
    const rawUrl = req.query.url;
    if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.startsWith('http')) {
        return res.status(400).send('Valid url parameter required');
    }
    try {
        const hash = crypto.createHash('md5').update(rawUrl).digest('hex');
        const extMatch = rawUrl.match(/\.(png|jpg|jpeg|svg|webp)/i);
        const ext = extMatch ? extMatch[1].toLowerCase() : 'png';
        const filename = `${hash}.${ext}`;
        const localPath = path.join(CREST_DIR, filename);

        res.set('Cache-Control', 'public, max-age=31536000, immutable');

        if (fs.existsSync(localPath)) {
            return res.sendFile(localPath);
        }

        const client = rawUrl.startsWith('https') ? require('https') : require('http');
        const fileStream = fs.createWriteStream(localPath);
        const upstreamReq = client.get(rawUrl, {
            headers: { 'User-Agent': 'NorraScores/2.1' },
            timeout: 5000
        }, (upstreamRes) => {
            if (upstreamRes.statusCode === 200) {
                upstreamRes.pipe(fileStream);
                fileStream.on('finish', () => {
                    res.sendFile(localPath);
                });
            } else {
                fs.unlink(localPath, () => {});
                return res.redirect(rawUrl);
            }
        });
        upstreamReq.on('error', () => {
            fs.unlink(localPath, () => {});
            return res.redirect(rawUrl);
        });
        upstreamReq.on('timeout', () => {
            upstreamReq.destroy();
            fs.unlink(localPath, () => {});
            return res.redirect(rawUrl);
        });
    } catch {
        return res.redirect(rawUrl);
    }
}

router.get('/crest-proxy', handleCrestProxy);

module.exports = app => {
    app.use('/api/v1/football', router);
    app.get('/cdn/crest', handleCrestProxy);
};
