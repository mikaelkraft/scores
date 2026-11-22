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
 * Canonical short-name -> SportScore slug aliases so LiveScore/ESPN abbreviations
 * (e.g. "Brighton", "Wolves", "Spurs", "PSG", "Inter") resolve cleanly to SportScore's exact slugs.
 */
const TEAM_SLUG_ALIASES = {
    'barcelona': ['fc-barcelona', 'barcelona'],
    'villarreal': ['villarreal-cf', 'villarreal'],
    'osasuna': ['ca-osasuna', 'osasuna'],
    'malaga': ['malaga-cf', 'malaga'],
    'sevilla': ['sevilla-fc', 'sevilla'],
    'valencia': ['valencia-cf', 'valencia'],
    'getafe': ['getafe', 'getafe-cf'],
    'girona': ['girona-fc', 'girona'],
    'elche': ['elche-cf', 'elche'],
    'granada': ['granada-cf', 'granada'],
    'cadiz': ['cadiz-cf', 'cadiz'],
    'levante': ['levante-ud', 'levante'],
    'las-palmas': ['ud-las-palmas', 'las-palmas'],
    'almeria': ['ud-almeria', 'almeria'],
    'brighton': ['brighton-hove-albion'],
    'brighton-and-hove-albion': ['brighton-hove-albion'],
    'hull': ['hull-city'],
    'wolves': ['wolverhampton-wanderers'],
    'wolverhampton': ['wolverhampton-wanderers'],
    'spurs': ['tottenham-hotspur'],
    'tottenham': ['tottenham-hotspur'],
    'west-ham': ['west-ham-united'],
    'newcastle': ['newcastle-united'],
    'man-city': ['manchester-city'],
    'man-utd': ['manchester-united'],
    'man-united': ['manchester-united'],
    'nottm-forest': ['nottingham-forest'],
    'nottingham': ['nottingham-forest'],
    'leicester': ['leicester-city'],
    'leeds': ['leeds-united'],
    'ipswich': ['ipswich-town'],
    'luton': ['luton-town'],
    'norwich': ['norwich-city'],
    'coventry': ['coventry-city'],
    'sheffield-utd': ['sheffield-united'],
    'sheffield-wed': ['sheffield-wednesday'],
    'west-brom': ['west-bromwich-albion'],
    'wba': ['west-bromwich-albion'],
    'qpr': ['queens-park-rangers'],
    'bournemouth': ['afc-bournemouth'],
    'crystal-palace': ['crystal-palace'],
    'blackburn': ['blackburn-rovers'],
    'bolton': ['bolton-wanderers'],
    'derby': ['derby-county'],
    'stoke': ['stoke-city'],
    'swansea': ['swansea-city'],
    'cardiff': ['cardiff-city'],
    'birmingham': ['birmingham-city'],
    'bristol-city': ['bristol-city'],
    'preston': ['preston-north-end'],
    'huddersfield': ['huddersfield-town'],
    'charlton': ['charlton-athletic'],
    'wigan': ['wigan-athletic'],
    'plymouth': ['plymouth-argyle'],
    'inter': ['inter-milan', 'internazionale'],
    'ac-milan': ['ac-milan', 'milan'],
    'milan': ['ac-milan'],
    'verona': ['hellas-verona'],
    'roma': ['as-roma'],
    'lazio': ['ss-lazio', 'lazio'],
    'napoli': ['ssc-napoli', 'napoli'],
    'psg': ['paris-saint-germain'],
    'paris-sg': ['paris-saint-germain'],
    'marseille': ['olympique-marseille', 'olympique-de-marseille'],
    'monaco': ['as-monaco', 'monaco'],
    'st-etienne': ['as-saint-etienne', 'saint-etienne'],
    'saint-etienne': ['as-saint-etienne', 'saint-etienne'],
    'atletico': ['atletico-madrid'],
    'atl-madrid': ['atletico-madrid'],
    'athletic': ['athletic-bilbao', 'athletic-club'],
    'athletic-club': ['athletic-bilbao', 'athletic-club'],
    'betis': ['real-betis'],
    'celta': ['celta-vigo', 'rc-celta-de-vigo'],
    'sociedad': ['real-sociedad'],
    'alaves': ['deportivo-alaves'],
    'espanyol': ['rcd-espanyol', 'espanyol'],
    'mallorca': ['rcd-mallorca', 'mallorca'],
    'rayo': ['rayo-vallecano'],
    'valladolid': ['real-valladolid'],
    'oviedo': ['real-oviedo'],
    'racing-santander': ['racing-santander', 'racing-de-santander'],
    'dortmund': ['borussia-dortmund'],
    'gladbach': ['borussia-monchengladbach'],
    'm-gladbach': ['borussia-monchengladbach'],
    'leverkusen': ['bayer-leverkusen', 'bayer-04-leverkusen'],
    'leipzig': ['rb-leipzig'],
    'frankfurt': ['eintracht-frankfurt'],
    'stuttgart': ['vfb-stuttgart'],
    'bremen': ['werder-bremen', 'sv-werder-bremen'],
    'freiburg': ['sc-freiburg'],
    'hoffenheim': ['tsg-hoffenheim', 'hoffenheim'],
    'mainz': ['mainz-05', 'fsv-mainz-05'],
    'augsburg': ['fc-augsburg'],
    'koln': ['fc-koln', '1-fc-koln'],
    'hamburg': ['hamburger-sv'],
    'schalke': ['fc-schalke-04', 'schalke-04'],
    'sporting': ['sporting-cp', 'sporting-lisbon'],
    'porto': ['fc-porto'],
    'benfica': ['sl-benfica', 'benfica'],
    'braga': ['sc-braga', 'sporting-braga'],
    'guimaraes': ['vitoria-guimaraes', 'vitoria-sc'],
    'ajax': ['afc-ajax', 'ajax'],
    'psv': ['psv-eindhoven'],
    'feyenoord': ['feyenoord-rotterdam', 'feyenoord'],
    'az': ['az-alkmaar'],
    'twente': ['fc-twente'],
    'utrecht': ['fc-utrecht'],
    'sparta-rotterdam': ['sparta-rotterdam']
};

