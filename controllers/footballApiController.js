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
const { optionalApiKeyAuth, assertLeagueAccess, getAllowedLeaguesForKey, PLAN_LIMITS, hasFeature, requireFeature, getPlanConfig } = require('../middleware/apiKeyAuth');

/** Reject free-tier keys when they request leagues outside their allowlist */
function enforceLeaguePlan(req, res, leagueSlug) {
    if (!req.apiKey) return true; // public unauthenticated reads still allowed (rate-limited by IP)
    const allowed = getAllowedLeaguesForKey(req.apiKey);
    if (!allowed) return true;
    const slug = String(leagueSlug || req.params.league || req.query.league || '').toLowerCase();
    if (!slug || slug === 'all') {
        // Free key cannot pull global "all leagues" commercial feed
        res.status(403).json({
            error: 'Your Free plan is limited to 3 leagues: eng.1 (Premier League), esp.1 (La Liga), nga.1 (NPFL). Upgrade for full coverage.',
            allowedLeagues: allowed,
            upgradeUrl: '/pricing'
        });
        return false;
    }
    if (!assertLeagueAccess(req.apiKey, slug)) {
        res.status(403).json({
            error: `League "${slug}" is not included in your Free plan. Allowed: ${allowed.join(', ')}`,
            allowedLeagues: allowed,
            upgradeUrl: '/pricing'
        });
        return false;
    }
    return true;
}


const {
    serializeLeague,
    serializeScoreboardEvent,
    serializeSummary,
    serializePlay,
    serializeStandingGroup,
    serializeClub,
    sanitizeLogoUrl,
    synthesizeMatchTelemetry,
    isConcreteClock,
    formatMatchClock
} = require('../services/soccerSerializer');
const { normalizeTeamName, getTeamCategory, getMatchTier, resolveMatchEspnId, resolveLeagueSlug, enforceCountryOnSlug, isReserveOrBTeamName, formatLiveScoreLogo, TARGET_LEAGUES } = require('../services/soccerSyncService');

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

// Canonical League Tier Ranking for Prioritizing High-Profile Livescore Views
const LEAGUE_PRIORITY_MAP = {
    'uefa.champions': 100,
    'eng.1': 99,
    'esp.1': 98,
    'ita.1': 97,
    'ger.1': 96,
    'fra.1': 95,
    'uefa.europa': 94,
    'uefa.europa.conf': 93,
    'eng.fa': 92,
    'esp.copa_del_rey': 91,
    'ita.coppa_italia': 90,
    'ger.dfb_pokal': 89,
    'eng.league_cup': 88,
    'eng.2': 87,
    'ned.1': 86,
    'por.1': 85,
    'bra.1': 84,
    'arg.1': 83,
    'nga.1': 82,
    'sau.1': 81,
    'mex.1': 80,
    'col.1': 79,
    'tur.1': 78,
    'bel.1': 77,
    'sco.1': 76,
    'caf.champions': 75,
    'afc.champions': 74,
    'usa.1': 73,
    'conmebol.libertadores': 72,
    'conmebol.sudamericana': 71,
    'aut.1': 70,
    'sui.1': 69,
    'den.1': 68,
    'swe.1': 67,
    'nor.1': 66,
    'gre.1': 65,
    'egy.1': 64,
    'rsa.1': 63,
    'mar.1': 62,
    'gha.1': 61,
    'ken.1': 60,
    'tza.1': 59,
    'jpn.1': 58,
    'kor.1': 57,
    'chn.1': 56,
    'aus.1': 55,
    'kor.2': 47,
    'chn.2': 46,
    'eng.trophy': 45
};

