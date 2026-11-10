/**
 * SportScore.com supplemental feed — crests + match telemetry.
 * Does NOT replace LiveScore/ESPN; only enriches missing logos/events/stats.
 * Free tier requires visible dofollow attribution (handled via partnerAttributions footer).
 * Docs: https://sportscore.com/developers/
 */
const https = require('https');
const zlib = require('zlib');

const BASE = process.env.SPORTSCORE_API_BASE || 'https://sportscore.com';
const UA = process.env.SPORTSCORE_UA || 'NorraScores/2.2 (+https://scores.mynorra.xyz; supplemental feed)';

/** @type {{ timestamp: number, matches: any[], logoByTeam: Map<string,string> }} */
const cache = {
    timestamp: 0,
    matches: [],
    logoByTeam: new Map(),
    inFlight: null
};

const CACHE_TTL_MS = 60 * 1000;

function normalizeKey(name = '') {
    return String(name || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\b(fc|cf|sc|ac|cd|afc|fk|sk|sv|ssc|as|rc|ud|rb|club|calcio|women|woman|w|u21|u-21|u20)\b/gi, '')
        .replace(/[^a-z0-9]/g, '')
        .trim();
}

function fetchJson(url, timeoutMs = 6000) {
    return new Promise((resolve) => {
        try {
            const req = https.get(url, {
                headers: {
                    'User-Agent': UA,
                    Accept: 'application/json',
                    'Accept-Encoding': 'gzip, deflate'
                },
                timeout: timeoutMs
            }, (res) => {
                if (res.statusCode !== 200) {
                    res.resume();
                    return resolve(null);
                }
                let stream = res;
                if (res.headers['content-encoding'] === 'gzip') stream = res.pipe(zlib.createGunzip());
                else if (res.headers['content-encoding'] === 'deflate') stream = res.pipe(zlib.createInflate());
                let d = '';
                stream.on('data', (c) => { d += c; });
                stream.on('end', () => {
                    try { resolve(JSON.parse(d)); } catch { resolve(null); }
                });
                stream.on('error', () => resolve(null));
            });
            req.on('error', () => resolve(null));
            req.on('timeout', () => { req.destroy(); resolve(null); });
        } catch {
            resolve(null);
        }
    });
}

function indexLogosFromMatches(matches = []) {
    for (const m of matches) {
        const hKey = normalizeKey(m.home);
        const aKey = normalizeKey(m.away);
        if (hKey && m.home_logo) cache.logoByTeam.set(hKey, m.home_logo);
        if (aKey && m.away_logo) cache.logoByTeam.set(aKey, m.away_logo);
    }
}

/**
 * Refresh live/recent football matches from SportScore (additive cache).
 */
async function refreshSportScoreMatches(limit = 50) {
    if (cache.inFlight) return cache.inFlight;
    cache.inFlight = (async () => {
        try {
            const data = await fetchJson(`${BASE}/api/widget/matches/?sport=football&limit=${Math.min(50, Math.max(1, limit))}`, 7000);
            const matches = Array.isArray(data?.matches) ? data.matches : [];
            if (matches.length) {
                cache.matches = matches;
                cache.timestamp = Date.now();
                indexLogosFromMatches(matches);
            }
            return matches;
        } finally {
            cache.inFlight = null;
        }
    })();
    return cache.inFlight;
}

async function ensureSportScoreCache() {
    if (Date.now() - cache.timestamp < CACHE_TTL_MS && cache.matches.length) {
        return cache.matches;
    }
    return refreshSportScoreMatches(50);
}

function lookupTeamLogo(teamName) {
    if (!teamName) return '';
    const key = normalizeKey(teamName);
    if (!key) return '';
    if (cache.logoByTeam.has(key)) return cache.logoByTeam.get(key);
    // soft containment match
    for (const [k, url] of cache.logoByTeam.entries()) {
        if (k.length >= 5 && (key.includes(k) || k.includes(key))) return url;
    }
    return '';
}

/**
 * Enrich a match-like object (home/away with name/logo) in-place with SportScore logos when missing.
 */