const matchDetailCache = new Map();
const teamRecentCache = new Map();
const verifiedTeamSlugCache = new Map(); // normalizeKey(name) -> { ts, slug }

/**
 * Resolve and cache a team's exact verified SportScore slug via /api/widget/team/ (24h cache).
 * Eliminates N*M Cartesian guessing across Spanish (-cf, ca-, ud-), Italian (ac-, as-, ssc-),
 * German (fc-, vfl-, vfb-, sv-), French (rc-, ogc-, stade-), and English club slugs.
 */
async function resolveVerifiedSportScoreSlug(teamName) {
    if (!teamName) return null;
    const key = normalizeKey(teamName);
    if (!key) return null;
    if (verifiedTeamSlugCache.has(key)) {
        const entry = verifiedTeamSlugCache.get(key);
        if (Date.now() - entry.ts < 24 * 60 * 60 * 1000) return entry.slug;
    }

    const baseClean = String(teamName)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

    const candidates = new Set(generateTeamSlugVariants(teamName));
    if (baseClean && !baseClean.includes('-')) {
        // Common European club prefixes/suffixes on SportScore
        for (const v of [`fc-${baseClean}`, `${baseClean}-cf`, `${baseClean}-fc`, `ca-${baseClean}`, `ud-${baseClean}`, `cd-${baseClean}`, `as-${baseClean}`, `ac-${baseClean}`, `sc-${baseClean}`]) {
            candidates.add(v);
        }
    } else if (baseClean) {
        candidates.add(`${baseClean}-cf`);
        candidates.add(`${baseClean}-fc`);
    }

    const list = Array.from(candidates).slice(0, 8);
    for (let i = 0; i < list.length; i += 4) {
        const batch = list.slice(i, i + 4);
        const results = await Promise.all(
            batch.map((slug) => fetchJson(`${BASE}/api/widget/team/?sport=football&slug=${encodeURIComponent(slug)}`, 4000).then((d) => ({ slug, ok: Boolean(d?.team?.slug || (Array.isArray(d?.matches) && d.matches.length)) })).catch(() => ({ slug, ok: false })))
        );
        const hit = results.find((r) => r.ok);
        if (hit) {
            verifiedTeamSlugCache.set(key, { ts: Date.now(), slug: hit.slug });
            return hit.slug;
        }
    }

    verifiedTeamSlugCache.set(key, { ts: Date.now(), slug: null });
    return null;
}

