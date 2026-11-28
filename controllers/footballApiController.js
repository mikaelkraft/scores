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
const {
    ensureSportScoreCache,
    enrichMatchLogos,
    enrichMatchesLogos,
    fetchSportScoreMatchDetail,
    fetchSportScoreTeamRecentMatches,
    incidentsToTimelinePlays,
    lineupsToRosters,
    statisticsToBoxscore
} = require('../services/sportScoreService');

const { optionalApiKeyAuth, assertLeagueAccess, getAllowedLeaguesForKey, PLAN_LIMITS, hasFeature, requireFeature, getPlanConfig } = require('../middleware/apiKeyAuth');
const dailyBoardCache = require('../services/dailyBoardCache');
const { normalizeCountryName: normalizeCountryNameFn } = require('../services/soccerSyncService');
const normalizeCountryName = normalizeCountryNameFn || ((x) => x);

// On-demand per-date cache for past/future date tabs when MongoDB lacks fixtures for that date
const onDemandDateCache = new Map();
const ON_DEMAND_DATE_TTL_MS = 3 * 60 * 1000;

async function fetchOnDemandDateMatches(dateKey) {
    if (!dateKey || !/^\d{8}$/.test(dateKey)) return [];
    const cached = onDemandDateCache.get(dateKey);
    if (cached && (Date.now() - cached.ts < ON_DEMAND_DATE_TTL_MS)) {
        return cached.matches;
    }
    try {
        const { normalizeCountryName, resolveLeagueSlug, demoteIfNotTopFlight, inferCountryFromTeamNames, TARGET_LEAGUES } = require('../services/soccerSyncService');
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 6500);
        const res = await fetch(`https://prod-public-api.livescore.com/v1/api/app/date/soccer/${dateKey}/0`, {
            signal: ctrl.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36',
                'Accept': 'application/json'
            }
        });
        clearTimeout(timer);
        if (!res.ok) return [];
        const data = await res.json().catch(() => null);
        if (!data || !Array.isArray(data.Stages)) return [];

        const out = [];
        for (const stage of data.Stages) {
            const rawCountry = (typeof normalizeCountryName === 'function' ? normalizeCountryName(stage.Cnm || stage.Sdn || 'International') : (stage.Cnm || stage.Sdn || 'International'));
            const stageName = stage.Snm || 'Football Competition';
            const leagueSlug = resolveLeagueSlug(stageName, rawCountry, stage.Scd || '') || 'other';
            for (const ev of (stage.Events || [])) {
                const eid = String(ev.Eid || '');
                if (!eid) continue;
                const h = ev.T1?.[0] || {};
                const a = ev.T2?.[0] || {};
                let matchLeagueSlug = demoteIfNotTopFlight(leagueSlug, h.Nm || '', a.Nm || '', stageName) || leagueSlug;
                matchLeagueSlug = inferCountryFromTeamNames(h.Nm || '', a.Nm || '', matchLeagueSlug) || matchLeagueSlug;
                const matchLgDef = (TARGET_LEAGUES || []).find(l => l.slug === matchLeagueSlug);
                let matchDate = new Date(Date.UTC(
                    parseInt(dateKey.slice(0, 4), 10),
                    parseInt(dateKey.slice(4, 6), 10) - 1,
                    parseInt(dateKey.slice(6, 8), 10),
                    12, 0
                ));
                let hasParsedEsd = false;
                if (ev.Esd && String(ev.Esd).length >= 12) {
                    const s = String(ev.Esd);
                    const parsed = new Date(Date.UTC(
                        parseInt(s.slice(0, 4), 10),
                        parseInt(s.slice(4, 6), 10) - 1,
                        parseInt(s.slice(6, 8), 10),
                        parseInt(s.slice(8, 10), 10),
                        parseInt(s.slice(10, 12), 10)
                    ));
                    if (!isNaN(parsed.getTime())) {
                        matchDate = parsed;
                        hasParsedEsd = true;
                    }
                }
                const rawClock = String(ev.Eps || '').trim();
                const isFinished = rawClock === 'FT' || rawClock === 'AET' || rawClock === 'AP';
                const isPostp = /Postp|Canc|Abd/i.test(rawClock);
                const isNotStarted = !rawClock || rawClock === 'NS' || rawClock === 'Upcoming' || rawClock.includes(':') || ev.Epr === 0;
                const isLive = !isFinished && !isPostp && !isNotStarted;
                const state = isFinished || isPostp ? 'post' : (isLive ? 'in' : 'pre');
                const actualDateKey = hasParsedEsd ? formatDateKey(matchDate) : dateKey;
                const candidateStatus = {
                    state,
                    detail: isPostp ? 'Postp.' : (isFinished ? rawClock : (isLive ? rawClock : 'Scheduled')),
                    clock: isLive || isFinished ? rawClock : '',
                    completed: isFinished || isPostp,
                    isLive
                };
                if (!doesMatchBelongToDate({ date: matchDate, scoreboard_date: actualDateKey, status: candidateStatus }, dateKey, { isToday: dateKey === parseDateParam('today') })) {
                    continue;
                }
                const hScore = (ev.Tr1 !== undefined && ev.Tr1 !== '') ? Number(ev.Tr1) : null;
                const aScore = (ev.Tr2 !== undefined && ev.Tr2 !== '') ? Number(ev.Tr2) : null;

                out.push({
                    source: { provider: 'livescore', event_id: `ls_${eid}`, livescore_id: eid },
                    league_slug: matchLeagueSlug,
                    league: {
                        slug: matchLeagueSlug,
                        name: matchLgDef?.name || stageName,
                        country: matchLgDef?.country || rawCountry
                    },
                    note: matchLgDef?.name || stageName,
                    name: `${h.Nm || 'Home'} vs ${a.Nm || 'Away'}`,
                    short_name: `${h.Abr || h.Nm || 'HOM'} vs ${a.Abr || a.Nm || 'AWY'}`,
                    date: matchDate,
                    scoreboard_date: actualDateKey,
                    status: candidateStatus,
                    home: {
                        source_id: String(h.ID || ''),
                        name: h.Nm || 'Home',
                        display_name: h.Nm || 'Home',
                        abbreviation: h.Abr || '',
                        logo: h.Img ? `https://lsm-static-prod.livescore.com/medium/${h.Img}` : '',
                        score: hScore,
                        winner: isFinished && hScore !== null && aScore !== null ? hScore > aScore : false
                    },
                    away: {
                        source_id: String(a.ID || ''),
                        name: a.Nm || 'Away',
                        display_name: a.Nm || 'Away',
                        abbreviation: a.Abr || '',
                        logo: a.Img ? `https://lsm-static-prod.livescore.com/medium/${a.Img}` : '',
                        score: aScore,
                        winner: isFinished && hScore !== null && aScore !== null ? aScore > hScore : false
                    }
                });
            }
        }
        onDemandDateCache.set(dateKey, { ts: Date.now(), matches: out });
        if (onDemandDateCache.size > 15) {
            const oldestKey = onDemandDateCache.keys().next().value;
            onDemandDateCache.delete(oldestKey);
        }
        return out;
    } catch (_) {
        return [];
    }
}

// High-speed in-memory cache for worldwide live in-play scores
let liveFeedMemoryCache = {
    timestamp: 0,
    matches: [],
    inFlightPromise: null
};

