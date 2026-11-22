/**
 * Render-Ready Daily Fixture Board Cache & Kickoff-Window Scheduler (WAT / UTC+1)
 *
 * Deep module hiding:
 *  - Per-day render-ready match snapshots in RAM (today, yesterday, tomorrow)
 *  - In-place live delta patching that preserves canonical league slugs (never demotes esp.1 -> other)
 *  - Kickoff-window tracking so background live polling only runs aggressively during active match windows
 *  - WAT (UTC+1 / Africa/Lagos) scheduled daily sync calculation (00:05, 09:00, 14:00 WAT)
 */

const WAT_OFFSET_MS = 60 * 60 * 1000; // UTC+1 (West Africa Time)
const DEFAULT_WAT_SYNC_SLOTS = [
    { hour: 0, minute: 5, label: '00:05 WAT' },
    { hour: 9, minute: 0, label: '09:00 WAT' },
    { hour: 14, minute: 0, label: '14:00 WAT' }
];
const MAX_CACHED_DAYS = 7;
const PRE_KICKOFF_LEAD_MS = 5 * 60 * 1000;    // Start active polling 5 min before kickoff
const POST_KICKOFF_WINDOW_MS = 135 * 60 * 1000; // Cover 90' + stoppage + HT + extra time/pens

const boardsByDate = new Map();

function normalizeDateKey(dateKey) {
    return String(dateKey || '').replace(/[^0-9]/g, '').slice(0, 8);
}

function getWatDateKey(nowMs = Date.now()) {
    const wat = new Date(nowMs + WAT_OFFSET_MS);
    const y = wat.getUTCFullYear();
    const m = String(wat.getUTCMonth() + 1).padStart(2, '0');
    const d = String(wat.getUTCDate()).padStart(2, '0');
    return `${y}${m}${d}`;
}

function isGenericSlug(slug) {
    const s = String(slug || '').trim().toLowerCase();
    return !s || s === 'other' || s === 'w.other' || s === 'international' || s === 'all' || s === 'unknown' || s.endsWith('.lower');
}