function enrichMatchLogos(match) {
    if (!match) return match;
    const home = match.home || {};
    const away = match.away || {};
    const hName = home.displayName || home.display_name || home.name || '';
    const aName = away.displayName || away.display_name || away.name || '';
    if (hName && (!home.logo || /placeholder|default|unknown/i.test(String(home.logo)))) {
        const logo = lookupTeamLogo(hName);
        if (logo) {
            home.logo = logo;
            if (home.team) home.team.logo = logo;
        }
    }
    if (aName && (!away.logo || /placeholder|default|unknown/i.test(String(away.logo)))) {
        const logo = lookupTeamLogo(aName);
        if (logo) {
            away.logo = logo;
            if (away.team) away.team.logo = logo;
        }
    }
    // competitors shape
    const comps = match.competitions?.[0]?.competitors || [];
    for (const c of comps) {
        const n = c.team?.displayName || c.team?.name || '';
        if (n && (!c.team?.logo || /placeholder|default|unknown/i.test(String(c.team.logo)))) {
            const logo = lookupTeamLogo(n);
            if (logo && c.team) c.team.logo = logo;
        }
    }
    return match;
}

function enrichMatchesLogos(matches = []) {
    return (matches || []).map((m) => enrichMatchLogos(m));
}

function slugifyTeamPair(home, away) {
    const s = (n) => String(n || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    const h = s(home);
    const a = s(away);
    if (!h || !a) return '';
    return `${h}-vs-${a}`;
}

/**
 * Fetch SportScore match detail (incidents, logos) by team names or explicit slug.
 */
async function fetchSportScoreMatchDetail({ homeName, awayName, slug } = {}) {
    let trySlug = slug || '';
    if (!trySlug && homeName && awayName) {
        trySlug = slugifyTeamPair(homeName, awayName);
    }
    // Also try reverse home/away
    const candidates = [];
    if (trySlug) candidates.push(trySlug);
    if (homeName && awayName) {
        const rev = slugifyTeamPair(awayName, homeName);
        if (rev && rev !== trySlug) candidates.push(rev);
    }
    // Search cache for url slug
    await ensureSportScoreCache();
    const hKey = normalizeKey(homeName);
    const aKey = normalizeKey(awayName);
    for (const m of cache.matches) {
        const mh = normalizeKey(m.home);
        const ma = normalizeKey(m.away);
        const same = (mh === hKey && ma === aKey) || (mh === aKey && ma === hKey)
            || (hKey && mh && (mh.includes(hKey) || hKey.includes(mh)) && aKey && ma && (ma.includes(aKey) || aKey.includes(ma)));
        if (same && m.url) {
            const parts = String(m.url).split('/').filter(Boolean);
            // /football/match/{slug}/{id}/
            const idx = parts.indexOf('match');
            if (idx >= 0 && parts[idx + 1]) candidates.unshift(parts[idx + 1]);
        }
    }

    const seen = new Set();
    for (const s of candidates) {
        if (!s || seen.has(s)) continue;
        seen.add(s);
        const data = await fetchJson(`${BASE}/api/widget/match/?sport=football&slug=${encodeURIComponent(s)}`, 7000);
        if (data?.match) {
            indexLogosFromMatches([data.match]);
            return data.match;
        }
    }
    return null;
}

/**
 * Map SportScore incidents into our timeline play shape.
 */
function incidentsToTimelinePlays(ssMatch) {
    const rows = ssMatch?.incidents || [];
    if (!Array.isArray(rows) || !rows.length) return [];
    return rows.map((row, idx) => {
        const minute = row.time ?? row.minute ?? '';
        const clockStr = minute !== '' && minute != null ? `${minute}'` : '';
        const isGoal = Boolean(row.is_goal) || /goal/i.test(String(row.type || ''));
        const isCard = Boolean(row.is_card) || /card/i.test(String(row.type || ''));
        const isSub = Boolean(row.is_sub) || /sub/i.test(String(row.type || ''));
        let text = row.type || 'Event';
        if (row.player) text = `${text}: ${row.player}`;
        if (isSub && (row.player_in || row.player_out)) {
            text = `Substitution: ${row.player_in || '?'} on for ${row.player_out || '?'}`;
        }
        const side = row.side === 'home' || row.side === 1 ? 'home' : (row.side === 'away' || row.side === 2 ? 'away' : null);
        return {
            id: `ss-inc-${idx}`,
            sequence: idx + 1,
            type: { text: isGoal ? 'Goal' : (isCard ? String(row.type) : String(row.type || 'Event')) },
            text,
            clock: { displayValue: clockStr, value: parseInt(minute, 10) || 0 },
            scoringPlay: isGoal,
            team: side ? { homeAway: side } : null,
            participants: row.player ? [{ athlete: { displayName: row.player } }] : [],
            source: 'sportscore'
        };
    });
}

module.exports = {
    ensureSportScoreCache,
    refreshSportScoreMatches,
    lookupTeamLogo,
    enrichMatchLogos,
    enrichMatchesLogos,
    fetchSportScoreMatchDetail,
    incidentsToTimelinePlays,
    normalizeKey
};