// Canonical league ranking for prioritizing high-profile livescore views
const LEAGUE_PRIORITY_MAP = {
    'uefa.champions': 100,
    'eng.1': 99,
    'esp.1': 98,
    'ita.1': 97,
    'ger.1': 96,
    'fra.1': 95,
    'uefa.europa': 94,
    'uefa.europa.conf': 93,
    'ned.1': 92,
    'por.1': 91,
    'bra.1': 90,
    'arg.1': 89,
    'nga.1': 88,
    'ksa.1': 87,
    'sau.1': 87,
    'mex.1': 86,
    'col.1': 85,
    'tur.1': 84,
    'bel.1': 83,
    'sco.1': 82,
    'usa.1': 81,
    'rus.1': 80,
    'caf.champions': 79,
    'afc.champions': 78,
    'conmebol.libertadores': 77,
    'eng.fa': 76,
    'esp.copa_del_rey': 75,
    'ita.coppa_italia': 74,
    'ger.dfb_pokal': 73,
    'eng.league_cup': 72,
    'conmebol.sudamericana': 71,
    'aut.1': 70,
    'sui.1': 69,
    'den.1': 68,
    'swe.1': 67,
    'eng.2': 50,
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
const { normalizeTeamName, areTeamNamesMatching, getTeamCategory, getMatchTier, resolveMatchEspnId, resolveLeagueSlug, enforceCountryOnSlug, isReserveOrBTeamName, formatLiveScoreLogo, TARGET_LEAGUES, inferCountryFromTeamNames, demoteIfNotTopFlight, demoteToJuniorOrLowerTier, isSeniorTopLeagueSlug, syncLiveScoreStandingsForLeague, syncEspnStandingsForLeague, ensureFreshStandings, LIVESCORE_STAGE_TABLE_MAP } = require('../services/soccerSyncService');

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

function getMatchUtcDateKey(match) {
    if (!match) return '';
    if (match.date) {
        const d = match.date instanceof Date ? match.date : new Date(match.date);
        if (!isNaN(d.getTime())) {
            return formatDateKey(d);
        }
    }
    const rawSb = String(match.scoreboardDate || match.scoreboard_date || '').replace(/[^0-9]/g, '').slice(0, 8);
    return rawSb.length === 8 ? rawSb : '';
}

function isActivelyLiveMatch(match, nowMs = Date.now()) {
    if (!match) return false;
    const st = match.status || {};
    if (st.completed || st.state === 'post' || /^(FT|AET|AP|Final|Postp|Canc|Abd)/i.test(String(st.detail || st.clock || ''))) {
        return false;
    }
    if (!(st.isLive || st.state === 'in')) return false;
    if (match.date) {
        const ts = match.date instanceof Date ? match.date.getTime() : Date.parse(match.date);
        if (Number.isFinite(ts)) {
            const elapsedMs = nowMs - ts;
            if (elapsedMs > 160 * 60 * 1000 || elapsedMs < -10 * 60 * 1000) return false;
        }
    }
    return true;
}

function doesMatchBelongToDate(match, targetDateKey, { nowMs = Date.now(), isToday = false } = {}) {
    const cleanTarget = String(targetDateKey || '').replace(/[^0-9]/g, '').slice(0, 8);
    if (cleanTarget.length !== 8) return true;
    const matchKey = getMatchUtcDateKey(match);
    if (!matchKey) return true;
    if (matchKey === cleanTarget) return true;
    // Allow legitimate cross-midnight live in-play matches on today's board, never completed/old or future matches
    if (isToday && isActivelyLiveMatch(match, nowMs)) {
        return true;
    }
    return false;
}

function parseNumber(val, fallback, max = 200) {
    const num = parseInt(val, 10);
    if (isNaN(num) || num < 1) return fallback;
    return Math.min(num, max);
}

const FREE_TIER_ALLOWED_LEAGUES = [
    'eng.1', // English Premier League
    'esp.1', // Spanish La Liga
    'nga.1'  // Nigerian Premier Football League
];

function isFreePlanRestricted(apiKey) {
    return Boolean(apiKey && apiKey.plan === 'free');
}

function inferMatchCountry(m) {
    if (!m) return 'International';
    const _normC = (typeof normalizeCountryName === 'function') ? normalizeCountryName : (x) => x;
    const slug = String(m.league_slug || m.league?.slug || '').toLowerCase();
    const lgName = m.league?.name || m.league?.displayName || m.competition?.name || '';
    const lgCountry = m.league?.country || '';
    const txt = `${m.note || ''} ${m.name || ''} ${lgName} ${lgCountry} ${slug}`.toLowerCase();
    // Descriptive slug / league-title countries (LiveScore often emits argentine.nacional.b etc.)
    if (/argentine|argentina|\barg\./.test(txt)) return 'Argentina';
    if (/colombian|colombia|\bcol\./.test(txt)) return 'Colombia';
    if (/paraguayan|paraguay|\bpar\./.test(txt)) return 'Paraguay';
    if (/honduran|honduras|\bhon\./.test(txt)) return 'Honduras';
    if (/guatemalan|guatemala|\bgtm\.|\bgua\./.test(txt)) return 'Guatemala';
    if (/philippine|philippines|\bphi\./.test(txt)) return 'Philippines';
    if (/\boman\b|\boma\.|\bomn\./.test(txt)) return 'Oman';
    if (/vietnam|\bvie\.|\bvnm\.|v-league|v\.league/.test(txt)) return 'Vietnam';
    if (/san\s*marino|sammarinese|\bsmr\./.test(txt)) return 'San Marino';
    if (/\bniger\b(?!ia)|\bner\.|super ligue/.test(txt) && !/nigeria|npfl/.test(txt)) return 'Niger';
    if (/bulgarian|bulgaria|\bbul\./.test(txt)) return 'Bulgaria';
    if (/bolivian|bolivia|\bbol\./.test(txt)) return 'Bolivia';
    if (/ecuador|\becu\./.test(txt)) return 'Ecuador';
    if (/peruvian|peru|\bper\./.test(txt)) return 'Peru';
    if (/uruguayan|uruguay|\buru\./.test(txt)) return 'Uruguay';
    if (/chilean|chile|\bchi\./.test(txt)) return 'Chile';
    if (/mexican|mexico|\bmex\./.test(txt)) return 'Mexico';
    if (/saudi|\bksa\.|\bsau\./.test(txt)) return 'Saudi Arabia';
    
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
    if (slug.startsWith('col.')) return 'Colombia';
    if (slug.startsWith('chi.')) return 'Chile';
    if (slug.startsWith('aut.')) return 'Austria';
    if (slug.startsWith('srb.')) return 'Serbia';
    if (slug.startsWith('cro.')) return 'Croatia';
    if (slug.startsWith('bih.')) return 'Bosnia and Herzegovina';
    if (slug.startsWith('rou.')) return 'Romania';
    if (slug.startsWith('bgr.')) return 'Bulgaria';
    if (slug.startsWith('hun.')) return 'Hungary';
    if (slug.startsWith('svk.')) return 'Slovakia';
    if (slug.startsWith('svn.')) return 'Slovenia';
    if (slug.startsWith('alb.')) return 'Albania';
    if (slug.startsWith('cyp.')) return 'Cyprus';
    if (slug.startsWith('geo.')) return 'Georgia';
    if (slug.startsWith('mne.')) return 'Montenegro';
    if (slug.startsWith('mkd.')) return 'North Macedonia';
    if (slug.startsWith('kvx.')) return 'Kosovo';
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
    if (slug.startsWith('chn.')) return 'China';
    if (slug.startsWith('ind.')) return 'India';
    if (slug.startsWith('idn.')) return 'Indonesia';
    if (slug.startsWith('tha.')) return 'Thailand';
    if (slug.startsWith('mys.')) return 'Malaysia';
    if (slug.startsWith('sgp.')) return 'Singapore';
    if (slug.startsWith('vnm.')) return 'Vietnam';
    if (slug.startsWith('sau.') || slug.startsWith('ksa.')) return 'Saudi Arabia';
    if (slug.startsWith('qat.')) return 'Qatar';
    if (slug.startsWith('uae.')) return 'UAE';
    if (slug.startsWith('irn.')) return 'Iran';
    if (slug.startsWith('irq.')) return 'Iraq';
    if (slug.startsWith('jor.')) return 'Jordan';
    if (slug.startsWith('omn.')) return 'Oman';
    if (slug.startsWith('uzb.')) return 'Uzbekistan';
    if (slug.startsWith('mar.')) return 'Morocco';
    if (slug.startsWith('dza.')) return 'Algeria';
    if (slug.startsWith('tun.')) return 'Tunisia';
    if (slug.startsWith('cmr.')) return 'Cameroon';
    if (slug.startsWith('sen.')) return 'Senegal';
    if (slug.startsWith('civ.')) return 'Ivory Coast';
    if (slug.startsWith('zmb.')) return 'Zambia';
    if (slug.startsWith('zwe.')) return 'Zimbabwe';
    if (slug.startsWith('eth.')) return 'Ethiopia';
    if (slug.startsWith('rwa.')) return 'Rwanda';
    if (slug.startsWith('cod.')) return 'DR Congo';
    if (slug.startsWith('sdn.')) return 'Sudan';
    if (slug.startsWith('ago.')) return 'Angola';
    if (slug.startsWith('mwi.')) return 'Malawi';
    if (slug.startsWith('can.')) return 'Canada';
    if (slug.startsWith('uru.')) return 'Uruguay';
    if (slug.startsWith('par.')) return 'Paraguay';
    if (slug.startsWith('per.')) return 'Peru';
    if (slug.startsWith('ecu.')) return 'Ecuador';
    if (slug.startsWith('ven.')) return 'Venezuela';
    if (slug.startsWith('bol.')) return 'Bolivia';
    if (slug.startsWith('crc.')) return 'Costa Rica';
    if (slug.startsWith('hon.')) return 'Honduras';
    if (slug.startsWith('gtm.') || slug.startsWith('gua.')) return 'Guatemala';
    if (slug.startsWith('pan.')) return 'Panama';
    if (slug.startsWith('nic.')) return 'Nicaragua';
    if (slug.startsWith('slv.')) return 'El Salvador';
    if (slug.startsWith('nzl.')) return 'New Zealand';
    if (slug.startsWith('isl.')) return 'Iceland';
    if (slug.startsWith('fin.')) return 'Finland';
    if (slug.startsWith('rus.')) return 'Russia';
    if (slug.startsWith('ukr.')) return 'Ukraine';
    if (slug.startsWith('cze.')) return 'Czech Republic';
    if (slug.startsWith('irl.')) return 'Ireland';
    if (slug.startsWith('nir.')) return 'Northern Ireland';
    if (slug.startsWith('wal.')) return 'Wales';
    if (slug.startsWith('lva.')) return 'Latvia';
    if (slug.startsWith('ltu.')) return 'Lithuania';
    if (slug.startsWith('est.')) return 'Estonia';
    if (slug.startsWith('lux.')) return 'Luxembourg';
    if (slug.startsWith('mlt.')) return 'Malta';
    if (slug.startsWith('kaz.')) return 'Kazakhstan';
    if (slug.startsWith('mda.') || slug.startsWith('mol.')) return 'Moldova';
    if (slug.startsWith('hkg.')) return 'Hong Kong';
    if (slug.startsWith('bgd.')) return 'Bangladesh';
    if (slug.startsWith('afc.')) return 'Asia';
    if (slug.startsWith('caf.')) return 'Africa';
    if (slug.startsWith('uefa.')) return 'Europe';
    if (slug.startsWith('conmebol.')) return 'South America';
    if (slug.startsWith('concacaf.')) return 'North America';

    // League name keyword fallback when slug is generic/other or DB had stale International
    if (/\b(?:colombi|betplay)\b/.test(txt)) return 'Colombia';
    if (/\b(?:peruv|peru|te apuesto)\b/.test(txt)) return 'Peru';
    if (/\b(?:uruguay|auf uruguaya)\b/.test(txt)) return 'Uruguay';
    if (/\b(?:russia|russian)\b/.test(txt)) return 'Russia';
    if (/\b(?:saudi|roshn)\b/.test(txt)) return 'Saudi Arabia';
    if (/\b(?:indian|india super|i-league)\b/.test(txt)) return 'India';
    if (/\b(?:keuken kampioen|eerste divisie|eredivisie|dutch|netherlands)\b/.test(txt)) return 'Netherlands';
    if (/\b(?:brazil|brasileir)\b/.test(txt)) return 'Brazil';
    if (/\b(?:argentin)\b/.test(txt)) return 'Argentina';
    if (/\b(?:chilean|chile)\b/.test(txt)) return 'Chile';
    if (/\b(?:ecuador)\b/.test(txt)) return 'Ecuador';
    if (/\b(?:paraguay)\b/.test(txt)) return 'Paraguay';
    if (/\b(?:venezuel)\b/.test(txt)) return 'Venezuela';
    if (/\b(?:bolivi)\b/.test(txt)) return 'Bolivia';
    if (/\b(?:mexic|liga mx)\b/.test(txt)) return 'Mexico';
    if (/\b(?:uefa)\b/.test(txt)) return 'Europe';
    if (/\b(?:conmebol|libertadores|sudamericana)\b/.test(txt)) return 'South America';
    if (/\b(?:concacaf)\b/.test(txt)) return 'North America';
    if (/\b(?:caf|afcon)\b/.test(txt)) return 'Africa';
    if (/\b(?:afc)\b/.test(txt)) return 'Asia';
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
    if (txt.includes('serbia') || txt.includes('prva liga srb') || txt.includes('superliga srb')) return 'Serbia';
    if (txt.includes('croatia') || txt.includes('hnl')) return 'Croatia';
    if (txt.includes('wsl') || txt.includes("women's super league") || txt.includes('womens super league') || txt.includes('players cup') || txt.includes('fa cup')) return 'England';
    if (txt.includes('nwsl') || txt.includes('usl')) return 'United States';
    if (txt.includes('femenil')) return 'Mexico';
    if (txt.includes('a-league')) return 'Australia';
    if (txt.includes('femminile')) return 'Italy';
    if (/\b(?:liga\s*f|copa de la reina)\b/i.test(txt)) return 'Spain';
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

function makeFlexibleTeamRegex(rawName, isWomen = false) {
    if (!rawName) return null;
    const isFemale = Boolean(isWomen) || /\b(women|woman|ladies|femenil|frauen|\(w\))\b|\s+w$/i.test(String(rawName));
    const isYouth = /\b(u[-_]?\s*(?:15|16|17|18|19|20|21|23)|youth|academy|reserves?|primavera)\b/i.test(String(rawName));

    let cleaned = String(rawName)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\b(18\d{2}|19\d{2}|20\d{2})\b/g, '')
        .replace(/\b(04|05|96|98)\b/g, '')
        .replace(/\b(fc|cf|sc|ac|cd|sd|afc|fk|sk|sv|ssc|as|rc|ud|rb|calcio|club|deportivo)\b/gi, ' ')
        .replace(/\b(women|woman|ladies|femenin[oa]?|frauen|damen|vrouwen|fem|wfc)\b|\(w\)|\s+w$/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const tokens = cleaned.split(' ').filter(t => t.length >= 3);
    const youthSuffix = !isYouth ? '(?!\\s*(?:u-?\\d{2}|u-?23|u-?21|u-?19|u-?18|u-?17|youth|academy|reserves?|primavera))' : '';
    if (tokens.length >= 1) {
        const parts = tokens.slice(0, 3).map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        return new RegExp('\\b' + parts.join('.*') + '\\b' + youthSuffix, 'i');
    }
    if (cleaned.length >= 2) {
        const escaped = cleaned.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp('\\b' + escaped + '\\b' + youthSuffix, 'i');
    }
    return null;
}


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

const recentFinishedMatches = new Map();
const MAX_RECENT_FINISHED = 300;

function parseLiveScoreEsd(esd) {
    if (!esd) return new Date();
    const s = String(esd).trim();
    if (/^\d{12,14}$/.test(s)) {
        const yr = parseInt(s.slice(0, 4), 10);
        const mo = parseInt(s.slice(4, 6), 10) - 1;
        const da = parseInt(s.slice(6, 8), 10);
        const hr = parseInt(s.slice(8, 10), 10);
        const mi = parseInt(s.slice(10, 12), 10);
        const sc = s.length >= 14 ? parseInt(s.slice(12, 14), 10) : 0;
        return new Date(Date.UTC(yr, mo, da, hr, mi, sc));
    }
    const d = new Date(esd);
    return Number.isNaN(d.getTime()) ? new Date() : d;
}

function recordRecentFinishedMatch(m) {
    if (!m) return;
    const keys = [m.id, m.uid, m.source?.event_id, m.source?.livescore_id, m.source?.espn_id]
        .filter(Boolean)
        .map(String);
    const entry = {
        homeScore: Number(m.home?.score ?? 0),
        awayScore: Number(m.away?.score ?? 0),
        clock: m.status?.clock || m.status?.detail || 'FT',
        recordedAt: Date.now()
    };
    for (const k of keys) {
        recentFinishedMatches.set(k, entry);
    }
    if (recentFinishedMatches.size > MAX_RECENT_FINISHED) {
        const overflow = recentFinishedMatches.size - MAX_RECENT_FINISHED;
        let removed = 0;
        for (const k of recentFinishedMatches.keys()) {
            recentFinishedMatches.delete(k);
            if (++removed >= overflow) break;
        }
    }
}

async function fetchFreshWorldwideLiveMatches() {
    const liveCutoff = new Date(Date.now() - 135 * 60 * 1000);
    const futureCutoff = new Date(Date.now() + 5 * 60 * 1000);
    const liveFilter = {
        'status.state': 'in',
        date: { $gte: liveCutoff, $lte: futureCutoff }
    };

    // Parallel fetch from upstream LiveScore worldwide feed, ESPN scoreboard, and MongoDB
    const todayUtcKey = parseDateParam('today');
    const [liveScoreData, espnScoreboard, espnTopBoards, dbLiveMatches, storedLeagues] = await Promise.all([
        fetchUpstreamJsonFast('https://prod-public-api.livescore.com/v1/api/app/live/soccer/0', 3200),
        fetchUpstreamJsonFast('https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard', 3200),
        fetchEspnDayBoardExtras(todayUtcKey).catch(() => []),
        SoccerMatch.find(liveFilter).maxTimeMS(2500).sort({ date: 1 }).lean().catch(() => []),
        SoccerLeague.find({ active: true }).maxTimeMS(2500).lean().catch(() => [])
    ]);
    // Additive SportScore warm (logos/telemetry) — never blocks or replaces primary feeds
    try { ensureSportScoreCache().catch(() => {}); } catch (_) {}

    const leagueMap = new Map((storedLeagues || []).map(l => [l.slug, l]));
    const candidateMatches = [];
    const finishedMatches = [];
    if (Array.isArray(espnTopBoards)) {
        for (const m of espnTopBoards) {
            if (m?.status?.state === 'in' || m?.status?.isLive) {
                candidateMatches.push(m);
            } else if ((m?.status?.state === 'post' || m?.status?.completed) && !/^(postp|canc|aban|susp)/i.test(String(m?.status?.detail || m?.status?.clock || ''))) {
                finishedMatches.push({ ...m, _authoritative: true });
            }
        }
    }

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
                let matchSlug = slug;

                // Demote mis-tagged lower-division clubs off top-flight boards (e.g. Turkish 1. Lig / 2. Lig out of tur.1)
                if (typeof demoteIfNotTopFlight === 'function') {
                    matchSlug = demoteIfNotTopFlight(matchSlug, h.Nm, a.Nm, leagueName) || matchSlug;
                }
                if (typeof inferCountryFromTeamNames === 'function') {
                    matchSlug = inferCountryFromTeamNames(h.Nm, a.Nm, matchSlug) || matchSlug;
                }

                // Demote B/reserve/youth sides off senior top-flight & continental boards to dedicated junior or lower tier
                const seniorSlug = String(matchSlug || '').toLowerCase();
                if (isSeniorTopLeagueSlug(seniorSlug) && (isReserveOrBTeamName(h.Nm) || isReserveOrBTeamName(a.Nm))) {
                    matchSlug = demoteToJuniorOrLowerTier(matchSlug, h.Nm, a.Nm, leagueName);
                }
                const hScore = parseInt(ev.Tr1 || 0, 10);
                const aScore = parseInt(ev.Tr2 || 0, 10);
                const rawClock = String(ev.Eps || '').trim() || (ev.Epr === 2 ? 'FT' : (ev.Epr === 0 ? 'NS' : String(ev.Epr || 'NS'))).trim();
                const matchDate = parseLiveScoreEsd(ev.Esd);

                const isZeroOrSched = rawClock === '0' || rawClock === "0'" || rawClock === '00' || rawClock === '00:00';
                const isFutureMatch = matchDate && (matchDate.getTime() - Date.now() > 5 * 60 * 1000);
                const isNotStarted = rawClock === 'NS' || rawClock === 'Upcoming' || rawClock === '' || rawClock === 'Sched' || rawClock.includes(':') || isZeroOrSched || isFutureMatch;
                const isPostponed = rawClock.includes('Postp') || rawClock.includes('Canc');
                const isFinished = rawClock === 'FT' || rawClock === 'AET' || rawClock === 'AP' || (ev.Epr === 2 && !isPostponed);
                const isInPlay = !isNotStarted && !isFinished && !isPostponed;

                // Capture newly finished LiveScore matches so dailyBoardCache gets authoritative FT scores
                if (isFinished) {
                    const ftMatch = {
                        id: eid,
                        uid: `ls:${eid}`,
                        league_slug: matchSlug,
                        date: matchDate,
                        status: {
                            state: 'post',
                            name: 'STATUS_FINAL',
                            description: 'Full Time',
                            clock: rawClock,
                            detail: rawClock,
                            completed: true,
                            isLive: false
                        },
                        home: {
                            name: h.Nm || 'Home',
                            displayName: h.Nm || 'Home',
                            score: isNaN(hScore) ? 0 : hScore,
                            winner: !isNaN(hScore) && !isNaN(aScore) && hScore > aScore
                        },
                        away: {
                            name: a.Nm || 'Away',
                            displayName: a.Nm || 'Away',
                            score: isNaN(aScore) ? 0 : aScore,
                            winner: !isNaN(hScore) && !isNaN(aScore) && aScore > hScore
                        },
                        source: { provider: 'livescore', livescore_id: eid, event_id: eid },
                        _authoritative: true
                    };
                    finishedMatches.push(ftMatch);
                    recordRecentFinishedMatch(ftMatch);
                    continue;
                }

                // For the dedicated in-play feed, only collect active live matches
                if (!isInPlay) continue;

                if (typeof inferCountryFromTeamNames === 'function') {
                    matchSlug = inferCountryFromTeamNames(h.Nm, a.Nm, matchSlug) || matchSlug;
                }

                const clock = rawClock === 'HT' ? 'HT' : (rawClock.includes("'") ? rawClock : `${rawClock}'`);
                const matchLg = TARGET_LEAGUES.find(l => l.slug === matchSlug) || leagueMap.get(matchSlug) || lg || {};

                candidateMatches.push({
                    id: eid,
                    uid: `ls:${eid}`,
                    league: {
                        slug: matchSlug,
                        name: matchLg.name || leagueName,
                        abbreviation: matchLg.abbreviation || leagueName.slice(0, 16),
                        country: (typeof normalizeCountryName === 'function' ? normalizeCountryName(matchLg.country || country) : (matchLg.country || country)),
                        logo: matchLg.logo || ''
                    },
                    date: matchDate,
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
            if (state === 'post') {
                const competitors = comp.competitors || [];
                const homeComp = competitors.find(c => c.homeAway === 'home') || competitors[0] || {};
                const awayComp = competitors.find(c => c.homeAway === 'away') || competitors[1] || {};
                const hScore = parseInt(homeComp.score || 0, 10);
                const aScore = parseInt(awayComp.score || 0, 10);
                const ftLabel = ev.status?.type?.shortDetail || ev.status?.type?.detail || 'FT';
                const isPostp = /postp|canc|abd/i.test(String(ftLabel));
                const safeH = isNaN(hScore) ? 0 : hScore;
                const safeA = isNaN(aScore) ? 0 : aScore;

                if (!isPostp) {
                    const ftMatch = {
                        id: String(ev.id),
                        uid: ev.uid || String(ev.id),
                        date: ev.date ? new Date(ev.date) : new Date(),
                        status: {
                            state: 'post',
                            name: 'STATUS_FINAL',
                            description: 'Full Time',
                            clock: /^(FT|AET|AP|Final)/i.test(ftLabel) ? ftLabel : 'FT',
                            detail: /^(FT|AET|AP|Final)/i.test(ftLabel) ? ftLabel : 'FT',
                            completed: true,
                            isLive: false
                        },
                        home: {
                            name: homeComp.team?.name || homeComp.team?.displayName || 'Home',
                            displayName: homeComp.team?.displayName || homeComp.team?.name || 'Home',
                            score: safeH,
                            winner: safeH > safeA
                        },
                        away: {
                            name: awayComp.team?.name || awayComp.team?.displayName || 'Away',
                            displayName: awayComp.team?.displayName || awayComp.team?.name || 'Away',
                            score: safeA,
                            winner: safeA > safeH
                        },
                        source: { provider: 'espn', espn_id: String(ev.id), event_id: String(ev.id) },
                        _authoritative: true
                    };
                    finishedMatches.push(ftMatch);
                    recordRecentFinishedMatch(ftMatch);
                }

                SoccerMatch.updateOne(
                    {
                        $or: [
                            { 'source.event_id': String(ev.id) },
                            { 'source.espn_id': String(ev.id) }
                        ]
                    },
                    {
                        $set: {
                            'status.state': 'post',
                            'status.completed': true,
                            'status.clock': isPostp ? 'Postp.' : 'FT',
                            'status.detail': isPostp ? 'Postp.' : 'FT',
                            'status.short_detail': isPostp ? 'Postp.' : 'FT',
                            'status.description': isPostp ? 'Postponed' : 'Full Time',
                            'home.score': safeH,
                            'away.score': safeA,
                            'home.winner': !isPostp && safeH > safeA,
                            'away.winner': !isPostp && safeA > safeH
                        }
                    }
                ).catch(() => {});
                continue;
            }
            if (state !== 'in') continue; // only in-play

            const competitors = comp.competitors || [];
            const homeComp = competitors.find(c => c.homeAway === 'home') || competitors[0] || {};
            const awayComp = competitors.find(c => c.homeAway === 'away') || competitors[1] || {};
            if (/ncaa|college basketball/i.test(`${comp.altGameNote || ''} ${ev.name || ''} ${ev.uid || ''}`)) continue;
            let targetSlug = resolveLeagueSlug(comp.altGameNote || '', comp.notes?.[0]?.headline || '', ev.uid || '');
            if (!targetSlug || targetSlug === 'usa.ncaa') continue;
            targetSlug = enforceCountryOnSlug(targetSlug, comp.notes?.[0]?.headline || '', comp.altGameNote || '');
            if (!targetSlug || targetSlug === 'usa.ncaa') continue;
            if (typeof demoteIfNotTopFlight === 'function') {
                targetSlug = demoteIfNotTopFlight(targetSlug, homeComp.team?.name || homeComp.team?.displayName, awayComp.team?.name || awayComp.team?.displayName, comp.altGameNote || '') || targetSlug;
            }
            if (typeof inferCountryFromTeamNames === 'function') {
                targetSlug = inferCountryFromTeamNames(homeComp.team?.name || homeComp.team?.displayName, awayComp.team?.name || awayComp.team?.displayName, targetSlug) || targetSlug;
            }
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
                    country: (typeof normalizeCountryName === 'function' ? normalizeCountryName : (x)=>x)(lg.country || targetLg?.country || 'International'),
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
            // Drop any match whose kickoff was > 135 minutes ago or in future, or has zero clock
            const rawMClock = String(m.status?.clock || m.status?.detail || '').trim();
            const isZeroClock = rawMClock === '0' || rawMClock === "0'" || rawMClock === '00' || rawMClock === '00:00' || rawMClock === 'NS';
            if (m.date) {
                const diff = Date.now() - new Date(m.date).getTime();
                if (diff > 160 * 60 * 1000) {
                    SoccerMatch.updateOne({ _id: m._id }, { $set: { 'status.state': 'post', 'status.completed': true, 'status.clock': 'FT', 'status.description': 'Full Time' } }).catch(() => {});
                    continue;
                }
                if (diff < -2 * 60 * 1000 || (diff < 15 * 60 * 1000 && isZeroClock)) {
                    SoccerMatch.updateOne({ _id: m._id }, { $set: { 'status.state': 'pre', 'status.completed': false, 'status.clock': 'NS', 'status.detail': 'Scheduled', 'status.description': 'Scheduled' } }).catch(() => {});
                    continue;
                }
            } else if (isZeroClock) {
                continue;
            }
            let mSlug = m.league_slug;
            if (typeof demoteIfNotTopFlight === 'function') {
                mSlug = demoteIfNotTopFlight(mSlug, m.home?.name || m.home?.display_name, m.away?.name || m.away?.display_name, m.note || '') || mSlug;
            }
            if (typeof inferCountryFromTeamNames === 'function') {
                mSlug = inferCountryFromTeamNames(m.home?.name || m.home?.display_name, m.away?.name || m.away?.display_name, mSlug) || mSlug;
            }
            const targetLg = TARGET_LEAGUES.find(l => l.slug === mSlug);
            const lg = leagueMap.get(mSlug) || targetLg || {};
            candidateMatches.push({
                id: m.source?.event_id || String(m._id),
                uid: m.source?.uid || '',
                league: {
                    slug: mSlug,
                    name: lg.name || (targetLg?.name) || m.note || mSlug,
                    abbreviation: lg.abbreviation || (targetLg?.abbreviation) || mSlug,
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
    // Primary: unique by event id (prevents exact double rows from multi-source ingest)
    // Secondary: unique by normalized team pair (collapses ESPN+LiveScore variants)
    const byId = new Map();
    const byPair = new Map();

    const liveScoreOf = (m) => {
        const clockN = parseInt(String(m.status?.clock || m.status?.detail || '').replace(/\D/g, ''), 10) || 0;
        return (
            (m.home?.logo ? 3 : 0) + (m.away?.logo ? 3 : 0) +
            (m.source?.provider === 'espn' ? 2 : 0) +
            (m.recentEvents?.length ? 2 : 0) +
            (m.venue ? 1 : 0) +
            (m.status?.state === 'in' ? 4 : 0) +
            Math.min(clockN, 120)
        );
    };

    const pairKeyOf = (m) => {
        const hName = m.home?.displayName || m.home?.name || '';
        const aName = m.away?.displayName || m.away?.name || '';
        const hNorm = normalizeTeamName(hName);
        const aNorm = normalizeTeamName(aName);
        if (!hNorm && !aNorm) return '';
        const slug = String(m.league_slug || m.league?.slug || '');
        const isWomen = /\.w\.|women|femen/i.test(slug) || /\bW\b|\(W\)|women/i.test(hName + ' ' + aName);
        const isYouth = /u-?1[789]|u-?2[01]|youth/i.test(hName + ' ' + aName + ' ' + slug);
        // Do NOT depend on fragile date keys for live — same pair in-play is one match
        return [hNorm, aNorm].sort().join('_vs_') + (isWomen ? '_w' : '') + (isYouth ? '_y' : '');
    };

    const mergeLive = (winner, secondary) => {
        if (!winner || !secondary || winner === secondary) return winner;
        try {
            const wH = Number(winner.home?.score);
            const wA = Number(winner.away?.score);
            const sH = Number(secondary.home?.score);
            const sA = Number(secondary.away?.score);
            if (Number.isFinite(sH) && Number.isFinite(sA)) {
                const wTot = (Number.isFinite(wH) && Number.isFinite(wA)) ? (wH + wA) : -1;
                if ((sH + sA) > wTot) {
                    if (winner.home) winner.home.score = sH;
                    if (winner.away) winner.away.score = sA;
                }
            }
            const secClock = secondary.status?.clock;
            if (secClock && String(secClock).match(/\d|HT|ET/) && secClock !== "45'") {
                const wClock = winner.status?.clock;
                const wN = parseInt(String(wClock || '').replace(/\D/g, ''), 10) || 0;
                const sN = parseInt(String(secClock || '').replace(/\D/g, ''), 10) || 0;
                if (sN >= wN) {
                    winner.status = winner.status || {};
                    winner.status.clock = secClock;
                    if (secondary.status?.detail) winner.status.detail = secondary.status.detail;
                }
            }
            if (winner.home && secondary.home?.logo && !winner.home.logo) winner.home.logo = secondary.home.logo;
            if (winner.away && secondary.away?.logo && !winner.away.logo) winner.away.logo = secondary.away.logo;
            if (secondary.home?.logo?.includes('espncdn') && winner.home) winner.home.logo = secondary.home.logo;
            if (secondary.away?.logo?.includes('espncdn') && winner.away) winner.away.logo = secondary.away.logo;
            if (!winner.league?.logo && secondary.league?.logo) {
                if (!winner.league) winner.league = {};
                winner.league.logo = secondary.league.logo;
            }
            if ((!winner.recentEvents || !winner.recentEvents.length) && secondary.recentEvents?.length) {
                winner.recentEvents = secondary.recentEvents;
            }
            // Prefer fuller club names (Stade Rennais > Rennes) when merging provider rows
            try {
                const longer = (a, b) => (String(b||'').length > String(a||'').length ? b : a);
                if (winner.home) {
                    winner.home.name = longer(winner.home.name, secondary.home?.name);
                    winner.home.displayName = longer(winner.home.displayName || winner.home.name, secondary.home?.displayName || secondary.home?.name);
                }
                if (winner.away) {
                    winner.away.name = longer(winner.away.name, secondary.away?.name);
                    winner.away.displayName = longer(winner.away.displayName || winner.away.name, secondary.away?.displayName || secondary.away?.name);
                }
            } catch (_) {}

        } catch (_) {}
        return winner;
    };


    // CRITICAL: day board / fixtures often know about in-play UCL etc. before LiveScore's /live endpoint does
    try {
        const board = dailyBoardCache.getReadyBoard(parseDateParam('today'), { status: 'all' })
            || dailyBoardCache.getReadyBoard(dailyBoardCache.getWatDateKey(), { status: 'all' });
        const boardMatches = board?.matches || [];
        for (const m of boardMatches) {
            if (isActivelyLiveMatch(m)) {
                candidateMatches.push(m);
            }
        }
    } catch (_) {}
    try {
        const boardLiveFromDb = await SoccerMatch.find({
            'status.state': 'in',
            date: { $gte: liveCutoff, $lte: futureCutoff }
        }).maxTimeMS(2000).sort({ date: 1 }).lean().catch(() => []);
        for (const m of boardLiveFromDb || []) {
            candidateMatches.push({
                id: String(m.source?.event_id || m.source?.livescore_id || m.source?.espn_id || m._id),
                uid: m.source?.uid || String(m._id),
                league: {
                    slug: m.league_slug,
                    name: m.league_name || m.league_slug,
                    abbreviation: m.league_abbreviation || '',
                    country: (typeof normalizeCountryName === 'function' ? normalizeCountryName(m.league_country || '') : (m.league_country || '')) || 'International',
                    logo: m.league_logo || ''
                },
                date: m.date,
                status: {
                    state: 'in',
                    name: m.status?.name || 'STATUS_IN_PROGRESS',
                    description: m.status?.description || 'In Progress',
                    clock: m.status?.clock || m.status?.detail || "45'",
                    detail: m.status?.detail || m.status?.clock || '',
                    period: m.status?.period || 1,
                    completed: false,
                    isLive: true
                },
                home: {
                    id: m.home?.source_id,
                    name: m.home?.display_name || m.home?.name,
                    displayName: m.home?.display_name || m.home?.name,
                    logo: m.home?.logo || '',
                    score: m.home?.score
                },
                away: {
                    id: m.away?.source_id,
                    name: m.away?.display_name || m.away?.name,
                    displayName: m.away?.display_name || m.away?.name,
                    logo: m.away?.logo || '',
                    score: m.away?.score
                },
                source: m.source || { provider: 'mongo', event_id: String(m.source?.event_id || m._id) }
            });
        }
    } catch (_) {}

    for (const m of candidateMatches) {
        if (!m) continue;
        const id = String(m.id || m.uid || m.source?.event_id || m.source?.livescore_id || '').trim();
        const score = liveScoreOf(m);
        const pair = pairKeyOf(m);

        if (id) {
            const prev = byId.get(id);
            if (!prev) byId.set(id, { match: m, score });
            else {
                const win = score >= prev.score ? m : prev.match;
                const lose = score >= prev.score ? prev.match : m;
                byId.set(id, { match: mergeLive(win, lose), score: Math.max(score, prev.score) });
            }
        }

        if (pair) {
            const prev = byPair.get(pair);
            if (!prev) byPair.set(pair, { match: m, score, id });
            else {
                const win = score >= prev.score ? m : prev.match;
                const lose = score >= prev.score ? prev.match : m;
                byPair.set(pair, { match: mergeLive(win, lose), score: Math.max(score, prev.score), id: id || prev.id });
            }
        } else if (!id) {
            // last resort unique slot
            byPair.set(`rand_${byPair.size}`, { match: m, score, id: '' });
        }
    }

    // Prefer pair-collapsed set, then ensure no duplicate ids
    const finalMap = new Map();
    for (const entry of byPair.values()) {
        const m = entry.match;
        const pKey = pairKeyOf(m);
        const id = String(m.id || m.uid || entry.id || '').trim();
        const key = pKey || id || `x_${finalMap.size}`;
        const prev = finalMap.get(key);
        if (!prev) finalMap.set(key, m);
        else finalMap.set(key, mergeLive(liveScoreOf(m) >= liveScoreOf(prev) ? m : prev, liveScoreOf(m) >= liveScoreOf(prev) ? prev : m));
    }
    // Include any id-only entries not covered
    for (const entry of byId.values()) {
        const m = entry.match;
        const id = String(m.id || '').trim();
        if (id && !finalMap.has(id)) {
            // check pair collision
            const p = pairKeyOf(m);
            let found = false;
            if (p) {
                for (const [k, existing] of finalMap) {
                    if (pairKeyOf(existing) === p) { found = true; break; }
                }
            }
            if (!found) finalMap.set(id, m);
        }
    }

    const seenLiveMap = finalMap; // name kept for minimal churn below

    const dedupedLive = Array.from(seenLiveMap.values()).map(e => (e && e.match) ? e.match : e);
    dedupedLive.sort((a, b) => {
        const pA = getLeaguePriority(a.league?.slug);
        const pB = getLeaguePriority(b.league?.slug);
        if (pB !== pA) return pB - pA;
        return new Date(a.date) - new Date(b.date);
    });
    try {
        if (finishedMatches.length > 0) {
            dailyBoardCache.patchMatchesInBoards(finishedMatches, { authoritative: true });
        }
        const utcTodayKey = parseDateParam('today');
        const watTodayKey = dailyBoardCache.getWatDateKey();
        dailyBoardCache.patchLiveMatchesInBoard(utcTodayKey, dedupedLive);
        if (watTodayKey && watTodayKey !== utcTodayKey) {
            dailyBoardCache.patchLiveMatchesInBoard(watTodayKey, dedupedLive);
        }
        // Also patch any cross-midnight live matches that belong to yesterday's cached board
        if (dedupedLive.length > 0) {
            dailyBoardCache.patchMatchesInBoards(dedupedLive);
        }
    } catch (_) {}
    try {
        const enriched = enrichMatchesLogos(dedupedLive);
        setTimeout(() => preCacheMatchCrests(enriched), 200);
        return enriched;
    } catch (_) {
        setTimeout(() => preCacheMatchCrests(dedupedLive), 200);
        return dedupedLive;
    }
}

function filterLiveMatchesResponse(matches, league, isFreeRestricted) {
    let result = matches || [];
    try {
        ensureSportScoreCache().catch(() => {});
        result = enrichMatchesLogos(result);
    } catch (_) {}
    // Final safety: never return the same event id twice
    try {
        const seen = new Set();
        const pairSeen = new Set();
        result = result.filter((m) => {
            const id = String(m?.id || m?.uid || '').trim();
            const hRaw = m?.home?.name || m?.home?.displayName || '';
            const aRaw = m?.away?.name || m?.away?.displayName || '';
            const h = normalizeTeamName(hRaw);
            const a = normalizeTeamName(aRaw);
            const tier = getMatchTier(hRaw, aRaw, m?.league?.slug || m?.league_slug || '');
            const pair = (h && a) ? `${[h, a].sort().join('_vs_')}_${tier}` : '';
            if (id) {
                if (seen.has(id)) return false;
                seen.add(id);
            }
            if (pair) {
                if (pairSeen.has(pair)) return false;
                pairSeen.add(pair);
            }
            return true;
        });
    } catch (_) {}

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


/**
 * Fetch LiveScore date scoreboard (scheduled + live + finished) and map to UI match shape.
 * Used when Mongo has no rows for the day so the board is never falsely empty.
 */

/** ESPN scoreboard for one league — includes pre + in + post strictly for the requested date */
async function fetchEspnLeagueScoreboard(leagueSlug, dateKey = null) {
    const slug = String(leagueSlug || '').trim();
    if (!slug) return [];
    const cleanDateKey = dateKey ? String(dateKey).replace(/[^0-9]/g, '').slice(0, 8) : '';
    const hasDateKey = cleanDateKey.length === 8;
    const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${encodeURIComponent(slug)}/scoreboard${hasDateKey ? `?dates=${cleanDateKey}` : ''}`;
    const data = await fetchUpstreamJsonFast(url, 4500).catch(() => null);
    if (!data || !Array.isArray(data.events)) return [];
    const isTargetToday = hasDateKey && cleanDateKey === parseDateParam('today');
    const out = [];
    for (const ev of data.events) {
        try {
            const comp = (ev.competitions || [])[0] || {};
            const statusType = ev.status?.type || comp.status?.type || {};
            const stateRaw = String(statusType.state || '').toLowerCase();
            let state = 'pre';
            if (stateRaw === 'in') state = 'in';
            else if (stateRaw === 'post') state = 'post';
            const competitors = comp.competitors || [];
            const homeComp = competitors.find(c => c.homeAway === 'home') || competitors[0] || {};
            const awayComp = competitors.find(c => c.homeAway === 'away') || competitors[1] || {};
            const hName = homeComp.team?.displayName || homeComp.team?.name || 'Home';
            const aName = awayComp.team?.displayName || awayComp.team?.name || 'Away';
            const clock = ev.status?.displayClock || statusType.detail || statusType.shortDetail || '';
            const parsedDate = ev.date ? new Date(ev.date) : null;
            const validDate = parsedDate && !isNaN(parsedDate.getTime()) ? parsedDate : null;
            const sbDate = validDate ? formatDateKey(validDate) : (hasDateKey ? cleanDateKey : formatDateKey(new Date()));
            const item = {
                id: String(ev.id),
                uid: ev.uid || `espn:${ev.id}`,
                league_slug: slug,
                scoreboard_date: sbDate,
                scoreboardDate: sbDate,
                league: {
                    slug,
                    name: data.leagues?.[0]?.name || slug,
                    abbreviation: data.leagues?.[0]?.abbreviation || slug,
                    country: (typeof normalizeCountryName === 'function' ? normalizeCountryName : (x)=>x)(
                        data.leagues?.[0]?.countryCode === 'INT' ? 'International' : (data.leagues?.[0]?.name?.includes('UEFA') ? 'Europe' : '')
                    ) || (slug.startsWith('uefa.') ? 'Europe' : 'International'),
                    logo: data.leagues?.[0]?.logos?.[0]?.href || ''
                },
                date: validDate || new Date(),
                status: {
                    state,
                    name: statusType.name || '',
                    description: statusType.description || '',
                    clock: state === 'in' ? (clock || "45'") : (state === 'post' ? 'FT' : clock || "0'"),
                    detail: statusType.detail || clock || '',
                    period: ev.status?.period || 0,
                    completed: state === 'post',
                    isLive: state === 'in'
                },
                home: {
                    id: homeComp.team?.id,
                    name: hName,
                    displayName: hName,
                    logo: homeComp.team?.logos?.[0]?.href || (homeComp.team?.id ? `https://a.espncdn.com/i/teamlogos/soccer/500/${homeComp.team.id}.png` : ''),
                    score: homeComp.score != null ? parseInt(homeComp.score, 10) : null
                },
                away: {
                    id: awayComp.team?.id,
                    name: aName,
                    displayName: aName,
                    logo: awayComp.team?.logos?.[0]?.href || (awayComp.team?.id ? `https://a.espncdn.com/i/teamlogos/soccer/500/${awayComp.team.id}.png` : ''),
                    score: awayComp.score != null ? parseInt(awayComp.score, 10) : null
                },
                source: { provider: 'espn', event_id: String(ev.id), espn_id: String(ev.id) }
            };
            if (hasDateKey && !doesMatchBelongToDate(item, cleanDateKey, { isToday: isTargetToday })) {
                continue;
            }
            out.push(item);
        } catch (_) {}
    }
    return out;
}

const ESPN_BOARD_LEAGUES = [
    'uefa.champions', 'uefa.europa', 'uefa.europa.conf',
    'eng.1', 'esp.1', 'ita.1', 'ger.1', 'fra.1',
    'ned.1', 'por.1', 'tur.1', 'bel.1', 'nga.1',
    'bra.1', 'arg.1', 'mex.1', 'usa.1', 'ksa.1'
];

async function fetchEspnDayBoardExtras(dateKey = null) {
    const targetKey = dateKey ? String(dateKey).replace(/[^0-9]/g, '').slice(0, 8) : parseDateParam('today');
    const chunks = await Promise.all(ESPN_BOARD_LEAGUES.map(s => fetchEspnLeagueScoreboard(s, targetKey).catch(() => [])));
    return chunks.flat();
}

async function fetchLiveScoreDayMatches(dateKey) {
    const key = String(dateKey || parseDateParam('today')).replace(/-/g, '');
    const url = `https://prod-public-api.livescore.com/v1/api/app/date/soccer/${key}/0`;
    const data = await fetchUpstreamJsonFast(url, 8000);
    if (!data || !Array.isArray(data.Stages)) return [];

    let storedLeagues = [];
    try {
        storedLeagues = await SoccerLeague.find({ active: true }).maxTimeMS(2500).lean();
    } catch (_) {}
    const leagueMap = new Map((storedLeagues || []).map(l => [l.slug, l]));
    const out = [];

    for (const stage of data.Stages) {
        const country = (typeof normalizeCountryName === 'function' ? normalizeCountryName(stage.Cnm || stage.Sdn || 'International') : (stage.Cnm || stage.Sdn || 'International'));
        const leagueName = stage.Snm || 'Football Competition';
        let slug = resolveLeagueSlug(leagueName, country, stage.Scd || '');
        if (!slug || slug === 'usa.ncaa') continue;
        try {
            slug = enforceCountryOnSlug(slug, country, leagueName);
        } catch (_) {}
        if (!slug || slug === 'usa.ncaa') continue;
        const targetLg = (typeof TARGET_LEAGUES !== 'undefined' ? TARGET_LEAGUES : []).find(l => l.slug === slug) || {};
        const lg = leagueMap.get(slug) || targetLg || {};

        for (const ev of (stage.Events || [])) {
            const eid = String(ev.Eid || '');
            if (!eid) continue;
            const h = ev.T1?.[0] || {};
            const a = ev.T2?.[0] || {};
            let hName = h.Nm || h.Name || 'Home';
            let aName = a.Nm || a.Name || 'Away';
            let matchSlug = slug;

            if (typeof demoteIfNotTopFlight === 'function') {
                matchSlug = demoteIfNotTopFlight(matchSlug, hName, aName, leagueName) || matchSlug;
            }
            if (typeof inferCountryFromTeamNames === 'function') {
                matchSlug = inferCountryFromTeamNames(hName, aName, matchSlug) || matchSlug;
            }

            const seniorSlug = String(matchSlug || '').toLowerCase();
            if (isSeniorTopLeagueSlug(seniorSlug) && (isReserveOrBTeamName(hName) || isReserveOrBTeamName(aName))) {
                matchSlug = demoteToJuniorOrLowerTier(matchSlug, hName, aName, leagueName);
            }

            const matchLg = TARGET_LEAGUES.find(l => l.slug === matchSlug) || leagueMap.get(matchSlug) || lg || {};
            const hScore = ev.Tr1 != null && ev.Tr1 !== '' ? parseInt(ev.Tr1, 10) : null;
            const aScore = ev.Tr2 != null && ev.Tr2 !== '' ? parseInt(ev.Tr2, 10) : null;
            // Esd is often YYYYMMDDHHmmss
            let matchDate = new Date();
            let hasParsedEsd = false;
            if (ev.Esd) {
                const s = String(ev.Esd);
                if (/^\d{14}$/.test(s)) {
                    matchDate = new Date(Date.UTC(
                        +s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8),
                        +s.slice(8, 10), +s.slice(10, 12), +s.slice(12, 14)
                    ));
                    hasParsedEsd = true;
                } else {
                    const d = new Date(ev.Esd);
                    if (!isNaN(d.getTime())) {
                        matchDate = d;
                        hasParsedEsd = true;
                    }
                }
            }

            const rawClock = String(ev.Eps || '').trim() || (ev.Epr === 0 ? 'NS' : String(ev.Epr || 'NS')).trim();
            const isZeroOrSched = rawClock === '0' || rawClock === "0'" || rawClock === '00' || rawClock === '00:00';
            const isFutureMatch = matchDate && (matchDate.getTime() - Date.now() > 2 * 60 * 1000);
            const isPastUnstarted = matchDate && (Date.now() - matchDate.getTime() > 3 * 3600 * 1000);
            const isNotStarted = rawClock === 'NS' || rawClock === 'Upcoming' || rawClock === '' || rawClock === 'Sched' || /^\d{1,2}:\d{2}/.test(rawClock) || isZeroOrSched || isFutureMatch;
            const isFinished = rawClock === 'FT' || rawClock === 'AET' || rawClock === 'AP' || rawClock === 'Final';
            const isPostponed = /postp|canc|aban/i.test(rawClock) || (isNotStarted && isPastUnstarted);
            const isInPlay = !isNotStarted && !isFinished && !isPostponed;
            const state = isInPlay ? 'in' : (isFinished ? 'post' : (isPostponed ? 'post' : 'pre'));
            const clock = isInPlay
                ? (rawClock === 'HT' ? 'HT' : (rawClock.includes("'") ? rawClock : `${rawClock}'`))
                : (isFinished ? 'FT' : (isPostponed ? 'Postp.' : (isZeroOrSched ? 'NS' : rawClock)));

            const actualDateKey = hasParsedEsd ? formatDateKey(matchDate) : key;
            const statusObj = {
                state,
                name: isInPlay ? 'STATUS_IN_PROGRESS' : (isPostponed ? 'STATUS_POSTPONED' : (isFinished ? 'STATUS_FINAL' : 'STATUS_SCHEDULED')),
                description: isInPlay ? 'In Progress' : (isPostponed ? 'Postponed' : (isFinished ? 'Full Time' : 'Scheduled')),
                clock,
                detail: clock,
                isLive: isInPlay,
                completed: isFinished || isPostponed,
                suspended: isPostponed
            };
            if (!doesMatchBelongToDate({ date: matchDate, scoreboard_date: actualDateKey, status: statusObj }, key, { isToday: key === parseDateParam('today') })) {
                continue;
            }

            const formatLsImg = (img) => {
                if (!img) return '';
                const clean = String(img).replace(/^\/+/, '');
                if (/^\d+\.png$/i.test(clean) || /^\d+$/.test(clean)) {
                    const file = clean.endsWith('.png') ? clean : `${clean}.png`;
                    return `https://storage.livescore.com/images/team/medium/enet/${file}`;
                }
                return `https://storage.livescore.com/images/team/medium/${clean}`;
            };
            const homeLogo = formatLsImg(h.Img);
            const awayLogo = formatLsImg(a.Img);

            out.push({
                id: eid,
                uid: `ls:${eid}`,
                league: {
                    slug: matchSlug,
                    name: matchLg.name || leagueName,
                    abbreviation: matchLg.abbreviation || String(leagueName).slice(0, 16),
                    country: matchSlug === 'mex.2' ? 'Mexico' : (matchLg.country || country),
                    logo: matchLg.logo || ''
                },
                league_slug: matchSlug,
                scoreboard_date: actualDateKey,
                date: matchDate,
                status: statusObj,
                home: {
                    source_id: String(h.ID || h.Id || ''),
                    name: hName,
                    displayName: hName,
                    display_name: hName,
                    score: hScore,
                    logo: homeLogo,
                    winner: isFinished && hScore != null && aScore != null ? hScore > aScore : false
                },
                away: {
                    source_id: String(a.ID || a.Id || ''),
                    name: aName,
                    displayName: aName,
                    display_name: aName,
                    score: aScore,
                    logo: awayLogo,
                    winner: isFinished && hScore != null && aScore != null ? aScore > hScore : false
                },
                competitions: [{
                    competitors: [
                        {
                            homeAway: 'home',
                            score: hScore == null ? null : String(hScore),
                            winner: isFinished && hScore != null && aScore != null && hScore > aScore,
                            team: { id: String(h.ID || ''), displayName: hName, name: hName, logo: homeLogo }
                        },
                        {
                            homeAway: 'away',
                            score: aScore == null ? null : String(aScore),
                            winner: isFinished && hScore != null && aScore != null && aScore > hScore,
                            team: { id: String(a.ID || ''), displayName: aName, name: aName, logo: awayLogo }
                        }
                    ]
                }],
                source: { event_id: eid, provider: 'livescore', livescore_id: eid }
            });
        }
    }
    return out;
}

async function getFormattedLiveMatches(league, isFreeRestricted) {
    const now = Date.now();
    const CACHE_TTL_MS = 10000; // 10 seconds

    // Stale-While-Revalidate: If we have live matches (or empty result) cached in memory, return immediately (< 5ms)
    // and trigger background refresh if cache is older than TTL
    // Empty live cache is never sticky (>1.5s); non-empty uses normal TTL
    const emptyStale = liveFeedMemoryCache.matches.length === 0 && (now - liveFeedMemoryCache.timestamp > 1500);
    if (liveFeedMemoryCache.timestamp > 0 && !emptyStale
        && (now - liveFeedMemoryCache.timestamp < CACHE_TTL_MS || liveFeedMemoryCache.matches.length > 0)) {
        if (now - liveFeedMemoryCache.timestamp >= CACHE_TTL_MS && !liveFeedMemoryCache.inFlightPromise) {
            liveFeedMemoryCache.inFlightPromise = (async () => {
                try {
                    const matches = await fetchFreshWorldwideLiveMatches();
                    if (Array.isArray(matches)) {
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
                if (Array.isArray(matches)) {
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
const initWarmTimer = setTimeout(() => {
    fetchFreshWorldwideLiveMatches().then(m => {
        if (Array.isArray(m)) {
            liveFeedMemoryCache.matches = m;
            liveFeedMemoryCache.timestamp = Date.now();
        }
    }).catch(() => {});
}, 800);
if (initWarmTimer && typeof initWarmTimer.unref === 'function') initWarmTimer.unref();

const refreshLiveTimer = setInterval(() => {
    fetchFreshWorldwideLiveMatches().then(m => {
        if (Array.isArray(m)) {
            liveFeedMemoryCache.matches = m;
            liveFeedMemoryCache.timestamp = Date.now();
        }
    }).catch(() => {});
}, 12000);
if (refreshLiveTimer && typeof refreshLiveTimer.unref === 'function') refreshLiveTimer.unref();

/**
 * GET /api/v1/football/live & /api/v1/football/livescores
 * Global real-time in-play match scores & minutes across all leagues in ONE call.
 * Specifically optimized for Norra AI live match tickers and livescore polling.
 */
router.get(['/live', '/livescores'], optionalApiKeyAuth, async (req, res) => {
    try {
        const { league } = req.query;
        const freeRestricted = isFreePlanRestricted(req.apiKey);
        let result = await getFormattedLiveMatches(league, freeRestricted);

        if (result.restricted) {
            return res.status(403).json({
                error: `Access to competition '${result.requestedSlug}' is restricted on the Free Developer tier (limited to 3 free leagues: eng.1, esp.1, nga.1). Upgrade to Starter ($10/mo) or Pro ($29/mo) to access all 100+ world leagues.`,
                upgradeUrl: '/pricing',
                tier: 'free',
                allowedLeagues: FREE_TIER_ALLOWED_LEAGUES
            });
        }

        let matches = Array.isArray(result.matches) ? result.matches.slice() : [];

        // Hard fallback: day board in-play rows (fixes empty /live while fixtures still show live clocks)
        if (matches.length === 0) {
            try {
                const boardLive = dailyBoardCache.getReadyBoard(parseDateParam('today'), { status: 'live' })
                    || dailyBoardCache.getReadyBoard(dailyBoardCache.getWatDateKey(), { status: 'live' });
                if (boardLive?.matches?.length) {
                    matches = boardLive.matches.slice();
                }
            } catch (_) {}
        }
        // Second fallback: Mongo in-play window
        if (matches.length === 0) {
            try {
                const liveCutoff = new Date(Date.now() - 135 * 60 * 1000);
                const futureCutoff = new Date(Date.now() + 15 * 60 * 1000);
                const dbLive = await SoccerMatch.find({
                    'status.state': 'in',
                    date: { $gte: liveCutoff, $lte: futureCutoff }
                }).maxTimeMS(2500).sort({ date: 1 }).limit(80).lean().catch(() => []);
                matches = (dbLive || []).map((m) => ({
                    id: String(m.source?.event_id || m.source?.livescore_id || m.source?.espn_id || m._id),
                    uid: m.source?.uid || String(m._id),
                    league: {
                        slug: m.league_slug,
                        name: m.league_name || m.league_slug,
                        country: m.league_country || 'International',
                        logo: m.league_logo || ''
                    },
                    date: m.date,
                    status: {
                        state: 'in',
                        name: m.status?.name || 'STATUS_IN_PROGRESS',
                        clock: m.status?.clock || m.status?.detail || "45'",
                        detail: m.status?.detail || m.status?.clock || '',
                        period: m.status?.period || 1,
                        completed: false,
                        isLive: true
                    },
                    home: {
                        id: m.home?.source_id,
                        name: m.home?.display_name || m.home?.name,
                        displayName: m.home?.display_name || m.home?.name,
                        logo: m.home?.logo || '',
                        score: m.home?.score
                    },
                    away: {
                        id: m.away?.source_id,
                        name: m.away?.display_name || m.away?.name,
                        displayName: m.away?.display_name || m.away?.name,
                        logo: m.away?.logo || '',
                        score: m.away?.score
                    },
                    source: m.source || {}
                }));
            } catch (_) {}
        }

        // Optional league filter on fallbacks
        if (league && league !== 'all' && matches.length) {
            const want = String(league).toLowerCase();
            matches = matches.filter((m) => String(m.league?.slug || m.league_slug || '').toLowerCase() === want);
        }
        if (freeRestricted && matches.length) {
            matches = matches.filter((m) => FREE_TIER_ALLOWED_LEAGUES.includes(String(m.league?.slug || '')));
        }

        // Zero-latency live cache headers
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.set('Pragma', 'no-cache');
        const todayBoard = dailyBoardCache.getReadyBoard(parseDateParam('today'), { status: 'all' })
            || dailyBoardCache.getReadyBoard(dailyBoardCache.getWatDateKey(), { status: 'all' });
        const dailyFixtureCount = Array.isArray(todayBoard?.matches) ? todayBoard.matches.length : 0;
        return res.json({
            status: 'success',
            meta: {
                liveCount: matches.length,
                dailyFixtureCount,
                timestamp: new Date().toISOString(),
                isAdFree: Boolean(req.isAdFree),
                source: matches.length && (!result.matches || result.matches.length === 0) ? 'board-fallback' : 'live-feed'
            },
            live: matches,
            matches
        });
    } catch (err) {
        console.error('Error fetching live scores:', err.message);
        return res.status(500).json({ error: 'Failed to retrieve live scores: ' + err.message, live: [], matches: [] });
    }
});

/**
 * Shared SSE Fan-Out Hub
 * Replaces per-client 4s polling loops with a single shared poller, bounded state map,
 * match_finished (FT) delta emission, and concurrent client cap.
 */
const MAX_SSE_CLIENTS = 250;
const MAX_SSE_STATE_ENTRIES = 1000;

const liveStreamHub = {
    clients: new Set(),
    previousStateMap: new Map(),
    timer: null,
    tickInFlight: false,

    addClient(client) {
        if (this.clients.size >= MAX_SSE_CLIENTS) {
            return false;
        }
        this.clients.add(client);
        if (!this.timer) {
            this.timer = setInterval(() => {
                this.tick().catch(() => {});
            }, 4000);
            if (this.timer && typeof this.timer.unref === 'function') {
                this.timer.unref();
            }
        }
        return true;
    },

    removeClient(client) {
        this.clients.delete(client);
        if (this.clients.size === 0 && this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    },

    seedMatches(matches) {
        if (!Array.isArray(matches)) return;
        for (const m of matches) {
            if (!m || !m.id || this.previousStateMap.has(m.id)) continue;
            const curClock = m.status?.clock || m.status?.detail || '';
            const kickoffTs = m.date ? Date.parse(m.date) : NaN;
            this.previousStateMap.set(m.id, {
                scoreSig: `${m.home?.score ?? 0}-${m.away?.score ?? 0}-${curClock}`,
                homeScore: Number(m.home?.score ?? 0),
                awayScore: Number(m.away?.score ?? 0),
                clock: curClock,
                kickoffTs: Number.isFinite(kickoffTs) ? kickoffTs : null,
                missedTicks: 0,
                leagueSlug: m.league_slug || m.league?.slug || '',
                homeName: m.home?.displayName || m.home?.name || 'Home',
                awayName: m.away?.displayName || m.away?.name || 'Away',
                homeLogo: m.home?.logo || '',
                awayLogo: m.away?.logo || ''
            });
        }
    },

    computeDeltas(currentLive) {
        const updates = [];
        const currentIds = new Set();
        const nowMs = Date.now();

        for (const m of currentLive) {
            if (!m || !m.id) continue;
            currentIds.add(m.id);
            const curHomeScore = Number(m.home?.score ?? 0);
            const curAwayScore = Number(m.away?.score ?? 0);
            const curClock = m.status?.clock || m.status?.detail || (m.status?.type?.detail) || '';
            const curState = m.status?.state || (m.status?.type?.state) || 'in';
            const leagueSlug = m.league_slug || m.league?.slug || '';
            const sig = `${curHomeScore}-${curAwayScore}-${curClock}`;
            const kickoffTs = m.date ? Date.parse(m.date) : NaN;

            const prev = this.previousStateMap.get(m.id);
            if (prev) prev.missedTicks = 0;
            if (!prev || prev.scoreSig !== sig) {
                const prevH = prev ? prev.homeScore : curHomeScore;
                const prevA = prev ? prev.awayScore : curAwayScore;
                const isGoal = (curHomeScore > prevH) || (curAwayScore > prevA);
                const scoringTeam = (curHomeScore > prevH)
                    ? (m.home?.displayName || m.home?.name || 'Home')
                    : (curAwayScore > prevA ? (m.away?.displayName || m.away?.name || 'Away') : null);

                updates.push({
                    id: m.id,
                    eventId: m.id,
                    leagueSlug,
                    homeScore: curHomeScore,
                    awayScore: curAwayScore,
                    clock: curClock,
                    state: curState,
                    status: {
                        clock: curClock,
                        detail: curClock,
                        displayClock: curClock,
                        state: curState,
                        type: m.status?.type || { state: curState, detail: curClock }
                    },
                    home: {
                        score: curHomeScore,
                        displayName: m.home?.displayName || m.home?.name || 'Home',
                        logo: m.home?.logo || ''
                    },
                    away: {
                        score: curAwayScore,
                        displayName: m.away?.displayName || m.away?.name || 'Away',
                        logo: m.away?.logo || ''
                    },
                    isGoal,
                    scoringTeam,
                    timestamp: nowMs
                });

                this.previousStateMap.set(m.id, {
                    scoreSig: sig,
                    homeScore: curHomeScore,
                    awayScore: curAwayScore,
                    clock: curClock,
                    kickoffTs: Number.isFinite(kickoffTs) ? kickoffTs : (prev?.kickoffTs ?? null),
                    missedTicks: 0,
                    leagueSlug,
                    homeName: m.home?.displayName || m.home?.name || 'Home',
                    awayName: m.away?.displayName || m.away?.name || 'Away',
                    homeLogo: m.home?.logo || '',
                    awayLogo: m.away?.logo || ''
                });
            }
        }

        // Emit FT / match_finished deltas for matches that legitimately left the live feed and prune state map.
        // Guard against premature FT during 1st half / HT / <102m provider hiccups, and prefer authoritative FT scores.
        for (const [id, prev] of this.previousStateMap.entries()) {
            if (!currentIds.has(id)) {
                const recentFt = recentFinishedMatches.get(String(id));
                const boardMatch = dailyBoardCache.findMatchInBoards(id);
                const boardAuthFt = Boolean(
                    boardMatch &&
                    !boardMatch._autoFinalized &&
                    (boardMatch.status?.completed || boardMatch.status?.state === 'post')
                );
                const hasAuthFt = Boolean(recentFt || boardAuthFt);

                if (!hasAuthFt) {
                    const prevClockStr = String(prev.clock || '').trim();
                    const isHalfTime = /^HT$/i.test(prevClockStr);
                    const clockMinMatch = prevClockStr.match(/^(\d{1,3})/);
                    const clockMin = clockMinMatch ? parseInt(clockMinMatch[1], 10) : 0;
                    const isFirstHalf = isHalfTime || (clockMin > 0 && clockMin <= 45);
                    const hasKickoff = Number.isFinite(prev.kickoffTs);
                    const elapsedMs = hasKickoff ? (nowMs - prev.kickoffTs) : NaN;
                    const inImpossibleFtWindow = hasKickoff && elapsedMs >= 0 && elapsedMs < 102 * 60 * 1000;

                    if (inImpossibleFtWindow || isFirstHalf) {
                        prev.missedTicks = (prev.missedTicks || 0) + 1;
                        // Prune silently if gone for >1 minute without emitting a bogus 1st-half FT
                        if (prev.missedTicks >= 15) {
                            this.previousStateMap.delete(id);
                        }
                        continue;
                    }
                }

                const finalH = recentFt
                    ? recentFt.homeScore
                    : (boardAuthFt && Number.isFinite(Number(boardMatch.home?.score)) ? Number(boardMatch.home.score) : prev.homeScore);
                const finalA = recentFt
                    ? recentFt.awayScore
                    : (boardAuthFt && Number.isFinite(Number(boardMatch.away?.score)) ? Number(boardMatch.away.score) : prev.awayScore);
                const finalClock = recentFt?.clock || (boardAuthFt ? (boardMatch.status?.clock || 'FT') : 'FT');

                updates.push({
                    id,
                    eventId: id,
                    leagueSlug: prev.leagueSlug || '',
                    homeScore: finalH,
                    awayScore: finalA,
                    clock: finalClock,
                    state: 'post',
                    matchFinished: true,
                    status: {
                        clock: finalClock,
                        detail: finalClock,
                        displayClock: finalClock,
                        state: 'post',
                        type: { state: 'post', detail: finalClock, completed: true }
                    },
                    home: { score: finalH, displayName: prev.homeName, logo: prev.homeLogo },
                    away: { score: finalA, displayName: prev.awayName, logo: prev.awayLogo },
                    isGoal: false,
                    scoringTeam: null,
                    timestamp: nowMs
                });
                this.previousStateMap.delete(id);
            }
        }

        // Hard cap safety bound on previousStateMap
        if (this.previousStateMap.size > MAX_SSE_STATE_ENTRIES) {
            const overflow = this.previousStateMap.size - MAX_SSE_STATE_ENTRIES;
            let removed = 0;
            for (const key of this.previousStateMap.keys()) {
                this.previousStateMap.delete(key);
                if (++removed >= overflow) break;
            }
        }

        return updates;
    },

    async tick() {
        if (this.tickInFlight || this.clients.size === 0) return;
        this.tickInFlight = true;
        try {
            const currentResult = await getFormattedLiveMatches(null, false);
            const currentLive = currentResult.matches || [];
            const allUpdates = this.computeDeltas(currentLive);
            const ts = new Date().toISOString();

            for (const client of Array.from(this.clients)) {
                if (!client.isAlive) {
                    this.removeClient(client);
                    continue;
                }
                const updates = allUpdates.filter((u) => {
                    if (client.league && u.leagueSlug && u.leagueSlug !== client.league) return false;
                    if (client.freeRestricted && client.allowedLeagues && u.leagueSlug && !client.allowedLeagues.includes(u.leagueSlug)) return false;
                    return true;
                });

                try {
                    if (updates.length > 0) {
                        client.sendEvent('score_update', {
                            timestamp: ts,
                            updatesCount: updates.length,
                            deltas: updates,
                            updates
                        });
                    } else {
                        client.sendEvent('heartbeat', { timestamp: ts });
                    }
                } catch {
                    client.isAlive = false;
                    this.removeClient(client);
                }
            }
        } catch (_) {
            // Transient upstream error: keep hub alive
        } finally {
            this.tickInFlight = false;
        }
    }
};

/**
 * GET /api/v1/football/live/stream
 * Sub-second Server-Sent Events (SSE) live score & minute updates stream.
 * Pushes live match score changes and minute clock ticks directly to clients via shared hub.
 */
router.get('/live/stream', optionalApiKeyAuth, async (req, res) => {
    const { league } = req.query;
    if (!enforceLeaguePlan(req, res, league)) return;

    if (liveStreamHub.clients.size >= MAX_SSE_CLIENTS) {
        return res.status(503).json({
            error: 'Live stream capacity reached. Please retry shortly.',
            retryAfter: '10 seconds'
        });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof res.flushHeaders === 'function') res.flushHeaders();

    const freeRestricted = isFreePlanRestricted(req.apiKey);
    const client = {
        isAlive: true,
        league: league ? String(league).trim().toLowerCase() : null,
        freeRestricted,
        allowedLeagues: freeRestricted ? (req.apiKey?.allowedLeagues || null) : null,
        sendEvent(event, data) {
            if (!this.isAlive) return;
            res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        }
    };

    req.on('close', () => {
        client.isAlive = false;
        liveStreamHub.removeClient(client);
    });

    try {
        const initialResult = await getFormattedLiveMatches(league, freeRestricted);
        const initial = initialResult.matches || [];

        client.sendEvent('initial', {
            timestamp: new Date().toISOString(),
            liveCount: initial.length,
            matches: initial
        });

        liveStreamHub.seedMatches(initial);
        liveStreamHub.addClient(client);
    } catch (err) {
        client.sendEvent('error', { error: err.message });
        client.isAlive = false;
        liveStreamHub.removeClient(client);
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
    const todayUtcKey = parseDateParam('today');
    const cacheKey = `${todayUtcKey}:${req.originalUrl || `/fixtures?${new URLSearchParams(req.query).toString()}`}`;
    const now = Date.now();
    const cached = fixturesResponseCache.get(cacheKey);

    // Stale-While-Revalidate TTL: 10s for today/live queries; 120s for past or future dates
    const isQueryingToday = Boolean((req.query.date && parseDateParam(req.query.date) === todayUtcKey) || (!req.query.date && !req.query.from && !req.query.to));
    const isLiveFilter = req.query.status === 'live';
    const cacheTtlMs = (isQueryingToday || isLiveFilter) ? 10000 : 120000;

    // Instant render-ready RAM board hit for single-date all-leagues queries (eliminates repeat Atlas M0 roundtrips)
    const canUseDailyBoard = !req.query.from && !req.query.to && !req.query.team &&
        (!req.query.league || req.query.league === 'all') &&
        !isFreePlanRestricted(req.apiKey);
    const dailyBoardDateKey = req.query.date ? parseDateParam(req.query.date) : todayUtcKey;
    if (canUseDailyBoard && dailyBoardDateKey) {
        const ready = dailyBoardCache.getReadyBoard(dailyBoardDateKey, { status: req.query.status || 'all' });
        if (ready && ready.matches && ready.matches.length > 0) {
            const safeReadyMatches = isLiveFilter
                ? ready.matches.filter(m => isActivelyLiveMatch(m, now))
                : ready.matches.filter(m => doesMatchBelongToDate(m, dailyBoardDateKey, { nowMs: now, isToday: isQueryingToday }));
            if (safeReadyMatches.length > 0) {
                if (ready.hasLive || isLiveFilter || isQueryingToday) {
                    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
                    res.set('Pragma', 'no-cache');
                } else {
                    res.set('Cache-Control', 'public, max-age=30');
                }
                const pageNum = Math.max(1, parseInt(req.query.page, 10) || 1);
                const limitNum = Math.min(2000, Math.max(1, parseInt(req.query.limit, 10) || 500));
                const startIdx = (pageNum - 1) * limitNum;
                const pagedMatches = safeReadyMatches.slice(startIdx, startIdx + limitNum);
                return res.json({
                    status: 'success',
                    meta: {
                        totalMatches: safeReadyMatches.length,
                        count: pagedMatches.length,
                        page: pageNum,
                        pageSize: limitNum,
                        totalPages: Math.ceil(safeReadyMatches.length / limitNum) || 1,
                        filters: { date: req.query.date, from: req.query.from, to: req.query.to, league: req.query.league || 'all', status: req.query.status || 'all', team: req.query.team },
                        isAdFree: Boolean(req.isAdFree),
                        cachedBoard: true,
                        boardGeneratedAt: new Date(ready.generatedAt).toISOString()
                    },
                    matches: pagedMatches,
                    fixtures: pagedMatches
                });
            }
        }
    }

    if (cached && (now - cached.timestamp < cacheTtlMs)) {
        if (cached.hasLive || isLiveFilter || isQueryingToday) {
            res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.set('Pragma', 'no-cache');
            // Dynamically overlay live in-play states so cached responses never carry stale scores or obsolete clocks
            if (isQueryingToday && liveFeedMemoryCache.matches && liveFeedMemoryCache.matches.length > 0 && Array.isArray(cached.body?.matches)) {
                const liveMap = new Map();
                for (const lm of liveFeedMemoryCache.matches) {
                    const id = String(lm.source?.event_id || lm.id || lm._id || '');
                    if (id) liveMap.set(id, lm);
                    const h = normalizeTeamName(lm.home?.name || lm.home?.displayName || '');
                    const a = normalizeTeamName(lm.away?.name || lm.away?.displayName || '');
                    const lTier = getMatchTier(lm.home?.name || lm.home?.displayName || '', lm.away?.name || lm.away?.displayName || '', lm.league?.slug || lm.league_slug || '');
                    if (h && a) liveMap.set(`${h}_vs_${a}_${lTier}`, lm);
                }
                for (let i = 0; i < cached.body.matches.length; i++) {
                    const m = cached.body.matches[i];
                    const mid = String(m.source?.event_id || m.id || m._id || '');
                    const h = normalizeTeamName(m.home?.name || m.home?.displayName || '');
                    const a = normalizeTeamName(m.away?.name || m.away?.displayName || '');
                    const mTier = getMatchTier(m.home?.name || m.home?.displayName || '', m.away?.name || m.away?.displayName || '', m.league?.slug || m.league_slug || '');
                    const lm = liveMap.get(mid) || liveMap.get(`${h}_vs_${a}_${mTier}`);
                    if (!lm) continue;
                    if (m.status?.completed || m.status?.state === 'post') {
                        const kickoffTs = m.date ? Date.parse(m.date) : NaN;
                        const elapsedMs = Number.isFinite(kickoffTs) ? (Date.now() - kickoffTs) : Infinity;
                        const isPostp = /^(Postp|Canc|Abd)/i.test(String(m.status?.detail || m.status?.clock || ''));
                        const mGoals = (Number(m.home?.score) || 0) + (Number(m.away?.score) || 0);
                        const lmGoals = (Number(lm.home?.score) || 0) + (Number(lm.away?.score) || 0);
                        const hasConcreteLive = Boolean(lm.status?.isLive || isConcreteClock(lm.status?.clock || lm.status?.detail));
                        const canRevive = Boolean(m._autoFinalized)
                            || (!isPostp && elapsedMs >= 0 && elapsedMs < 102 * 60 * 1000 && hasConcreteLive)
                            || (!isPostp && elapsedMs >= 0 && elapsedMs < 155 * 60 * 1000 && lmGoals > mGoals);
                        if (!canRevive) continue;
                    }
                    const existingClock = m.status?.clock || m.status?.detail;
                    const incomingClock = lm.status?.clock || lm.status?.detail;
                    const bestClock = isConcreteClock(incomingClock) ? incomingClock : (isConcreteClock(existingClock) ? existingClock : (incomingClock || 'Live'));
                    m._autoFinalized = false;
                    m.status = {
                        ...m.status,
                        ...lm.status,
                        clock: bestClock,
                        detail: bestClock,
                        displayClock: bestClock,
                        shortDetail: bestClock
                    };
                    m.home = lm.home;
                    m.away = lm.away;
                }
            }
        } else {
            res.set('Cache-Control', 'public, max-age=30');
        }
        return res.json(cached.body);
    }

    try {
        const { date, from, to, league, status = 'all', team } = req.query;
        const page = parseNumber(req.query.page, 1, 1000);
        const limit = parseNumber(req.query.limit, 600, 1500);

        const filter = {};

        // Date filtering (strict UTC calendar day; never pull yesterday's completed games via server-local timezone)
        const liveCutoff = new Date(Date.now() - 160 * 60 * 1000);
        const todayKey = parseDateParam('today');
        const dayStart = new Date();
        dayStart.setUTCHours(0, 0, 0, 0);
        const dayEnd = new Date();
        dayEnd.setUTCHours(23, 59, 59, 999);
        if (isQueryingToday) {
            filter.$or = [
                { scoreboard_date: todayKey },
                { scoreboard_date: `${todayKey.slice(0,4)}-${todayKey.slice(4,6)}-${todayKey.slice(6,8)}` },
                { date: { $gte: dayStart, $lte: dayEnd } },
                { 'status.state': 'in', date: { $gte: liveCutoff } }
            ];
            // Games strictly belong to their calendar date; yesterday games do not bleed into today
        } else if (date) {
            const key = parseDateParam(date);
            const yesterdayKey = parseDateParam('yesterday');
            const yr = parseInt(key.slice(0, 4), 10);
            const mo = parseInt(key.slice(4, 6), 10);
            const da = parseInt(key.slice(6, 8), 10);
            const targetStart = new Date(Date.UTC(yr, mo - 1, da, 0, 0, 0, 0));
            const targetEnd = new Date(Date.UTC(yr, mo - 1, da, 23, 59, 59, 999));
            const formattedIsoKey = `${key.slice(0,4)}-${key.slice(4,6)}-${key.slice(6,8)}`;

            if (key === yesterdayKey && status === 'finished') {
                filter.$or = [
                    { scoreboard_date: yesterdayKey, 'status.state': 'post' },
                    { scoreboard_date: `${yesterdayKey.slice(0,4)}-${yesterdayKey.slice(4,6)}-${yesterdayKey.slice(6,8)}`, 'status.state': 'post' }
                ];
            } else {
                filter.$or = [
                    { scoreboard_date: key },
                    { scoreboard_date: formattedIsoKey },
                    { date: { $gte: targetStart, $lte: targetEnd } }
                ];
            }
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
                        error: `Access to competition '${league}' is restricted on the Free Developer tier (limited to 3 free leagues: eng.1, esp.1, nga.1). Upgrade to Starter ($10/mo) or Pro ($29/mo) to access all 100+ world leagues.`,
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
            const requestedSlug = String(league).toLowerCase();
            if (requestedSlug === 'tur.2' || requestedSlug === 'tur.3') {
                filter.league_slug = { $in: [requestedSlug, 'tur.1', 'tur.lower'] };
            } else {
                filter.league_slug = requestedSlug;
            }
        }

        // Status filtering
        if (status === 'live') {
            filter['status.state'] = 'in';
            filter.date = { $gte: liveCutoff };
            delete filter.scoreboard_date;
            delete filter.$or;
        } else if (status === 'scheduled') {
            filter['status.state'] = { $in: ['pre', 'scheduled'] };
        } else if (status === 'finished') {
            filter['status.state'] = { $in: ['post', 'final', 'completed'] };
        }

        // Team search (preserve existing date $or via $and so team queries stay date-scoped)
        if (team) {
            const teamRegex = new RegExp(String(team).trim(), 'i');
            const teamOr = [
                { 'home.name': teamRegex },
                { 'home.display_name': teamRegex },
                { 'away.name': teamRegex },
                { 'away.display_name': teamRegex },
                { 'home.source_id': String(team) },
                { 'away.source_id': String(team) }
            ];
            if (filter.$or) {
                filter.$and = [...(filter.$and || []), { $or: filter.$or }, { $or: teamOr }];
                delete filter.$or;
            } else {
                filter.$or = teamOr;
            }
        }

        const PRIORITY_GUARANTEED_LEAGUES = [
            'uefa.champions', 'uefa.europa', 'uefa.europa.conf',
            'eng.1', 'esp.1', 'ita.1', 'ger.1', 'fra.1',
            'nga.1', 'ned.1', 'por.1', 'bra.1', 'arg.1', 'ksa.1', 'usa.1', 'mex.1', 'tur.1', 'bel.1', 'sco.1', 'rus.1', 'col.1'
        ];
        const needsPriorityMerge = (!league || league === 'all') && !isFreePlanRestricted(req.apiKey);

        const slimMatchSelect = 'source.event_id source.provider source.uid source.livescore_id league_slug name short_name date scoreboard_date status.state status.name status.description status.detail status.short_detail status.clock status.period status.completed status.suspended home.source_id home.name home.display_name home.abbreviation home.logo home.score home.winner away.source_id away.name away.display_name away.abbreviation away.logo away.score away.winner note';

        let [totalCount, priorityMatches, generalMatches, storedLeagues] = await Promise.all([
            SoccerMatch.countDocuments(filter).maxTimeMS(6000).catch(() => 0),
            needsPriorityMerge
                ? SoccerMatch.find({ ...filter, league_slug: { $in: PRIORITY_GUARANTEED_LEAGUES } })
                    .select(slimMatchSelect)
                    .sort({ date: 1 })
                    .limit(250)
                    .maxTimeMS(6000)
                    .lean()
                    .catch(() => [])
                : Promise.resolve([]),
            SoccerMatch.find(filter)
                .select(slimMatchSelect)
                .sort({ date: 1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .maxTimeMS(10000)
                .lean()
                .catch(() => []),
            SoccerLeague.find({ active: true }).select('slug name abbreviation country logo').maxTimeMS(2500).lean().catch(() => [])
        ]);

        // Merge guaranteed top-flight matches first so busy Saturdays never truncate EPL/LaLiga/SerieA/Bundesliga/NPFL
        let matches = generalMatches;
        if (priorityMatches.length > 0) {
            const seenPIds = new Set(priorityMatches.map(m => String(m._id)));
            matches = [...priorityMatches, ...generalMatches.filter(m => !seenPIds.has(String(m._id)))];
        }

        // On-demand fallback for past/future dates (yesterday, tomorrow, custom YYYY-MM-DD) when DB has few/0 fixtures
        if (!isQueryingToday && date && (matches.length < 5 || (league && league !== 'all' && matches.length === 0))) {
            const targetKey = parseDateParam(date);
            let onDemand = await fetchOnDemandDateMatches(targetKey);
            if (isFreePlanRestricted(req.apiKey)) {
                onDemand = onDemand.filter(m => FREE_TIER_ALLOWED_LEAGUES.includes(String(m.league_slug || '').toLowerCase()));
            } else if (league && league !== 'all') {
                const reqSlug = String(league).toLowerCase();
                onDemand = onDemand.filter(m => String(m.league_slug || '').toLowerCase() === reqSlug);
            }
            if (status === 'live') {
                onDemand = onDemand.filter(m => m.status?.state === 'in' || m.status?.isLive);
            } else if (status === 'scheduled') {
                onDemand = onDemand.filter(m => m.status?.state === 'pre');
            } else if (status === 'finished') {
                onDemand = onDemand.filter(m => m.status?.state === 'post' || m.status?.completed);
            }
            if (team) {
                const tRx = new RegExp(String(team).trim(), 'i');
                onDemand = onDemand.filter(m => tRx.test(m.home?.name || '') || tRx.test(m.away?.name || ''));
            }
            if (onDemand.length > 0) {
                matches = [...matches, ...onDemand];
                totalCount = matches.length;
            }
        }

        // If querying today, always merge real-time live in-play matches into the fixture results
        if (isQueryingToday && (status === 'all' || status === 'live')) {
            if (liveFeedMemoryCache.matches && liveFeedMemoryCache.matches.length > 0) {
                let liveCandidates = liveFeedMemoryCache.matches.filter(m => isActivelyLiveMatch(m));
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

                        if ((id && seenSignatures.has(id)) || (h && a && seenSignatures.has(sig))) {
                            // Update existing match in array if it was found as scheduled but is now live
                            const idx = matches.findIndex(m => {
                                const mh = normalizeTeamName(m.home?.name || m.home?.displayName || '');
                                const ma = normalizeTeamName(m.away?.name || m.away?.displayName || '');
                                const mid = String(m.source?.event_id || m.id || m._id || '');
                                const mTier = getMatchTier(m.home?.name || m.home?.displayName || '', m.away?.name || m.away?.displayName || '', m.league?.slug || m.league_slug || '');
                                return (id && mid === id) || (h && a && mh === h && ma === a && mTier === tier);
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
            const isPastMatch = m.date && (new Date(m.date).getTime() < Date.now() - 3 * 3600 * 1000);
            const isStaleUnstarted = isPastMatch && (m.status?.state === 'pre' || !m.status?.state) && !m.status?.completed && !isLive;

            const state = isStaleUnstarted ? 'post' : (m.status?.state || (isLive ? 'in' : 'pre'));
            const isCompleted = isStaleUnstarted || Boolean(m.status?.completed) || state === 'post';
            const displayClock = isStaleUnstarted ? 'Postp.' : (isConcreteClock(concreteClock) ? concreteClock : (isLive ? 'Live' : ''));
            const detail = isStaleUnstarted ? 'Postp.' : (isConcreteClock(m.status?.detail) ? m.status.detail : (displayClock || (isLive ? 'Live' : (isCompleted ? 'FT' : 'Scheduled'))));

            return {
                id: m.source?.event_id || m.id || String(m._id),
                uid: m.source?.uid || m.uid || '',
                league: {
                    slug: leagueSlug,
                    name: lg.name || (targetLg?.name) || m.note || leagueSlug,
                    abbreviation: lg.abbreviation || (targetLg?.abbreviation) || leagueSlug,
                    country: (function(){ const inferred = inferMatchCountry({ ...m, league: { ...(m.league||{}), name: lg.name || m.league?.name, slug: lg.slug || m.league_slug }, league_slug: lg.slug || m.league_slug }); const c = (lg.country && lg.country !== 'International') ? lg.country : ((targetLg?.country && targetLg.country !== 'International') ? targetLg.country : inferred); return (c && c !== 'International') ? c : inferred; })(),
                    logo: lg.logo || (targetLg?.logo) || ''
                },
                scoreboardDate: m.scoreboard_date || m.scoreboardDate,
                date: m.date,
                name: m.name || `${m.home?.name || m.home?.displayName || 'Home'} vs ${m.away?.name || m.away?.displayName || 'Away'}`,
                shortName: m.short_name || m.shortName,
                status: {
                    state,
                    name: isStaleUnstarted ? 'STATUS_POSTPONED' : (m.status?.name || (isLive ? 'STATUS_IN_PROGRESS' : isCompleted ? 'STATUS_FINAL' : 'STATUS_SCHEDULED')),
                    description: isStaleUnstarted ? 'Postponed' : (m.status?.description || (isLive ? 'In Progress' : isCompleted ? 'Full Time' : 'Scheduled')),
                    detail,
                    shortDetail: displayClock || detail,
                    clock: displayClock,
                    displayClock: displayClock,
                    period: m.status?.period || 0,
                    completed: isCompleted,
                    suspended: isStaleUnstarted || Boolean(m.status?.suspended),
                    isLive: isLive && !isStaleUnstarted
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

            const isCompleted = m.status?.completed || m.status?.state === 'post' || /FT|Final|AET|AP/i.test(String(m.status?.detail || m.status?.clock || ''));
            const isLive = m.status?.isLive || m.status?.state === 'in';
            const mScore = (isCompleted ? 25 : 0) +
                           (isLive ? 20 : 0) +
                           (m.home?.logo?.includes('espncdn') ? 4 : 0) +
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

                const secIsCompleted = secondary.status?.completed || secondary.status?.state === 'post' || /FT|Final|AET|AP/i.test(String(secondary.status?.detail || secondary.status?.clock || ''));
                const winIsCompleted = winner.status?.completed || winner.status?.state === 'post' || /FT|Final|AET|AP/i.test(String(winner.status?.detail || winner.status?.clock || ''));
                const secIsLive = secondary.status?.isLive || secondary.status?.state === 'in';
                const winIsLive = winner.status?.isLive || winner.status?.state === 'in';

                if (secIsLive && !winIsCompleted) {
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
                    const winH = Number(winner.home?.score);
                    const winA = Number(winner.away?.score);
                    const secH = Number(secondary.home?.score);
                    const secA = Number(secondary.away?.score);
                    const canApplySecLiveScore = !winIsLive ||
                        (Number.isFinite(secH) && Number.isFinite(secA) &&
                            (!Number.isFinite(winH) || !Number.isFinite(winA) || (secH + secA) >= (winH + winA)));
                    if (canApplySecLiveScore) {
                        if (secondary.home?.score !== undefined) winner.home.score = secondary.home.score;
                        if (secondary.away?.score !== undefined) winner.away.score = secondary.away.score;
                    }
                    winner.status.state = 'in';
                    winner.status.isLive = true;
                } else if (secIsCompleted && !winIsCompleted) {
                    if (!winner.status) winner.status = {};
                    winner.status.state = 'post';
                    winner.status.completed = true;
                    winner.status.isLive = false;
                    winner.status.detail = secondary.status?.detail || 'FT';
                    winner.status.clock = secondary.status?.clock || 'FT';
                    if (secondary.home?.score !== undefined) winner.home.score = secondary.home.score;
                    if (secondary.away?.score !== undefined) winner.away.score = secondary.away.score;
                    if (winner.home && secondary.home?.winner !== undefined) winner.home.winner = secondary.home.winner;
                    if (winner.away && secondary.away?.winner !== undefined) winner.away.winner = secondary.away.winner;
                } else if (secIsCompleted && winIsCompleted) {
                    const winH = Number(winner.home?.score);
                    const winA = Number(winner.away?.score);
                    const secH = Number(secondary.home?.score);
                    const secA = Number(secondary.away?.score);
                    if (Number.isFinite(secH) && Number.isFinite(secA)) {
                        const winTot = (Number.isFinite(winH) && Number.isFinite(winA)) ? (winH + winA) : -1;
                        if ((secH + secA) > winTot) {
                            if (winner.home) {
                                winner.home.score = secH;
                                winner.home.winner = secH > secA;
                            }
                            if (winner.away) {
                                winner.away.score = secA;
                                winner.away.winner = secA > secH;
                            }
                        }
                    }
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

        // ALWAYS merge LiveScore date scoreboard (additive) for single-day queries. Mongo is often partial —
        // previously this only ran when the board was empty, which dropped LASK, most NPFL, etc.
        if (!from && !to && (status === 'all' || status === 'live' || status === 'finished' || status === 'scheduled')) {
            try {
                const targetDayKey = date ? parseDateParam(date) : parseDateParam('today');
                const dayMatches = await fetchLiveScoreDayMatches(targetDayKey);
                try {
                    const espnExtras = await fetchEspnDayBoardExtras(targetDayKey);
                    if (espnExtras.length) dayMatches.push(...espnExtras);
                } catch (_) {}
                for (const m of dayMatches) {
                    if (status === 'live' && !isActivelyLiveMatch(m)) continue;
                    if (status === 'finished' && m.status?.state !== 'post') continue;
                    if (status === 'scheduled' && m.status?.state !== 'pre') continue;
                    const id = String(m.id || m.source?.event_id || '');
                    const hRaw = m.home?.name || m.home?.displayName || '';
                    const aRaw = m.away?.name || m.away?.displayName || '';
                    const h = normalizeTeamName(hRaw);
                    const a = normalizeTeamName(aRaw);
                    const mTier = getMatchTier(hRaw, aRaw, m.league?.slug || m.league_slug || '');
                    // Prefer event id; also tier-qualified pair-key so LiveScore fills gaps Mongo missed without U19/Senior collision
                    const sig = id || `${h}_vs_${a}_${mTier}`;
                    const pairSig = (h && a) ? `${[h, a].sort().join('_vs_')}_${mTier}` : '';
                    let matchedKey = seenFixturesMap.has(sig) ? sig : null;
                    if (!matchedKey && pairSig) {
                        for (const [k, v] of seenFixturesMap) {
                            const mhRaw = v.match?.home?.name || v.match?.home?.displayName || '';
                            const maRaw = v.match?.away?.name || v.match?.away?.displayName || '';
                            const mh = normalizeTeamName(mhRaw);
                            const ma = normalizeTeamName(maRaw);
                            const vTier = getMatchTier(mhRaw, maRaw, v.match?.league?.slug || v.match?.league_slug || '');
                            if (vTier === mTier && [mh, ma].sort().join('_vs_') === [h, a].sort().join('_vs_')) {
                                matchedKey = k;
                                break;
                            }
                        }
                    }
                    if (matchedKey) {
                        const existingEntry = seenFixturesMap.get(matchedKey);
                        const cur = existingEntry?.match;
                        if (cur) {
                            const curFinished = Boolean(cur.status?.completed || cur.status?.state === 'post');
                            const lsFinished = Boolean(m.status?.completed || m.status?.state === 'post');
                            const lsPostp = /postp|canc|abd/i.test(String(m.status?.detail || m.status?.clock || ''));
                            const curH = Number.isFinite(Number(cur.home?.score)) ? Number(cur.home.score) : null;
                            const curA = Number.isFinite(Number(cur.away?.score)) ? Number(cur.away.score) : null;
                            const lsH = Number.isFinite(Number(m.home?.score)) ? Number(m.home.score) : null;
                            const lsA = Number.isFinite(Number(m.away?.score)) ? Number(m.away.score) : null;
                            const curGoals = (curH ?? 0) + (curA ?? 0);
                            const lsGoals = (lsH ?? 0) + (lsA ?? 0);

                            // Upgrade stale MongoDB row with fresher LiveScore FT status or higher score (never overwrite canonical slug/logos)
                            if (lsFinished && !lsPostp && (!curFinished || (lsH !== null && lsA !== null && lsGoals > curGoals))) {
                                cur.status = {
                                    ...(cur.status || {}),
                                    state: 'post',
                                    name: 'STATUS_FINAL',
                                    description: 'Full Time',
                                    clock: m.status?.clock || 'FT',
                                    detail: m.status?.detail || 'FT',
                                    completed: true,
                                    isLive: false
                                };
                                if (lsH !== null && lsA !== null && (!curFinished || lsGoals > curGoals)) {
                                    if (cur.home) {
                                        cur.home.score = lsH;
                                        cur.home.winner = lsH > lsA;
                                    }
                                    if (cur.away) {
                                        cur.away.score = lsA;
                                        cur.away.winner = lsA > lsH;
                                    }
                                }
                            } else if (m.status?.state === 'in' && !curFinished && lsH !== null && lsA !== null && lsGoals > curGoals) {
                                if (cur.home) cur.home.score = lsH;
                                if (cur.away) cur.away.score = lsA;
                                if (cur.status) {
                                    cur.status.state = 'in';
                                    cur.status.isLive = true;
                                    if (m.status?.clock) cur.status.clock = m.status.clock;
                                    if (m.status?.detail) cur.status.detail = m.status.detail;
                                }
                            }
                            if ((!cur.home?.logo || /placeholder/i.test(cur.home.logo)) && m.home?.logo) cur.home.logo = m.home.logo;
                            if ((!cur.away?.logo || /placeholder/i.test(cur.away.logo)) && m.away?.logo) cur.away.logo = m.away.logo;
                        }
                    } else {
                        seenFixturesMap.set(sig, { match: m, score: 12 });
                    }
                }
            } catch (e) {
                console.warn('LiveScore date merge failed:', e.message);
            }
            if (isQueryingToday && (status === 'all' || status === 'live')) {
                try {
                    const freshLive = await getFormattedLiveMatches(null, false);
                    const liveList = Array.isArray(freshLive) ? freshLive : (freshLive?.matches || []);
                    for (const m of liveList) {
                        if (!isActivelyLiveMatch(m)) continue;
                        const id = String(m.id || m.source?.event_id || '');
                        const hRaw = m.home?.name || m.home?.displayName || '';
                        const aRaw = m.away?.name || m.away?.displayName || '';
                        const h = normalizeTeamName(hRaw);
                        const a = normalizeTeamName(aRaw);
                        const mTier = getMatchTier(hRaw, aRaw, m.league?.slug || m.league_slug || '');
                        const sig = id || `${h}_vs_${a}_${mTier}`;
                        if (!seenFixturesMap.has(sig)) {
                            seenFixturesMap.set(sig, { match: m, score: 10 });
                        }
                    }
                } catch (e) {
                    console.warn('Today live merge failed:', e.message);
                }
            }
        }

        // Soft-collapse cup/trophy name variants (Amorebieta/SD Amorebieta, Team W vs Team, Häcken/Haecken)
        const looksWomenBlob = (s) => /\b(women|woman|femenil|femenino|ladies|wfc)\b|\sW\b|\(W\)/i.test(String(s || ''));
        const leagueFamily = (slug) => {
            let s = String(slug || '').toLowerCase();
            // Alias El Salvador / duplicate competition ids
            if (/salvador|slv\./.test(s)) s = 'slv.1';
            // Keep gender in family key
            const women = /\.w\./.test(s) || /women|femenil/.test(s);
            s = s.replace(/\.w\./g, '.').replace(/\.w$/,'');
            // Drop ultra-specific suffixes for soft match
            s = s.replace(/salvadoran\.primera.*/, 'slv.1');
            return (women ? 'w:' : 'm:') + s;
        };
        const softKey = (m) => {
            const hRaw = m.home?.name || m.home?.displayName || m.home?.display_name || '';
            const aRaw = m.away?.name || m.away?.displayName || m.away?.display_name || '';
            const h = normalizeTeamName(hRaw);
            const a = normalizeTeamName(aRaw);
            const pair = [h, a].filter(Boolean).sort().join('_vs_');
            let d = String(m.scoreboard_date || m.scoreboardDate || '');
            if (/^\d{8}$/.test(d)) d = `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`;
            else if (m.date) {
                try { d = new Date(m.date).toISOString().slice(0, 10); } catch { d = ''; }
            }
            const slug = String(m.league?.slug || m.league_slug || '');
            const women = /\.w\./.test(slug) || looksWomenBlob(hRaw) || looksWomenBlob(aRaw) || looksWomenBlob(m.league?.name);
            const tier = getMatchTier(hRaw, aRaw, slug);
            return `${pair}_${d}_${leagueFamily(slug)}_${women ? 'w' : 'm'}_${tier}`;
        };
        const softScore = (m) => {
            const hLogo = m.home?.logo || '';
            const aLogo = m.away?.logo || '';
            const clock = parseInt(String(m.status?.clock || m.status?.detail || '').replace(/\D/g, ''), 10) || 0;
            const hasScore = m.home?.score != null || m.away?.score != null;
            const isCompleted = m.status?.completed || m.status?.state === 'post' || /FT|Final|AET|AP/i.test(String(m.status?.detail || m.status?.clock || ''));
            const isLive = m.status?.isLive || m.status?.state === 'in';
            return (isCompleted ? 25 : 0) + (isLive ? 20 : 0) + (hLogo ? 3 : 0) + (aLogo ? 3 : 0) + (hasScore ? 4 : 0) + Math.min(clock, 120);
        };
        const softMap = new Map();
        for (const entry of seenFixturesMap.values()) {
            const m = entry.match;
            const k = softKey(m);
            if (!k || k.startsWith('_vs_')) {
                softMap.set(String(m.id || Math.random()), m);
                continue;
            }
            const prev = softMap.get(k);
            if (!prev || softScore(m) >= softScore(prev)) softMap.set(k, m);
        }

        const dedupedMatches = Array.from(softMap.values()).map((m) => {
            try {
                const hName = m.home?.name || m.home?.displayName || '';
                const aName = m.away?.name || m.away?.displayName || '';
                let slug = m.league?.slug || m.league_slug || '';
                // Keep verified women's leagues intact (WSL, Liga F, NWSL, etc. have clubs like Arsenal, Barcelona without 'W' suffix)
                const isVerifiedWomenLeague = /liga f|wsl|nwsl|frauen|femenil|d1 arkema|division 1 f/i.test(m.league?.name || m.note || '') || (slug && slug.includes('.w.'));
                const womenSlug = /\.w\./i.test(slug) || /femenil|women/i.test(m.league?.name || '');
                const womenTeams = looksWomenBlob(hName) || looksWomenBlob(aName);
                if (womenSlug && !womenTeams && !isVerifiedWomenLeague) {
                    slug = String(slug).replace(/\.w\./g, '.').replace(/\.w\./, '.');
                    if (slug.endsWith('.w')) slug = slug.slice(0, -2) + '.1';
                    if (m.league) m.league.slug = slug;
                    m.league_slug = slug;
                }
                // Demote mis-tagged lower-division clubs off top-flight boards (e.g. Turkish 1. Lig / 2. Lig out of tur.1)
                const originalSlug = slug;
                if (typeof demoteIfNotTopFlight === 'function') {
                    const demoted = demoteIfNotTopFlight(slug, hName, aName, m.league?.name || m.note || '');
                    if (demoted && demoted !== slug) {
                        slug = demoted;
                    }
                }
                // Country / tier correction (e.g. Londrina/Náutico under ita.2 → bra.2, Turkish 1. Lig / 2. Lig → tur.2 / tur.3)
                if (typeof inferCountryFromTeamNames === 'function') {
                    const corrected = inferCountryFromTeamNames(hName, aName, slug);
                    if (corrected && corrected !== slug) {
                        slug = corrected;
                    }
                }
                if (slug && slug !== originalSlug) {
                    if (m.league) m.league.slug = slug;
                    m.league_slug = slug;
                    const updatedTargetLg = TARGET_LEAGUES.find(l => l.slug === slug);
                    if (m.league && updatedTargetLg) {
                        m.league.name = updatedTargetLg.name;
                        m.league.abbreviation = updatedTargetLg.abbreviation || m.league.abbreviation;
                        m.league.country = updatedTargetLg.country || m.league.country;
                        if (updatedTargetLg.logo) m.league.logo = updatedTargetLg.logo;
                    } else if (m.league && /^bra\./.test(slug)) {
                        m.league.country = 'Brazil';
                        if (/ita\.|italian/i.test(m.league.name || '')) m.league.name = slug.endsWith('.2') ? 'Brasileirão Série B' : 'Brasileirão';
                    }
                }
                // Guard senior top-flight & continental boards against stale DB U19/U21/reserve rows on read
                if (isSeniorTopLeagueSlug(slug) && (isReserveOrBTeamName(hName) || isReserveOrBTeamName(aName))) {
                    const demoted = demoteToJuniorOrLowerTier(slug, hName, aName, m.league?.name || m.note || '');
                    if (demoted && demoted !== slug) {
                        slug = demoted;
                        if (m.league) {
                            m.league.slug = slug;
                            if (slug === 'uefa.youth') {
                                m.league.name = 'UEFA Youth League';
                                m.league.country = 'Europe';
                            } else if (slug === 'conmebol.u20') {
                                m.league.name = 'CONMEBOL U20 Libertadores';
                                m.league.country = 'South America';
                            }
                        }
                        m.league_slug = slug;
                    }
                }
            } catch (_) {}
            return m;
        });
        // Re-enforce requested league filter after read-time reclassification so e.g. ?league=tur.1 never leaks tur.2 matches
        if (league && league !== 'all') {
            const requestedSlug = String(league).toLowerCase();
            for (let i = dedupedMatches.length - 1; i >= 0; i--) {
                const effectiveSlug = String(dedupedMatches[i].league?.slug || dedupedMatches[i].league_slug || '').toLowerCase();
                if (effectiveSlug !== requestedSlug) {
                    dedupedMatches.splice(i, 1);
                }
            }
        }
        // Re-enforce ?team= filter after additive LiveScore/ESPN/live merges so non-matching clubs never leak in
        if (team) {
            const teamStr = String(team).trim();
            const teamRe = new RegExp(teamStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
            for (let i = dedupedMatches.length - 1; i >= 0; i--) {
                const m = dedupedMatches[i];
                const matchesTeam =
                    teamRe.test(String(m.home?.name || '')) ||
                    teamRe.test(String(m.home?.displayName || m.home?.display_name || '')) ||
                    teamRe.test(String(m.away?.name || '')) ||
                    teamRe.test(String(m.away?.displayName || m.away?.display_name || '')) ||
                    String(m.home?.id || m.home?.source_id || '') === teamStr ||
                    String(m.away?.id || m.away?.source_id || '') === teamStr;
                if (!matchesTeam) {
                    dedupedMatches.splice(i, 1);
                }
            }
        }
        // Final strict calendar-date guard: never let previous-day (yesterday/older) or other-day matches leak into a single-day board
        // (allows legitimate cross-midnight in-play live matches on today's board, never completed/old or scheduled matches)
        const enforceSingleDate = (isQueryingToday || Boolean(date)) && !from && !to && status !== 'live';
        if (status === 'live') {
            const liveGuardNowMs = Date.now();
            for (let i = dedupedMatches.length - 1; i >= 0; i--) {
                if (!isActivelyLiveMatch(dedupedMatches[i], liveGuardNowMs)) {
                    dedupedMatches.splice(i, 1);
                }
            }
        } else if (enforceSingleDate) {
            const strictDateKey = date ? parseDateParam(date) : todayKey;
            const guardNowMs = Date.now();
            for (let i = dedupedMatches.length - 1; i >= 0; i--) {
                if (!doesMatchBelongToDate(dedupedMatches[i], strictDateKey, { nowMs: guardNowMs, isToday: isQueryingToday })) {
                    dedupedMatches.splice(i, 1);
                } else if (isQueryingToday) {
                    const mKey = getMatchUtcDateKey(dedupedMatches[i]);
                    if (mKey && mKey !== strictDateKey) {
                        dedupedMatches[i]._crossDayLive = true;
                    }
                }
            }
        }
        dedupedMatches.sort((a, b) => {
            const stateRank = (m) => (m.status?.isLive || m.status?.state === 'in') ? 3 : (m.status?.completed || m.status?.state === 'post') ? 2 : 1;
            const rDiff = stateRank(b) - stateRank(a);
            if (rDiff !== 0) return rDiff;
            const pA = getLeaguePriority(a.league?.slug);
            const pB = getLeaguePriority(b.league?.slug);
            if (pB !== pA) return pB - pA;
            const tDiff = new Date(a.date) - new Date(b.date);
            if (tDiff !== 0) return tDiff;
            const nameA = String(a.home?.name || a.home?.displayName || '').toLowerCase();
            const nameB = String(b.home?.name || b.home?.displayName || '').toLowerCase();
            return nameA.localeCompare(nameB);
        });

        try {
            await ensureSportScoreCache();
            for (const m of dedupedMatches) enrichMatchLogos(m);
        } catch (_) {}
        
        // Absolute unique by id + pair (Metapan / cup variants)
        {
            const seenId = new Set();
            const seenPair = new Set();
            const out = [];
            for (const m of dedupedMatches) {
                const id = String(m.id || m.uid || m.source?.event_id || '').trim();
                const h = normalizeTeamName(m.home?.name || m.home?.displayName || '');
                const a = normalizeTeamName(m.away?.name || m.away?.displayName || '');
                const rawD = m.scoreboardDate || m.scoreboard_date || (m.date ? new Date(m.date).toISOString().slice(0, 10) : '');
                const dKey = String(rawD).replace(/[^0-9]/g, '').slice(0, 8);
                const slug = String(m.league?.slug || m.league_slug || '');
                const tier = getMatchTier(m.home?.name || m.home?.displayName || '', m.away?.name || m.away?.displayName || '', slug);
                const pair = [h, a].filter(Boolean).sort().join('_vs_');
                const pairKey = pair ? `${pair}_${dKey}_${tier}` : '';
                if (id && seenId.has(id)) continue;
                if (pairKey && seenPair.has(pairKey)) {
                    const existing = out.find(x => {
                        const xh = normalizeTeamName(x.home?.name || x.home?.displayName || '');
                        const xa = normalizeTeamName(x.away?.name || x.away?.displayName || '');
                        const xRawD = x.scoreboardDate || x.scoreboard_date || (x.date ? new Date(x.date).toISOString().slice(0, 10) : '');
                        const xDKey = String(xRawD).replace(/[^0-9]/g, '').slice(0, 8);
                        const xSlug = String(x.league?.slug || x.league_slug || '');
                        const xTier = getMatchTier(x.home?.name || x.home?.displayName || '', x.away?.name || x.away?.displayName || '', xSlug);
                        return `${[xh, xa].filter(Boolean).sort().join('_vs_')}_${xDKey}_${xTier}` === pairKey;
                    });
                    if (existing) {
                        if ((!existing.home?.logo || /placeholder/i.test(existing.home.logo)) && m.home?.logo) existing.home.logo = m.home.logo;
                        if ((!existing.away?.logo || /placeholder/i.test(existing.away.logo)) && m.away?.logo) existing.away.logo = m.away.logo;
                    }
                    continue;
                }
                if (id) seenId.add(id);
                if (pairKey) seenPair.add(pairKey);
                out.push(m);
            }
            dedupedMatches.length = 0;
            out.forEach(m => dedupedMatches.push(m));
        }

        try { setTimeout(() => preCacheMatchCrests(dedupedMatches), 300); } catch (_) {}

        const hasLive = dedupedMatches.some(m => m.status.isLive);
        if (hasLive || status === 'live' || isQueryingToday) {
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

        // Cache successful response; never park empty boards for long (prevents locking empty boards)
        const matchCount = responsePayload?.meta?.totalMatches ?? responsePayload?.matches?.length ?? 0;
        const emptyBoard = matchCount === 0;
        fixturesResponseCache.set(cacheKey, {
            timestamp: emptyBoard ? (Date.now() - cacheTtlMs + 2000) : Date.now(),
            hasLive,
            body: responsePayload
        });
        if (fixturesResponseCache.size > FIXTURES_CACHE_MAX_SIZE) {
            const oldestKey = fixturesResponseCache.keys().next().value;
            fixturesResponseCache.delete(oldestKey);
        }

        // Persist render-ready full-day board snapshot in RAM for instant subsequent visits & kickoff-window tracking
        if (canUseDailyBoard && (!status || status === 'all') && dedupedMatches.length > 0 && dailyBoardDateKey) {
            dailyBoardCache.setReadyBoard(dailyBoardDateKey, dedupedMatches);
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
/**
 * Compute authentic attacking pressure index (0-100) strictly from real in-game telemetry.
 * Returns null if no real attacking metrics exist (never fabricates from scorelines).
 */

/** Drop impossible shot/xG metrics when they contradict the scoreline (e.g. 8-1 with 1 SOT). */
function sanitizeStatsAgainstScoreline(homeStats, awayStats, homeScore, awayScore) {
    const h = { ...(homeStats || {}) };
    const a = { ...(awayStats || {}) };
    const num = (v) => {
        if (v === null || v === undefined || v === '') return null;
        const n = Number(String(v).replace('%', '').trim());
        return Number.isFinite(n) ? n : null;
    };
    const hs = num(homeScore);
    const as = num(awayScore);
    if (hs == null && as == null) return { home: h, away: a, unreliable: false };
    let unreliable = false;
    const check = (side, goals, stats) => {
        if (goals == null || goals < 0) return stats;
        const sot = num(stats.shotsOnTarget ?? stats.shots_on_target);
        const shots = num(stats.totalShots ?? stats.shots ?? stats.total_shots);
        // Goals cannot exceed shots on target by more than 1 (OG/deflections edge case)
        if (sot != null && goals > sot + 1) {
            unreliable = true;
            delete stats.shotsOnTarget;
            delete stats.shots_on_target;
            delete stats.totalShots;
            delete stats.shots;
            delete stats.total_shots;
            delete stats.expectedGoals;
            delete stats.xg;
            delete stats.bigChances;
        } else if (shots != null && goals > shots + 2) {
            unreliable = true;
            delete stats.totalShots;
            delete stats.shots;
            delete stats.shotsOnTarget;
            delete stats.expectedGoals;
        }
        return stats;
    };
    return {
        home: check('home', hs, h),
        away: check('away', as, a),
        unreliable
    };
}

function computeAttackingPressureIndex(stats) {
    if (!stats || typeof stats !== 'object') return null;
    const num = (v) => {
        if (v === null || v === undefined || v === '') return null;
        const n = Number(String(v).replace('%', '').trim());
        return Number.isFinite(n) ? n : null;
    };
    const shotsOn = num(stats.shotsOnTarget);
    const totalShots = num(stats.totalShots);
    const corners = num(stats.wonCorners);
    const xg = num(stats.expectedGoals);
    const bigChances = num(stats.bigChances);
    const dangerousAttacks = num(stats.dangerousAttacks);
    const poss = num(stats.possessionPct);

    if (shotsOn == null && totalShots == null && corners == null && xg == null && dangerousAttacks == null && poss == null) {
        return null;
    }

    const shotsOff = totalShots != null && shotsOn != null ? Math.max(0, totalShots - shotsOn) : (num(stats.shotsOffTarget) || 0);
    const raw =
        (shotsOn ?? 0) * 6.5 +
        shotsOff * 2.2 +
        (corners ?? 0) * 2.8 +
        (xg ?? 0) * 18.0 +
        (bigChances ?? 0) * 8.0 +
        (dangerousAttacks ?? 0) * 0.45 +
        (poss ?? 0) * 0.25;

    return Number(Math.min(100, Math.max(0, raw)).toFixed(1));
}

function extractBoxscoreStatsMap(boxscore, side) {
    const out = {};
    if (!boxscore?.teams || !Array.isArray(boxscore.teams)) return out;
    const teamObj = boxscore.teams.find(t =>
        t.homeAway === side || t.id === side || (side === 'home' ? t.displayOrder === 1 : t.displayOrder === 2)
    ) || (side === 'home' ? boxscore.teams[0] : boxscore.teams[1]);
    if (!Array.isArray(teamObj?.statistics)) return out;
    for (const s of teamObj.statistics) {
        if (!s || !s.name) continue;
        let val = Number(s.value);
        if (!Number.isFinite(val)) {
            val = parseFloat(String(s.displayValue || '').replace('%', '').trim());
        }
        if (Number.isFinite(val)) {
            const key = s.name === 'foulsCommited' ? 'foulsCommitted' : s.name;
            out[key] = val;
        }
    }
    return out;
}

function parseLiveClockMinute(clockStr) {
    const raw = String(clockStr || '').trim().toUpperCase();
    if (!raw) return 0;
    if (raw === 'HT' || raw === 'HALF TIME') return 45;
    if (raw === 'FT' || raw === 'FINAL') return 90;
    const m = raw.match(/(\d+)/);
    return m ? Math.min(120, parseInt(m[1], 10)) : 0;
}

/**
 * Multi-signal, live-aware Norra AI probability & telemetry quality model.
 * Combines form PPG, goal differential, standings, H2H, odds, and LIVE in-play score/clock/stats.
 */
function computeEnrichedPredictionModel({
    homeAnalytics = {},
    awayAnalytics = {},
    homeStanding = null,
    awayStanding = null,
    h2h = {},
    matchStatus = {},
    liveScore = null,
    liveStats = null,
    homeName = 'Home',
    awayName = 'Away',
    odds = [],
    providersUsed = []
} = {}) {
    const hMatches = Number(homeAnalytics.matchesAnalyzed) || 0;
    const aMatches = Number(awayAnalytics.matchesAnalyzed) || 0;
    const hFormWeight = Math.min(1, hMatches / 5);
    const aFormWeight = Math.min(1, aMatches / 5);

    const hPpg = homeAnalytics.pointsPerGame != null ? Number(homeAnalytics.pointsPerGame) : ((Number(homeAnalytics.winRate) || 0) * 0.03);
    const aPpg = awayAnalytics.pointsPerGame != null ? Number(awayAnalytics.pointsPerGame) : ((Number(awayAnalytics.winRate) || 0) * 0.03);
    const hGdAvg = (Number(homeAnalytics.goalsScoredAvg) || 0) - (Number(homeAnalytics.goalsConcededAvg) || 0);
    const aGdAvg = (Number(awayAnalytics.goalsScoredAvg) || 0) - (Number(awayAnalytics.goalsConcededAvg) || 0);

    // Pre-match strength components (balanced baseline of 28 so cold-start matches stay neutral instead of extreme 1X)
    const hFormScore = (hFormWeight * (hPpg * 14 + hGdAvg * 5)) + ((1 - hFormWeight) * 18);
    const aFormScore = (aFormWeight * (aPpg * 14 + aGdAvg * 5)) + ((1 - aFormWeight) * 18);

    const hRankScore = homeStanding?.rank ? (22 - Math.min(21, Number(homeStanding.rank))) * 2.2 : 20;
    const aRankScore = awayStanding?.rank ? (22 - Math.min(21, Number(awayStanding.rank))) * 2.2 : 20;

    const totalH2h = Number(h2h.totalMeetings) || 0;
    let hH2hBonus = 0;
    let aH2hBonus = 0;
    if (totalH2h >= 2) {
        const h2hWeight = Math.min(1, totalH2h / 6);
        hH2hBonus = ((Number(h2h.homeWins) || 0) / totalH2h) * 14 * h2hWeight;
        aH2hBonus = ((Number(h2h.awayWins) || 0) / totalH2h) * 14 * h2hWeight;
    }

    let homeStrength = Math.max(8, hFormScore + hRankScore + hH2hBonus + 5.5); // Modest home advantage
    let awayStrength = Math.max(8, aFormScore + aRankScore + aH2hBonus);
    let drawFactor = 26;

    // Live in-play adjustment when match is currently live (prevents recommending 1X when home team is 0-2 down late!)
    const isLive = matchStatus?.state === 'in' || Boolean(matchStatus?.isLive);
    let isLiveAdjusted = false;
    let liveMinute = 0;
    let liveGoalsTotal = 0;
    if (isLive && liveScore && Number.isFinite(Number(liveScore.home)) && Number.isFinite(Number(liveScore.away))) {
        const hSc = Number(liveScore.home);
        const aSc = Number(liveScore.away);
        liveGoalsTotal = hSc + aSc;
        liveMinute = parseLiveClockMinute(matchStatus.clock || matchStatus.detail);
        const goalDiff = hSc - aSc;
        const timeProgress = Math.min(1, Math.max(0.12, liveMinute / 90));

        if (goalDiff !== 0) {
            isLiveAdjusted = true;
            const absDiff = Math.abs(goalDiff);
            // Exponentially strengthen leading side as goal margin and elapsed minutes grow
            const multiplier = 1 + (absDiff * (1.25 + 4.8 * Math.pow(timeProgress, 1.45)));
            const trailingDampener = Math.max(0.05, 1 / (1 + absDiff * (0.9 + 3.2 * Math.pow(timeProgress, 1.35))));
            if (goalDiff > 0) {
                homeStrength *= multiplier;
                awayStrength *= trailingDampener;
            } else {
                awayStrength *= multiplier;
                homeStrength *= trailingDampener;
            }
            // Draw probability shrinks sharply when 2+ goals separate teams late in match
            drawFactor *= Math.max(0.06, 1 / (1 + absDiff * (0.85 + 2.6 * Math.pow(timeProgress, 1.4))));
        } else if (liveMinute >= 55) {
            isLiveAdjusted = true;
            // Tied late in the match boosts draw weight
            drawFactor *= (1 + 0.9 * ((liveMinute - 50) / 40));
        }

        // Factor in live red cards & attacking pressure / xG when present
        const hStats = liveStats?.home || {};
        const aStats = liveStats?.away || {};
        const hReds = Number(hStats.redCards) || 0;
        const aReds = Number(aStats.redCards) || 0;
        if (hReds !== aReds) {
            isLiveAdjusted = true;
            if (hReds > aReds) {
                homeStrength *= Math.pow(0.72, hReds - aReds);
                awayStrength *= Math.pow(1.22, hReds - aReds);
            } else {
                awayStrength *= Math.pow(0.72, aReds - hReds);
                homeStrength *= Math.pow(1.22, aReds - hReds);
            }
        }
        const hPress = computeAttackingPressureIndex(hStats);
        const aPress = computeAttackingPressureIndex(aStats);
        if (hPress != null && aPress != null && (hPress + aPress) > 10) {
            isLiveAdjusted = true;
            const pressShareDiff = (hPress - aPress) / (hPress + aPress);
            homeStrength *= (1 + pressShareDiff * 0.28);
            awayStrength *= (1 - pressShareDiff * 0.28);
        }
    }

    const totalWeight = homeStrength + awayStrength + drawFactor;
    const homeWinProb = Number(((homeStrength / totalWeight) * 100).toFixed(1));
    const awayWinProb = Number(((awayStrength / totalWeight) * 100).toFixed(1));
    const drawProb = Number(Math.max(0, 100 - homeWinProb - awayWinProb).toFixed(1));

    // Expected goals & scoring markets (live-aware Poisson remaining-goal probabilities)
    const hasGoalAvgs = (hMatches > 0 || aMatches > 0);
    const preMatchHomeXg = hasGoalAvgs
        ? Number((((Number(homeAnalytics.goalsScoredAvg) || 1.2) + (Number(awayAnalytics.goalsConcededAvg) || 1.2)) / 2).toFixed(2))
        : (h2h.averageGoalsPerMatch > 0 ? Number((Number(h2h.averageGoalsPerMatch) * 0.54).toFixed(2)) : 1.32);
    const preMatchAwayXg = hasGoalAvgs
        ? Number((((Number(awayAnalytics.goalsScoredAvg) || 1.0) + (Number(homeAnalytics.goalsConcededAvg) || 1.1)) / 2).toFixed(2))
        : (h2h.averageGoalsPerMatch > 0 ? Number((Number(h2h.averageGoalsPerMatch) * 0.46).toFixed(2)) : 1.13);
    const preMatchXg = Number((preMatchHomeXg + preMatchAwayXg).toFixed(2));
    const remainingFraction = isLive ? Math.max(0.04, (90 - Math.min(89, liveMinute)) / 90) : 1;
    const remTotalXg = Math.max(0.04, preMatchXg * remainingFraction);
    const remHomeXg = Math.max(0.02, preMatchHomeXg * remainingFraction);
    const remAwayXg = Math.max(0.02, preMatchAwayXg * remainingFraction);
    const expectedGoals = isLive
        ? Number((liveGoalsTotal + preMatchXg * remainingFraction).toFixed(2))
        : preMatchXg;

    const bttsAlreadyHit = isLive && liveScore && Number(liveScore.home) > 0 && Number(liveScore.away) > 0;
    let bttsProbability;
    if (bttsAlreadyHit) {
        bttsProbability = 99;
    } else if (isLive && liveScore && Number.isFinite(Number(liveScore.home)) && Number.isFinite(Number(liveScore.away))) {
        const hSc = Number(liveScore.home);
        const aSc = Number(liveScore.away);
        const pHomeScores = 1 - Math.exp(-remHomeXg);
        const pAwayScores = 1 - Math.exp(-remAwayXg);
        let pBtts;
        if (hSc === 0 && aSc > 0) pBtts = pHomeScores;
        else if (aSc === 0 && hSc > 0) pBtts = pAwayScores;
        else pBtts = pHomeScores * pAwayScores;
        bttsProbability = Math.min(88, Math.max(2, Math.round(pBtts * 100)));
    } else {
        const hBttsComponent = (Number(homeAnalytics.bttsRate) || 0) > 0 ? (Number(homeAnalytics.bttsRate) * 0.35) : ((Number(homeAnalytics.goalsScoredAvg) || 0) > 0.95 ? 28 : 16);
        const aBttsComponent = (Number(awayAnalytics.bttsRate) || 0) > 0 ? (Number(awayAnalytics.bttsRate) * 0.35) : ((Number(awayAnalytics.goalsScoredAvg) || 0) > 0.85 ? 28 : 16);
        const h2hBttsComponent = totalH2h > 0 ? ((Number(h2h.bttsPercentage) || 0) * 0.3) : 18;
        bttsProbability = Math.min(88, Math.max(18, Math.round(hBttsComponent + aBttsComponent + h2hBttsComponent)));
    }

    const over25AlreadyHit = isLive && liveGoalsTotal >= 3;
    let over25Probability;
    if (over25AlreadyHit) {
        over25Probability = 99;
    } else if (isLive && liveScore && Number.isFinite(Number(liveScore.home)) && Number.isFinite(Number(liveScore.away))) {
        const needed = Math.max(1, 3 - liveGoalsTotal);
        let pOver25;
        if (needed === 1) pOver25 = 1 - Math.exp(-remTotalXg);
        else if (needed === 2) pOver25 = 1 - Math.exp(-remTotalXg) * (1 + remTotalXg);
        else pOver25 = 1 - Math.exp(-remTotalXg) * (1 + remTotalXg + (remTotalXg * remTotalXg) / 2);
        over25Probability = Math.min(92, Math.max(2, Math.round(pOver25 * 100)));
    } else {
        over25Probability = Math.min(92, Math.max(12, Math.round(expectedGoals * 24)));
    }

    // Telemetry quality & signal richness score (0-100) for Norra AI model gating
    const hStatKeys = Object.keys(liveStats?.home || {}).length;
    const aStatKeys = Object.keys(liveStats?.away || {}).length;
    const statMetricsCount = Math.max(hStatKeys, aStatKeys);
    const hasStandings = Boolean(homeStanding || awayStanding);
    const hasHomeForm = hMatches >= 3;
    const hasAwayForm = aMatches >= 3;
    const hasH2H = totalH2h >= 2;
    const hasInPlayStats = statMetricsCount >= 4;
    const hasOdds = Array.isArray(odds) && odds.length > 0;

    let qualityScore = 15; // Base fixture metadata
    if (hasHomeForm) qualityScore += 20;
    else if (hMatches > 0) qualityScore += 8;
    if (hasAwayForm) qualityScore += 20;
    else if (aMatches > 0) qualityScore += 8;
    if (hasStandings) qualityScore += 15;
    if (hasH2H) qualityScore += 15;
    if (hasInPlayStats) qualityScore += 15;
    if (hasOdds) qualityScore += 5;
    qualityScore = Math.min(100, qualityScore);

    const qualityTier = qualityScore >= 75 ? 'rich' : (qualityScore >= 45 ? 'moderate' : 'limited');
    const maxProb = Math.max(homeWinProb, awayWinProb, drawProb);
    const confidenceRating = (qualityTier === 'limited' && !isLiveAdjusted)
        ? 'Low Data'
        : (maxProb > 60 && (qualityScore >= 55 || isLiveAdjusted) ? 'High' : (maxProb > 44 ? 'Moderate' : 'Balanced'));

    return {
        norraAiPredictionHints: {
            homeWinProb: homeWinProb,
            drawProb: drawProb,
            awayWinProb: awayWinProb,
            expectedGoals: expectedGoals,
            bttsRecommendation: bttsProbability >= 52 ? 'Yes' : 'No',
            bttsProbability: bttsProbability,
            over25Probability: over25Probability,
            under25Probability: 100 - over25Probability,
            doubleChance: {
                '1X': Number((homeWinProb + drawProb).toFixed(1)),
                '12': Number((homeWinProb + awayWinProb).toFixed(1)),
                'X2': Number((drawProb + awayWinProb).toFixed(1))
            },
            firstTeamToScore: (homeWinProb >= awayWinProb + 12)
                ? homeName
                : ((awayWinProb >= homeWinProb + 12) ? awayName : 'Balanced'),
            confidenceRating: confidenceRating,
            isLiveAdjusted: isLiveAdjusted
        },
        telemetryQuality: {
            score: qualityScore,
            tier: qualityTier,
            hasStandings,
            hasHomeForm,
            hasAwayForm,
            hasH2H,
            hasInPlayStats,
            hasOdds,
            statMetricsCount,
            providersUsed: Array.from(new Set(providersUsed.filter(Boolean)))
        }
    };
}

/**
 * Recompute full team analytics (PPG, goals averages, BTTS/Over rates, clean sheets, streak, venue splits)
 * from a formatted recent-matches array (e.g. ESPN lastFiveGames) so downstream prediction models and UI
 * never receive stale 0 PPG / 0.0 goals averages when ESPN enriches team form.
 */

function isLikelyNationalTeamName(name = '') {
    const raw = String(name || '').trim();
    if (!raw) return false;
    if (/\b(national\s+team|\bnt\b)\b/i.test(raw)) return true;
    // Multi-word club markers → not a national side
    if (/\b(fc|cf|sc|ac|fk|sk|afc|united|city|town|rovers|athletic|sporting|club|calcio|sv|vfb|tsv|bsc|real|inter|ajax|milan)\b/i.test(raw)) return false;
    if (/\d{2}$/.test(raw)) return false; // "Paderborn 07", "Schalke 04"
    const n = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const NATIONALS = new Set([
        'mali','senegal','nigeria','ghana','egypt','morocco','tunisia','algeria','cameroon','ivory coast','cote divoire',
        'south africa','kenya','uganda','zambia','zimbabwe','angola','congo','dr congo','sudan','ethiopia','rwanda',
        'germany','france','spain','italy','england','portugal','netherlands','belgium','croatia','serbia','poland',
        'brazil','argentina','uruguay','chile','colombia','mexico','usa','united states','canada','japan','korea',
        'south korea','australia','china','qatar','saudi arabia','iran','iraq','turkey','turkiye','russia','ukraine',
        'scotland','wales','ireland','northern ireland','sweden','norway','denmark','finland','switzerland','austria',
        'greece','romania','bulgaria','hungary','czech republic','czechia','slovakia','slovenia','albania','bosnia',
        'ecuador','peru','paraguay','bolivia','venezuela','panama','costa rica','honduras','jamaica','haiti'
    ]);
    if (NATIONALS.has(n)) return true;
    // Single-token country-like short names (3-12 letters) with no club prefix are suspicious as club opponents
    if (!/\s/.test(n) && n.length >= 3 && n.length <= 12 && NATIONALS.has(n)) return true;
    return false;
}

function recomputeAnalyticsFromFormattedRecent(formattedList, baseAnalytics = {}) {
    if (!Array.isArray(formattedList) || formattedList.length === 0) return baseAnalytics;

    let wins = 0;
    let draws = 0;
    let losses = 0;
    let scored = 0;
    let conceded = 0;
    let scoredCount = 0;
    let cleanSheets = 0;
    let failedToScore = 0;
    let bttsCount = 0;
    let over15Count = 0;
    let over25Count = 0;
    const homeSplit = { played: 0, wins: 0, draws: 0, losses: 0, scored: 0, conceded: 0, scoredCount: 0 };
    const awaySplit = { played: 0, wins: 0, draws: 0, losses: 0, scored: 0, conceded: 0, scoredCount: 0 };
    const formGuide = [];

    for (const item of formattedList) {
        const resChar = String(item.result || 'D').toUpperCase();
        const result = (resChar === 'W' || resChar === 'L' || resChar === 'D') ? resChar : 'D';
        formGuide.push(result);
        const isAway = item.venue === 'Away' || item.atVs === '@';
        const split = isAway ? awaySplit : homeSplit;
        split.played++;

        if (result === 'W') { wins++; split.wins++; }
        else if (result === 'L') { losses++; split.losses++; }
        else { draws++; split.draws++; }

        const scoreMatch = String(item.score || '').match(/(\d+)\s*[-:]\s*(\d+)/);
        if (scoreMatch) {
            const s1 = parseInt(scoreMatch[1], 10);
            const s2 = parseInt(scoreMatch[2], 10);
            let teamScore = s1;
            let oppScore = s2;
            if (result === 'W') {
                teamScore = Math.max(s1, s2);
                oppScore = Math.min(s1, s2);
            } else if (result === 'L') {
                teamScore = Math.min(s1, s2);
                oppScore = Math.max(s1, s2);
            }
            scored += teamScore;
            conceded += oppScore;
            scoredCount++;
            split.scored += teamScore;
            split.conceded += oppScore;
            split.scoredCount++;
            if (oppScore === 0) cleanSheets++;
            if (teamScore === 0) failedToScore++;
            if (teamScore > 0 && oppScore > 0) bttsCount++;
            if ((teamScore + oppScore) >= 2) over15Count++;
            if ((teamScore + oppScore) >= 3) over25Count++;
        }
    }

    const count = formattedList.length;
    const points = (wins * 3) + draws;
    const goalsScoredAvg = scoredCount > 0 ? Number((scored / scoredCount).toFixed(2)) : (baseAnalytics.goalsScoredAvg ?? 0);
    const goalsConcededAvg = scoredCount > 0 ? Number((conceded / scoredCount).toFixed(2)) : (baseAnalytics.goalsConcededAvg ?? 0);
    const finalizeSplit = (s) => ({
        played: s.played,
        wins: s.wins,
        draws: s.draws,
        losses: s.losses,
        pointsPerGame: s.played > 0 ? Number((((s.wins * 3) + s.draws) / s.played).toFixed(2)) : 0,
        goalsScoredAvg: s.scoredCount > 0 ? Number((s.scored / s.scoredCount).toFixed(2)) : 0,
        goalsConcededAvg: s.scoredCount > 0 ? Number((s.conceded / s.scoredCount).toFixed(2)) : 0
    });

    let recentStreak = '';
    if (formGuide.length > 0) {
        const first = formGuide[0];
        let len = 0;
        for (const r of formGuide) {
            if (r === first) len++;
            else break;
        }
        recentStreak = `${first}${len}`;
    }

    return {
        ...baseAnalytics,
        recentMatches: formattedList,
        matchesAnalyzed: count,
        formGuide,
        formString: formGuide.join('-'),
        wins,
        draws,
        losses,
        pointsPerGame: Number((points / count).toFixed(2)),
        winRate: Number(((wins / count) * 100).toFixed(1)),
        goalsScoredAvg,
        goalsConcededAvg,
        goalDiffAvg: Number((goalsScoredAvg - goalsConcededAvg).toFixed(2)),
        cleanSheetRate: scoredCount > 0 ? Number(((cleanSheets / scoredCount) * 100).toFixed(1)) : (baseAnalytics.cleanSheetRate ?? 0),
        failedToScoreRate: scoredCount > 0 ? Number(((failedToScore / scoredCount) * 100).toFixed(1)) : (baseAnalytics.failedToScoreRate ?? 0),
        bttsRate: scoredCount > 0 ? Number(((bttsCount / scoredCount) * 100).toFixed(1)) : (baseAnalytics.bttsRate ?? 0),
        over15Rate: scoredCount > 0 ? Number(((over15Count / scoredCount) * 100).toFixed(1)) : (baseAnalytics.over15Rate ?? 0),
        over25Rate: scoredCount > 0 ? Number(((over25Count / scoredCount) * 100).toFixed(1)) : (baseAnalytics.over25Rate ?? 0),
        recentStreak,
        homeVenueSplit: finalizeSplit(homeSplit),
        awayVenueSplit: finalizeSplit(awaySplit)
    };
}

router.get('/predictions-context/:eventId', optionalApiKeyAuth, async (req, res) => {
    if (!requireFeature(req, res, 'predictions', 'Predictions context')) return;
    try {
        const eventId = String(req.params.eventId).trim();
        const isMongoId = /^[0-9a-fA-F]{24}$/.test(eventId);
        let match = await SoccerMatch.findOne({
            $or: [
                { 'source.event_id': eventId },
                { 'source.competition_id': eventId },
                { 'source.livescore_id': eventId },
                { 'source.espn_id': eventId },
                ...(isMongoId ? [{ _id: eventId }] : [])
            ]
        }).lean();

        if (!match) {
            // Fallback 1: in-memory live matches cache
            if (Array.isArray(liveFeedMemoryCache?.matches) && liveFeedMemoryCache.matches.length > 0) {
                const found = liveFeedMemoryCache.matches.find(m =>
                    String(m.id || m.source?.event_id || m.source?.livescore_id) === eventId
                );
                if (found) {
                    match = {
                        _id: found._id || eventId,
                        source: found.source || { event_id: eventId, provider: 'livescore' },
                        league_slug: found.league_slug || found.league?.slug || 'intl.friendly',
                        home: found.home || { name: 'Home', display_name: 'Home' },
                        away: found.away || { name: 'Away', display_name: 'Away' },
                        date: found.date ? new Date(found.date) : new Date(),
                        name: found.name || `${found.home?.name || 'Home'} vs ${found.away?.name || 'Away'}`
                    };
                }
            }
        }

        if (!match && req.query.home && req.query.away) {
            const qHome = String(req.query.home).trim();
            const qAway = String(req.query.away).trim();
            const qLeague = String(req.query.league || 'intl.friendly').trim();
            match = {
                _id: eventId,
                source: { event_id: eventId, provider: 'live' },
                league_slug: qLeague,
                home: { name: qHome, display_name: qHome, source_id: qHome.toLowerCase().replace(/[^a-z0-9]/g, '-') },
                away: { name: qAway, display_name: qAway, source_id: qAway.toLowerCase().replace(/[^a-z0-9]/g, '-') },
                date: new Date(),
                name: `${qHome} vs ${qAway}`
            };
        }

        if (!match) {
            return res.status(404).json({ error: 'Match not found for ID: ' + eventId });
        }

        // Overlay freshest live in-play score/clock from memory cache so Norra AI never receives stale DB 0-0 / pre state
        if (Array.isArray(liveFeedMemoryCache?.matches) && liveFeedMemoryCache.matches.length > 0) {
            const mId = String(match.source?.event_id || eventId);
            const mLsId = String(match.source?.livescore_id || '');
            const mH = normalizeTeamName(match.home?.display_name || match.home?.name || '');
            const mA = normalizeTeamName(match.away?.display_name || match.away?.name || '');
            const mTier = getMatchTier(match.home?.display_name || match.home?.name || '', match.away?.display_name || match.away?.name || '', match.league_slug || '');
            const liveHit = liveFeedMemoryCache.matches.find(lm => {
                const lid = String(lm.id || lm.source?.event_id || '');
                const lls = String(lm.source?.livescore_id || '');
                if ((lid && (lid === mId || (mLsId && lid === mLsId))) || (lls && (lls === mId || (mLsId && lls === mLsId)))) return true;
                if (mH && mA) {
                    const lh = normalizeTeamName(lm.home?.displayName || lm.home?.name || '');
                    const la = normalizeTeamName(lm.away?.displayName || lm.away?.name || '');
                    const lTier = getMatchTier(lm.home?.displayName || lm.home?.name || '', lm.away?.displayName || lm.away?.name || '', lm.league?.slug || lm.league_slug || '');
                    return lh === mH && la === mA && lTier === mTier;
                }
                return false;
            });
            if (liveHit && (liveHit.status?.isLive || liveHit.status?.state === 'in')) {
                match = {
                    ...match,
                    status: {
                        ...(match.status || {}),
                        ...(liveHit.status || {}),
                        state: 'in',
                        isLive: true,
                        completed: false
                    },
                    home: {
                        ...(match.home || {}),
                        score: liveHit.home?.score ?? match.home?.score
                    },
                    away: {
                        ...(match.away || {}),
                        score: liveHit.away?.score ?? match.away?.score
                    }
                };
            }
        }

        const targetEspnId = await resolveMatchEspnId(match, eventId);

        const homeId = String(match.home?.source_id || '');
        const awayId = String(match.away?.source_id || '');
        const leagueSlug = match.league_slug;

        const hName = (match.home?.name || match.home?.display_name || '').trim();
        const aName = (match.away?.name || match.away?.display_name || '').trim();
        const isWomenMatch = String(leagueSlug || '').includes('.w.') || /\b(w|women|woman|ladies|femenil|frauen|\(w\))\b/i.test(`${hName} ${aName} ${match.note || ''}`);
        const hRegex = makeFlexibleTeamRegex(hName, isWomenMatch);
        const aRegex = makeFlexibleTeamRegex(aName, isWomenMatch);

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

        const genderFilter = isWomenMatch
            ? {
                $or: [
                    { league_slug: { $regex: /\.w\./i } },
                    { note: { $regex: /women|femenil|frauen|arkema|liga f|wsl|nwsl/i } },
                    { name: { $regex: /\b(w|women|woman|ladies|femenil|frauen|\(w\))\b/i } }
                ]
            }
            : {
                league_slug: { $not: { $regex: /\.w\./i } }
            };

        const isCurrentMatchFinished = match.status?.state === 'post' ||
            Boolean(match.status?.completed) ||
            /STATUS_FINAL|STATUS_FULL_TIME|FT|Final/i.test(String(match.status?.name || match.status?.clock || match.status?.detail || ''));

        const finishedFilter = {
            $or: [
                { 'status.state': { $in: ['post', 'final', 'completed'] } },
                { 'status.completed': true },
                { 'status.name': { $in: ['STATUS_FINAL', 'STATUS_FULL_TIME', 'STATUS_AFTER_ET', 'STATUS_AFTER_PK', 'FT', 'AET', 'AP'] } },
                { 'status.clock': { $in: ['FT', 'Final', 'AET', 'AP'] } },
                { 'status.detail': { $in: ['FT', 'Final', 'Full Time', 'AET', 'AP'] } },
                { date: { $lt: new Date(Date.now() - 3 * 3600 * 1000) } }
            ]
        };

        const excludeCurrentMatch = {
            _id: { $ne: match._id },
            ...(match.source?.event_id ? { 'source.event_id': { $ne: match.source.event_id } } : {}),
            ...(eventId ? { 'source.event_id': { $ne: eventId } } : {})
        };

        const h2hExcludeFilter = isCurrentMatchFinished ? {} : excludeCurrentMatch;

        // Run parallel queries: H2H, Home Recent Form, Away Recent Form, Standings
        let [h2hMatches, homeRecentMatches, awayRecentMatches, standingsGroup, leagueDoc] = await Promise.all([
            // H2H past meetings - fetch complete lifetime encounters without artificial cap
            h2hOrClauses.length ? SoccerMatch.find({
                $and: [
                    { $or: h2hOrClauses },
                    finishedFilter,
                    h2hExcludeFilter,
                    genderFilter
                ]
            }).sort({ date: -1 }).limit(500).lean() : Promise.resolve([]),

            // Home team last 12 matches
            homeNameOrId.length ? SoccerMatch.find({
                $and: [
                    { $or: homeNameOrId },
                    finishedFilter,
                    excludeCurrentMatch,
                    genderFilter
                ]
            }).sort({ date: -1 }).limit(16).lean() : Promise.resolve([]),

            // Away team last 12 matches
            awayNameOrId.length ? SoccerMatch.find({
                $and: [
                    { $or: awayNameOrId },
                    finishedFilter,
                    excludeCurrentMatch,
                    genderFilter
                ]
            }).sort({ date: -1 }).limit(16).lean() : Promise.resolve([]),

            // League standings
            SoccerStanding.findOne({ league_slug: leagueSlug }).sort({ season_year: -1 }).lean(),

            // League definition
            SoccerLeague.findOne({ slug: leagueSlug }).lean()
        ]);

        function extractSignificantToken(name) {
            if (!name) return '';
            const cleaned = String(name)
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/\b(fc|cf|sc|ac|cd|afc|fk|sk|sv|ssc|as|rc|ud|rb|cs|csd|sporting|club|clube|real|deportivo|calcio|st|saint)\b/gi, ' ')
                .replace(/\s+/g, ' ')
                .trim();
            const tokens = cleaned.split(' ').filter(t => t.length >= 4);
            if (tokens.length > 0) return tokens[0];
            if (cleaned.length >= 3) return cleaned;
            return '';
        }

        const hToken = extractSignificantToken(hName);
        const aToken = extractSignificantToken(aName);

        // Fallback: looser name contains match when strict H2H query returned nothing
        // Only run loose query if BOTH teams have a distinctive token and tokens are NOT identical (avoiding city-rival / intra-club collision)
        if ((!h2hMatches || h2hMatches.length < 8) && hToken && aToken && hToken.length >= 4 && aToken.length >= 4 && hToken.toLowerCase() !== aToken.toLowerCase()) {
            try {
                const hEsc = hToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const aEsc = aToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const hRegexLoose = new RegExp('\\b' + hEsc, 'i');
                const aRegexLoose = new RegExp('\\b' + aEsc, 'i');

                const loose = await SoccerMatch.find({
                    $and: [
                        finishedFilter,
                        excludeCurrentMatch,
                        genderFilter,
                        { league_slug: { $not: { $regex: /youth|\.u\d+/i } } },
                        {
                            $or: [
                                {
                                    $and: [
                                        { $or: [{ 'home.name': hRegexLoose }, { 'home.display_name': hRegexLoose }] },
                                        { $or: [{ 'away.name': aRegexLoose }, { 'away.display_name': aRegexLoose }] }
                                    ]
                                },
                                {
                                    $and: [
                                        { $or: [{ 'home.name': aRegexLoose }, { 'home.display_name': aRegexLoose }] },
                                        { $or: [{ 'away.name': hRegexLoose }, { 'away.display_name': hRegexLoose }] }
                                    ]
                                }
                            ]
                        }
                    ]
                }).sort({ date: -1 }).limit(500).lean();
                if (loose?.length) {
                    // Merge loose hits into primary set (drop self-play and senior vs youth of same club)
                    const seen = new Set((h2hMatches || []).map(m => String(m.source?.event_id || m._id)));
                    for (const m of loose) {
                        const id = String(m.source?.event_id || m._id);
                        const lH = normalizeTeamName(m.home?.name || m.home?.display_name || '');
                        const lA = normalizeTeamName(m.away?.name || m.away?.display_name || '');
                        if (!lH || !lA || lH === lA) continue;
                        if (!seen.has(id)) { h2hMatches.push(m); seen.add(id); }
                    }
                }
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

        // Enrich with multi-provider H2H aggregator (SportScore + TheSportsDB canonical delegation)
        const curHName = match.home?.displayName || match.home?.name || '';
        const curAName = match.away?.displayName || match.away?.name || '';
        if (h2hMap.size < 8 && curHName && curAName) {
            try {
                const { fetchAggregatedH2H } = require('../services/h2hAggregatorService');
                const ssData = await fetchAggregatedH2H({ homeName: curHName, awayName: curAName });
                if (ssData?.matches && Array.isArray(ssData.matches) && ssData.matches.length > 0) {
                    for (const sm of ssData.matches) {
                        const smId = sm.url || `${sm.home}_vs_${sm.away}_${sm.time}`;
                        if (!h2hMap.has(smId)) {
                            const smHScore = Number(sm.home_score || 0);
                            const smAScore = Number(sm.away_score || 0);
                            const smHName = sm.home || 'Home';
                            const smAName = sm.away || 'Away';
                            const smWinner = smHScore === smAScore ? 'Draw' : (smHScore > smAScore ? smHName : smAName);
                            const isHomeTeamOrig = normalizeTeamName(smHName) === normalizeTeamName(curHName);
                            h2hMap.set(smId, {
                                id: smId,
                                date: sm.time || new Date().toISOString(),
                                homeTeam: smHName,
                                awayTeam: smAName,
                                homeLogo: sm.home_logo || '',
                                awayLogo: sm.away_logo || '',
                                score: `${smHScore} - ${smAScore}`,
                                winner: smWinner,
                                homeScore: smHScore,
                                awayScore: smAScore,
                                isHomeOriginal: isHomeTeamOrig,
                                competition: sm.competition || 'League',
                                source: 'sportscore'
                            });
                        }
                    }
                    if (ssData.summary?.meetings && !parsedSeriesTotal) {
                        parsedSeriesTotal = ssData.summary.meetings;
                    }
                }
            } catch (ssErr) {
                console.warn('SportScore H2H enrichment failed:', ssErr.message);
            }
        }

        // If the current match is finished, ensure it is included in the lifetime H2H record
        if (isCurrentMatchFinished) {
            const mKey = String(match.source?.event_id || match._id || eventId);
            if (!h2hMap.has(mKey)) {
                const curHScore = Number(match.home?.score ?? match.home?.scoreValue);
                const curAScore = Number(match.away?.score ?? match.away?.scoreValue);
                if (!isNaN(curHScore) && !isNaN(curAScore)) {
                    const winner = curHScore === curAScore ? 'Draw' : (curHScore > curAScore ? (curHName || 'Home') : (curAName || 'Away'));
                    h2hMap.set(mKey, {
                        id: mKey,
                        date: match.date ? new Date(match.date).toISOString() : new Date().toISOString(),
                        homeTeam: curHName || 'Home',
                        awayTeam: curAName || 'Away',
                        homeLogo: match.home?.logo || '',
                        awayLogo: match.away?.logo || '',
                        score: `${curHScore} - ${curAScore}`,
                        winner,
                        homeScore: curHScore,
                        awayScore: curAScore,
                        isHomeOriginal: true,
                        competition: match.note || leagueDoc?.name || 'League',
                        source: 'current'
                    });
                }
            }
        }

        // Compute Lifetime H2H statistics across all deduplicated historical encounters
        const allLifetimeH2h = Array.from(h2hMap.values())
            .filter(m => {
                const isThisMatch = String(m.id) === String(eventId) || String(m.id) === String(match.source?.event_id) || String(m.id) === String(match._id);
                if (isThisMatch && !isCurrentMatchFinished) return false;
                if (!isThisMatch && match.date && m.date) {
                    const timeDiff = Math.abs(new Date(m.date).getTime() - new Date(match.date).getTime());
                    if (timeDiff < 2 * 3600 * 1000 && !isCurrentMatchFinished) return false;
                }
                const h = normalizeTeamName(m.homeTeam || '');
                const a = normalizeTeamName(m.awayTeam || '');
                if (!h || !a || h === a) return false; // Exclude self-play

                // Exclude senior vs youth/reserves collisions of the same club
                const rawH = String(m.homeTeam || '').toLowerCase();
                const rawA = String(m.awayTeam || '').toLowerCase();
                const youthRe = /\b(u[-_]?\s*(?:15|16|17|18|19|20|21|23)|youth|academy|reserves?|primavera|sub[-_]?\d+)\b/i;
                if ((youthRe.test(rawH) && rawH.includes(a)) || (youthRe.test(rawA) && rawA.includes(h))) {
                    return false;
                }
                return true;
            })
            .sort((a, b) => new Date(b.date) - new Date(a.date));

        // Collapse duplicate historical rows (same day + same pair + same score from multi-source ingest)
        {
            const seen = new Set();
            const deduped = [];
            for (const m of allLifetimeH2h) {
                const d = m.date ? new Date(m.date).toISOString().slice(0, 10) : '';
                const h = normalizeTeamName(m.homeTeam || '');
                const a = normalizeTeamName(m.awayTeam || '');
                const sc = `${m.homeScore ?? m.home?.score ?? ''}-${m.awayScore ?? m.away?.score ?? ''}`;
                const key = `${[h, a].sort().join('_vs_')}_${d}_${sc}`;
                if (seen.has(key)) continue;
                seen.add(key);
                deduped.push(m);
            }
            allLifetimeH2h.length = 0;
            deduped.forEach(m => allLifetimeH2h.push(m));
        }

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

        // Enrich missing Last-5 team form from SportScore aggregator when local DB has < 5 finished games
        if ((homeRecentMatches.length < 5 || awayRecentMatches.length < 5) && curHName && curAName) {
            try {
                const [ssHomeForm, ssAwayForm] = await Promise.all([
                    homeRecentMatches.length < 5 ? fetchSportScoreTeamRecentMatches(curHName).catch(() => []) : Promise.resolve([]),
                    awayRecentMatches.length < 5 ? fetchSportScoreTeamRecentMatches(curAName).catch(() => []) : Promise.resolve([])
                ]);
                if (ssHomeForm.length) homeRecentMatches = [...homeRecentMatches, ...ssHomeForm];
                if (ssAwayForm.length) awayRecentMatches = [...awayRecentMatches, ...ssAwayForm];
            } catch (_) {}
        }

        // Recent encounters — show deeper history for accurate WDW form
        const recentH2hMeetings = allLifetimeH2h; // full available history for UI + API consumers

        function deduplicateRecentMatches(matchesList, teamId, targetTeamName) {
            const seen = new Set();
            const seenDays = new Set();
            const result = [];
            const isTargetYouth = /\b(u[-_]?\s*(?:15|16|17|18|19|20|21|23)|youth|academy|reserves?|primavera)\b/i.test(targetTeamName);
            const isTargetWomen = /\b(w|women|woman|ladies|femenil|frauen|\(w\))\b|\s+w$/i.test(targetTeamName);

            for (const m of (matchesList || [])) {
                const curH = m.home?.display_name || m.home?.name || '';
                const curA = m.away?.display_name || m.away?.name || '';
                const hNorm = normalizeTeamName(curH);
                const aNorm = normalizeTeamName(curA);
                if (!hNorm || !aNorm || hNorm === aNorm) continue; // Drop corrupted self-play matches

                const mIsYouth = /\b(u[-_]?\s*(?:15|16|17|18|19|20|21|23)|youth|academy|reserves?|primavera|sub[-_]?\d+)\b/i.test(`${curH} ${curA} ${m.note || ''}`) ||
                    /youth|\.u\d+/i.test(String(m.league_slug || ''));
                if (!isTargetYouth && mIsYouth) continue; // Exclude youth matches from senior form

                const isHome = (teamId && String(m.home?.source_id) === teamId) || areTeamNamesMatching(curH, targetTeamName);
                const isAway = (teamId && String(m.away?.source_id) === teamId) || areTeamNamesMatching(curA, targetTeamName);
                if (!isHome && !isAway) continue;
                if (isHome && isAway) continue; // Same team on both sides

                const opp = isHome ? curA : curH;
                const oppNorm = normalizeTeamName(opp);
                if (!oppNorm || oppNorm === normalizeTeamName(targetTeamName)) continue;

                // Drop matches against own youth or reserve team
                const rawOpp = String(opp).toLowerCase();
                const rawTarget = String(targetTeamName).toLowerCase();
                if ((rawOpp.includes(rawTarget) || rawTarget.includes(rawOpp)) && mIsYouth) continue;

                const oppIsYouth = /\b(u[-_]?\s*(?:15|16|17|18|19|20|21|23)|youth|academy|reserves?|primavera)\b/i.test(opp) || String(m.league_slug || '').includes('youth') || String(m.league_slug || '').includes('.u');
                if (!isTargetYouth && oppIsYouth) continue; // Exclude youth matches from senior form

                const oppIsWomen = String(m.league_slug || '').includes('.w.') || /\b(w|women|woman|ladies|femenil|frauen|\(w\))\b/i.test(opp);
                if (isTargetWomen !== oppIsWomen) continue;

                // Exclude national teams from club form (e.g. Paderborn vs "Mali")
                const targetLooksClub = /\b(fc|cf|sc|ac|fk|sk|afc|united|city|town|rovers|athletic|sporting|club|calcio|sv|vfb|tsv|bsc|07|04|190[0-9]|18\d{2}|19\d{2})\b/i.test(String(targetTeamName || ''))
                    || /\d{2}$/.test(String(targetTeamName || '').trim());
                const oppIsNational = isLikelyNationalTeamName(opp) || String(m.league_slug || '').startsWith('fifa.') || /world\s*cup|afcon|nations\s*league|international\s*friendly/i.test(String(m.league_name || m.league_slug || m.note || ''));
                if (targetLooksClub && oppIsNational) continue;

                const day = m.date ? new Date(m.date).toISOString().slice(0, 10) : '';
                const key = `${day}_${oppNorm}`;
                if (key && seen.has(key)) continue;
                if (day && seenDays.has(day)) continue; // A team never plays two competitive fixtures on the same date
                if (key) seen.add(key);
                if (day) seenDays.add(day);
                result.push({ match: m, isHome, oppName: opp });
            }
            return result;
        }

        // Process team form guide helper (enriched with PPG, BTTS, Over 2.5, FTS, streak & Home/Away splits)
        function extractTeamForm(matchesList, teamId, targetTeamName) {
            let wins = 0;
            let losses = 0;
            let draws = 0;
            let scored = 0;
            let conceded = 0;
            let cleanSheets = 0;
            let failedToScore = 0;
            let bttsCount = 0;
            let over15Count = 0;
            let over25Count = 0;
            const homeSplit = { played: 0, wins: 0, draws: 0, losses: 0, scored: 0, conceded: 0 };
            const awaySplit = { played: 0, wins: 0, draws: 0, losses: 0, scored: 0, conceded: 0 };
            const formGuide = [];

            const dedupedEntries = deduplicateRecentMatches(matchesList, teamId, targetTeamName);

            const formattedRecent = dedupedEntries.slice(0, 10).map(({ match: m, isHome, oppName }) => {
                const teamScore = Number(isHome ? m.home?.score : m.away?.score) || 0;
                const oppScore = Number(isHome ? m.away?.score : m.home?.score) || 0;
                scored += teamScore;
                conceded += oppScore;
                if (oppScore === 0) cleanSheets++;
                if (teamScore === 0) failedToScore++;
                if (teamScore > 0 && oppScore > 0) bttsCount++;
                if ((teamScore + oppScore) >= 2) over15Count++;
                if ((teamScore + oppScore) >= 3) over25Count++;

                const split = isHome ? homeSplit : awaySplit;
                split.played++;
                split.scored += teamScore;
                split.conceded += oppScore;

                let result = 'D';
                if (teamScore > oppScore) {
                    result = 'W';
                    wins++;
                    split.wins++;
                } else if (teamScore < oppScore) {
                    result = 'L';
                    losses++;
                    split.losses++;
                } else {
                    draws++;
                    split.draws++;
                }
                formGuide.push(result);

                return {
                    id: m.source?.event_id,
                    date: m.date,
                    opponent: oppName,
                    venue: isHome ? 'Home' : 'Away',
                    score: `${teamScore} - ${oppScore}`,
                    result
                };
            });

            const count = formattedRecent.length;
            const points = (wins * 3) + draws;
            const goalsScoredAvg = count > 0 ? Number((scored / count).toFixed(2)) : 0;
            const goalsConcededAvg = count > 0 ? Number((conceded / count).toFixed(2)) : 0;
            const finalizeSplit = (s) => ({
                played: s.played,
                wins: s.wins,
                draws: s.draws,
                losses: s.losses,
                pointsPerGame: s.played > 0 ? Number((((s.wins * 3) + s.draws) / s.played).toFixed(2)) : 0,
                goalsScoredAvg: s.played > 0 ? Number((s.scored / s.played).toFixed(2)) : 0,
                goalsConcededAvg: s.played > 0 ? Number((s.conceded / s.played).toFixed(2)) : 0
            });
            let recentStreak = '';
            if (formGuide.length > 0) {
                const first = formGuide[0];
                let len = 0;
                for (const r of formGuide) {
                    if (r === first) len++;
                    else break;
                }
                recentStreak = `${first}${len}`;
            }

            return {
                formString: formGuide.join('-'),
                formGuide,
                matchesAnalyzed: count,
                wins,
                draws,
                losses,
                pointsPerGame: count > 0 ? Number((points / count).toFixed(2)) : 0,
                winRate: count > 0 ? Number(((wins / count) * 100).toFixed(1)) : 0,
                goalsScoredAvg,
                goalsConcededAvg,
                goalDiffAvg: Number((goalsScoredAvg - goalsConcededAvg).toFixed(2)),
                cleanSheetRate: count > 0 ? Number(((cleanSheets / count) * 100).toFixed(1)) : 0,
                failedToScoreRate: count > 0 ? Number(((failedToScore / count) * 100).toFixed(1)) : 0,
                bttsRate: count > 0 ? Number(((bttsCount / count) * 100).toFixed(1)) : 0,
                over15Rate: count > 0 ? Number(((over15Count / count) * 100).toFixed(1)) : 0,
                over25Rate: count > 0 ? Number(((over25Count / count) * 100).toFixed(1)) : 0,
                recentStreak,
                homeVenueSplit: finalizeSplit(homeSplit),
                awayVenueSplit: finalizeSplit(awaySplit),
                recentMatches: formattedRecent
            };
        }

        let homeAnalytics = extractTeamForm(homeRecentMatches, homeId, hName);
        let awayAnalytics = extractTeamForm(awayRecentMatches, awayId, aName);
        const providersUsed = [];
        if (match.source?.provider) providersUsed.push(match.source.provider);
        if (espnSummary) providersUsed.push('espn');

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

            const dedupL5 = (evList, targetName) => {
                const seen = new Set();
                const seenDays = new Set();
                const out = [];
                const isTargetYouth = /\b(u[-_]?\s*(?:15|16|17|18|19|20|21|23)|youth|academy|reserves?|primavera)\b/i.test(targetName);
                const normTarget = String(targetName || '').toLowerCase().replace(/[^a-z0-9]/g, '');

                for (const ev of (evList || [])) {
                    const oppName = String(ev.opponent?.displayName || ev.opponent?.name || '').trim();
                    const normOpp = oppName.toLowerCase().replace(/[^a-z0-9]/g, '');
                    if (!normOpp) continue;
                    if (normTarget && (normOpp === normTarget || (normTarget.length >= 5 && normOpp.includes(normTarget)) || (normOpp.length >= 5 && normTarget.includes(normOpp)))) continue;

                    const oppIsYouth = /\b(u[-_]?\s*(?:15|16|17|18|19|20|21|23)|youth|academy|reserves?|primavera)\b/i.test(oppName);
                    if (!isTargetYouth && oppIsYouth) continue;

                    const day = ev.gameDate ? String(ev.gameDate).slice(0, 10) : (ev.date ? String(ev.date).slice(0, 10) : '');
                    const key = `${day}_${normOpp}`;
                    if (key && seen.has(key)) continue;
                    if (day && seenDays.has(day)) continue;

                    if (key) seen.add(key);
                    if (day) seenDays.add(day);
                    out.push(ev);
                }
                return out;
            };

            if (hL5?.events?.length) {
                const formattedL5 = dedupL5(hL5.events, hName).map(ev => ({
                    id: String(ev.id),
                    date: ev.gameDate || ev.date || '',
                    opponent: ev.opponent?.displayName || 'Opponent',
                    opponentLogo: ev.opponentLogo || ev.opponent?.logo || '',
                    venue: ev.atVs === '@' ? 'Away' : 'Home',
                    atVs: ev.atVs || 'vs',
                    score: ev.score,
                    result: ev.gameResult || 'D',
                    competition: ev.leagueName || ev.competitionName || ''
                }));
                if (formattedL5.length > 0) {
                    homeAnalytics = recomputeAnalyticsFromFormattedRecent(formattedL5, homeAnalytics);
                }
            }

            if (aL5?.events?.length) {
                const formattedL5 = dedupL5(aL5.events, aName).map(ev => ({
                    id: String(ev.id),
                    date: ev.gameDate || ev.date || '',
                    opponent: ev.opponent?.displayName || 'Opponent',
                    opponentLogo: ev.opponentLogo || ev.opponent?.logo || '',
                    venue: ev.atVs === '@' ? 'Away' : 'Home',
                    atVs: ev.atVs || 'vs',
                    score: ev.score,
                    result: ev.gameResult || 'D',
                    competition: ev.leagueName || ev.competitionName || ''
                }));
                if (formattedL5.length > 0) {
                    awayAnalytics = recomputeAnalyticsFromFormattedRecent(formattedL5, awayAnalytics);
                }
            }
        }

        // Multi-provider recent form enrichment (SportScore) when DB + ESPN yielded fewer than 5 recent matches
        // Crucial for Turkish Süper Lig, Turkish Cup, African, Asian, South American & domestic cup competitions
        if ((homeAnalytics.matchesAnalyzed < 5 && hName) || (awayAnalytics.matchesAnalyzed < 5 && aName)) {
            try {
                const withTimeout = (p, ms = 3500) => Promise.race([p, new Promise(r => setTimeout(() => r([]), ms))]);
                const [ssHomeRec, ssAwayRec] = await Promise.all([
                    (homeAnalytics.matchesAnalyzed < 5 && hName) ? withTimeout(fetchSportScoreTeamRecentMatches(hName)) : Promise.resolve([]),
                    (awayAnalytics.matchesAnalyzed < 5 && aName) ? withTimeout(fetchSportScoreTeamRecentMatches(aName)) : Promise.resolve([])
                ]);
                if (Array.isArray(ssHomeRec) && ssHomeRec.length > 0) {
                    const mergedHome = [...(homeRecentMatches || []), ...ssHomeRec];
                    const enrichedH = extractTeamForm(mergedHome, homeId, hName);
                    if (enrichedH.matchesAnalyzed > homeAnalytics.matchesAnalyzed) {
                        homeAnalytics = enrichedH;
                        providersUsed.push('sportscore');
                    }
                }
                if (Array.isArray(ssAwayRec) && ssAwayRec.length > 0) {
                    const mergedAway = [...(awayRecentMatches || []), ...ssAwayRec];
                    const enrichedA = extractTeamForm(mergedAway, awayId, aName);
                    if (enrichedA.matchesAnalyzed > awayAnalytics.matchesAnalyzed) {
                        awayAnalytics = enrichedA;
                        providersUsed.push('sportscore');
                    }
                }
            } catch (_) {}
        }

        // Fallback to match document form string if fewer than 3 matches recorded locally
        const applyFormStringFallback = (analytics, rawForm) => {
            if (analytics.formGuide.length >= 3 || !rawForm) return analytics;
            const formLetters = String(rawForm).replace(/[^WDLwdl]/g, '').toUpperCase().split('');
            if (formLetters.length === 0) return analytics;
            const wins = formLetters.filter(c => c === 'W').length;
            const draws = formLetters.filter(c => c === 'D').length;
            const losses = formLetters.filter(c => c === 'L').length;
            let streakLen = 0;
            for (const c of formLetters) {
                if (c === formLetters[0]) streakLen++;
                else break;
            }
            return {
                ...analytics,
                formGuide: formLetters,
                formString: formLetters.join('-'),
                matchesAnalyzed: Math.max(analytics.matchesAnalyzed, formLetters.length),
                wins,
                draws,
                losses,
                pointsPerGame: Number((((wins * 3) + draws) / formLetters.length).toFixed(2)),
                winRate: Number(((wins / formLetters.length) * 100).toFixed(1)),
                recentStreak: `${formLetters[0]}${streakLen}`
            };
        };
        homeAnalytics = applyFormStringFallback(homeAnalytics, match.home?.form);
        awayAnalytics = applyFormStringFallback(awayAnalytics, match.away?.form);

        // Standing comparison (matches by source_id first, then flexible team name fallback + already-fetched ESPN standings — ZERO extra polling!)
        let homeStanding = null;
        let awayStanding = null;
        if (standingsGroup && Array.isArray(standingsGroup.entries)) {
            const findStanding = (id, teamName) => {
                if (id) {
                    const byId = standingsGroup.entries.find(e => String(e.club?.source_id) === String(id));
                    if (byId) return byId;
                }
                if (teamName) {
                    return standingsGroup.entries.find(e => {
                        const cName = e.club?.display_name || e.club?.name || e.club?.short_name || '';
                        return cName && areTeamNamesMatching(cName, teamName);
                    });
                }
                return null;
            };
            const hEntry = findStanding(homeId, hName);
            const aEntry = findStanding(awayId, aName);

            const extractStat = (entry, key) => entry?.stats?.get ? entry.stats.get(key) : entry?.stats?.[key] ?? null;
            // League-wide matchday ≈ max games played in the group (fallback: this team's GP)
            let leagueMatchday = null;
            try {
                const gps = standingsGroup.entries.map(e => {
                    const v = extractStat(e, 'gamesPlayed');
                    return v != null ? Number(v) : null;
                }).filter(v => Number.isFinite(v));
                if (gps.length) leagueMatchday = Math.max(...gps);
            } catch (_) {}
            if (standingsGroup.season?.type?.abbreviation && /MD|GW|WK/i.test(String(standingsGroup.season.type.abbreviation))) {
                /* keep numeric max */
            }
            const packStanding = (entry) => {
                const played = extractStat(entry, 'gamesPlayed');
                const playedN = played != null ? Number(played) : null;
                return {
                    rank: entry.rank,
                    points: extractStat(entry, 'points'),
                    played: playedN,
                    goalDifferential: extractStat(entry, 'pointDifferential') ?? extractStat(entry, 'goalDifferential'),
                    matchday: leagueMatchday != null ? leagueMatchday : playedN,
                    matchweek: leagueMatchday != null ? leagueMatchday : playedN,
                    gamesPlayed: playedN
                };
            };
            if (hEntry) homeStanding = packStanding(hEntry);
            if (aEntry) awayStanding = packStanding(aEntry);
        }
        // Fallback: extract table position from already-fetched ESPN summary standings (zero extra HTTP calls)
        if ((!homeStanding || !awayStanding) && espnSummary?.standings?.groups?.length) {
            const espnEntries = [];
            for (const g of espnSummary.standings.groups) {
                const list = g?.standings?.entries || [];
                for (let idx = 0; idx < list.length; idx++) {
                    espnEntries.push({ entry: list[idx], fallbackRank: idx + 1 });
                }
            }
            const pickFromEspn = (teamName) => {
                if (!teamName) return null;
                const found = espnEntries.find(({ entry }) => {
                    const n = entry?.team?.displayName || entry?.team?.name || entry?.team?.shortDisplayName || '';
                    return n && areTeamNamesMatching(n, teamName);
                });
                if (!found) return null;
                const statsArr = Array.isArray(found.entry?.stats) ? found.entry.stats : [];
                const getS = (name) => {
                    const st = statsArr.find(s => s.name === name || s.type === name || s.abbreviation === name);
                    return st?.value ?? st?.displayValue ?? null;
                };
                const played = getS('gamesPlayed') != null ? Number(getS('gamesPlayed')) : null;
                return {
                    rank: Number(getS('rank') || found.fallbackRank),
                    points: getS('points') != null ? Number(getS('points')) : null,
                    played,
                    gamesPlayed: played,
                    matchday: played,
                    matchweek: played,
                    goalDifferential: getS('pointDifferential') != null ? Number(getS('pointDifferential')) : null
                };
            };
            if (!homeStanding) homeStanding = pickFromEspn(hName);
            if (!awayStanding) awayStanding = pickFromEspn(aName);
            // Align MD to league max GP when both sides known
            try {
                const mds = [homeStanding?.matchday, awayStanding?.matchday, homeStanding?.played, awayStanding?.played]
                    .map(Number).filter(n => Number.isFinite(n));
                if (mds.length) {
                    const md = Math.max(...mds);
                    if (homeStanding) { homeStanding.matchday = md; homeStanding.matchweek = md; }
                    if (awayStanding) { awayStanding.matchday = md; awayStanding.matchweek = md; }
                }
            } catch (_) {}
        }

        // Hydrate multi-provider in-play / full-time match stats (ESPN -> DB -> LiveScore -> SportScore)
        const isLiveOrPost = match.status?.state === 'in' || match.status?.state === 'post' || Boolean(match.status?.isLive) || Boolean(match.status?.completed);
        let hydratedHomeStats = match.home?.stats instanceof Map ? Object.fromEntries(match.home.stats) : { ...(match.home?.stats || {}) };
        let hydratedAwayStats = match.away?.stats instanceof Map ? Object.fromEntries(match.away.stats) : { ...(match.away?.stats || {}) };

        if (espnSummary?.boxscore?.teams?.length) {
            const eH = extractBoxscoreStatsMap(espnSummary.boxscore, 'home');
            const eA = extractBoxscoreStatsMap(espnSummary.boxscore, 'away');
            if (Object.keys(eH).length >= Object.keys(hydratedHomeStats).length) hydratedHomeStats = { ...hydratedHomeStats, ...eH };
            if (Object.keys(eA).length >= Object.keys(hydratedAwayStats).length) hydratedAwayStats = { ...hydratedAwayStats, ...eA };
        }

        if (isLiveOrPost && Object.keys(hydratedHomeStats).length < 4) {
            try {
                const { fetchLiveScoreMatchDetails } = require('../services/soccerSyncService');
                const lsId = match.source?.livescore_id || (String(match.source?.provider || '').toLowerCase() === 'livescore' ? match.source?.event_id : null) || (/^\d{5,8}$/.test(eventId) ? eventId : null);
                if (lsId) {
                    const lsDetails = await Promise.race([
                        fetchLiveScoreMatchDetails(lsId),
                        new Promise(r => setTimeout(() => r(null), 3000))
                    ]);
                    if (lsDetails?.boxscore?.teams?.length) {
                        hydratedHomeStats = { ...hydratedHomeStats, ...extractBoxscoreStatsMap(lsDetails.boxscore, 'home') };
                        hydratedAwayStats = { ...hydratedAwayStats, ...extractBoxscoreStatsMap(lsDetails.boxscore, 'away') };
                        providersUsed.push('livescore');
                    }
                }
            } catch (_) {}
        }

        if (isLiveOrPost && Object.keys(hydratedHomeStats).length < 4 && hName && aName) {
            try {
                const ssMatch = await Promise.race([
                    fetchSportScoreMatchDetail({ homeName: hName, awayName: aName }),
                    new Promise(r => setTimeout(() => r(null), 3000))
                ]);
                const ssBox = ssMatch ? statisticsToBoxscore(ssMatch) : null;
                if (ssBox?.teams?.length) {
                    hydratedHomeStats = { ...hydratedHomeStats, ...extractBoxscoreStatsMap(ssBox, 'home') };
                    hydratedAwayStats = { ...hydratedAwayStats, ...extractBoxscoreStatsMap(ssBox, 'away') };
                    providersUsed.push('sportscore');
                }
            } catch (_) {}
        }

        const _sanStats = sanitizeStatsAgainstScoreline(
            hydratedHomeStats,
            hydratedAwayStats,
            match.home?.score,
            match.away?.score
        );
        hydratedHomeStats = _sanStats.home;
        hydratedAwayStats = _sanStats.away;
        const homePressure = computeAttackingPressureIndex(hydratedHomeStats);
        const awayPressure = computeAttackingPressureIndex(hydratedAwayStats);
        const h2hSummaryObj = {
            totalMeetings: totalLifetimeMeetings,
            homeWins,
            awayWins,
            draws,
            averageGoalsPerMatch: totalLifetimeMeetings > 0 ? Number((totalGoals / totalLifetimeMeetings).toFixed(2)) : 0,
            bttsPercentage: totalLifetimeMeetings > 0 ? Number(((bttsCount / totalLifetimeMeetings) * 100).toFixed(1)) : 0,
            over25Percentage: totalLifetimeMeetings > 0 ? Number(((over25Count / totalLifetimeMeetings) * 100).toFixed(1)) : 0
        };

        const { norraAiPredictionHints, telemetryQuality } = computeEnrichedPredictionModel({
            homeAnalytics,
            awayAnalytics,
            homeStanding,
            awayStanding,
            h2h: h2hSummaryObj,
            matchStatus: match.status || {},
            liveScore: isLiveOrPost ? { home: match.home?.score, away: match.away?.score } : null,
            liveStats: { home: hydratedHomeStats, away: hydratedAwayStats },
            homeName: match.home?.display_name || match.home?.name || 'Home',
            awayName: match.away?.display_name || match.away?.name || 'Away',
            odds: match.odds || [],
            providersUsed
        });

        const inPlayTelemetryObj = isLiveOrPost ? {
            clock: match.status?.clock || match.status?.detail || '',
            period: match.status?.period || 0,
            state: match.status?.state || 'in',
            homeScore: match.home?.score ?? 0,
            awayScore: match.away?.score ?? 0,
            homeStats: hydratedHomeStats,
            awayStats: hydratedAwayStats,
            attackingPressureHome: homePressure,
            attackingPressureAway: awayPressure,
            dominanceLeader: (homePressure != null && awayPressure != null)
                ? (homePressure > awayPressure + 4 ? 'home' : (awayPressure > homePressure + 4 ? 'away' : 'balanced'))
                : null,
            statMetricsCount: Math.max(Object.keys(hydratedHomeStats).length, Object.keys(hydratedAwayStats).length)
        } : null;

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
                clock: match.status?.clock || match.status?.detail || '',
                score: isLiveOrPost ? { home: match.home?.score ?? 0, away: match.away?.score ?? 0 } : null,
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
                ...h2hSummaryObj,
                neverMetBefore: totalLifetimeMeetings === 0,
                seriesSummary,
                seriesScore,
                h2hFormHome,
                h2hFormAway,
                recentMeetings: recentH2hMeetings,
                allMeetings: allLifetimeH2h
            },
            odds: match.odds || [],
            inPlayTelemetry: inPlayTelemetryObj,
            telemetryQuality,
            norraAiPredictionHints
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
const trainingDataResponseCache = new Map();
const TRAINING_DATA_CACHE_TTL_MS = 60 * 1000;
const TRAINING_DATA_PROJECTION = 'source.event_id source.provider league_slug date scoreboard_date home.source_id home.name home.display_name home.score home.stats away.source_id away.name away.display_name away.score away.stats status.state status.detail status.clock status.completed venue.name venue.city venue.country odds key_events.scoringPlay key_events.redCard key_events.clockValue key_events.clock key_events.side key_events.homeAway key_events.team.side key_events.type.text key_events.text';

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

        const todayBoardForMeta = dailyBoardCache.getReadyBoard(dailyBoardCache.getWatDateKey(), { status: 'all' });
        const dailyFixtureCount = Array.isArray(todayBoardForMeta?.matches) ? todayBoardForMeta.matches.length : 0;

        // Fast 60s RAM cache so burst/repeated ML ingestion calls never stall on Atlas M0
        const tdCacheKey = `${leagueSlug}:${stateParam}:${limit}:${minStats}:${isProOrEnterprise ? 'pro' : 'free'}`;
        const cachedTd = trainingDataResponseCache.get(tdCacheKey);
        if (cachedTd && (Date.now() - cachedTd.ts < TRAINING_DATA_CACHE_TTL_MS)) {
            res.set('Cache-Control', 'public, max-age=60');
            if (format === 'jsonl' || format === 'ndjson') {
                res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
                for (const sample of cachedTd.samples) {
                    res.write(JSON.stringify(sample) + '\n');
                }
                return res.end();
            }
            return res.json({
                status: 'success',
                meta: {
                    totalSamples: cachedTd.samples.length,
                    dailyFixtureCount,
                    league: leagueSlug,
                    state: stateParam,
                    tier: keyDoc?.plan || 'public_free',
                    hasFullStreamingAccess: isProOrEnterprise,
                    cached: true,
                    notice: !isProOrEnterprise ? 'Public/Free tier preview (max 100 samples). Upgrade to Pro or Enterprise for JSONL streaming up to 1,000 samples per call.' : undefined,
                    generatedAt: new Date(cachedTd.ts).toISOString()
                },
                samples: cachedTd.samples
            });
        }

        const filter = {};
        if (leagueSlug && leagueSlug !== 'all') {
            filter.league_slug = leagueSlug;
        }
        if (stateParam && stateParam !== 'all') {
            filter['status.state'] = stateParam;
        } else {
            filter['status.state'] = { $in: ['post', 'in'] };
        }

        // Exclude postponed / cancelled / abandoned matches and future-dated fixtures from completed training feeds
        const maxCompletedDate = new Date(Date.now() + 2 * 3600 * 1000);
        if (stateParam === 'post' || stateParam === 'all') {
            filter['status.detail'] = { $not: /^(postp|canc|aban|susp|delay)/i };
            filter.date = { $lte: maxCompletedDate };
        }

        const richStatsCriteria = {
            $or: [
                { 'home.stats.possessionPct': { $exists: true, $ne: null } },
                { 'home.stats.totalShots': { $exists: true, $ne: null } },
                { 'home.stats.shotsOnTarget': { $exists: true, $ne: null } },
                { 'home.stats.wonCorners': { $exists: true, $ne: null } },
                { 'home.stats.expectedGoals': { $exists: true, $ne: null } }
            ]
        };

        let matches = [];
        if (mongoose.connection && mongoose.connection.readyState === 1) {
            try {
                // Prioritize matches with genuine boxscore stats so ML pipelines (e.g. Norra AI) aren't starved by sparse rows
                if (stateParam === 'post' || minStats) {
                    matches = await SoccerMatch.find({ ...filter, ...richStatsCriteria })
                        .select(TRAINING_DATA_PROJECTION)
                        .sort({ date: -1 })
                        .limit(limit)
                        .maxTimeMS(15000)
                        .lean();
                }

                // Top up with remaining recent matches if under limit (or if minStats yielded 0 rich-stat rows)
                if (matches.length === 0 || (matches.length < limit && !minStats)) {
                    try {
                        const remaining = limit - matches.length;
                        const seenIds = new Set(matches.map(m => String(m._id || m.source?.event_id || '')));
                        const extra = await SoccerMatch.find(filter)
                            .select(TRAINING_DATA_PROJECTION)
                            .sort({ date: -1 })
                            .limit(Math.min(limit, remaining + matches.length))
                            .maxTimeMS(15000)
                            .lean();
                        for (const m of extra) {
                            const key = String(m._id || m.source?.event_id || '');
                            if (seenIds.has(key)) continue;
                            seenIds.add(key);
                            matches.push(m);
                            if (matches.length >= limit) break;
                        }
                    } catch (topUpErr) {
                        console.warn('Training data top-up query warning:', topUpErr.message);
                    }
                }
            } catch (dbErr) {
                console.warn('Training data query warning:', dbErr.message);
                if (matches.length === 0) matches = [];
            }
        }

        // State-aware memory cache fallback: never serve live ('in') matches when caller explicitly asked for completed ('post')
        if (matches.length === 0) {
            const matchesLeagueFilter = (m) => {
                if (!leagueSlug || leagueSlug === 'all') return true;
                const slug = String(m.league_slug || m.league?.slug || '').trim().toLowerCase();
                return slug === leagueSlug;
            };
            if (stateParam === 'post') {
                const todayBoard = dailyBoardCache.getReadyBoard(dailyBoardCache.getWatDateKey(), { status: 'finished' });
                if (Array.isArray(todayBoard?.matches) && todayBoard.matches.length > 0) {
                    const maxCompletedMs = maxCompletedDate.getTime();
                    matches = todayBoard.matches
                        .filter(matchesLeagueFilter)
                        .filter(m => !/^(postp|canc|aban|susp|delay)/i.test(String(m.status?.detail || m.status?.clock || '')))
                        .filter(m => {
                            if (!m.date) return true;
                            const ms = new Date(m.date).getTime();
                            return !Number.isFinite(ms) || ms <= maxCompletedMs;
                        })
                        .slice(0, limit);
                }
            } else if (Array.isArray(liveFeedMemoryCache?.matches) && liveFeedMemoryCache.matches.length > 0) {
                matches = liveFeedMemoryCache.matches
                    .filter(matchesLeagueFilter)
                    .slice(0, limit);
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

            const keyEvents = Array.isArray(m.key_events) ? m.key_events : [];
            const nonScoringEventRegex = /\b(miss|missed|saved|disallowed|cancelled|canceled|overturned|no goal|awarded)\b/i;
            const goalEvents = keyEvents.filter(k => {
                if (k.scoringPlay) return true;
                const combinedText = `${k.type?.text || ''} ${k.text || ''}`.toLowerCase();
                if (!combinedText.includes('goal')) return false;
                return !nonScoringEventRegex.test(combinedText);
            }).map(k => ({
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

            // Real stats only — never invent possession / shots / corners from scoreline
            const numOrNull = (v) => {
                if (v === null || v === undefined || v === '') return null;
                const n = Number(v);
                return Number.isFinite(n) ? n : null;
            };
            const diffOrNull = (a, b, decimals = 2) => {
                if (a == null || b == null) return null;
                return Number((a - b).toFixed(decimals));
            };
            const hShotsOn = numOrNull(hStats.shotsOnTarget);
            const aShotsOn = numOrNull(aStats.shotsOnTarget);
            const hShots = numOrNull(hStats.totalShots);
            const aShots = numOrNull(aStats.totalShots);
            const hShotsOff = numOrNull(hStats.shotsOffTarget) ?? ((hShots != null && hShotsOn != null) ? Math.max(0, hShots - hShotsOn) : null);
            const aShotsOff = numOrNull(aStats.shotsOffTarget) ?? ((aShots != null && aShotsOn != null) ? Math.max(0, aShots - aShotsOn) : null);
            const hBlocked = numOrNull(hStats.blockedShots);
            const aBlocked = numOrNull(aStats.blockedShots);
            const hPoss = numOrNull(hStats.possessionPct);
            const aPoss = numOrNull(aStats.possessionPct);
            const hCorners = numOrNull(hStats.wonCorners);
            const aCorners = numOrNull(aStats.wonCorners);
            const hFouls = numOrNull(hStats.foulsCommitted ?? hStats.foulsCommited);
            const aFouls = numOrNull(aStats.foulsCommitted ?? aStats.foulsCommited);
            const hOffsides = numOrNull(hStats.offsides);
            const aOffsides = numOrNull(aStats.offsides);
            const hYellows = numOrNull(hStats.yellowCards);
            const aYellows = numOrNull(aStats.yellowCards);
            const hReds = numOrNull(hStats.redCards) ?? (keyEvents.length > 0 ? redCardEvents.filter(r => r.side === 'home').length : null);
            const aReds = numOrNull(aStats.redCards) ?? (keyEvents.length > 0 ? redCardEvents.filter(r => r.side === 'away').length : null);
            const hSaves = numOrNull(hStats.saves);
            const aSaves = numOrNull(aStats.saves);
            const hXg = numOrNull(hStats.expectedGoals);
            const aXg = numOrNull(aStats.expectedGoals);
            const hBigChances = numOrNull(hStats.bigChances);
            const aBigChances = numOrNull(aStats.bigChances);
            const hAttacks = numOrNull(hStats.attacks);
            const aAttacks = numOrNull(aStats.attacks);
            const hDangerousAttacks = numOrNull(hStats.dangerousAttacks);
            const aDangerousAttacks = numOrNull(aStats.dangerousAttacks);
            const hPasses = numOrNull(hStats.passes);
            const aPasses = numOrNull(aStats.passes);
            const hPassAcc = numOrNull(hStats.passAccuracyPct);
            const aPassAcc = numOrNull(aStats.passAccuracyPct);
            const hTackles = numOrNull(hStats.tackles);
            const aTackles = numOrNull(aStats.tackles);
            const hInterceptions = numOrNull(hStats.interceptions);
            const aInterceptions = numOrNull(aStats.interceptions);
            const hClearances = numOrNull(hStats.clearances);
            const aClearances = numOrNull(aStats.clearances);
            const hWoodwork = numOrNull(hStats.hitWoodwork);
            const aWoodwork = numOrNull(aStats.hitWoodwork);

            const hPressure = computeAttackingPressureIndex(hStats);
            const aPressure = computeAttackingPressureIndex(aStats);

            const coreSignals = [hPoss, hShots, hShotsOn, hCorners, hFouls, hSaves, hXg, hDangerousAttacks, hPasses];
            const populatedCore = coreSignals.filter(v => v != null).length;
            const populatedMetricCount = Math.max(Object.keys(hStats).length, Object.keys(aStats).length);

            const firstHalfGoalsHome = goalEvents.filter(g => g.side === 'home' && g.minute > 0 && g.minute <= 45).length;
            const firstHalfGoalsAway = goalEvents.filter(g => g.side === 'away' && g.minute > 0 && g.minute <= 45).length;
            const secondHalfGoalsHome = goalEvents.filter(g => g.side === 'home' && g.minute > 45).length;
            const secondHalfGoalsAway = goalEvents.filter(g => g.side === 'away' && g.minute > 45).length;
            const lateGoalsAfter75 = goalEvents.filter(g => g.minute >= 75).length;

            return {
                eventId: m.source?.event_id || m.id || m.uid || null,
                provider: m.source?.provider || 'upstream',
                leagueSlug: m.league_slug || m.league?.slug || null,
                date: m.date,
                scoreboardDate: m.scoreboard_date || m.scoreboardDate || null,
                venue: m.venue || null,
                odds: Array.isArray(m.odds) ? m.odds : [],
                homeTeam: {
                    id: m.home?.source_id || m.home?.id || null,
                    name: m.home?.name || m.home?.display_name || m.home?.displayName || null,
                    score: hScore
                },
                awayTeam: {
                    id: m.away?.source_id || m.away?.id || null,
                    name: m.away?.name || m.away?.display_name || m.away?.displayName || null,
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
                    possessionDifferential: diffOrNull(hPoss, aPoss, 1),
                    shotsHome: hShots,
                    shotsAway: aShots,
                    shotsDifferential: diffOrNull(hShots, aShots, 0),
                    shotsOnTargetHome: hShotsOn,
                    shotsOnTargetAway: aShotsOn,
                    shotsOnTargetDifferential: diffOrNull(hShotsOn, aShotsOn, 0),
                    shotsOffTargetHome: hShotsOff,
                    shotsOffTargetAway: aShotsOff,
                    blockedShotsHome: hBlocked,
                    blockedShotsAway: aBlocked,
                    shotAccuracyHome: (hShots != null && hShots > 0 && hShotsOn != null) ? parseFloat((hShotsOn / hShots).toFixed(3)) : null,
                    shotAccuracyAway: (aShots != null && aShots > 0 && aShotsOn != null) ? parseFloat((aShotsOn / aShots).toFixed(3)) : null,
                    shotConversionRateHome: (hShots != null && hShots > 0) ? parseFloat((hScore / hShots).toFixed(3)) : null,
                    shotConversionRateAway: (aShots != null && aShots > 0) ? parseFloat((aScore / aShots).toFixed(3)) : null,
                    cornersHome: hCorners,
                    cornersAway: aCorners,
                    cornersDifferential: diffOrNull(hCorners, aCorners, 0),
                    foulsHome: hFouls,
                    foulsAway: aFouls,
                    foulsDifferential: diffOrNull(hFouls, aFouls, 0),
                    offsidesHome: hOffsides,
                    offsidesAway: aOffsides,
                    yellowCardsHome: hYellows,
                    yellowCardsAway: aYellows,
                    redCardsHome: hReds,
                    redCardsAway: aReds,
                    disciplinaryScoreHome: (hYellows != null || hReds != null) ? ((hYellows || 0) * 10) + ((hReds || 0) * 25) : null,
                    disciplinaryScoreAway: (aYellows != null || aReds != null) ? ((aYellows || 0) * 10) + ((aReds || 0) * 25) : null,
                    goalkeeperSavesHome: hSaves,
                    goalkeeperSavesAway: aSaves,
                    expectedGoalsHome: hXg,
                    expectedGoalsAway: aXg,
                    expectedGoalsDifferential: diffOrNull(hXg, aXg, 2),
                    bigChancesHome: hBigChances,
                    bigChancesAway: aBigChances,
                    attacksHome: hAttacks,
                    attacksAway: aAttacks,
                    dangerousAttacksHome: hDangerousAttacks,
                    dangerousAttacksAway: aDangerousAttacks,
                    passesHome: hPasses,
                    passesAway: aPasses,
                    passAccuracyHome: hPassAcc,
                    passAccuracyAway: aPassAcc,
                    tacklesHome: hTackles,
                    tacklesAway: aTackles,
                    interceptionsHome: hInterceptions,
                    interceptionsAway: aInterceptions,
                    clearancesHome: hClearances,
                    clearancesAway: aClearances,
                    hitWoodworkHome: hWoodwork,
                    hitWoodworkAway: aWoodwork,
                    attackingPressureIndexHome: hPressure,
                    attackingPressureIndexAway: aPressure,
                    pressureDifferential: diffOrNull(hPressure, aPressure, 2)
                },
                telemetryCompleteness: {
                    score: Number((populatedCore / coreSignals.length).toFixed(2)),
                    populatedMetricCount,
                    hasInGameStats: populatedMetricCount >= 3
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
                    firstGoalMinute: goalEvents.length > 0 ? goalEvents[0].minute : null,
                    goalTiming: {
                        firstHalfGoalsHome,
                        firstHalfGoalsAway,
                        secondHalfGoalsHome,
                        secondHalfGoalsAway,
                        lateGoalsAfter75
                    }
                }
            };
        });

        if (samples.length > 0) {
            if (trainingDataResponseCache.size >= 20) {
                const oldestKey = trainingDataResponseCache.keys().next().value;
                if (oldestKey) trainingDataResponseCache.delete(oldestKey);
            }
            trainingDataResponseCache.set(tdCacheKey, { ts: Date.now(), samples });
        }

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
                dailyFixtureCount,
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
            $and: [
                { $or: orClauses },
                {
                    $or: [
                        { 'status.state': { $in: ['post', 'final', 'completed'] } },
                        { 'status.completed': true },
                        { 'status.name': { $in: ['STATUS_FINAL', 'STATUS_FULL_TIME', 'STATUS_AFTER_ET', 'STATUS_AFTER_PK', 'FT', 'AET', 'AP'] } },
                        { date: { $lt: new Date(Date.now() - 2 * 3600 * 1000) } }
                    ]
                }
            ]
        }).sort({ date: -1 }).limit(500).lean();

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

        // Enrich with multi-provider historical H2H (SportScore + TheSportsDB) whenever local DB has < 8 meetings
        // Covers both existing DB clubs and future/cross-league fixtures without duplicating DB records
        if (results.length < 8 && (t1Name || team1Id) && (t2Name || team2Id)) {
            try {
                const { fetchAggregatedH2H } = require('../services/h2hAggregatorService');
                const ssName1 = t1Name || String(team1Id).replace(/[-_]+/g, ' ');
                const ssName2 = t2Name || String(team2Id).replace(/[-_]+/g, ' ');
                const ssData = await fetchAggregatedH2H({ homeName: ssName1, awayName: ssName2 });
                if (ssData?.matches && Array.isArray(ssData.matches) && ssData.matches.length > 0) {
                    const existingDays = new Set(results.map(r => r.date ? new Date(r.date).toISOString().slice(0, 10) : ''));
                    for (const sm of ssData.matches) {
                        const smDay = sm.time ? new Date(sm.time).toISOString().slice(0, 10) : '';
                        if (smDay && existingDays.has(smDay)) continue;
                        if (smDay) existingDays.add(smDay);
                        const hScore = Number(sm.home_score || 0);
                        const aScore = Number(sm.away_score || 0);
                        totalGoals += (hScore + aScore);
                        if (hScore === aScore) {
                            draws++;
                        } else if (areTeamNamesMatching(sm.home, ssName1) || normalizeTeamName(sm.home) === normalizeTeamName(ssName1)) {
                            if (hScore > aScore) team1Wins++; else team2Wins++;
                        } else {
                            if (aScore > hScore) team1Wins++; else team2Wins++;
                        }
                        results.push({
                            id: sm.url || `${sm.home}_vs_${sm.away}_${sm.time}`,
                            date: sm.time,
                            league: sm.competition || 'Official Competition',
                            homeTeam: sm.home,
                            awayTeam: sm.away,
                            homeLogo: sm.home_logo || '',
                            awayLogo: sm.away_logo || '',
                            score: `${hScore} - ${aScore}`,
                            source: sm.source || 'sportscore'
                        });
                    }
                    results.sort((a, b) => new Date(b.date) - new Date(a.date));
                }
            } catch (ssErr) {
                console.warn('Aggregated /h2h route enrichment failed:', ssErr.message);
            }
        }

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
            leagues: leagues.map(l => {
                const targetLg = TARGET_LEAGUES.find(t => t.slug === l.slug);
                const resolvedCountry = (l.country && l.country !== 'International')
                    ? l.country
                    : ((targetLg?.country && targetLg.country !== 'International')
                        ? targetLg.country
                        : inferMatchCountry({ league_slug: l.slug, name: l.name, note: l.name }));
                return {
                    id: l.source?.source_id || l.slug,
                    name: l.name,
                    abbreviation: l.abbreviation,
                    slug: l.slug,
                    country: resolvedCountry,
                    kind: l.kind,
                    logo: l.logo,
                    season: l.season,
                    matchCount: countMap.get(l.slug) || 0,
                    lastSyncedAt: l.lastSyncedAt,
                    isAccessibleOnTier: isFreePlanRestricted(req.apiKey) ? FREE_TIER_ALLOWED_LEAGUES.includes(l.slug) : true
                };
            })
        });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to fetch leagues: ' + err.message });
    }
});

/**
 * GET /api/v1/football/standings & /api/v1/football/standings/:league
 * Full league standings tables.
 */
async function synthesizeStandingsFromMatches(leagueSlug) {
    try {
        const matches = await SoccerMatch.find({
            league_slug: leagueSlug,
            'status.completed': true,
            'home.score': { $ne: null },
            'away.score': { $ne: null }
        }).lean();
        if (!matches || !matches.length) return null;

        const table = new Map();
        for (const m of matches) {
            const hName = m.home?.name || m.home?.display_name || 'Home';
            const aName = m.away?.name || m.away?.display_name || 'Away';
            const hId = String(m.home?.source_id || hName.toLowerCase().replace(/[^a-z0-9]/g, '-'));
            const aId = String(m.away?.source_id || aName.toLowerCase().replace(/[^a-z0-9]/g, '-'));
            const hScore = Number(m.home?.score || 0);
            const aScore = Number(m.away?.score || 0);

            if (!table.has(hId)) {
                table.set(hId, { team: { id: hId, name: hName, displayName: hName, logo: m.home?.logo || '' }, stats: { gamesPlayed: 0, wins: 0, ties: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, pointDifferential: 0, points: 0 } });
            }
            if (!table.has(aId)) {
                table.set(aId, { team: { id: aId, name: aName, displayName: aName, logo: m.away?.logo || '' }, stats: { gamesPlayed: 0, wins: 0, ties: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, pointDifferential: 0, points: 0 } });
            }

            const hEntry = table.get(hId);
            const aEntry = table.get(aId);

            hEntry.stats.gamesPlayed += 1;
            aEntry.stats.gamesPlayed += 1;
            hEntry.stats.pointsFor += hScore;
            hEntry.stats.pointsAgainst += aScore;
            aEntry.stats.pointsFor += aScore;
            aEntry.stats.pointsAgainst += hScore;
            hEntry.stats.pointDifferential = hEntry.stats.pointsFor - hEntry.stats.pointsAgainst;
            aEntry.stats.pointDifferential = aEntry.stats.pointsFor - aEntry.stats.pointsAgainst;

            if (hScore > aScore) {
                hEntry.stats.wins += 1;
                hEntry.stats.points += 3;
                aEntry.stats.losses += 1;
            } else if (aScore > hScore) {
                aEntry.stats.wins += 1;
                aEntry.stats.points += 3;
                hEntry.stats.losses += 1;
            } else {
                hEntry.stats.ties += 1;
                hEntry.stats.points += 1;
                aEntry.stats.ties += 1;
                aEntry.stats.points += 1;
            }
        }

        const entries = Array.from(table.values()).sort((a, b) => {
            if (b.stats.points !== a.stats.points) return b.stats.points - a.stats.points;
            if (b.stats.pointDifferential !== a.stats.pointDifferential) return b.stats.pointDifferential - a.stats.pointDifferential;
            return b.stats.pointsFor - a.stats.pointsFor;
        });

        return {
            league_slug: leagueSlug,
            season_year: new Date().getUTCFullYear(),
            group_name: 'Standings',
            group_id: 'default',
            entries
        };
    } catch (_) {
        return null;
    }
}

router.get(['/standings', '/standings/:league'], optionalApiKeyAuth, async (req, res) => {
    try {
        const filter = {};
        const requestedSlug = String(req.params.league || req.query.league || '').toLowerCase();

        if (isFreePlanRestricted(req.apiKey)) {
            if (requestedSlug && requestedSlug !== 'all') {
                if (!FREE_TIER_ALLOWED_LEAGUES.includes(requestedSlug)) {
                    return res.status(403).json({
                        error: `Access to standings for '${requestedSlug}' is restricted on the Free Developer tier (limited to 3 free leagues: eng.1, esp.1, nga.1). Upgrade to Starter ($10/mo) or Pro ($29/mo) to access all 100+ world leagues.`,
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

        const currentYear = new Date().getUTCFullYear();
        // Always refresh specific-league tables when missing or stale (was: only African LiveScore map + only if empty)
        if (requestedSlug && requestedSlug !== 'all') {
            try {
                await ensureFreshStandings(requestedSlug, 3 * 60 * 60 * 1000);
            } catch (e) {
                console.warn('ensureFreshStandings failed:', e.message);
                try {
                    if (LIVESCORE_STAGE_TABLE_MAP && LIVESCORE_STAGE_TABLE_MAP[requestedSlug]) {
                        await syncLiveScoreStandingsForLeague(requestedSlug);
                    } else if (typeof syncEspnStandingsForLeague === 'function') {
                        await syncEspnStandingsForLeague(requestedSlug);
                    }
                } catch (_) {}
            }
        }

        const groups = await SoccerStanding.find(filter).sort({ season_year: -1, group_name: 1 }).lean();
        // Deduplicate groups keeping ONLY the latest season_year per league and group, prioritizing overall
        const seenGroups = new Set();
        let dedupedGroups = [];
        for (const g of groups) {
            const key = `${g.league_slug}_${g.group_id || g.group_name || 'default'}`;
            if (!seenGroups.has(key)) {
                seenGroups.add(key);
                dedupedGroups.push(g);
            }
        }

        // If specific league requested and overall group exists, keep only overall to eliminate duplicate ESPN tables
        if (requestedSlug && requestedSlug !== 'all' && dedupedGroups.length > 1) {
            const overallGroup = dedupedGroups.find(g => g.group_id === 'overall');
            if (overallGroup) {
                dedupedGroups = [overallGroup];
            }
        }

        if (dedupedGroups.length === 0 && requestedSlug && requestedSlug !== 'all') {
            const synthesized = await synthesizeStandingsFromMatches(requestedSlug);
            if (synthesized) {
                dedupedGroups.push(synthesized);
            }
        }

        res.set('Cache-Control', 'public, max-age=30');
        return res.json({
            status: 'success',
            count: dedupedGroups.length,
            standings: dedupedGroups.map(serializeStandingGroup)
        });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to fetch standings: ' + err.message });
    }
});

/**
 * Curated canonical leaders for top world flights to guarantee fast, zero-delay responses
 */
const CANONICAL_LEADERS = {
    'eng.1': {
        scorers: [
            { rank: 1, name: 'Erling Haaland', team: 'Manchester City', teamLogo: 'https://a.espncdn.com/i/teamlogos/soccer/500/382.png', goals: 14, penalties: 1, assists: 0 },
            { rank: 2, name: 'Mohamed Salah', team: 'Liverpool', teamLogo: 'https://a.espncdn.com/i/teamlogos/soccer/500/364.png', goals: 10, penalties: 2, assists: 6 },
            { rank: 3, name: 'Cole Palmer', team: 'Chelsea', teamLogo: 'https://a.espncdn.com/i/teamlogos/soccer/500/363.png', goals: 7, penalties: 1, assists: 5 },
            { rank: 4, name: 'Bryan Mbeumo', team: 'Brentford', teamLogo: 'https://a.espncdn.com/i/teamlogos/soccer/500/337.png', goals: 8, penalties: 2, assists: 1 },
            { rank: 5, name: 'Chris Wood', team: 'Nottingham Forest', teamLogo: 'https://a.espncdn.com/i/teamlogos/soccer/500/393.png', goals: 8, penalties: 1, assists: 0 },
            { rank: 6, name: 'Nicolas Jackson', team: 'Chelsea', teamLogo: 'https://a.espncdn.com/i/teamlogos/soccer/500/363.png', goals: 6, penalties: 0, assists: 3 },
            { rank: 7, name: 'Yoane Wissa', team: 'Brentford', teamLogo: 'https://a.espncdn.com/i/teamlogos/soccer/500/337.png', goals: 7, penalties: 0, assists: 1 },
            { rank: 8, name: 'Bukayo Saka', team: 'Arsenal', teamLogo: 'https://a.espncdn.com/i/teamlogos/soccer/500/359.png', goals: 4, penalties: 1, assists: 7 }
        ],
        assists: [
            { rank: 1, name: 'Bukayo Saka', team: 'Arsenal', teamLogo: 'https://a.espncdn.com/i/teamlogos/soccer/500/359.png', assists: 7 },
            { rank: 2, name: 'Mohamed Salah', team: 'Liverpool', teamLogo: 'https://a.espncdn.com/i/teamlogos/soccer/500/364.png', assists: 6 },
            { rank: 3, name: 'Cole Palmer', team: 'Chelsea', teamLogo: 'https://a.espncdn.com/i/teamlogos/soccer/500/363.png', assists: 5 }
        ]
    },
    'esp.1': {
        scorers: [
            { rank: 1, name: 'Robert Lewandowski', team: 'Barcelona', teamLogo: 'https://a.espncdn.com/i/teamlogos/soccer/500/83.png', goals: 15, penalties: 2, assists: 2 },
            { rank: 2, name: 'Raphinha', team: 'Barcelona', teamLogo: 'https://a.espncdn.com/i/teamlogos/soccer/500/83.png', goals: 8, penalties: 0, assists: 6 },
            { rank: 3, name: 'Vinícius Júnior', team: 'Real Madrid', teamLogo: 'https://a.espncdn.com/i/teamlogos/soccer/500/86.png', goals: 8, penalties: 2, assists: 4 },
            { rank: 4, name: 'Kylian Mbappé', team: 'Real Madrid', teamLogo: 'https://a.espncdn.com/i/teamlogos/soccer/500/86.png', goals: 7, penalties: 3, assists: 1 },
            { rank: 5, name: 'Ayoze Pérez', team: 'Villarreal', teamLogo: 'https://a.espncdn.com/i/teamlogos/soccer/500/102.png', goals: 7, penalties: 0, assists: 0 },
            { rank: 6, name: 'Ante Budimir', team: 'Osasuna', teamLogo: 'https://a.espncdn.com/i/teamlogos/soccer/500/97.png', goals: 6, penalties: 2, assists: 1 },
            { rank: 7, name: 'Lamine Yamal', team: 'Barcelona', teamLogo: 'https://a.espncdn.com/i/teamlogos/soccer/500/83.png', goals: 5, penalties: 0, assists: 7 }
        ],
        assists: [
            { rank: 1, name: 'Lamine Yamal', team: 'Barcelona', teamLogo: 'https://a.espncdn.com/i/teamlogos/soccer/500/83.png', assists: 7 },
            { rank: 2, name: 'Raphinha', team: 'Barcelona', teamLogo: 'https://a.espncdn.com/i/teamlogos/soccer/500/83.png', assists: 6 },
            { rank: 3, name: 'Vinícius Júnior', team: 'Real Madrid', teamLogo: 'https://a.espncdn.com/i/teamlogos/soccer/500/86.png', assists: 4 }
        ]
    },
    'nga.1': {
        scorers: [
            { rank: 1, name: 'Anas Yusuf', team: 'Nasarawa United', teamLogo: '', goals: 9, penalties: 1, assists: 1 },
            { rank: 2, name: 'Sunday Megwo', team: 'Abia Warriors', teamLogo: '', goals: 6, penalties: 0, assists: 2 },
            { rank: 3, name: 'Chijioke Mbaoma', team: 'Enyimba', teamLogo: '', goals: 5, penalties: 2, assists: 1 },
            { rank: 4, name: 'Rabiu Ali', team: 'Kano Pillars', teamLogo: '', goals: 5, penalties: 2, assists: 3 },
            { rank: 5, name: 'Sadiq Abubakar', team: 'Rivers United', teamLogo: '', goals: 4, penalties: 0, assists: 2 }
        ],
        assists: [
            { rank: 1, name: 'Rabiu Ali', team: 'Kano Pillars', teamLogo: '', assists: 3 },
            { rank: 2, name: 'Sunday Megwo', team: 'Abia Warriors', teamLogo: '', assists: 2 },
            { rank: 3, name: 'Sadiq Abubakar', team: 'Rivers United', teamLogo: '', assists: 2 }
        ]
    },
    'uefa.champions': {
        scorers: [
            { rank: 1, name: 'Viktor Gyökeres', team: 'Sporting CP', teamLogo: 'https://a.espncdn.com/i/teamlogos/soccer/500/442.png', goals: 5, penalties: 1, assists: 1 },
            { rank: 2, name: 'Harry Kane', team: 'Bayern Munich', teamLogo: 'https://a.espncdn.com/i/teamlogos/soccer/500/132.png', goals: 5, penalties: 3, assists: 1 },
            { rank: 3, name: 'Raphinha', team: 'Barcelona', teamLogo: 'https://a.espncdn.com/i/teamlogos/soccer/500/83.png', goals: 5, penalties: 0, assists: 2 },
            { rank: 4, name: 'Robert Lewandowski', team: 'Barcelona', teamLogo: 'https://a.espncdn.com/i/teamlogos/soccer/500/83.png', goals: 5, penalties: 0, assists: 0 },
            { rank: 5, name: 'Vinícius Júnior', team: 'Real Madrid', teamLogo: 'https://a.espncdn.com/i/teamlogos/soccer/500/86.png', goals: 4, penalties: 0, assists: 2 }
        ],
        assists: [
            { rank: 1, name: 'Vinícius Júnior', team: 'Real Madrid', teamLogo: 'https://a.espncdn.com/i/teamlogos/soccer/500/86.png', assists: 2 },
            { rank: 2, name: 'Raphinha', team: 'Barcelona', teamLogo: 'https://a.espncdn.com/i/teamlogos/soccer/500/83.png', assists: 2 }
        ]
    }
};

/**
 * Aggregates top goalscorers and assists for a league
 */
async function getLeagueLeaders(leagueSlug) {
    const slug = String(leagueSlug || '').toLowerCase();
    const canonical = CANONICAL_LEADERS[slug];

    // 1) Prefer ESPN official statistics (accurate top-flight scorers)
    try {
        const espnUrl = `https://site.api.espn.com/apis/site/v2/sports/soccer/${encodeURIComponent(slug)}/statistics`;
        const espn = await fetchUpstreamJsonFast(espnUrl, 6000).catch(() => null);
        const cats = espn?.stats || [];
        const goalsCat = cats.find(c => /goal/i.test(String(c.name || c.displayName || ''))) || cats[0];
        const assistsCat = cats.find(c => /assist/i.test(String(c.name || c.displayName || '')));
        const parseGoals = (L) => {
            const v = Number(L.value);
            if (Number.isFinite(v) && v > 0) return v;
            const m = String(L.displayValue || L.shortDisplayValue || '').match(/goals?:\s*(\d+)/i);
            return m ? Number(m[1]) : 0;
        };
        const parseAssists = (L) => {
            const m = String(L.shortDisplayValue || L.displayValue || '').match(/a(?:ssists?)?:\s*(\d+)/i);
            if (m) return Number(m[1]);
            const v = Number(L.value);
            return Number.isFinite(v) ? v : 0;
        };
        const mapLeader = (L, idx, kind) => {
            const ath = L.athlete || {};
            const team = L.team || ath.team || {};
            const goals = kind === 'goals' ? parseGoals(L) : 0;
            const assists = kind === 'assists' ? parseAssists(L) : parseAssists(L);
            return {
                rank: idx + 1,
                name: ath.displayName || ath.shortName || 'Player',
                team: team.displayName || team.name || '',
                teamLogo: team.logos?.[0]?.href || (team.id ? `https://a.espncdn.com/i/teamlogos/soccer/500/${team.id}.png` : ''),
                goals: kind === 'goals' ? goals : goals,
                penalties: 0,
                assists: kind === 'assists' ? assists : (kind === 'goals' ? parseAssists(L) : assists)
            };
        };
        const topScorers = (goalsCat?.leaders || []).slice(0, 20).map((L, i) => mapLeader(L, i, 'goals')).filter(p => p.goals > 0);
        const topAssists = (assistsCat?.leaders || []).slice(0, 15).map((L, i) => mapLeader(L, i, 'assists')).filter(p => p.assists > 0);
        if (topScorers.length >= 3) {
            return { status: 'success', league: slug, source: 'espn', topScorers, topAssists };
        }
    } catch (e) {
        console.warn('ESPN leaders fetch failed:', e.message);
    }

    // 2) Aggregate from THIS season's key_events only (avoid stale/wrong-league pollution)
    const scorersMap = new Map();
    const assistsMap = new Map();
    try {
        const seasonStart = new Date(Date.UTC(new Date().getUTCFullYear(), 6, 1)); // Jul 1 of current year
        const matches = await SoccerMatch.find({
            league_slug: slug,
            'key_events.0': { $exists: true },
            date: { $gte: seasonStart }
        }).select('key_events home away league_slug date').limit(500).lean();

        for (const m of matches) {
            // Skip obvious non-senior name noise if slug is top flight
            const hName = m.home?.name || '';
            const aName = m.away?.name || '';
            if (/\.1$/.test(slug) && /(u-?1[89]|u-?2[01]|women|\bw\b|reserves?)/i.test(hName + ' ' + aName)) continue;

            for (const ev of (m.key_events || [])) {
                const isGoal = ev.scoringPlay || ev.type?.id === 'goal' || String(ev.type?.text || '').toLowerCase() === 'goal' || /\bgoal\b/i.test(String(ev.text || ''));
                if (!isGoal) continue;
                const athlete = ev.athlete?.displayName || ev.athlete?.fullName || ev.athletesInvolved?.[0]?.displayName || '';
                if (!athlete || athlete.length < 2) continue;
                const team = ev.team?.name || (ev.team?.side === 'away' ? m.away?.name : m.home?.name) || 'Club';
                // Guard: team should look like it belongs with this match
                if (team && hName && aName) {
                    const tn = String(team).toLowerCase();
                    if (!hName.toLowerCase().includes(tn.slice(0, 5)) && !aName.toLowerCase().includes(tn.slice(0, 5))
                        && !tn.includes(hName.toLowerCase().slice(0, 5)) && !tn.includes(aName.toLowerCase().slice(0, 5))) {
                        // still allow if team string is short side label
                        if (tn !== 'home' && tn !== 'away') {
                            /* keep — side mapping can differ */
                        }
                    }
                }
                const logo = (ev.team?.side === 'away' ? m.away?.logo : m.home?.logo) || '';
                const key = `${athlete.toLowerCase()}|${String(team).toLowerCase()}`;
                if (!scorersMap.has(key)) {
                    scorersMap.set(key, { name: athlete, team, teamLogo: logo, goals: 0, penalties: 0, assists: 0 });
                }
                const entry = scorersMap.get(key);
                entry.goals += 1;
                if (ev.penaltyKick || /penalty/i.test(String(ev.text || ''))) entry.penalties += 1;
            }
        }
    } catch (_) {}

    const dynamicScorers = Array.from(scorersMap.values())
        .sort((a, b) => b.goals - a.goals || b.assists - a.assists)
        .slice(0, 15)
        .map((item, idx) => ({ rank: idx + 1, ...item }));

    // 3) Canonical curated list if dynamic is thin or clearly wrong (lower-league names for top flights)
    const looksPolluted = dynamicScorers.length >= 3 && /\.1$/.test(slug) && dynamicScorers.slice(0, 5).every(p =>
        /eastleigh|deportivo|toma\b|weggen|non-league|national league/i.test(`${p.name} ${p.team}`)
    );

    if (dynamicScorers.length >= 5 && !looksPolluted) {
        return {
            status: 'success',
            league: slug,
            source: 'events',
            topScorers: dynamicScorers,
            topAssists: Array.from(assistsMap.values()).slice(0, 10).map((item, idx) => ({ rank: idx + 1, ...item }))
        };
    }

    if (canonical) {
        return {
            status: 'success',
            league: slug,
            source: 'canonical',
            topScorers: canonical.scorers,
            topAssists: canonical.assists
        };
    }

    return {
        status: 'success',
        league: slug,
        source: 'events',
        topScorers: dynamicScorers,
        topAssists: []
    };
}

/**
 * GET /api/v1/football/leagues/:league/leaders
 * Returns top goalscorers and assist leaders for a competition
 */
router.get(['/leagues/:league/leaders', '/leaders/:league'], async (req, res) => {
    try {
        const leagueSlug = String(req.params.league || '').toLowerCase();
        const data = await getLeagueLeaders(leagueSlug);
        res.set('Cache-Control', 'public, max-age=300');
        return res.json(data);
    } catch (err) {
        return res.status(500).json({ error: 'Failed to fetch league leaders: ' + err.message });
    }
});

async function getLeagueBracket(leagueSlug) {
    const slug = String(leagueSlug || '').toLowerCase();
    const matches = await SoccerMatch.find({ league_slug: slug }).sort({ date: 1 }).lean();
    if (!matches || !matches.length) {
        return { status: 'success', league: slug, hasBracket: false, rounds: [] };
    }

    const roundMap = new Map();
    const ROUND_ORDER = ['Round of 32', 'Round of 16', 'Quarter-finals', 'Semi-finals', 'Final'];

    for (const m of matches) {
        const rawName = `${m.name} ${m.short_name} ${m.season?.name || ''}`.toLowerCase();
        let roundName = null;
        if (rawName.includes('final') && !rawName.includes('semi') && !rawName.includes('quarter')) {
            roundName = 'Final';
        } else if (rawName.includes('semi-final') || rawName.includes('semifinal') || rawName.includes('semi final')) {
            roundName = 'Semi-finals';
        } else if (rawName.includes('quarter-final') || rawName.includes('quarterfinal') || rawName.includes('quarter final')) {
            roundName = 'Quarter-finals';
        } else if (rawName.includes('round of 16') || rawName.includes('r16') || rawName.includes('eighth')) {
            roundName = 'Round of 16';
        } else if (rawName.includes('round of 32') || rawName.includes('r32')) {
            roundName = 'Round of 32';
        }

        if (roundName) {
            if (!roundMap.has(roundName)) roundMap.set(roundName, []);
            roundMap.get(roundName).push(serializeScoreboardEvent(m));
        }
    }

    const sortedRounds = ROUND_ORDER
        .filter(r => roundMap.has(r))
        .map(r => ({ name: r, matches: roundMap.get(r) }));

    const isKnockoutComp = /cup|pokal|copa|trophy|champions|europa|tournament|nations|afcon|fifa|bracket/i.test(slug);

    return {
        status: 'success',
        league: slug,
        hasBracket: sortedRounds.length > 0 || isKnockoutComp,
        rounds: sortedRounds
    };
}

/**
 * GET /api/v1/football/leagues/:league/bracket
 * Returns structured tournament tree rounds for cup and knockout competitions
 */
router.get(['/leagues/:league/bracket', '/bracket/:league'], async (req, res) => {
    try {
        const leagueSlug = String(req.params.league || '').toLowerCase();
        const data = await getLeagueBracket(leagueSlug);
        res.set('Cache-Control', 'public, max-age=120');
        return res.json(data);
    } catch (err) {
        return res.status(500).json({ error: 'Failed to fetch bracket: ' + err.message });
    }
});

/**
 * GET /api/v1/football/sync-health
 * Real-time watchdog health check for sports telemetry ingestion
 */
router.get('/sync-health', (req, res) => {
    try {
        const { getSyncHealthStatus } = require('../services/soccerSyncService');
        const status = getSyncHealthStatus();
        return res.json({
            status: 'success',
            watchdog: status,
            serverTime: new Date().toISOString()
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
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
                    const boardMatch = dailyBoardCache.findMatchInBoards(eventId);
                    const fbStatus = lsData.status || boardMatch?.status || { state: 'post', completed: true, isLive: false, clock: 'FT', detail: 'FT' };
                    const fbState = fbStatus.completed ? 'post' : (fbStatus.isLive || fbStatus.state === 'in' ? 'in' : (fbStatus.state || 'post'));
                    const fbDetail = fbStatus.detail || fbStatus.clock || (fbState === 'post' ? 'FT' : (fbState === 'in' ? 'Live' : 'Scheduled'));
                    const summary = {
                        id: eventId,
                        header: {
                            competitions: [{
                                id: eventId,
                                date: boardMatch?.date || undefined,
                                competitors: boardMatch ? [
                                    { homeAway: 'home', score: String(lsData.score?.home ?? boardMatch.home?.score ?? 0), team: boardMatch.home || {} },
                                    { homeAway: 'away', score: String(lsData.score?.away ?? boardMatch.away?.score ?? 0), team: boardMatch.away || {} }
                                ] : [],
                                status: {
                                    state: fbState,
                                    completed: fbState === 'post',
                                    isLive: fbState === 'in',
                                    clock: fbDetail,
                                    detail: fbDetail,
                                    type: { state: fbState, completed: fbState === 'post', shortDetail: fbDetail, description: fbState === 'post' ? 'Full Time' : (fbState === 'in' ? 'In Progress' : 'Scheduled') }
                                },
                                details: lsData.keyEvents || []
                            }]
                        },
                        boxscore: lsData.boxscore || { teams: [] },
                        keyEvents: lsData.keyEvents || [],
                        rosters: lsData.rosters || [],
                        gameInfo: lsData.gameInfo || {},
                        status: { state: fbState, completed: fbState === 'post', isLive: fbState === 'in', clock: fbDetail, detail: fbDetail }
                    };
                    dailyBoardCache.reconcileSummaryWithBoardAndEvents(summary, { boardMatch, lsData });
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
            }).sort({ sequence_number: 1, clock_seconds: 1 }).limit(500).lean()
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

        let lsData = null;
        if (!hasStats || isLiveScoreEvent || !summary.keyEvents?.length) {
            try {
                const { fetchLiveScoreMatchDetails } = require('../services/soccerSyncService');
                const lsId = match.source?.livescore_id || (String(match.source?.provider || '').toLowerCase() === 'livescore' ? match.source?.event_id : null) || eventId;
                lsData = await fetchLiveScoreMatchDetails(lsId);
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

            // Reconcile summary header score & status with dailyBoardCache, LiveScore details, and goal timeline
            const boardMatch = dailyBoardCache.findMatchInBoards(match) || dailyBoardCache.findMatchInBoards(eventId);
            const { boardNeedsHeal, reconciled } = dailyBoardCache.reconcileSummaryWithBoardAndEvents(summary, {
                boardMatch,
                lsData
            });
            if (boardNeedsHeal && reconciled && reconciled.homeScore !== null && reconciled.awayScore !== null) {
                dailyBoardCache.patchMatchInBoards({
                    id: eventId,
                    source: match.source,
                    league_slug: match.league_slug,
                    home: { ...(match.home || {}), score: reconciled.homeScore },
                    away: { ...(match.away || {}), score: reconciled.awayScore },
                    status: reconciled.status
                });
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
        // LiveScore incidents when DB/ESPN timeline is empty (common for lower leagues)
        if (timelinePlays.length === 0) {
            try {
                const lsId = match.source?.livescore_id || match.source?.event_id || eventId;
                if (lsId && /^\d+$/.test(String(lsId))) {
                    const inc = await fetchUpstreamJsonFast(
                        `https://prod-public-api.livescore.com/v1/api/app/incidents/soccer/${lsId}`,
                        5000
                    );
                    const rows = inc?.Incs || inc?.Incidents || inc?.incidents || [];
                    if (Array.isArray(rows) && rows.length) {
                        timelinePlays = rows.map((row, idx) => {
                            const minute = row.Min ?? row.Mn ?? row.minute ?? row.T ?? '';
                            const extra = row.MinEx ?? row.extra ?? '';
                            const clockStr = extra ? `${minute}+${extra}'` : (minute !== '' ? `${minute}'` : '');
                            const text = row.Na || row.Nm || row.Text || row.text || row.IT || 'Event';
                            const scorer = row.Scn || row.Player || row.Pn || '';
                            const fullText = scorer ? `${text}: ${scorer}` : text;
                            const isGoal = /goal|score|pen/i.test(String(text)) || row.IT === 1 || row.Type === 1;
                            return {
                                id: `ls-inc-${idx}`,
                                sequence: idx + 1,
                                type: { text: isGoal ? 'Goal' : String(text) },
                                text: fullText,
                                clock: { displayValue: clockStr, value: parseInt(minute, 10) || 0 },
                                scoringPlay: isGoal,
                                team: row.Team === 1 || row.T1 ? { homeAway: 'home' } : (row.Team === 2 || row.T2 ? { homeAway: 'away' } : null),
                                participants: scorer ? [{ athlete: { displayName: scorer } }] : []
                            };
                        });
                    }
                }
            } catch (e) {
                console.warn('LiveScore incidents fetch failed:', e.message);
            }
        }
        // SportScore supplemental timeline + logos (never removes existing data)
        try {
            const hName = match.home?.display_name || match.home?.name || match.home?.displayName || '';
            const aName = match.away?.display_name || match.away?.name || match.away?.displayName || '';
            if (hName && aName) {
                const ssMatch = await fetchSportScoreMatchDetail({ homeName: hName, awayName: aName });
                if (ssMatch) {
                    if ((!match.home?.logo || /placeholder|unknown/i.test(String(match.home.logo))) && ssMatch.home_logo) {
                        match.home.logo = ssMatch.home_logo;
                    }
                    if ((!match.away?.logo || /placeholder|unknown/i.test(String(match.away.logo))) && ssMatch.away_logo) {
                        match.away.logo = ssMatch.away_logo;
                    }
                    if (timelinePlays.length === 0) {
                        const ssPlays = incidentsToTimelinePlays(ssMatch);
                        if (ssPlays.length) timelinePlays = ssPlays;
                    }
                    // Populate confirmed Lineups & Rosters from SportScore when ESPN/DB lacks rosters
                    if ((!summary.rosters || summary.rosters.length === 0) && ssMatch.lineups) {
                        const ssRosters = lineupsToRosters(ssMatch);
                        if (ssRosters.length) summary.rosters = ssRosters;
                    }
                    // Populate or enrich boxscore statistics from SportScore when ESPN/LiveScore lacks deep stats
                    const ssBox = statisticsToBoxscore(ssMatch);
                    if (ssBox?.teams?.length) {
                        const existingCount = Math.max(
                            summary?.boxscore?.teams?.[0]?.statistics?.length || 0,
                            summary?.boxscore?.teams?.[1]?.statistics?.length || 0
                        );
                        const ssCount = Math.max(
                            ssBox.teams[0]?.statistics?.length || 0,
                            ssBox.teams[1]?.statistics?.length || 0
                        );
                        if (existingCount === 0) {
                            summary.boxscore = ssBox;
                        } else if (ssCount > existingCount && Array.isArray(summary.boxscore?.teams)) {
                            for (const side of ['home', 'away']) {
                                const targetTm = summary.boxscore.teams.find(t => t.homeAway === side || t.id === side);
                                const srcTm = ssBox.teams.find(t => t.homeAway === side || t.id === side);
                                if (targetTm && srcTm && Array.isArray(srcTm.statistics)) {
                                    if (!Array.isArray(targetTm.statistics)) targetTm.statistics = [];
                                    const seen = new Set(targetTm.statistics.map(s => s.name));
                                    for (const st of srcTm.statistics) {
                                        if (!seen.has(st.name)) {
                                            targetTm.statistics.push(st);
                                            seen.add(st.name);
                                        }
                                    }
                                }
                            }
                        }
                    }
                    // Attach logos onto summary competitors if present
                    if (summary?.boxscore?.teams) {
                        for (const tm of summary.boxscore.teams) {
                            const n = tm.team?.displayName || tm.team?.name || '';
                            if (!n) continue;
                            if (tm.homeAway === 'home' && ssMatch.home_logo && (!tm.team.logo || /placeholder/i.test(String(tm.team.logo)))) tm.team.logo = ssMatch.home_logo;
                            if (tm.homeAway === 'away' && ssMatch.away_logo && (!tm.team.logo || /placeholder/i.test(String(tm.team.logo)))) tm.team.logo = ssMatch.away_logo;
                        }
                    }
                }
            }
        } catch (e) {
            console.warn('SportScore enrich failed:', e.message);
        }

        const homeBoxMap = extractBoxscoreStatsMap(summary.boxscore, 'home');
        const awayBoxMap = extractBoxscoreStatsMap(summary.boxscore, 'away');
        const telemetrySummary = {
            metricsCount: Math.max(Object.keys(homeBoxMap).length, Object.keys(awayBoxMap).length),
            attackingPressureHome: computeAttackingPressureIndex(homeBoxMap),
            attackingPressureAway: computeAttackingPressureIndex(awayBoxMap),
            hasExpectedGoals: homeBoxMap.expectedGoals != null || awayBoxMap.expectedGoals != null,
            provider: summary.boxscore?.provider || match.source?.provider || 'upstream'
        };

        const isLive = match.status?.state === 'in';
        const ttl = isLive ? 5 : 60;
        const responsePayload = {
            status: 'success',
            match: summary,
            summary: summary,
            timeline: timelinePlays,
            telemetrySummary
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
        const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const cleanName = teamId.replace(/-/g, ' ');
        const nameRegex = new RegExp(`^${esc(cleanName)}$`, 'i');

        let club = await SoccerClub.findOne({
            $or: [
                { 'source.club_id': teamId },
                { slug: teamId },
                { name: nameRegex },
                { display_name: nameRegex },
                { abbreviation: new RegExp(`^${esc(teamId)}$`, 'i') }
            ]
        }).lean();

        if (!club) {
            // Find team from any recorded SoccerMatch if not in dedicated SoccerClub collection
            const sampleMatch = await SoccerMatch.findOne({
                $or: [
                    { 'home.name': nameRegex },
                    { 'away.name': nameRegex },
                    { 'home.source_id': teamId },
                    { 'away.source_id': teamId }
                ]
            }).lean();

            if (sampleMatch) {
                const isHome = nameRegex.test(sampleMatch.home?.name || '') || sampleMatch.home?.source_id === teamId;
                const matchTeam = isHome ? sampleMatch.home : sampleMatch.away;
                club = {
                    name: matchTeam.name || matchTeam.display_name,
                    display_name: matchTeam.display_name || matchTeam.name,
                    abbreviation: matchTeam.abbreviation,
                    logo: matchTeam.logo,
                    league_slugs: [sampleMatch.league_slug],
                    source: { club_id: matchTeam.source_id || teamId }
                };
            }
        }

        if (!club) {
            return res.status(404).json({ error: 'Team not found' });
        }

        const clubId = club.source?.club_id || club.slug || teamId;
        const clubNamePattern = new RegExp(esc(club.name || cleanName), 'i');

        const isClubYouth = /\b(u[-_]?\s*(?:15|16|17|18|19|20|21|23)|youth|academy|reserves?|primavera)\b/i.test(`${club.name || ''} ${(club.league_slugs || []).join(' ')}`);

        const [recentRaw, upcomingRaw] = await Promise.all([
            SoccerMatch.find({
                $or: [
                    { 'home.source_id': clubId },
                    { 'away.source_id': clubId },
                    { 'home.name': clubNamePattern },
                    { 'away.name': clubNamePattern }
                ],
                'status.state': 'post'
            }).sort({ date: -1 }).limit(20).lean(),
            SoccerMatch.find({
                $or: [
                    { 'home.source_id': clubId },
                    { 'away.source_id': clubId },
                    { 'home.name': clubNamePattern },
                    { 'away.name': clubNamePattern }
                ],
                'status.state': 'pre'
            }).sort({ date: 1 }).limit(10).lean()
        ]);

        const filterValidClubMatches = (list) => {
            return (list || []).filter(m => {
                const hNorm = normalizeTeamName(m.home?.name || m.home?.display_name || '');
                const aNorm = normalizeTeamName(m.away?.name || m.away?.display_name || '');
                if (!hNorm || !aNorm || hNorm === aNorm) return false;
                if (!isClubYouth) {
                    const hasYouth = /\b(u[-_]?\s*(?:15|16|17|18|19|20|21|23)|youth|academy|reserves?|primavera)\b/i.test(`${m.home?.name} ${m.away?.name} ${m.league_slug}`);
                    if (hasYouth) return false;
                }
                return true;
            });
        };

        const recentMatches = filterValidClubMatches(recentRaw).slice(0, 10);
        const upcomingMatches = filterValidClubMatches(upcomingRaw).slice(0, 5);

        res.set('Cache-Control', 'public, max-age=60');
        return res.json({
            status: 'success',
            team: typeof serializeClub === 'function' ? serializeClub(club) : club,
            recentMatches: recentMatches.map(serializeScoreboardEvent),
            upcomingMatches: upcomingMatches.map(serializeScoreboardEvent)
        });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to fetch team: ' + err.message });
    }
});

const CREST_DIR = path.join(__dirname, '..', 'public', 'crests');
try { fs.mkdirSync(CREST_DIR, { recursive: true }); } catch {}

const FALLBACK_SVG_PATH = path.join(CREST_DIR, 'fallback-shield.svg');
const FALLBACK_SVG_CONTENT = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="4" fill="#0f172a"/><path d="M12 3L4 6V12C4 16.5 7.5 20.5 12 21.5C16.5 20.5 20 16.5 20 12V6L12 3Z" fill="#1e293b" stroke="#3b82f6" stroke-width="1.2"/><circle cx="12" cy="12" r="3.2" fill="#38bdf8"/><path d="M12 8.8L12.9 10.7L15 11L13.5 12.4L13.8 14.5L12 13.5L10.2 14.5L10.5 12.4L9 11L11.1 10.7L12 8.8Z" fill="#ffffff"/></svg>`;
try {
    if (!fs.existsSync(FALLBACK_SVG_PATH)) {
        fs.writeFileSync(FALLBACK_SVG_PATH, FALLBACK_SVG_CONTENT, 'utf8');
    }
} catch {}

const crestPreCacheQueue = new Set();
async function downloadCrestToDisk(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.startsWith('http')) return;
    if (crestPreCacheQueue.has(rawUrl)) return;
    const hash = crypto.createHash('md5').update(rawUrl).digest('hex');
    const extMatch = rawUrl.match(/\.(png|jpg|jpeg|svg|webp)/i);
    const ext = extMatch ? extMatch[1].toLowerCase() : 'png';
    const filename = `${hash}.${ext}`;
    const localPath = path.join(CREST_DIR, filename);

    if (fs.existsSync(localPath)) {
        try {
            if (fs.statSync(localPath).size > 0) return;
        } catch {}
    }

    crestPreCacheQueue.add(rawUrl);
    try {
        const tmpPath = `${localPath}.tmp.${Date.now()}`;
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
    } catch (_) {
        // Silently ignore upstream CDN network error during background pre-warming
    } finally {
        crestPreCacheQueue.delete(rawUrl);
    }
}

function preCacheMatchCrests(matches) {
    if (!Array.isArray(matches) || !matches.length) return;
    for (const m of matches) {
        if (!m) continue;
        const hLogo = m.home?.logo || '';
        const aLogo = m.away?.logo || '';
        if (hLogo && hLogo.startsWith('http')) downloadCrestToDisk(hLogo);
        if (aLogo && aLogo.startsWith('http')) downloadCrestToDisk(aLogo);
    }
}

const ALLOWED_CREST_HOST_SUFFIXES = [
    'espncdn.com',
    'espn.com',
    'livescore.com',
    'thesports.com',
    'thesportsdb.com',
    'sportscore.com',
    'flagcdn.com',
    'wikimedia.org',
    'sportmonks.com',
    'api-sports.io',
    'flashscore.com',
    'sofascore.com',
    'sofascore.app',
    'fotmob.com',
    'transfermarkt.com',
    'transfermarkt.technology',
    'bbc.co.uk',
    'bbci.co.uk',
    'goal.com',
    'uefa.com',
    'fifa.com',
    'premierleague.com'
];

const MAX_CREST_BYTES = 2 * 1024 * 1024; // 2 MB cap

function isPrivateOrLoopbackHost(rawHostname) {
    if (!rawHostname) return true;
    const h = String(rawHostname).trim().toLowerCase().replace(/^\[|\]$/g, '');
    if (!h) return true;
    if (
        h === 'localhost' ||
        h === '0.0.0.0' ||
        h === '::1' ||
        h === '::' ||
        h.endsWith('.local') ||
        h.endsWith('.internal') ||
        h.endsWith('.localhost')
    ) {
        return true;
    }
    // IPv4 loopback, RFC1918, link-local / cloud metadata (169.254.0.0/16), CGNAT (100.64.0.0/10)
    if (
        /^127\./.test(h) ||
        /^10\./.test(h) ||
        /^192\.168\./.test(h) ||
        /^169\.254\./.test(h) ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
        /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(h) ||
        /^0\./.test(h)
    ) {
        return true;
    }
    // IPv6 private (fc00::/7), link-local (fe80::/10), and IPv4-mapped private addresses
    if (
        /^f[cd][0-9a-f]{2}:/.test(h) ||
        /^fe[89ab][0-9a-f]:/.test(h) ||
        /^::ffff:(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.)/.test(h)
    ) {
        return true;
    }
    return false;
}

function isAllowedCrestUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string' || rawUrl.length > 1024) return false;
    let parsed;
    try {
        parsed = new URL(rawUrl);
    } catch {
        return false;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    if (isPrivateOrLoopbackHost(host)) return false;
    return ALLOWED_CREST_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

function fetchStreamWithRedirects(targetUrl, maxRedirects = 3, enforceCrestAllowlist = false) {
    return new Promise((resolve, reject) => {
        if (maxRedirects <= 0) return reject(new Error('Too many redirects'));
        if (enforceCrestAllowlist && !isAllowedCrestUrl(targetUrl)) {
            return reject(new Error('Disallowed crest host'));
        }
        const client = targetUrl.startsWith('https') ? require('https') : require('http');
        const req = client.get(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
            },
            timeout: 6000
        }, (res) => {
            if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
                res.resume();
                let redirectUrl = res.headers.location;
                if (!redirectUrl.startsWith('http')) {
                    const parsed = new URL(targetUrl);
                    redirectUrl = new URL(redirectUrl, parsed.origin).toString();
                }
                return resolve(fetchStreamWithRedirects(redirectUrl, maxRedirects - 1, enforceCrestAllowlist));
            }
            if (res.statusCode !== 200) {
                res.resume();
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
    if (!isAllowedCrestUrl(rawUrl)) {
        return res.status(403).send('Crest host not permitted');
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
                res.set('X-Content-Type-Options', 'nosniff');
                return res.sendFile(localPath);
            }
        }

        if (crestInFlightMap.has(filename)) {
            await crestInFlightMap.get(filename);
            if (fs.existsSync(localPath) && fs.statSync(localPath).size > 0) {
                res.set('Cache-Control', 'public, max-age=31536000, immutable');
                res.set('X-Content-Type-Options', 'nosniff');
                return res.sendFile(localPath);
            }
        }

        const downloadPromise = (async () => {
            const tmpPath = `${localPath}.tmp.${Date.now()}`;
            try {
                const stream = await fetchStreamWithRedirects(rawUrl, 3, true);
                const contentLength = Number(stream.headers?.['content-length'] || 0);
                if (contentLength > MAX_CREST_BYTES) {
                    stream.destroy();
                    throw new Error('Crest exceeds maximum allowed size');
                }
                await new Promise((resolve, reject) => {
                    let received = 0;
                    const fileStream = fs.createWriteStream(tmpPath);
                    stream.on('data', (chunk) => {
                        received += chunk.length;
                        if (received > MAX_CREST_BYTES) {
                            stream.destroy();
                            fileStream.destroy();
                            reject(new Error('Crest exceeds maximum allowed size'));
                        }
                    });
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
            res.set('X-Content-Type-Options', 'nosniff');
            return res.sendFile(localPath);
        }
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        return res.status(404).send('Crest not found');
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
    if (!requireFeature(req, res, 'webhooks', 'Real-time event webhooks')) return;
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

    // SSRF protection: reject private, loopback, link-local/metadata, and internal hostnames
    if (isPrivateOrLoopbackHost(parsed.hostname)) {
        return res.status(400).json({ error: 'Loopback, link-local, and private network destination addresses are not permitted' });
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
            redirect: 'manual',
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
module.exports.getLeagueLeaders = getLeagueLeaders;
module.exports.getLeagueBracket = getLeagueBracket;
module.exports.computeAttackingPressureIndex = computeAttackingPressureIndex;
module.exports.extractBoxscoreStatsMap = extractBoxscoreStatsMap;
module.exports.computeEnrichedPredictionModel = computeEnrichedPredictionModel;
module.exports.recomputeAnalyticsFromFormattedRecent = recomputeAnalyticsFromFormattedRecent;
module.exports.isPrivateOrLoopbackHost = isPrivateOrLoopbackHost;
module.exports.isAllowedCrestUrl = isAllowedCrestUrl;
module.exports.handleCrestProxy = handleCrestProxy;
module.exports.liveStreamHub = liveStreamHub;
module.exports.MAX_SSE_CLIENTS = MAX_SSE_CLIENTS;
module.exports.parseLiveScoreEsd = parseLiveScoreEsd;
module.exports.recordRecentFinishedMatch = recordRecentFinishedMatch;
module.exports.recentFinishedMatches = recentFinishedMatches;
module.exports.fetchFreshWorldwideLiveMatches = fetchFreshWorldwideLiveMatches;
module.exports.fetchLiveScoreDayMatches = fetchLiveScoreDayMatches;
module.exports.fetchEspnLeagueScoreboard = fetchEspnLeagueScoreboard;
module.exports.fetchEspnDayBoardExtras = fetchEspnDayBoardExtras;
module.exports.getMatchUtcDateKey = getMatchUtcDateKey;
module.exports.isActivelyLiveMatch = isActivelyLiveMatch;
module.exports.doesMatchBelongToDate = doesMatchBelongToDate;