/**
 * Fetch SportScore match detail (incidents, confirmed lineups, stats, logos) by team names or explicit slug.
 */
async function fetchSportScoreMatchDetail({ homeName, awayName, slug } = {}) {
    const cacheKey = slug || [normalizeKey(homeName), normalizeKey(awayName)].sort().join('::');
    if (cacheKey && matchDetailCache.has(cacheKey)) {
        const entry = matchDetailCache.get(cacheKey);
        if (Date.now() - entry.ts < 5 * 60 * 1000) return entry.data;
    }

    const candidates = [];
    if (slug) candidates.push(slug);

    // 1. Search cached live/recent SportScore matches for exact URL slug first
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
            const idx = parts.indexOf('match');
            if (idx >= 0 && parts[idx + 1]) candidates.unshift(parts[idx + 1]);
        }
    }

    // 2. Generate canonical slug combinations (handles "Brighton" -> "brighton-hove-albion", etc.)
    if (homeName && awayName) {
        const hVars = generateTeamSlugVariants(homeName).slice(0, 3);
        const aVars = generateTeamSlugVariants(awayName).slice(0, 3);
        for (const hv of hVars) {
            for (const av of aVars) {
                candidates.push(`${hv}-vs-${av}`);
                candidates.push(`${av}-vs-${hv}`);
            }
        }
    }

    const uniqueCandidates = Array.from(new Set(candidates.filter(Boolean))).slice(0, 8);
    // Probe in small parallel batches for fast resolution
    for (let i = 0; i < uniqueCandidates.length; i += 4) {
        const batch = uniqueCandidates.slice(i, i + 4);
        const results = await Promise.all(
            batch.map((s) => fetchJson(`${BASE}/api/widget/match/?sport=football&slug=${encodeURIComponent(s)}`, 5500))
        );
        for (const data of results) {
            if (data?.match) {
                indexLogosFromMatches([data.match]);
                if (cacheKey) matchDetailCache.set(cacheKey, { ts: Date.now(), data: data.match });
                return data.match;
            }
        }
    }
    if (cacheKey) matchDetailCache.set(cacheKey, { ts: Date.now(), data: null });
    return null;
}

/**
 * Convert SportScore match.lineups into our standard summary.rosters shape.
 */
function lineupsToRosters(ssMatch) {
    const lu = ssMatch?.lineups;
    if (!lu || typeof lu !== 'object') return [];
    const mapSide = (sideKey, formation, xi, bench, teamName, teamLogo) => {
        const starters = Array.isArray(xi) ? xi.map((p) => ({
            starter: true,
            jersey: p.number != null ? String(p.number) : '',
            position: { abbreviation: p.position || '' },
            athlete: { displayName: p.name || 'Player', fullName: p.name || 'Player' },
            captain: Boolean(p.captain),
            rating: p.rating && p.rating !== '0.0' ? p.rating : null
        })) : [];
        const subs = Array.isArray(bench) ? bench.map((p) => ({
            starter: false,
            jersey: p.number != null ? String(p.number) : '',
            position: { abbreviation: p.position || '' },
            athlete: { displayName: p.name || 'Player', fullName: p.name || 'Player' },
            captain: false,
            rating: p.rating && p.rating !== '0.0' ? p.rating : null
        })) : [];
        if (!starters.length && !subs.length) return null;
        return {
            homeAway: sideKey,
            formation: formation || '',
            confirmed: Boolean(lu.confirmed),
            team: { displayName: teamName || (sideKey === 'home' ? 'Home' : 'Away'), logo: teamLogo || '' },
            roster: [...starters, ...subs]
        };
    };
    const out = [];
    const h = mapSide('home', lu.home_formation, lu.home_xi, lu.home_bench, ssMatch.home, ssMatch.home_logo);
    const a = mapSide('away', lu.away_formation, lu.away_xi, lu.away_bench, ssMatch.away, ssMatch.away_logo);
    if (h) out.push(h);
    if (a) out.push(a);
    return out;
}

