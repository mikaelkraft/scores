/**
 * Multi-Provider H2H Aggregator Service
 *
 * Delegates historical Head-to-Head resolution across:
 *  1. SportScore.com Open API (verified team slug resolution -> up to 20 historical meetings)
 *  2. TheSportsDB Open API (human-readable Home_vs_Away lookup -> supplies both fallback meetings
 *     AND canonical full club names that unlock SportScore slugs for abbreviated teams)
 */
const https = require('https');
const { fetchSportScoreH2H, normalizeKey } = require('./sportScoreService');

const THESPORTSDB_KEY = process.env.THESPORTSDB_API_KEY || '123';
const THESPORTSDB_BASE = `https://www.thesportsdb.com/api/v1/json/${THESPORTSDB_KEY}`;
const UA = 'NorraScores/2.2 (+https://scores.mynorra.xyz; H2H aggregator)';

const aggregatedH2hCache = new Map();
const CACHE_TTL_MS = 30 * 60 * 1000;

function fetchJson(url, timeoutMs = 4500) {
    return new Promise((resolve) => {
        try {
            const req = https.get(url, {
                headers: { 'User-Agent': UA, Accept: 'application/json' },
                timeout: timeoutMs
            }, (res) => {
                if (res.statusCode !== 200) {
                    res.resume();
                    return resolve(null);
                }
                let data = '';
                res.on('data', (c) => { data += c; });
                res.on('end', () => {
                    try { resolve(JSON.parse(data)); } catch { resolve(null); }
                });
                res.on('error', () => resolve(null));
            });
            req.on('error', () => resolve(null));
            req.on('timeout', () => { req.destroy(); resolve(null); });
        } catch {
            resolve(null);
        }
    });
}

function cleanQueryTeam(name = '') {
    return String(name || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9\s-]/g, ' ')
        .trim()
        .replace(/\s+/g, '_');
}

async function fetchTheSportsDbH2H(homeName, awayName) {
    const hQ = cleanQueryTeam(homeName);
    const aQ = cleanQueryTeam(awayName);
    if (!hQ || !aQ) return { matches: [], canonicalHome: null, canonicalAway: null };

    const urls = [
        `${THESPORTSDB_BASE}/searchevents.php?e=${encodeURIComponent(`${hQ}_vs_${aQ}`)}`,
        `${THESPORTSDB_BASE}/searchevents.php?e=${encodeURIComponent(`${aQ}_vs_${hQ}`)}`
    ];
    const results = await Promise.all(urls.map((u) => fetchJson(u, 4500)));

    const seen = new Set();
    const matches = [];
    let canonicalHome = null;
    let canonicalAway = null;
    const hNorm = normalizeKey(homeName);
    const aNorm = normalizeKey(awayName);

    for (const payload of results) {
        const events = Array.isArray(payload?.event) ? payload.event : [];
        for (const ev of events) {
            if (!ev || String(ev.strSport || '').toLowerCase() !== 'soccer') continue;
            const evH = String(ev.strHomeTeam || '').trim();
            const evA = String(ev.strAwayTeam || '').trim();
            if (!evH || !evA) continue;

            // Capture richer canonical club names (e.g. "Brighton" -> "Brighton and Hove Albion")
            const evHNorm = normalizeKey(evH);
            const evANorm = normalizeKey(evA);
            if (!canonicalHome && (evHNorm.includes(hNorm) || hNorm.includes(evHNorm)) && evH.length > homeName.length) {
                canonicalHome = evH;
            } else if (!canonicalHome && (evANorm.includes(hNorm) || hNorm.includes(evANorm)) && evA.length > homeName.length) {
                canonicalHome = evA;
            }
            if (!canonicalAway && (evANorm.includes(aNorm) || aNorm.includes(evANorm)) && evA.length > awayName.length) {
                canonicalAway = evA;
            } else if (!canonicalAway && (evHNorm.includes(aNorm) || aNorm.includes(evHNorm)) && evH.length > awayName.length) {
                canonicalAway = evH;
            }

            if (ev.intHomeScore == null || ev.intAwayScore == null || ev.intHomeScore === '' || ev.intAwayScore === '') continue;
            const id = String(ev.idEvent || `${evH}_${evA}_${ev.dateEvent}`);
            if (seen.has(id)) continue;
            seen.add(id);

            matches.push({
                url: `tsdb:${id}`,
                home: evH,
                away: evA,
                home_score: Number(ev.intHomeScore),
                away_score: Number(ev.intAwayScore),
                home_logo: ev.strHomeTeamBadge || '',
                away_logo: ev.strAwayTeamBadge || '',
                time: ev.strTimestamp || (ev.dateEvent ? `${ev.dateEvent}T12:00:00Z` : new Date().toISOString()),
                competition: ev.strLeague || 'League',
                source: 'thesportsdb'
            });
        }
    }

    return { matches, canonicalHome, canonicalAway };
}

/**
 * Fetch best available H2H history by delegating across SportScore + TheSportsDB.
 */
async function fetchAggregatedH2H({ homeName, awayName } = {}) {
    if (!homeName || !awayName) return null;
    const cacheKey = [normalizeKey(homeName), normalizeKey(awayName)].sort().join('::');
    if (aggregatedH2hCache.has(cacheKey)) {
        const cached = aggregatedH2hCache.get(cacheKey);
        if (Date.now() - cached.ts < CACHE_TTL_MS) return cached.data;
    }

    // 1. Primary: SportScore verified slug resolver
    let ssData = await fetchSportScoreH2H({ homeName, awayName }).catch(() => null);
    const mergedByKey = new Map();
    const addMatch = (m) => {
        if (!m) return;
        const day = m.time ? String(m.time).slice(0, 10) : '';
        const pair = [normalizeKey(m.home), normalizeKey(m.away)].sort().join('_vs_');
        const key = `${day}_${pair}`;
        if (!mergedByKey.has(key)) mergedByKey.set(key, m);
    };

    if (ssData?.matches?.length) {
        for (const m of ssData.matches) addMatch(m);
    }

    // 2. Delegation fallback: if SportScore returned < 3 meetings, consult TheSportsDB
    if (mergedByKey.size < 3) {
        const tsdb = await fetchTheSportsDbH2H(homeName, awayName).catch(() => ({ matches: [] }));
        for (const m of (tsdb.matches || [])) addMatch(m);

        // If TheSportsDB uncovered fuller canonical club names, retry SportScore once to unlock full archive
        const retryHome = tsdb.canonicalHome || homeName;
        const retryAway = tsdb.canonicalAway || awayName;
        if (mergedByKey.size < 3 && (retryHome !== homeName || retryAway !== awayName)) {
            const ssRetry = await fetchSportScoreH2H({ homeName: retryHome, awayName: retryAway }).catch(() => null);
            if (ssRetry?.matches?.length) {
                for (const m of ssRetry.matches) addMatch(m);
                if (!ssData) ssData = ssRetry;
            }
        }
    }

    const matches = Array.from(mergedByKey.values()).sort((a, b) => new Date(b.time) - new Date(a.time));
    const result = matches.length > 0 ? {
        summary: ssData?.summary || { meetings: matches.length },
        matches,
        sources: Array.from(new Set(matches.map((m) => m.source || 'sportscore')))
    } : null;

    aggregatedH2hCache.set(cacheKey, { ts: Date.now(), data: result });
    return result;
}

module.exports = {
    fetchAggregatedH2H,
    fetchTheSportsDbH2H
};
