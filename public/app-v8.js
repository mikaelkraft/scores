(() => {
    'use strict';

    const state = {
        leagues: [],
        league: null,
        fixtures: [],
        fixturePage: 1,
        fixturePageCount: 1,
        standings: [],
        matchTimer: null,
        liveSyncTimer: null,
        currentEventId: null,
        drawerActiveTab: 'timeline',
        selectedLeagueSlug: 'all',
        selectedDayOffset: 0,
        selectedDateStr: '',
        currentStatus: 'all',
        pinnedMatches: JSON.parse(localStorage.getItem('norra_pinned_matches') || '[]'),
        goalAlertsEnabled: localStorage.getItem('norra_goal_alerts') === 'true',
        liveEventSource: null,
        searchQuery: '',
        liveMatchCount: 0,
        collapsedLeagues: new Set()
    };

    const statLabels = {
        gamesPlayed: 'Played', wins: 'Wins', ties: 'Draws', losses: 'Losses',
        points: 'Points', pointDifferential: 'Goal difference', goalDifference: 'Goal difference',
        pointsFor: 'Goals for', pointsAgainst: 'Goals against', possessionPct: 'Possession %',
        totalShots: 'Total shots', shotsOnTarget: 'Shots on target', wonCorners: 'Corners',
        foulsCommitted: 'Fouls', yellowCards: 'Yellow cards', redCards: 'Red cards',
        offsides: 'Offsides', saves: 'Saves'
    };

    const LEAGUE_FLAGS = {
        'eng.1': '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
        'esp.1': '🇪🇸',
        'uefa.champions': '🏆',
        'ita.1': '🇮🇹',
        'ger.1': '🇩🇪',
        'fra.1': '🇫🇷',
        'uefa.europa': '🇪🇺',
        'uefa.europa.conf': '🇪🇺',
        'ned.1': '🇳🇱',
        'por.1': '🇵🇹',
        'eng.2': '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
        'esp.2': '🇪🇸',
        'ita.2': '🇮🇹',
        'ger.2': '🇩🇪',
        'fra.2': '🇫🇷',
        'bel.1': '🇧🇪',
        'tur.1': '🇹🇷',
        'sco.1': '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
        'usa.1': '🇺🇸',
        'ksa.1': '🇸🇦',
        'bra.1': '🇧🇷',
        'arg.1': '🇦🇷',
        'mex.1': '🇲🇽',
        'conmebol.libertadores': '🏆',
        'conmebol.sudamericana': '🏆',
        'uefa.nations': '🇪🇺',
        'eng.fa': '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
        'eng.league_cup': '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
        'esp.copa_del_rey': '🇪🇸',
        'ita.coppa_italia': '🇮🇹',
        'ger.dfb_pokal': '🇩🇪',
        'fra.coupe_de_france': '🇫🇷',
        'aut.1': '🇦🇹',
        'sui.1': '🇨🇭',
        'den.1': '🇩🇰',
        'gre.1': '🇬🇷',
        'swe.1': '🇸🇪',
        'nor.1': '🇳🇴',
        'jpn.1': '🇯🇵',
        'aus.1': '🇦🇺',
        'chn.1': '🇨🇳',
        'fin.1': '🇫🇮',
        'concacaf.champions': '🏆',
        'caf.champions': '🌍',
        'afc.champions': '🌏',
        'fifa.cwc': '🌐',
        'uefa.super_cup': '🏆',
        'conmebol.recopa': '🏆',
        'eng.w.1': '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
        'eng.w.cup': '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
        'eng.w.fa': '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
        'sui.w.1': '🇨🇭',
        'bel.w.1': '🇧🇪',
        'sco.w.1': '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
        'bra.w.1': '🇧🇷',
        'esp.w.1': '🇪🇸',
        'fra.w.1': '🇫🇷',
        'ger.w.1': '🇩🇪',
        'ita.w.1': '🇮🇹',
        'aus.w.1': '🇦🇺',
        'mex.w.1': '🇲🇽',
        'swe.w.1': '🇸🇪',
        'nor.w.1': '🇳🇴',
        'den.w.1': '🇩🇰',
        'ned.w.1': '🇳🇱',
        'por.w.1': '🇵🇹',
        'pol.w.1': '🇵🇱',
        'gre.w.1': '🇬🇷',
        'nga.w.1': '🇳🇬',
        'rsa.w.1': '🇿🇦',
        'uefa.w.champions': '🏆',
        'caf.w.champions': '🌍',
        'fifa.w.worldcup': '🌐',
        'uefa.w.euro': '🏆',
        'w.international': '🌐',
        'usa.w.1': '🇺🇸',
        'usa.usl.1': '🇺🇸',
        'usa.open': '🇺🇸',
        'caf.champions': '🌍',
        'caf.confed': '🌍',
        'caf.nations': '🌍',
        'rsa.1': '🇿🇦',
        'egy.1': '🇪🇬',
        'mar.1': '🇲🇦',
        'nga.1': '🇳🇬',
        'eng.3': '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
        'eng.4': '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
        'col.1': '🇨🇴',
        'mex.2': '🇲🇽',
        'bra.2': '🇧🇷',
        'arg.copa': '🇦🇷',
        'bol.copa': '🇧🇴',
        'fifa.youth': '🌐',
        'club.friendly': '🤝',
        'idn.1': '🇮🇩',
        'tha.1': '🇹🇭',
        'mys.1': '🇲🇾',
        'sgp.1': '🇸🇬',
        'ken.1': '🇰🇪',
        'gha.1': '🇬🇭',
        'uga.1': '🇺🇬',
        'ind.1': '🇮🇳',
        'ind.2': '🇮🇳',
        'afc.cup': '🏆',
        'per.1': '🇵🇪',
        'bol.1': '🇧🇴',
        'ecu.1': '🇪🇨',
        'par.1': '🇵🇾',
        'ven.1': '🇻🇪',
        'uru.1': '🇺🇾',
        'crc.1': '🇨🇷',
        'hon.1': '🇭🇳',
        'gua.1': '🇬🇹',
        'vie.1': '🇻🇳',
        'irn.1': '🇮🇷',
        'uae.1': '🇦🇪',
        'uzb.1': '🇺🇿',
        'rou.2': '🇷🇴',
        'mne.1': '🇲🇪',
        'qat.1': '🇶🇦',
        'irq.1': '🇮🇶',
        'jor.1': '🇯🇴',
        'bhr.1': '🇧🇭',
        'isl.1': '🇮🇸'
    };

    let currentTimezone = localStorage.getItem('norra_timezone') || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

    const elements = Object.fromEntries([
        'service-status', 'stat-competitions', 'stat-matches', 'stat-events',
        'country-select', 'league-select', 'league-card', 'league-logo', 'league-name',
        'league-season', 'coverage-matches', 'coverage-clubs', 'coverage-tables',
        'welcome-state', 'league-dashboard', 'dashboard-country', 'dashboard-title',
        'refresh-button', 'fixtures-tab', 'standings-tab', 'fixture-count', 'fixtures-view',
        'standings-view', 'date-from', 'date-to', 'fixture-status', 'apply-fixture-filter',
        'fixtures-loading', 'fixtures-empty', 'fixtures-list', 'fixtures-load-more', 'standings-loading',
        'standings-empty', 'standings-content', 'match-dialog', 'dialog-status',
        'dialog-date', 'dialog-content', 'close-dialog', 'toast'
    ].map(id => [id, document.getElementById(id)]));

    function escapeHtml(value) {
        if (value === null || value === undefined) return '';
        if (typeof value === 'object') {
            if (value.displayName) value = value.displayName;
            else if (value.fullName) value = value.fullName;
            else if (value.shortName) value = value.shortName;
            else if (value.text) value = value.text;
            else if (value.displayValue) value = value.displayValue;
            else if (value.description) value = value.description;
            else if (value.name) value = value.name;
            else return '';
        }
        let str = String(value);
        if (str.includes('[object Object]')) return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function safeUrl(value) {
        try {
            const url = new URL(String(value));
            return ['http:', 'https:'].includes(url.protocol) ? escapeHtml(url.href) : '';
        } catch {
            return '';
        }
    }

    function formatNumber(value) {
        return new Intl.NumberFormat('en-US').format(Number(value) || 0);
    }

    function formatDate(value, options = {}) {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return 'Time unavailable';
        return new Intl.DateTimeFormat('en-US', {
            timeZone: currentTimezone,
            weekday: options.weekday === false ? undefined : 'long',
            month: 'short',
            day: 'numeric',
            year: options.year ? 'numeric' : undefined
        }).format(date);
    }

    function formatTime(value) {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '—';
        return new Intl.DateTimeFormat('en-GB', {
            timeZone: currentTimezone,
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        }).format(date);
    }

    function isoDateInput(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function setInitialFixtureWindow() {
        state.selectedDayOffset = 0;
        const today = new Date();
        const iso = isoDateInput(today);
        state.selectedDateStr = iso;
        if (elements['date-from']) elements['date-from'].value = iso;
        if (elements['date-to']) elements['date-to'].value = iso;
        const picker = document.getElementById('matchday-picker');
        if (picker) picker.value = iso;

        const bannerEl = document.getElementById('fs-banner-date-text');
        if (bannerEl) {
            const fullDayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            bannerEl.textContent = `Today · ${fullDayNames[today.getDay()]}, ${monthNames[today.getMonth()]} ${today.getDate()}`;
        }
    }

    function setMatchdayDate(dateObj) {
        if (!dateObj || isNaN(dateObj.getTime())) return;
        const iso = isoDateInput(dateObj);
        state.selectedDateStr = iso;
        if (elements['date-from']) elements['date-from'].value = iso;
        if (elements['date-to']) elements['date-to'].value = iso;
        const picker = document.getElementById('matchday-picker');
        if (picker) picker.value = iso;

        // Compute day offset relative to today
        const now = new Date();
        const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const targetMid = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate()).getTime();
        const offset = Math.round((targetMid - todayMid) / (1000 * 60 * 60 * 24));
        state.selectedDayOffset = offset;

        // Formatted date labels
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const fullDayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const dayOfWeek = fullDayNames[dateObj.getDay()];
        const shortDay = dayNames[dateObj.getDay()];
        const monthName = monthNames[dateObj.getMonth()];
        const dayNum = dateObj.getDate();
        const year = dateObj.getFullYear();

        let bannerText = `${dayOfWeek}, ${monthName} ${dayNum}, ${year}`;
        if (offset === 0) bannerText = `Today · ${dayOfWeek}, ${monthName} ${dayNum}`;
        else if (offset === 1) bannerText = `Tomorrow · ${dayOfWeek}, ${monthName} ${dayNum}`;
        else if (offset === -1) bannerText = `Yesterday · ${dayOfWeek}, ${monthName} ${dayNum}`;

        const bannerEl = document.getElementById('fs-banner-date-text');
        if (bannerEl) bannerEl.textContent = bannerText;

        // Update pills
        const pillsList = document.getElementById('date-pills-list');
        if (pillsList) {
            pillsList.querySelectorAll('.date-pill-btn').forEach(b => b.classList.remove('active'));
            let dynamicPill = pillsList.querySelector('.dynamic-date-pill');

            if (offset === -1) {
                const yBtn = pillsList.querySelector('[data-day="yesterday"]');
                if (yBtn) yBtn.classList.add('active');
                if (dynamicPill) dynamicPill.remove();
            } else if (offset === 0) {
                const tBtn = pillsList.querySelector('[data-day="today"]');
                if (tBtn) tBtn.classList.add('active');
                if (dynamicPill) dynamicPill.remove();
            } else if (offset === 1) {
                const tmBtn = pillsList.querySelector('[data-day="tomorrow"]');
                if (tmBtn) tmBtn.classList.add('active');
                if (dynamicPill) dynamicPill.remove();
            } else {
                if (!dynamicPill) {
                    dynamicPill = document.createElement('button');
                    dynamicPill.className = 'date-pill-btn active dynamic-date-pill';
                    dynamicPill.type = 'button';
                    dynamicPill.setAttribute('data-day', 'custom');
                    pillsList.appendChild(dynamicPill);
                }
                dynamicPill.classList.add('active');
                dynamicPill.textContent = `${shortDay}, ${dayNum} ${monthName}`;
            }
        }

        // When navigating dates, reset status filter from 'live' to 'all' so scheduled/finished fixtures are shown
        if (state.currentStatus === 'live' || state.selectedLeagueSlug === 'live') {
            state.currentStatus = 'all';
            const statusPills = document.querySelectorAll('.fs-status-pill');
            statusPills.forEach(p => {
                const isAll = p.dataset.status === 'all';
                p.classList.toggle('active', isAll);
                p.setAttribute('aria-selected', isAll ? 'true' : 'false');
            });
            if (state.selectedLeagueSlug === 'live') {
                state.selectedLeagueSlug = 'all';
                renderQuickLeaguePills('all');
                renderDesktopSidebar('all');
            }
        }

        if (state.selectedLeagueSlug === 'all') {
            loadAllLeagueFixtures();
        } else if (state.league) {
            loadFixtures();
        }
    }

    const inFlightFetchMap = new Map();

    async function fetchJson(path, options = {}) {
        const isGet = !options.method || options.method === 'GET';
        if (isGet && inFlightFetchMap.has(path)) {
            return inFlightFetchMap.get(path);
        }

        const fetchPromise = (async () => {
            try {
                const response = await fetch(path, { headers: { Accept: 'application/json' }, ...options });
                const body = await response.json().catch(() => ({}));
                if (!response.ok) {
                    const message = typeof body.error === 'string'
                        ? body.error
                        : body.error?.message || `HTTP ${response.status}`;
                    throw new Error(message);
                }
                return body;
            } finally {
                inFlightFetchMap.delete(path);
            }
        })();

        if (isGet) {
            inFlightFetchMap.set(path, fetchPromise);
        }

        return fetchPromise;
    }

    function showToast(message) {
        if (!elements.toast) return;
        elements.toast.textContent = message;
        elements.toast.hidden = false;
        window.clearTimeout(showToast.timer);
        showToast.timer = window.setTimeout(() => { elements.toast.hidden = true; }, 4200);
    }

    function localCountryName(country) {
        return country || 'Other';
    }

    function setServiceStatus(type, text) {
        if (!elements['service-status']) return;
        elements['service-status'].className = `nav-status ${type ? `is-${type}` : ''}`;
        elements['service-status'].lastElementChild.textContent = text;
    }

    // Persistent crest cache so repeated list renders do not re-hit upstream
    const crestCacheKey = 'norra_crest_cache_v1';
    let crestMemory = {};
    try { crestMemory = JSON.parse(localStorage.getItem(crestCacheKey) || '{}'); } catch (_) { crestMemory = {}; }

    function rememberCrest(teamId, url) {
        if (!teamId || !url) return;
        crestMemory[String(teamId)] = { url, ts: Date.now() };
        try {
            // Cap cache size
            const keys = Object.keys(crestMemory);
            if (keys.length > 400) {
                keys.slice(0, 80).forEach(k => delete crestMemory[k]);
            }
            localStorage.setItem(crestCacheKey, JSON.stringify(crestMemory));
        } catch (_) { /* quota */ }
    }

    function getTeamInitials(name = '', abbr = '') {
        if (abbr && abbr.length >= 2 && abbr.length <= 4 && !/^\d+$/.test(abbr)) return abbr.toUpperCase().slice(0, 3);
        const clean = String(name || '').replace(/\b(fc|cf|sc|ac|cd|ceif|afc|fk|sk|sv|ssc|as|rc|ud|rb|calcio|club|clube|deportivo)\b/gi, '').trim();
        const parts = clean.split(/\s+/).filter(Boolean);
        if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
        if (parts.length === 1 && parts[0].length >= 2) return parts[0].slice(0, 2).toUpperCase();
        return 'FC';
    }

    function renderCrestFallbackSvg(initials) {
        return `<svg width="18" height="18" viewBox="0 0 18 18" style="vertical-align:middle; display:inline-block; flex-shrink:0;"><circle cx="9" cy="9" r="8" fill="#1e293b" stroke="#334155" stroke-width="1.2"/><text x="9" y="11.5" font-size="7.5" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif" font-weight="700" fill="#94a3b8" text-anchor="middle">${initials}</text></svg>`;
    }

    function teamLogo(team, className = 'team-crest') {
        const teamId = team?.id || team?.slug || team?.displayName || '';
        let logo = safeUrl(team?.logo || team?.logos?.[0]?.href);
        if (!logo && teamId && crestMemory[String(teamId)]?.url) {
            logo = crestMemory[String(teamId)].url;
        }
        if (logo.includes('static.livescore.com/')) {
            logo = logo.replace('static.livescore.com/', 'storage.livescore.com/images/team/medium/');
        }
        if (logo && logo.startsWith('http')) {
            rememberCrest(teamId, logo);
            logo = `/cdn/crest?url=${encodeURIComponent(logo)}`;
        }
        const initials = escapeHtml(getTeamInitials(team?.displayName || team?.name, team?.abbreviation));
        const svgFallback = renderCrestFallbackSvg(initials);
        return `<span class="${className}">${logo ? `<img src="${logo}" alt="${escapeHtml(team?.displayName || initials)}" loading="lazy" decoding="async" onerror="this.onerror=null; this.outerHTML='${svgFallback}';">` : svgFallback}</span>`;
    }

    function competitionFromEvent(event) {
        return event?.competitions?.[0] || {};
    }

    function competitorsFromEvent(event) {
        if (event?.home && event?.away) {
            return {
                home: { team: event.home, score: event.home.score, winner: event.home.winner },
                away: { team: event.away, score: event.away.score, winner: event.away.winner }
            };
        }
        const competitors = competitionFromEvent(event).competitors || [];
        return {
            home: competitors.find(item => item.homeAway === 'home') || competitors[0] || {},
            away: competitors.find(item => item.homeAway === 'away') || competitors[1] || {}
        };
    }

    function isConcreteClock(str) {
        if (!str || typeof str !== 'string') return false;
        const clean = str.trim();
        if (!clean) return false;
        if (/^(live|in\s*progress|status_in_progress|scheduled|upcoming|pre|in|post)$/i.test(clean)) {
            return false;
        }
        if (/\d/.test(clean)) return true;
        if (/^(ht|half\s*time|halftime|et|aet|pen\.?|penalties|break)$/i.test(clean)) return true;
        return false;
    }

    function formatClockString(val) {
        if (val === undefined || val === null) return '';
        const s = String(val).trim();
        if (!s) return '';
        // If raw seconds (e.g. 2700 -> 45', 5400 -> 90')
        if (/^\d{3,}$/.test(s)) {
            const num = Number(s);
            if (!isNaN(num) && num > 120) {
                return `${Math.floor(num / 60)}'`;
            }
        }
        // If number without apostrophe (e.g. "64" -> "64'")
        if (/^\d{1,3}$/.test(s)) {
            const num = Number(s);
            if (!isNaN(num) && num > 0 && num <= 130) {
                return `${num}'`;
            }
        }
        return s;
    }

    function formatMatchClock(status, type = {}) {
        // Collect all potential clock sources in priority order:
        const candidates = [
            status?.displayClock,
            status?.clock,
            status?.short_detail,
            status?.shortDetail,
            type?.shortDetail,
            status?.detail,
            type?.detail,
            type?.clock
        ];

        // 1. First priority: Find the first CONCRETE clock (contains digits, HT, etc., NOT generic 'Live')
        for (const cand of candidates) {
            const formatted = formatClockString(cand);
            if (isConcreteClock(formatted)) {
                return formatted;
            }
        }

        // 2. Second priority: If status has numeric clock_seconds
        const clockSec = Number(status?.clock_seconds);
        if (!isNaN(clockSec) && clockSec > 0) {
            return `${Math.floor(clockSec / 60)}'`;
        }

        // 3. Fallback: If no concrete clock exists anywhere, return 'Live'
        return 'Live';
    }

    function statusInfo(event) {
        const status = event?.status || competitionFromEvent(event).status || {};
        const type = status.type || {};
        const stateName = status.state || type.state || (status.isLive ? 'in' : 'unknown');
        if (stateName === 'in' || status.isLive) {
            const clock = formatMatchClock(status, type);
            return { state: 'live', label: clock, pillClass: 'in-play' };
        }
        if (stateName === 'post' || status.completed || type.completed) {
            const label = type.shortDetail || status.detail || 'FT';
            return { state: 'finished', label: /^\d{3,}$/.test(label) ? 'FT' : label, pillClass: 'post' };
        }
        return { state: 'scheduled', label: status.detail || type.shortDetail || 'Upcoming', pillClass: 'pre' };
    }

    function setLoading(kind, loading) {
        if (elements[`${kind}-loading`]) elements[`${kind}-loading`].hidden = !loading;
        if (loading && elements[`${kind}-empty`]) elements[`${kind}-empty`].hidden = true;
    }

    function cleanTeamNameForDedup(name) {
        return (name || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/\([^)]*\)/g, ' ')
            .replace(/\b(18\d{2}|19\d{2}|20\d{2})\b/g, '')
            .replace(/\b(04|05|96|98)\b/g, '')
            .replace(/\b(women|woman|ladies|femenin[oa]?|frauen|damen|vrouwen|fem|wfc|w)\b|\(w\)/gi, '')
            .replace(/\b(u-?23|u-?21|u-?20|u-?19|u-?18|u-?17|u-?16|u-?15|youth|reserves?|development)\b/gi, '')
            .replace(/\bsantos\s+laguna\b/g, 'santos')
            .replace(/\b(club|clube|csd|deportivo|fc|cf|sc|ac|cd|ceif|afc|fk|sk|sv|ssc|as|rc|ud|rb|calcio|sad|sa)\b/gi, '')
            .replace(/\b(de\s+)?(junin|resistencia|cordoba|la\s+plata)\b/gi, '')
            .replace(/[^a-z0-9]/g, '');
    }

    function getEventMatchTierClient(ev) {
        const { home, away } = competitorsFromEvent(ev);
        const hName = home.team?.displayName || home.team?.name || ev.home?.name || '';
        const aName = away.team?.displayName || away.team?.name || ev.away?.name || '';
        const slug = ev.league?.slug || ev.league_slug || '';
        const leagueName = ev.league?.name || ev.note || '';
        const s = `${hName} ${aName} ${slug} ${leagueName}`.toLowerCase();

        const isWomen = /\b(women|woman|ladies|femenin[oa]?|frauen|damen|vrouwen|fem|wfc|w)\b|\(w\)/i.test(s) ||
                        s.includes('liga f') || s.includes('femenil') || s.includes('damallsvenskan') || s.includes('toppserien') ||
                        s.includes('.w.') || s.startsWith('w.') || s.endsWith('.w');
        const isYouth = /\b(u-?23|u-?21|u-?20|u-?19|u-?18|u-?17|u-?16|u-?15|youth|primavera|reserves?|development)\b/i.test(s) ||
                        s.includes('youth') || s.includes('u21') || s.includes('u23') || s.includes('u20') || s.includes('u19') || s.includes('u18') || s.includes('u17') || s.includes('primavera');
        return `${isWomen ? 'w' : 'm'}_${isYouth ? 'y' : 's'}`;
    }

    function getEventDedupSignature(ev) {
        const { home, away } = competitorsFromEvent(ev);
        const hName = cleanTeamNameForDedup(home.team?.displayName || home.team?.name || ev.home?.name || '');
        const aName = cleanTeamNameForDedup(away.team?.displayName || away.team?.name || ev.away?.name || '');
        if (!hName && !aName) {
            return String(ev.id || Math.random());
        }
        const dKey = ev.scoreboardDate || (ev.date ? String(ev.date).slice(0, 10) : '');
        const tier = getEventMatchTierClient(ev);
        const isYouth = tier.endsWith('_y');
        return [hName, aName].sort().join('_vs_') + '_' + dKey + (isYouth ? '_youth' : '');
    }

    function getEventQualityScore(ev) {
        const { home, away } = competitorsFromEvent(ev);
        const hLogo = home.team?.logo || '';
        const aLogo = away.team?.logo || '';
        const hasEspnLogo = (hLogo.includes('espncdn') || aLogo.includes('espncdn')) ? 4 : 0;
        const hasCanonicalId = (/^\d{6,}$/.test(String(ev.id))) ? 3 : 0;
        const enrichedLeague = enrichLeagueMeta(ev.league, ev);
        const slug = enrichedLeague?.slug || ev.league?.slug || ev.league_slug || '';
        const hasSpecificSlug = (slug && slug !== 'other' && slug !== 'w.other' && !slug.includes('eng.trophy')) ? 2 : 0;
        const tier = getEventMatchTierClient(ev);
        const isWomen = tier.startsWith('w_') ? 2 : 0;
        const hasClock = isConcreteClock(ev.status?.clock || ev.status?.detail) ? 2 : (ev.status?.clock || ev.status?.detail ? 1 : 0);
        return hasEspnLogo + hasCanonicalId + hasSpecificSlug + isWomen + hasClock;
    }

    function deduplicateMatchesList(matchList) {
        if (!Array.isArray(matchList) || !matchList.length) return [];
        const seenMap = new Map();
        for (const m of matchList) {
            const sig = getEventDedupSignature(m);
            if (!sig || sig === '_vs_') {
                seenMap.set(`m_${m.id || Math.random()}`, { item: m, score: 0 });
                continue;
            }
            const score = getEventQualityScore(m);
            if (!seenMap.has(sig)) {
                seenMap.set(sig, { item: m, score });
            } else {
                const existing = seenMap.get(sig);
                const winner = score > existing.score ? m : existing.item;
                const secondary = score > existing.score ? existing.item : m;

                if (secondary.status?.isLive || secondary.status?.state === 'in') {
                    if (!winner.status) winner.status = {};
                    const secClock = secondary.status?.clock || secondary.status?.detail;
                    if (isConcreteClock(secClock) && (!isConcreteClock(winner.status.clock) || winner.status.clock === "45'")) {
                        winner.status.clock = secClock;
                        winner.status.detail = secClock;
                    }
                    const secHomeScore = secondary.home?.score ?? secondary.competitions?.[0]?.competitors?.[0]?.score;
                    const secAwayScore = secondary.away?.score ?? secondary.competitions?.[0]?.competitors?.[1]?.score;
                    if (secHomeScore !== undefined && winner.home) winner.home.score = secHomeScore;
                    if (secAwayScore !== undefined && winner.away) winner.away.score = secAwayScore;
                }
                if (secondary.source?.livescore_id && !winner.source?.livescore_id) {
                    if (!winner.source) winner.source = {};
                    winner.source.livescore_id = secondary.source.livescore_id;
                }

                seenMap.set(sig, { item: winner, score: Math.max(existing.score, score) });
            }
        }
        return Array.from(seenMap.values()).map(v => v.item);
    }

    const CLIENT_LEAGUE_PRIORITY = {
        'uefa.champions': 100,
        'eng.1': 99,
        'esp.1': 98,
        'ita.1': 97,
        'ger.1': 96,
        'fra.1': 95,
        'uefa.europa': 94,
        'uefa.europa.conf': 93,
        'uefa.super_cup': 92,
        'fifa.world': 91,
        'eng.fa': 90,
        'esp.copa_del_rey': 89,
        'ita.coppa_italia': 88,
        'ger.dfb_pokal': 87,
        'eng.league_cup': 86,
        'eng.2': 85,
        'ned.1': 84,
        'por.1': 83,
        'bra.1': 82,
        'arg.1': 81,
        'nga.1': 80,
        'sau.1': 79,
        'mex.1': 78,
        'col.1': 77,
        'tur.1': 76,
        'bel.1': 75,
        'caf.champions': 74,
        'caf.confed': 73,
        'conmebol.libertadores': 72,
        'conmebol.sudamericana': 71,
        'sco.1': 70,
        'afc.champions': 69,
        'usa.1': 68,
        'aut.1': 67,
        'sui.1': 66,
        'den.1': 65,
        'swe.1': 64,
        'nor.1': 63,
        'gre.1': 62,
        'egy.1': 61,
        'rsa.1': 60,
        'mar.1': 59,
        'gha.1': 58,
        'ken.1': 57,
        'tza.1': 56,
        'jpn.1': 55,
        'kor.1': 54,
        'aus.1': 53,
        'bra.2': 52,
        'esp.2': 51,
        'ger.2': 50,
        'ita.2': 49,
        'fra.2': 48,
        'por.2': 47,
        'mex.2': 46
    };

    function getLeaguePriorityClient(slug = '') {
        if (!slug) return 30;
        const cleanSlug = String(slug).toLowerCase().trim();
        if (CLIENT_LEAGUE_PRIORITY[cleanSlug]) return CLIENT_LEAGUE_PRIORITY[cleanSlug];
        if (cleanSlug.includes('youth') || cleanSlug.includes('u21') || cleanSlug.includes('u19') || cleanSlug.includes('u23')) return 20;
        if (cleanSlug.includes('friendly') || cleanSlug === 'club.friendly') return 10;
        if (cleanSlug.endsWith('.1')) return 55;
        if (cleanSlug.endsWith('.2')) return 45;
        if (cleanSlug.endsWith('.3') || cleanSlug.endsWith('.4')) return 35;
        return 40;
    }

    function enrichLeagueMeta(league, ev = null) {
        let slug = league?.slug || ev?.league_slug || 'other';
        let name = league?.name || ev?.note || 'Competition';
        let country = league?.country || '';

        const lowerName = name.toLowerCase();
        const lowerSlug = slug.toLowerCase();

        // 1. Identify domestic women's leagues and map them to their correct country and slug
        if (lowerName.includes("women's super league") || lowerName.includes("wsl players cup") || lowerName.includes("wsl cup") || lowerName.includes("women's fa cup")) {
            country = 'England';
            if (!slug || slug === 'w.other' || slug === 'other') {
                slug = (lowerName.includes('players cup') || lowerName.includes('wsl cup')) ? 'eng.w.cup' : (lowerName.includes('fa cup') ? 'eng.w.fa' : 'eng.w.1');
            }
        } else if (lowerName.includes("nwsl") || lowerName.includes("national women's soccer league")) {
            country = 'USA';
            if (!slug || slug === 'w.other' || slug === 'other') slug = 'usa.w.1';
        } else if (lowerName.includes("liga mx femenil") || (lowerName.includes("femenil") && !lowerName.includes("esp"))) {
            country = 'Mexico';
            if (!slug || slug === 'w.other' || slug === 'other') slug = 'mex.w.1';
        } else if (lowerName.includes("a-league women") || lowerName.includes("w-league")) {
            country = 'Australia';
            if (!slug || slug === 'w.other' || slug === 'other') slug = 'aus.w.1';
        } else if (lowerName.includes("frauen-bundesliga") || lowerName.includes("frauen bundesliga")) {
            country = 'Germany';
            if (!slug || slug === 'w.other' || slug === 'other') slug = 'ger.w.1';
        } else if (lowerName.includes("première ligue") || lowerName.includes("d1 féminine") || lowerName.includes("division 1 féminine") || lowerName.includes("arkema")) {
            country = 'France';
            if (!slug || slug === 'w.other' || slug === 'other') slug = 'fra.w.1';
        } else if (lowerName.includes("serie a femminile") || lowerName.includes("femminile")) {
            country = 'Italy';
            if (!slug || slug === 'w.other' || slug === 'other') slug = 'ita.w.1';
        } else if (lowerName.includes("liga f") || lowerName.includes("primera división femenina") || lowerName.includes("copa de la reina")) {
            country = 'Spain';
            slug = 'esp.w.1';
            name = 'Liga F';
        } else if (lowerName.includes("damallsvenskan")) {
            country = 'Sweden';
            if (!slug || slug === 'w.other' || slug === 'other') slug = 'swe.w.1';
        } else if (lowerName.includes("toppserien")) {
            country = 'Norway';
            if (!slug || slug === 'w.other' || slug === 'other') slug = 'nor.w.1';
        } else if (lowerName.includes("swpl") || lowerName.includes("scottish women")) {
            country = 'Scotland';
            if (!slug || slug === 'w.other' || slug === 'other') slug = 'sco.w.1';
        } else if (lowerName.includes("super league women") && (lowerSlug.startsWith('sui') || lowerName.includes('swiss'))) {
            country = 'Switzerland';
            if (!slug || slug === 'w.other' || slug === 'other') slug = 'sui.w.1';
        } else if (lowerName.includes("super league women") && (lowerSlug.startsWith('bel') || lowerName.includes('belgian') || lowerName.includes('lotto'))) {
            country = 'Belgium';
            if (!slug || slug === 'w.other' || slug === 'other') slug = 'bel.w.1';
        }

        // 1b. Correct foreign matches mistakenly labeled as 'eng.1'
        if (slug === 'eng.1') {
            const evText = `${ev?.name || ''} ${ev?.home?.name || ''} ${ev?.away?.name || ''} ${name || ''}`.toLowerCase();
            if (evText.includes('mbeya') || evText.includes('singida') || evText.includes('simba') || evText.includes('young africans') || evText.includes('yanga') || evText.includes('azam') || evText.includes('mashujaa') || evText.includes('namungo') || evText.includes('fountain gate') || evText.includes('kagera') || evText.includes('pamba') || evText.includes('tanzan')) {
                slug = 'tza.1';
                name = 'Tanzanian Premier League';
                country = 'Tanzania';
            } else if (evText.includes('aduana') || evText.includes('berekum') || evText.includes('asante kotoko') || evText.includes('medeama') || evText.includes('hearts of oak') || evText.includes('bechem') || evText.includes('dreams fc') || evText.includes('samartex') || evText.includes('bibiani') || evText.includes('karela') || evText.includes('ghana')) {
                slug = 'gha.1';
                name = 'Ghana Premier League';
                country = 'Ghana';
            } else if (evText.includes('township rollers') || evText.includes('bdf xi') || evText.includes('tonota') || evText.includes('enesia') || evText.includes('botswana')) {
                slug = 'bwa.1';
                name = 'Botswana Premier League';
                country = 'Botswana';
            } else if (evText.includes('maccabi') || evText.includes('hapoel') || evText.includes('beitar') || evText.includes('israel')) {
                slug = 'isr.1';
                name = 'Israeli Premier League';
                country = 'Israel';
            } else if (evText.includes('al-qadsia') || evText.includes('al-arabi') || evText.includes('al-jahra') || evText.includes('al fahaheel') || evText.includes('kuwait')) {
                slug = 'kwt.1';
                name = 'Kuwait Premier League';
                country = 'Kuwait';
            } else if (evText.includes('montego bay') || evText.includes('portmore') || evText.includes('tivoli') || evText.includes('arnett') || evText.includes('tru-juice') || evText.includes('chapelton') || evText.includes('racing united') || evText.includes('dunbeholden') || evText.includes('humble lions') || evText.includes('jamaica')) {
                slug = 'jam.1';
                name = 'Jamaica Premier League';
                country = 'Jamaica';
            } else if (evText.includes('sumqayit') || evText.includes('shafa') || evText.includes('qarabag') || evText.includes('neftchi') || evText.includes('azerbaijan')) {
                slug = 'aze.1';
                name = 'Azerbaijan Premier League';
                country = 'Azerbaijan';
            } else if (evText.includes('torpedo zhodino') || evText.includes('belshina') || evText.includes('minsk') || evText.includes('maxline') || evText.includes('belarus')) {
                slug = 'blr.1';
                name = 'Belarusian Premier League';
                country = 'Belarus';
            } else if (evText.includes('ararat') || evText.includes('gandzasar') || evText.includes('pyunik') || evText.includes('armenia')) {
                slug = 'arm.1';
                name = 'Armenian Premier League';
                country = 'Armenia';
            } else if (evText.includes('al-ahli tripoli') || evText.includes('al khmes') || evText.includes('libya')) {
                slug = 'lby.1';
                name = 'Libyan Premier League';
                country = 'Libya';
            }
        }

        // 1c. Correct foreign matches mistakenly labeled as Italian Serie A/B ('ita.1' / 'ita.2')
        if (slug === 'ita.1' || slug === 'ita.2') {
            const evText = `${ev?.name || ''} ${ev?.home?.name || ''} ${ev?.away?.name || ''} ${name || ''} ${country || ''}`.toLowerCase();
            if (evText.includes('brazil') || evText.includes('brasileir') || evText.includes('coritiba') || evText.includes('sport recife') || evText.includes('novorizontino') || evText.includes('mirassol') || evText.includes('guarani') || evText.includes('chapecoense') || evText.includes('santos') || evText.includes('vila nova') || evText.includes('operario') || evText.includes('crb') || evText.includes('brusque') || evText.includes('ituano') || evText.includes('botafogo sp') || evText.includes('amazonas') || evText.includes('paysandu') || evText.includes('ponte preta')) {
                slug = slug === 'ita.1' ? 'bra.1' : 'bra.2';
                name = slug === 'bra.1' ? 'Brasileirão Série A' : 'Brasileirão Série B';
                country = 'Brazil';
            } else if (evText.includes('mexic') || evText.includes('liga mx') || evText.includes('expansion') || evText.includes('america') || evText.includes('chivas') || evText.includes('cruz azul') || evText.includes('tigres') || evText.includes('monterrey') || evText.includes('pachuca') || evText.includes('toluca') || evText.includes('pumas') || evText.includes('santos laguna')) {
                slug = 'mex.1';
                name = 'Liga MX';
                country = 'Mexico';
            } else if (evText.includes('ecuador') || evText.includes('ligapro') || evText.includes('mushuc runa') || evText.includes('manta') || evText.includes('aucas') || evText.includes('barcelona sc') || evText.includes('emelec') || evText.includes('ldu quito') || evText.includes('independiente del valle')) {
                slug = 'ecu.1';
                name = 'LigaPro Serie A';
                country = 'Ecuador';
            } else if (evText.includes('portugal') || evText.includes('maritimo') || evText.includes('feirense') || evText.includes('penafiel') || evText.includes('academico')) {
                slug = 'por.2';
                name = 'Liga Portugal 2';
                country = 'Portugal';
            }
        }

        // 1d. Correct foreign matches mistakenly labeled as Spanish La Liga ('esp.1' / 'esp.2')
        if (slug === 'esp.1' || slug === 'esp.2') {
            const evText = `${ev?.name || ''} ${ev?.home?.name || ''} ${ev?.away?.name || ''} ${name || ''} ${country || ''}`.toLowerCase();
            if (evText.includes('liga f') || evText.includes('femenin') || /\b(granada w|espanyol w|barcelona w|real madrid w|atletico madrid w|levante w|sevilla w|athletic club w|valencia w|eibar w|betis w|deportivo abanca|madrid cff)\b/i.test(evText)) {
                slug = 'esp.w.1';
                name = 'Liga F';
                country = 'Spain';
            } else if (evText.includes('mexic') || evText.includes('liga mx') || evText.includes('expansion') || evText.includes('america') || evText.includes('chivas') || evText.includes('cruz azul') || evText.includes('tigres') || evText.includes('monterrey') || evText.includes('pachuca') || evText.includes('toluca')) {
                slug = 'mex.1';
                name = 'Liga MX';
                country = 'Mexico';
            } else if (evText.includes('colombia') || evText.includes('millonarios') || evText.includes('santa fe') || evText.includes('atletico nacional') || evText.includes('junior') || evText.includes('america de cali')) {
                slug = 'col.1';
                name = 'Colombian Primera A';
                country = 'Colombia';
            } else if (evText.includes('guatemala') || evText.includes('municipal') || evText.includes('comunicaciones') || evText.includes('xelaju') || evText.includes('marquense')) {
                slug = 'gtm.1';
                name = 'Liga Nacional Guatemala';
                country = 'Guatemala';
            }
        }

        // 1e. Correct foreign/Moldovan matches mistakenly labeled as Turkish Süper Lig ('tur.1')
        if (slug === 'tur.1') {
            const evText = `${ev?.name || ''} ${ev?.home?.name || ''} ${ev?.away?.name || ''} ${name || ''} ${country || ''}`.toLowerCase();
            if (evText.includes('moldov') || evText.includes('zimbru') || evText.includes('sireti') || evText.includes('sheriff') || evText.includes('petrocub') || evText.includes('milsami') || evText.includes('dacia buiucani') || evText.includes('floresti') || evText.includes('cupa moldovei')) {
                slug = 'mda.1';
                name = 'Moldovan Super Liga';
                country = 'Moldova';
            }
        }

        // 1f. Correct Korean matches mistakenly labeled as English leagues or EFL Trophy ('eng.trophy' / 'eng.3' / 'eng.4' / etc.)
        if (slug === 'eng.trophy' || slug === 'eng.3' || slug === 'eng.4' || slug.startsWith('eng.')) {
            const evText = `${ev?.name || ''} ${ev?.home?.name || ''} ${ev?.away?.name || ''} ${name || ''} ${country || ''}`.toLowerCase();
            if (evText.includes('korea') || evText.includes('k-league') || evText.includes('kleague') || /\b(jeonbuk|ulsan|pohang|seoul|daegu|incheon|suwon|gangwon|gimcheon|daejeon|gwangju|jeju|bucheon|anyang|busan|seongnam|ansan|cheonan|chungnam|chungbuk|gimpo|gyeongnam)\b/i.test(evText)) {
                if (evText.includes('k league 2') || evText.includes('k-league 2') || evText.includes('kleague 2') || /\b(bucheon|anyang|busan|seongnam|ansan|cheonan|chungnam|chungbuk|gimpo|gyeongnam)\b/i.test(evText)) {
                    slug = 'kor.2';
                    name = 'South Korean K League 2';
                } else if (evText.includes('cup') || evText.includes('korea cup')) {
                    slug = 'kor.cup';
                    name = 'Korean FA Cup';
                } else {
                    slug = 'kor.1';
                    name = 'South Korean K League 1';
                }
                country = 'South Korea';
            } else if (evText.includes('china') || evText.includes('csl') || /\b(shanghai|beijing|shandong|chengdu|zhejiang|tianjin|wuhan|changchun|qingdao|meizhou|shenzhen|henan|cangzhou|guangzhou)\b/i.test(evText)) {
                if (evText.includes('league 1') || evText.includes('league one')) {
                    slug = 'chn.2';
                    name = 'China League One';
                } else if (evText.includes('cup')) {
                    slug = 'chn.cup';
                    name = 'Chinese FA Cup';
                } else {
                    slug = 'chn.1';
                    name = 'Chinese Super League';
                }
                country = 'China';
            }
        }

        // 1g. Correct Chinese matches mistakenly labeled as Korean lower tiers ('kor.2' / 'kor.1')
        if (slug === 'kor.2' || slug === 'kor.1') {
            const evText = `${ev?.name || ''} ${ev?.home?.name || ''} ${ev?.away?.name || ''} ${name || ''} ${country || ''}`.toLowerCase();
            if (evText.includes('china') || evText.includes('csl') || /\b(shanghai|beijing|shandong|chengdu|zhejiang|tianjin|wuhan|changchun|qingdao|meizhou|shenzhen|henan|cangzhou|guangzhou)\b/i.test(evText)) {
                if (evText.includes('league 1') || evText.includes('league one')) {
                    slug = 'chn.2';
                    name = 'China League One';
                } else {
                    slug = 'chn.1';
                    name = 'Chinese Super League';
                }
                country = 'China';
            }
        }

        // 1h. Correct Portuguese Segunda matches mistakenly labeled as Spanish Segunda ('esp.2')
        if (slug === 'esp.2' || slug === 'esp.1') {
            const evText = `${ev?.name || ''} ${ev?.home?.name || ''} ${ev?.away?.name || ''} ${name || ''} ${country || ''}`.toLowerCase();
            if (/\b(felgueiras|leixoes|leix[oõ]es|penafiel|feirense|oliveirense|torreense|alverca|mafra|uniao de leiria|maritimo|academico)\b/i.test(evText)) {
                slug = 'por.2';
                name = 'Liga Portugal 2';
                country = 'Portugal';
            }
        }

        // 2. Infer country from slug prefix if country is missing or generic 'International'
        if (!country || country.toLowerCase() === 'international') {
            const prefix = slug.split('.')[0];
            const countryMap = {
                eng: 'England', esp: 'Spain', ita: 'Italy', ger: 'Germany', fra: 'France',
                ned: 'Netherlands', por: 'Portugal', bel: 'Belgium', sco: 'Scotland',
                sui: 'Switzerland', aut: 'Austria', gre: 'Greece', tur: 'Turkey',
                den: 'Denmark', swe: 'Sweden', nor: 'Norway', fin: 'Finland',
                pol: 'Poland', rus: 'Russia', ukr: 'Ukraine', cze: 'Czech Republic',
                bra: 'Brazil', arg: 'Argentina', col: 'Colombia', chi: 'Chile',
                mex: 'Mexico', usa: 'USA', aus: 'Australia', jpn: 'Japan',
                chn: 'China', kor: 'South Korea', ksa: 'Saudi Arabia',
                egy: 'Egypt', rsa: 'South Africa', nga: 'Nigeria', mar: 'Morocco',
                tza: 'Tanzania', zmb: 'Zambia', zwe: 'Zimbabwe', eth: 'Ethiopia',
                rwa: 'Rwanda', cod: 'DR Congo', cmr: 'Cameroon', civ: 'Ivory Coast',
                dza: 'Algeria', tun: 'Tunisia', sdn: 'Sudan', ago: 'Angola',
                bwa: 'Botswana', mwi: 'Malawi', jam: 'Jamaica', lby: 'Libya',
                isr: 'Israel', aze: 'Azerbaijan', blr: 'Belarus', arm: 'Armenia',
                bih: 'Bosnia and Herzegovina', nir: 'Northern Ireland', wal: 'Wales',
                irl: 'Ireland', hkg: 'Hong Kong', bgd: 'Bangladesh', mlt: 'Malta',
                kaz: 'Kazakhstan', mda: 'Moldova', mol: 'Moldova'
            };
            if (countryMap[prefix]) {
                country = countryMap[prefix];
            }
        }

        return {
            ...league,
            slug: slug || 'other',
            name: name || 'Competition',
            country: country || (slug.startsWith('uefa.') ? 'Europe' : (slug.startsWith('conmebol.') ? 'South America' : 'International'))
        };
    }

    async function loadMeta() {
        try {
            const data = await fetchJson('/get/soccer/meta');
            if (elements['stat-competitions']) elements['stat-competitions'].textContent = formatNumber(data.coverage.activeClubCompetitions);
            if (elements['stat-matches']) elements['stat-matches'].textContent = formatNumber(data.coverage.matches);
            if (elements['stat-events']) elements['stat-events'].textContent = formatNumber(data.coverage.playByPlayEvents);
            setServiceStatus('online', 'Service online');
        } catch (error) {
            setServiceStatus('error', 'Service unavailable');
        }
    }

    const COUNTRY_CODES = {
        england: 'gb-eng', scotland: 'gb-sct', wales: 'gb-wls', spain: 'es', italy: 'it',
        germany: 'de', france: 'fr', netherlands: 'nl', portugal: 'pt', turkey: 'tr',
        belgium: 'be', austria: 'at', switzerland: 'ch', denmark: 'dk', sweden: 'se',
        norway: 'no', finland: 'fi', greece: 'gr', russia: 'ru', ukraine: 'ua',
        poland: 'pl', czechia: 'cz', 'czech republic': 'cz', croatia: 'hr', serbia: 'rs',
        romania: 'ro', hungary: 'hu', bulgaria: 'bg', slovakia: 'sk', slovenia: 'si',
        ireland: 'ie', usa: 'us', 'united states': 'us', canada: 'ca', mexico: 'mx',
        brazil: 'br', argentina: 'ar', colombia: 'co', chile: 'cl', uruguay: 'uy',
        paraguay: 'py', peru: 'pe', ecuador: 'ec', bolivia: 'bo', venezuela: 've',
        'costa rica': 'cr', honduras: 'hn', guatemala: 'gt', japan: 'jp', 'south korea': 'kr',
        china: 'cn', australia: 'au', 'saudi arabia': 'sa', qatar: 'qa', uae: 'ae',
        'united arab emirates': 'ae', iran: 'ir', iraq: 'iq', jordan: 'jo', bahrain: 'bh',
        kuwait: 'kw', uzbekistan: 'uz', india: 'in', indonesia: 'id', thailand: 'th',
        malaysia: 'my', singapore: 'sg', vietnam: 'vn', nigeria: 'ng', 'south africa': 'za',
        egypt: 'eg', morocco: 'ma', algeria: 'dz', tunisia: 'tn', ghana: 'gh',
        kenya: 'ke', uganda: 'ug', cameroon: 'cm', senegal: 'sn', tanzania: 'tz',
        zambia: 'zm', 'new zealand': 'nz', botswana: 'bw', jamaica: 'jm', israel: 'il',
        belarus: 'by', azerbaijan: 'az', armenia: 'am', libya: 'ly', zimbabwe: 'zw',
        ethiopia: 'et', rwanda: 'rw', 'dr congo': 'cd', 'ivory coast': 'ci', sudan: 'sd',
        angola: 'ao', malawi: 'mw', bosnia: 'ba', 'northern ireland': 'gb-nir', 'hong kong': 'hk',
        bangladesh: 'bd', malta: 'mt', kazakhstan: 'kz'
    };

    function getLeagueCountryCode(league) {
        const slug = (league?.slug || '').toLowerCase();
        const prefix = slug.split('.')[0];
        const country = (league?.country || '').toLowerCase().trim();
        if (COUNTRY_CODES[country]) return COUNTRY_CODES[country];
        if (prefix === 'eng') return 'gb-eng';
        if (prefix === 'sco') return 'gb-sct';
        if (prefix === 'esp') return 'es';
        if (prefix === 'ita') return 'it';
        if (prefix === 'ger') return 'de';
        if (prefix === 'fra') return 'fr';
        if (prefix === 'ned') return 'nl';
        if (prefix === 'por') return 'pt';
        if (prefix === 'tur') return 'tr';
        if (prefix === 'bel') return 'be';
        if (prefix === 'aut') return 'at';
        if (prefix === 'sui') return 'ch';
        if (prefix === 'den') return 'dk';
        if (prefix === 'swe') return 'se';
        if (prefix === 'nor') return 'no';
        if (prefix === 'gre') return 'gr';
        if (prefix === 'usa') return 'us';
        if (prefix === 'mex') return 'mx';
        if (prefix === 'bra') return 'br';
        if (prefix === 'arg') return 'ar';
        if (prefix === 'col') return 'co';
        if (prefix === 'jpn') return 'jp';
        if (prefix === 'aus') return 'au';
        if (prefix === 'chn') return 'cn';
        if (prefix === 'ksa') return 'sa';
        if (prefix === 'nga') return 'ng';
        if (prefix === 'rsa') return 'za';
        if (prefix === 'egy') return 'eg';
        if (prefix === 'mar') return 'ma';
        if (prefix === 'gha') return 'gh';
        if (prefix === 'ken') return 'ke';
        if (prefix === 'uga') return 'ug';
        if (prefix === 'ind') return 'in';
        if (prefix === 'idn') return 'id';
        if (prefix === 'tha') return 'th';
        if (prefix === 'mys') return 'my';
        if (prefix === 'sgp') return 'sg';
        return '';
    }

    function renderLeagueAvatarHtml(league, { size = 18, className = 'league-avatar' } = {}) {
        if (!league) return `<span class="${className}">⚽</span>`;
        const slug = (league.slug || '').toLowerCase();
        const name = escapeHtml(league.name || 'League');
        const logoUrl = safeUrl(league.logo);
        const countryCode = getLeagueCountryCode(league);
        const flagFallbackUrl = countryCode ? `https://flagcdn.com/w40/${countryCode}.png` : '';
        const isContinental = slug.startsWith('uefa') || slug.startsWith('caf') || slug.startsWith('fifa') || slug.startsWith('conmebol') || slug.startsWith('afc') || (league.name && /champions|cup|afc|uefa|caf|copa/i.test(league.name));
        const emojiFallback = LEAGUE_FLAGS[slug] || (isContinental ? '🏆' : '⚽');

        if (logoUrl) {
            return `
                <span class="${className}" style="width:${size}px; height:${size}px; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0;">
                    <img src="${logoUrl}" alt="${name}" loading="lazy" style="width:100%; height:100%; object-fit:contain; border-radius:3px;" onerror="this.onerror=function(){this.style.display='none';if(this.nextElementSibling)this.nextElementSibling.style.display='inline-flex';}; if('${flagFallbackUrl}'){this.src='${flagFallbackUrl}'; this.style.objectFit='cover';} else {this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='inline-flex';}">
                    <span class="avatar-fallback" style="display:none; font-size:${Math.round(size * 0.8)}px; line-height:1;">${emojiFallback}</span>
                </span>
            `;
        }
        if (flagFallbackUrl) {
            return `
                <span class="${className}" style="width:${size}px; height:${size}px; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0;">
                    <img src="${flagFallbackUrl}" alt="${name}" loading="lazy" style="width:100%; height:100%; object-fit:cover; border-radius:3px;" onerror="this.onerror=null; this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='inline-flex';">
                    <span class="avatar-fallback" style="display:none; font-size:${Math.round(size * 0.8)}px; line-height:1;">${emojiFallback}</span>
                </span>
            `;
        }
        return `<span class="${className}" style="width:${size}px; height:${size}px; display:inline-flex; align-items:center; justify-content:center; font-size:${Math.round(size * 0.8)}px; flex-shrink:0;">${emojiFallback}</span>`;
    }

    async function loadLeagues() {
        const data = await fetchJson('/get/soccer/leagues?kind=all');
        state.leagues = data.leagues || [];
        populateCountries();
    }

    function renderQuickLeaguePills(activeSlug = 'all') {
        const container = document.getElementById('quick-leagues-list');
        if (!container || !state.leagues.length) return;

        const isAll = !activeSlug || activeSlug === 'all';
        const isLive = activeSlug === 'live';

        const allPill = `
            <button class="quick-league-btn ${isAll ? 'active' : ''}" type="button" data-slug="all">
                <span class="quick-league-flag" style="font-size:16px;">🌐</span>
                <span>All</span>
            </button>
        `;

        const liveBadgeDisplay = state.liveMatchCount > 0 ? `display:inline-block;` : `display:none;`;
        const livePill = `
            <button class="quick-league-btn ${isLive ? 'active' : ''}" type="button" data-slug="live">
                <span class="quick-league-flag ${state.liveMatchCount > 0 ? 'live-pulse-mini' : ''}" style="font-size:14px;">🔴</span>
                <span>Live <span id="live-count-badge" class="pill-badge" style="${liveBadgeDisplay}">${state.liveMatchCount}</span></span>
            </button>
        `;

        const leaguePills = state.leagues.map(l => {
            const avatarHtml = renderLeagueAvatarHtml(l, { size: 18, className: 'quick-league-avatar' });
            const isActive = l.slug === activeSlug;
            return `
                <button class="quick-league-btn ${isActive ? 'active' : ''}" type="button" data-slug="${escapeHtml(l.slug)}" title="${escapeHtml(l.name)}">
                    ${avatarHtml}
                    <span>${escapeHtml(l.abbreviation || l.name)}</span>
                </button>
            `;
        }).join('');

        container.innerHTML = allPill + livePill + leaguePills;

        container.querySelectorAll('.quick-league-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const slug = btn.dataset.slug;
                if (slug === 'all') {
                    selectAllLeagues();
                } else if (slug === 'live') {
                    selectLiveMatches();
                } else {
                    const league = state.leagues.find(item => item.slug === slug);
                    if (league) {
                        if (elements['country-select']) elements['country-select'].value = league.country || 'Other';
                        populateLeagues(slug);
                        selectLeague(slug);
                    }
                }
            });
        });
    }

    function renderDesktopSidebar(activeSlug = 'all') {
        const topLeaguesContainer = document.getElementById('sidebar-top-leagues');
        const countryListContainer = document.getElementById('sidebar-country-list');
        const searchInput = document.getElementById('sidebar-country-filter');

        if (!topLeaguesContainer || !state.leagues.length) return;

        // 1. Top World Competitions
        const TOP_LEAGUE_SLUGS = [
            'eng.1', 'esp.1', 'uefa.champions', 'ita.1', 'ger.1', 'fra.1',
            'uefa.europa', 'uefa.europa.conf', 'caf.champions', 'nga.1',
            'rsa.1', 'usa.1', 'eng.w.1', 'por.1', 'ned.1', 'bra.1', 'ksa.1'
        ];

        const topLeagues = TOP_LEAGUE_SLUGS
            .map(s => state.leagues.find(l => l.slug === s))
            .filter(Boolean);

        const isAllActive = !activeSlug || activeSlug === 'all';
        const isLiveActive = activeSlug === 'live';

        let topHtml = `
            <button class="sidebar-nav-item ${isAllActive ? 'active' : ''}" type="button" data-slug="all">
                <div class="sidebar-item-left">
                    <span style="font-size:16px;">🌐</span>
                    <span class="sidebar-item-name">All Competitions</span>
                </div>
            </button>
            <button class="sidebar-nav-item ${isLiveActive ? 'active' : ''}" type="button" data-slug="live">
                <div class="sidebar-item-left">
                    <span class="live-pulse-mini" style="font-size:14px;">🔴</span>
                    <span class="sidebar-item-name">Live Now</span>
                </div>
                ${state.liveMatchCount > 0 ? `<span class="sidebar-item-badge live-badge">${state.liveMatchCount}</span>` : ''}
            </button>
        `;

        topLeagues.forEach(l => {
            const isActive = l.slug === activeSlug;
            const avatarHtml = renderLeagueAvatarHtml(l, { size: 16, className: 'league-avatar-img' });
            topHtml += `
                <button class="sidebar-nav-item ${isActive ? 'active' : ''}" type="button" data-slug="${escapeHtml(l.slug)}" title="${escapeHtml(l.name)}">
                    <div class="sidebar-item-left">
                        ${avatarHtml}
                        <span class="sidebar-item-name">${escapeHtml(l.abbreviation || l.name)}</span>
                    </div>
                    ${l.matchCount ? `<span class="sidebar-item-badge">${l.matchCount}</span>` : ''}
                </button>
            `;
        });
        topLeaguesContainer.innerHTML = topHtml;

        topLeaguesContainer.querySelectorAll('.sidebar-nav-item').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const slug = btn.dataset.slug;
                if (slug === 'all') selectAllLeagues();
                else if (slug === 'live') selectLiveMatches();
                else selectLeague(slug);
            });
        });

        // 2. All Countries Accordion
        if (!countryListContainer) return;

        // Group leagues by country
        const countriesMap = new Map();
        for (const l of state.leagues) {
            const cName = l.country || 'International';
            if (!countriesMap.has(cName)) {
                countriesMap.set(cName, []);
            }
            countriesMap.get(cName).push(l);
        }

        // Priority countries at top of list
        const PRIORITY_COUNTRIES = [
            'England', 'Spain', 'Italy', 'Germany', 'France', 'Nigeria', 'Africa',
            'International', 'Europe', 'South America', 'Netherlands', 'Portugal',
            'Saudi Arabia', 'USA', 'United States', 'Brazil', 'Argentina', 'South Africa',
            'Egypt', 'Morocco', 'Ghana', 'Kenya', 'Turkey', 'Belgium', 'Scotland'
        ];

        const sortedCountries = Array.from(countriesMap.keys()).sort((a, b) => {
            const aPri = PRIORITY_COUNTRIES.indexOf(a);
            const bPri = PRIORITY_COUNTRIES.indexOf(b);
            if (aPri !== -1 && bPri !== -1) return aPri - bPri;
            if (aPri !== -1) return -1;
            if (bPri !== -1) return 1;
            return a.localeCompare(b, 'en');
        });

        function buildCountryListHtml(filterText = '') {
            const search = filterText.toLowerCase().trim();
            let cHtml = '';

            for (const country of sortedCountries) {
                const leagues = countriesMap.get(country) || [];
                const matchesCount = leagues.reduce((sum, l) => sum + (l.matchCount || 0), 0);
                const code = COUNTRY_CODES[country.toLowerCase()] || '';
                const flagUrl = code ? `https://flagcdn.com/w40/${code}.png` : '';
                const flagHtml = flagUrl
                    ? `<img src="${flagUrl}" alt="" loading="lazy" style="width:16px; height:12px; object-fit:cover; border-radius:2px; flex-shrink:0;">`
                    : `<span style="font-size:13px; line-height:1; flex-shrink:0;">${country === 'Africa' ? '🌍' : (country.includes('America') ? '🌎' : '🌐')}</span>`;

                const matchingLeagues = search
                    ? leagues.filter(l => l.name.toLowerCase().includes(search) || l.abbreviation?.toLowerCase().includes(search) || country.toLowerCase().includes(search))
                    : leagues;

                if (search && !country.toLowerCase().includes(search) && !matchingLeagues.length) {
                    continue;
                }

                const isCountryActive = leagues.some(l => l.slug === activeSlug);
                const autoExpand = Boolean(search) || isCountryActive;

                cHtml += `
                    <div class="sidebar-country-item ${autoExpand ? 'is-expanded' : ''}" data-country="${escapeHtml(country)}">
                        <div class="sidebar-country-header" role="button" tabindex="0">
                            <div class="sidebar-item-left">
                                ${flagHtml}
                                <span class="sidebar-item-name">${escapeHtml(country)}</span>
                            </div>
                            <div style="display:flex; align-items:center;">
                                ${matchesCount > 0 ? `<span class="sidebar-item-badge">${matchesCount}</span>` : ''}
                                <span class="sidebar-chevron">▶</span>
                            </div>
                        </div>
                        <div class="sidebar-country-leagues">
                            ${matchingLeagues.map(l => {
                                const isLActive = l.slug === activeSlug;
                                return `
                                    <button class="sidebar-league-link ${isLActive ? 'active' : ''}" type="button" data-slug="${escapeHtml(l.slug)}">
                                        <span>${escapeHtml(l.name)}</span>
                                        ${l.matchCount ? `<span style="font-size:10px; opacity:0.8;">${l.matchCount}</span>` : ''}
                                    </button>
                                `;
                            }).join('')}
                        </div>
                    </div>
                `;
            }

            if (!cHtml) {
                cHtml = '<div style="padding:12px; font-size:12px; color:var(--text-muted); text-align:center;">No matching competitions</div>';
            }

            countryListContainer.innerHTML = cHtml;

            // Wire accordion clicks
            countryListContainer.querySelectorAll('.sidebar-country-header').forEach(hdr => {
                hdr.addEventListener('click', () => {
                    const item = hdr.closest('.sidebar-country-item');
                    if (item) item.classList.toggle('is-expanded');
                });
            });

            // Wire league click
            countryListContainer.querySelectorAll('.sidebar-league-link').forEach(link => {
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    const slug = link.dataset.slug;
                    if (slug) selectLeague(slug);
                });
            });
        }

        buildCountryListHtml();

        // Wire live search filter
        if (searchInput && !searchInput.dataset.wired) {
            searchInput.dataset.wired = 'true';
            searchInput.addEventListener('input', (e) => {
                buildCountryListHtml(e.target.value);
            });
        }
    }

    async function selectLiveMatches() {
        state.selectedLeagueSlug = 'live';
        state.currentStatus = 'live';
        state.league = null;
        renderQuickLeaguePills('live');
        renderDesktopSidebar('live');
        window.clearInterval(state.matchTimer);

        // Reset matchday date ribbon to Today since live in-play games are on today's calendar
        state.selectedDayOffset = 0;
        const now = new Date();
        const iso = isoDateInput(now);
        state.selectedDateStr = iso;
        if (elements['date-from']) elements['date-from'].value = iso;
        if (elements['date-to']) elements['date-to'].value = iso;
        const picker = document.getElementById('matchday-picker');
        if (picker) picker.value = iso;
        const pillsList = document.getElementById('date-pills-list');
        if (pillsList) {
            pillsList.querySelectorAll('.date-pill-btn').forEach(b => {
                b.classList.toggle('active', b.dataset.day === 'today');
            });
            const dynamicPill = pillsList.querySelector('.dynamic-date-pill');
            if (dynamicPill) dynamicPill.remove();
        }
        const bannerEl = document.getElementById('fs-banner-date-text');
        if (bannerEl) {
            const fullDayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            bannerEl.textContent = `Today · ${fullDayNames[now.getDay()]}, ${monthNames[now.getMonth()]} ${now.getDate()}`;
        }

        // Activate the LIVE status pill
        const liveTab = document.getElementById('fs-tab-live');
        if (liveTab) {
            document.querySelectorAll('.fs-status-pill').forEach(p => {
                p.classList.remove('active');
                p.setAttribute('aria-selected', 'false');
            });
            liveTab.classList.add('active');
            liveTab.setAttribute('aria-selected', 'true');
        }

        const leagueToolbar = document.getElementById('league-view-toolbar');
        if (leagueToolbar) leagueToolbar.style.display = 'none';
        switchView('fixtures');

        if (elements['league-card']) elements['league-card'].hidden = true;
        if (elements['welcome-state']) elements['welcome-state'].hidden = true;
        if (elements['league-dashboard']) elements['league-dashboard'].hidden = false;
        if (elements['dashboard-country']) elements['dashboard-country'].textContent = 'In-Play Live';
        if (elements['dashboard-title']) elements['dashboard-title'].textContent = '🔴 Matches Currently Live';
        if (elements['fixture-status']) elements['fixture-status'].value = 'live';

        // Smoothly scroll to the matches container without jumping to the footer
        const target = document.querySelector('.explorer') || document.getElementById('main-content');
        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        await loadLiveMatches();
    }

    async function loadLiveMatches({ background = false, initialLive = null } = {}) {
        if (!background) {
            setLoading('fixtures', true);
            if (elements['fixtures-list']) elements['fixtures-list'].replaceChildren();
        }

        try {
            let liveMatches = initialLive;
            if (!liveMatches) {
                const data = await fetchJson('/api/v1/football/live');
                liveMatches = data.live || data.matches || [];
            }

            // Deduplicate live matches globally across all feeds / providers
            const dedupedLive = deduplicateMatchesList(liveMatches);
            state.liveMatchCount = dedupedLive.length;

            const badge = document.getElementById('live-count-badge');
            if (badge) {
                badge.textContent = dedupedLive.length;
                badge.style.display = dedupedLive.length > 0 ? 'inline-block' : 'none';
            }
            const fsLiveBadge = document.getElementById('fs-status-live-badge');
            if (fsLiveBadge) {
                fsLiveBadge.textContent = dedupedLive.length;
                fsLiveBadge.style.display = dedupedLive.length > 0 ? 'inline-block' : 'none';
            }
            const headerLiveCount = document.getElementById('header-live-count');
            if (headerLiveCount) {
                headerLiveCount.textContent = dedupedLive.length;
                headerLiveCount.style.display = dedupedLive.length > 0 ? 'inline-block' : 'none';
            }

            if (!dedupedLive.length) {
                if (elements['fixtures-empty']) {
                    elements['fixtures-empty'].hidden = false;
                    elements['fixtures-empty'].innerHTML = `
                        <div class="empty-state-card" style="text-align:center; padding:28px 16px;">
                            <span class="empty-icon" style="font-size:32px; display:block; margin-bottom:10px;">⚽</span>
                            <p style="font-size:15px; font-weight:700; color:var(--text-main); margin:0 0 6px;">No Matches Currently In-Play</p>
                            <p style="font-size:13px; color:var(--text-muted); margin:0 0 16px;">There are no games in progress right now. Check today's upcoming kickoffs or finished scores.</p>
                            <button class="btn-primary" type="button" id="live-empty-all-btn" style="display:inline-flex; align-items:center; gap:6px; padding:8px 18px; border-radius:6px; font-size:13px; font-weight:600; cursor:pointer;">
                                <span>🌐</span> <span>View Today's Fixtures</span>
                            </button>
                        </div>
                    `;
                    const emptyAllBtn = document.getElementById('live-empty-all-btn');
                    if (emptyAllBtn) {
                        emptyAllBtn.addEventListener('click', (e) => {
                            e.preventDefault();
                            selectAllLeagues();
                        });
                    }
                }
                if (elements['fixture-count']) elements['fixture-count'].textContent = '0';
                if (!background && elements['fixtures-list']) elements['fixtures-list'].innerHTML = '';
                return;
            }

            // Group live matches by specific league (isolating distinct women & cup competitions)
            const groupsMap = new Map();
            for (const m of dedupedLive) {
                const league = enrichLeagueMeta(m.league, m);
                const groupKey = (league.slug && league.slug !== 'w.other' && league.slug !== 'other')
                    ? league.slug
                    : `league_${(league.name || 'other').toLowerCase().replace(/[^a-z0-9]/g, '_')}`;

                if (!groupsMap.has(groupKey)) {
                    groupsMap.set(groupKey, {
                        league,
                        events: []
                    });
                }

                const hName = m.home?.displayName || m.home?.name || 'Home';
                const aName = m.away?.displayName || m.away?.name || 'Away';

                // Adapt to format expected by renderFlashscoreMatchRow
                groupsMap.get(groupKey).events.push({
                    id: m.id,
                    date: m.date,
                    name: `${hName} vs ${aName}`,
                    status: {
                        type: {
                            state: 'in',
                            name: m.status?.name || 'STATUS_IN_PROGRESS',
                            description: m.status?.description || 'In Progress',
                            detail: m.status?.clock || m.status?.detail || 'Live',
                            shortDetail: m.status?.clock || m.status?.detail || 'Live'
                        },
                        clock: m.status?.clock || m.status?.detail || '',
                        displayClock: m.status?.clock || m.status?.detail || '',
                        detail: m.status?.clock || m.status?.detail || '',
                        short_detail: m.status?.clock || m.status?.detail || '',
                        period: m.status?.period || 1,
                        isLive: true
                    },
                    competitions: [{
                        id: m.id,
                        date: m.date,
                        competitors: [
                            { homeAway: 'home', score: m.home?.score ?? 0, winner: m.home?.winner, team: m.home },
                            { homeAway: 'away', score: m.away?.score ?? 0, winner: m.away?.winner, team: m.away }
                        ]
                    }],
                    league_slug: league.slug
                });
            }

            renderAllLeaguesGrouped([...groupsMap.values()]);
        } catch (error) {
            showToast('Unable to load live matches: ' + error.message);
        } finally {
            if (!background) setLoading('fixtures', false);
        }
    }

    function populateCountries() {
        const countries = [...new Set(state.leagues.map(league => league.country || 'Other'))]
            .sort((a, b) => localCountryName(a).localeCompare(localCountryName(b), 'en'));

        if (elements['country-select']) {
            elements['country-select'].replaceChildren(new Option('Choose a country', ''));
            for (const country of countries) {
                elements['country-select'].add(new Option(localCountryName(country), country));
            }
            elements['country-select'].disabled = false;
        }

        const urlParams = new URLSearchParams(location.search);
        const requestedView = urlParams.get('view') || urlParams.get('status');
        const requestedSlug = document.body.dataset.leagueSlug || urlParams.get('league');

        if (requestedView === 'live') {
            selectLiveMatches();
            renderDesktopSidebar('live');
        } else if (requestedSlug && state.leagues.some(l => l.slug === requestedSlug)) {
            renderQuickLeaguePills(requestedSlug);
            renderDesktopSidebar(requestedSlug);
            selectLeague(requestedSlug);
        } else {
            renderQuickLeaguePills('all');
            renderDesktopSidebar('all');
            selectAllLeagues();
        }
    }

    function populateLeagues(preferredSlug = '') {
        if (!elements['country-select'] || !elements['league-select']) return;
        const country = elements['country-select'].value;
        const leagues = state.leagues.filter(league => (league.country || 'Other') === country);
        elements['league-select'].replaceChildren(new Option('Choose a league', ''));
        for (const league of leagues) {
            const suffix = league.coverage?.matches ? ` · ${formatNumber(league.coverage.matches)} matches` : '';
            elements['league-select'].add(new Option(`${league.name}${suffix}`, league.slug));
        }
        elements['league-select'].disabled = !country;

        const selected = leagues.find(league => league.slug === preferredSlug) || null;
        if (selected) {
            elements['league-select'].value = selected.slug;
            selectLeague(selected.slug);
        } else {
            clearDashboard();
        }
    }

    function clearDashboard() {
        state.league = null;
        if (elements['league-card']) elements['league-card'].hidden = true;
        if (elements['welcome-state']) elements['welcome-state'].hidden = false;
        if (elements['league-dashboard']) elements['league-dashboard'].hidden = true;
    }

    function updateLeagueCard(league) {
        if (!elements['league-card']) return;
        elements['league-card'].hidden = false;
        elements['league-name'].textContent = league.name;
        elements['league-season'].textContent = league.season?.display_name || `Season ${league.season?.year || '—'}`;
        elements['coverage-matches'].textContent = formatNumber(league.coverage?.matches);
        elements['coverage-clubs'].textContent = formatNumber(league.coverage?.clubs);
        elements['coverage-tables'].textContent = formatNumber(league.coverage?.standingsGroups);

        const logo = safeUrl(league.logo);
        elements['league-logo'].innerHTML = logo
            ? `<img src="${logo}" alt="">`
            : escapeHtml(league.abbreviation?.slice(0, 3) || 'SC');
    }

    async function selectAllLeagues() {
        state.selectedLeagueSlug = 'all';
        state.league = null;
        renderQuickLeaguePills('all');
        renderDesktopSidebar('all');
        window.clearInterval(state.matchTimer);

        // Reset status filter to 'all' and activate the ALL status tab
        state.currentStatus = 'all';
        document.querySelectorAll('.fs-status-pill').forEach(p => {
            const isAll = p.dataset.status === 'all';
            p.classList.toggle('active', isAll);
            p.setAttribute('aria-selected', isAll ? 'true' : 'false');
        });

        // Reset matchday to Today (offset 0) and activate the Today date pill
        state.selectedDayOffset = 0;
        state.selectedDateStr = '';
        document.querySelectorAll('.date-pill-btn').forEach(b => {
            const isToday = b.dataset.offset === '0' || b.textContent.trim().toUpperCase() === 'TODAY';
            b.classList.toggle('active', isToday);
        });

        if (elements['league-card']) elements['league-card'].hidden = true;
        if (elements['welcome-state']) elements['welcome-state'].hidden = true;
        if (elements['league-dashboard']) elements['league-dashboard'].hidden = false;
        if (elements['dashboard-country']) elements['dashboard-country'].textContent = 'World Football';
        if (elements['dashboard-title']) elements['dashboard-title'].textContent = 'All Live Matches & Fixtures';

        const leagueToolbar = document.getElementById('league-view-toolbar');
        if (leagueToolbar) leagueToolbar.style.display = 'none';
        switchView('fixtures');

        const explorer = document.querySelector('.explorer') || elements['fixtures-list'];
        if (explorer && window.scrollY > (explorer.offsetTop + 200)) {
            window.scrollTo({ top: Math.max(0, explorer.offsetTop - 70), behavior: 'smooth' });
        }

        await loadAllLeagueFixtures();
    }

    let inFlightAllFixturesPromise = null;
    async function loadAllLeagueFixtures({ background = false, favoritesOnly = false } = {}) {
        if (inFlightAllFixturesPromise) {
            return inFlightAllFixturesPromise;
        }

        if (!background) {
            setLoading('fixtures', true);
            if (elements['fixtures-list']) elements['fixtures-list'].replaceChildren();
        }

        inFlightAllFixturesPromise = (async () => {
            try {
                // Determine date param
                let dateParam = 'today';
                if (state.selectedDayOffset === -1) dateParam = 'yesterday';
                else if (state.selectedDayOffset === 1) dateParam = 'tomorrow';
                else if (state.selectedDayOffset === 0) dateParam = 'today';
                else if (state.selectedDateStr) dateParam = state.selectedDateStr;

                const isFavorites = state.currentStatus === 'favorites' || Boolean(favoritesOnly);
                const statusParam = isFavorites ? 'all' : (state.currentStatus || 'all');
                let url = `/api/v1/football/fixtures?date=${encodeURIComponent(dateParam)}&limit=200`;
                if (statusParam && statusParam !== 'all') {
                    url += `&status=${encodeURIComponent(statusParam)}`;
                }

                let matches = [];

                if (isFavorites) {
                    // Fetch fixtures and live matches in parallel so pinned matches from both feeds are found
                    const [fixturesRes, liveRes] = await Promise.allSettled([
                        fetchJson(url),
                        fetchJson('/api/v1/football/live')
                    ]);
                    const fixturesMatches = fixturesRes.status === 'fulfilled' ? (fixturesRes.value?.matches || fixturesRes.value?.fixtures || []) : [];
                    const liveMatches = liveRes.status === 'fulfilled' ? (liveRes.value?.live || liveRes.value?.matches || []) : [];
                    const allAvailable = deduplicateMatchesList([...liveMatches, ...fixturesMatches]);
                    matches = allAvailable.filter(m => state.pinnedMatches.includes(String(m.id)));

                    if (!matches.length) {
                        if (elements['fixtures-empty']) {
                            elements['fixtures-empty'].hidden = false;
                            elements['fixtures-empty'].innerHTML = `
                                <div class="empty-state-card" style="text-align:center; padding:28px 16px;">
                                    <span class="empty-icon" style="font-size:32px; display:block; margin-bottom:10px;">⭐</span>
                                    <p style="font-size:15px; font-weight:700; color:var(--text-main); margin-bottom:6px;">No Pinned Games</p>
                                    <p style="font-size:13px; color:var(--text-muted); margin:0 0 16px;">Click the ★ star icon next to any match in All or Live view to pin it to My Games for instant tracking.</p>
                                    <button class="btn-primary" type="button" id="fav-view-all-btn" style="display:inline-flex; align-items:center; gap:6px; padding:8px 18px; border-radius:6px; font-size:13px; font-weight:600; cursor:pointer;">
                                        <span>🌐</span> <span>Browse All Games</span>
                                    </button>
                                </div>
                            `;
                            const browseBtn = document.getElementById('fav-view-all-btn');
                            if (browseBtn) {
                                browseBtn.addEventListener('click', (e) => {
                                    e.preventDefault();
                                    selectAllLeagues();
                                });
                            }
                        }
                        if (elements['fixture-count']) elements['fixture-count'].textContent = '0';
                        if (elements['fixtures-list']) elements['fixtures-list'].innerHTML = '';
                        return;
                    }
                } else if (dateParam === 'today' && (statusParam === 'all' || !statusParam)) {
                    // Fetch fixtures (which already includes in-play live matches from backend in one unified response)
                    const fixturesRes = await fetchJson(url);
                    matches = fixturesRes.matches || fixturesRes.fixtures || [];
                } else {
                    const data = await fetchJson(url);
                    matches = data.matches || data.fixtures || [];
                }

                if (!matches.length) {
                    // ONLY fall back to checking live matches if user was viewing today on ALL view
                    // NEVER fall back if user explicitly clicked 'finished' or 'scheduled'
                    if (dateParam === 'today' && !isFavorites && statusParam === 'all') {
                        try {
                            const liveData = await fetchJson('/api/v1/football/live');
                            const liveList = liveData?.live || liveData?.matches || [];
                            if (liveList.length) {
                                state.liveMatchCount = liveList.length;
                                await loadLiveMatches({ background });
                                return;
                            }
                        } catch {}
                    }
                    renderAllLeaguesGrouped([]);
                    return;
                }

                // Deduplicate all fixtures globally across all feeds / providers
                const dedupedMatches = deduplicateMatchesList(matches);

                const groupsMap = new Map();
                for (const m of dedupedMatches) {
                    const league = enrichLeagueMeta(m.league, m);
                    const groupKey = (league.slug && league.slug !== 'w.other' && league.slug !== 'other')
                        ? league.slug
                        : `league_${(league.name || 'other').toLowerCase().replace(/[^a-z0-9]/g, '_')}`;

                    if (!groupsMap.has(groupKey)) {
                        groupsMap.set(groupKey, {
                            league,
                            events: []
                        });
                    }
                    groupsMap.get(groupKey).events.push(m);
                }

                renderAllLeaguesGrouped([...groupsMap.values()]);
            } catch (error) {
                if (elements['fixtures-empty']) elements['fixtures-empty'].hidden = false;
                showToast(`Unable to load all fixtures: ${error.message}`);
            } finally {
                if (!background) setLoading('fixtures', false);
                inFlightAllFixturesPromise = null;
            }
        })();

        return inFlightAllFixturesPromise;
    }

    function renderAllLeaguesGrouped(groupedData) {
        if (!elements['fixtures-list']) return;

        const prevScrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
        const fixturesContainer = elements['fixtures-list'];
        if (fixturesContainer && prevScrollY > 0) {
            fixturesContainer.style.minHeight = Math.max(fixturesContainer.offsetHeight, prevScrollY + window.innerHeight + 100) + 'px';
        }

        let totalCount = 0;

        // Sort grouped leagues by top leagues priority (UCL, EPL, La Liga, Serie A, etc. on top)
        const sortedGroups = [...groupedData].sort((a, b) => {
            const pA = getLeaguePriorityClient(a.league?.slug);
            const pB = getLeaguePriorityClient(b.league?.slug);
            if (pB !== pA) return pB - pA;
            return (a.league?.name || '').localeCompare(b.league?.name || '');
        });

        // Pinned Matches Section at the top (deduplicated)
        const pinnedEvents = [];
        const seenPinnedSig = new Set();
        for (const grp of sortedGroups) {
            for (const ev of (grp.events || [])) {
                if (state.pinnedMatches.includes(String(ev.id))) {
                    const sig = getEventDedupSignature(ev) || String(ev.id);
                    if (!seenPinnedSig.has(sig)) {
                        seenPinnedSig.add(sig);
                        pinnedEvents.push({ event: ev, league: grp.league });
                    }
                }
            }
        }

        let pinnedHtml = '';
        if (pinnedEvents.length > 0) {
            pinnedHtml = `
                <div class="fs-league-section fs-pinned-section" style="border: 1px solid rgba(245, 158, 11, 0.4); margin-bottom: 20px;">
                    <div class="fs-league-header" style="background: rgba(245, 158, 11, 0.08);">
                        <div class="fs-league-title">
                            <span class="fs-league-flag" style="color:#f59e0b;">⭐</span>
                            <strong>Pinned Matches</strong>
                            <small class="fs-league-country" style="color:#f59e0b;">Quick Access</small>
                        </div>
                    </div>
                    <div class="fs-league-matches">
                        ${pinnedEvents.map(({ event, league }) => renderFlashscoreMatchRow(event, league)).join('')}
                    </div>
                </div>
            `;
        }

        // 1. First pass: Globally identify canonical matches across all leagues
        // Uses getEventDedupSignature(ev) which preserves tier and prevents Youth vs Senior match collision!
        const globalSeenMatchSig = new Map();
        for (const { league, events } of sortedGroups) {
            for (const ev of (events || [])) {
                const sig = getEventDedupSignature(ev);
                if (!sig || sig === '_vs_') continue;

                const { home } = competitorsFromEvent(ev);
                const hLogo = home.team?.logo || ev.home?.logo || '';
                const isEspn = hLogo.includes('espncdn') || /^\d{6,}$/.test(String(ev.id));
                const isSpecificLeague = league?.slug && league.slug !== 'other' && league.slug !== 'w.other';
                const evScore = (isEspn ? 4 : 0) + (isSpecificLeague ? 2 : 0) + (ev.status?.clock ? 1 : 0);

                if (!globalSeenMatchSig.has(sig)) {
                    globalSeenMatchSig.set(sig, { id: ev.id, score: evScore });
                } else {
                    const existing = globalSeenMatchSig.get(sig);
                    if (evScore > existing.score) {
                        globalSeenMatchSig.set(sig, { id: ev.id, score: evScore });
                    }
                }
            }
        }

        const html = sortedGroups.map(({ league, events }) => {
            if (!events || !events.length) return '';

            // Deduplicate events within this league using full tier-aware signature
            const seenMatchSig = new Map();
            for (const ev of events) {
                const sig = getEventDedupSignature(ev);
                if (!sig || sig === '_vs_') continue;

                if (globalSeenMatchSig.has(sig)) {
                    const canonical = globalSeenMatchSig.get(sig);
                    if (canonical.id !== ev.id) continue; // Skip inferior duplicate
                }

                const { home } = competitorsFromEvent(ev);
                const hLogo = home.team?.logo || ev.home?.logo || '';
                const evScore = (hLogo.includes('espncdn') ? 3 : 0) + (/^\d{6,}$/.test(String(ev.id)) ? 2 : 0);

                if (!seenMatchSig.has(sig)) {
                    seenMatchSig.set(sig, { event: ev, score: evScore });
                } else {
                    const existing = seenMatchSig.get(sig);
                    if (evScore > existing.score) {
                        seenMatchSig.set(sig, { event: ev, score: evScore });
                    }
                }
            }
            const dedupedEvents = Array.from(seenMatchSig.values()).map(e => e.event);
            if (!dedupedEvents.length) return '';

            totalCount += dedupedEvents.length;
            const flag = renderLeagueAvatarHtml(league, { size: 18, className: 'fs-league-flag-img' });
            const isCollapsed = state.collapsedLeagues.has(league.slug);
            return `
                <div class="fs-league-section ${isCollapsed ? 'is-collapsed' : ''}" data-league-slug="${escapeHtml(league.slug)}">
                    <div class="fs-league-header" role="button" tabindex="0" data-toggle-slug="${escapeHtml(league.slug)}" aria-expanded="${!isCollapsed}" title="Click to ${isCollapsed ? 'expand' : 'collapse'} ${escapeHtml(league.name)}">
                        <div class="fs-league-title">
                            <span class="fs-collapse-chevron ${isCollapsed ? 'is-collapsed' : ''}" aria-hidden="true">▼</span>
                            ${flag}
                            <strong>${escapeHtml(league.name)}</strong>
                            <small class="fs-league-country">${escapeHtml(league.country || '')}</small>
                            <span class="fs-league-match-count" title="${dedupedEvents.length} games">${dedupedEvents.length}</span>
                        </div>
                        <button class="fs-league-view-btn" type="button" data-slug="${escapeHtml(league.slug)}">Table &rsaquo;</button>
                    </div>
                    <div class="fs-league-matches" style="${isCollapsed ? 'display:none;' : ''}">
                        ${dedupedEvents.map(ev => renderFlashscoreMatchRow(ev, league)).join('')}
                    </div>
                </div>
            `;
        }).join('');

        if (elements['fixture-count']) elements['fixture-count'].textContent = formatNumber(totalCount);
        if (elements['fixtures-load-more']) elements['fixtures-load-more'].hidden = true;

        if (!totalCount) {
            if (elements['fixtures-empty']) {
                elements['fixtures-empty'].hidden = false;
                const dayLabel = (!state.selectedDayOffset || state.selectedDayOffset === 0)
                    ? "today"
                    : (state.selectedDayOffset === 1 ? "tomorrow" : state.selectedDayOffset === -1 ? "yesterday" : "on this date");

                let emptyMsg = `There are no games ${dayLabel}.`;
                let emptySub = "Check Tomorrow or pick an upcoming date to browse world match schedules.";
                let emptyIcon = "⚽";

                if (state.currentStatus === 'finished') {
                    emptyIcon = "🏁";
                    emptyMsg = `No finished games ${dayLabel}.`;
                    emptySub = (!state.selectedDayOffset || state.selectedDayOffset === 0)
                        ? "Completed results will appear here as games finish. You can also view Yesterday's finished scores."
                        : "No completed match results found for this date.";
                } else if (state.currentStatus === 'scheduled') {
                    emptyIcon = "📅";
                    emptyMsg = `No scheduled kickoffs ${dayLabel}.`;
                    emptySub = "Check upcoming dates on the date ribbon above to browse match schedules.";
                }

                elements['fixtures-empty'].innerHTML = `
                    <div class="empty-state-card" style="text-align:center; padding:28px 16px;">
                        <span class="empty-icon" style="font-size:32px; display:block; margin-bottom:10px;">${emptyIcon}</span>
                        <p style="font-size:15px; font-weight:700; color:var(--text-main); margin-bottom:6px;">${emptyMsg}</p>
                        <p style="font-size:13px; color:var(--text-muted); margin:0;">${emptySub}</p>
                    </div>
                `;
            }
            if (elements['fixture-count']) elements['fixture-count'].textContent = '0';
            elements['fixtures-list'].innerHTML = '';
        } else {
            if (elements['fixtures-empty']) elements['fixtures-empty'].hidden = true;
            elements['fixtures-list'].innerHTML = pinnedHtml + html;

            if (prevScrollY > 0) {
                window.scrollTo({ top: prevScrollY, behavior: 'instant' });
                requestAnimationFrame(() => {
                    if (prevScrollY > 0) window.scrollTo({ top: prevScrollY, behavior: 'instant' });
                    setTimeout(() => {
                        if (prevScrollY > 0 && Math.abs((window.scrollY || 0) - prevScrollY) > 5) {
                            window.scrollTo({ top: prevScrollY, behavior: 'instant' });
                        }
                        if (fixturesContainer) fixturesContainer.style.minHeight = '';
                    }, 150);
                });
            }

            elements['fixtures-list'].querySelectorAll('.fs-league-view-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const slug = btn.dataset.slug;
                    selectLeague(slug).then(() => switchView('standings'));
                });
            });

            elements['fixtures-list'].querySelectorAll('.fs-league-header').forEach(header => {
                header.addEventListener('click', (e) => {
                    if (e.target.closest('.fs-league-view-btn')) return;
                    const slug = header.dataset.toggleSlug;
                    if (!slug) return;
                    const section = header.closest('.fs-league-section');
                    const matchesContainer = section?.querySelector('.fs-league-matches');
                    const chevron = header.querySelector('.fs-collapse-chevron');

                    if (state.collapsedLeagues.has(slug)) {
                        state.collapsedLeagues.delete(slug);
                        if (matchesContainer) matchesContainer.style.display = 'block';
                        if (section) section.classList.remove('is-collapsed');
                        if (chevron) chevron.classList.remove('is-collapsed');
                        header.setAttribute('aria-expanded', 'true');
                    } else {
                        state.collapsedLeagues.add(slug);
                        if (matchesContainer) matchesContainer.style.display = 'none';
                        if (section) section.classList.add('is-collapsed');
                        if (chevron) chevron.classList.add('is-collapsed');
                        header.setAttribute('aria-expanded', 'false');
                    }
                });
            });

            if (state.searchQuery) {
                applyLiveSearch(state.searchQuery);
            }
        }
    }

    async function selectLeague(slug) {
        if (slug === 'all') return selectAllLeagues();

        const league = state.leagues.find(item => item.slug === slug);
        if (!league) return selectAllLeagues();

        state.selectedLeagueSlug = slug;
        state.league = league;
        renderQuickLeaguePills(slug);
        renderDesktopSidebar(slug);
        window.clearInterval(state.matchTimer);
        updateLeagueCard(league);
        if (elements['welcome-state']) elements['welcome-state'].hidden = true;
        if (elements['league-dashboard']) elements['league-dashboard'].hidden = false;
        if (elements['dashboard-country']) elements['dashboard-country'].textContent = localCountryName(league.country);
        if (elements['dashboard-title']) elements['dashboard-title'].textContent = league.name;

        // Clear global feed immediately so it does not flash under the league view
        if (elements['fixtures-list']) {
            elements['fixtures-list'].innerHTML = '<div class="content-state"><span class="loader"></span> Loading league fixtures…</div>';
        }
        state.currentStatus = 'all';

        const leagueToolbar = document.getElementById('league-view-toolbar');
        if (leagueToolbar) leagueToolbar.style.display = 'flex';

        const explorer = document.querySelector('.explorer') || elements['fixtures-list'];
        if (explorer && window.scrollY > (explorer.offsetTop + 200)) {
            window.scrollTo({ top: Math.max(0, explorer.offsetTop - 70), behavior: 'smooth' });
        }

        await Promise.allSettled([loadFixtures(), loadStandings()]);
    }

    function fixtureQuery(page) {
        const params = new URLSearchParams({
            limit: '60',
            page: String(page),
            status: elements['fixture-status'] ? elements['fixture-status'].value : 'all'
        });
        if (elements['date-from'] && elements['date-from'].value) {
            params.set('from', elements['date-from'].value.replaceAll('-', ''));
        }
        if (elements['date-to'] && elements['date-to'].value) {
            params.set('to', elements['date-to'].value.replaceAll('-', ''));
        }
        return params;
    }

    async function loadFixtures({ append = false, background = false } = {}) {
        if (!state.league) return;
        if (!background) {
            setLoading('fixtures', true);
            if (!append) {
                state.fixturePage = 1;
                state.fixtures = [];
                if (elements['fixtures-list']) elements['fixtures-list'].replaceChildren();
            }
        }
        try {
            const page = append ? state.fixturePage + 1 : 1;
            const data = await fetchJson(`/get/soccer/${encodeURIComponent(state.league.slug)}/fixtures?${fixtureQuery(page)}`);
            state.fixturePage = data.pageIndex || page;
            state.fixturePageCount = data.pageCount || 1;
            state.fixtures = append
                ? [...state.fixtures, ...(data.events || [])]
                : (data.events || []);
            if (elements['fixture-count']) elements['fixture-count'].textContent = formatNumber(data.count);
            renderFixtures(state.fixtures);
        } catch (error) {
            if (elements['fixtures-empty']) elements['fixtures-empty'].hidden = false;
            showToast(`Unable to load fixtures: ${error.message}`);
        } finally {
            setLoading('fixtures', false);
        }
    }

    async function checkUpcomingLeagueMatchday(league, dayLabel) {
        try {
            const data = await fetchJson(`/get/soccer/${encodeURIComponent(league.slug)}/fixtures?status=scheduled&limit=1`);
            const upcoming = (data.events || [])[0];
            if (upcoming && upcoming.date && elements['fixtures-empty'] && !elements['fixtures-empty'].hidden) {
                const upcomingDate = new Date(upcoming.date);
                if (!isNaN(upcomingDate.getTime())) {
                    const fullDayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                    const formatted = `${fullDayNames[upcomingDate.getDay()]}, ${monthNames[upcomingDate.getMonth()]} ${upcomingDate.getDate()}`;

                    const jumpContainer = document.createElement('div');
                    jumpContainer.className = 'fs-upcoming-jump-box';
                    jumpContainer.style.marginTop = '14px';
                    jumpContainer.innerHTML = `
                        <p style="font-size:13px; color:var(--text-muted); margin:0 0 10px;">
                            Next scheduled matchday for <strong>${escapeHtml(league.name)}</strong> is <strong>${formatted}</strong>:
                        </p>
                        <button type="button" class="btn-primary" id="btn-jump-next-matchday" style="display:inline-flex; align-items:center; gap:6px; padding:7px 14px; font-size:13px; font-weight:700; border-radius:6px; cursor:pointer;">
                            <span>📅 View ${formatted} Matches</span> <span>&rarr;</span>
                        </button>
                    `;
                    if (state.league && state.league.slug === league.slug) {
                        const existingJump = elements['fixtures-empty'].querySelector('.fs-upcoming-jump-box');
                        if (existingJump) existingJump.remove();
                        elements['fixtures-empty'].appendChild(jumpContainer);

                        const jumpBtn = document.getElementById('btn-jump-next-matchday');
                        if (jumpBtn) {
                            jumpBtn.addEventListener('click', () => {
                                setMatchdayDate(upcomingDate);
                            });
                        }
                    }
                }
            }
        } catch {
            // Non-critical background enhancement
        }
    }

    function renderFixtures(fixtures) {
        if (!elements['fixtures-list']) return;
        const prevScrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
        const fixturesContainer = elements['fixtures-list'];
        if (fixturesContainer && prevScrollY > 0) {
            fixturesContainer.style.minHeight = Math.max(fixturesContainer.offsetHeight, prevScrollY + window.innerHeight + 100) + 'px';
        }

        const hasFixtures = Boolean(fixtures && fixtures.length > 0);
        if (elements['fixtures-empty']) {
            elements['fixtures-empty'].hidden = hasFixtures;
            if (!hasFixtures) {
                const compName = state.league?.name || 'this competition';
                const dayLabel = (!state.selectedDayOffset || state.selectedDayOffset === 0)
                    ? "today"
                    : (state.selectedDayOffset === 1 ? "tomorrow" : state.selectedDayOffset === -1 ? "yesterday" : "on this date");
                elements['fixtures-empty'].innerHTML = `
                    <span class="empty-icon">⚽</span>
                    <p style="font-size:15px; font-weight:600; color:var(--text-main); margin-bottom:6px;">There's no games ${dayLabel} in ${escapeHtml(compName)}.</p>
                    <p style="font-size:13px; color:var(--text-muted); margin:0;">Tap "Tomorrow" or use the date picker to browse upcoming fixtures, or switch to Standings.</p>
                `;

                if (state.league && state.league.slug) {
                    checkUpcomingLeagueMatchday(state.league, dayLabel);
                }
            }
        }
        if (elements['fixtures-load-more']) {
            elements['fixtures-load-more'].hidden = !fixtures.length || state.fixturePage >= state.fixturePageCount;
        }
        if (!fixtures.length) {
            elements['fixtures-list'].innerHTML = '';
            return;
        }

        const flagHtml = renderLeagueAvatarHtml(state.league, { size: 18, className: 'fs-league-flag-img' });

        elements['fixtures-list'].innerHTML = `
            <div class="fs-league-section">
                <div class="fs-league-header">
                    <div class="fs-league-title">
                        <span class="fs-league-flag">${flagHtml}</span>
                        <strong>${escapeHtml(state.league?.name || 'League')}</strong>
                        <small class="fs-league-country">${escapeHtml(state.league?.country || '')}</small>
                    </div>
                </div>
                <div class="fs-league-matches">
                    ${fixtures.map(ev => renderFlashscoreMatchRow(ev, state.league)).join('')}
                </div>
            </div>
        `;

        if (prevScrollY > 0) {
            window.scrollTo({ top: prevScrollY, behavior: 'instant' });
            requestAnimationFrame(() => {
                if (prevScrollY > 0) window.scrollTo({ top: prevScrollY, behavior: 'instant' });
                setTimeout(() => {
                    if (prevScrollY > 0 && Math.abs((window.scrollY || 0) - prevScrollY) > 5) {
                        window.scrollTo({ top: prevScrollY, behavior: 'instant' });
                    }
                    if (fixturesContainer) fixturesContainer.style.minHeight = '';
                }, 150);
            });
        }
    }

    function renderFlashscoreMatchRow(event, league = null) {
        const { home, away } = competitorsFromEvent(event);
        const status = statusInfo(event);
        const hasScore = status.state !== 'scheduled';
        const homeName = escapeHtml(home.team?.displayName || home.team?.name || 'Home');
        const awayName = escapeHtml(away.team?.displayName || away.team?.name || 'Away');
        const isLive = status.state === 'live';
        const homeScore = hasScore ? escapeHtml(home.score ?? 0) : '-';
        const awayScore = hasScore ? escapeHtml(away.score ?? 0) : '-';
        const kickoffTime = formatTime(event.date);
        const leagueSlug = league?.slug || state.league?.slug || event.league_slug || '';
        const isPinned = state.pinnedMatches.includes(String(event.id));

        const timeOrStatus = isLive
            ? `<div class="fs-status-live-col"><span class="live-pulse-dot"></span><span class="fs-status-live">${escapeHtml(status.label)}</span></div>`
            : status.state === 'finished'
            ? `<div class="fs-status-finished-col"><span class="fs-status-ft">FT</span><span class="fs-status-time-sub">${kickoffTime}</span></div>`
            : `<span class="fs-status-time">${kickoffTime}</span>`;

        return `
            <div class="fs-match-row ${isLive ? 'is-live-row' : ''}" data-event-id="${escapeHtml(event.id)}" data-league-slug="${escapeHtml(leagueSlug)}" data-search="${escapeHtml(homeName.toLowerCase())} ${escapeHtml(awayName.toLowerCase())} ${escapeHtml(leagueSlug.toLowerCase())}" role="button" tabindex="0" aria-label="${homeName} versus ${awayName}">
                <div class="fs-col-status">
                    ${timeOrStatus}
                </div>
                <div class="fs-col-teams">
                    <div class="fs-team-line ${home.winner ? 'team-winner' : ''}">
                        ${teamLogo(home.team, 'team-crest')}
                        <span class="fs-team-name" title="${homeName}">${homeName}</span>
                    </div>
                    <div class="fs-team-line ${away.winner ? 'team-winner' : ''}">
                        ${teamLogo(away.team, 'team-crest')}
                        <span class="fs-team-name" title="${awayName}">${awayName}</span>
                    </div>
                </div>
                <div class="fs-col-scores">
                    <div class="fs-score-digit ${isLive ? 'score-live' : ''}">${homeScore}</div>
                    <div class="fs-score-digit ${isLive ? 'score-live' : ''}">${awayScore}</div>
                </div>
                <div class="fs-col-action" aria-hidden="true">
                    <button class="fs-pin-btn ${isPinned ? 'is-pinned' : ''}" type="button" data-pin-id="${escapeHtml(event.id)}" title="${isPinned ? 'Unpin match' : 'Pin match to top'}">★</button>
                    <span class="fs-chevron">&rsaquo;</span>
                </div>
            </div>
        `;
    }

    async function loadStandings() {
        if (!state.league) return;
        setLoading('standings', true);
        if (elements['standings-content']) elements['standings-content'].replaceChildren();
        try {
            const data = await fetchJson(`/get/soccer/${encodeURIComponent(state.league.slug)}/standings`);
            state.standings = data.children || [];
            renderStandings(state.standings);
        } catch (error) {
            if (elements['standings-empty']) elements['standings-empty'].hidden = false;
            showToast(`Unable to load standings: ${error.message}`);
        } finally {
            setLoading('standings', false);
        }
    }

    function statValue(entry, ...names) {
        const stats = entry.stats || [];
        for (const name of names) {
            const stat = stats.find(item => item.name === name);
            if (stat) return stat.displayValue ?? '—';
        }
        return '—';
    }

    function renderStandings(groups) {
        if (!elements['standings-content']) return;
        elements['standings-empty'].hidden = groups.length > 0;
        if (!groups.length) return;

        elements['standings-content'].innerHTML = groups.map(group => {
            const rawEntries = group.standings?.entries || [];
            const entries = rawEntries.slice().sort((a, b) => {
                const rA = Number(a.rank ?? statValue(a, 'rank')) || 999;
                const rB = Number(b.rank ?? statValue(b, 'rank')) || 999;
                if (rA !== rB) return rA - rB;
                const pA = Number(statValue(a, 'points')) || 0;
                const pB = Number(statValue(b, 'points')) || 0;
                return pB - pA;
            });
            return `
                <section class="standing-group" style="margin-bottom:30px;">
                    <h3 style="margin-bottom:12px; font-size:16px; font-weight:700;">${escapeHtml(group.name || 'League Table')}</h3>
                    <div class="standings-table-container">
                        <table class="standings-table">
                            <thead>
                                <tr>
                                    <th>Pos</th>
                                    <th>Club</th>
                                    <th>Pl</th>
                                    <th>W</th>
                                    <th>D</th>
                                    <th>L</th>
                                    <th>GD</th>
                                    <th>Pts</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${entries.map(entry => `
                                    <tr>
                                        <td style="font-weight:700; color:var(--text-muted);">${escapeHtml(entry.rank ?? statValue(entry, 'rank'))}</td>
                                        <td>
                                            <div class="club-cell">
                                                ${teamLogo(entry.team, 'club-crest-small')}
                                                <strong>${escapeHtml(entry.team?.displayName || entry.team?.name || '—')}</strong>
                                            </div>
                                        </td>
                                        <td>${escapeHtml(statValue(entry, 'gamesPlayed'))}</td>
                                        <td>${escapeHtml(statValue(entry, 'wins'))}</td>
                                        <td>${escapeHtml(statValue(entry, 'ties', 'draws'))}</td>
                                        <td>${escapeHtml(statValue(entry, 'losses'))}</td>
                                        <td style="font-weight:600;">${escapeHtml(statValue(entry, 'goalDifference', 'pointDifferential'))}</td>
                                        <td style="font-weight:800; color:var(--color-primary);">${escapeHtml(statValue(entry, 'points'))}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </section>
            `;
        }).join('');
    }

    function switchView(view) {
        const fixtures = view === 'fixtures';
        if (elements['fixtures-view']) elements['fixtures-view'].hidden = !fixtures;
        if (elements['standings-view']) elements['standings-view'].hidden = fixtures;
        if (elements['fixtures-tab']) {
            elements['fixtures-tab'].classList.toggle('active', fixtures);
            elements['fixtures-tab'].setAttribute('aria-selected', String(fixtures));
        }
        if (elements['standings-tab']) {
            elements['standings-tab'].classList.toggle('active', !fixtures);
            elements['standings-tab'].setAttribute('aria-selected', String(!fixtures));
        }
    }

    let lastWindowScrollY = 0;
    const matchDetailsClientCache = new Map();

    async function openMatch(eventId, leagueSlug = '') {
        state.currentEventId = eventId;
        lastWindowScrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
        if (leagueSlug) {
            const found = state.leagues.find(item => item.slug === leagueSlug);
            if (found) state.league = found;
        }
        window.clearInterval(state.matchTimer);
        if (elements['match-dialog'] && !elements['match-dialog'].open) {
            elements['match-dialog'].showModal();
            window.scrollTo({ top: lastWindowScrollY, behavior: 'instant' });
            document.body.classList.add('dialog-open');
        }

        // Instant render from client cache if available
        const cached = matchDetailsClientCache.get(String(eventId));
        if (cached && (Date.now() - cached.ts < 60000)) {
            renderMatchDetails(cached.summary, cached.plays, cached.predictions, false);
            // Re-fetch in background silently to ensure fresh clock/incidents
            loadMatchDetails(eventId, true, leagueSlug);
            return;
        }

        // Instant optimistic render from in-memory fixture / live match list (<50ms)
        const liveMatch = (state.liveMatches || []).find(m => String(m.id || m.source?.event_id) === String(eventId));
        const fixtureMatch = (state.fixtures || []).find(m => String(m.id || m.source?.event_id) === String(eventId));
        const matchObj = liveMatch || fixtureMatch;

        if (matchObj) {
            const compStatus = matchObj.status || {};
            const initialSummary = {
                header: {
                    id: eventId,
                    date: matchObj.date,
                    competitions: [{
                        id: eventId,
                        date: matchObj.date,
                        status: compStatus,
                        competitors: [
                            { homeAway: 'home', team: matchObj.home, score: matchObj.home?.score },
                            { homeAway: 'away', team: matchObj.away, score: matchObj.away?.score }
                        ],
                        league: { name: matchObj.note || state.league?.name || '' }
                    }]
                },
                gameInfo: {
                    venue: matchObj.venue || { fullName: 'Stadium Venue' }
                },
                boxscore: matchObj.boxscore || {
                    teams: [
                        { homeAway: 'home', team: matchObj.home, statistics: [] },
                        { homeAway: 'away', team: matchObj.away, statistics: [] }
                    ]
                },
                keyEvents: matchObj.key_events || [],
                timeline: matchObj.key_events || [],
                rosters: matchObj.lineups || []
            };
            renderMatchDetails(initialSummary, initialSummary.timeline, null, false);
            loadMatchDetails(eventId, true, leagueSlug);
            return;
        }

        await loadMatchDetails(eventId, false, leagueSlug);
    }

    async function loadMatchDetails(eventId, silent, leagueSlug = '') {
        const slug = leagueSlug || state.league?.slug || 'all';
        if (!state.league && state.leagues.length) {
            const found = state.leagues.find(item => item.slug === slug);
            state.league = found || state.leagues[0];
        }
        if (state.currentEventId !== eventId) return;
        if (!silent && elements['dialog-content']) {
            if (elements['dialog-status']) {
                elements['dialog-status'].textContent = 'Loading...';
                elements['dialog-status'].className = 'minute-pill pre';
            }
            if (elements['dialog-date']) elements['dialog-date'].textContent = '—';
            elements['dialog-content'].innerHTML = '<div class="content-state"><span class="loader"></span><p>Loading match telemetry…</p></div>';
        }

        const base = `/get/soccer/${encodeURIComponent(slug)}/events/${encodeURIComponent(eventId)}`;
        const [summaryResult, playsResult, predResult] = await Promise.allSettled([
            fetchJson(base),
            fetchJson(`${base}/plays?important=true&limit=300`),
            fetchJson(`/api/v1/football/predictions-context/${encodeURIComponent(eventId)}`)
        ]);

        let summary = summaryResult.status === 'fulfilled' ? summaryResult.value : null;

        if (!summary) {
            // Fallback to global match API endpoint with ESPN / LiveScore enrichment
            try {
                const matchApiRes = await fetchJson(`/api/v1/football/matches/${encodeURIComponent(eventId)}`);
                if (matchApiRes?.summary || matchApiRes?.match) {
                    summary = matchApiRes.summary || matchApiRes.match;
                }
            } catch (err) {}
        }

        if (!summary) {
            if (elements['dialog-content']) {
                elements['dialog-content'].innerHTML = `<div class="content-state"><span class="empty-icon">!</span><p>${escapeHtml(summaryResult.reason?.message || 'Match details could not be loaded.')}</p></div>`;
            }
            return;
        }

        let plays = playsResult.status === 'fulfilled' ? (playsResult.value?.items || []) : [];
        if (!plays.length && summary.timeline?.length) {
            plays = summary.timeline;
        }
        const predictions = predResult.status === 'fulfilled' ? predResult.value : null;

        // Cache for instant back/forth modal opening
        matchDetailsClientCache.set(String(eventId), {
            summary,
            plays,
            predictions,
            ts: Date.now()
        });

        renderMatchDetails(summary, plays, predictions, silent);

        const competition = summary.header?.competitions?.[0] || {};
        const status = competition.status?.type?.state;
        if (status === 'in') {
            window.clearInterval(state.matchTimer);
            state.matchTimer = window.setInterval(() => loadMatchDetails(eventId, true, slug), 15000);
        }
    }

    function matchEventKind(event) {
        const type = `${event.type?.type || ''} ${event.type?.text || ''}`.toLowerCase();
        if (event.scoringPlay || type.includes('goal')) return 'goal';
        if (event.redCard || type.includes('red card')) return 'red-card';
        if (event.yellowCard || type.includes('yellow card')) return 'yellow-card';
        if (event.substitution || type.includes('substitution')) return 'substitution';
        return 'event';
    }

    function eventTeam(event, home, away) {
        const id = String(event.team?.id || event.team?.source_id
            || event.athletesInvolved?.[0]?.team?.id || '');
        const homeId = String(home.id || home.team?.id || '');
        const awayId = String(away.id || away.team?.id || '');
        if (id && id === homeId) return home.team;
        if (id && id === awayId) return away.team;
        if (event.team?.side === 'home') return home.team;
        if (event.team?.side === 'away') return away.team;
        if (event.team?.displayName || event.team?.name) return event.team;
        return event.team || null;
    }

    function normalizeMatchEvent(event, index, source, home, away) {
        const athlete = event.athletesInvolved?.[0] || event.athlete || null;
        const participants = (event.participants || []).map(participant =>
            participant.athlete || participant).filter(Boolean);
        const kind = matchEventKind(event);
        const typeText = (typeof event.type === 'string' ? event.type : (event.type?.text || event.type?.type)) || 'Match event';
        const team = eventTeam(event, home, away);
        const athleteName = athlete?.displayName || athlete?.fullName || athlete?.shortName || '';

        let rawText = event.text;
        if (rawText && typeof rawText === 'object') {
            rawText = rawText.text || rawText.displayValue || rawText.description || '';
        }
        let altText = event.alternativeText;
        if (altText && typeof altText === 'object') {
            altText = altText.text || altText.displayValue || '';
        }

        let cleanText = (typeof rawText === 'string' && rawText.trim() && !rawText.includes('[object'))
            ? rawText.trim()
            : ((typeof altText === 'string' && altText.trim() && !altText.includes('[object'))
                ? altText.trim()
                : (athleteName ? `${athleteName} · ${typeText}` : typeText));

        if (cleanText.includes('[object')) {
            cleanText = athleteName ? `${athleteName} · ${typeText}` : typeText;
        }

        const clockDisplay = typeof event.clock === 'string'
            ? event.clock
            : (event.clock?.displayValue || (event.clockValue ? `${event.clockValue}'` : ''));
        const clockValue = typeof event.clockValue === 'number'
            ? event.clockValue
            : (Number(event.clock?.value) || parseInt(event.clock, 10) || 0);

        return {
            id: event.id || `${source}-${index}`,
            source,
            kind,
            text: cleanText,
            typeText,
            athlete,
            participants,
            team,
            clock: clockDisplay,
            clockValue,
            scoringPlay: Boolean(event.scoringPlay || kind === 'goal'),
            penaltyKick: Boolean(event.penaltyKick),
            ownGoal: Boolean(event.ownGoal)
        };
    }

    function substitutionPlayers(event, summary) {
        const roster = (summary.rosters || []).flatMap(team => team.roster || []);
        const participantIds = new Set((event.participants || []).map(player => String(player.id || '')));
        const eventText = String(event.text || '').toLowerCase();
        const belongsToEvent = entry => {
            const athlete = entry.athlete || {};
            return participantIds.has(String(athlete.id || ''))
                || (athlete.displayName && eventText.includes(athlete.displayName.toLowerCase()));
        };
        const incomingEntry = roster.find(entry => entry.subbedIn && belongsToEvent(entry));
        const outgoingEntry = roster.find(entry => entry.subbedOut && belongsToEvent(entry));
        const incoming = incomingEntry?.athlete || outgoingEntry?.subbedOutFor?.athlete
            || event.participants?.[0] || null;
        const outgoing = outgoingEntry?.athlete || incomingEntry?.subbedInFor?.athlete
            || event.participants?.[1] || null;
        return { incoming, outgoing };
    }

    function matchTimeline(summary, plays, home, away) {
        const rawKeyEvents = [
            ...(summary.keyEvents || []),
            ...(summary.header?.competitions?.[0]?.details || [])
        ];
        const keyEvents = rawKeyEvents.map((event, index) =>
            normalizeMatchEvent(event, index, 'key-event', home, away));
        const playEvents = (plays || []).map((event, index) =>
            normalizeMatchEvent(event, index, 'play', home, away));

        const events = [];
        const seenIncidents = new Map();

        for (const event of [...keyEvents, ...playEvents]) {
            const teamSide = event.team?.side || (event.team?.id && String(event.team.id) === String(home.team?.id) ? 'home' : (event.team?.id && String(event.team.id) === String(away.team?.id) ? 'away' : ''));
            const teamId = teamSide || String(event.team?.id || event.team?.source_id || event.team?.displayName || event.team?.name || '').toLowerCase();
            const minute = event.clockValue || (parseInt(event.clock, 10) || 0);

            // Format display clock if raw seconds
            if (typeof event.clock === 'string' && /^\d{3,}$/.test(event.clock.trim())) {
                const num = Number(event.clock.trim());
                event.clock = `${Math.floor(num / 60)}'`;
            }

            // Deduplicate matching goals, cards, and substitutions occurring in the same minute
            const athleteName = (event.athlete?.displayName || event.athlete?.fullName || '').toLowerCase().trim();
            const incidentKey = event.kind === 'goal'
                ? `goal|${minute}|${teamSide || teamId}`
                : `${event.kind}|${minute}|${teamSide || teamId}|${athleteName || String(event.text || '').slice(0, 16).toLowerCase()}`;

            if (seenIncidents.has(incidentKey)) {
                const existing = seenIncidents.get(incidentKey);
                const existingHasPlayer = Boolean(existing.athlete?.displayName || existing.athlete?.fullName);
                const currentHasPlayer = Boolean(event.athlete?.displayName || event.athlete?.fullName);
                if (!existingHasPlayer && currentHasPlayer) {
                    existing.athlete = event.athlete;
                    existing.participants = event.participants;
                    existing.text = event.text;
                }
                if (event.scoringPlay) existing.scoringPlay = true;
                if (event.penaltyKick) existing.penaltyKick = true;
                if (event.ownGoal) existing.ownGoal = true;
                continue;
            }

            seenIncidents.set(incidentKey, event);
            events.push(event);
        }
        return events.sort((left, right) => (left.clockValue || 0) - (right.clockValue || 0));
    }

    function eventBadge(kind) {
        const badges = {
            goal: '<span class="event-badge goal" style="background:var(--color-primary); color:#ffffff; font-weight:700; padding:2px 6px; border-radius:4px; font-size:11px;">⚽ GOAL</span>',
            'red-card': '<span class="event-badge red-card" style="background:#dc2626; color:#ffffff; font-weight:700; padding:2px 6px; border-radius:4px; font-size:11px;">🟥 RED</span>',
            'yellow-card': '<span class="event-badge yellow-card" style="background:#eab308; color:#000000; font-weight:700; padding:2px 6px; border-radius:4px; font-size:11px;">🟨 YELLOW</span>',
            substitution: '<span class="event-badge substitution" style="background:var(--border-strong); color:var(--text-main); font-weight:700; padding:2px 6px; border-radius:4px; font-size:11px;">⇄ SUB</span>',
            event: '<span class="event-badge" style="background:var(--border-subtle); color:var(--text-muted); font-size:11px; padding:2px 6px; border-radius:4px;">EVENT</span>'
        };
        return badges[kind] || badges.event;
    }

    function renderMatchDetails(summary, plays, predictions = null, silent = false) {
        const competition = summary.header?.competitions?.[0] || {};
        const event = { date: competition.date, competitions: [competition], status: competition.status };
        const { home, away } = competitorsFromEvent(event);
        const status = statusInfo(event);
        const venue = summary.gameInfo?.venue;
        let homeStats = summary.boxscore?.teams?.find(item => item.homeAway === 'home' || item.id === 'home' || String(item.team?.id) === String(home.team?.id) || item.displayOrder === 1)?.statistics || [];
        let awayStats = summary.boxscore?.teams?.find(item => item.homeAway === 'away' || item.id === 'away' || String(item.team?.id) === String(away.team?.id) || item.displayOrder === 2)?.statistics || [];
        const events = matchTimeline(summary, plays, home, away);

        // Do NOT synthesize fake figures! Keep stats empty if not yet recorded by the provider.
        const isPreMatch = status.state === 'scheduled' || (!status.isLive && status.state !== 'live' && status.state !== 'finished');
        if (summary.boxscore) {
            summary.boxscore.isDerivedTelemetry = false;
        }
        const hasStats = Boolean(homeStats.length || awayStats.length);
        const scorers = events.filter(event => event.scoringPlay);
        const substitutions = events.filter(event => event.kind === 'substitution').map(event => ({
            ...event,
            ...substitutionPlayers(event, summary)
        }));

        if (elements['dialog-status']) {
            elements['dialog-status'].textContent = status.label;
            elements['dialog-status'].className = `minute-pill ${status.pillClass}`;
        }
        if (elements['dialog-date']) {
            elements['dialog-date'].textContent = `${formatDate(competition.date, { year: true })} · ${formatTime(competition.date)}`;
        }

        const statNames = [...new Set([...homeStats, ...awayStats].map(item => item.name))].slice(0, 12);
        const statRows = statNames.map(name => {
            const homeItem = homeStats.find(item => item.name === name);
            const awayItem = awayStats.find(item => item.name === name);
            const homeVal = Number(homeItem?.displayValue?.replace('%', '') || 0);
            const awayVal = Number(awayItem?.displayValue?.replace('%', '') || 0);
            const total = (homeVal + awayVal) || 1;
            const homePct = Math.round((homeVal / total) * 100);
            const awayPct = 100 - homePct;

            return `
                <div class="stat-row">
                    <div class="stat-title-row">
                        <span><strong>${escapeHtml(homeItem?.displayValue ?? '—')}</strong></span>
                        <span style="text-transform:uppercase; font-size:11px; letter-spacing:0.5px;">${escapeHtml(statLabels[name] || name)}</span>
                        <span><strong>${escapeHtml(awayItem?.displayValue ?? '—')}</strong></span>
                    </div>
                    <div class="stat-bar-track">
                        <div class="stat-bar-home" style="width:${homePct}%;"></div>
                        <div class="stat-bar-away" style="width:${awayPct}%;"></div>
                    </div>
                </div>
            `;
        }).join('');

        const scorerRows = scorers.map(goal => {
            const detail = [
                goal.team?.displayName || goal.team?.name,
                goal.penaltyKick ? 'Penalty' : '',
                goal.ownGoal ? 'Own goal' : ''
            ].filter(Boolean).join(' · ');
            return `
                <div class="timeline-item">
                    <span class="timeline-minute">${escapeHtml(goal.clock || '—')}</span>
                    ${eventBadge('goal')}
                    <div class="timeline-details">
                        <strong>${escapeHtml(goal.athlete?.displayName || goal.athlete?.fullName || goal.text || 'Goal')}</strong>
                        <div class="timeline-subtext">${escapeHtml(detail || goal.typeText)}</div>
                    </div>
                </div>
            `;
        }).join('');

        const timelineRows = events.map(event => `
            <div class="timeline-item">
                <span class="timeline-minute">${escapeHtml(event.clock || '—')}</span>
                ${eventBadge(event.kind)}
                <div class="timeline-details">
                    <p style="margin:0;">${escapeHtml(event.text)}</p>
                    ${event.team?.displayName || event.team?.name ? `<small style="color:var(--text-muted);">${escapeHtml(event.team.displayName || event.team.name)}</small>` : ''}
                </div>
            </div>
        `).join('');

        const substitutionRows = substitutions.map(item => `
            <div class="timeline-item">
                <span class="timeline-minute">${escapeHtml(item.clock || '—')}</span>
                ${eventBadge('substitution')}
                <div class="timeline-details">
                    <div>
                        <span style="color:#10b981; font-weight:700;">IN:</span> <strong>${escapeHtml(item.incoming?.displayName || item.incoming?.fullName || 'Player In')}</strong>
                    </div>
                    <div>
                        <span style="color:#ef4444; font-weight:700;">OUT:</span> <span style="color:var(--text-muted);">${escapeHtml(item.outgoing?.displayName || item.outgoing?.fullName || 'Player Out')}</span>
                    </div>
                    <small style="color:var(--text-faint);">${escapeHtml(item.team?.displayName || item.team?.name || '')}</small>
                </div>
            </div>
        `).join('');

        const predHints = predictions?.norraAiPredictionHints || {};
        const h2h = predictions?.h2h || {};
        let recentH2h = h2h.recentMeetings || [];
        if (!recentH2h.length && summary.seasonseries?.length) {
            const series = summary.seasonseries.find(s => s.type === 'head-to-head') || summary.seasonseries[0];
            if (series?.events?.length) {
                recentH2h = series.events.map(ev => {
                    const comps = ev.competitors || [];
                    const hComp = comps.find(c => c.homeAway === 'home') || comps[0] || {};
                    const aComp = comps.find(c => c.homeAway === 'away') || comps[1] || {};
                    return {
                        id: ev.id,
                        date: ev.date,
                        homeTeam: hComp.team?.displayName || 'Home',
                        awayTeam: aComp.team?.displayName || 'Away',
                        score: `${hComp.score ?? 0} - ${aComp.score ?? 0}`,
                        winner: hComp.winner ? (hComp.team?.displayName || 'Home') : aComp.winner ? (aComp.team?.displayName || 'Away') : 'Draw'
                    };
                });
            }
        }

        const homeAnalytics = predictions?.teams?.home?.analytics || {};
        const awayAnalytics = predictions?.teams?.away?.analytics || {};

        function isMatchingClub(teamA, teamB) {
            if (!teamA || !teamB) return false;
            const idA = String(teamA.id || teamA.source_id || '');
            const idB = String(teamB.id || teamB.source_id || '');
            if (idA && idB && idA === idB) return true;
            const nameA = (teamA.displayName || teamA.name || teamA.shortDisplayName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            const nameB = (teamB.displayName || teamB.name || teamB.shortDisplayName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            if (!nameA || !nameB) return false;
            return nameA.includes(nameB) || nameB.includes(nameA);
        }

        if (!homeAnalytics.recentMatches?.length && summary.lastFiveGames?.length) {
            const hL5 = summary.lastFiveGames.find(t => isMatchingClub(t.team, home.team)) || summary.lastFiveGames[0];
            if (hL5?.events?.length) {
                homeAnalytics.recentMatches = hL5.events.map(ev => ({
                    date: ev.gameDate,
                    opponent: ev.opponent?.displayName || 'Opponent',
                    score: ev.score || '',
                    result: ev.gameResult || 'D',
                    venue: ev.atVs === '@' ? 'Away' : 'Home'
                }));
                if (!homeAnalytics.formGuide?.length) {
                    homeAnalytics.formGuide = homeAnalytics.recentMatches.map(m => m.result);
                }
                if (!homeAnalytics.winRate && homeAnalytics.recentMatches.length) {
                    const wins = homeAnalytics.recentMatches.filter(m => m.result === 'W').length;
                    homeAnalytics.winRate = Math.round((wins / homeAnalytics.recentMatches.length) * 100);
                }
            }
        }
        if (!awayAnalytics.recentMatches?.length && summary.lastFiveGames?.length) {
            const aL5 = summary.lastFiveGames.find(t => isMatchingClub(t.team, away.team)) || summary.lastFiveGames[1];
            if (aL5?.events?.length) {
                awayAnalytics.recentMatches = aL5.events.map(ev => ({
                    date: ev.gameDate,
                    opponent: ev.opponent?.displayName || 'Opponent',
                    score: ev.score || '',
                    result: ev.gameResult || 'D',
                    venue: ev.atVs === '@' ? 'Away' : 'Home'
                }));
                if (!awayAnalytics.formGuide?.length) {
                    awayAnalytics.formGuide = awayAnalytics.recentMatches.map(m => m.result);
                }
                if (!awayAnalytics.winRate && awayAnalytics.recentMatches.length) {
                    const wins = awayAnalytics.recentMatches.filter(m => m.result === 'W').length;
                    awayAnalytics.winRate = Math.round((wins / awayAnalytics.recentMatches.length) * 100);
                }
            }
        }

        const homeStanding = predictions?.teams?.home?.standing || null;
        const awayStanding = predictions?.teams?.away?.standing || null;

        function renderFormBadges(formGuide) {
            if (!formGuide || !formGuide.length) return '<span style="color:var(--text-muted); font-size:12px;">No recent matches</span>';
            return formGuide.slice(0, 6).map(res => {
                const letter = String(res).toUpperCase();
                const bg = letter === 'W' ? '#10b981' : letter === 'D' ? '#6b7280' : '#ef4444';
                return `<span style="display:inline-flex; align-items:center; justify-content:center; width:22px; height:22px; border-radius:4px; background:${bg}; color:#ffffff; font-weight:700; font-size:11px; margin-right:4px;">${letter}</span>`;
            }).join('');
        }

        function renderRecentMatchesList(recentMatches) {
            if (!recentMatches || !recentMatches.length) return '<div style="color:var(--text-muted); font-size:12px; font-style:italic; padding:6px 0;">No recorded recent matches</div>';
            return `<div style="display:flex; flex-direction:column; gap:6px;">` +
                recentMatches.slice(0, 5).map(m => {
                    const resColor = m.result === 'W' ? '#10b981' : m.result === 'D' ? '#9ca3af' : '#ef4444';
                    const resBg = m.result === 'W' ? 'rgba(16,185,129,0.12)' : m.result === 'D' ? 'rgba(156,163,175,0.12)' : 'rgba(239,68,68,0.12)';
                    const venueLabel = m.venue === 'Away' || m.atVs === '@' ? '@' : 'vs';
                    const dateFormatted = m.date ? formatDate(m.date, { year: false, weekday: false }) : '';
                    return `<div style="display:flex; justify-content:space-between; align-items:center; padding:6px 10px; background:var(--bg-surface-elevated); border:1px solid var(--border-subtle); border-radius:6px; font-size:12px;">
                        <div style="display:flex; align-items:center; gap:6px; overflow:hidden;">
                            ${dateFormatted ? `<span style="font-size:10.5px; color:var(--text-muted); min-width:44px;">${dateFormatted}</span>` : ''}
                            <span style="font-size:11px; color:var(--text-muted); font-weight:700; min-width:16px;">${venueLabel}</span>
                            <span style="font-weight:600; color:var(--text-main); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(m.opponent || '')}">${escapeHtml(m.opponent || 'Opponent')}</span>
                        </div>
                        <div style="display:flex; align-items:center; gap:8px; margin-left:8px;">
                            <span style="font-weight:700; font-size:12px; color:var(--text-main);">${escapeHtml(m.score || '')}</span>
                            <span style="display:inline-flex; align-items:center; justify-content:center; width:20px; height:20px; border-radius:4px; background:${resBg}; color:${resColor}; font-weight:700; font-size:11px; border:1px solid ${resColor}33;">${escapeHtml(m.result || 'D')}</span>
                        </div>
                    </div>`;
                }).join('') + `</div>`;
        }

        // Calculate WDW records for both teams in their head-to-head encounters
        let calculatedHomeWins = 0;
        let calculatedAwayWins = 0;
        let calculatedDraws = 0;
        let homeH2hForm = [];
        let awayH2hForm = [];

        if (recentH2h.length) {
            const hClean = cleanTeamNameForDedup(home.team?.displayName || home.team?.name || '');
            const aClean = cleanTeamNameForDedup(away.team?.displayName || away.team?.name || '');

            for (const meeting of recentH2h) {
                const pastHClean = cleanTeamNameForDedup(meeting.homeTeam || '');
                const pastAClean = cleanTeamNameForDedup(meeting.awayTeam || '');
                const scoreParts = String(meeting.score || '').split('-').map(s => parseInt(s.trim(), 10));
                const s1 = isNaN(scoreParts[0]) ? 0 : scoreParts[0];
                const s2 = isNaN(scoreParts[1]) ? 0 : scoreParts[1];

                let isHomeSideH = true;
                if (pastAClean === hClean || (pastAClean && hClean && (pastAClean.includes(hClean) || hClean.includes(pastAClean)) && !pastHClean.includes(hClean))) {
                    isHomeSideH = false;
                } else if (pastHClean === hClean || (pastHClean && hClean && (pastHClean.includes(hClean) || hClean.includes(pastHClean)))) {
                    isHomeSideH = true;
                } else if (meeting.isHomeOriginal !== undefined) {
                    isHomeSideH = Boolean(meeting.isHomeOriginal);
                }

                const teamHomeGoals = isHomeSideH ? s1 : s2;
                const teamAwayGoals = isHomeSideH ? s2 : s1;

                if (teamHomeGoals > teamAwayGoals) {
                    calculatedHomeWins++;
                    homeH2hForm.push('W');
                    awayH2hForm.push('L');
                } else if (teamAwayGoals > teamHomeGoals) {
                    calculatedAwayWins++;
                    homeH2hForm.push('L');
                    awayH2hForm.push('W');
                } else {
                    calculatedDraws++;
                    homeH2hForm.push('D');
                    awayH2hForm.push('D');
                }
            }
        } else {
            calculatedHomeWins = Number(h2h.homeWins) || 0;
            calculatedAwayWins = Number(h2h.awayWins) || 0;
            calculatedDraws = Number(h2h.draws) || 0;
            homeH2hForm = Array.isArray(h2h.h2hFormHome) ? [...h2h.h2hFormHome] : [];
            awayH2hForm = Array.isArray(h2h.h2hFormAway) ? [...h2h.h2hFormAway] : [];
        }

        const totalLifetimeMeetings = Math.max(
            Number(h2h.totalMeetings || 0),
            recentH2h.length,
            (calculatedHomeWins || 0) + (calculatedAwayWins || 0) + (calculatedDraws || 0)
        );
        const hasPastMeetings = totalLifetimeMeetings > 0;

        const h2hMeetingsRows = recentH2h.length ? recentH2h.slice(0, 5).map(m => `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 12px; background:var(--bg-canvas); border:1px solid var(--border-subtle); border-radius:6px; margin-bottom:8px; font-size:12.5px;">
                <span style="color:var(--text-muted); font-size:11.5px; width:75px;">${formatDate(m.date, { year: false, weekday: false })}</span>
                <span style="flex:1; text-align:right; font-weight:600; padding-right:10px;">${escapeHtml(m.homeTeam)}</span>
                <span style="background:var(--bg-surface-elevated); border:1px solid var(--border-subtle); padding:2px 8px; border-radius:4px; font-weight:700; font-size:12px;">${escapeHtml(m.score)}</span>
                <span style="flex:1; text-align:left; font-weight:600; padding-left:10px;">${escapeHtml(m.awayTeam)}</span>
            </div>
        `).join('') : '';

        const rosters = summary.rosters || [];
        const homeRoster = rosters.find(r => String(r.team?.id) === String(home.team?.id) || r.team?.side === 'home' || r.team?.homeAway === 'home') || rosters[0];
        const awayRoster = rosters.find(r => String(r.team?.id) === String(away.team?.id) || r.team?.side === 'away' || r.team?.homeAway === 'away') || rosters[1];

        function renderTacticalPitchHtml(teamRoster, teamName, isHome = true) {
            if (!teamRoster?.roster?.length) return '';
            const allPlayers = teamRoster.roster;
            const starters = allPlayers.filter(p => p.starter);
            const squad = starters.length >= 11 ? starters.slice(0, 11) : allPlayers.slice(0, 11);
            if (squad.length < 7) return '';

            const gk = [];
            const def = [];
            const mid = [];
            const fwd = [];

            squad.forEach(p => {
                const pos = String(p.position?.abbreviation || p.athlete?.position?.abbreviation || p.position?.name || '').toUpperCase();
                if (pos.startsWith('G')) gk.push(p);
                else if (pos.startsWith('D') || pos.includes('CB') || pos.includes('LB') || pos.includes('RB')) def.push(p);
                else if (pos.startsWith('M') || pos.includes('CM') || pos.includes('DM') || pos.includes('AM')) mid.push(p);
                else if (pos.startsWith('F') || pos.startsWith('A') || pos.includes('ST') || pos.includes('LW') || pos.includes('RW')) fwd.push(p);
                else {
                    if (gk.length === 0) gk.push(p);
                    else if (def.length < 4) def.push(p);
                    else if (mid.length < 3) mid.push(p);
                    else fwd.push(p);
                }
            });

            if (gk.length === 0 && squad.length) gk.push(squad[0]);

            const formationStr = `${def.length}-${mid.length}-${fwd.length}`;
            const themeColor = isHome ? '#10b981' : '#3b82f6';

            function renderLinePlayers(players) {
                return players.map(p => {
                    const name = p.athlete?.displayName || p.athlete?.fullName || p.name || 'Player';
                    const parts = name.trim().split(' ');
                    const shortName = parts.length > 1 ? parts[parts.length - 1] : name;
                    const jersey = p.jersey || p.shirtNumber || '•';
                    return `
                        <div class="pitch-player-node" style="display:flex; flex-direction:column; align-items:center; text-align:center; max-width:68px; z-index:2;">
                            <div style="width:28px; height:28px; border-radius:50%; background:${themeColor}; color:#ffffff; font-weight:800; font-size:12px; display:flex; align-items:center; justify-content:center; box-shadow:0 3px 6px rgba(0,0,0,0.4); border:2px solid #ffffff;">
                                ${escapeHtml(jersey)}
                            </div>
                            <span style="font-size:10px; font-weight:700; color:#ffffff; text-shadow:0 1px 4px rgba(0,0,0,0.9); margin-top:3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:64px;">
                                ${escapeHtml(shortName)}
                            </span>
                        </div>
                    `;
                }).join('');
            }

            return `
                <div class="tactical-pitch-card" style="margin-bottom:20px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; flex-wrap:wrap; gap:6px;">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span style="font-size:16px;">📋</span>
                            <strong style="font-size:13px; color:var(--text-main);">${escapeHtml(teamName)} Formation</strong>
                        </div>
                        <span style="font-size:11.5px; font-weight:700; color:${themeColor}; background:var(--bg-canvas); border:1px solid var(--border-subtle); padding:2px 8px; border-radius:6px;">Starting XI (${formationStr})</span>
                    </div>

                    <div class="tactical-pitch-canvas" style="position:relative; width:100%; max-width:500px; margin:0 auto; aspect-ratio:1.45/1; background:radial-gradient(ellipse at center, #184a3b 0%, #0d281e 100%); border:2px solid rgba(255,255,255,0.22); border-radius:12px; overflow:hidden; box-shadow:0 6px 20px rgba(0,0,0,0.35); padding:14px 10px; display:flex; flex-direction:column; justify-content:space-between;">
                        <svg style="position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none;" viewBox="0 0 400 280" preserveAspectRatio="none">
                            <rect x="8" y="8" width="384" height="264" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="1.5" />
                            <line x1="8" y1="140" x2="392" y2="140" stroke="rgba(255,255,255,0.18)" stroke-width="1.5" />
                            <circle cx="200" cy="140" r="38" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="1.5" />
                            <circle cx="200" cy="140" r="2.5" fill="rgba(255,255,255,0.3)" />
                            <rect x="130" y="8" width="140" height="46" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="1.5" />
                            <rect x="160" y="8" width="80" height="18" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="1.2" />
                            <rect x="130" y="226" width="140" height="46" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="1.5" />
                            <rect x="160" y="254" width="80" height="18" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="1.2" />
                        </svg>

                        <!-- Attackers Line -->
                        <div style="display:flex; justify-content:space-around; align-items:center; z-index:2;">
                            ${renderLinePlayers(fwd.length ? fwd : squad.slice(8, 11))}
                        </div>

                        <!-- Midfielders Line -->
                        <div style="display:flex; justify-content:space-around; align-items:center; z-index:2;">
                            ${renderLinePlayers(mid.length ? mid : squad.slice(5, 8))}
                        </div>

                        <!-- Defenders Line -->
                        <div style="display:flex; justify-content:space-around; align-items:center; z-index:2;">
                            ${renderLinePlayers(def.length ? def : squad.slice(1, 5))}
                        </div>

                        <!-- Goalkeeper Line -->
                        <div style="display:flex; justify-content:center; align-items:center; z-index:2;">
                            ${renderLinePlayers(gk)}
                        </div>
                    </div>
                </div>
            `;
        }

        function renderRosterList(teamRoster, teamName) {
            if (!teamRoster?.roster?.length) return `<p style="color:var(--text-muted); font-size:13px;">No official lineup announced yet for ${escapeHtml(teamName)}.</p>`;
            const starters = teamRoster.roster.filter(p => p.starter);
            const bench = teamRoster.roster.filter(p => !p.starter);

            return `
                <div class="lineup-col" style="flex:1; min-width:240px;">
                    <div style="font-weight:700; font-size:14px; margin-bottom:10px; color:var(--text-main);">${escapeHtml(teamName)}</div>
                    <div style="font-size:11px; text-transform:uppercase; color:var(--text-muted); font-weight:700; margin-bottom:6px;">Starting XI</div>
                    <div class="roster-list" style="margin-bottom:16px;">
                        ${(starters.length ? starters : teamRoster.roster.slice(0, 11)).map(p => `
                            <div style="display:flex; justify-content:space-between; padding:5px 0; border-bottom:1px solid var(--border-subtle); font-size:12.5px;">
                                <span><strong style="color:var(--color-primary); margin-right:6px;">${escapeHtml(p.jersey || '—')}</strong> ${escapeHtml(p.athlete?.displayName || p.athlete?.fullName || 'Player')}</span>
                                <span style="color:var(--text-muted); font-size:11px;">${escapeHtml(p.position?.abbreviation || p.athlete?.position?.abbreviation || '')}</span>
                            </div>
                        `).join('')}
                    </div>
                    ${bench.length ? `
                        <div style="font-size:11px; text-transform:uppercase; color:var(--text-muted); font-weight:700; margin-bottom:6px;">Substitutes / Bench</div>
                        <div class="roster-list">
                            ${bench.map(p => `
                                <div style="display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px solid var(--border-subtle); font-size:12px; color:var(--text-muted);">
                                    <span><span style="margin-right:6px;">${escapeHtml(p.jersey || '—')}</span> ${escapeHtml(p.athlete?.displayName || p.athlete?.fullName || 'Player')}</span>
                                    <span style="font-size:11px;">${escapeHtml(p.position?.abbreviation || '')}</span>
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}
                </div>
            `;
        }

        if (elements['dialog-content']) {
            const prevScrollTop = elements['dialog-content'].scrollTop;
            const existingTabs = elements['dialog-content'].querySelector('.drawer-tabs');
            const prevTabsScrollLeft = existingTabs ? existingTabs.scrollLeft : 0;
            const activeTab = state.drawerActiveTab || 'timeline';

            const getStatVal = (list, name) => {
                const item = list.find(s => s.name === name);
                return Number(String(item?.displayValue || item?.value || 0).replace('%', '')) || 0;
            };
            const hPoss = getStatVal(homeStats, 'possessionPct') || 50;
            const aPoss = getStatVal(awayStats, 'possessionPct') || (100 - hPoss);
            const hShotsOn = getStatVal(homeStats, 'shotsOnTarget');
            const aShotsOn = getStatVal(awayStats, 'shotsOnTarget');
            const hShots = getStatVal(homeStats, 'totalShots') || (hShotsOn + getStatVal(homeStats, 'shotsOffTarget'));
            const aShots = getStatVal(awayStats, 'totalShots') || (aShotsOn + getStatVal(awayStats, 'shotsOffTarget'));
            const hCorners = getStatVal(homeStats, 'wonCorners');
            const aCorners = getStatVal(awayStats, 'wonCorners');

            const hWeight = (hPoss * 0.35) + (hShotsOn * 5) + (hShots * 2) + (hCorners * 2.5);
            const aWeight = (aPoss * 0.35) + (aShotsOn * 5) + (aShots * 2) + (aCorners * 2.5);
            const totalWeight = (hWeight + aWeight) || 1;
            const hMomentum = Math.min(92, Math.max(8, Math.round((hWeight / totalWeight) * 100)));
            const aMomentum = 100 - hMomentum;

            let momentumVerdict = '⚖️ Evenly Contested Attacking Momentum';
            if (hMomentum >= 65) momentumVerdict = `🔥 ${escapeHtml(home.team?.displayName || 'Home')} Dominating Attacking Pressure (+${hMomentum - 50}%)`;
            else if (aMomentum >= 65) momentumVerdict = `⚡ ${escapeHtml(away.team?.displayName || 'Away')} Dominating Attacking Pressure (+${aMomentum - 50}%)`;
            else if (hMomentum >= 54) momentumVerdict = `📈 ${escapeHtml(home.team?.displayName || 'Home')} Has the Attacking Edge`;
            else if (aMomentum >= 54) momentumVerdict = `📈 ${escapeHtml(away.team?.displayName || 'Away')} Has the Attacking Edge`;

            elements['dialog-content'].innerHTML = `
                <section class="drawer-header-card">
                    <div class="team-vs-team-row">
                        <div class="team-side">
                            ${teamLogo(home.team, 'team-crest')}
                            <span class="team-name" style="font-size:15px;">${escapeHtml(home.team?.displayName || 'Home')}</span>
                        </div>
                        <div class="score-center-col">
                            <div class="score-digits" style="font-size:32px;">${escapeHtml(home.score ?? '—')} - ${escapeHtml(away.score ?? '—')}</div>
                            <div class="minute-pill ${status.pillClass}" style="margin-top:6px;">${escapeHtml(formatMatchClock(competition.status, competition.status?.type) || status.label)}</div>
                        </div>
                        <div class="team-side">
                            ${teamLogo(away.team, 'team-crest')}
                            <span class="team-name" style="font-size:15px;">${escapeHtml(away.team?.displayName || 'Away')}</span>
                        </div>
                    </div>
                    <div style="margin-top:14px; font-size:12px; color:var(--text-muted);">
                        ${venue?.fullName ? `Stadium: ${escapeHtml(venue.fullName)} · ` : ''}
                        ${venue?.address?.city ? `${escapeHtml(venue.address.city)}` : ''}
                    </div>
                </section>

                <div class="drawer-tabs">
                    <button class="drawer-tab ${activeTab === 'timeline' ? 'active' : ''}" data-drawer-tab="timeline" type="button">Timeline &amp; Events</button>
                    <button class="drawer-tab ${activeTab === 'stats' ? 'active' : ''}" data-drawer-tab="stats" type="button">Match Stats</button>
                    <button class="drawer-tab ${activeTab === 'h2h' ? 'active' : ''}" data-drawer-tab="h2h" type="button">Head-to-Head</button>
                    <button class="drawer-tab ${activeTab === 'lineups' ? 'active' : ''}" data-drawer-tab="lineups" type="button">Lineups &amp; Rosters</button>
                    <button class="drawer-tab ${activeTab === 'info' ? 'active' : ''}" data-drawer-tab="info" type="button">Match Info</button>
                    <button class="drawer-tab ${activeTab === 'predictions' ? 'active' : ''}" data-drawer-tab="predictions" type="button" style="color:var(--color-primary); font-weight:700;">🔮 AI Predictions</button>
                </div>

                <div id="drawer-tab-timeline" class="drawer-tab-content" ${activeTab === 'timeline' ? '' : 'hidden'}>
                    <h4 style="margin:0 0 12px; font-size:14px; color:var(--text-main); display:flex; justify-content:space-between; align-items:center;">
                        <span>Match Timeline</span>
                        <span style="font-size:11.5px; color:var(--text-muted); font-weight:normal;">${events.length} events</span>
                    </h4>
                    <div>${timelineRows || (scorers.length ? scorers.map(goal => {
                        const athleteName = goal.athlete?.displayName || goal.athlete?.fullName || goal.text || 'Goal';
                        const teamName = goal.team?.displayName || goal.team?.name || '';
                        return `<div class="timeline-row goal-event" style="display:flex; gap:12px; padding:10px 0; border-bottom:1px solid var(--border-subtle);">
                            <span style="min-width:42px; font-weight:700; color:var(--color-primary);">${escapeHtml(goal.clock || '—')}</span>
                            <span>⚽ <strong>${escapeHtml(athleteName)}</strong>${teamName ? ` <span style="color:var(--text-muted);">(${escapeHtml(teamName)})</span>` : ''}</span>
                        </div>`;
                    }).join('') : '<p style="color:var(--text-muted); font-size:13px;">No play-by-play events recorded yet.</p>')}</div>
                </div>

                <div id="drawer-tab-stats" class="drawer-tab-content" ${activeTab === 'stats' ? '' : 'hidden'}>
                    ${(!hasStats || isPreMatch) ? `
                        <div style="text-align:center; padding:36px 18px; background:var(--bg-canvas); border:1px solid var(--border-subtle); border-radius:10px;">
                            <span class="empty-icon" style="font-size:36px; display:block; margin-bottom:12px;">${isPreMatch ? '⏳' : '📊'}</span>
                            <h4 style="margin:0 0 8px; font-size:15px; font-weight:700; color:var(--text-main);">${isPreMatch ? 'Match Has Not Started' : 'Match Statistics Pending'}</h4>
                            <p style="margin:0 0 8px; font-size:13px; color:var(--text-muted);">${isPreMatch ? `Kickoff scheduled for <strong>${formatTime(competition.date)}</strong> (${formatDate(competition.date, { year: false })}).` : 'Official match statistics (possession %, shots, corners, cards) have not been recorded yet.'}</p>
                            <small style="color:var(--text-muted); display:block; max-width:420px; margin:0 auto; line-height:1.5;">${isPreMatch ? 'Live in-play figures activate once the match kicks off.' : 'Live telemetry displays once official match statistics are reported.'}</small>
                        </div>
                    ` : `
                        <!-- Attacking Momentum & Pressure Gauge -->
                        <div class="momentum-gauge-card" style="background:var(--bg-canvas); border:1px solid var(--border-subtle); border-radius:10px; padding:16px; margin-bottom:20px;">
                            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px; margin-bottom:10px;">
                                <div style="display:flex; align-items:center; gap:6px;">
                                    <span style="font-size:16px;">⚡</span>
                                    <strong style="font-size:12.5px; text-transform:uppercase; color:var(--text-main); letter-spacing:0.5px;">Live Match Momentum &amp; Attacking Pressure</strong>
                                </div>
                                <span style="font-size:11.5px; font-weight:700; color:var(--color-primary);">${momentumVerdict}</span>
                            </div>
                            <div style="display:flex; justify-content:space-between; font-size:13px; font-weight:700; margin-bottom:8px;">
                                <span style="color:#10b981;">${escapeHtml(home.team?.displayName || 'Home')} (${hMomentum}%)</span>
                                <span style="color:#3b82f6;">(${aMomentum}%) ${escapeHtml(away.team?.displayName || 'Away')}</span>
                            </div>
                            <div style="height:12px; background:var(--bg-surface-elevated); border-radius:6px; overflow:hidden; display:flex; box-shadow:inset 0 1px 3px rgba(0,0,0,0.2);">
                                <div style="width:${hMomentum}%; background:linear-gradient(90deg, #10b981, #059669); transition:width 0.4s ease;"></div>
                                <div style="width:${aMomentum}%; background:linear-gradient(90deg, #2563eb, #3b82f6); transition:width 0.4s ease;"></div>
                            </div>
                            <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--text-muted); margin-top:6px;">
                                <span>Possession: ${hPoss}% &bull; Shots: ${hShots} &bull; Corners: ${hCorners}</span>
                                <span>Corners: ${aCorners} &bull; Shots: ${aShots} &bull; Possession: ${aPoss}%</span>
                            </div>
                        </div>

                        <h4 style="margin:0 0 14px; font-size:14px; color:var(--text-main); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                            <span>In-Play Match Statistics (${escapeHtml(home.team?.displayName || 'Home')} vs ${escapeHtml(away.team?.displayName || 'Away')})</span>
                            ${summary.boxscore?.isDerivedTelemetry ? `<span style="font-size:10.5px; font-weight:700; color:var(--color-primary); background:var(--color-primary-subtle); padding:2px 8px; border-radius:12px;">⚡ Live Analytics Telemetry</span>` : ''}
                        </h4>
                        <div>${statRows || `
                            <div style="text-align:center; padding:24px 16px; background:var(--bg-canvas); border:1px solid var(--border-subtle); border-radius:8px;">
                                <span class="empty-icon" style="font-size:24px;">📊</span>
                                <p style="margin:8px 0 4px; font-weight:600; color:var(--text-main);">No in-play statistics available.</p>
                                <small style="color:var(--text-muted);">Match statistics (possession %, shots, corners, fouls, cards) activate during live play or after match conclusion.</small>
                            </div>
                        `}</div>
                    `}
                </div>

                <div id="drawer-tab-h2h" class="drawer-tab-content" ${activeTab === 'h2h' ? '' : 'hidden'}>
                    <h4 style="margin:0 0 14px; font-size:14px; color:var(--text-main);">Head-to-Head Past Encounters</h4>
                    ${h2h.seriesSummary || h2h.seriesScore ? `
                        <div style="background:var(--color-primary-subtle); border:1px solid var(--border-subtle); border-radius:8px; padding:10px 14px; font-size:13px; font-weight:600; color:var(--color-primary); margin-bottom:16px; text-align:center;">
                            🏆 ${escapeHtml(h2h.seriesSummary || ('Historical Series: ' + h2h.seriesScore))}
                        </div>
                    ` : ''}

                    ${hasPastMeetings ? `
                        <!-- Head-to-Head Record -->
                        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:10px; margin-bottom:14px;">
                            <div style="background:var(--bg-canvas); border:1px solid var(--border-subtle); border-radius:8px; padding:12px; text-align:center;">
                                <span style="font-size:11px; text-transform:uppercase; color:var(--text-muted); display:block;">${totalLifetimeMeetings > 5 ? 'Lifetime Encounters' : 'Recorded Meetings'}</span>
                                <strong style="font-size:22px; color:var(--text-main);">${totalLifetimeMeetings}</strong>
                                <div style="font-size:10.5px; color:var(--text-muted); margin-top:4px;">Total Clashes</div>
                            </div>
                            <div style="background:var(--bg-canvas); border:1px solid var(--border-subtle); border-radius:8px; padding:12px; text-align:center;">
                                <span style="font-size:11px; text-transform:uppercase; color:var(--text-muted); display:block;">${escapeHtml(home.team?.displayName || 'Home')} Wins</span>
                                <strong style="font-size:22px; color:#10b981;">${calculatedHomeWins || 0}</strong>
                                ${homeH2hForm.length ? `<div style="display:flex; justify-content:center; gap:3px; margin-top:6px;">${homeH2hForm.slice(0, 5).map(res => `<span style="display:inline-flex; align-items:center; justify-content:center; width:16px; height:16px; border-radius:3px; background:${res === 'W' ? '#10b981' : res === 'D' ? '#6b7280' : '#ef4444'}; color:#ffffff; font-weight:700; font-size:9.5px;">${res}</span>`).join('')}</div>` : ''}
                            </div>
                            <div style="background:var(--bg-canvas); border:1px solid var(--border-subtle); border-radius:8px; padding:12px; text-align:center;">
                                <span style="font-size:11px; text-transform:uppercase; color:var(--text-muted); display:block;">${totalLifetimeMeetings > 5 ? 'All-Time Draws' : 'Recorded Draws'}</span>
                                <strong style="font-size:22px; color:var(--text-muted);">${calculatedDraws || 0}</strong>
                                ${calculatedDraws > 0 ? `<div style="display:flex; justify-content:center; gap:3px; margin-top:6px;">${Array(Math.min(5, calculatedDraws)).fill('D').map(() => `<span style="display:inline-flex; align-items:center; justify-content:center; width:16px; height:16px; border-radius:3px; background:#6b7280; color:#ffffff; font-weight:700; font-size:9.5px;">D</span>`).join('')}</div>` : ''}
                            </div>
                            <div style="background:var(--bg-canvas); border:1px solid var(--border-subtle); border-radius:8px; padding:12px; text-align:center;">
                                <span style="font-size:11px; text-transform:uppercase; color:var(--text-muted); display:block;">${escapeHtml(away.team?.displayName || 'Away')} Wins</span>
                                <strong style="font-size:22px; color:#3b82f6;">${calculatedAwayWins || 0}</strong>
                                ${awayH2hForm.length ? `<div style="display:flex; justify-content:center; gap:3px; margin-top:6px;">${awayH2hForm.slice(0, 5).map(res => `<span style="display:inline-flex; align-items:center; justify-content:center; width:16px; height:16px; border-radius:3px; background:${res === 'W' ? '#10b981' : res === 'D' ? '#6b7280' : '#ef4444'}; color:#ffffff; font-weight:700; font-size:9.5px;">${res}</span>`).join('')}</div>` : ''}
                            </div>
                        </div>

                        <!-- Ratio Bar & Quick Rates -->
                        <div style="background:var(--bg-canvas); border:1px solid var(--border-subtle); border-radius:8px; padding:12px 14px; margin-bottom:20px;">
                            <div style="display:flex; justify-content:space-between; font-size:11.5px; color:var(--text-muted); margin-bottom:6px; font-weight:600;">
                                <span style="color:#10b981;">${escapeHtml(home.team?.abbreviation || home.team?.displayName || 'Home')} ${totalLifetimeMeetings > 0 ? Math.round(((calculatedHomeWins || 0) / totalLifetimeMeetings) * 100) : 0}%</span>
                                <span>Draws ${totalLifetimeMeetings > 0 ? Math.round(((calculatedDraws || 0) / totalLifetimeMeetings) * 100) : 0}%</span>
                                <span style="color:#3b82f6;">${escapeHtml(away.team?.abbreviation || away.team?.displayName || 'Away')} ${totalLifetimeMeetings > 0 ? Math.round(((calculatedAwayWins || 0) / totalLifetimeMeetings) * 100) : 0}%</span>
                            </div>
                            <div style="display:flex; height:8px; border-radius:4px; overflow:hidden; background:var(--bg-surface-elevated);">
                                <div style="width:${totalLifetimeMeetings > 0 ? ((calculatedHomeWins || 0) / totalLifetimeMeetings) * 100 : 0}%; background:#10b981;"></div>
                                <div style="width:${totalLifetimeMeetings > 0 ? ((calculatedDraws || 0) / totalLifetimeMeetings) * 100 : 0}%; background:#9ca3af;"></div>
                                <div style="width:${totalLifetimeMeetings > 0 ? ((calculatedAwayWins || 0) / totalLifetimeMeetings) * 100 : 0}%; background:#3b82f6;"></div>
                            </div>
                            <div style="display:flex; justify-content:space-around; margin-top:10px; padding-top:8px; border-top:1px dashed var(--border-subtle); font-size:11.5px; color:var(--text-muted);">
                                <span>Avg Goals: <strong style="color:var(--text-main);">${h2h.averageGoalsPerMatch || '—'}</strong></span>
                                <span>BTTS: <strong style="color:var(--text-main);">${h2h.bttsPercentage || 0}%</strong></span>
                                <span>Over 2.5: <strong style="color:var(--text-main);">${h2h.over25Percentage || 0}%</strong></span>
                            </div>
                        </div>

                        <!-- Recent Encounters (Head-to-Head) -->
                        <h5 style="margin:20px 0 10px; font-size:13px; color:var(--text-main); display:flex; justify-content:space-between; align-items:center;">
                            <span>Recent Encounters (Last ${recentH2h.length} Head-to-Head)</span>
                            <span style="font-size:11.5px; color:var(--text-muted); font-weight:normal;">Showing ${recentH2h.length} of ${totalLifetimeMeetings} recorded encounters</span>
                        </h5>
                        <div style="margin-bottom:24px;">${h2hMeetingsRows}</div>

                        <!-- Team Form & Last 5 Matches (Both Clubs) -->
                        <h5 style="margin:20px 0 10px; font-size:13px; color:var(--text-main);">Current Form &amp; Last 5 Played Matches</h5>
                        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:12px; margin-bottom:20px;">
                            <div style="background:var(--bg-canvas); border:1px solid var(--border-subtle); border-radius:8px; padding:12px 14px;">
                                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
                                    <strong style="font-size:13px; color:var(--text-main);">${escapeHtml(home.team?.displayName || 'Home')} Form</strong>
                                    <span style="font-size:11px; color:#10b981; font-weight:600;">${homeAnalytics.winRate ?? 0}% Win Rate</span>
                                </div>
                                <div>${renderFormBadges(homeAnalytics.formGuide)}</div>
                                <div style="font-size:12px; color:var(--text-muted); margin:8px 0 10px;">Avg Scored: <strong style="color:var(--text-main);">${homeAnalytics.goalsScoredAvg ?? '—'}</strong> &bull; Conceded: <strong style="color:var(--text-main);">${homeAnalytics.goalsConcededAvg ?? '—'}</strong></div>
                                ${renderRecentMatchesList(homeAnalytics.recentMatches)}
                            </div>
                            <div style="background:var(--bg-canvas); border:1px solid var(--border-subtle); border-radius:8px; padding:12px 14px;">
                                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
                                    <strong style="font-size:13px; color:var(--text-main);">${escapeHtml(away.team?.displayName || 'Away')} Form</strong>
                                    <span style="font-size:11px; color:#3b82f6; font-weight:600;">${awayAnalytics.winRate ?? 0}% Win Rate</span>
                                </div>
                                <div>${renderFormBadges(awayAnalytics.formGuide)}</div>
                                <div style="font-size:12px; color:var(--text-muted); margin:8px 0 10px;">Avg Scored: <strong style="color:var(--text-main);">${awayAnalytics.goalsScoredAvg ?? '—'}</strong> &bull; Conceded: <strong style="color:var(--text-main);">${awayAnalytics.goalsConcededAvg ?? '—'}</strong></div>
                                ${renderRecentMatchesList(awayAnalytics.recentMatches)}
                            </div>
                        </div>
                    ` : `
                        <!-- First Recorded Meeting Fallback: Render each team's last 5 played games -->
                        <div style="background:var(--bg-canvas); border:1px dashed var(--border-subtle); border-radius:10px; padding:18px 16px; text-align:center; margin-bottom:20px;">
                            <div style="font-size:24px; margin-bottom:4px;">⚔️</div>
                            <div style="font-size:14.5px; font-weight:700; color:var(--text-main); margin-bottom:4px;">First Recorded Encounter</div>
                            <p style="font-size:12.5px; color:var(--text-muted); margin:0 auto; max-width:480px;">These clubs have never met before in recorded official competitions. Showing each team's last 5 played matches below to compare current form.</p>
                        </div>

                        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:12px; margin-bottom:20px;">
                            <div style="background:var(--bg-canvas); border:1px solid var(--border-subtle); border-radius:8px; padding:14px;">
                                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;">
                                    <div style="display:flex; align-items:center; gap:8px;">
                                        ${home.team?.logo ? `<img src="${home.team.logo}" alt="" style="width:20px; height:20px; object-fit:contain;">` : ''}
                                        <strong style="font-size:13.5px; color:var(--text-main);">${escapeHtml(home.team?.displayName || 'Home Team')}</strong>
                                    </div>
                                    <span style="font-size:11px; color:#10b981; font-weight:600;">${homeAnalytics.winRate ?? 0}% Win Rate</span>
                                </div>
                                <div style="margin-bottom:8px;">${renderFormBadges(homeAnalytics.formGuide)}</div>
                                <div style="font-size:12px; color:var(--text-muted); margin-bottom:12px;">Avg Scored: <strong style="color:var(--text-main);">${homeAnalytics.goalsScoredAvg ?? '—'}</strong> &bull; Conceded: <strong style="color:var(--text-main);">${homeAnalytics.goalsConcededAvg ?? '—'}</strong></div>
                                <div style="font-weight:600; font-size:11.5px; color:var(--text-muted); text-transform:uppercase; margin-bottom:8px;">Last 5 Matches</div>
                                ${renderRecentMatchesList(homeAnalytics.recentMatches)}
                            </div>

                            <div style="background:var(--bg-canvas); border:1px solid var(--border-subtle); border-radius:8px; padding:14px;">
                                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;">
                                    <div style="display:flex; align-items:center; gap:8px;">
                                        ${away.team?.logo ? `<img src="${away.team.logo}" alt="" style="width:20px; height:20px; object-fit:contain;">` : ''}
                                        <strong style="font-size:13.5px; color:var(--text-main);">${escapeHtml(away.team?.displayName || 'Away Team')}</strong>
                                    </div>
                                    <span style="font-size:11px; color:#3b82f6; font-weight:600;">${awayAnalytics.winRate ?? 0}% Win Rate</span>
                                </div>
                                <div style="margin-bottom:8px;">${renderFormBadges(awayAnalytics.formGuide)}</div>
                                <div style="font-size:12px; color:var(--text-muted); margin-bottom:12px;">Avg Scored: <strong style="color:var(--text-main);">${awayAnalytics.goalsScoredAvg ?? '—'}</strong> &bull; Conceded: <strong style="color:var(--text-main);">${awayAnalytics.goalsConcededAvg ?? '—'}</strong></div>
                                <div style="font-weight:600; font-size:11.5px; color:var(--text-muted); text-transform:uppercase; margin-bottom:8px;">Last 5 Matches</div>
                                ${renderRecentMatchesList(awayAnalytics.recentMatches)}
                            </div>
                        </div>
                    `}
                </div>

                <div id="drawer-tab-lineups" class="drawer-tab-content" ${activeTab === 'lineups' ? '' : 'hidden'}>
                    <h4 style="margin:0 0 14px; font-size:14px; color:var(--text-main);">Official Team Lineups &amp; Tactical Formations</h4>
                    ${renderTacticalPitchHtml(homeRoster, home.team?.displayName || 'Home Team', true) || ''}
                    ${renderTacticalPitchHtml(awayRoster, away.team?.displayName || 'Away Team', false) || ''}
                    <div style="display:flex; gap:20px; flex-wrap:wrap; margin-bottom:24px;">
                        ${renderRosterList(homeRoster, home.team?.displayName || 'Home Team')}
                        ${renderRosterList(awayRoster, away.team?.displayName || 'Away Team')}
                    </div>

                    ${substitutionRows ? `
                        <h4 style="margin:20px 0 12px; font-size:14px; color:var(--text-main);">In-Match Substitutions</h4>
                        <div>${substitutionRows}</div>
                    ` : ''}
                </div>

                <div id="drawer-tab-info" class="drawer-tab-content" ${activeTab === 'info' ? '' : 'hidden'}>
                    <h4 style="margin:0 0 12px; font-size:14px; color:var(--text-main);">Match Information</h4>
                    <div style="background:var(--bg-canvas); border:1px solid var(--border-subtle); border-radius:8px; padding:16px; font-size:13px;">
                        <p style="margin:6px 0;"><strong>Competition:</strong> ${escapeHtml(competition.league?.name || state.league?.name || 'Football Competition')}</p>
                        <p style="margin:6px 0;"><strong>Date &amp; Time:</strong> ${formatDate(competition.date, { year: true })} at ${formatTime(competition.date)}</p>
                        <p style="margin:6px 0;"><strong>Venue / Stadium:</strong> ${escapeHtml(venue?.fullName || 'Stadium Venue')}${venue?.address?.city ? ` (${escapeHtml(venue.address.city)})` : ''}</p>
                        ${competition.attendance ? `<p style="margin:6px 0;"><strong>Attendance:</strong> ${Number(competition.attendance).toLocaleString()} spectators</p>` : ''}
                        ${summary.gameInfo?.officials?.length ? `<p style="margin:6px 0;"><strong>Referee:</strong> ${escapeHtml(summary.gameInfo.officials.map(o => o.displayName).join(', '))}</p>` : ''}
                    </div>

                    ${(homeStanding || awayStanding) ? `
                        <h4 style="margin:20px 0 10px; font-size:14px; color:var(--text-main);">Current Table Standing Context</h4>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                            ${homeStanding ? `
                                <div style="background:var(--bg-canvas); border:1px solid var(--border-subtle); border-radius:8px; padding:12px; font-size:12.5px;">
                                    <strong>${escapeHtml(home.team?.displayName || 'Home')}</strong>: Rank <strong>#${homeStanding.rank}</strong> &bull; Points: <strong>${homeStanding.points ?? '—'}</strong> &bull; GD: <strong>${homeStanding.goalDifferential ?? '—'}</strong>
                                </div>
                            ` : ''}
                            ${awayStanding ? `
                                <div style="background:var(--bg-canvas); border:1px solid var(--border-subtle); border-radius:8px; padding:12px; font-size:12.5px;">
                                    <strong>${escapeHtml(away.team?.displayName || 'Away')}</strong>: Rank <strong>#${awayStanding.rank}</strong> &bull; Points: <strong>${awayStanding.points ?? '—'}</strong> &bull; GD: <strong>${awayStanding.goalDifferential ?? '—'}</strong>
                                </div>
                            ` : ''}
                        </div>
                    ` : ''}
                </div>

                <div id="drawer-tab-predictions" class="drawer-tab-content" ${activeTab === 'predictions' ? '' : 'hidden'}>
                    <div class="prediction-card">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <h4 style="margin:0; font-size:14px; color:var(--text-main);">🔮 Norra AI Outcome Probability</h4>
                            <span style="font-size:11px; background:var(--color-primary-subtle); color:var(--color-primary); padding:3px 8px; border-radius:4px; font-weight:700;">LIVE MODEL</span>
                        </div>
                        <p style="color:var(--text-muted); font-size:12px; margin:6px 0 16px;">Inferred from historical H2H meetings, recent 6-game form, and standings differential.</p>

                        <div class="prediction-probs-grid">
                            <div class="prob-box">
                                <div class="prob-pct">${predHints.homeWinProb ?? 50}%</div>
                                <div class="prob-label">${escapeHtml(home.team?.displayName || 'Home')} Win</div>
                            </div>
                            <div class="prob-box">
                                <div class="prob-pct">${predHints.drawProb ?? 26}%</div>
                                <div class="prob-label">Draw</div>
                            </div>
                            <div class="prob-box">
                                <div class="prob-pct">${predHints.awayWinProb ?? 24}%</div>
                                <div class="prob-label">${escapeHtml(away.team?.displayName || 'Away')} Win</div>
                            </div>
                        </div>

                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:14px; font-size:12px;">
                            <div style="background:var(--bg-canvas); padding:10px 14px; border-radius:6px; border:1px solid var(--border-subtle);">
                                <span style="color:var(--text-muted); display:block;">Expected Total Goals</span>
                                <strong style="font-size:16px; color:var(--text-main);">${predHints.expectedGoals ?? 2.5}</strong>
                            </div>
                            <div style="background:var(--bg-canvas); padding:10px 14px; border-radius:6px; border:1px solid var(--border-subtle);">
                                <span style="color:var(--text-muted); display:block;">Both Teams To Score (BTTS)</span>
                                <strong style="font-size:16px; color:${predHints.bttsRecommendation === 'Yes' ? '#10b981' : 'var(--text-main)'};">${predHints.bttsRecommendation ?? 'Likely'}</strong>
                            </div>
                        </div>

                        <div style="text-align:center; margin-top:20px;">
                            <a href="https://mynorra.xyz" target="_blank" rel="noopener" class="btn-primary" style="display:inline-block; padding:10px 20px; text-decoration:none; border-radius:8px; font-weight:700; font-size:13px;">
                                🔮 Deep-Dive Predictions on Norra AI &rarr;
                            </a>
                            <p style="font-size:11px; color:var(--text-faint); margin:8px 0 0;">Decoupled sync powered by the Norra AI Master API key.</p>
                        </div>
                    </div>
                </div>
            `;

            // Bind drawer tabs
            elements['dialog-content'].querySelectorAll('.drawer-tab').forEach(tabBtn => {
                tabBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    const target = tabBtn.dataset.drawerTab;
                    state.drawerActiveTab = target;
                    elements['dialog-content'].querySelectorAll('.drawer-tab').forEach(b => b.classList.toggle('active', b === tabBtn));
                    elements['dialog-content'].querySelectorAll('.drawer-tab-content').forEach(c => {
                        c.hidden = c.id !== `drawer-tab-${target}`;
                    });
                });
            });

            // Restore horizontal tabs scroll position so drawer doesn't jerk back to start during live refresh
            const newTabs = elements['dialog-content'].querySelector('.drawer-tabs');
            if (newTabs && prevTabsScrollLeft > 0) {
                newTabs.scrollLeft = prevTabsScrollLeft;
            }

            if (silent && prevScrollTop > 0) {
                elements['dialog-content'].scrollTop = prevScrollTop;
            }
        }
    }

    function closeMatchDialog() {
        window.clearInterval(state.matchTimer);
        state.matchTimer = null;
        state.currentEventId = null;
        state.drawerActiveTab = 'timeline';
        document.body.classList.remove('dialog-open');
        if (elements['match-dialog']) elements['match-dialog'].close();
        window.scrollTo({ top: lastWindowScrollY, behavior: 'instant' });
    }

    function setupThemeToggle() {
        const saved = localStorage.getItem('norra_theme') || localStorage.getItem('theme') || 'dark';
        if (typeof window.applyTheme === 'function') {
            window.applyTheme(saved);
        } else {
            applyTheme(saved);
        }

        const handler = (typeof window.toggleTheme === 'function') ? window.toggleTheme : () => {
            const current = document.documentElement.getAttribute('data-theme') || 'dark';
            const next = current === 'dark' ? 'light' : 'dark';
            applyTheme(next);
            try {
                localStorage.setItem('norra_theme', next);
                localStorage.setItem('theme', next);
            } catch (e) {}
        };

        const toggleBtn = document.getElementById('theme-toggle');
        if (toggleBtn) {
            toggleBtn.onclick = handler;
        }
        const stickyToggle = document.getElementById('sticky-theme-toggle');
        if (stickyToggle) {
            stickyToggle.onclick = handler;
        }
    }

    function applyTheme(theme) {
        if (typeof window.applyTheme === 'function') {
            window.applyTheme(theme);
            return;
        }
        const cleanTheme = theme === 'light' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', cleanTheme);
        document.documentElement.className = cleanTheme === 'light' ? 'theme-light' : '';
        if (document.body) {
            document.body.setAttribute('data-theme', cleanTheme);
            document.body.className = cleanTheme === 'light' ? 'theme-light' : '';
        }
        const icon = cleanTheme === 'light' ? '🌙' : '☀️';
        const title = `Switch to ${cleanTheme === 'light' ? 'Dark' : 'Light'} Mode`;
        const toggleBtn = document.getElementById('theme-toggle');
        if (toggleBtn) {
            toggleBtn.textContent = icon;
            toggleBtn.title = title;
        }
        const stickyToggle = document.getElementById('sticky-theme-toggle');
        if (stickyToggle) {
            stickyToggle.textContent = icon;
            stickyToggle.title = title;
        }
        const metaTheme = document.querySelector('meta[name="theme-color"]');
        if (metaTheme) metaTheme.setAttribute('content', cleanTheme === 'light' ? '#ffffff' : '#080b12');
    }

    function setupBackToTop() {
        const btn = document.getElementById('sticky-back-to-top');
        if (!btn) return;
        window.addEventListener('scroll', () => {
            if (window.scrollY > 280) {
                btn.classList.add('is-visible');
            } else {
                btn.classList.remove('is-visible');
            }
        }, { passive: true });

        btn.addEventListener('click', () => {
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        });
    }

    function setupTimezones() {
        const tzSelect = document.getElementById('timezone-select');
        if (!tzSelect) return;
        const detected = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
        const popularZones = [
            { id: detected, label: `Local (${detected.replace('_', ' ')})` },
            { id: 'UTC', label: 'UTC (GMT+0)' },
            { id: 'Europe/London', label: 'London (GMT/BST)' },
            { id: 'Europe/Paris', label: 'Paris / Berlin (CET)' },
            { id: 'Africa/Lagos', label: 'Lagos / West Africa (WAT)' },
            { id: 'Africa/Johannesburg', label: 'Johannesburg (SAST)' },
            { id: 'Africa/Nairobi', label: 'Nairobi (EAT)' },
            { id: 'America/New_York', label: 'New York (EDT/EST)' },
            { id: 'America/Los_Angeles', label: 'Los Angeles (PDT/PST)' },
            { id: 'America/Sao_Paulo', label: 'São Paulo (BRT)' },
            { id: 'Asia/Dubai', label: 'Dubai (GST)' },
            { id: 'Asia/Tokyo', label: 'Tokyo (JST)' }
        ];

        const seen = new Set();
        tzSelect.innerHTML = '';
        for (const tz of popularZones) {
            if (!seen.has(tz.id)) {
                seen.add(tz.id);
                const opt = document.createElement('option');
                opt.value = tz.id;
                opt.textContent = tz.label;
                if (tz.id === currentTimezone) opt.selected = true;
                tzSelect.appendChild(opt);
            }
        }

        tzSelect.addEventListener('change', (e) => {
            currentTimezone = e.target.value;
            localStorage.setItem('norra_timezone', currentTimezone);
            if (state.fixtures && state.fixtures.length) {
                renderFixtures(state.fixtures);
            }
            if (state.currentEventId) {
                loadMatchDetails(state.currentEventId, true);
            }
        });
    }

    async function loadAdsAndPromos() {
        try {
            const res = await fetchJson('/api/v1/ads');
            if (!res) return;

            // Announcement bar
            const announcementBar = document.getElementById('announcement-bar');
            if (announcementBar && res.announcement) {
                announcementBar.innerHTML = escapeHtml(res.announcement);
                announcementBar.style.display = 'block';
            }

            // Header & Footer custom logos
            const headerLogoImg = document.getElementById('header-logo-img');
            const headerBrandFallback = document.getElementById('header-brand-fallback');
            if (headerLogoImg && res.branding?.headerLogoUrl) {
                headerLogoImg.src = res.branding.headerLogoUrl;
                headerLogoImg.hidden = false;
                if (headerBrandFallback) headerBrandFallback.style.display = 'none';
            }

            const footerLogoImg = document.getElementById('footer-logo-img');
            if (footerLogoImg && res.branding?.footerLogoUrl) {
                footerLogoImg.src = res.branding.footerLogoUrl;
                footerLogoImg.hidden = false;
            }

            // Custom Favicon
            if (res.branding?.faviconUrl) {
                let favLink = document.getElementById('site-favicon') || document.querySelector('link[rel="icon"]');
                if (!favLink) {
                    favLink = document.createElement('link');
                    favLink.rel = 'icon';
                    document.head.appendChild(favLink);
                }
                favLink.href = res.branding.faviconUrl;
            }

            // 3-Box Hero Bookmaker Promos Grid
            const promosContainer = document.getElementById('hero-promos-container');
            if (promosContainer) {
                const promos = (res.bookmakerPromos && res.bookmakerPromos.length)
                    ? res.bookmakerPromos.filter(p => p.isActive)
                    : [];

                if (promos.length > 0) {
                    promosContainer.innerHTML = promos.map(p => `
                        <div class="promo-card">
                            <div>
                                <span class="promo-badge" style="background:${escapeHtml(p.badgeColor || '#3b82f6')}">${escapeHtml(p.badgeText || p.provider)}</span>
                                <div class="promo-headline">${escapeHtml(p.headline)}</div>
                            </div>
                            <div class="promo-footer-row">
                                <span class="promo-code-box" title="Click to copy promo code" onclick="navigator.clipboard.writeText('${escapeHtml(p.promoCode)}'); alert('Code copied: ${escapeHtml(p.promoCode)}');">${escapeHtml(p.promoCode)}</span>
                                <a class="promo-cta-btn" href="${escapeHtml(p.ctaUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(p.ctaText || 'Claim Bonus')} →</a>
                            </div>
                        </div>
                    `).join('');
                    promosContainer.style.display = 'grid';
                } else {
                    promosContainer.style.display = 'none';
                }
            }

            // Semantic Ad Slots
            renderAdSlot('ad-slot-header', res.ads?.header);
            renderInfeedSlot(res.infeedSettings?.infeedCard, res.ads?.inFeed);
            renderAdSlot('ad-slot-drawer', res.ads?.drawer);
            renderAdSlot('ad-slot-footer', res.ads?.footer);

            // Universal Bet Booking Code Converter visibility (respects Admin toggle)
            const bookingConverterSection = document.getElementById('booking-converter-section');
            if (bookingConverterSection) {
                const hookEnabled = res.bookingSettings?.hookEnabled !== false;
                bookingConverterSection.style.display = hookEnabled ? 'block' : 'none';
            }

            // Sync dynamic pricing plans from admin settings
            if (res.plans) {
                syncDynamicPricingPlans(res.plans);
            }

            // Dynamic Social Community Links
            renderSocialLinks(res.socialLinks);

        } catch (err) {
            console.warn('Ad/Promo load error:', err);
        }
    }

    function syncDynamicPricingPlans(plans) {
        if (!plans) return;
        if (plans.starter) {
            const p = document.getElementById('price-starter-val');
            if (p && plans.starter.priceUsd !== undefined) p.textContent = plans.starter.priceUsd;
            const l = document.getElementById('limit-starter-val');
            if (l && plans.starter.rateLimitPerMinute !== undefined) l.textContent = Number(plans.starter.rateLimitPerMinute).toLocaleString();
            const est = document.getElementById('estimate-starter-val');
            if (est && plans.starter.priceUsd !== undefined) est.innerHTML = `~₦${(plans.starter.priceUsd * 1600).toLocaleString()} /mo &bull; Billed monthly`;
        }
        if (plans.pro) {
            const p = document.getElementById('price-pro-val');
            if (p && plans.pro.priceUsd !== undefined) p.textContent = plans.pro.priceUsd;
            const l = document.getElementById('limit-pro-val');
            if (l && plans.pro.rateLimitPerMinute !== undefined) l.textContent = Number(plans.pro.rateLimitPerMinute).toLocaleString();
            const est = document.getElementById('estimate-pro-val');
            if (est && plans.pro.priceUsd !== undefined) est.innerHTML = `~₦${(plans.pro.priceUsd * 1600).toLocaleString()} /mo &bull; Billed monthly`;
        }
        if (plans.whitelabel) {
            const p = document.getElementById('price-whitelabel-val');
            if (p && plans.whitelabel.priceUsd !== undefined) p.textContent = plans.whitelabel.priceUsd;
            const l = document.getElementById('limit-whitelabel-val');
            if (l && plans.whitelabel.rateLimitPerMinute !== undefined) l.textContent = Number(plans.whitelabel.rateLimitPerMinute).toLocaleString();
            const est = document.getElementById('estimate-whitelabel-val');
            if (est && plans.whitelabel.priceUsd !== undefined) est.innerHTML = `~₦${(plans.whitelabel.priceUsd * 1600).toLocaleString()} /mo &bull; Billed monthly`;
        }
    }

    function renderInfeedSlot(infeedCard, inFeedAd) {
        const el = document.getElementById('ad-slot-infeed');
        if (!el) return;

        // Priority 1: Direct In-Feed Ad Banner if explicitly enabled
        if (inFeedAd && inFeedAd.isEnabled) {
            renderAdSlot('ad-slot-infeed', inFeedAd);
            return;
        }

        // Priority 2: In-Feed Promo / Intelligence Sponsor Card
        if (infeedCard && infeedCard.enabled) {
            if (infeedCard.customHtml && infeedCard.customHtml.trim()) {
                el.innerHTML = infeedCard.customHtml;
                el.hidden = false;
                return;
            }

            el.innerHTML = `
                <div class="infeed-sponsor-card">
                    <div class="infeed-sponsor-content">
                        <span class="infeed-sponsor-badge" style="background:${escapeHtml(infeedCard.badgeColor || '#3b82f6')}">${escapeHtml(infeedCard.badgeText || 'NORRA PRO')}</span>
                        <div class="infeed-sponsor-headline">${escapeHtml(infeedCard.headline || 'Supercharge Your Match Predictions')}</div>
                        <p class="infeed-sponsor-subtext">${escapeHtml(infeedCard.subtext || 'Live expected goals (xG), momentum trackers, and intelligent betting signals.')}</p>
                    </div>
                    <a class="infeed-sponsor-cta" href="${escapeHtml(infeedCard.ctaUrl || 'https://mynorra.xyz')}" target="_blank" rel="noopener noreferrer">
                        ${escapeHtml(infeedCard.ctaText || 'Explore Intelligence')} &rarr;
                    </a>
                </div>
            `;
            el.hidden = false;
            return;
        }

        // Neither enabled
        el.hidden = true;
        el.innerHTML = '';
    }

    function renderSocialLinks(socialLinks) {
        if (!socialLinks) return;
        const platforms = ['twitter', 'telegram', 'discord', 'github', 'facebook', 'instagram', 'youtube', 'linkedin'];
        platforms.forEach(platform => {
            const linkEl = document.getElementById(`social-link-${platform}`);
            if (!linkEl) return;
            const url = socialLinks[platform];
            if (url && typeof url === 'string' && url.trim().length > 0) {
                linkEl.href = url.trim();
                linkEl.style.display = 'inline-flex';
            } else {
                linkEl.style.display = 'none';
            }
        });
    }

    function renderAdSlot(elementId, slotData) {
        const el = document.getElementById(elementId);
        if (!el) return;
        if (!slotData || !slotData.isEnabled) {
            el.hidden = true;
            el.innerHTML = '';
            return;
        }

        if (slotData.customHtml && slotData.customHtml.trim()) {
            el.innerHTML = `<span class="ad-slot-label">Sponsored Advertisement</span>` + slotData.customHtml;
            el.hidden = false;
        } else if (slotData.imageUrl) {
            const link = slotData.targetUrl || '#';
            el.innerHTML = `
                <span class="ad-slot-label">Sponsored Advertisement</span>
                <a href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">
                    <img src="${escapeHtml(slotData.imageUrl)}" alt="Sponsor" style="max-width:100%; height:auto; border-radius:8px;">
                </a>
            `;
            el.hidden = false;
        } else {
            el.hidden = true;
        }
    }

    function bindEvents() {
        if (elements['country-select']) elements['country-select'].addEventListener('change', () => populateLeagues());
        if (elements['league-select']) {
            elements['league-select'].addEventListener('change', event => {
                const slug = event.target.value;
                if (slug) window.location.assign(`/football/${encodeURIComponent(slug)}`);
            });
        }
        if (elements['refresh-button']) {
            elements['refresh-button'].addEventListener('click', () => {
                if (state.selectedLeagueSlug === 'all') {
                    loadAllLeagueFixtures();
                } else {
                    Promise.allSettled([loadFixtures(), loadStandings(), loadMeta(), loadAdsAndPromos()]);
                }
            });
        }
        if (elements['apply-fixture-filter']) {
            elements['apply-fixture-filter'].addEventListener('click', () => {
                if (state.selectedLeagueSlug === 'all') {
                    loadAllLeagueFixtures();
                } else {
                    loadFixtures();
                }
            });
        }
        if (elements['fixture-status']) {
            elements['fixture-status'].addEventListener('change', () => {
                if (state.selectedLeagueSlug === 'all') {
                    loadAllLeagueFixtures();
                } else {
                    loadFixtures();
                }
            });
        }
        if (elements['fixtures-load-more']) {
            elements['fixtures-load-more'].addEventListener('click', () => loadFixtures({ append: true }));
        }
        if (elements['fixtures-tab']) elements['fixtures-tab'].addEventListener('click', () => switchView('fixtures'));
        if (elements['standings-tab']) elements['standings-tab'].addEventListener('click', () => switchView('standings'));
        if (elements['fixtures-list']) {
            elements['fixtures-list'].addEventListener('click', event => {
                const pinBtn = event.target.closest('.fs-pin-btn');
                if (pinBtn) {
                    event.stopPropagation();
                    const eventId = pinBtn.dataset.pinId;
                    togglePinMatch(eventId);
                    return;
                }

                const card = event.target.closest('[data-event-id]');
                if (card) {
                    event.preventDefault();
                    const eventId = card.dataset.eventId;
                    const leagueSlug = card.dataset.leagueSlug || state.league?.slug;
                    openMatch(eventId, leagueSlug);
                }
            });
            elements['fixtures-list'].addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') {
                    const card = event.target.closest('[data-event-id]');
                    if (card) {
                        event.preventDefault();
                        const eventId = card.dataset.eventId;
                        const leagueSlug = card.dataset.leagueSlug || state.league?.slug;
                        openMatch(eventId, leagueSlug);
                    }
                }
            });
        }
        if (elements['close-dialog']) elements['close-dialog'].addEventListener('click', closeMatchDialog);
        if (elements['match-dialog']) {
            elements['match-dialog'].addEventListener('click', event => {
                if (event.target === elements['match-dialog']) closeMatchDialog();
            });
            elements['match-dialog'].addEventListener('cancel', event => {
                event.preventDefault();
                closeMatchDialog();
            });
        }

        initStatusPills();
        initDateRibbon();
        initSearch();
        initLiveSync();
    }

    function initStatusPills() {
        const pills = document.querySelectorAll('.fs-status-pill');
        pills.forEach(pill => {
            pill.addEventListener('click', (e) => {
                e.preventDefault();
                pills.forEach(p => {
                    p.classList.remove('active');
                    p.setAttribute('aria-selected', 'false');
                });
                pill.classList.add('active');
                pill.setAttribute('aria-selected', 'true');

                const status = pill.dataset.status || 'all';
                state.currentStatus = status;
                if (elements['fixture-status']) elements['fixture-status'].value = status;

                if (status === 'live') {
                    selectLiveMatches();
                } else if (status === 'favorites') {
                    if (state.selectedLeagueSlug === 'live') {
                        state.selectedLeagueSlug = 'all';
                        renderQuickLeaguePills('all');
                        renderDesktopSidebar('all');
                    }
                    if (elements['dashboard-country']) elements['dashboard-country'].textContent = 'Favorites';
                    if (elements['dashboard-title']) elements['dashboard-title'].textContent = '⭐ My Pinned Games';
                    loadAllLeagueFixtures({ favoritesOnly: true });
                } else if (status === 'finished') {
                    if (state.selectedLeagueSlug === 'live') {
                        state.selectedLeagueSlug = 'all';
                        renderQuickLeaguePills('all');
                        renderDesktopSidebar('all');
                    }
                    if (elements['dashboard-country']) elements['dashboard-country'].textContent = state.league ? localCountryName(state.league.country) : 'World Football';
                    if (elements['dashboard-title']) elements['dashboard-title'].textContent = state.league ? `${state.league.name} · Finished` : '🏁 Finished Matches';
                    if (state.league && state.selectedLeagueSlug !== 'all') {
                        loadFixtures();
                    } else {
                        state.selectedLeagueSlug = 'all';
                        loadAllLeagueFixtures();
                    }
                } else if (status === 'scheduled') {
                    if (state.selectedLeagueSlug === 'live') {
                        state.selectedLeagueSlug = 'all';
                        renderQuickLeaguePills('all');
                        renderDesktopSidebar('all');
                    }
                    if (elements['dashboard-country']) elements['dashboard-country'].textContent = state.league ? localCountryName(state.league.country) : 'World Football';
                    if (elements['dashboard-title']) elements['dashboard-title'].textContent = state.league ? `${state.league.name} · Scheduled` : '📅 Scheduled Matches';
                    if (state.league && state.selectedLeagueSlug !== 'all') {
                        loadFixtures();
                    } else {
                        state.selectedLeagueSlug = 'all';
                        loadAllLeagueFixtures();
                    }
                } else {
                    // status === 'all'
                    if (state.selectedLeagueSlug === 'live') {
                        selectAllLeagues();
                    } else {
                        if (elements['dashboard-country']) elements['dashboard-country'].textContent = state.league ? localCountryName(state.league.country) : 'World Football';
                        if (elements['dashboard-title']) elements['dashboard-title'].textContent = state.league ? state.league.name : 'All Live Matches & Fixtures';
                        if (state.league && state.selectedLeagueSlug !== 'all') {
                            loadFixtures();
                        } else {
                            state.selectedLeagueSlug = 'all';
                            loadAllLeagueFixtures();
                        }
                    }
                }
            });
        });
        updateFavoritesBadge();

        const headerLiveBtn = document.getElementById('header-live-btn');
        if (headerLiveBtn) {
            headerLiveBtn.addEventListener('click', (e) => {
                e.preventDefault();
                selectLiveMatches();
            });
        }

        const navScoresLink = document.getElementById('nav-scores-link');
        if (navScoresLink) {
            navScoresLink.addEventListener('click', (e) => {
                if (window.location.pathname === '/' || window.location.pathname === '') {
                    e.preventDefault();
                    selectAllLeagues();
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                }
            });
        }

        ['footer-link-today', 'footer-link-fixtures'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('click', (e) => {
                    if (window.location.pathname === '/' || window.location.pathname === '') {
                        e.preventDefault();
                        selectAllLeagues();
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                    }
                });
            }
        });
    }

    function updateFavoritesBadge() {
        const badge = document.getElementById('fs-status-fav-badge');
        if (badge) {
            const count = state.pinnedMatches.length;
            badge.textContent = count;
            badge.style.display = count > 0 ? 'inline-block' : 'none';
        }
    }

    function togglePinMatch(eventId) {
        if (!eventId) return;
        const idStr = String(eventId);
        const idx = state.pinnedMatches.indexOf(idStr);
        if (idx === -1) {
            state.pinnedMatches.push(idStr);
            showToast('⭐ Match pinned to My Games');
        } else {
            state.pinnedMatches.splice(idx, 1);
            showToast('Match unpinned from My Games');
        }
        try {
            localStorage.setItem('norra_pinned_matches', JSON.stringify(state.pinnedMatches));
        } catch {}

        updateFavoritesBadge();

        // Re-render fixtures list to reflect pinning
        if (state.currentStatus === 'favorites') {
            loadAllLeagueFixtures({ favoritesOnly: true });
        } else if (state.selectedLeagueSlug === 'all') {
            loadAllLeagueFixtures();
        } else if (state.selectedLeagueSlug === 'live') {
            loadLiveMatches();
        } else if (state.league) {
            renderFixtures(state.fixtures);
        }
    }

    function initDateRibbon() {
        const pillsList = document.getElementById('date-pills-list');
        const prevBtn = document.getElementById('date-prev-btn');
        const nextBtn = document.getElementById('date-next-btn');
        const picker = document.getElementById('matchday-picker');

        if (pillsList) {
            pillsList.querySelectorAll('.date-pill-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    const day = btn.dataset.day;
                    const d = new Date();
                    if (day === 'yesterday') {
                        d.setDate(d.getDate() - 1);
                    } else if (day === 'tomorrow') {
                        d.setDate(d.getDate() + 1);
                    }
                    setMatchdayDate(d);
                });
            });
        }

        if (prevBtn) {
            prevBtn.addEventListener('click', (e) => {
                e.preventDefault();
                const baseDate = state.selectedDateStr ? new Date(state.selectedDateStr + 'T12:00:00Z') : new Date();
                baseDate.setDate(baseDate.getDate() - 1);
                setMatchdayDate(baseDate);
            });
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', (e) => {
                e.preventDefault();
                const baseDate = state.selectedDateStr ? new Date(state.selectedDateStr + 'T12:00:00Z') : new Date();
                baseDate.setDate(baseDate.getDate() + 1);
                setMatchdayDate(baseDate);
            });
        }

        if (picker) {
            picker.value = isoDateInput(new Date());
            picker.addEventListener('change', (e) => {
                if (e.target.value) {
                    const picked = new Date(e.target.value + 'T12:00:00Z');
                    if (!isNaN(picked.getTime())) {
                        setMatchdayDate(picked);
                    }
                }
            });
        }
    }

    function initSearch() {
        const searchInput = document.getElementById('livescore-search-input');
        const clearBtn = document.getElementById('clear-search-btn');
        if (!searchInput) return;

        searchInput.addEventListener('input', (e) => {
            const q = e.target.value.trim().toLowerCase();
            state.searchQuery = q;
            if (clearBtn) clearBtn.hidden = !q;
            applyLiveSearch(q);
        });

        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                searchInput.value = '';
                state.searchQuery = '';
                clearBtn.hidden = true;
                applyLiveSearch('');
            });
        }
    }

    function applyLiveSearch(query) {
        const list = elements['fixtures-list'] || document.getElementById('fixtures-list');
        if (!list) return;
        const q = (query || '').trim().toLowerCase();
        const rows = list.querySelectorAll('.fs-match-row');
        if (!q) {
            rows.forEach(r => { r.style.display = ''; });
            list.querySelectorAll('.fs-league-section').forEach(s => { s.style.display = ''; });
            return;
        }

        list.querySelectorAll('.fs-league-section').forEach(sec => {
            let sectionHasMatch = false;
            sec.querySelectorAll('.fs-match-row').forEach(row => {
                const searchData = (
                    (row.dataset.search || '') + ' ' +
                    (row.textContent || '') + ' ' +
                    (row.getAttribute('aria-label') || '')
                ).toLowerCase();
                const matched = searchData.includes(q);
                row.style.display = matched ? '' : 'none';
                if (matched) sectionHasMatch = true;
            });
            sec.style.display = sectionHasMatch ? '' : 'none';
        });
    }

    function patchLiveMatchRowsInDom(liveMatches) {
        const list = elements['fixtures-list'];
        if (!list || !liveMatches || !liveMatches.length) return false;
        let matchedCount = 0;
        for (const m of liveMatches) {
            const row = list.querySelector(`.fs-match-row[data-event-id="${m.id}"]`);
            if (row) {
                matchedCount++;
                const scoreDigits = row.querySelectorAll('.fs-score-digit');
                if (scoreDigits.length >= 2) {
                    const hScore = String(m.home?.score ?? 0);
                    const aScore = String(m.away?.score ?? 0);
                    if (scoreDigits[0].textContent !== hScore) {
                        scoreDigits[0].textContent = hScore;
                        scoreDigits[0].classList.add('score-live');
                    }
                    if (scoreDigits[1].textContent !== aScore) {
                        scoreDigits[1].textContent = aScore;
                        scoreDigits[1].classList.add('score-live');
                    }
                }
                const liveStatusEl = row.querySelector('.fs-status-live');
                const clock = m.status?.clock || m.status?.detail || 'Live';
                if (liveStatusEl && liveStatusEl.textContent !== clock) {
                    liveStatusEl.textContent = clock;
                }
            }
        }
        return matchedCount > 0 && matchedCount === liveMatches.length;
    }

    function initLiveSync() {
        const refreshBtn = document.getElementById('quick-refresh-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                state.lastLiveDigest = null;
                syncLiveScores();
            });
        }

        let isPolling = false;
        async function syncLiveScores() {
            // Guard against background tab waste: halt polling if document is hidden to conserve bandwidth
            if (document.hidden || isPolling) return;
            isPolling = true;

            try {
                const res = await fetchJson('/api/v1/football/live');
                const liveMatches = res.live || res.matches || [];
                state.liveMatchCount = liveMatches.length;

                const badge = document.getElementById('live-count-badge');
                if (badge) {
                    badge.textContent = liveMatches.length;
                    badge.style.display = liveMatches.length > 0 ? 'inline-block' : 'none';
                }
                const fsBadge = document.getElementById('fs-status-live-badge');
                if (fsBadge) {
                    fsBadge.textContent = liveMatches.length;
                    fsBadge.style.display = liveMatches.length > 0 ? 'inline-block' : 'none';
                }

                // Compute lightweight live state fingerprint
                const currentDigest = liveMatches.map(m =>
                    `${m.id}:${m.home?.score ?? 0}-${m.away?.score ?? 0}:${m.status?.clock || m.status?.detail || m.status?.displayClock || m.clock?.displayValue || ''}`
                ).join('|');

                const digestChanged = currentDigest !== state.lastLiveDigest;
                const now = Date.now();
                const isInitialBoot = !state.lastFullFixturesSync;
                const timeSinceLastFullSync = now - (state.lastFullFixturesSync || 0);

                // Update digest
                state.lastLiveDigest = currentDigest;

                if (isInitialBoot) {
                    state.lastFullFixturesSync = now;
                    return; // Prevent duplicate initial fetch since selectAllLeagues/init runs on boot
                }

                // If only existing live scores changed in-place, patch DOM without re-rendering container
                if (digestChanged && patchLiveMatchRowsInDom(liveMatches)) {
                    return;
                }

                // Only update the full visible fixture list if viewing today AND (digest changed OR >60s elapsed)
                const isViewingToday = !state.selectedDayOffset || state.selectedDayOffset === 0;
                if (isViewingToday && (digestChanged || timeSinceLastFullSync > 60000)) {
                    state.lastFullFixturesSync = now;

                    if (state.selectedLeagueSlug === 'live' || state.currentStatus === 'live') {
                        loadLiveMatches({ background: true, initialLive: liveMatches });
                    } else if (state.selectedLeagueSlug === 'all') {
                        loadAllLeagueFixtures({ background: true });
                    } else if (state.league) {
                        loadFixtures({ background: true });
                    }
                }
            } catch (e) {
                // background poll notice
            } finally {
                isPolling = false;
            }
        }

        // Dynamically throttle polling interval: 15s when active games, 30s when no live games
        window.clearInterval(state.liveSyncTimer);
        state.liveSyncTimer = window.setInterval(syncLiveScores, 15000);

        // Resume sync immediately when user switches back to this tab
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                syncLiveScores();
            }
        });

        // Immediate check
        syncLiveScores();
    }

    let audioCtx = null;
    function playGoalSound() {
        if (!state.goalAlertsEnabled) return;
        try {
            if (!audioCtx) {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (audioCtx.state === 'suspended') {
                audioCtx.resume();
            }
            const now = audioCtx.currentTime;

            // Referee whistle synthesizer
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(2600, now);
            osc.frequency.exponentialRampToValueAtTime(1900, now + 0.12);
            osc.frequency.exponentialRampToValueAtTime(2800, now + 0.25);

            gain.gain.setValueAtTime(0.25, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.45);

            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now);
            osc.stop(now + 0.45);

            // Stadium cheer chord synthesizer
            setTimeout(() => {
                if (!audioCtx) return;
                const t = audioCtx.currentTime;
                [523.25, 659.25, 783.99, 1046.50].forEach((freq, idx) => {
                    const chordOsc = audioCtx.createOscillator();
                    const chordGain = audioCtx.createGain();
                    chordOsc.type = 'sine';
                    chordOsc.frequency.setValueAtTime(freq, t + (idx * 0.05));
                    chordGain.gain.setValueAtTime(0.12, t + (idx * 0.05));
                    chordGain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
                    chordOsc.connect(chordGain);
                    chordGain.connect(audioCtx.destination);
                    chordOsc.start(t + (idx * 0.05));
                    chordOsc.stop(t + 0.6);
                });
            }, 120);

            // Mobile device haptic feedback pulse
            if (navigator.vibrate) {
                navigator.vibrate([150, 60, 200]);
            }
        } catch (e) {}
    }

    function initGoalAlertToggle() {
        const toggleBtn = document.getElementById('goal-alert-toggle');
        if (!toggleBtn) return;

        const updateBtnUi = () => {
            const on = Boolean(state.goalAlertsEnabled);
            toggleBtn.classList.toggle('active', on);
            toggleBtn.setAttribute('aria-pressed', String(on));
            const icon = document.getElementById('goal-alert-icon');
            const label = document.getElementById('goal-alert-label');
            if (icon) icon.textContent = on ? '🔊' : '🔔';
            if (label) label.textContent = on ? 'Sound: ON' : 'Sound: OFF';
        };

        updateBtnUi();

        toggleBtn.addEventListener('click', () => {
            state.goalAlertsEnabled = !state.goalAlertsEnabled;
            try {
                localStorage.setItem('norra_goal_alerts', String(state.goalAlertsEnabled));
            } catch {}
            updateBtnUi();
            if (state.goalAlertsEnabled) {
                playGoalSound();
                showToast('🔊 Goal Celebration Sound & Haptics ENABLED');
            } else {
                showToast('🔔 Goal alerts muted');
            }
        });
    }

    function initLiveEventStream() {
        if (!window.EventSource) return;
        try {
            if (state.liveEventSource) {
                state.liveEventSource.close();
                state.liveEventSource = null;
            }

            const source = new EventSource('/api/v1/football/live/stream');
            state.liveEventSource = source;

            source.addEventListener('initial', (e) => {
                try {
                    const data = JSON.parse(e.data);
                    const matches = data.matches || [];
                    state.liveMatchCount = matches.length;
                    const fsBadge = document.getElementById('fs-status-live-badge');
                    if (fsBadge) {
                        fsBadge.textContent = matches.length;
                        fsBadge.style.display = matches.length > 0 ? 'inline-block' : 'none';
                    }
                } catch {}
            });

            source.addEventListener('score_update', (e) => {
                try {
                    const data = JSON.parse(e.data);
                    if (data.updates && data.updates.length) {
                        for (const update of data.updates) {
                            applyRealtimeMatchUpdate(update);
                        }
                    }
                } catch {}
            });

            source.onerror = () => {
                // EventSource standard auto-reconnects
            };
        } catch (err) {
            console.warn('SSE stream notice:', err.message);
        }
    }

    function applyRealtimeMatchUpdate(update) {
        if (!update || !update.id) return;
        const matchRow = document.querySelector(`.fs-match-row[data-event-id="${update.id}"]`);
        if (matchRow) {
            const scoreDigits = matchRow.querySelectorAll('.fs-score-digit');
            const prevHomeScore = scoreDigits[0] ? scoreDigits[0].textContent.trim() : null;
            const prevAwayScore = scoreDigits[1] ? scoreDigits[1].textContent.trim() : null;
            const newHomeScore = String(update.home?.score ?? 0);
            const newAwayScore = String(update.away?.score ?? 0);

            if (scoreDigits[0]) scoreDigits[0].textContent = newHomeScore;
            if (scoreDigits[1]) scoreDigits[1].textContent = newAwayScore;

            const clockEl = matchRow.querySelector('.fs-status-live');
            if (clockEl) {
                const newClock = formatMatchClock(update.status, update.status?.type);
                // Never allow generic 'Live' text to override an existing concrete match clock!
                if (isConcreteClock(newClock) || !isConcreteClock(clockEl.textContent)) {
                    clockEl.textContent = newClock;
                }
            }

            if (prevHomeScore !== null && (newHomeScore > prevHomeScore || newAwayScore > prevAwayScore)) {
                playGoalSound();
                matchRow.classList.add('goal-scored-highlight');
                setTimeout(() => matchRow.classList.remove('goal-scored-highlight'), 4000);
                showToast(`⚽ GOAL! ${update.home?.displayName || 'Home'} ${newHomeScore} - ${newAwayScore} ${update.away?.displayName || 'Away'}`);
            }
        }

        if (state.currentEventId === update.id && elements['dialog-content']) {
            const scoreDigits = elements['dialog-content'].querySelector('.score-digits');
            if (scoreDigits) {
                scoreDigits.textContent = `${update.home?.score ?? 0} - ${update.away?.score ?? 0}`;
            }
            const minutePill = elements['dialog-content'].querySelector('.minute-pill');
            if (minutePill) {
                const newClock = formatMatchClock(update.status, update.status?.type);
                if (isConcreteClock(newClock) || !isConcreteClock(minutePill.textContent)) {
                    minutePill.textContent = newClock;
                }
            }
        }
    }

    function initBookingConverter() {
        const form = document.getElementById('booking-converter-form');
        if (!form) return;

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const codeInput = document.getElementById('convert-code-input');
            const fromSelect = document.getElementById('convert-from-select');
            const toSelect = document.getElementById('convert-to-select');
            const submitBtn = document.getElementById('convert-submit-btn');
            const resultBox = document.getElementById('converter-result-box');
            const quotaText = document.getElementById('converter-quota-text');

            const code = codeInput ? codeInput.value.trim() : '';
            const fromBookmaker = fromSelect ? fromSelect.value : '';
            const toBookmaker = toSelect ? toSelect.value : '';

            if (!code) return;
            if (fromBookmaker === toBookmaker) {
                showToast('⚠️ Please select a different target bookmaker.');
                return;
            }

            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<span class="loader" style="width:14px; height:14px; border-width:2px; display:inline-block;"></span> Converting...';
            }

            let deviceId = localStorage.getItem('norra_device_id');
            if (!deviceId) {
                deviceId = 'dev_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
                localStorage.setItem('norra_device_id', deviceId);
            }

            try {
                const res = await fetch('/api/v1/booking/convert', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-device-id': deviceId
                    },
                    body: JSON.stringify({
                        sourceCode: code,
                        fromBookmaker,
                        toBookmaker
                    })
                });

                const data = await res.json();
                if (!res.ok) {
                    if (res.status === 429) {
                        resultBox.style.display = 'block';
                        resultBox.innerHTML = `
                            <div style="background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 8px; padding: 16px; text-align: center;">
                                <span style="font-size: 24px;">⏳</span>
                                <h4 style="margin: 6px 0; color: #ef4444;">Daily Free Conversion Limit Reached</h4>
                                <p style="font-size: 13px; color: var(--text-muted); margin: 0 0 12px;">You've used all 2 free daily web conversions. Upgrade to Starter ($10/mo) for 500 conversions/day or Pro ($29/mo) for unlimited conversions.</p>
                                <a href="/pricing" class="btn-primary" style="display: inline-block; padding: 8px 16px; text-decoration: none; border-radius: 6px; font-weight: 700; font-size: 13px;">View Pricing Plans &rarr;</a>
                            </div>
                        `;
                        return;
                    }
                    throw new Error(data.error || 'Conversion failed');
                }

                if (quotaText && data.quotaRemaining !== undefined) {
                    quotaText.textContent = `${data.quotaRemaining} daily conversions remaining`;
                }

                resultBox.style.display = 'block';
                resultBox.innerHTML = `
                    <div style="background: var(--bg-canvas); border: 1px solid var(--border-subtle); border-radius: 10px; padding: 14px; box-sizing: border-box; width: 100%; max-width: 100%; overflow-x: hidden;">
                        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 14px; width: 100%; box-sizing: border-box;">
                            <div style="min-width: 0; flex: 1 1 180px;">
                                <span style="font-size: 11px; text-transform: uppercase; color: var(--text-muted); font-weight: 700; letter-spacing: 0.5px;">Converted Booking Code</span>
                                <div style="display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 4px;">
                                    <strong style="font-size: 20px; font-family: monospace; color: var(--color-primary); letter-spacing: 1px; word-break: break-all;">${escapeHtml(data.convertedCode)}</strong>
                                    <button type="button" id="copy-converted-code-btn" style="background: var(--bg-surface-elevated); border: 1px solid var(--border-subtle); border-radius: 6px; padding: 4px 8px; font-size: 11.5px; font-weight: 600; cursor: pointer; color: var(--text-main);">📋 Copy</button>
                                </div>
                            </div>
                            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                                ${data.directUrl ? `
                                    <a href="${safeUrl(data.directUrl)}" target="_blank" rel="noopener" class="btn-primary" style="display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; text-decoration: none; border-radius: 6px; font-size: 12.5px; font-weight: 700; max-width: 100%; box-sizing: border-box;">
                                        <span>Load on ${escapeHtml(data.toName || 'Bookmaker')}</span> <span>&rarr;</span>
                                    </a>
                                ` : ''}
                            </div>
                        </div>

                        <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 12px; word-break: break-word;">
                            Converted from <strong>${escapeHtml(data.fromName)}</strong> (${escapeHtml(data.sourceCode)}) to <strong>${escapeHtml(data.toName)}</strong> &bull; Total Multi-Bet Odds: <strong style="color:var(--text-main);">${escapeHtml(data.combinedOdds || 5.4)}</strong>
                        </div>

                        ${data.selections?.length ? `
                            <div style="font-size: 11px; text-transform: uppercase; color: var(--text-muted); font-weight: 700; margin-bottom: 6px;">Matched Selections (${data.selections.length} legs)</div>
                            <div style="display: flex; flex-direction: column; gap: 6px; width: 100%; box-sizing: border-box;">
                                ${data.selections.map(s => `
                                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px; padding: 6px 10px; background: var(--bg-surface-elevated); border: 1px solid var(--border-subtle); border-radius: 6px; font-size: 12px; box-sizing: border-box; width: 100%; min-width: 0;">
                                        <span style="min-width: 0; flex: 1 1 180px; overflow-wrap: anywhere; word-break: break-word;"><strong>${escapeHtml(s.event)}</strong> &bull; <span style="color:var(--text-muted);">${escapeHtml(s.market)}</span></span>
                                        <span style="white-space: nowrap;"><span style="background:var(--color-primary-subtle); color:var(--color-primary); padding:2px 6px; border-radius:4px; font-weight:700;">${escapeHtml(s.pick)}</span> &bull; <strong>@${escapeHtml(s.odds)}</strong></span>
                                    </div>
                                `).join('')}
                            </div>
                        ` : ''}
                    </div>
                `;

                const copyBtn = document.getElementById('copy-converted-code-btn');
                if (copyBtn) {
                    copyBtn.addEventListener('click', () => {
                        navigator.clipboard.writeText(data.convertedCode);
                        copyBtn.textContent = '✓ Copied!';
                        setTimeout(() => copyBtn.textContent = '📋 Copy', 2000);
                    });
                }
            } catch (err) {
                showToast(`Conversion error: ${err.message}`);
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<span>Convert Slip</span> <span>&rarr;</span>';
                }
            }
        });
    }

    async function initialize() {
        setupThemeToggle();
        setupBackToTop();
        setupTimezones();
        bindEvents();
        initGoalAlertToggle();
        initLiveEventStream();
        initBookingConverter();
        updateFavoritesBadge();
        setInitialFixtureWindow();
        const currentYearEl = document.getElementById('current-year');
        if (currentYearEl) currentYearEl.textContent = new Date().getFullYear();


        const results = await Promise.allSettled([loadMeta(), loadLeagues(), loadAdsAndPromos()]);
        if (results[1].status === 'rejected' && elements['country-select']) {
            elements['country-select'].replaceChildren(new Option('Unable to load leagues', ''));
            showToast(`Unable to load the league catalog: ${results[1].reason.message}`);
        }
    }

    initialize();
})();