/**
 * Fetch recent finished matches for a club from SportScore /api/widget/team/
 * Returns SoccerMatch-compatible objects for seamless Last-5 form enrichment across all world leagues.
 */
async function fetchSportScoreTeamRecentMatches(teamName) {
    if (!teamName) return [];
    const key = normalizeKey(teamName);
    if (!key) return [];
    if (teamRecentCache.has(key)) {
        const entry = teamRecentCache.get(key);
        if (Date.now() - entry.ts < 15 * 60 * 1000) return entry.data;
    }

    const variants = generateTeamSlugVariants(teamName).slice(0, 4);
    for (const slug of variants) {
        const data = await fetchJson(`${BASE}/api/widget/team/?sport=football&slug=${encodeURIComponent(slug)}`, 5000);
        if (data?.matches && Array.isArray(data.matches) && data.matches.length > 0) {
            indexLogosFromMatches(data.matches);
            const finished = data.matches
                .filter((m) => m && (m.status === 'finished' || /finished|ft/i.test(String(m.status_text || ''))) && m.home_score != null && m.away_score != null)
                .map((m) => ({
                    _id: m.url || `ss_${slug}_${m.time}`,
                    source: { provider: 'sportscore', event_id: m.url || `ss_${slug}_${m.time}` },
                    date: m.time ? new Date(m.time) : new Date(),
                    note: m.competition || 'League',
                    league_slug: 'sportscore.form',
                    status: { state: 'post', completed: true, clock: 'FT', detail: 'FT' },
                    home: {
                        name: m.home || 'Home',
                        display_name: m.home || 'Home',
                        logo: m.home_logo || '',
                        score: Number(m.home_score)
                    },
                    away: {
                        name: m.away || 'Away',
                        display_name: m.away || 'Away',
                        logo: m.away_logo || '',
                        score: Number(m.away_score)
                    }
                }));
            teamRecentCache.set(key, { ts: Date.now(), data: finished });
            return finished;
        }
    }
    teamRecentCache.set(key, { ts: Date.now(), data: [] });
    return [];
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

/**
 * Generate sensible SportScore slug variants for a given club name.
 */
function generateTeamSlugVariants(name = '') {
    if (!name) return [];
    const clean = String(name)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    if (!clean) return [];

    const variants = new Set();
    // 1. Canonical SportScore aliases first (e.g. "brighton" -> "brighton-hove-albion", "wolves" -> "wolverhampton-wanderers")
    if (TEAM_SLUG_ALIASES[clean]) {
        for (const alias of TEAM_SLUG_ALIASES[clean]) variants.add(alias);
    }
    variants.add(clean);

    // Strip "&" / "-and-" variants (e.g. "brighton-and-hove-albion" -> "brighton-hove-albion")
    if (clean.includes('-and-')) {
        variants.add(clean.replace(/-and-/g, '-'));
    }

    // Strip common FC/CF/CD/SC prefixes and suffixes
    const stripped = clean
        .replace(/^(fc|cf|cd|sc|afc|ac|as|rc|ud|sk|fk|ca)-/, '')
        .replace(/-(fc|cf|cd|sc|afc|ac|as|rc|ud|sk|fk|ca)$/, '');
    if (stripped && stripped !== clean) {
        if (TEAM_SLUG_ALIASES[stripped]) {
            for (const alias of TEAM_SLUG_ALIASES[stripped]) variants.add(alias);
        }
        variants.add(stripped);
    }

    // Try prepending "fc-" if not present
    if (!clean.startsWith('fc-')) {
        variants.add(`fc-${clean}`);
        if (stripped && stripped !== clean) {
            variants.add(`fc-${stripped}`);
        }
    }

    // Common German / European naming variants
    if (clean.includes('munich')) {
        variants.add(clean.replace('munich', 'munchen'));
        variants.add(`fc-${clean.replace('munich', 'munchen')}`);
    }

    // Women's club variants (e.g. Wolfsburg W -> vfl-wolfsburg-women, Bayern Munich W -> fc-bayern-munchen-women)
    if (clean.endsWith('-w')) {
        const baseNoW = clean.replace(/-w$/, '');
        variants.add(baseNoW);
        variants.add(`${baseNoW}-women`);
    } else if (clean.endsWith('-women')) {
        const baseNoWomen = clean.replace(/-women$/, '');
        variants.add(baseNoWomen);
        variants.add(`${baseNoWomen}-w`);
    }

    if (clean.includes('wolfsburg')) {
        variants.add('vfl-wolfsburg');
        variants.add('vfl-wolfsburg-women');
        variants.add('wolfsburg-women');
    }
    if (clean.includes('bayern')) {
        variants.add('fc-bayern-munchen');
        variants.add('fc-bayern-munchen-women');
        variants.add('bayern-munchen-women');
        variants.add('fc-bayern-munich-women');
    }
    if (clean.includes('lyon')) {
        variants.add('olympique-lyonnais');
        variants.add('olympique-lyonnais-women');
        variants.add('lyon-women');
    }

    return Array.from(variants);
}

const h2hMemoryCache = new Map();

/**
 * Fetch H2H past encounters and summary from SportScore open developer API.
 * Docs: https://sportscore.com/developer / https://sportscore.com/api/v1/h2h/
 */
async function fetchSportScoreH2H({ homeName, awayName } = {}) {
    if (!homeName || !awayName) return null;
    const cacheKey = [normalizeKey(homeName), normalizeKey(awayName)].sort().join('::');
    if (h2hMemoryCache.has(cacheKey)) {
        const cached = h2hMemoryCache.get(cacheKey);
        if (Date.now() - cached.ts < 30 * 60 * 1000) {
            return cached.data;
        }
    }

    const homeVariants = generateTeamSlugVariants(homeName);
    const awayVariants = generateTeamSlugVariants(awayName);

    // 1. Fast parallel check on canonical primary pair (plus verified team slugs if cached)
    const primaryPairs = [
        [homeVariants[0], awayVariants[0]],
        [awayVariants[0], homeVariants[0]]
    ].filter(([a, b]) => a && b && a !== b);

    const primaryResults = await Promise.all(
        primaryPairs.map(([t1, t2]) => {
            const url = `${BASE}/api/v1/h2h/?team1=${encodeURIComponent(t1)}&team2=${encodeURIComponent(t2)}`;
            return fetchJson(url, 4000).then(data => ({ t1, t2, data })).catch(() => null);
        })
    );

    for (const r of primaryResults) {
        if (r?.data?.matches && Array.isArray(r.data.matches) && r.data.matches.length > 0) {
            indexLogosFromMatches(r.data.matches);
            const result = {
                summary: r.data.summary || {
                    team1_wins: 0,
                    team2_wins: 0,
                    draws: 0,
                    meetings: r.data.matches.length
                },
                matches: r.data.matches,
                team1Slug: r.t1,
                team2Slug: r.t2
            };
            h2hMemoryCache.set(cacheKey, { ts: Date.now(), data: result });
            return result;
        }
    }

    // 2. Resolve each team's verified SportScore slug independently in parallel (O(1), 24h cached)
    //    Solves Spanish (-cf, ca-, ud-), Italian (ac-, as-), German (fc-, sv-) & worldwide slug mismatches!
    const [verifiedHome, verifiedAway] = await Promise.all([
        resolveVerifiedSportScoreSlug(homeName),
        resolveVerifiedSportScoreSlug(awayName)
    ]);
    if (verifiedHome && verifiedAway && verifiedHome !== verifiedAway) {
        const verifiedResults = await Promise.all([
            fetchJson(`${BASE}/api/v1/h2h/?team1=${encodeURIComponent(verifiedHome)}&team2=${encodeURIComponent(verifiedAway)}`, 4000).then(data => ({ t1: verifiedHome, t2: verifiedAway, data })).catch(() => null),
            fetchJson(`${BASE}/api/v1/h2h/?team1=${encodeURIComponent(verifiedAway)}&team2=${encodeURIComponent(verifiedHome)}`, 4000).then(data => ({ t1: verifiedAway, t2: verifiedHome, data })).catch(() => null)
        ]);
        for (const r of verifiedResults) {
            if (r?.data?.matches && Array.isArray(r.data.matches) && r.data.matches.length > 0) {
                indexLogosFromMatches(r.data.matches);
                const result = {
                    summary: r.data.summary || {
                        team1_wins: 0,
                        team2_wins: 0,
                        draws: 0,
                        meetings: r.data.matches.length
                    },
                    matches: r.data.matches,
                    team1Slug: r.t1,
                    team2Slug: r.t2
                };
                h2hMemoryCache.set(cacheKey, { ts: Date.now(), data: result });
                return result;
            }
        }
    }

    // 2. Secondary fallback on variants in parallel batches if primary didn't match
    const tested = new Set(primaryPairs.map(([a, b]) => `${a}::${b}`));
    const pairs = [];
    for (const h of homeVariants.slice(0, 4)) {
        for (const a of awayVariants.slice(0, 4)) {
            const k1 = `${h}::${a}`;
            const k2 = `${a}::${h}`;
            if (!tested.has(k1) && h !== a) { tested.add(k1); pairs.push([h, a]); }
            if (!tested.has(k2) && h !== a) { tested.add(k2); pairs.push([a, h]); }
            if (pairs.length >= 12) break;
        }
        if (pairs.length >= 12) break;
    }

    for (let i = 0; i < pairs.length; i += 4) {
        const batch = pairs.slice(i, i + 4);
        const batchRes = await Promise.all(
            batch.map(([t1, t2]) => {
                const url = `${BASE}/api/v1/h2h/?team1=${encodeURIComponent(t1)}&team2=${encodeURIComponent(t2)}`;
                return fetchJson(url, 3500).then(data => ({ t1, t2, data })).catch(() => null);
            })
        );
        for (const r of batchRes) {
            if (r?.data?.matches && Array.isArray(r.data.matches) && r.data.matches.length > 0) {
                indexLogosFromMatches(r.data.matches);
                const result = {
                    summary: r.data.summary || {
                        team1_wins: 0,
                        team2_wins: 0,
                        draws: 0,
                        meetings: r.data.matches.length
                    },
                    matches: r.data.matches,
                    team1Slug: r.t1,
                    team2Slug: r.t2
                };
                h2hMemoryCache.set(cacheKey, { ts: Date.now(), data: result });
                return result;
            }
        }
    }

    h2hMemoryCache.set(cacheKey, { ts: Date.now(), data: null });
    return null;
}

module.exports = {
    ensureSportScoreCache,
    refreshSportScoreMatches,
    lookupTeamLogo,
    enrichMatchLogos,
    enrichMatchesLogos,
    fetchSportScoreMatchDetail,
    fetchSportScoreH2H,
    fetchSportScoreTeamRecentMatches,
    incidentsToTimelinePlays,
    lineupsToRosters,
    generateTeamSlugVariants,
    normalizeKey
};