function matchIdentityKeys(m) {
    const keys = [];
    if (m?.id) keys.push(`id:${String(m.id)}`);
    if (m?.uid) keys.push(`uid:${String(m.uid)}`);
    if (m?.source?.event_id) keys.push(`ev:${String(m.source.event_id)}`);
    if (m?.source?.livescore_id) keys.push(`ls:${String(m.source.livescore_id)}`);
    const h = String(m?.home?.name || m?.home?.displayName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const a = String(m?.away?.name || m?.away?.displayName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (h && a) keys.push(`pair:${[h, a].sort().join('_vs_')}`);
    return keys;
}

function isMatchLive(m) {
    return Boolean(m?.status?.isLive || m?.status?.state === 'in');
}

function isMatchFinished(m) {
    return Boolean(
        m?.status?.completed ||
        m?.status?.state === 'post' ||
        /^(FT|AET|AP|Final|Postp|Canc|Abd)/i.test(String(m?.status?.detail || m?.status?.clock || ''))
    );
}

function extractKickoffTimes(matches) {
    const times = [];
    for (const m of matches) {
        if (!m?.date) continue;
        const ts = Date.parse(m.date);
        if (Number.isFinite(ts)) times.push(ts);
    }
    return times;
}

function setReadyBoard(dateKey, matches) {
    const key = normalizeDateKey(dateKey);
    if (!key || !Array.isArray(matches)) return null;

    // Shallow-clone entries so callers mutating response arrays cannot corrupt cache
    const storedMatches = matches.map((m) => ({ ...m }));
    const indexByKey = new Map();
    for (let i = 0; i < storedMatches.length; i++) {
        for (const k of matchIdentityKeys(storedMatches[i])) {
            if (!indexByKey.has(k)) indexByKey.set(k, i);
        }
    }

    const entry = {
        dateKey: key,
        generatedAt: Date.now(),
        lastPatchedAt: Date.now(),
        matches: storedMatches,
        indexByKey,
        kickoffTimes: extractKickoffTimes(storedMatches)
    };
    boardsByDate.set(key, entry);

    while (boardsByDate.size > MAX_CACHED_DAYS) {
        const oldestKey = boardsByDate.keys().next().value;
        boardsByDate.delete(oldestKey);
    }
    return entry;
}

function parseClockMinutes(m) {
    const raw = String(m?.status?.clock || m?.status?.detail || '').trim();
    if (/90\+|9[0-9]|1[0-2][0-9]|AET|ET|Pen/i.test(raw)) return 90;
    const match = raw.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
}

function finalizeMatchToFt(m) {
    const hScore = Number(m?.home?.score ?? 0);
    const aScore = Number(m?.away?.score ?? 0);
    const hasScores = !Number.isNaN(hScore) && !Number.isNaN(aScore);
    return {
        ...m,
        _missedLivePolls: 0,
        status: {
            ...(m.status || {}),
            state: 'post',
            name: 'STATUS_FULL_TIME',
            description: 'Full Time',
            clock: 'FT',
            detail: 'FT',
            short_detail: 'FT',
            completed: true,
            isLive: false
        },
        home: {
            ...(m.home || {}),
            ...(hasScores ? { winner: hScore > aScore } : {})
        },
        away: {
            ...(m.away || {}),
            ...(hasScores ? { winner: aScore > hScore } : {})
        }
    };
}

function getReadyBoard(dateKey, { status = 'all', maxAgeMs = 12 * 60 * 60 * 1000 } = {}) {
    const key = normalizeDateKey(dateKey);
    const entry = boardsByDate.get(key);
    if (!entry) return null;
    if (maxAgeMs > 0 && (Date.now() - entry.generatedAt > maxAgeMs)) return null;

    // Auto-finalize any match stuck in live state well past full-time (e.g., 90+ games after kickoff + 115m)
    const nowMs = Date.now();
    for (let i = 0; i < entry.matches.length; i++) {
        const m = entry.matches[i];
        if (!isMatchLive(m)) continue;
        const kickoffTs = m.date ? Date.parse(m.date) : NaN;
        if (!Number.isFinite(kickoffTs)) continue;
        const elapsedMs = nowMs - kickoffTs;
        const mins = parseClockMinutes(m);
        if (elapsedMs > 135 * 60 * 1000 || (mins >= 88 && elapsedMs > 115 * 60 * 1000)) {
            entry.matches[i] = finalizeMatchToFt(m);
        }
    }

    let filtered = entry.matches;
    if (status === 'live') {
        filtered = entry.matches.filter(isMatchLive);
    } else if (status === 'finished') {
        filtered = entry.matches.filter(isMatchFinished);
    } else if (status === 'scheduled') {
        filtered = entry.matches.filter((m) => !isMatchLive(m) && !isMatchFinished(m));
    }

    return {
        dateKey: entry.dateKey,
        generatedAt: entry.generatedAt,
        lastPatchedAt: entry.lastPatchedAt,
        hasLive: entry.matches.some(isMatchLive),
        matches: filtered
    };
}

function patchLiveMatchesInBoard(dateKey, liveMatches, { isFullSnapshot = true } = {}) {
    const key = normalizeDateKey(dateKey);
    const entry = boardsByDate.get(key);
    if (!entry || !Array.isArray(liveMatches)) return 0;

    const nowMs = Date.now();
    const liveKeySet = new Set();
    let patchedCount = 0;

    for (const live of liveMatches) {
        if (!live) continue;
        const keys = matchIdentityKeys(live);
        for (const k of keys) liveKeySet.add(k);

        let existingIdx = -1;
        for (const k of keys) {
            if (entry.indexByKey.has(k)) {
                existingIdx = entry.indexByKey.get(k);
                break;
            }
        }

        if (existingIdx >= 0) {
            const existing = entry.matches[existingIdx];
            // Never revert a completed match back to live unless explicit non-completed live score
            if (isMatchFinished(existing) && !isMatchFinished(live)) continue;

            // Preserve canonical specific league metadata (e.g., esp.1) over generic live slugs (other/.lower)
            const existingSlug = existing.league?.slug || existing.league_slug || '';
            const liveSlug = live.league?.slug || live.league_slug || '';
            const keepExistingLeague = !isGenericSlug(existingSlug) && (isGenericSlug(liveSlug) || existingSlug !== liveSlug);

            const merged = {
                ...existing,
                _missedLivePolls: 0,
                _lastSeenLiveAt: nowMs,
                status: {
                    ...(existing.status || {}),
                    ...(live.status || {})
                },
                home: {
                    ...(existing.home || {}),
                    ...(live.home || {}),
                    logo: existing.home?.logo || live.home?.logo || ''
                },
                away: {
                    ...(existing.away || {}),
                    ...(live.away || {}),
                    logo: existing.away?.logo || live.away?.logo || ''
                },
                league: keepExistingLeague ? existing.league : (live.league || existing.league),
                league_slug: keepExistingLeague ? existingSlug : (liveSlug || existingSlug)
            };
            entry.matches[existingIdx] = merged;
            patchedCount++;
        } else {
            // Newly detected live match not yet in board: append and index
            const idx = entry.matches.length;
            const copy = { ...live, _missedLivePolls: 0, _lastSeenLiveAt: nowMs };
            entry.matches.push(copy);
            for (const k of keys) {
                if (!entry.indexByKey.has(k)) entry.indexByKey.set(k, idx);
            }
            if (copy.date) {
                const ts = Date.parse(copy.date);
                if (Number.isFinite(ts)) entry.kickoffTimes.push(ts);
            }
            patchedCount++;
        }
    }

    // Reconcile matches that were live in the cached board but dropped out of the latest full live snapshot -> FT
    if (isFullSnapshot) {
        for (let i = 0; i < entry.matches.length; i++) {
            const m = entry.matches[i];
            if (!isMatchLive(m)) continue;
            const keys = matchIdentityKeys(m);
            const stillLive = keys.some((k) => liveKeySet.has(k));
            if (stillLive) continue;

            const missed = (m._missedLivePolls || 0) + 1;
            const mins = parseClockMinutes(m);
            const kickoffTs = m.date ? Date.parse(m.date) : NaN;
            const elapsedMs = Number.isFinite(kickoffTs) ? (nowMs - kickoffTs) : 0;

            if (mins >= 85 || missed >= 2 || elapsedMs >= 115 * 60 * 1000) {
                entry.matches[i] = finalizeMatchToFt(m);
                patchedCount++;
            } else {
                entry.matches[i] = { ...m, _missedLivePolls: missed };
            }
        }
    }

    if (patchedCount > 0) {
        entry.lastPatchedAt = nowMs;
    }
    return patchedCount;
}

function hasActiveMatchWindow(nowMs = Date.now(), dateKey = null) {
    const key = normalizeDateKey(dateKey || getWatDateKey(nowMs));
    const entry = boardsByDate.get(key);
    // If today's board isn't cached yet, assume active so boot/first sync runs normally
    if (!entry) return true;

    if (entry.matches.some(isMatchLive)) return true;

    for (const kickoffTs of entry.kickoffTimes) {
        if (nowMs >= (kickoffTs - PRE_KICKOFF_LEAD_MS) && nowMs <= (kickoffTs + POST_KICKOFF_WINDOW_MS)) {
            return true;
        }
    }
    return false;
}

function getNextWatSyncDelayMs(nowMs = Date.now(), slots = DEFAULT_WAT_SYNC_SLOTS) {
    const watNow = new Date(nowMs + WAT_OFFSET_MS);
    const y = watNow.getUTCFullYear();
    const m = watNow.getUTCMonth();
    const d = watNow.getUTCDate();

    let bestDelay = Infinity;
    let bestLabel = slots[0]?.label || '09:00 WAT';

    for (const dayDelta of [0, 1]) {
        for (const slot of slots) {
            const targetWatUtc = Date.UTC(y, m, d + dayDelta, slot.hour, slot.minute, 0, 0) - WAT_OFFSET_MS;
            const delay = targetWatUtc - nowMs;
            if (delay > 1000 && delay < bestDelay) {
                bestDelay = delay;
                bestLabel = slot.label;
            }
        }
    }

    return {
        delayMs: Number.isFinite(bestDelay) ? bestDelay : 6 * 60 * 60 * 1000,
        label: bestLabel
    };
}

function clearBoardCache() {
    boardsByDate.clear();
}

module.exports = {
    WAT_OFFSET_MS,
    DEFAULT_WAT_SYNC_SLOTS,
    getWatDateKey,
    setReadyBoard,
    getReadyBoard,
    patchLiveMatchesInBoard,
    hasActiveMatchWindow,
    getNextWatSyncDelayMs,
    clearBoardCache
};