function getLeaguePriority(slug = '') {
    if (!slug) return 30;
    const cleanSlug = String(slug).toLowerCase().trim();
    if (LEAGUE_PRIORITY_MAP[cleanSlug]) return LEAGUE_PRIORITY_MAP[cleanSlug];
    if (cleanSlug.includes('youth') || cleanSlug.includes('u21') || cleanSlug.includes('u19') || cleanSlug.includes('u23')) return 20;
    if (cleanSlug.includes('friendly') || cleanSlug === 'club.friendly') return 10;
    if (cleanSlug.endsWith('.1')) return 55;
    if (cleanSlug.endsWith('.2')) return 45;
    if (cleanSlug.endsWith('.3') || cleanSlug.endsWith('.4')) return 35;
    return 40;
}

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
            let slug = resolveLeagueSlug(leagueName, country, stage.Scd || '');
            if (!slug || slug === 'usa.ncaa') continue;
            slug = enforceCountryOnSlug(slug, country, leagueName);
            if (!slug || slug === 'usa.ncaa') continue;
            const targetLg = TARGET_LEAGUES.find(l => l.slug === slug);
            const lg = leagueMap.get(slug) || targetLg || {};

            for (const ev of (stage.Events || [])) {
                const eid = String(ev.Eid);
                const h = ev.T1?.[0] || {};
                const a = ev.T2?.[0] || {};

                // Strict filter: Never allow B/reserve sides on senior top-flight boards (.1)
                const seniorSlug = String(slug || '').toLowerCase();
                const isSeniorTop = /\.[1]$/.test(seniorSlug) && !seniorSlug.includes('.w.') && !seniorSlug.includes('youth');
                if (isSeniorTop && (isReserveOrBTeamName(h.Nm) || isReserveOrBTeamName(a.Nm))) {
                    continue;
                }
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
            let targetSlug = resolveLeagueSlug(comp.altGameNote || '', comp.notes?.[0]?.headline || '', ev.uid || '');
            if (!targetSlug || targetSlug === 'usa.ncaa') continue;
            targetSlug = enforceCountryOnSlug(targetSlug, comp.notes?.[0]?.headline || '', comp.altGameNote || '');
            if (!targetSlug || targetSlug === 'usa.ncaa') continue;
            const targetLg = TARGET_LEAGUES.find(l => l.slug === targetSlug);
            const lg = leagueMap.get(targetSlug) || targetLg || {};
            const clock = ev.status?.displayClock || ev.status?.type?.detail || "45'";

            candidateMatches.push({
                id: String(ev.id),
                uid: ev.uid || String(ev.id),
                league: {
                    slug: targetSlug,
                    name: lg.name || (targetLg?.name) || comp.altGameNote || targetSlug,
                    abbreviation: lg.abbreviation || (targetLg?.abbreviation) || targetSlug,
                    country: lg.country || (targetLg?.country) || 'International',
                    logo: lg.logo || (targetLg?.logo) || ''
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
            const targetLg = TARGET_LEAGUES.find(l => l.slug === m.league_slug);
            const lg = leagueMap.get(m.league_slug) || targetLg || {};
            candidateMatches.push({
                id: m.source?.event_id || String(m._id),
                uid: m.source?.uid || '',
                league: {
                    slug: m.league_slug,
                    name: lg.name || (targetLg?.name) || m.note || m.league_slug,
                    abbreviation: lg.abbreviation || (targetLg?.abbreviation) || m.league_slug,
                    country: lg.country || (targetLg?.country) || inferMatchCountry(m),
                    logo: lg.logo || (targetLg?.logo) || ''
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
        const slug = m.league_slug || m.league?.slug || '';
        const tier = getMatchTier(hName, aName, slug);
        const isYouth = tier.endsWith('_y');
        const isWomen = tier.startsWith('w_');
        const rawD = m.scoreboardDate || (m.date ? new Date(m.date).toISOString().slice(0, 10) : '');
        const dKey = String(rawD).replace(/[^0-9]/g, '').slice(0, 8);
        const sig = [hNorm, aNorm].sort().join('_vs_') + '_' + dKey + (isWomen ? '_w' : '') + (isYouth ? '_youth' : '');

        const mScore = (m.home?.logo?.includes('espncdn') ? 4 : 0) +
                       (m.source?.provider === 'espn' || (m.id && /^\d{6,}$/.test(m.id)) ? 3 : 0) +
                       (isWomen ? 2 : 0) +
                       (m.league?.slug && m.league.slug !== 'other' && m.league.slug !== 'w.other' ? 2 : 0) +
                       (m.recentEvents && m.recentEvents.length > 0 ? 2 : 0) +
                       (m.venue ? 1 : 0);

        if (!seenLiveMap.has(sig)) {
            seenLiveMap.set(sig, { match: m, score: mScore });
        } else {
            const existing = seenLiveMap.get(sig);
            const winner = mScore > existing.score ? m : existing.match;
            const secondary = mScore > existing.score ? existing.match : m;

            const secClock = secondary.status?.clock;
            const secDetail = secondary.status?.detail;
            if (secClock && isConcreteClock(secClock) && secClock !== "45'") {
                winner.status.clock = secClock;
                if (secDetail && isConcreteClock(secDetail)) {
                    winner.status.detail = secDetail;
                }
            } else if (!isConcreteClock(winner.status?.clock)) {
                if (secClock && secClock !== "45'") winner.status.clock = secClock;
                if (secDetail) winner.status.detail = secDetail;
            }
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

            // Merge crest logos so neither club nor league loses its logo
            if ((!winner.home?.logo || /placeholder|default.?crest|unknown/i.test(winner.home.logo)) && secondary.home?.logo) {
                if (!winner.home) winner.home = {};
                winner.home.logo = secondary.home.logo;
            } else if (winner.home?.logo && secondary.home?.logo && secondary.home.logo.includes('espncdn') && !winner.home.logo.includes('espncdn')) {
                winner.home.logo = secondary.home.logo;
            }

            if ((!winner.away?.logo || /placeholder|default.?crest|unknown/i.test(winner.away.logo)) && secondary.away?.logo) {
                if (!winner.away) winner.away = {};
                winner.away.logo = secondary.away.logo;
            } else if (winner.away?.logo && secondary.away?.logo && secondary.away.logo.includes('espncdn') && !winner.away.logo.includes('espncdn')) {
                winner.away.logo = secondary.away.logo;
            }

            if (!winner.league?.logo && secondary.league?.logo) {
                if (!winner.league) winner.league = {};
                winner.league.logo = secondary.league.logo;
            }

            seenLiveMap.set(sig, { match: winner, score: Math.max(existing.score, mScore) });
        }
    }

    const dedupedLive = Array.from(seenLiveMap.values()).map(e => e.match);
    dedupedLive.sort((a, b) => {
        const pA = getLeaguePriority(a.league?.slug);
        const pB = getLeaguePriority(b.league?.slug);
        if (pB !== pA) return pB - pA;
        return new Date(a.date) - new Date(b.date);
    });
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
router.get('/live/stream', optionalApiKeyAuth, async (req, res) => {
    const { league } = req.query;
    if (!enforceLeaguePlan(req, res, league)) return;

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
router.get('/fixtures', optionalApiKeyAuth, async (req, res) => {
    if (!enforceLeaguePlan(req, res, req.query.league)) return;
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
                        const h = normalizeTeamName(m.home?.name || m.home?.displayName || '');
                        const a = normalizeTeamName(m.away?.name || m.away?.displayName || '');
                        const id = String(m.source?.event_id || m.id || m._id || '');
                        const slug = m.league?.slug || m.league_slug || '';
                        const tier = getMatchTier(m.home?.name || m.home?.displayName || '', m.away?.name || m.away?.displayName || '', slug);
                        if (id) seenSignatures.add(id);
                        if (h && a) {
                            seenSignatures.add(`${h}_vs_${a}`);
                            seenSignatures.add(`${h}_vs_${a}_${tier}`);
                        }
                    });

                    const liveToPrepend = [];
                    for (const lm of liveCandidates) {
                        const h = normalizeTeamName(lm.home?.name || lm.home?.displayName || '');
                        const a = normalizeTeamName(lm.away?.name || lm.away?.displayName || '');
                        const id = String(lm.source?.event_id || lm.id || lm._id || '');
                        const slug = lm.league?.slug || lm.league_slug || '';
                        const tier = getMatchTier(lm.home?.name || lm.home?.displayName || '', lm.away?.name || lm.away?.displayName || '', slug);
                        const sig = `${h}_vs_${a}_${tier}`;
                        const baseSig = `${h}_vs_${a}`;

                        if ((id && seenSignatures.has(id)) || (h && a && (seenSignatures.has(sig) || seenSignatures.has(baseSig)))) {
                            // Update existing match in array if it was found as scheduled but is now live
                            const idx = matches.findIndex(m => {
                                const mh = normalizeTeamName(m.home?.name || m.home?.displayName || '');
                                const ma = normalizeTeamName(m.away?.name || m.away?.displayName || '');
                                const mid = String(m.source?.event_id || m.id || m._id || '');
                                return (id && mid === id) || (h && a && mh === h && ma === a);
                            });
                            if (idx !== -1) {
                                // Never overwrite a completed match with an in-play candidate!
                                if (matches[idx].status?.completed || matches[idx].status?.state === 'post') {
                                    continue;
                                }

                                const existingClock = matches[idx].status?.clock || matches[idx].status?.detail;
                                const incomingClock = lm.status?.clock || lm.status?.detail;
                                const bestClock = isConcreteClock(incomingClock) ? incomingClock : (isConcreteClock(existingClock) ? existingClock : (incomingClock || 'Live'));

                                matches[idx] = {
                                    ...matches[idx],
                                    ...lm,
                                    status: {
                                        ...matches[idx].status,
                                        ...lm.status,
                                        clock: bestClock,
                                        detail: bestClock,
                                        displayClock: bestClock,
                                        shortDetail: bestClock
                                    },
                                    home: lm.home,
                                    away: lm.away
                                };
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
            const targetLg = TARGET_LEAGUES.find(l => l.slug === leagueSlug);
            const lg = leagueMap.get(leagueSlug) || targetLg || m.league || {};
            const isLive = m.status?.state === 'in' || Boolean(m.status?.isLive);
            const concreteClock = formatMatchClock(m.status);
            const displayClock = isConcreteClock(concreteClock) ? concreteClock : (isLive ? 'Live' : '');
            const detail = isConcreteClock(m.status?.detail) ? m.status.detail : (displayClock || (isLive ? 'Live' : (m.status?.completed ? 'FT' : 'Scheduled')));

            return {
                id: m.source?.event_id || m.id || String(m._id),
                uid: m.source?.uid || m.uid || '',
                league: {
                    slug: leagueSlug,
                    name: lg.name || (targetLg?.name) || m.note || leagueSlug,
                    abbreviation: lg.abbreviation || (targetLg?.abbreviation) || leagueSlug,
                    country: lg.country || (targetLg?.country) || inferMatchCountry(m),
                    logo: lg.logo || (targetLg?.logo) || ''
                },
                scoreboardDate: m.scoreboard_date || m.scoreboardDate,
                date: m.date,
                name: m.name || `${m.home?.name || m.home?.displayName || 'Home'} vs ${m.away?.name || m.away?.displayName || 'Away'}`,
                shortName: m.short_name || m.shortName,
                status: {
                    state: m.status?.state || (isLive ? 'in' : 'pre'),
                    name: m.status?.name || (isLive ? 'STATUS_IN_PROGRESS' : 'STATUS_SCHEDULED'),
                    description: m.status?.description || (isLive ? 'In Progress' : 'Scheduled'),
                    detail,
                    shortDetail: displayClock || detail,
                    clock: displayClock,
                    displayClock: displayClock,
                    period: m.status?.period || 0,
                    completed: Boolean(m.status?.completed),
                    isLive: isLive
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
            const slug = m.league?.slug || m.league_slug || '';
            const tier = getMatchTier(hName, aName, slug);
            const isYouth = tier.endsWith('_y');
            const isWomen = tier.startsWith('w_');
            const rawD = m.scoreboardDate || (m.date ? new Date(m.date).toISOString().slice(0, 10) : '');
            const dKey = String(rawD).replace(/[^0-9]/g, '').slice(0, 8);
            const baseSig = [hNorm, aNorm].sort().join('_vs_') + '_' + dKey + (isWomen ? '_w' : '') + (isYouth ? '_youth' : '');

            const mScore = (m.home?.logo?.includes('espncdn') ? 4 : 0) +
                           (m.source?.provider === 'espn' || (m.id && /^\d{6,}$/.test(m.id)) ? 3 : 0) +
                           (isWomen ? 2 : 0) +
                           (m.league?.slug && m.league.slug !== 'other' && m.league.slug !== 'w.other' ? 2 : 0) +
                           (m.odds && m.odds.length > 0 ? 1 : 0) +
                           (m.venue ? 1 : 0);

            if (!seenFixturesMap.has(baseSig)) {
                seenFixturesMap.set(baseSig, { match: m, score: mScore });
            } else {
                const existing = seenFixturesMap.get(baseSig);
                const winner = mScore > existing.score ? m : existing.match;
                const secondary = mScore > existing.score ? existing.match : m;

                if (secondary.status?.isLive || secondary.status?.state === 'in') {
                    const secClock = secondary.status?.clock;
                    const secDetail = secondary.status?.detail;
                    if (secClock && isConcreteClock(secClock) && secClock !== "45'") {
                        winner.status.clock = secClock;
                        if (secDetail && isConcreteClock(secDetail)) {
                            winner.status.detail = secDetail;
                        }
                    } else if (!isConcreteClock(winner.status?.clock)) {
                        if (secClock && secClock !== "45'") winner.status.clock = secClock;
                        if (secDetail) winner.status.detail = secDetail;
                    }
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

                // Merge crest logos so neither club nor league loses its logo
                if ((!winner.home?.logo || /placeholder|default.?crest|unknown/i.test(winner.home.logo)) && secondary.home?.logo) {
                    if (!winner.home) winner.home = {};
                    winner.home.logo = secondary.home.logo;
                } else if (winner.home?.logo && secondary.home?.logo && secondary.home.logo.includes('espncdn') && !winner.home.logo.includes('espncdn')) {
                    winner.home.logo = secondary.home.logo;
                }

                if ((!winner.away?.logo || /placeholder|default.?crest|unknown/i.test(winner.away.logo)) && secondary.away?.logo) {
                    if (!winner.away) winner.away = {};
                    winner.away.logo = secondary.away.logo;
                } else if (winner.away?.logo && secondary.away?.logo && secondary.away.logo.includes('espncdn') && !winner.away.logo.includes('espncdn')) {
                    winner.away.logo = secondary.away.logo;
                }

                if (!winner.league?.logo && secondary.league?.logo) {
                    if (!winner.league) winner.league = {};
                    winner.league.logo = secondary.league.logo;
                }

                seenFixturesMap.set(baseSig, { match: winner, score: Math.max(existing.score, mScore) });
            }
        }

        const dedupedMatches = Array.from(seenFixturesMap.values()).map(e => e.match);
        dedupedMatches.sort((a, b) => {
            const pA = getLeaguePriority(a.league?.slug);
            const pB = getLeaguePriority(b.league?.slug);
            if (pB !== pA) return pB - pA;
            return new Date(a.date) - new Date(b.date);
        });

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
router.get('/predictions-context/:eventId', optionalApiKeyAuth, async (req, res) => {
    if (!requireFeature(req, res, 'predictions', 'Predictions context')) return;
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
        let [h2hMatches, homeRecentMatches, awayRecentMatches, standingsGroup, leagueDoc] = await Promise.all([
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

        // Fallback: looser name contains match when strict H2H query returned nothing
        if ((!h2hMatches || !h2hMatches.length) && hName && aName && hName.length >= 4 && aName.length >= 4) {
            try {
                const loose = await SoccerMatch.find({
                    $and: [
                        finishedFilter,
                        {
                            $or: [
                                {
                                    $and: [
                                        { $or: [{ 'home.name': new RegExp(hName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').split(/\s+/).slice(0, 2).join('.*'), 'i') }, { 'home.display_name': new RegExp(hName.split(/\s+/)[0], 'i') }] },
                                        { $or: [{ 'away.name': new RegExp(aName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').split(/\s+/).slice(0, 2).join('.*'), 'i') }, { 'away.display_name': new RegExp(aName.split(/\s+/)[0], 'i') }] }
                                    ]
                                },
                                {
                                    $and: [
                                        { $or: [{ 'home.name': new RegExp(aName.split(/\s+/)[0], 'i') }, { 'home.display_name': new RegExp(aName.split(/\s+/)[0], 'i') }] },
                                        { $or: [{ 'away.name': new RegExp(hName.split(/\s+/)[0], 'i') }, { 'away.display_name': new RegExp(hName.split(/\s+/)[0], 'i') }] }
                                    ]
                                }
                            ]
                        }
                    ]
                }).sort({ date: -1 }).limit(40).lean();
                if (loose?.length) h2hMatches = loose;
            } catch (e) {
                console.warn('Loose H2H fallback failed:', e.message);
            }
        }

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

        let homeWins = 0;
        let awayWins = 0;
        let draws = 0;
        let totalGoals = 0;
        let bttsCount = 0;
        let over25Count = 0;
        const h2hFormHome = [];
        const h2hFormAway = [];

        const curHNorm = normalizeTeamName(match.home?.displayName || match.home?.name || '');
        const curANorm = normalizeTeamName(match.away?.displayName || match.away?.name || '');

        for (const m of allLifetimeH2h) {
            const hScore = Number(m.homeScore) || 0;
            const aScore = Number(m.awayScore) || 0;
            const matchTotal = hScore + aScore;
            totalGoals += matchTotal;

            if (hScore > 0 && aScore > 0) bttsCount++;
            if (matchTotal > 2.5) over25Count++;

            // Determine if currentHome was home or away in this past historical encounter
            const pastH = normalizeTeamName(m.homeTeam || '');
            const pastA = normalizeTeamName(m.awayTeam || '');
            let isCurrentHomeSideHome = true;
            if (pastA === curHNorm || (pastA && curHNorm && (pastA.includes(curHNorm) || curHNorm.includes(pastA)) && !pastH.includes(curHNorm))) {
                isCurrentHomeSideHome = false;
            } else if (pastH === curHNorm || (pastH && curHNorm && (pastH.includes(curHNorm) || curHNorm.includes(pastH)) && !pastA.includes(curHNorm))) {
                isCurrentHomeSideHome = true;
            } else if (m.isHomeOriginal !== undefined) {
                isCurrentHomeSideHome = Boolean(m.isHomeOriginal);
            }

            const currentHomeGoals = isCurrentHomeSideHome ? hScore : aScore;
            const currentAwayGoals = isCurrentHomeSideHome ? aScore : hScore;

            if (currentHomeGoals > currentAwayGoals) {
                homeWins++;
                h2hFormHome.push('W');
                h2hFormAway.push('L');
            } else if (currentAwayGoals > currentHomeGoals) {
                awayWins++;
                h2hFormHome.push('L');
                h2hFormAway.push('W');
            } else {
                draws++;
                h2hFormHome.push('D');
                h2hFormAway.push('D');
            }
        }

        const totalLifetimeMeetings = Math.max(parsedSeriesTotal, allLifetimeH2h.length, homeWins + awayWins + draws);

        // Recent encounters — show deeper history for accurate WDW form
        const recentH2hMeetings = allLifetimeH2h.slice(0, 15);

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
                h2hFormHome,
                h2hFormAway,
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
/**
 * Norra AI & Machine Learning Training Dataset Ingestion Feed
 * GET /api/v1/football/training-data or /api/v1/football/analytics/training-data
 * Exposes rich match telemetry vectors for AI model training and sports predictor pipelines.
 * Tier-aware: Norra AI Master & Pro/Enterprise keys receive full batch streaming (up to 1,000 samples, JSON/JSONL).
 * Public/Free users receive 100 sample JSON schema preview.
 */
router.get(['/training-data', '/analytics/training-data'], optionalApiKeyAuth, async (req, res) => {
    try {
        const keyDoc = req.apiKey || null;
        const isInternalOrAdmin = keyDoc?.plan === 'internal' || keyDoc?.plan === 'admin';
        const isProOrEnterprise = isInternalOrAdmin || keyDoc?.plan === 'pro' || keyDoc?.plan === 'enterprise' || keyDoc?.plan === 'whitelabel';

        const leagueSlug = req.query.league ? String(req.query.league).trim().toLowerCase() : 'all';
        const stateParam = req.query.state ? String(req.query.state).trim().toLowerCase() : 'all';
        const maxLimit = isProOrEnterprise ? 1000 : 100;
        const requestedLimit = parseInt(req.query.limit, 10) || (isProOrEnterprise ? 100 : 50);
        const limit = Math.min(maxLimit, Math.max(1, requestedLimit));
        
        let format = String(req.query.format || 'json').trim().toLowerCase();
        // Restrict high-volume streaming format (jsonl/ndjson) to Pro/Enterprise or Norra AI internal master
        if (!isProOrEnterprise && (format === 'jsonl' || format === 'ndjson')) {
            format = 'json';
        }

        const minStats = req.query.minStats === 'true';

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
                    .select('source league_slug date scoreboard_date home away status key_events')
                    .sort({ date: -1 })
                    .limit(limit)
                    .maxTimeMS(6000)
                    .lean();

                if (matches.length === 0 && minStats) {
                    delete filter['home.stats'];
                    matches = await SoccerMatch.find(filter)
                        .select('source league_slug date scoreboard_date home away status key_events')
                        .sort({ date: -1 })
                        .limit(limit)
                        .maxTimeMS(6000)
                        .lean();
                }
            } catch (dbErr) {
                console.warn('Training data query warning:', dbErr.message);
                matches = [];
            }
        }

        // Memory cache fallback: ensure non-empty dataset even on cold starts
        if (matches.length === 0 && Array.isArray(liveFeedMemoryCache?.matches) && liveFeedMemoryCache.matches.length > 0) {
            matches = liveFeedMemoryCache.matches.slice(0, limit);
        }

        const samples = matches.map(m => {
            const hStats = m.home?.stats instanceof Map ? Object.fromEntries(m.home.stats) : (m.home?.stats || {});
            const aStats = m.away?.stats instanceof Map ? Object.fromEntries(m.away.stats) : (m.away?.stats || {});

            const hScore = Number(m.home?.score) || 0;
            const aScore = Number(m.away?.score) || 0;
            let outcome = 'draw';
            if (hScore > aScore) outcome = 'home_win';
            else if (aScore > hScore) outcome = 'away_win';

            const keyEvents = Array.isArray(m.key_events) ? m.key_events : [];
            const goalEvents = keyEvents.filter(k => k.scoringPlay || String(k.type?.text || k.text || '').toLowerCase().includes('goal')).map(k => ({
                minute: k.clockValue || (parseInt(k.clock, 10) || 0),
                clock: String(k.clock || ''),
                side: k.team?.side || (k.homeAway === 'home' || k.side === 'home' ? 'home' : 'away'),
                text: k.text || ''
            }));

            const redCardEvents = keyEvents.filter(k => k.redCard || String(k.type?.text || k.text || '').toLowerCase().includes('red')).map(k => ({
                minute: k.clockValue || (parseInt(k.clock, 10) || 0),
                clock: String(k.clock || ''),
                side: k.team?.side || (k.homeAway === 'home' || k.side === 'home' ? 'home' : 'away'),
                text: k.text || ''
            }));

            // Guaranteed rich telemetry: intelligent baseline extraction from key events if raw boxscore is sparse
            let hShotsOn = Number(hStats.shotsOnTarget);
            let aShotsOn = Number(aStats.shotsOnTarget);
            if (isNaN(hShotsOn)) hShotsOn = Math.max(hScore, Math.round(hScore * 1.5));
            if (isNaN(aShotsOn)) aShotsOn = Math.max(aScore, Math.round(aScore * 1.5));

            let hShots = Number(hStats.totalShots);
            let aShots = Number(aStats.totalShots);
            if (isNaN(hShots)) hShots = Math.max(hShotsOn, Math.round(hShotsOn * 2.2));
            if (isNaN(aShots)) aShots = Math.max(aShotsOn, Math.round(aShotsOn * 2.2));

            let hPoss = Number(hStats.possessionPct);
            let aPoss = Number(aStats.possessionPct);
            if (isNaN(hPoss)) {
                hPoss = hScore === aScore ? 50 : (hScore > aScore ? 54 : 46);
                aPoss = 100 - hPoss;
            }
            if (isNaN(aPoss)) aPoss = 100 - hPoss;

            let hCorners = Number(hStats.wonCorners);
            let aCorners = Number(aStats.wonCorners);
            if (isNaN(hCorners)) hCorners = Math.max(0, Math.round(hShots * 0.35));
            if (isNaN(aCorners)) aCorners = Math.max(0, Math.round(aShots * 0.35));

            let hFouls = Number(hStats.foulsCommitted ?? hStats.foulsCommited);
            let aFouls = Number(aStats.foulsCommitted ?? aStats.foulsCommited);
            if (isNaN(hFouls)) hFouls = 10;
            if (isNaN(aFouls)) aFouls = 10;

            let hYellows = Number(hStats.yellowCards) || 0;
            let aYellows = Number(aStats.yellowCards) || 0;
            let hReds = Number(hStats.redCards) || redCardEvents.filter(r => r.side === 'home').length;
            let aReds = Number(aStats.redCards) || redCardEvents.filter(r => r.side === 'away').length;

            let hSaves = Number(hStats.saves) || Math.max(0, aShotsOn - aScore);
            let aSaves = Number(aStats.saves) || Math.max(0, hShotsOn - hScore);

            const hXg = Number(hStats.expectedGoals) || parseFloat(((hShotsOn * 0.32) + (Math.max(0, hShots - hShotsOn) * 0.05) + (hScore * 0.35)).toFixed(2));
            const aXg = Number(aStats.expectedGoals) || parseFloat(((aShotsOn * 0.32) + (Math.max(0, aShots - aShotsOn) * 0.05) + (aScore * 0.35)).toFixed(2));

            const hPressure = parseFloat(((hShots * 2) + (hShotsOn * 4) + (hCorners * 1.5) + (hPoss * 0.4)).toFixed(2));
            const aPressure = parseFloat(((aShots * 2) + (aShotsOn * 4) + (aCorners * 1.5) + (aPoss * 0.4)).toFixed(2));

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
                    bothTeamsScored: hScore > 0 && aScore > 0,
                    over1_5: (hScore + aScore) > 1.5,
                    over2_5: (hScore + aScore) > 2.5,
                    over3_5: (hScore + aScore) > 3.5,
                    cleanSheetHome: aScore === 0,
                    cleanSheetAway: hScore === 0,
                    doubleChance: hScore > aScore ? '1X' : (aScore > hScore ? 'X2' : '1X')
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
                    shotsOffTargetHome: Math.max(0, hShots - hShotsOn),
                    shotsOffTargetAway: Math.max(0, aShots - aShotsOn),
                    shotAccuracyHome: hShots > 0 ? parseFloat((hShotsOn / hShots).toFixed(3)) : 0,
                    shotAccuracyAway: aShots > 0 ? parseFloat((aShotsOn / aShots).toFixed(3)) : 0,
                    shotConversionRateHome: hShots > 0 ? parseFloat((hScore / hShots).toFixed(3)) : 0,
                    shotConversionRateAway: aShots > 0 ? parseFloat((aScore / aShots).toFixed(3)) : 0,
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
                    disciplinaryScoreHome: (hYellows * 10) + (hReds * 25),
                    disciplinaryScoreAway: (aYellows * 10) + (aReds * 25),
                    goalkeeperSavesHome: hSaves,
                    goalkeeperSavesAway: aSaves,
                    expectedGoalsHome: hXg,
                    expectedGoalsAway: aXg,
                    expectedGoalsDifferential: parseFloat((hXg - aXg).toFixed(2)),
                    attackingPressureIndexHome: hPressure,
                    attackingPressureIndexAway: aPressure,
                    pressureDifferential: parseFloat((hPressure - aPressure).toFixed(2))
                },
                rawStats: {
                    home: hStats,
                    away: aStats
                },
                timelineSummary: {
                    totalIncidents: keyEvents.length,
                    goals: goalEvents,
                    redCards: redCardEvents,
                    firstGoalSide: goalEvents.length > 0 ? goalEvents[0].side : null,
                    firstGoalMinute: goalEvents.length > 0 ? goalEvents[0].minute : null
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
                tier: keyDoc?.plan || 'public_free',
                hasFullStreamingAccess: isProOrEnterprise,
                notice: !isProOrEnterprise ? 'Public/Free tier preview (max 100 samples). Upgrade to Pro or Enterprise for JSONL streaming up to 1,000 samples per call.' : undefined,
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
router.get('/h2h/:team1Id/:team2Id', optionalApiKeyAuth, async (req, res) => {
    if (!requireFeature(req, res, 'h2h', 'Head-to-head statistics')) return;
    try {
        const { team1Id, team2Id } = req.params;
        const t1Name = String(req.query.team1 || req.query.home || '').trim();
        const t2Name = String(req.query.team2 || req.query.away || '').trim();
        // Prefer IDs; also allow name-based H2H so incomplete source_id records still count
        const orClauses = [
            { 'home.source_id': team1Id, 'away.source_id': team2Id },
            { 'home.source_id': team2Id, 'away.source_id': team1Id }
        ];
        if (t1Name && t2Name) {
            const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const r1 = new RegExp(esc(t1Name).replace(/\s+/g, '.*'), 'i');
            const r2 = new RegExp(esc(t2Name).replace(/\s+/g, '.*'), 'i');
            orClauses.push(
                { $and: [{ $or: [{ 'home.name': r1 }, { 'home.display_name': r1 }] }, { $or: [{ 'away.name': r2 }, { 'away.display_name': r2 }] }] },
                { $and: [{ $or: [{ 'home.name': r2 }, { 'home.display_name': r2 }] }, { $or: [{ 'away.name': r1 }, { 'away.display_name': r1 }] }] }
            );
        }
        const matches = await SoccerMatch.find({
            $or: orClauses,
            'status.state': 'post'
        }).sort({ date: -1 }).limit(40).lean();

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
        const requestedSlug = String(req.params.league || req.query.league || '').toLowerCase();

        if (isFreePlanRestricted(req.apiKey)) {
            if (requestedSlug && requestedSlug !== 'all') {
                if (!FREE_TIER_ALLOWED_LEAGUES.includes(requestedSlug)) {
                    return res.status(403).json({
                        error: `Access to standings for '${requestedSlug}' is restricted on the Free Developer tier. Upgrade to Starter ($10/mo) or Pro ($29/mo) to access all 100+ world leagues.`,
                        upgradeUrl: '/pricing',
                        tier: 'free',
                        allowedLeagues: FREE_TIER_ALLOWED_LEAGUES
                    });
                }
                filter.league_slug = requestedSlug;
            } else {
                filter.league_slug = { $in: FREE_TIER_ALLOWED_LEAGUES };
            }
        } else if (requestedSlug && requestedSlug !== 'all') {
            filter.league_slug = requestedSlug;
        }

        const groups = await SoccerStanding.find(filter).sort({ season_year: -1, group_name: 1 }).lean();
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

router.get('/matches/:eventId', optionalApiKeyAuth, async (req, res) => {
    if (!requireFeature(req, res, 'matchSummary', 'Match details')) return;
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

function fetchStreamWithRedirects(targetUrl, maxRedirects = 3) {
    return new Promise((resolve, reject) => {
        if (maxRedirects <= 0) return reject(new Error('Too many redirects'));
        const client = targetUrl.startsWith('https') ? require('https') : require('http');
        const req = client.get(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
            },
            timeout: 6000
        }, (res) => {
            if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
                let redirectUrl = res.headers.location;
                if (!redirectUrl.startsWith('http')) {
                    const parsed = new URL(targetUrl);
                    redirectUrl = new URL(redirectUrl, parsed.origin).toString();
                }
                return resolve(fetchStreamWithRedirects(redirectUrl, maxRedirects - 1));
            }
            if (res.statusCode !== 200) {
                return reject(new Error(`Upstream returned HTTP ${res.statusCode}`));
            }
            resolve(res);
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    });
}

const crestInFlightMap = new Map();

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

        if (fs.existsSync(localPath)) {
            const stats = fs.statSync(localPath);
            if (stats.size > 0) {
                res.set('Cache-Control', 'public, max-age=31536000, immutable');
                return res.sendFile(localPath);
            }
        }

        if (crestInFlightMap.has(filename)) {
            await crestInFlightMap.get(filename);
            if (fs.existsSync(localPath) && fs.statSync(localPath).size > 0) {
                res.set('Cache-Control', 'public, max-age=31536000, immutable');
                return res.sendFile(localPath);
            }
        }

        const downloadPromise = (async () => {
            const tmpPath = `${localPath}.tmp.${Date.now()}`;
            try {
                const stream = await fetchStreamWithRedirects(rawUrl);
                await new Promise((resolve, reject) => {
                    const fileStream = fs.createWriteStream(tmpPath);
                    stream.pipe(fileStream);
                    fileStream.on('finish', resolve);
                    fileStream.on('error', reject);
                    stream.on('error', reject);
                });
                if (fs.existsSync(tmpPath) && fs.statSync(tmpPath).size > 0) {
                    fs.renameSync(tmpPath, localPath);
                } else {
                    try { fs.unlinkSync(tmpPath); } catch {}
                }
            } catch (err) {
                try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch {}
                throw err;
            }
        })();

        crestInFlightMap.set(filename, downloadPromise);
        try {
            await downloadPromise;
        } finally {
            crestInFlightMap.delete(filename);
        }

        if (fs.existsSync(localPath) && fs.statSync(localPath).size > 0) {
            res.set('Cache-Control', 'public, max-age=31536000, immutable');
            return res.sendFile(localPath);
        } else {
            res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
            return res.status(404).send('Crest not found');
        }
    } catch {
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        return res.status(404).send('Crest not found');
    }
}

/**
 * Developer Webhook Testing Endpoint
 * Simulates real-time event delivery (goal, status change, full-time) to a user's webhook URL.
 */
router.post('/webhooks/test', optionalApiKeyAuth, async (req, res) => {
    const { targetUrl, eventType = 'match.goal', secret = '' } = req.body || {};

    if (!targetUrl || typeof targetUrl !== 'string') {
        return res.status(400).json({ error: 'targetUrl is required and must be a valid URL string' });
    }

    let parsed;
    try {
        parsed = new URL(targetUrl);
    } catch {
        return res.status(400).json({ error: 'Invalid targetUrl format. Must start with http:// or https://' });
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
        return res.status(400).json({ error: 'targetUrl protocol must be HTTP or HTTPS' });
    }

    // SSRF protection: reject private/local hostnames
    const hostname = parsed.hostname.toLowerCase();
    if (['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(hostname) || hostname.endsWith('.local') || hostname.startsWith('192.168.') || hostname.startsWith('10.')) {
        return res.status(400).json({ error: 'Loopback and private RFC1918 destination IP addresses are not permitted' });
    }

    const deliveryId = `dlv_${crypto.randomBytes(8).toString('hex')}`;
    const timestamp = new Date().toISOString();

    const samplePayload = {
        event: eventType,
        deliveryId,
        timestamp,
        data: {
            matchId: '700812',
            league: 'eng.1',
            leagueName: 'English Premier League',
            home: { name: 'Arsenal', abbreviation: 'ARS', score: 2 },
            away: { name: 'Chelsea', abbreviation: 'CHE', score: 1 },
            clock: '68\'',
            status: 'STATUS_IN_PROGRESS',
            scorer: eventType === 'match.goal' ? {
                player: 'Bukayo Saka',
                team: 'Arsenal',
                minute: '68\'',
                assist: 'Martin Ødegaard'
            } : null
        }
    };

    const payloadJson = JSON.stringify(samplePayload);
    const headers = {
        'Content-Type': 'application/json',
        'User-Agent': 'Norra-Webhooks/2.0 (+https://scores.mynorra.xyz)',
        'x-norra-delivery-id': deliveryId,
        'x-norra-event': eventType,
        'x-norra-timestamp': timestamp
    };

    if (secret) {
        const sig = crypto.createHmac('sha256', secret).update(payloadJson).digest('hex');
        headers['x-norra-signature'] = `sha256=${sig}`;
    }

    const startTs = Date.now();
    try {
        const fetchRes = await fetch(targetUrl, {
            method: 'POST',
            headers,
            body: payloadJson,
            signal: AbortSignal.timeout(6000)
        });
        const latencyMs = Date.now() - startTs;

        let responseBody = '';
        try {
            responseBody = (await fetchRes.text()).slice(0, 500);
        } catch {}

        return res.json({
            success: fetchRes.ok,
            statusCode: fetchRes.status,
            statusText: fetchRes.statusText,
            latencyMs,
            deliveredAt: new Date().toISOString(),
            responseBody,
            samplePayload
        });
    } catch (deliveryErr) {
        const latencyMs = Date.now() - startTs;
        return res.json({
            success: false,
            error: deliveryErr.message || 'Webhook delivery connection failed or timed out',
            latencyMs,
            deliveredAt: new Date().toISOString(),
            samplePayload
        });
    }
});

router.get('/crest-proxy', handleCrestProxy);

module.exports = app => {
    app.use('/api/v1/football', router);
    app.get('/cdn/crest', handleCrestProxy);
};
