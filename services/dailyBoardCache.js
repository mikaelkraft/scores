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

function getBoardMatchTier(m) {
    const slug = String(m?.league?.slug || m?.league_slug || '').toLowerCase();
    const h = String(m?.home?.name || m?.home?.displayName || m?.home?.display_name || '').trim();
    const a = String(m?.away?.name || m?.away?.displayName || m?.away?.display_name || '').trim();
    const blob = `${h} ${a} ${slug} ${m?.league?.name || ''}`;
    const isWomen = /\.w\.|\.w$/.test(slug) || /\b(women|woman|ladies|femenil|femenino|frauen|damen|vrouwen|wsl|nwsl|uwcl|wfc)\b|\(w\)|\bw\b$/i.test(blob);
    const isTeamYouthOrB = (name) => /\b(u-?2[0-3]|u-?1[5-9]|youth|primavera|pl2|reserves?)\b/i.test(name) || /\s+(?:ii|b)$/i.test(name);
    const isYouth = isTeamYouthOrB(h) || isTeamYouthOrB(a) || /\b(youth|u21|u20|u19|u18|u17|primavera)\b/.test(slug);
    return `${isWomen ? 'w' : 'm'}_${isYouth ? 'y' : 's'}`;
}

function matchIdentityKeys(m) {
    const keys = [];
    if (m?.id) keys.push(`id:${String(m.id)}`);
    if (m?.uid) keys.push(`uid:${String(m.uid)}`);
    if (m?.source?.event_id) keys.push(`ev:${String(m.source.event_id)}`);
    if (m?.source?.livescore_id) keys.push(`ls:${String(m.source.livescore_id)}`);
    if (m?.source?.espn_id) keys.push(`espn:${String(m.source.espn_id)}`);
    const h = String(m?.home?.name || m?.home?.displayName || m?.home?.display_name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const a = String(m?.away?.name || m?.away?.displayName || m?.away?.display_name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (h && a) {
        const tier = getBoardMatchTier(m);
        keys.push(`pair:${[h, a].sort().join('_vs_')}_${tier}`);
    }
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
    if (/^(HT|Half\s*Time)$/i.test(raw)) return 45.5;
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
        _autoFinalized: true,
        _autoFinalizedAt: Date.now(),
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

    // Auto-finalize any match stuck in live state well past full-time (e.g., 90+ games after kickoff + 120m, or 155m hard cap)
    const nowMs = Date.now();
    for (let i = 0; i < entry.matches.length; i++) {
        const m = entry.matches[i];
        if (!isMatchLive(m)) continue;
        const kickoffTs = m.date ? Date.parse(m.date) : NaN;
        if (!Number.isFinite(kickoffTs)) continue;
        const elapsedMs = nowMs - kickoffTs;
        const mins = parseClockMinutes(m);
        if (elapsedMs > 155 * 60 * 1000 || (mins >= 90 && elapsedMs > 120 * 60 * 1000)) {
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
            const exFinished = isMatchFinished(existing);
            const lvFinished = isMatchFinished(live);
            const exH = parseNumericScore(existing.home?.score);
            const exA = parseNumericScore(existing.away?.score);
            const lvH = parseNumericScore(live.home?.score);
            const lvA = parseNumericScore(live.away?.score);
            const existingGoals = (exH ?? 0) + (exA ?? 0);
            const liveGoals = (lvH ?? 0) + (lvA ?? 0);

            // Protect legitimately finished matches from reverting to live,
            // EXCEPT when heuristically auto-finalized, when within an impossible-FT window (< 102m) with an active live clock,
            // or when within a plausible live window with new goals scored.
            if (exFinished && !lvFinished) {
                const kickoffTs = existing.date ? Date.parse(existing.date) : NaN;
                const elapsedMs = Number.isFinite(kickoffTs) ? (nowMs - kickoffTs) : Infinity;
                const isPostpOrCanc = /^(Postp|Canc|Abd)/i.test(String(existing.status?.detail || existing.status?.clock || ''));
                const hasConcreteLiveClock = Boolean(
                    live.status?.isLive ||
                    /^(HT|\d{1,3}(?:\+\d{1,2})?'?)$/i.test(String(live.status?.clock || live.status?.detail || '').trim())
                );
                const canRevive = Boolean(existing._autoFinalized)
                    || (!isPostpOrCanc && elapsedMs >= 0 && elapsedMs < 102 * 60 * 1000 && hasConcreteLiveClock)
                    || (!isPostpOrCanc && elapsedMs >= 0 && elapsedMs < 155 * 60 * 1000 && liveGoals > existingGoals);
                if (!canRevive) continue;
            } else if (exFinished && lvFinished) {
                // Both finished: only update if healing an auto-finalized entry or incoming has a higher score
                const canUpgradeFt = Boolean(existing._autoFinalized && lvH !== null && lvA !== null)
                    || (lvH !== null && lvA !== null && liveGoals > existingGoals);
                if (!canUpgradeFt) continue;
            }

            // Guard against lagging live sources (e.g. stale DB snapshot at 45' 1-0) regressing a newer live state (78' 2-1)
            const preventLiveRegression = !exFinished && !lvFinished &&
                exH !== null && exA !== null && lvH !== null && lvA !== null &&
                existingGoals > liveGoals &&
                parseClockMinutes(existing) > parseClockMinutes(live);

            // Preserve canonical specific league metadata (e.g., esp.1) over generic live slugs (other/.lower)
            const existingSlug = existing.league?.slug || existing.league_slug || '';
            const liveSlug = live.league?.slug || live.league_slug || '';
            const keepExistingLeague = !isGenericSlug(existingSlug) && (isGenericSlug(liveSlug) || existingSlug !== liveSlug);

            const merged = {
                ...existing,
                _missedLivePolls: 0,
                _autoFinalized: false,
                _lastSeenLiveAt: nowMs,
                status: preventLiveRegression
                    ? existing.status
                    : {
                        ...(existing.status || {}),
                        ...(live.status || {})
                    },
                home: {
                    ...(existing.home || {}),
                    ...(live.home || {}),
                    ...(preventLiveRegression ? { score: existing.home.score } : {}),
                    logo: existing.home?.logo || live.home?.logo || ''
                },
                away: {
                    ...(existing.away || {}),
                    ...(live.away || {}),
                    ...(preventLiveRegression ? { score: existing.away.score } : {}),
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
            const copy = { ...live, _missedLivePolls: 0, _autoFinalized: false, _lastSeenLiveAt: nowMs };
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
    // Guard against premature FT during 1st half / HT / mid-2nd half provider hiccups (a 90m+HT match needs >= 105m).
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
            const hasKickoff = Number.isFinite(kickoffTs);
            const elapsedMs = hasKickoff ? (nowMs - kickoffTs) : 0;

            const shouldFinalize = hasKickoff
                ? (
                    (mins >= 90 && elapsedMs >= 115 * 60 * 1000) ||
                    (mins >= 88 && missed >= 2 && elapsedMs >= 115 * 60 * 1000) ||
                    (elapsedMs >= 135 * 60 * 1000 && missed >= 2) ||
                    (elapsedMs >= 160 * 60 * 1000)
                )
                : ((mins >= 90 && missed >= 2) || missed >= 6);

            if (shouldFinalize) {
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

function findMatchInBoards(matchOrId) {
    if (!matchOrId || boardsByDate.size === 0) return null;
    const keys = typeof matchOrId === 'string' || typeof matchOrId === 'number'
        ? [`id:${String(matchOrId)}`, `ev:${String(matchOrId)}`, `ls:${String(matchOrId)}`, `espn:${String(matchOrId)}`, `uid:${String(matchOrId)}`]
        : matchIdentityKeys(matchOrId);
    if (!keys.length) return null;

    // Check most recently cached boards first
    const entries = Array.from(boardsByDate.values()).reverse();
    for (const entry of entries) {
        for (const k of keys) {
            if (entry.indexByKey.has(k)) {
                const idx = entry.indexByKey.get(k);
                const m = entry.matches[idx];
                if (m) return m;
            }
        }
    }
    return null;
}

function patchMatchInBoards(matchUpdate, { authoritative = false } = {}) {
    if (!matchUpdate || boardsByDate.size === 0) return false;
    const keys = matchIdentityKeys(matchUpdate);
    if (!keys.length) return false;

    const isAuthoritative = Boolean(authoritative || matchUpdate._authoritative);
    let patched = false;
    for (const entry of boardsByDate.values()) {
        let idx = -1;
        for (const k of keys) {
            if (entry.indexByKey.has(k)) {
                idx = entry.indexByKey.get(k);
                break;
            }
        }
        if (idx < 0) continue;
        const existing = entry.matches[idx];
        if (!existing) continue;

        const exH = parseNumericScore(existing.home?.score);
        const exA = parseNumericScore(existing.away?.score);
        const upH = parseNumericScore(matchUpdate.home?.score);
        const upA = parseNumericScore(matchUpdate.away?.score);
        const exGoals = (exH ?? 0) + (exA ?? 0);
        const upGoals = (upH ?? 0) + (upA ?? 0);

        const exFinished = isMatchFinished(existing);
        const exLive = !exFinished && isMatchLive(existing);
        const upFinished = isMatchFinished(matchUpdate);
        const upLive = !upFinished && isMatchLive(matchUpdate);
        const nowMs = Date.now();
        const kickoffTs = existing.date ? Date.parse(existing.date) : NaN;
        const elapsedMs = Number.isFinite(kickoffTs) ? (nowMs - kickoffTs) : Infinity;
        const exIsPostpOrCanc = /^(Postp|Canc|Abd)/i.test(String(existing.status?.detail || existing.status?.clock || ''));
        const hasConcreteLiveClock = Boolean(
            matchUpdate.status?.isLive ||
            /^(HT|\d{1,3}(?:\+\d{1,2})?'?)$/i.test(String(matchUpdate.status?.clock || matchUpdate.status?.detail || '').trim())
        );
        const canReviveFromFt = Boolean(
            exFinished && upLive && !exIsPostpOrCanc && (
                Boolean(existing._autoFinalized) ||
                (elapsedMs >= 0 && elapsedMs < 102 * 60 * 1000 && hasConcreteLiveClock) ||
                (elapsedMs >= 0 && elapsedMs < 155 * 60 * 1000 && upH !== null && upA !== null && upGoals > exGoals)
            )
        );
        const transitionedToLive = Boolean(!exFinished && !exLive && upLive);
        const canHealAutoFinalized = Boolean(
            existing._autoFinalized && upFinished && upH !== null && upA !== null &&
            (isAuthoritative || upH !== exH || upA !== exA)
        );
        const scoreChangedOnFinish = Boolean(
            !exFinished && upFinished && upH !== null && upA !== null && (upH !== exH || upA !== exA)
        );
        const scoreImproved = upH !== null && upA !== null && (
            upGoals > exGoals ||
            (exH === null || exA === null) ||
            canHealAutoFinalized ||
            scoreChangedOnFinish ||
            (canReviveFromFt && upGoals >= exGoals)
        );
        const statusImproved = (!exFinished && upFinished);
        const liveClockAdvanced = Boolean(
            !exFinished && upLive &&
            parseClockMinutes(matchUpdate) > parseClockMinutes(existing) &&
            (upH === null || upA === null || upGoals >= exGoals)
        );
        const shouldApplyLiveStatus = canReviveFromFt || transitionedToLive || liveClockAdvanced;

        if (scoreImproved || statusImproved || shouldApplyLiveStatus) {
            const nextH = scoreImproved ? upH : existing.home?.score;
            const nextA = scoreImproved ? upA : existing.away?.score;
            const nextStatus = statusImproved
                ? {
                    ...(existing.status || {}),
                    ...(matchUpdate.status || {}),
                    state: 'post',
                    completed: true,
                    isLive: false,
                    clock: matchUpdate.status?.clock || 'FT',
                    detail: matchUpdate.status?.detail || 'FT'
                }
                : (shouldApplyLiveStatus
                    ? {
                        ...(existing.status || {}),
                        ...(matchUpdate.status || {}),
                        state: 'in',
                        completed: false,
                        isLive: true
                    }
                    : existing.status);

            entry.matches[idx] = {
                ...existing,
                ...((upFinished && (isAuthoritative || scoreImproved)) || canReviveFromFt ? { _autoFinalized: false } : {}),
                ...(shouldApplyLiveStatus ? { _missedLivePolls: 0, _lastSeenLiveAt: nowMs } : {}),
                status: nextStatus,
                home: {
                    ...(existing.home || {}),
                    ...(nextH !== undefined ? { score: nextH } : {}),
                    ...(nextStatus?.completed && Number.isFinite(Number(nextH)) && Number.isFinite(Number(nextA))
                        ? { winner: Number(nextH) > Number(nextA) }
                        : (shouldApplyLiveStatus ? { winner: false } : {}))
                },
                away: {
                    ...(existing.away || {}),
                    ...(nextA !== undefined ? { score: nextA } : {}),
                    ...(nextStatus?.completed && Number.isFinite(Number(nextH)) && Number.isFinite(Number(nextA))
                        ? { winner: Number(nextA) > Number(nextH) }
                        : (shouldApplyLiveStatus ? { winner: false } : {}))
                }
            };
            entry.lastPatchedAt = nowMs;
            patched = true;
        }
    }
    return patched;
}

function patchMatchesInBoards(matchUpdates, opts = {}) {
    if (!Array.isArray(matchUpdates) || matchUpdates.length === 0 || boardsByDate.size === 0) return 0;
    let count = 0;
    for (const m of matchUpdates) {
        if (m && patchMatchInBoards(m, opts)) count++;
    }
    return count;
}

function extractScoreFromKeyEvents(keyEvents = []) {
    if (!Array.isArray(keyEvents) || keyEvents.length === 0) return null;
    let bestH = -1;
    let bestA = -1;
    let homeGoals = 0;
    let awayGoals = 0;
    let countedGoals = 0;

    for (const ev of keyEvents) {
        if (!ev) continue;
        const typeStr = String(ev.type?.text || ev.type || '');
        const txt = String(ev.text || '');
        const isNonScoring = /\b(miss|missed|saved|disallowed|cancelled|canceled|overturned|no goal|awarded)\b/i.test(`${typeStr} ${txt}`);
        const isGoal = !isNonScoring && (
            Boolean(ev.scoringPlay) ||
            /\b(goal|own goal|penalty\s*-\s*scored|penalty\s+goal)\b/i.test(typeStr)
        );
        if (!isGoal) continue;

        if (Array.isArray(ev.Sc) && ev.Sc.length >= 2) {
            const h = Number(ev.Sc[0]);
            const a = Number(ev.Sc[1]);
            if (Number.isFinite(h) && Number.isFinite(a) && (h + a) >= (bestH + bestA)) {
                bestH = h;
                bestA = a;
            }
        }
        const scoreTag = txt.match(/\((\d+)\s*[-–:]\s*(\d+)\)\s*$/);
        if (scoreTag) {
            const h = parseInt(scoreTag[1], 10);
            const a = parseInt(scoreTag[2], 10);
            if (Number.isFinite(h) && Number.isFinite(a) && (h + a) >= (bestH + bestA)) {
                bestH = h;
                bestA = a;
            }
        }
        if (ev.team?.side === 'home' || ev.team?.homeAway === 'home') {
            homeGoals++;
            countedGoals++;
        } else if (ev.team?.side === 'away' || ev.team?.homeAway === 'away') {
            awayGoals++;
            countedGoals++;
        }
    }

    if (bestH >= 0 && bestA >= 0) return { home: bestH, away: bestA };
    if (countedGoals > 0) return { home: homeGoals, away: awayGoals };
    return null;
}

function normalizeCandidateState(statusObj) {
    if (!statusObj) return { state: 'unknown', completed: false, isLive: false, clock: '', detail: '' };
    const type = statusObj.type || {};
    const rawState = String(statusObj.state || type.state || '').toLowerCase();
    const detail = String(statusObj.detail || statusObj.short_detail || type.shortDetail || type.detail || statusObj.clock || '').trim();
    const clock = String(statusObj.clock || statusObj.displayClock || type.shortDetail || detail || '').trim();
    const completed = Boolean(
        statusObj.completed ||
        type.completed ||
        rawState === 'post' ||
        /^(FT|AET|AP|Final|Postp|Canc|Abd)/i.test(detail)
    );
    const isLive = !completed && Boolean(statusObj.isLive || rawState === 'in');
    const state = completed ? 'post' : (isLive ? 'in' : (rawState === 'pre' ? 'pre' : 'unknown'));
    return { state, completed, isLive, clock, detail };
}

function parseNumericScore(val) {
    if (val === null || val === undefined || val === '' || val === '—' || val === '-') return null;
    const n = Number(val);
    return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Reconcile a serialized match summary header against dailyBoardCache, live feed, LiveScore details,
 * and the summary's own goal timeline so Home Display and Match Detail/Telemetry NEVER disagree.
 */
function reconcileSummaryWithBoardAndEvents(summary, { boardMatch = null, liveMatch = null, lsData = null, nowMs = Date.now() } = {}) {
    if (!summary?.header?.competitions?.[0]) return { summary, boardNeedsHeal: false };
    const comp = summary.header.competitions[0];
    const competitors = Array.isArray(comp.competitors) ? comp.competitors : [];
    const homeComp = competitors.find(c => c.homeAway === 'home') || competitors[0];
    const awayComp = competitors.find(c => c.homeAway === 'away') || competitors[1];
    if (!homeComp || !awayComp) return { summary, boardNeedsHeal: false };

    const curStatus = normalizeCandidateState(comp.status);
    const curH = parseNumericScore(homeComp.score);
    const curA = parseNumericScore(awayComp.score);

    const candidates = [
        { source: 'summary', status: curStatus, home: curH, away: curA }
    ];

    if (boardMatch) {
        candidates.push({
            source: 'board',
            status: normalizeCandidateState(boardMatch.status),
            home: parseNumericScore(boardMatch.home?.score),
            away: parseNumericScore(boardMatch.away?.score)
        });
    }
    if (liveMatch) {
        candidates.push({
            source: 'live',
            status: normalizeCandidateState(liveMatch.status),
            home: parseNumericScore(liveMatch.home?.score),
            away: parseNumericScore(liveMatch.away?.score)
        });
    }
    if (lsData && (lsData.score || lsData.status)) {
        candidates.push({
            source: 'livescore',
            status: normalizeCandidateState(lsData.status),
            home: parseNumericScore(lsData.score?.home),
            away: parseNumericScore(lsData.score?.away)
        });
    }

    const timelineScore = extractScoreFromKeyEvents(summary.keyEvents || comp.details || []);
    if (timelineScore) {
        candidates.push({
            source: 'timeline',
            status: { state: 'unknown', completed: false, isLive: false, clock: '', detail: '' },
            home: timelineScore.home,
            away: timelineScore.away
        });
    }

    const kickoffTs = comp.date ? Date.parse(comp.date) : (boardMatch?.date ? Date.parse(boardMatch.date) : NaN);
    const elapsedMs = Number.isFinite(kickoffTs) ? (nowMs - kickoffTs) : NaN;

    // 1. Resolve authoritative status
    let bestStatus = curStatus;
    const anyLiveWithConcreteClock = candidates.find(c =>
        c.status.isLive &&
        /^(HT|\d{1,3}(?:\+\d{1,2})?'?)$/i.test(String(c.status.clock || c.status.detail || '').trim())
    );
    const anyCompleted = candidates.find(c => c.status.completed);

    if (anyCompleted) {
        const isPostp = /^(Postp|Canc|Abd)/i.test(anyCompleted.status.detail);
        const insideImpossibleFtWindow = Number.isFinite(elapsedMs) && elapsedMs >= 0 && elapsedMs < 102 * 60 * 1000;
        if (!isPostp && insideImpossibleFtWindow && anyLiveWithConcreteClock) {
            bestStatus = anyLiveWithConcreteClock.status;
        } else {
            bestStatus = anyCompleted.status;
        }
    } else if (anyLiveWithConcreteClock) {
        bestStatus = anyLiveWithConcreteClock.status;
    } else {
        const anyIn = candidates.find(c => c.status.state === 'in');
        if (anyIn) bestStatus = anyIn.status;
    }

    // Hard stale-Live protection: a match > 155m past kickoff with no live-feed confirmation cannot still be "Live"
    const confirmedActiveInLiveFeed = Boolean(liveMatch && isMatchLive(liveMatch));
    if (bestStatus.state === 'in' && Number.isFinite(elapsedMs) && elapsedMs > 155 * 60 * 1000 && !confirmedActiveInLiveFeed) {
        bestStatus = {
            state: 'post',
            completed: true,
            isLive: false,
            clock: 'FT',
            detail: 'FT'
        };
    }

    // 2. Resolve authoritative score (highest non-regressing score among non-pre candidates, or timeline floor)
    let bestH = curH;
    let bestA = curA;
    for (const c of candidates) {
        if (c.home === null || c.away === null) continue;
        if (bestH === null || bestA === null) {
            bestH = c.home;
            bestA = c.away;
            continue;
        }
        const curTot = bestH + bestA;
        const candTot = c.home + c.away;
        if (candTot > curTot) {
            bestH = c.home;
            bestA = c.away;
        }
    }

    // Apply reconciled score & status back onto summary.header.competitions[0]
    if (bestH !== null && bestA !== null && bestStatus.state !== 'pre') {
        homeComp.score = String(bestH);
        awayComp.score = String(bestA);
        if (bestStatus.completed) {
            homeComp.winner = bestH > bestA;
            awayComp.winner = bestA > bestH;
        }
    }

    const detailLabel = bestStatus.completed
        ? (bestStatus.detail && /^(FT|AET|AP|Final|Postp|Canc|Abd)/i.test(bestStatus.detail) ? bestStatus.detail : 'FT')
        : (bestStatus.isLive
            ? (bestStatus.clock || bestStatus.detail || 'Live')
            : (bestStatus.detail || comp.status?.type?.shortDetail || 'Scheduled'));

    comp.status = {
        ...(comp.status || {}),
        state: bestStatus.state === 'unknown' ? (comp.status?.state || 'pre') : bestStatus.state,
        displayClock: detailLabel,
        clock: detailLabel,
        detail: detailLabel,
        completed: bestStatus.completed,
        isLive: bestStatus.isLive,
        type: {
            ...(comp.status?.type || {}),
            state: bestStatus.state === 'unknown' ? (comp.status?.type?.state || 'pre') : bestStatus.state,
            completed: bestStatus.completed,
            shortDetail: detailLabel,
            detail: detailLabel,
            description: bestStatus.completed ? 'Full Time' : (bestStatus.isLive ? 'In Progress' : 'Scheduled')
        }
    };

    // Determine whether dailyBoardCache should be healed with the reconciled score/status
    let boardNeedsHeal = false;
    if (boardMatch && bestH !== null && bestA !== null) {
        const bH = parseNumericScore(boardMatch.home?.score) ?? 0;
        const bA = parseNumericScore(boardMatch.away?.score) ?? 0;
        const bFinished = isMatchFinished(boardMatch);
        if ((bestH + bestA) > (bH + bA) || (!bFinished && bestStatus.completed)) {
            boardNeedsHeal = true;
        }
    }

    return {
        summary,
        boardNeedsHeal,
        reconciled: {
            homeScore: bestH,
            awayScore: bestA,
            status: bestStatus
        }
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
    findMatchInBoards,
    patchMatchInBoards,
    patchMatchesInBoards,
    reconcileSummaryWithBoardAndEvents,
    extractScoreFromKeyEvents,
    hasActiveMatchWindow,
    getNextWatSyncDelayMs,
    clearBoardCache
};
