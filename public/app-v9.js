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

    let isUserInteracting = false;
    let userInteractionTimeout = null;
    function markUserInteracting() {
        isUserInteracting = true;
        if (userInteractionTimeout) clearTimeout(userInteractionTimeout);
        userInteractionTimeout = setTimeout(() => {
            isUserInteracting = false;
        }, 400);
    }
    if (typeof window !== 'undefined') {
        window.addEventListener('scroll', markUserInteracting, { passive: true });
        window.addEventListener('touchmove', markUserInteracting, { passive: true });
        window.addEventListener('wheel', markUserInteracting, { passive: true });
    }

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
        'jpn.w.1': '🇯🇵',
        'bol.1': '🇧🇴',
        'bol.copa': '🇧🇴',
        'mex.2': '🇲🇽',
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
        'concacaf.nations': '🌎',
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
        if (!value) return 'Time unavailable';
        let val = value;
        if (typeof val === 'string' && /^\d{8}$/.test(val.trim())) {
            const s = val.trim();
            val = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
        }
        const date = new Date(val);
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
                renderMobileDrawer('all');
            }
        }

        if (state.selectedLeagueSlug === 'all') {
            inFlightAllFixturesPromise = null;
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
                const response = await fetch(path, {
                    ...options,
                    headers: {
                        Accept: 'application/json',
                        'x-web-client': '1',
                        ...(options.headers || {})
                    }
                });
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
        if (abbr && abbr.length >= 2 && abbr.length <= 4 && !/^\d+$/.test(abbr)) return abbr.toUpperCase().slice(0, 2);
        const clean = String(name || '').replace(/\b(fc|cf|sc|ac|cd|ceif|afc|fk|sk|sv|ssc|as|rc|ud|rb|calcio|club|clube|deportivo)\b/gi, '').trim();
        const parts = clean.split(/\s+/).filter(Boolean);
        if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
        if (parts.length === 1 && parts[0].length >= 2) return parts[0].slice(0, 2).toUpperCase();
        return 'FC';
    }

    function renderCrestFallbackSvg(size = 16) {
        const s = Number(size) || 16;
        // Clean vector soccer shield — no broken/clipped text letters
        return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:middle;display:inline-block;flex-shrink:0;border-radius:4px;" aria-hidden="true"><rect width="24" height="24" rx="4" fill="#0f172a"/><path d="M12 3L4 6V12C4 16.5 7.5 20.5 12 21.5C16.5 20.5 20 16.5 20 12V6L12 3Z" fill="#1e293b" stroke="#3b82f6" stroke-width="1.2"/><circle cx="12" cy="12" r="3.2" fill="#38bdf8"/><path d="M12 8.8L12.9 10.7L15 11L13.5 12.4L13.8 14.5L12 13.5L10.2 14.5L10.5 12.4L9 11L11.1 10.7L12 8.8Z" fill="#ffffff"/></svg>`;
    }

    window.handleLogoError = function(img) {
        if (!img) return;
        const direct = img.getAttribute('data-direct') || '';
        if (!img.dataset.fb && direct && img.src !== direct) {
            img.dataset.fb = '1';
            img.src = direct;
            return;
        }
        img.onerror = null;
        const parent = img.parentElement;
        if (parent) {
            parent.innerHTML = renderCrestFallbackSvg(16);
        } else {
            img.style.display = 'none';
        }
    };

    function teamLogo(team, className = 'team-crest') {
        const display = team?.displayName || team?.name || '';
        const teamId = team?.id || team?.slug || '';
        // Key by normalized name first so different clubs never share a crest slot
        const nameKey = (typeof cleanTeamNameForDedup === 'function' ? cleanTeamNameForDedup(display) : '') || String(teamId || display);
        let logo = safeUrl(team?.logo || team?.logos?.[0]?.href || team?.crest || '');
        // Only use cache when the cached entry was stored under this same name key
        if (!logo && nameKey && crestMemory[nameKey]?.url) {
            logo = crestMemory[nameKey].url;
        }
        if (logo && logo.includes('static.livescore.com/')) {
            logo = logo.replace('static.livescore.com/', 'storage.livescore.com/images/team/medium/');
        }
        // LiveScore sometimes returns relative path without domain
        if (logo && !logo.startsWith('http') && /\.(png|jpg|jpeg|svg|webp)$/i.test(logo)) {
            const clean = logo.replace(/^\/+/, '');
            logo = `https://storage.livescore.com/images/team/medium/${/^\d+\.png$/i.test(clean) ? 'enet/' + clean : clean}`;
        }
        // Reject obviously wrong generic placeholders re-used across clubs
        if (logo && /placeholder|default.?crest|unknown|no.?logo/i.test(logo)) {
            logo = '';
        }
        // LiveScore medium crest by numeric team id when logo URL missing
        if (!logo) {
            const sid = team?.source_id || team?.id || team?.uid || '';
            if (/^\d{4,}$/.test(String(sid))) {
                logo = `https://storage.livescore.com/images/team/medium/enet/${sid}.png`;
            }
        }
        if (!logo && team?.espn_id && /^\d+$/.test(String(team.espn_id))) {
            logo = `https://a.espncdn.com/i/teamlogos/soccer/500/${team.espn_id}.png`;
        }
        const svgFallback = renderCrestFallbackSvg(16);
        if (logo && logo.startsWith('http')) {
            rememberCrest(nameKey, logo);
            const direct = logo;
            const proxied = `/cdn/crest?url=${encodeURIComponent(direct)}`;
            const safeDirect = escapeHtml(direct);
            // Proxy first (cacheable); fall back to direct CDN then SVG shield via clean event handler (no unescaped markup leak)
            const crestAlt = escapeHtml(display ? `${display} crest` : 'Team crest');
            return `<span class="${className}"><img src="${proxied}" alt="${crestAlt}" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-direct="${safeDirect}" onerror="window.handleLogoError(this)"></span>`;
        }
        return `<span class="${className}">${svgFallback}</span>`;
    }

    function competitionFromEvent(event) {
        return event?.competitions?.[0] || {};
    }

    function competitorsFromEvent(event) {
        const competition = competitionFromEvent(event);
        const competitors = competition.competitors || [];
        if (competitors.length >= 1) {
            const unwrap = (side, idx) => {
                const c = competitors.find(item => item.homeAway === side) || competitors[idx] || {};
                const base = c.team && typeof c.team === 'object' ? c.team : {};
                const sideRaw = side === 'home' ? (event.home || {}) : (event.away || {});
                const team = {
                    ...base,
                    id: base.id || c.id || sideRaw.id || '',
                    displayName: base.displayName || base.name || c.displayName || c.name || sideRaw.displayName || sideRaw.name || '',
                    name: base.name || base.displayName || c.name || sideRaw.name || '',
                    logo: base.logo || c.logo || base.logos?.[0]?.href || sideRaw.logo || sideRaw.team?.logo || '',
                    abbreviation: base.abbreviation || c.abbreviation || sideRaw.abbreviation || '',
                    source_id: base.source_id || base.id || c.id || sideRaw.source_id || sideRaw.id || '',
                    espn_id: base.espn_id || c.espn_id || sideRaw.espn_id || ''
                };
                return {
                    ...c,
                    team,
                    score: c.score != null ? c.score : (side === 'home' ? event.home?.score : event.away?.score),
                    winner: c.winner
                };
            };
            return { home: unwrap('home', 0), away: unwrap('away', 1) };
        }
        if (event?.home || event?.away) {
            const wrap = (side) => {
                const raw = event[side] || {};
                const base = raw.team && typeof raw.team === 'object' ? raw.team : raw;
                return {
                    team: {
                        ...base,
                        displayName: base.displayName || base.name || '',
                        name: base.name || base.displayName || '',
                        logo: base.logo || raw.logo || '',
                        source_id: base.source_id || base.id || raw.id || ''
                    },
                    score: raw.score,
                    winner: raw.winner
                };
            };
            return { home: wrap('home'), away: wrap('away') };
        }
        return { home: { team: {} }, away: { team: {} } };
    }


    function isConcreteClock(str) {
        if (!str || typeof str !== 'string') return false;
        const clean = str.trim();
        if (!clean || clean === '0' || clean === "0'" || clean === '00' || clean === '00:00') return false;
        if (/^(live|in\s*progress|status_in_progress|scheduled|upcoming|pre|in|post|ns|sched)$/i.test(clean)) {
            return false;
        }
        if (/^\d{1,2}:\d{2}$/.test(clean)) return false; // Kickoff time e.g. 19:45
        if (/\d/.test(clean)) return true;
        if (/^(ht|half\s*time|halftime|et|aet|pen\.?|penalties|break)$/i.test(clean)) return true;
        return false;
    }

    function formatClockString(val) {
        if (val === undefined || val === null) return '';
        const s = String(val).trim();
        if (!s || s === '0' || s === "0'" || s === '00' || s === '00:00') return '';
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

        // 1. First priority: Find the first CONCRETE clock (contains digits, HT, etc., NOT generic 'Live' or zero)
        for (const cand of candidates) {
            const formatted = formatClockString(cand);
            if (isConcreteClock(formatted)) {
                return formatted;
            }
        }

        // 2. Second priority: If status has numeric clock_seconds > 0
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
        const clockHint = String(status.clock || status.displayClock || status.detail || type.detail || '').trim();
        const isClockZeroOrSched = /^(0|0'|00|00:00|ns|sched|upcoming)$/i.test(clockHint) || /^\d{1,2}:\d{2}$/.test(clockHint);
        const kickoffMs = event?.date ? new Date(event.date).getTime() : 0;
        const isKickoffFuture = kickoffMs && (kickoffMs - Date.now() > 2 * 60 * 1000);

        const looksLive = (stateName === 'in' || status.isLive) && !isClockZeroOrSched && !isKickoffFuture && stateName !== 'post' && !status.completed && !type.completed;
        if (looksLive) {
            const clock = formatMatchClock(status, type);
            return { state: 'live', label: clock || 'Live', pillClass: 'in-play' };
        }
        if (stateName === 'post' || status.completed || type.completed) {
            const label = type.shortDetail || status.detail || 'FT';
            return { state: 'finished', label: /^\d{3,}$/.test(label) ? 'FT' : label, pillClass: 'post' };
        }
        const isKickoffPast = kickoffMs && (Date.now() - kickoffMs > 3 * 60 * 60 * 1000);
        if (isKickoffPast && !looksLive) {
            return { state: 'finished', label: 'Postp.', pillClass: 'post' };
        }
        const kickoffTime = formatTime(event?.date);
        return { state: 'scheduled', label: kickoffTime || status.detail || type.shortDetail || 'Upcoming', pillClass: 'pre' };
    }

    function setLoading(kind, loading) {
        if (elements[`${kind}-loading`]) elements[`${kind}-loading`].hidden = !loading;
        if (loading && elements[`${kind}-empty`]) elements[`${kind}-empty`].hidden = true;
    }

    function cleanCompetitionName(name) {
        if (!name) return '';
        let cleaned = String(name).trim();
        // Collapse duplicate adjacent words: e.g. "Friendlies Friendlies" -> "Friendlies"
        cleaned = cleaned.replace(/\b([A-Za-z]+)(?:\s+\1\b)+/gi, '$1');
        return cleaned;
    }

    const CLIENT_TOP_FLIGHT = {
        'ita.1': ['inter','milan','juventus','napoli','roma','lazio','atalanta','fiorentina','bologna','torino','genoa','cagliari','udinese','verona','empoli','monza','lecce','frosinone','sassuolo','como','parma','venezia','cremonese','pisa','salernitana','spezia','sampdoria'],
        'esp.1': ['real madrid','barcelona','atletico madrid','sevilla','real sociedad','villarreal','athletic bilbao','betis','osasuna','getafe','celta','levante','mallorca','girona','rayo','valencia','espanyol','alaves','elche','cadiz','granada','valladolid','leganes','las palmas','almeria'],
        'eng.1': ['arsenal','chelsea','liverpool','manchester city','manchester united','tottenham','newcastle','aston villa','brighton','west ham','crystal palace','fulham','brentford','wolves','everton','nottingham forest','bournemouth','southampton','leicester','ipswich','burnley','leeds'],
        'ger.1': ['bayern','dortmund','leverkusen','leipzig','stuttgart','frankfurt','wolfsburg','freiburg','hoffenheim','gladbach','mainz','augsburg','bremen','union berlin','bochum','heidenheim','st pauli','koln','schalke','hamburg'],
        'fra.1': ['psg','marseille','monaco','lyon','lille','nice','rennes','lens','strasbourg','nantes','montpellier','reims','toulouse','brest','angers','auxerre','le havre','saint etienne','metz'],
        'por.1': ['benfica','porto','sporting','braga','guimaraes','boavista','famalicao','moreirense','casa pia','estoril','arouca','rio ave','gil vicente','santa clara'],
        'ned.1': ['ajax','psv','feyenoord','az','twente','utrecht','heerenveen','groningen','sparta','willem ii','nec','go ahead eagles','fortuna sittard','heracles','zwolle'],
        'tur.1': ['galatasaray','fenerbahce','besiktas','trabzonspor','istanbul basaksehir','basaksehir','kasimpasa','sivasspor','alanyaspor','rizespor','caykur rizespor','antalyaspor','gaziantep','gaziantep fk','konyaspor','samsunspor','kayserispor','hatayspor','adana demirspor','goztepe','bodrum','eyupspor','pendikspor','karagumruk','istanbulspor','ankaragucu'],
        'bih.1': ['zrinjski','borac','sarajevo','velez','zeljeznicar','siroki brijeg','posusje','sloga doboj','igman konjic','radnik bijeljina','gosk gabela','sloboda tuzla'],
        'aut.1': ['salzburg','red bull salzburg','sturm graz','lask','rapid wien','austria wien','wolfsberger ac','wac','tsv hartberg','austria klagenfurt','blau-weiss linz','altach','wsg tirol','grazer ak','gak','austria lustenau','sv ried'],
        'kvx.1': ['ballkani','drita','prishtina','llapi','gjilani','ferizaj','dukagjini','malisheva','suhareka','fushe kosova','trepca 89']
    };

    const CLIENT_TEAM_COUNTRY_HINTS = [
        [/botosani|otelul|galati|cfr cluj|fcsb|sepsi|farul/i, 'rou'],
        [/al ahly|zamalek|pyramids|zed fc|\bzed\b|samanod|al masry|enppi/i, 'egy'],
        [/napredak|partizan|crvena zvezda|ofk bor|vojvodina|cukaricki/i, 'srb'],
        [/persija|persib|persebaya|arema|bali united|psm makassar|borneo/i, 'idn'],
        [/hvidovre|aarhus|brondby|midtjylland|nordsjaelland|randers|viborg|agf/i, 'den'],
        [/enugu rangers|rivers united|eyiimba|shooting stars|plateau united|remo stars/i, 'nga'],
        [/ballkani|drita|prishtina|llapi|gjilani|ferizaj|dukagjini|malisheva|suhareka|trep[cç]a/i, 'kvx'],
        [/liefering|stripfing|first vienna|fac wien|floridsdorfer|lafnitz|sv horn|amstetten|bregenz|voitsberg|kapfenberg/i, 'aut.2'],
        [/zvijezda 09|potkozarje|slavija sarajevo|drina zvornik|stupcanica|celik zenica|jedinstvo bihac|buducnost banovici/i, 'bih.2'],
        [/always ready|independiente petrolero|the strongest|bolivar|blooming|oriente petrolero|guabira|jorge wilstermann|nacional potosi|real tomayapo|real santa cruz|universitario de vinto|san antonio bulo bulo|royal pari|real oruro/i, 'bol'],
        [/inac kobe|cerezo osaka|urawa reds|tokyo verdy|omiya ardija|albirex niigata|parceiro|elfen saitama|nojima stella|mynavi sendai|nadeshiko|vissel kobe|gamba osaka|kawasaki frontale|yokohama f.?marinos|kashima antlers|nagoya grampus|machida zelvia/i, 'jpn'],
        [/leones negros|atletico morelia|atletico la paz|dorados de sinaloa|mineros de zacatecas|alebrijes|correcaminos|cancun fc|tapatio|venados|celaya|tepatitlan|cimarrones|tlaxcala|pumas\s*unam|tigres\s*uanl|club\s*america|chivas|guadalajara|monterrey|cruz\s*azul|santos\s*laguna|toluca|pachuca|necaxa|atlas|mazatlan|queretaro|tijuana|juarez/i, 'mex'],
    ];

    function clientTeamCountryConflict(slug, homeName, awayName) {
        const prefix = String(slug || '').split('.')[0];
        if (!prefix || /^(uefa|fifa|caf|afc|conmebol|concacaf|intl)/i.test(prefix)) return false;
        const blob = `${homeName || ''} ${awayName || ''}`;
        for (const [re, country] of CLIENT_TEAM_COUNTRY_HINTS) {
            if (re.test(blob) && country !== prefix) return true;
        }
        return false;
    }

    function clientHasTopFlightClub(slug, homeName, awayName) {
        const sLower = String(slug || '').toLowerCase();
        const list = CLIENT_TOP_FLIGHT[sLower];
        if (!list) return true;
        const norm = (n) => cleanTeamNameForDedup(n || '');
        const hit = (n) => {
            const x = norm(n);
            if (!x) return false;
            if (sLower === 'bih.1' && (x.includes('slavija') || x.includes('zvijezda09') || x.includes('potkozarje'))) return false;
            if (sLower === 'tur.1' && (x.includes('iskenderun') || x.includes('erbaaspor') || x.includes('musspor') || x.includes('fethiye'))) return false;
            if (sLower === 'aut.1' && (x.includes('liefering') || x.includes('stripfing') || x.includes('firstvienna') || x.includes('facwien'))) return false;
            return list.some(c => {
                const cn = c.replace(/\s+/g, '');
                return x === cn || x.includes(cn) || cn.includes(x);
            });
        };
        return hit(homeName) || hit(awayName);
    }

    function isReserveOrBTeam(name = '') {
        const s = String(name || '').trim();
        if (!s) return false;
        if (/\bfortuna sittard\b/i.test(s)) return false;
        // Olympiacos B, Real Madrid II, Team Reserves, U21/U23, Primavera, Castilla
        if (/\b(u-?2[0-3]|u-?1[5-9]|youth|primavera|reserves?|development|academy)\b/i.test(s)) return true;
        if (/\s+[bB]$/.test(s) || /\s+II$/i.test(s) || /\s+2$/.test(s)) return true;
        if (/\(b\)|\(ii\)|\(res\)/i.test(s)) return true;
        if (/\b(castilla|atl[eè]tic|fortuna|promesas|fabril|vetusta|filial)\b/i.test(s)) return true;
        return false;
    }

    const _cleanTeamNameCache = new Map();
    function cleanTeamNameForDedup(name) {
        if (!name) return '';
        const rawKey = String(name);
        if (_cleanTeamNameCache.has(rawKey)) return _cleanTeamNameCache.get(rawKey);
        const raw = rawKey.trim();
        const originalAlphanumeric = raw
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '');

        let s = (name || '')
            .toLowerCase()
            .replace(/ø/g, 'o')
            .replace(/æ/g, 'ae')
            .replace(/ß/g, 'ss')
            .replace(/đ/g, 'd')
            .replace(/ł/g, 'l')
            .replace(/ð/g, 'd')
            .replace(/þ/g, 'th')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\bunited\s+states(?:\s+of\s+america)?\b|\bu\.?s\.?a\.?\b/g, 'usa')
            .replace(/\bsouth\s+korea\b|\bkorea\s+republic\b/g, 'southkorea')
            .replace(/\bnorth\s+korea\b|\bkorea\s+dpr\b/g, 'northkorea')
            .replace(/\bivory\s+coast\b|\bcote\s*d['’ ]?ivoire\b/g, 'ivorycoast')
            .replace(/\bczech\s+republic\b|\bczechia\b/g, 'czechia')
            .replace(/\bunited\s+arab\s+emirates\b|\bu\.?a\.?e\.?\b/g, 'uae')
            .replace(/\btrinidad\s*(?:and|&)\s*tobago\b/g, 'trinidadtobago')
            .replace(/\b(?:st\.?|saint)\s+vincent(?:\s*(?:and|&)\s*the\s+grenadines)?\b/g, 'saintvincent')
            .replace(/\b(?:sporting\s+club\s+delhi|sc\s+delhi|hyderabad(?:\s+fc)?)\b/g, 'scdelhi')
            .replace(/\b([a-z])\.([a-z])\.([a-z])\.?/gi, '$1$2$3 ')
            .replace(/\b([a-z])\.([a-z])\.?/gi, '$1$2 ')
            .replace(/\bst[.]?\s+/gi, 'saint ')
            .replace(/\bst[-]/gi, 'saint-')
            .replace(/aa/g, 'a')
            .replace(/ae/g, 'a')
            .replace(/oe/g, 'o')
            .replace(/\([^)]*\)/g, ' ')
            .replace(/\b(18\d{2}|19\d{2}|20\d{2})\b/g, '')
            .replace(/\b(04|05|96|98)\b/g, '')
            .replace(/\b(women|woman|ladies|femenin[oa]?|frauen|damen|vrouwen|fem|wfc)\b|\(w\)/gi, ' ')
            .replace(/\s+[wW]$/g, ' ')
            .replace(/\b[wW]\b/g, ' ')
            .replace(/\b(u-?23|u-?21|u-?20|u-?19|u-?18|u-?17|u-?16|u-?15|youth|reserves?|development)\b/gi, ' ')
            .replace(/\b(ii|iii|iv)\b/gi, ' ')
            .replace(/\s+[bB]$/g, ' ')
            .replace(/\b(rc\s+)?deportivo\s+(la\s+)?coru[nñ]a(\s+abanca)?\b/gi, 'deportivo')
            .replace(/\bdeportivo\s+abanca\b/gi, 'deportivo')
            .replace(/\bmadrid\s+c\.?f\.?f?\.?\b/gi, 'madridcff')
            .replace(/\bdux\s+logro[nñ]o\b|\blogro[nñ]o\s+femenino\b/gi, 'logrono')
            .replace(/\bsport\s+boys(\s+association)?\b/gi, 'sportboys')
            .replace(/\bcomerciantes\s+unidos\b/gi, 'comerciantesunidos')
            .replace(/\buniversitario(\s+de\s+deportes)?\b/gi, 'universitario')
            .replace(/\bparis\s+13(\s+atletico)?\b/gi, 'paris13')
            .replace(/\bred\s+star(\s+fc)?\b/gi, 'redstar')
            .replace(/\baf\s+vire\b|\bvire\b/gi, 'vire')
            .replace(/\b(us\s+)?saint[- ]omer\b/gi, 'saintomer')
            .replace(/\bstade\s+lavallois\b|\blaval\b/gi, 'laval')
            .replace(/\bsantos\s+laguna\b/g, 'santos')
            .replace(/\batl[^\s]*tico\b/gi, 'atletico')
            .replace(/\binternazionale\b|\binter\s+milan\b|\binter\b/g, 'inter')
            .replace(/\bcomo\s+1907\b|\bcalcio\s+como\b/g, 'como')
            .replace(/\bfeyenoord\s+rotterdam\b/g, 'feyenoord')
            .replace(/\bsc\s+heerenveen\b/g, 'heerenveen')
            .replace(/\bclub\s+sport\s+herediano\b|\bcs\s+herediano\b/g, 'herediano')
            .replace(/\binter\s+de\s+san\s+carlos\b|\binter\s+san\s+carlos\b/g, 'intersancarlos')
            .replace(/\bantigua\s+gfc\b|\bantigua\s+guatemala\b/g, 'antigua')
            .replace(/\bcd\s+malacateco\b|\bdeportivo\s+malacateco\b/g, 'malacateco')
            .replace(/\balianza\s+fc\s+valledupar\b|\balianza\s+valledupar\b|\balianza\s+fc\b/g, 'alianza')
            .replace(/\bvaalerenga\b|\bvalerenga\b/g, 'valerenga')
            .replace(/\bkristiansund\s+bk\b/g, 'kristiansund')
            .replace(/\btecnico\s+universitario\b/g, 'tecnicouniversitario')
            .replace(/\bmanta\s+f\.?c\.?\b/g, 'manta')
            .replace(/\bcd\s+sabadell\b/g, 'sabadell')
            .replace(/\breal\s+sociedad\s+(b|ii)\b/g, 'realsociedadb')
            .replace(/\b(rc\s+)?celta(\s+vigo)?(\s+b|\s+fortuna)?\b/gi, 'celtab')
            .replace(/\b(cd\s+)?(ut\s+cajamarca|utc|u\.t\.c\.|univ(\.|ersidad)?\s+tecnica\s+de\s+cajamarca)\b/gi, 'utc')
            .replace(/\b(adt|asoc(\.|iacion)?\s+deportiva\s+tarma)\b/gi, 'adt')
            .replace(/\blos\s+chankas(\s+cyc)?\b/gi, 'loschankas')
            .replace(/\b(cd\s+|deportivo\s+)?moquegua\b/gi, 'moquegua')
            .replace(/\b(atletico\s+)?grau\b/gi, 'grau')
            .replace(/\bbosnia\s*(?:and|-|&)\s*herzegovina\b/gi, 'bosniaherzegovina')
            .replace(/\bbosnia\s+herzegovina\b/gi, 'bosniaherzegovina')
            .replace(/\bcyc\b/gi, ' ')
            .replace(/\bmilton\s+keynes\s+dons\b|\bmk\s+dons\b/g, 'mkdons')
            .replace(/\bbrentford\s+(u21|u-21|academy|b)\b/g, 'brentfordu21')
            .replace(/\bmiddlesbrough\s+(u21|u-21|academy|b)\b/g, 'middlesbroughu21')
            .replace(/\bderby\s+county\s+(u21|u-21|academy|b)\b/g, 'derbycountyu21')
            .replace(/\bal\s+mokawloon(\s+al\s+arab)?\b/g, 'almokawloon')
            .replace(/\blogroñ[eé]s\b|\blogrones\b/g, 'logrones')
            .replace(/\bamorebieta\b/g, 'amorebieta')
            .replace(/\bpumas(\s+unam)?\b/g, 'pumas')
            .replace(/\btigres(\s+uanl)?\b/g, 'tigres')
            .replace(/\bguadalajara\b|\bchivas\b/g, 'chivas')
            .replace(/\bju[aá]rez\b/g, 'juarez')
            .replace(/\bisidro\s+metap[aá]n\b/g, 'metapan')
            .replace(/\b(cd\s+)?platense(\s+municipal)?\b/g, 'platense')
            .replace(/\blondrina(\s+ec)?\b/g, 'londrina')
            .replace(/\bn[aá]utico\b/g, 'nautico')
            .replace(/\bh[aä]cken\b/g, 'hacken')
            .replace(/\bparis\s+(saint[- ]?germain|sg)\b/g, 'psg')
            .replace(/\bmanchester\s+city\b/g, 'mancity')
            .replace(/\bbayern(\s+munich|\s+munchen)?\b/g, 'bayern')
            .replace(/\bdijon\s+(fco|football\s+cote-d.or)\b/g, 'dijon')
            .replace(/\borleans\s+(us|loiret)?\b/g, 'orleans')
            .replace(/\bla\s+roche(-sur-yon)?(\s+vf)?\b/g, 'laroche')
            .replace(/\b(us\s+)?(saint[- ]?)?philbert(-de-grand-lieu|\s+de\s+grandlieu|\s+de\s+grand-lieu)?\b/g, 'philbert')
            .replace(/\bis[- ]selongey(\s+football)?\b/g, 'selongey')
            .replace(/\b(club|clube|csd|deportivo|fc|cf|sc|ac|cd|sd|ceif|afc|fk|sk|sv|ssc|as|rc|ud|rb|calcio|sad|sa|sport|gfc|bk|cf|fco|vf|us|cs|ca|ogc|sco|sm|tfc|hac|so|es|sd|ad|ce|asptt|uc)\b/gi, ' ')
            .replace(/\b(de\s+)?(junin|resistencia|cordoba|la\s+plata|valledupar|guatemala|sur-yon|de-grand-lieu|grandlieu)\b/gi, '')
            .replace(/[^a-z0-9]/g, '');

        if (s.length < 2) {
            s = originalAlphanumeric;
        }
        if (_cleanTeamNameCache.size > 4000) _cleanTeamNameCache.clear();
        _cleanTeamNameCache.set(rawKey, s);
        return s;
    }

    function signatureFuzzyMatch(sigA, sigB) {
        // sig form: home_vs_away_date[_w][_youth]
        if (!sigA || !sigB || sigA === sigB) return sigA === sigB;
        const parse = (sig) => {
            const parts = String(sig).split('_');
            // last token may be date or youth; find _vs_
            const m = String(sig).match(/^(.+)_vs_(.+?)_(\d{4}-\d{2}-\d{2}|\d{8}|live)(.*)$/);
            if (m) return { h: m[1], a: m[2], d: m[3], rest: m[4] || '' };
            return null;
        };
        const A = parse(sigA);
        const B = parse(sigB);
        if (!A || !B) return false;
        if (A.d !== B.d) return false;
        if (A.rest.includes('youth') !== B.rest.includes('youth')) return false;
        if (A.rest.includes('_w') !== B.rest.includes('_w')) return false;
        // teams match either orientation
        const sameWay = teamNamesFuzzyEqual(A.h, B.h) && teamNamesFuzzyEqual(A.a, B.a);
        const swapWay = teamNamesFuzzyEqual(A.h, B.a) && teamNamesFuzzyEqual(A.a, B.h);
        return sameWay || swapWay;
    }

    function teamNamesFuzzyEqual(a, b) {
        if (!a || !b) return false;
        if (a === b) return true;
        if ((a === 'utc' && (b === 'utc' || b.includes('utc') || b.includes('cajamarca'))) || (b === 'utc' && (a === 'utc' || a.includes('utc') || a.includes('cajamarca')))) return true;
        if ((a === 'adt' && (b === 'adt' || b.includes('adt') || b.includes('tarma'))) || (b === 'adt' && (a === 'adt' || a.includes('adt') || a.includes('tarma')))) return true;
        if ((a === 'celtab' && b === 'celtab') || (a.includes('celta') && b.includes('celta') && (a.includes('fortuna') || b.includes('fortuna') || a.includes('b') || b.includes('b')))) return true;
        const shorter = a.length <= b.length ? a : b;
        const longer = a.length > b.length ? a : b;
        if (shorter.length >= 4 && (longer.startsWith(shorter) || longer.includes(shorter))) return true;
        if (shorter.length >= 6 && longer.length >= 6 && Math.abs(longer.length - shorter.length) <= 2) {
            if (longer.includes(shorter.slice(0, 6)) || shorter.includes(longer.slice(0, 6))) return true;
        }
        return false;
    }


    function getEventMatchTierClient(ev) {
        const { home, away } = competitorsFromEvent(ev);
        const hName = home.team?.displayName || home.team?.name || ev.home?.name || '';
        const aName = away.team?.displayName || away.team?.name || ev.away?.name || '';
        const slug = ev.league?.slug || ev.league_slug || '';
        const leagueName = ev.league?.name || ev.note || '';
        const s = `${hName} ${aName} ${slug} ${leagueName}`.toLowerCase();

        const isWomen = /\b(women|woman|ladies|femenin[oa]?|frauen|damen|vrouwen|fem|wfc|w|wsl|nwsl|uwcl)\b|\(w\)/i.test(s) ||
                        s.includes('liga f') || s.includes('femenil') || s.includes('damallsvenskan') || s.includes('toppserien') ||
                        s.includes('wchampions') || s.includes('weuro') || s.includes('wwc') || s.includes('arkema') ||
                        s.includes('.w.') || s.startsWith('w.') || s.endsWith('.w');
        const isYouth = /\b(u-?23|u-?21|u-?20|u-?19|u-?18|u-?17|u-?16|u-?15|youth|primavera|reserves?|development)\b/i.test(s) ||
                        s.includes('youth') || s.includes('u21') || s.includes('u23') || s.includes('u20') || s.includes('u19') || s.includes('u18') || s.includes('u17') || s.includes('primavera');
        return `${isWomen ? 'w' : 'm'}_${isYouth ? 'y' : 's'}`;
    }

    function getPairBaseKey(ev) {
        const { home, away } = competitorsFromEvent(ev);
        const hName = cleanTeamNameForDedup(home.team?.displayName || home.team?.name || ev.home?.name || '');
        const aName = cleanTeamNameForDedup(away.team?.displayName || away.team?.name || ev.away?.name || '');
        if (!hName && !aName) return '';
        const tier = getEventMatchTierClient(ev);
        const isYouth = tier.endsWith('_y');
        const isWomen = tier.startsWith('w_') || tier.includes('women');
        return [hName, aName].sort().join('_vs_') + (isWomen ? '_w' : '') + (isYouth ? '_youth' : '');
    }

    function getEventDedupSignature(ev) {
        const pairKey = getPairBaseKey(ev);
        if (!pairKey) {
            return String(ev.id || Math.random());
        }
        // Normalize date key to YYYY-MM-DD always (scoreboardDate may be YYYYMMDD)
        let dKey = '';
        const rawDate = ev.scoreboardDate || ev.date || '';
        if (rawDate) {
            const s = String(rawDate);
            if (/^\d{8}$/.test(s)) {
                dKey = `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
            } else if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
                dKey = s.slice(0, 10);
            } else {
                try {
                    const d = new Date(s);
                    if (!isNaN(d.getTime())) dKey = d.toISOString().slice(0, 10);
                    else dKey = s.slice(0, 10);
                } catch (_) {
                    dKey = s.slice(0, 10);
                }
            }
        }
        const isLive = (ev.status?.state === 'in' || ev.status?.isLive) && !/FT|Final|NS|Sched|Upcoming/i.test(String(ev.status?.clock || '')) && String(ev.status?.clock || '').trim() !== "0'" && String(ev.status?.clock || '').trim() !== '0';
        if (isLive) dKey = 'live';
        return pairKey + '_' + dKey;
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
        const isLiveBonus = (ev.status?.state === 'in' || ev.status?.isLive) && !/FT|Final|Postp|Canc/i.test(String(ev.status?.clock || '')) ? 15 : 0;
        const isCompletedBonus = (ev.status?.completed || ev.status?.state === 'post' || /FT|Final|AET|AP/i.test(String(ev.status?.clock || ev.status?.detail || ''))) ? 12 : 0;
        return hasEspnLogo + hasCanonicalId + hasSpecificSlug + isWomen + hasClock + isLiveBonus + isCompletedBonus;
    }

    function deduplicateMatchesList(matchList) {
        if (!Array.isArray(matchList) || !matchList.length) return [];
        // Pass 0: exact id uniqueness (fixes same event listed twice in /live)
        const byId = new Map();
        for (const m of matchList) {
            const id = String(m?.id || m?.uid || m?.source?.event_id || '').trim();
            if (!id) continue;
            const score = getEventQualityScore(m);
            if (!byId.has(id) || score > (byId.get(id)._q || 0)) {
                m._q = score;
                byId.set(id, m);
            }
        }
        const idFiltered = matchList.filter((m) => {
            const id = String(m?.id || m?.uid || m?.source?.event_id || '').trim();
            if (!id) return true;
            return byId.get(id) === m || byId.get(id)?.id === m.id;
        });
        // Prefer the winning id instance only once
        const onceIds = new Set();
        matchList = idFiltered.filter((m) => {
            const id = String(m?.id || m?.uid || m?.source?.event_id || '').trim();
            if (!id) return true;
            if (onceIds.has(id)) return false;
            const best = byId.get(id);
            if (best && best !== m) return false;
            onceIds.add(id);
            return true;
        });

        const mergeMatches = (winner, secondary) => {
            const secIsLive = secondary.status?.isLive || secondary.status?.state === 'in';
            const winIsLive = winner.status?.isLive || winner.status?.state === 'in';
            const secIsCompleted = secondary.status?.completed || secondary.status?.state === 'post' || /FT|Final|AET|AP/i.test(String(secondary.status?.detail || secondary.status?.clock || ''));
            const winIsCompleted = winner.status?.completed || winner.status?.state === 'post' || /FT|Final|AET|AP/i.test(String(winner.status?.detail || winner.status?.clock || ''));

            if (secIsLive && !winIsLive && !winIsCompleted) {
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
                winner.status.state = 'in';
                winner.status.isLive = true;
            } else if (secIsCompleted && !winIsCompleted) {
                if (!winner.status) winner.status = {};
                winner.status.state = 'post';
                winner.status.completed = true;
                winner.status.isLive = false;
                winner.status.detail = secondary.status?.detail || 'FT';
                winner.status.clock = secondary.status?.clock || 'FT';
                const secHomeScore = secondary.home?.score ?? secondary.competitions?.[0]?.competitors?.[0]?.score;
                const secAwayScore = secondary.away?.score ?? secondary.competitions?.[0]?.competitors?.[1]?.score;
                if (secHomeScore !== undefined && winner.home) winner.home.score = secHomeScore;
                if (secAwayScore !== undefined && winner.away) winner.away.score = secAwayScore;
                if (winner.home && secondary.home?.winner !== undefined) winner.home.winner = secondary.home.winner;
                if (winner.away && secondary.away?.winner !== undefined) winner.away.winner = secondary.away.winner;
            }
            if (secondary.source?.livescore_id && !winner.source?.livescore_id) {
                if (!winner.source) winner.source = {};
                winner.source.livescore_id = secondary.source.livescore_id;
            }

            // Merge crest logos so neither club loses its logo
            const { home: wH, away: wA } = competitorsFromEvent(winner);
            const { home: sH, away: sA } = competitorsFromEvent(secondary);
            if ((!wH.team?.logo || /placeholder|default.?crest|unknown/i.test(wH.team.logo)) && sH.team?.logo) {
                if (wH.team) wH.team.logo = sH.team.logo;
                if (winner.home) winner.home.logo = sH.team.logo;
            } else if (wH.team?.logo && sH.team?.logo && sH.team.logo.includes('espncdn') && !wH.team.logo.includes('espncdn')) {
                if (wH.team) wH.team.logo = sH.team.logo;
                if (winner.home) winner.home.logo = sH.team.logo;
            }

            if ((!wA.team?.logo || /placeholder|default.?crest|unknown/i.test(wA.team.logo)) && sA.team?.logo) {
                if (wA.team) wA.team.logo = sA.team.logo;
                if (winner.away) winner.away.logo = sA.team.logo;
            } else if (wA.team?.logo && sA.team?.logo && sA.team.logo.includes('espncdn') && !wA.team.logo.includes('espncdn')) {
                if (wA.team) wA.team.logo = sA.team.logo;
                if (winner.away) winner.away.logo = sA.team.logo;
            }
            return winner;
        };

        const seenMap = new Map();
        const pairMap = new Map();
        const tokenBuckets = new Map();
        const addToBuckets = (pKey, hName, aName) => {
            const keys = [hName.slice(0, 3), aName.slice(0, 3)].filter(k => k.length >= 2);
            for (const k of keys) {
                let arr = tokenBuckets.get(k);
                if (!arr) { arr = []; tokenBuckets.set(k, arr); }
                arr.push(pKey);
            }
        };

        for (const m of matchList) {
            const sig = getEventDedupSignature(m);
            const pairBase = getPairBaseKey(m);
            const score = getEventQualityScore(m);
            const mTier = getEventMatchTierClient(m);
            const { home: mH, away: mA } = competitorsFromEvent(m);
            const mHName = cleanTeamNameForDedup(mH.team?.displayName || mH.team?.name || m.home?.name || '');
            const mAName = cleanTeamNameForDedup(mA.team?.displayName || mA.team?.name || m.away?.name || '');
            const mTime = m.date ? new Date(m.date).getTime() : 0;

            // 1. Check pairBase collapse (O(1) exact + bucketed fuzzy lookup — zero main-thread freeze)
            let matchedPairKey = null;
            if (pairBase && pairMap.has(pairBase)) {
                matchedPairKey = pairBase;
            } else if (pairBase) {
                const candidateKeys = new Set();
                const b1 = mHName.length >= 2 ? tokenBuckets.get(mHName.slice(0, 3)) : null;
                const b2 = mAName.length >= 2 ? tokenBuckets.get(mAName.slice(0, 3)) : null;
                if (b1) for (let i = 0; i < b1.length; i++) candidateKeys.add(b1[i]);
                if (b2) for (let i = 0; i < b2.length; i++) candidateKeys.add(b2[i]);

                for (const pKey of candidateKeys) {
                    const pEntry = pairMap.get(pKey);
                    if (!pEntry) continue;
                    if (signatureFuzzyMatch(sig, pEntry.sig)) {
                        matchedPairKey = pKey;
                        break;
                    }
                    if (mTier === pEntry.tier) {
                        if ((teamNamesFuzzyEqual(mHName, pEntry.hName) && teamNamesFuzzyEqual(mAName, pEntry.aName)) ||
                            (teamNamesFuzzyEqual(mHName, pEntry.aName) && teamNamesFuzzyEqual(mAName, pEntry.hName))) {
                            const eitherLive = (m.status?.state === 'in' || m.status?.isLive || pEntry.item.status?.state === 'in' || pEntry.item.status?.isLive);
                            const closeInTime = (mTime && pEntry.time) ? Math.abs(mTime - pEntry.time) <= 36 * 3600 * 1000 : true;
                            if (eitherLive || closeInTime) {
                                matchedPairKey = pKey;
                                break;
                            }
                        }
                    }
                }
            }

            if (matchedPairKey) {
                const existing = pairMap.get(matchedPairKey);
                const exItem = existing.item;
                const eitherLive = (m.status?.state === 'in' || m.status?.isLive || exItem.status?.state === 'in' || exItem.status?.isLive);
                const closeInTime = (mTime && existing.time) ? Math.abs(mTime - existing.time) <= 36 * 3600 * 1000 : true;

                if (eitherLive || closeInTime) {
                    const winner = score > existing.score ? m : exItem;
                    const secondary = score > existing.score ? exItem : m;
                    const merged = mergeMatches(winner, secondary);
                    const newScore = Math.max(existing.score, score);
                    pairMap.set(matchedPairKey, { ...existing, item: merged, score: newScore });
                    seenMap.set(existing.sig, { item: merged, score: newScore });
                    continue;
                }
            }

            if (pairBase && !pairMap.has(pairBase)) {
                pairMap.set(pairBase, { item: m, score, sig, tier: mTier, hName: mHName, aName: mAName, time: mTime });
                addToBuckets(pairBase, mHName, mAName);
            }

            // 2. Signature match
            if (!sig || sig === '_vs_') {
                seenMap.set(`m_${m.id || Math.random()}`, { item: m, score: 0 });
                continue;
            }

            if (!seenMap.has(sig)) {
                let matchedSig = null;
                for (const [sKey] of seenMap.entries()) {
                    if (signatureFuzzyMatch(sig, sKey)) {
                        matchedSig = sKey;
                        break;
                    }
                }
                if (matchedSig) {
                    const existing = seenMap.get(matchedSig);
                    const winner = score > existing.score ? m : existing.item;
                    const secondary = score > existing.score ? existing.item : m;
                    const merged = mergeMatches(winner, secondary);
                    const newScore = Math.max(existing.score, score);
                    seenMap.set(matchedSig, { item: merged, score: newScore });
                    if (pairBase) pairMap.set(pairBase, { item: merged, score: newScore, sig: matchedSig });
                    continue;
                }
                const entry = { item: m, score, sig };
                seenMap.set(sig, entry);
                if (pairBase) pairMap.set(pairBase, entry);
            } else {
                const existing = seenMap.get(sig);
                const winner = score > existing.score ? m : existing.item;
                const secondary = score > existing.score ? existing.item : m;
                const merged = mergeMatches(winner, secondary);
                const newScore = Math.max(existing.score, score);
                seenMap.set(sig, { item: merged, score: newScore });
                if (pairBase) pairMap.set(pairBase, { item: merged, score: newScore, sig });
            }
        }
        return Array.from(seenMap.values()).map(v => v.item);
    }

    const CLIENT_LEAGUE_PRIORITY = {
        // Tier 1: Global Premier & European Big 5 Top Flights
        'uefa.champions': 1000,
        'eng.1': 990,
        'esp.1': 980,
        'ita.1': 970,
        'ger.1': 960,
        'fra.1': 950,
        'uefa.europa': 940,
        'uefa.europa.conf': 930,
        'fifa.world': 925,
        'uefa.euro': 920,
        'uefa.super_cup': 915,
        'caf.nations': 910,
        'conmebol.america': 905,
        'concacaf.nations': 900,

        // Tier 2: Worldwide Senior Top-Flight Domestic Leagues (.1) & Premier Continental Cups
        'ned.1': 890,
        'por.1': 885,
        'bra.1': 880,
        'arg.1': 875,
        'nga.1': 870,
        'ksa.1': 865,
        'sau.1': 865,
        'mex.1': 860,
        'tur.1': 855,
        'bel.1': 850,
        'sco.1': 845,
        'usa.1': 840,
        'col.1': 835,
        'rus.1': 830,
        'caf.champions': 825,
        'conmebol.libertadores': 820,
        'afc.champions': 815,
        'uefa.wchampions': 810,
        'aut.1': 805,
        'sui.1': 800,
        'den.1': 795,
        'swe.1': 790,
        'nor.1': 785,
        'gre.1': 780,
        'pol.1': 775,
        'ukr.1': 770,
        'cze.1': 765,
        'cro.1': 760,
        'srb.1': 755,
        'rou.1': 750,
        'egy.1': 745,
        'rsa.1': 740,
        'mar.1': 735,
        'gha.1': 730,
        'ken.1': 725,
        'tza.1': 720,
        'jpn.1': 715,
        'kor.1': 710,
        'aus.1': 705,
        'chn.1': 700,
        'ind.1': 695,
        'per.1': 690,
        'uru.1': 685,
        'chi.1': 680,
        'ecu.1': 675,
        'bol.1': 670,
        'eng.w.1': 665,
        'esp.w.1': 660,
        'usa.nwsl': 655,
        'jpn.w.1': 652,

        // Tier 3: Major Domestic & Secondary Continental Cups
        'eng.fa': 640,
        'esp.copa_del_rey': 635,
        'ita.coppa_italia': 630,
        'ger.dfb_pokal': 625,
        'fra.coupe_de_france': 620,
        'eng.league_cup': 615,
        'caf.confed': 610,
        'conmebol.sudamericana': 605,
        'bol.copa': 580,

        // Tier 4: Second-Division Leagues (.2) — strictly below all top-flight leagues
        'eng.2': 500,
        'esp.2': 495,
        'ger.2': 490,
        'ita.2': 485,
        'fra.2': 480,
        'ned.2': 475,
        'bra.2': 470,
        'por.2': 465,
        'mex.2': 460
    };

    function getLeaguePriorityClient(slug = '') {
        if (!slug) return 200;
        const cleanSlug = String(slug).toLowerCase().trim();
        if (CLIENT_LEAGUE_PRIORITY[cleanSlug]) return CLIENT_LEAGUE_PRIORITY[cleanSlug];
        if (cleanSlug.includes('youth') || cleanSlug.includes('u21') || cleanSlug.includes('u19') || cleanSlug.includes('u23')) return 120;
        if (cleanSlug.includes('friendly') || cleanSlug === 'club.friendly') return 50;
        // Any remaining senior top-flight (.1) league ALWAYS ranks above 2nd/lower tiers
        if (cleanSlug.endsWith('.1') && !cleanSlug.includes('.w.')) return 650;
        if (cleanSlug.endsWith('.w.1')) return 645;
        if (cleanSlug.endsWith('.2')) return 420;
        if (cleanSlug.endsWith('.3') || cleanSlug.endsWith('.4') || cleanSlug.endsWith('.5') || cleanSlug.endsWith('.lower')) return 300;
        return 350;
    }

    function enrichLeagueMeta(league, ev = null) {
        let slug = league?.slug || ev?.league_slug || 'other';
        let name = cleanCompetitionName(league?.name || ev?.note || 'Competition');
        let country = league?.country || '';

        const lowerName = name.toLowerCase();
        const lowerSlug = slug.toLowerCase();
        const allEvText = `${ev?.name || ''} ${ev?.home?.name || ''} ${ev?.away?.name || ''} ${name || ''} ${country || ''}`.toLowerCase();
        const CONCACAF_NATIONS_RE = /\b(curacao|curaçao|panama|bermuda|saint\s*lucia|st\.?\s*lucia|puerto\s*rico|dominica|dominican\s*republic|grenada|saint\s*kitts|st\.?\s*kitts|saint\s*martin|st\.?\s*martin|sint\s*maarten|el\s*salvador|jamaica|haiti|trinidad|costa\s*rica|honduras|guatemala|suriname|guyana|barbados|aruba|antigua|belize|bahamas|cayman|anguilla|turks|bonaire|nicaragua|cuba|martinique|guadeloupe)\b/i;

        // 0. Continental and international Nations League mapping (CONCACAF vs AFCON vs UEFA vs Asian SAFF)
        if (lowerName.includes('saff championship') || (lowerName.includes('saff') && !lowerName.includes('staff')) || allEvText.includes('saff') || ((lowerSlug.startsWith('eng.') || lowerSlug === 'other') && (allEvText.includes('india vs bhutan') || allEvText.includes('bhutan vs india')))) {
            slug = 'afc.saff';
            name = 'SAFF Championship';
            country = 'Asia';
        } else if (lowerName.includes('concacaf nations') || (lowerName.includes('concacaf') && lowerName.includes('nations')) || ((lowerName.includes('nations league') || lowerSlug.includes('nations')) && CONCACAF_NATIONS_RE.test(allEvText))) {
            slug = 'concacaf.nations';
            name = 'CONCACAF Nations League';
            country = 'International';
        } else if (slug === 'caf.nations' && CONCACAF_NATIONS_RE.test(allEvText)) {
            slug = 'concacaf.nations';
            name = 'CONCACAF Nations League';
            country = 'International';
        }

        // 0b. Spanish RFEF tiers and Serbian Prva Liga corrections
        if (lowerName.includes('primera division rfef') || lowerName.includes('primera federacion') || lowerName.includes('1ª rfef') || lowerName.includes('1. federacion') || ((lowerSlug === 'mex.lower' || lowerSlug === 'esp.lower') && (allEvText.includes('coria') || allEvText.includes('unionistas') || allEvText.includes('deportivo fabril') || allEvText.includes('ourense') || allEvText.includes('barakaldo')))) {
            slug = 'esp.3';
            name = 'Spanish Primera Federación';
            country = 'Spain';
        } else if ((lowerName.includes('prva liga') || lowerSlug === 'srb.lower') && (lowerName.includes('serbia') || lowerSlug.startsWith('srb') || allEvText.includes('serbia') || allEvText.includes('dubocica') || allEvText.includes('proleter'))) {
            slug = 'srb.lower';
            name = 'Serbian Prva Liga';
            country = 'Serbia';
        }

        // 0c. Peruvian Liga 1 correction
        const isPeru = lowerSlug === 'per.1' || lowerName.includes('peru') || (lowerName.includes('liga 1') && (lowerName.includes('te apuesto') || allEvText.includes('peru') || allEvText.includes('comerciantes unidos') || allEvText.includes('sport boys') || allEvText.includes('universitario') || allEvText.includes('alianza lima') || allEvText.includes('sporting cristal') || allEvText.includes('melgar') || allEvText.includes('cusco') || allEvText.includes('cienciano') || allEvText.includes('vallejo') || allEvText.includes('chankas') || allEvText.includes('ad tarma') || allEvText.includes('grau')));
        if (isPeru || ((lowerSlug === 'idn.1' || lowerSlug === 'other') && (allEvText.includes('sport boys') || allEvText.includes('comerciantes unidos') || allEvText.includes('universitario') || allEvText.includes('peru')))) {
            slug = 'per.1';
            name = 'Peruvian Liga 1';
            country = 'Peru';
        }

        // 0d. Romanian SuperLiga correction
        const isRomania = lowerSlug === 'rou.1' || (lowerName.includes('superliga') && (allEvText.includes('romania') || allEvText.includes('uta arad') || allEvText.includes('fcsb') || allEvText.includes('cluj') || allEvText.includes('craiova') || allEvText.includes('dinamo bucuresti') || allEvText.includes('rapid bucuresti') || allEvText.includes('farul') || allEvText.includes('hermannstadt') || allEvText.includes('petrolul') || allEvText.includes('botosani')));
        if (isRomania || ((lowerSlug === 'idn.1' || lowerSlug === 'other') && (allEvText.includes('uta arad') || allEvText.includes('fcsb') || allEvText.includes('cluj') || allEvText.includes('craiova') || allEvText.includes('romania')))) {
            slug = 'rou.1';
            name = 'Romanian SuperLiga';
            country = 'Romania';
        }

        // 0e. Coupe de France unification
        if (lowerName.includes('coupe de france') || lowerSlug === 'fra.coupe_de_france' || lowerSlug.startsWith('fra.coupe') || ((lowerSlug === 'srb.1' || lowerSlug === 'fra.1' || lowerSlug === 'other') && (allEvText.includes('coupe de france') || allEvText.includes('paris 13') || allEvText.includes('red star fc') || allEvText.includes('stade lavallois') || allEvText.includes('af vire') || allEvText.includes('st-omer') || allEvText.includes('saint-omer') || allEvText.includes('bourges')))) {
            slug = 'fra.coupe_de_france';
            name = 'Coupe de France';
            country = 'France';
        }

        // 0f. Bosnian leagues
        const isYouthOrIntl = /\b(u-?23|u-?21|u-?20|u-?19|u-?18|u-?17|youth|international|friendly|friendlies)\b/i.test(allEvText);
        if (!isYouthOrIntl && (lowerSlug.startsWith('bih') || allEvText.includes('zeljeznicar') || allEvText.includes('sarajevo') || allEvText.includes('borac banja luka') || allEvText.includes('zrinjski') || allEvText.includes('velez mostar') || allEvText.includes('siroki brijeg') || (allEvText.includes('bosnia') && !allEvText.includes('montenegro') && !allEvText.includes('u21')))) {
            country = 'Bosnia and Herzegovina';
            if (lowerName.includes('prva liga') || lowerSlug === 'bih.2' || allEvText.includes('prva liga')) {
                slug = 'bih.2';
                name = 'Bosnian Prva Liga';
            } else {
                slug = 'bih.1';
                name = 'Bosnian Premier League';
            }
        } else if (isYouthOrIntl && (allEvText.includes('u21') || allEvText.includes('u-21')) && (allEvText.includes('bosnia') || allEvText.includes('montenegro'))) {
            slug = 'intl.u21';
            name = 'Under-21 International';
            country = 'International';
        }

        // 1. Identify domestic women's leagues and map them to their correct country and slug
        if (lowerName.includes("women's super league") || lowerName.includes("wsl players cup") || lowerName.includes("wsl cup") || lowerName.includes("women's fa cup") || lowerName.includes("women's championship") || lowerName.includes("wsl 2") || lowerSlug.startsWith('eng.w.')) {
            country = 'England';
            if (lowerName.includes('players cup') || lowerName.includes('wsl cup') || lowerName.includes('continental cup') || lowerName.includes('continental tyres') || (lowerName.includes('league cup') && (lowerName.includes('women') || lowerName.includes('wsl'))) || lowerSlug === 'eng.w.cup') {
                slug = 'eng.w.cup';
                name = "FA Women's League Cup";
            } else if (lowerName.includes('fa cup') || lowerSlug === 'eng.w.fa') {
                slug = 'eng.w.fa';
                name = "Women's FA Cup";
            } else if (lowerName.includes("women's championship") || lowerName.includes("wsl 2") || lowerName.includes("wsl-2") || lowerSlug === 'eng.w.2') {
                slug = 'eng.w.2';
                name = "Women's Championship";
            } else if (lowerName.includes("national league") || lowerName.includes("wnl") || lowerSlug === 'eng.w.lower') {
                slug = 'eng.w.lower';
                name = "FA Women's National League";
            } else {
                // If it was tagged eng.w.1 but contains Championship/WNL clubs playing each other
                const isWsl2Club = /\b(burnley w|southampton w|nottingham forest w|wolves w|durham w|watford w|ipswich town w|sunderland w|newcastle united w|portsmouth w|sheffield united w|blackburn rovers w|london city lionesses w)\b/i;
                if (isWsl2Club.test(allEvText)) {
                    if (allEvText.includes('cup') || allEvText.includes('group')) {
                        slug = 'eng.w.cup';
                        name = "FA Women's League Cup";
                    } else {
                        slug = 'eng.w.2';
                        name = "Women's Championship";
                    }
                } else {
                    slug = 'eng.w.1';
                    name = "Women's Super League";
                }
            }
        } else if (lowerName.includes("nwsl") || lowerName.includes("national women's soccer league")) {
            country = 'USA';
            if (!slug || slug === 'w.other' || slug === 'other') slug = 'usa.w.1';
        } else if (lowerName.includes("we league") || lowerName.includes("we-league") || lowerSlug === 'jpn.w.1' || allEvText.includes('inac kobe') || allEvText.includes('cerezo osaka sakai') || allEvText.includes('urawa reds ladies') || allEvText.includes('tokyo verdy beleza') || allEvText.includes('elfen saitama') || (lowerSlug.startsWith('jpn') && (allEvText.includes('(w)') || allEvText.includes('ladies') || allEvText.includes('women')))) {
            country = 'Japan';
            slug = 'jpn.w.1';
            name = "Japan Women's WE League";
        } else if (lowerName.includes("liga mx femenil") || (lowerName.includes("femenil") && !lowerName.includes("esp")) || ((lowerSlug === 'mex.1' || lowerSlug === 'mex.w.1') && (allEvText.includes('femenil') || allEvText.includes('(w)') || allEvText.includes('alicia cervantes') || allEvText.includes('quiñónez') || allEvText.includes('ferral')) && !allEvText.includes('kobe') && !allEvText.includes('cerezo') && !allEvText.includes('japan'))) {
            country = 'Mexico';
            slug = 'mex.w.1';
            name = 'Liga MX Femenil';
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
            if (evText.includes('brazil') || evText.includes('brasileir') || /\b(londrina|n[aá]utico|coritiba|sport recife|novorizontino|mirassol|guarani|chapecoense|santos|vila nova|operario|crb|brusque|ituano|botafogo.?sp|amazonas|paysandu|ponte preta|goi[aá]s|cear[aá]|ava[ií]|crici[uú]ma|csa|remo)\b/i.test(evText)) {
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
            } else if (evText.includes('2nd lig') || evText.includes('2. lig') || evText.includes('white group') || evText.includes('red group') || evText.includes('aksaray')) {
                slug = 'tur.3';
                name = 'Turkish 2. Lig';
                country = 'Turkey';
            } else if (evText.includes('1st lig') || evText.includes('1. lig')) {
                slug = 'tur.2';
                name = 'Turkish 1. Lig';
                country = 'Turkey';
            } else if (evText.includes('3rd lig') || evText.includes('3. lig')) {
                slug = 'tur.4';
                name = 'Turkish 3. Lig';
                country = 'Turkey';
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

        // 1i. Separate junior / reserve / youth tiers from senior top flights (.1)
        const isSeniorTop = /\.[1]$/.test(slug) && !slug.includes('.w.') && !slug.includes('youth') && !slug.includes('u19') && !slug.includes('u21');
        const teamReserveCheck = /\b(u-?2[0-3]|u-?1[5-9]|youth|primavera|reserves?|development|academy|castilla|atl[eè]tic|promesas|fabril|vetusta|filial)\b|\s+[bB]$|\s+II$/i;
        if (isSeniorTop && (teamReserveCheck.test(ev?.home?.name || '') || teamReserveCheck.test(ev?.away?.name || '') || teamReserveCheck.test(name))) {
            const hN = ev?.home?.name || '';
            const aN = ev?.away?.name || '';
            const tText = `${hN} ${aN} ${name}`.toLowerCase();
            const isYouth = /\b(u-?2[0-3]|u-?1[5-9]|youth|primavera|reserves?|development|academy|juvenil|nachwuchs|junioren)\b/i.test(tText);
            if (slug.startsWith('eng.')) {
                slug = isYouth ? 'eng.u21' : 'eng.5';
                name = isYouth ? 'Premier League 2' : 'National League';
                country = 'England';
            } else if (slug.startsWith('ita.')) {
                slug = (isYouth || tText.includes('primavera')) ? 'ita.u19' : 'ita.2';
                name = (isYouth || tText.includes('primavera')) ? 'Campionato Primavera 1' : 'Italian Serie B';
                country = 'Italy';
            } else if (slug.startsWith('esp.')) {
                slug = (isYouth || tText.includes('juvenil')) ? 'esp.u19' : 'esp.3';
                name = (isYouth || tText.includes('juvenil')) ? 'División de Honor Juvenil' : 'Spanish Primera Federación';
                country = 'Spain';
            } else if (slug.startsWith('ger.')) {
                slug = isYouth ? 'ger.u19' : 'ger.3';
                name = isYouth ? 'U19 DFB-Nachwuchsliga' : 'German 3. Liga';
                country = 'Germany';
            } else if (slug.startsWith('fra.')) {
                slug = isYouth ? 'fra.u19' : 'fra.2';
                name = isYouth ? 'Championnat National U19' : 'French Ligue 2';
                country = 'France';
            } else if (slug.startsWith('tur.')) {
                slug = 'tur.2';
                name = 'Turkish 1. Lig';
                country = 'Turkey';
            } else if (slug.startsWith('aut.')) {
                slug = 'aut.2';
                name = 'Austrian 2. Liga';
                country = 'Austria';
            } else if (slug.startsWith('bih.')) {
                slug = 'bih.2';
                name = 'Bosnian Prva Liga';
                country = 'Bosnia and Herzegovina';
            } else if (slug === 'intl.friendly' && isYouth) {
                slug = 'intl.u21';
                name = 'Under-21 International Friendlies';
                country = 'International';
            }
        }

        // 1j. Bolivian Liga Profesional & Copa Bolivia
        if (lowerSlug === 'bol.copa' || lowerSlug === 'bol.1' || (lowerSlug === '2nd.1' && (allEvText.includes('always ready') || allEvText.includes('independiente petrolero') || allEvText.includes('bolivia'))) || lowerName.includes('copa bolivia') || (lowerName.includes('bolivian') && !allEvText.includes('mexic')) || allEvText.includes('always ready') || allEvText.includes('independiente petrolero') || allEvText.includes('the strongest') || allEvText.includes('oriente petrolero') || allEvText.includes('blooming') || allEvText.includes('bolivar')) {
            country = 'Bolivia';
            if (lowerName.includes('copa') || lowerSlug === 'bol.copa' || allEvText.includes('copa bolivia') || allEvText.includes('copa')) {
                slug = 'bol.copa';
                name = 'Copa Bolivia';
            } else {
                slug = 'bol.1';
                name = 'Bolivian Liga Profesional';
            }
        }

        // 1k. Mexican Liga de Expansión MX
        const isBolivianMatch = lowerSlug.startsWith('bol') || allEvText.includes('always ready') || allEvText.includes('independiente petrolero') || allEvText.includes('the strongest') || allEvText.includes('oriente petrolero') || allEvText.includes('blooming') || allEvText.includes('bolivar');
        if (!isBolivianMatch && (lowerSlug === 'mex.2' || lowerName.includes('expansion') || lowerName.includes('expansión') || ((lowerSlug === '2nd.1' || lowerSlug === '1st.1' || lowerSlug === 'mex.lower') && (allEvText.includes('leones negros') || allEvText.includes('morelia') || allEvText.includes('atletico la paz') || allEvText.includes('atlético la paz') || allEvText.includes('dorados') || allEvText.includes('mineros de zacatecas') || allEvText.includes('alebrijes'))))) {
            country = 'Mexico';
            slug = 'mex.2';
            name = 'Liga de Expansión MX';
        }

        // 1l. Normalize Indian Super League / Indian Football League / Keuken Kampioen Divisie / English National League / UEFA Women's Champions League
        if (lowerSlug === 'ind.1' || lowerName === 'india super league' || lowerName === 'indian super league') {
            slug = 'ind.1';
            name = 'Indian Super League';
            country = 'India';
        } else if (lowerSlug === 'ind.2' || lowerName.includes('indian football league') || lowerName.includes('i-league')) {
            slug = 'ind.2';
            name = 'Indian Football League';
            country = 'India';
        } else if (lowerSlug === 'ned.2' || lowerName.includes('keuken kampioen') || lowerName.includes('eerste divisie')) {
            slug = 'ned.2';
            name = 'Keuken Kampioen Divisie';
            country = 'Netherlands';
        } else if (lowerName === 'national league' && !lowerName.includes('championnat') && (country.toLowerCase() === 'france' || country.toLowerCase() === 'international' || !country)) {
            slug = 'eng.5';
            name = 'National League';
            country = 'England';
        } else if (lowerSlug === 'uefa.wchampions' || lowerName.includes("uefa women's champions")) {
            slug = 'uefa.wchampions';
            country = 'Europe';
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
                bol: 'Bolivia', uru: 'Uruguay', par: 'Paraguay', per: 'Peru', ecu: 'Ecuador', ven: 'Venezuela',
                mex: 'Mexico', usa: 'USA', can: 'Canada', crc: 'Costa Rica', hon: 'Honduras', gtm: 'Guatemala', gua: 'Guatemala', pan: 'Panama', nic: 'Nicaragua',
                aus: 'Australia', nzl: 'New Zealand', jpn: 'Japan',
                chn: 'China', kor: 'South Korea', ksa: 'Saudi Arabia', sau: 'Saudi Arabia',
                ind: 'India', idn: 'Indonesia', tha: 'Thailand', mys: 'Malaysia', sgp: 'Singapore', vnm: 'Vietnam',
                qat: 'Qatar', uae: 'UAE', irn: 'Iran', irq: 'Iraq', jor: 'Jordan', bhr: 'Bahrain', kwt: 'Kuwait', omn: 'Oman', uzb: 'Uzbekistan',
                egy: 'Egypt', rsa: 'South Africa', nga: 'Nigeria', mar: 'Morocco', gha: 'Ghana', ken: 'Kenya', uga: 'Uganda', sen: 'Senegal',
                tza: 'Tanzania', zmb: 'Zambia', zwe: 'Zimbabwe', eth: 'Ethiopia',
                rwa: 'Rwanda', cod: 'DR Congo', cmr: 'Cameroon', civ: 'Ivory Coast',
                dza: 'Algeria', tun: 'Tunisia', sdn: 'Sudan', ago: 'Angola',
                bwa: 'Botswana', mwi: 'Malawi', jam: 'Jamaica', lby: 'Libya',
                isr: 'Israel', aze: 'Azerbaijan', blr: 'Belarus', arm: 'Armenia',
                bih: 'Bosnia and Herzegovina', nir: 'Northern Ireland', wal: 'Wales',
                irl: 'Ireland', hkg: 'Hong Kong', bgd: 'Bangladesh', mlt: 'Malta',
                kaz: 'Kazakhstan', mda: 'Moldova', mol: 'Moldova', slv: 'El Salvador',
                srb: 'Serbia', cro: 'Croatia', svk: 'Slovakia', svn: 'Slovenia',
                hun: 'Hungary', bgr: 'Bulgaria', rou: 'Romania', geo: 'Georgia',
                alb: 'Albania', cyp: 'Cyprus', kvx: 'Kosovo', mkd: 'North Macedonia',
                mne: 'Montenegro', isl: 'Iceland', lva: 'Latvia', ltu: 'Lithuania', est: 'Estonia', lux: 'Luxembourg', fro: 'Faroe Islands',
                uefa: 'Europe', caf: 'Africa', afc: 'Asia', conmebol: 'South America', concacaf: 'North America'
            };
            if (countryMap[prefix]) {
                country = countryMap[prefix];
            } else {
                const nm = `${lowerName} ${lowerSlug}`;
                if (/\b(?:colombi|betplay)\b/.test(nm)) country = 'Colombia';
                else if (/\b(?:peruv|peru|te apuesto)\b/.test(nm)) country = 'Peru';
                else if (/\b(?:uruguay|auf uruguaya)\b/.test(nm)) country = 'Uruguay';
                else if (/\b(?:russia|russian)\b/.test(nm)) country = 'Russia';
                else if (/\b(?:saudi|roshn)\b/.test(nm)) country = 'Saudi Arabia';
                else if (/\b(?:indian|india super|i-league)\b/.test(nm)) country = 'India';
                else if (/\b(?:keuken kampioen|eerste divisie|eredivisie|dutch|netherlands)\b/.test(nm)) country = 'Netherlands';
                else if (/\b(?:brazil|brasileir)\b/.test(nm)) country = 'Brazil';
                else if (/\b(?:argentin)\b/.test(nm)) country = 'Argentina';
                else if (/\b(?:chilean|chile)\b/.test(nm)) country = 'Chile';
                else if (/\b(?:ecuador)\b/.test(nm)) country = 'Ecuador';
                else if (/\b(?:paraguay)\b/.test(nm)) country = 'Paraguay';
                else if (/\b(?:venezuel)\b/.test(nm)) country = 'Venezuela';
                else if (/\b(?:bolivi)\b/.test(nm)) country = 'Bolivia';
                else if (/\b(?:mexic|liga mx)\b/.test(nm)) country = 'Mexico';
                else if (/\b(?:japan|j1|j2|j-league)\b/.test(nm)) country = 'Japan';
                else if (/\b(?:korea|k league|k-league)\b/.test(nm)) country = 'South Korea';
                else if (/\b(?:china|chinese)\b/.test(nm)) country = 'China';
                else if (/\b(?:egypt)\b/.test(nm)) country = 'Egypt';
                else if (/\b(?:morocc)\b/.test(nm)) country = 'Morocco';
                else if (/\b(?:nigeri|npfl)\b/.test(nm)) country = 'Nigeria';
                else if (/\b(?:south africa)\b/.test(nm)) country = 'South Africa';
                else if (/\b(?:scottish|scotland)\b/.test(nm)) country = 'Scotland';
                else if (/\b(?:turkish|turkey|süper lig|super lig)\b/.test(nm)) country = 'Turkey';
                else if (/\b(?:belgian|belgium|jupiler)\b/.test(nm)) country = 'Belgium';
                else if (/\b(?:portug|primeira liga)\b/.test(nm)) country = 'Portugal';
                else if (/\b(?:greek|greece)\b/.test(nm)) country = 'Greece';
                else if (/\b(?:swiss|switzerland)\b/.test(nm)) country = 'Switzerland';
                else if (/\b(?:austria)\b/.test(nm)) country = 'Austria';
                else if (/\b(?:danish|denmark|superligaen)\b/.test(nm)) country = 'Denmark';
                else if (/\b(?:swed|allsvenskan)\b/.test(nm)) country = 'Sweden';
                else if (/\b(?:norw|eliteserien)\b/.test(nm)) country = 'Norway';
                else if (/\b(?:polish|poland|ekstraklasa)\b/.test(nm)) country = 'Poland';
                else if (/\b(?:ukrain)\b/.test(nm)) country = 'Ukraine';
                else if (/\b(?:czech)\b/.test(nm)) country = 'Czech Republic';
                else if (/\b(?:croat)\b/.test(nm)) country = 'Croatia';
                else if (/\b(?:serbi)\b/.test(nm)) country = 'Serbia';
                else if (/\b(?:romani)\b/.test(nm)) country = 'Romania';
                else if (/\b(?:hungar)\b/.test(nm)) country = 'Hungary';
                else if (/\b(?:bulgar)\b/.test(nm)) country = 'Bulgaria';
                else if (/\b(?:uefa)\b/.test(nm)) country = 'Europe';
                else if (/\b(?:conmebol|libertadores|sudamericana)\b/.test(nm)) country = 'South America';
                else if (/\b(?:concacaf)\b/.test(nm)) country = 'North America';
                else if (/\b(?:caf|afcon)\b/.test(nm)) country = 'Africa';
                else if (/\b(?:afc)\b/.test(nm)) country = 'Asia';
            }
        }

        let logo = league?.logo || null;
        if (league?.slug && slug !== league.slug) {
            const known = (state.leagues || []).find(l => l.slug === slug);
            logo = known?.logo || null;
        }
        if (slug.startsWith('chn.') && logo && logo.includes('/23.png')) {
            logo = null;
        }

        return {
            ...league,
            slug: slug || 'other',
            name: name || 'Competition',
            logo,
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
        ireland: 'ie', 'republic of ireland': 'ie', usa: 'us', 'united states': 'us',
        canada: 'ca', mexico: 'mx', brazil: 'br', argentina: 'ar', colombia: 'co',
        chile: 'cl', uruguay: 'uy', paraguay: 'py', peru: 'pe', ecuador: 'ec',
        bolivia: 'bo', venezuela: 've', 'costa rica': 'cr', honduras: 'hn',
        guatemala: 'gt', 'el salvador': 'sv', panama: 'pa', nicaragua: 'ni',
        japan: 'jp', 'south korea': 'kr', 'korea republic': 'kr', china: 'cn',
        australia: 'au', 'new zealand': 'nz', 'saudi arabia': 'sa', qatar: 'qa',
        uae: 'ae', 'united arab emirates': 'ae', iran: 'ir', iraq: 'iq', jordan: 'jo',
        bahrain: 'bh', kuwait: 'kw', oman: 'om', lebanon: 'lb', syria: 'sy',
        uzbekistan: 'uz', india: 'in', indonesia: 'id', thailand: 'th', malaysia: 'my',
        singapore: 'sg', vietnam: 'vn', philippines: 'ph', nigeria: 'ng',
        'south africa': 'za', egypt: 'eg', morocco: 'ma', algeria: 'dz', tunisia: 'tn',
        ghana: 'gh', kenya: 'ke', uganda: 'ug', cameroon: 'cm', senegal: 'sn',
        tanzania: 'tz', zambia: 'zm', zimbabwe: 'zw', ethiopia: 'et', rwanda: 'rw',
        'dr congo': 'cd', 'congo dr': 'cd', congo: 'cg', 'ivory coast': 'ci',
        'cote d\'ivoire': 'ci', 'côte d\'ivoire': 'ci', sudan: 'sd', angola: 'ao',
        botswana: 'bw', malawi: 'mw', mozambique: 'mz', namibia: 'na', benin: 'bj',
        'burkina faso': 'bf', mali: 'ml', guinea: 'gn', gabon: 'ga', libya: 'ly',
        jamaica: 'jm', 'trinidad and tobago': 'tt', haiti: 'ht', israel: 'il',
        belarus: 'by', azerbaijan: 'az', armenia: 'am', georgia: 'ge',
        'bosnia and herzegovina': 'ba', 'bosnia-herzegovina': 'ba', bosnia: 'ba',
        montenegro: 'me', 'north macedonia': 'mk', macedonia: 'mk', kosovo: 'xk',
        albania: 'al', cyprus: 'cy', malta: 'mt', kazakhstan: 'kz', moldova: 'md',
        latvia: 'lv', lithuania: 'lt', estonia: 'ee', luxembourg: 'lu',
        'faroe islands': 'fo', iceland: 'is', andorra: 'ad', 'san marino': 'sm',
        gibraltar: 'gi', 'northern ireland': 'gb-nir', 'hong kong': 'hk', bangladesh: 'bd',
        taiwan: 'tw', europe: 'eu', international: 'un', world: 'un'
    };

    function getCountryFlagHtml(countryName, size = { width: 18, height: 13 }) {
        const clean = String(countryName || '').toLowerCase().trim();
        const code = COUNTRY_CODES[clean];
        if (code) {
            return `<img src="https://flagcdn.com/w40/${code}.png" alt="${escapeHtml(countryName)}" loading="lazy" style="width:${size.width}px; height:${size.height}px; object-fit:cover; border-radius:2px; flex-shrink:0; vertical-align:middle;" onerror="this.onerror=null; this.outerHTML='<span style=\\'font-size:${size.height}px; display:inline-block; vertical-align:middle;\\'>🌐</span>';">`;
        }
        const regionalIcons = {
            'africa': '🌍',
            'europe': '🇪🇺',
            'south america': '🌎',
            'north america': '🌎',
            'asia': '🌏',
            'international': '🌐',
            'world': '🌐'
        };
        const icon = regionalIcons[clean] || '🌐';
        return `<span style="font-size:${size.height}px; display:inline-block; vertical-align:middle; flex-shrink:0;">${icon}</span>`;
    }

    function getLeagueCountryCode(league) {
        const slug = (league?.slug || '').toLowerCase();
        const prefix = slug.split('.')[0];
        const country = (league?.country || '').toLowerCase().trim();
        const isGenericCountry = !country || country === 'international' || country === 'world' || country === 'other';
        if (!isGenericCountry && COUNTRY_CODES[country]) return COUNTRY_CODES[country];

        const PREFIX_TO_FLAG = {
            eng: 'gb-eng', sco: 'gb-sct', wal: 'gb-wls', nir: 'gb-nir', irl: 'ie',
            esp: 'es', ita: 'it', ger: 'de', fra: 'fr', ned: 'nl', por: 'pt',
            tur: 'tr', bel: 'be', aut: 'at', sui: 'ch', den: 'dk', swe: 'se',
            nor: 'no', fin: 'fi', gre: 'gr', pol: 'pl', rus: 'ru', ukr: 'ua',
            cze: 'cz', cro: 'hr', srb: 'rs', rou: 'ro', hun: 'hu', bgr: 'bg',
            svk: 'sk', svn: 'si', bih: 'ba', mne: 'me', mkd: 'mk', kvx: 'xk',
            alb: 'al', cyp: 'cy', geo: 'ge', arm: 'am', aze: 'az', blr: 'by',
            isr: 'il', isl: 'is', lva: 'lv', ltu: 'lt', est: 'ee', lux: 'lu',
            mlt: 'mt', kaz: 'kz', mda: 'md', mol: 'md', fro: 'fo',
            usa: 'us', can: 'ca', mex: 'mx', crc: 'cr', hon: 'hn', gtm: 'gt', gua: 'gt',
            pan: 'pa', nic: 'ni', slv: 'sv', jam: 'jm',
            bra: 'br', arg: 'ar', col: 'co', chi: 'cl', uru: 'uy', par: 'py',
            per: 'pe', ecu: 'ec', bol: 'bo', ven: 've',
            jpn: 'jp', kor: 'kr', chn: 'cn', aus: 'au', nzl: 'nz',
            ksa: 'sa', sau: 'sa', qat: 'qa', uae: 'ae', irn: 'ir', irq: 'iq',
            jor: 'jo', bhr: 'bh', kwt: 'kw', omn: 'om', uzb: 'uz',
            ind: 'in', idn: 'id', tha: 'th', mys: 'my', sgp: 'sg', vnm: 'vn', hkg: 'hk', bgd: 'bd',
            nga: 'ng', rsa: 'za', egy: 'eg', mar: 'ma', dza: 'dz', tun: 'tn',
            gha: 'gh', ken: 'ke', uga: 'ug', cmr: 'cm', sen: 'sn', civ: 'ci',
            tza: 'tz', zmb: 'zm', zwe: 'zw', eth: 'et', rwa: 'rw', cod: 'cd',
            sdn: 'sd', ago: 'ao', bwa: 'bw', mwi: 'mw', lby: 'ly',
            uefa: 'eu'
        };
        if (PREFIX_TO_FLAG[prefix]) return PREFIX_TO_FLAG[prefix];

        const nm = String(league?.name || '').toLowerCase();
        if (/\b(?:colombi|betplay)\b/.test(nm)) return 'co';
        if (/\b(?:peruv|peru|te apuesto)\b/.test(nm)) return 'pe';
        if (/\b(?:uruguay|auf uruguaya)\b/.test(nm)) return 'uy';
        if (/\b(?:russia|russian)\b/.test(nm)) return 'ru';
        if (/\b(?:saudi|roshn)\b/.test(nm)) return 'sa';
        if (/\b(?:indian|india super|i-league)\b/.test(nm)) return 'in';
        if (/\b(?:keuken kampioen|eerste divisie|eredivisie|dutch|netherlands)\b/.test(nm)) return 'nl';
        if (/\b(?:uefa)\b/.test(nm)) return 'eu';

        return COUNTRY_CODES[country] || '';
    }

    function renderLeagueAvatarHtml(league, { size = 18, className = 'league-avatar' } = {}) {
        if (!league) return `<span class="${className}">⚽</span>`;
        const slug = (league.slug || '').toLowerCase();
        const name = escapeHtml(league.name || 'League');
        let logoUrl = safeUrl(league.logo);
        if (slug.startsWith('chn.') && logoUrl && logoUrl.includes('/23.png')) {
            logoUrl = '';
        }
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

        // Keep horizontal ribbon clean: show top world competitions + active league + More button
        const TOP_RIBBON_SLUGS = [
            'eng.1', 'esp.1', 'uefa.champions', 'ita.1', 'ger.1', 'fra.1',
            'nga.1', 'uefa.europa', 'uefa.europa.conf', 'caf.champions',
            'usa.1', 'ksa.1', 'ned.1', 'por.1'
        ];

        const topLeagues = [];
        for (const slug of TOP_RIBBON_SLUGS) {
            const found = state.leagues.find(l => l.slug === slug);
            if (found) topLeagues.push(found);
        }

        // If user selected a league not already in top ribbon, include it so the selected pill is visible
        if (activeSlug && activeSlug !== 'all' && activeSlug !== 'live') {
            const activeLeague = state.leagues.find(l => l.slug === activeSlug);
            if (activeLeague && !topLeagues.some(l => l.slug === activeSlug)) {
                topLeagues.push(activeLeague);
            }
        }

        const leaguePills = topLeagues.map(l => {
            const avatarHtml = renderLeagueAvatarHtml(l, { size: 18, className: 'quick-league-avatar' });
            const isActive = l.slug === activeSlug;
            return `
                <button class="quick-league-btn ${isActive ? 'active' : ''}" type="button" data-slug="${escapeHtml(l.slug)}" title="${escapeHtml(l.name)}">
                    ${avatarHtml}
                    <span>${escapeHtml(l.abbreviation || l.name)}</span>
                </button>
            `;
        }).join('');

        const morePill = `
            <button class="quick-league-btn quick-league-more-btn" id="quick-league-more-btn" type="button" title="Browse all countries &amp; competitions">
                <span style="font-size:14px;">➕</span>
                <span>More ▾</span>
            </button>
        `;

        container.innerHTML = allPill + leaguePills + morePill;

        container.querySelectorAll('.quick-league-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const slug = btn.dataset.slug;
                if (btn.id === 'quick-league-more-btn') {
                    openMobileDrawer();
                } else if (slug === 'all') {
                    selectAllLeagues();
                } else if (slug === 'live') {
                    selectLiveMatches();
                } else if (slug) {
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
                const flagHtml = getCountryFlagHtml(country, { width: 16, height: 12 });

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

    function openMobileDrawer() {
        const drawer = document.getElementById('mobile-country-drawer');
        const overlay = document.getElementById('mobile-drawer-overlay');
        if (drawer) {
            drawer.classList.add('active');
            drawer.setAttribute('aria-hidden', 'false');
        }
        if (overlay) {
            overlay.classList.add('active');
            overlay.setAttribute('aria-hidden', 'false');
        }
        document.body.style.overflow = 'hidden';
    }

    function closeMobileDrawer() {
        const drawer = document.getElementById('mobile-country-drawer');
        const overlay = document.getElementById('mobile-drawer-overlay');
        if (drawer) {
            drawer.classList.remove('active');
            drawer.setAttribute('aria-hidden', 'true');
        }
        if (overlay) {
            overlay.classList.remove('active');
            overlay.setAttribute('aria-hidden', 'true');
        }
        document.body.style.overflow = '';
    }

    function initMobileDrawerEvents() {
        const hamBtn = document.getElementById('mobile-hamburger-btn');
        if (hamBtn && !hamBtn.dataset.wired) {
            hamBtn.dataset.wired = 'true';
            hamBtn.addEventListener('click', (e) => {
                e.preventDefault();
                const drawer = document.getElementById('mobile-country-drawer');
                if (drawer && drawer.classList.contains('active')) {
                    closeMobileDrawer();
                } else {
                    openMobileDrawer();
                }
            });
        }

        const closeBtn = document.getElementById('close-mobile-drawer');
        if (closeBtn && !closeBtn.dataset.wired) {
            closeBtn.dataset.wired = 'true';
            closeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                closeMobileDrawer();
            });
        }

        const overlay = document.getElementById('mobile-drawer-overlay');
        if (overlay && !overlay.dataset.wired) {
            overlay.dataset.wired = 'true';
            overlay.addEventListener('click', () => {
                closeMobileDrawer();
            });
        }

        const quickAll = document.getElementById('mobile-quick-all');
        if (quickAll && !quickAll.dataset.wired) {
            quickAll.dataset.wired = 'true';
            quickAll.addEventListener('click', (e) => {
                e.preventDefault();
                closeMobileDrawer();
                selectAllLeagues();
            });
        }

        const quickLive = document.getElementById('mobile-quick-live');
        if (quickLive && !quickLive.dataset.wired) {
            quickLive.dataset.wired = 'true';
            quickLive.addEventListener('click', (e) => {
                e.preventDefault();
                closeMobileDrawer();
                selectLiveMatches();
            });
        }

        const downloadBtn = document.getElementById('mobile-menu-download-btn');
        if (downloadBtn && !downloadBtn.dataset.wired) {
            downloadBtn.dataset.wired = 'true';
            downloadBtn.addEventListener('click', (e) => {
                e.preventDefault();
                closeMobileDrawer();
                const dlg = document.getElementById('download-dialog');
                if (dlg) {
                    dlg.classList.add('active');
                    dlg.hidden = false;
                }
            });
        }

        if (!window.__mobileDrawerKeydownWired) {
            window.__mobileDrawerKeydownWired = true;
            window.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    const drawer = document.getElementById('mobile-country-drawer');
                    if (drawer && drawer.classList.contains('active')) {
                        closeMobileDrawer();
                    }
                }
            });
        }
    }

    function renderMobileDrawer(activeSlug = 'all') {
        const drawerList = document.getElementById('mobile-country-list');
        const searchInput = document.getElementById('mobile-country-filter');
        const quickAll = document.getElementById('mobile-quick-all');
        const quickLive = document.getElementById('mobile-quick-live');
        const liveCountBadge = document.getElementById('mobile-live-count');

        initMobileDrawerEvents();

        if (quickAll) {
            quickAll.classList.toggle('active', !activeSlug || activeSlug === 'all');
        }
        if (quickLive) {
            quickLive.classList.toggle('active', activeSlug === 'live');
        }
        if (liveCountBadge) {
            if (state.liveMatchCount > 0) {
                liveCountBadge.textContent = state.liveMatchCount;
                liveCountBadge.style.display = 'inline-block';
            } else {
                liveCountBadge.style.display = 'none';
            }
        }

        if (!drawerList || !state.leagues.length) return;

        const countriesMap = new Map();
        for (const l of state.leagues) {
            const cName = l.country || 'International';
            if (!countriesMap.has(cName)) {
                countriesMap.set(cName, []);
            }
            countriesMap.get(cName).push(l);
        }

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

        function buildMobileCountryListHtml(filterText = '') {
            const search = filterText.toLowerCase().trim();
            let html = '';

            for (const country of sortedCountries) {
                const leagues = countriesMap.get(country) || [];
                const matchesCount = leagues.reduce((sum, l) => sum + (l.matchCount || 0), 0);
                const flagHtml = getCountryFlagHtml(country, { width: 18, height: 13 });

                const matchingLeagues = search
                    ? leagues.filter(l => l.name.toLowerCase().includes(search) || l.abbreviation?.toLowerCase().includes(search) || country.toLowerCase().includes(search))
                    : leagues;

                if (search && !country.toLowerCase().includes(search) && !matchingLeagues.length) {
                    continue;
                }

                const isCountryActive = leagues.some(l => l.slug === activeSlug);
                const autoExpand = Boolean(search) || isCountryActive;

                html += `
                    <div class="mobile-country-item ${autoExpand ? 'is-expanded' : ''}" data-country="${escapeHtml(country)}">
                        <div class="mobile-country-header" role="button" tabindex="0">
                            <div class="mobile-item-left">
                                ${flagHtml}
                                <span class="mobile-country-name">${escapeHtml(country)}</span>
                            </div>
                            <div style="display:flex; align-items:center; gap:4px;">
                                ${matchesCount > 0 ? `<span class="sidebar-item-badge">${matchesCount}</span>` : ''}
                                <span class="mobile-chevron">▶</span>
                            </div>
                        </div>
                        <div class="mobile-country-leagues">
                            ${matchingLeagues.map(l => {
                                const isLActive = l.slug === activeSlug;
                                return `
                                    <button class="mobile-league-btn ${isLActive ? 'active' : ''}" type="button" data-slug="${escapeHtml(l.slug)}">
                                        <span>${escapeHtml(l.name)}</span>
                                        ${l.matchCount ? `<span style="font-size:10px; opacity:0.8;">${l.matchCount}</span>` : ''}
                                    </button>
                                `;
                            }).join('')}
                        </div>
                    </div>
                `;
            }

            if (!html) {
                html = '<div style="padding:16px; font-size:12.5px; color:var(--text-muted); text-align:center;">No matching competitions found</div>';
            }

            drawerList.innerHTML = html;

            drawerList.querySelectorAll('.mobile-country-header').forEach(hdr => {
                hdr.addEventListener('click', () => {
                    const item = hdr.closest('.mobile-country-item');
                    if (item) item.classList.toggle('is-expanded');
                });
            });

            drawerList.querySelectorAll('.mobile-league-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    const slug = btn.dataset.slug;
                    if (slug) {
                        closeMobileDrawer();
                        selectLeague(slug);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                    }
                });
            });
        }

        buildMobileCountryListHtml(searchInput ? searchInput.value : '');

        if (searchInput && !searchInput.dataset.wired) {
            searchInput.dataset.wired = 'true';
            searchInput.addEventListener('input', (e) => {
                buildMobileCountryListHtml(e.target.value);
            });
        }
    }

    async function selectLiveMatches() {
        state.selectedLeagueSlug = 'live';
        state.currentStatus = 'live';
        state.league = null;
        renderQuickLeaguePills('live');
        renderDesktopSidebar('live');
        renderMobileDrawer('live');
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
        if (elements['fixtures-list']) elements['fixtures-list'].style.minHeight = '';

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

        // Instant Live Filter: sub-second instant render from memory cache or loaded fixtures
        let instantLive = (state.liveMatchesCache && state.liveMatchesCache.length)
            ? state.liveMatchesCache
            : null;

        if (!instantLive && Array.isArray(state.fixtures) && state.fixtures.length) {
            const inPlay = state.fixtures.filter(m => {
                const s = m.status?.state || m.status?.type?.state;
                return s === 'in' || Boolean(m.status?.isLive);
            });
            if (inPlay.length > 0) instantLive = inPlay;
        }

        if (instantLive && instantLive.length > 0) {
            // Instant 0ms render from memory cache without showing a blank loading spinner
            loadLiveMatches({ background: true, initialLive: instantLive });
            // Silently revalidate live scores in the background
            loadLiveMatches({ background: true });
        } else {
            await loadLiveMatches({ background: false });
        }
    }

    async function loadLiveMatches({ background = false, initialLive = null } = {}) {
        if (!background && !initialLive) {
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
            state.liveMatchesCache = dedupedLive;

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
                const groupKey = (league.slug && league.slug !== 'w.other' && league.slug !== 'other' && !league.slug.endsWith('.lower'))
                    ? league.slug
                    : `league_${league.slug || 'other'}_${(league.name || 'other').toLowerCase().replace(/[^a-z0-9]/g, '_')}`;

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
            renderMobileDrawer('live');
        } else if (requestedSlug && state.leagues.some(l => l.slug === requestedSlug)) {
            renderQuickLeaguePills(requestedSlug);
            renderDesktopSidebar(requestedSlug);
            renderMobileDrawer(requestedSlug);
            selectLeague(requestedSlug);
        } else {
            renderQuickLeaguePills('all');
            renderDesktopSidebar('all');
            renderMobileDrawer('all');
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
        renderMobileDrawer('all');
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
        if (elements['fixtures-list']) elements['fixtures-list'].style.minHeight = '';

        const explorer = document.querySelector('.explorer') || elements['fixtures-list'];
        if (explorer && window.scrollY > (explorer.offsetTop + 200)) {
            window.scrollTo({ top: Math.max(0, explorer.offsetTop - 70), behavior: 'smooth' });
        }

        inFlightAllFixturesPromise = null;
        await loadAllLeagueFixtures();
    }

    let inFlightAllFixturesPromise = null;
    let fixturesFetchSeq = 0;
    async function loadAllLeagueFixtures({ background = false, favoritesOnly = false, initialLive = null } = {}) {
        if (background && inFlightAllFixturesPromise) {
            return inFlightAllFixturesPromise;
        }

        const thisReqId = ++fixturesFetchSeq;

        if (!background) {
            inFlightAllFixturesPromise = null;
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
                let url = `/api/v1/football/fixtures?date=${encodeURIComponent(dateParam)}&limit=1200`;
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
                } else if (dateParam === 'today' && (statusParam === 'all' || !statusParam || statusParam === 'live')) {
                    // /fixtures?date=today already merges real-time live matches on the server.
                    // Reuse initialLive if supplied to eliminate double network fetches
                    if (initialLive && Array.isArray(initialLive) && initialLive.length > 0) {
                        const fixturesRes = await fetchJson(url).catch(() => ({}));
                        const fixturesMatches = fixturesRes.matches || fixturesRes.fixtures || [];
                        matches = deduplicateMatchesList([...initialLive, ...fixturesMatches]);
                        state.liveMatchCount = initialLive.length;
                    } else {
                        const fixturesRes = await fetchJson(url).catch(() => ({}));
                        matches = fixturesRes.matches || fixturesRes.fixtures || [];
                    }
                } else {
                    const data = await fetchJson(url);
                    matches = data.matches || data.fixtures || [];
                }

                if (thisReqId !== fixturesFetchSeq) return;

                if (!matches.length) {
                    renderAllLeaguesGrouped([]);
                    return;
                }

                // Deduplicate all fixtures globally across all feeds / providers
                const dedupedMatches = deduplicateMatchesList(matches);

                const groupsMap = new Map();
                for (const m of dedupedMatches) {
                    const league = enrichLeagueMeta(m.league, m);
                    let groupKey = (league.slug && league.slug !== 'w.other' && league.slug !== 'other' && !league.slug.endsWith('.lower'))
                        ? league.slug
                        : `league_${league.slug || 'other'}_${(league.name || 'other').toLowerCase().replace(/[^a-z0-9]/g, '_')}`;

                    if (groupKey.startsWith('fra.coupe')) {
                        groupKey = 'fra.coupe_de_france';
                        league.name = 'Coupe de France';
                        league.country = 'France';
                    }

                    if (!groupsMap.has(groupKey)) {
                        groupsMap.set(groupKey, {
                            league,
                            events: []
                        });
                    }
                    groupsMap.get(groupKey).events.push(m);
                }

                if (thisReqId !== fixturesFetchSeq) return;
                renderAllLeaguesGrouped([...groupsMap.values()], { background });
            } catch (error) {
                if (thisReqId === fixturesFetchSeq) {
                    if (elements['fixtures-empty']) elements['fixtures-empty'].hidden = false;
                    showToast(`Unable to load all fixtures: ${error.message}`);
                }
            } finally {
                if (!background && thisReqId === fixturesFetchSeq) setLoading('fixtures', false);
                if (thisReqId === fixturesFetchSeq) inFlightAllFixturesPromise = null;
            }
        })();

        return inFlightAllFixturesPromise;
    }

    function renderAllLeaguesGrouped(groupedData, { background = false } = {}) {
        if (!elements['fixtures-list']) return;

        const prevScrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
        const fixturesContainer = elements['fixtures-list'];
        if (fixturesContainer) {
            fixturesContainer.style.minHeight = '';
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
                const clockNum = parseInt(String(ev.status?.clock || ev.status?.detail || '').replace(/\D/g, ''), 10) || 0;
                const { home: hs, away: as_ } = competitorsFromEvent(ev);
                const hasScore = (hs.score != null && hs.score !== '' && hs.score !== '-') || (as_?.score != null && as_?.score !== '');
                const hasLogo = !!(hs.team?.logo || as_?.team?.logo);
                const evScore = (isEspn ? 3 : 0) + (isSpecificLeague ? 2 : 0) + (ev.status?.state === 'in' ? 3 : 0) + Math.min(clockNum, 120) + (hasScore ? 5 : 0) + (hasLogo ? 2 : 0) + (ev.id ? 1 : 0);

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

        const globallyRenderedSignatures = new Set();
        const globallyRenderedIds = new Set();

        const html = sortedGroups.map(({ league, events }) => {
            if (!events || !events.length) return '';

            // Deduplicate events within this league using full tier-aware signature
            const seenMatchSig = new Map();
            for (const ev of events) {
                const sig = getEventDedupSignature(ev);
                if (!sig || sig === '_vs_') continue;
                const alreadyShown = globallyRenderedSignatures.has(sig) || (ev.id && globallyRenderedIds.has(String(ev.id)));
                if (alreadyShown) continue; // Skip: already rendered (deduplicateMatchesList already collapsed fuzzy variants)
                // Drop B/reserve sides from senior top-flight boards
                const slug = (league?.slug || ev.league_slug || '').toLowerCase();
                const isSeniorTop = /\.[1]$/.test(slug) && !slug.includes('.w.') && !slug.includes('youth');
                if (isSeniorTop) {
                    const { home: hT, away: aT } = competitorsFromEvent(ev);
                    const hn = hT.team?.displayName || hT.team?.name || '';
                    const an = aT.team?.displayName || aT.team?.name || '';
                    if (isReserveOrBTeam(hn) || isReserveOrBTeam(an)) continue;
                    if (CLIENT_TOP_FLIGHT[slug] && !clientHasTopFlightClub(slug, hn, an)) continue;
                }
                // Women's competitions: drop misattributed men's sides unless verified women's league fixture
                const isWomenLeague = slug.includes('.w.') || /liga f|wsl|nwsl|femenin|frauen|arkema/i.test(league?.name || '');
                if (isWomenLeague) {
                    const isVerifiedWomenLeague = slug.includes('.w.') || String(ev.league_slug || '').includes('.w.') || /femenil|frauen|arkema|wsl|nwsl/i.test(league?.name || ev.note || '');
                    if (!isVerifiedWomenLeague) {
                        const { home: hT, away: aT } = competitorsFromEvent(ev);
                        const hn = hT.team?.displayName || hT.team?.name || '';
                        const an = aT.team?.displayName || aT.team?.name || '';
                        const looksWomen = (n) => /\b(w|women|woman|ladies|femen|frau)\b|\(w\)/i.test(n);
                        if (!looksWomen(hn) && !looksWomen(an)) continue;
                    }
                }
                // Hide cross-country pollution (e.g. Romanian clubs under Indonesian header)
                {
                    const { home: hT, away: aT } = competitorsFromEvent(ev);
                    const hn = hT.team?.displayName || hT.team?.name || '';
                    const an = aT.team?.displayName || aT.team?.name || '';
                    if (clientTeamCountryConflict(slug, hn, an)) continue;
                }

                if (globalSeenMatchSig.has(sig)) {
                    const canonical = globalSeenMatchSig.get(sig);
                    if (canonical.id !== ev.id) continue; // Skip inferior duplicate
                }

                const { home } = competitorsFromEvent(ev);
                const hLogo = home.team?.logo || ev.home?.logo || '';
                const evScore = (hLogo.includes('espncdn') ? 3 : 0) + (/^\d{6,}$/.test(String(ev.id)) ? 2 : 0);

                let matchedKey = seenMatchSig.has(sig) ? sig : null;
                if (!matchedKey) {
                    for (const k of seenMatchSig.keys()) {
                        if (signatureFuzzyMatch(sig, k)) { matchedKey = k; break; }
                    }
                }
                if (!matchedKey) {
                    seenMatchSig.set(sig, { event: ev, score: evScore });
                } else {
                    const existing = seenMatchSig.get(matchedKey);
                    const winner = evScore > existing.score ? ev : existing.event;
                    const secondary = evScore > existing.score ? existing.event : ev;

                    // Merge crests & live telemetry between duplicates
                    const { home: wH, away: wA } = competitorsFromEvent(winner);
                    const { home: sH, away: sA } = competitorsFromEvent(secondary);
                    if ((!wH.team?.logo || /placeholder|default.?crest|unknown/i.test(wH.team.logo)) && sH.team?.logo) {
                        if (wH.team) wH.team.logo = sH.team.logo;
                        if (winner.home) winner.home.logo = sH.team.logo;
                    }
                    if ((!wA.team?.logo || /placeholder|default.?crest|unknown/i.test(wA.team.logo)) && sA.team?.logo) {
                        if (wA.team) wA.team.logo = sA.team.logo;
                        if (winner.away) winner.away.logo = sA.team.logo;
                    }

                    seenMatchSig.delete(matchedKey);
                    seenMatchSig.set(sig, { event: winner, score: Math.max(existing.score, evScore) });
                }
            }
            // Promote winners into global set so the same fixture cannot reappear under another league header
            for (const [sig, entry] of seenMatchSig) {
                if (!globalSeenMatchSig.has(sig) || (entry.score > (globalSeenMatchSig.get(sig).score || 0))) {
                    globalSeenMatchSig.set(sig, { id: entry.event.id, score: entry.score });
                }
            }
            const dedupedEvents = Array.from(seenMatchSig.values())
                .filter(e => {
                    const sig = getEventDedupSignature(e.event);
                    const g = globalSeenMatchSig.get(sig);
                    return (!g || g.id === e.event.id) && !globallyRenderedSignatures.has(sig) && (!e.event.id || !globallyRenderedIds.has(String(e.event.id)));
                })
                .map(e => e.event);
            if (!dedupedEvents.length) return '';

            // Mark rendered to ensure zero cross-league match duplication
            for (const ev of dedupedEvents) {
                const sig = getEventDedupSignature(ev);
                if (sig && sig !== '_vs_') globallyRenderedSignatures.add(sig);
                if (ev.id) globallyRenderedIds.add(String(ev.id));
            }

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
            const nextHtml = pinnedHtml + html;
            if (elements['fixtures-list'].innerHTML === nextHtml) {
                if (fixturesContainer) fixturesContainer.style.minHeight = '';
                return;
            }

            if (background && isUserInteracting && elements['fixtures-list'].children.length > 0) {
                setTimeout(() => {
                    if (elements['fixtures-list']) {
                        renderAllLeaguesGrouped(groupedData, { background: false });
                    }
                }, 450);
                return;
            }

            if (elements['fixtures-empty']) elements['fixtures-empty'].hidden = true;
            elements['fixtures-list'].innerHTML = nextHtml;

            if (prevScrollY > 0 && !isUserInteracting) {
                // Lock scroll position across live re-renders without jumping
                try { window.scrollTo({ top: prevScrollY, left: 0, behavior: 'instant' }); } catch(_) { window.scrollTo(0, prevScrollY); }
                requestAnimationFrame(() => {
                    if (fixturesContainer) fixturesContainer.style.minHeight = '';
                });
            } else if (fixturesContainer) {
                fixturesContainer.style.minHeight = '';
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
        renderMobileDrawer(slug);
        window.clearInterval(state.matchTimer);
        updateLeagueCard(league);
        if (elements['welcome-state']) elements['welcome-state'].hidden = true;
        if (elements['league-dashboard']) elements['league-dashboard'].hidden = false;
        if (elements['dashboard-country']) elements['dashboard-country'].textContent = localCountryName(league.country);
        if (elements['dashboard-title']) elements['dashboard-title'].textContent = league.name;

        // Clear global feed immediately so it does not flash under the league view
        if (elements['fixtures-list']) {
            elements['fixtures-list'].style.minHeight = '';
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
        if (fixturesContainer) {
            fixturesContainer.style.minHeight = '';
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

        const nextHtml = `
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

        if (elements['fixtures-list'].innerHTML === nextHtml) {
            if (fixturesContainer) fixturesContainer.style.minHeight = '';
            return;
        }

        if (elements['fixtures-empty']) elements['fixtures-empty'].hidden = true;
        elements['fixtures-list'].innerHTML = nextHtml;

        if (prevScrollY > 0 && !isUserInteracting) {
            try { window.scrollTo({ top: prevScrollY, left: 0, behavior: 'instant' }); } catch(_) { window.scrollTo(0, prevScrollY); }
            requestAnimationFrame(() => {
                if (fixturesContainer) fixturesContainer.style.minHeight = '';
            });
        } else if (fixturesContainer) {
            fixturesContainer.style.minHeight = '';
        }
    }

    function renderFlashscoreMatchRow(event, league = null) {
        const { home, away } = competitorsFromEvent(event);
        // Force crest URLs from any known path (API often has home.logo while team.logo empty)
        if (home.team && !home.team.logo) {
            home.team.logo = event.home?.logo || event.home?.team?.logo || home.logo || '';
        }
        if (away.team && !away.team.logo) {
            away.team.logo = event.away?.logo || event.away?.team?.logo || away.logo || '';
        }
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

        const subTabsHtml = renderLeagueSubnavTabs('table');

        elements['standings-content'].innerHTML = subTabsHtml + groups.map(group => {
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
                                            <div class="club-cell" style="cursor:pointer;" onclick="openClubHub('${escapeHtml(entry.team?.displayName || entry.team?.name || '')}', '${escapeHtml(entry.team?.logo || '')}', '${escapeHtml(state.league?.slug || '')}')">
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

    function renderLeagueSubnavTabs(activeTab = 'table') {
        return `
            <div class="league-subnav-tabs" style="display:flex; gap:8px; margin-bottom:18px; border-bottom:1px solid var(--border-subtle); padding-bottom:8px; overflow-x:auto;">
                <button type="button" class="btn-subnav-tab ${activeTab === 'table' ? 'active' : ''}" style="background:${activeTab === 'table' ? 'var(--color-primary)' : 'var(--bg-surface-elevated)'}; color:${activeTab === 'table' ? '#fff' : 'var(--text-main)'}; border:1px solid var(--border-subtle); border-radius:6px; padding:6px 14px; font-size:12.5px; font-weight:700; cursor:pointer;" onclick="window.switchLeagueTab('table')">📋 Standings Table</button>
                <button type="button" class="btn-subnav-tab ${activeTab === 'leaders' ? 'active' : ''}" style="background:${activeTab === 'leaders' ? 'var(--color-primary)' : 'var(--bg-surface-elevated)'}; color:${activeTab === 'leaders' ? '#fff' : 'var(--text-main)'}; border:1px solid var(--border-subtle); border-radius:6px; padding:6px 14px; font-size:12.5px; font-weight:700; cursor:pointer;" onclick="window.switchLeagueTab('leaders')">👟 Top Scorers</button>
                <button type="button" class="btn-subnav-tab ${activeTab === 'bracket' ? 'active' : ''}" style="background:${activeTab === 'bracket' ? 'var(--color-primary)' : 'var(--bg-surface-elevated)'}; color:${activeTab === 'bracket' ? '#fff' : 'var(--text-main)'}; border:1px solid var(--border-subtle); border-radius:6px; padding:6px 14px; font-size:12.5px; font-weight:700; cursor:pointer;" onclick="window.switchLeagueTab('bracket')">🏆 Bracket</button>
            </div>
        `;
    }

    window.switchLeagueTab = async function(tab) {
        state.activeLeagueSubTab = tab;
        const container = elements['standings-content'];
        if (!container) return;

        if (tab === 'table') {
            renderStandings(state.standings || []);
            return;
        }

        if (tab === 'leaders') {
            container.innerHTML = `
                ${renderLeagueSubnavTabs('leaders')}
                <div class="content-state"><span class="loader"></span><p>Loading top scorers &amp; assists...</p></div>
            `;
            try {
                const leagueSlug = state.league?.slug || 'eng.1';
                const data = await fetchJson(`/api/v1/football/leagues/${encodeURIComponent(leagueSlug)}/leaders`);
                const scorers = data.topScorers || [];
                const assists = data.topAssists || [];

                container.innerHTML = `
                    ${renderLeagueSubnavTabs('leaders')}
                    <div style="display:flex; flex-direction:column; gap:24px;">
                        <section class="standing-group">
                            <h3 style="margin-bottom:12px; font-size:16px; font-weight:700;">👟 Golden Boot &bull; Top Goalscorers</h3>
                            <div class="standings-table-container">
                                <table class="standings-table">
                                    <thead>
                                        <tr>
                                            <th style="width:40px;">#</th>
                                            <th>Player</th>
                                            <th>Club</th>
                                            <th>Goals</th>
                                            <th>Pens</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${scorers.length > 0 ? scorers.map(p => `
                                            <tr>
                                                <td style="font-weight:700; color:var(--text-muted);">${escapeHtml(p.rank)}</td>
                                                <td style="font-weight:700; color:var(--text-main);">${escapeHtml(p.name)}</td>
                                                <td>
                                                    <div class="club-cell" style="cursor:pointer;" onclick="openClubHub('${escapeHtml(p.team)}', '${escapeHtml(p.teamLogo || '')}', '${escapeHtml(leagueSlug)}')">
                                                        ${p.teamLogo ? `<img src="${escapeHtml(p.teamLogo)}" class="club-crest-small" alt="${escapeHtml(p.team)}" onerror="this.src='/crests/fallback-shield.svg'">` : ''}
                                                        <span>${escapeHtml(p.team)}</span>
                                                    </div>
                                                </td>
                                                <td style="font-weight:800; color:var(--color-primary); font-size:14px;">${escapeHtml(p.goals)}</td>
                                                <td style="color:var(--text-muted);">${escapeHtml(p.penalties || 0)}</td>
                                            </tr>
                                        `).join('') : '<tr><td colspan="5" style="text-align:center; padding:16px; color:var(--text-muted);">No goalscorers recorded yet.</td></tr>'}
                                    </tbody>
                                </table>
                            </div>
                        </section>

                        ${assists.length > 0 ? `
                            <section class="standing-group">
                                <h3 style="margin-bottom:12px; font-size:16px; font-weight:700;">🎯 Top Playmakers &bull; Assists</h3>
                                <div class="standings-table-container">
                                    <table class="standings-table">
                                        <thead>
                                            <tr>
                                                <th style="width:40px;">#</th>
                                                <th>Player</th>
                                                <th>Club</th>
                                                <th>Assists</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${assists.map(p => `
                                                <tr>
                                                    <td style="font-weight:700; color:var(--text-muted);">${escapeHtml(p.rank)}</td>
                                                    <td style="font-weight:700; color:var(--text-main);">${escapeHtml(p.name)}</td>
                                                    <td>
                                                        <div class="club-cell" style="cursor:pointer;" onclick="openClubHub('${escapeHtml(p.team)}', '${escapeHtml(p.teamLogo || '')}', '${escapeHtml(leagueSlug)}')">
                                                            ${p.teamLogo ? `<img src="${escapeHtml(p.teamLogo)}" class="club-crest-small" alt="${escapeHtml(p.team)}" onerror="this.src='/crests/fallback-shield.svg'">` : ''}
                                                            <span>${escapeHtml(p.team)}</span>
                                                        </div>
                                                    </td>
                                                    <td style="font-weight:800; color:#3b82f6; font-size:14px;">${escapeHtml(p.assists)}</td>
                                                </tr>
                                            `).join('')}
                                        </tbody>
                                    </table>
                                </div>
                            </section>
                        ` : ''}
                    </div>
                `;
            } catch (err) {
                container.innerHTML = `
                    ${renderLeagueSubnavTabs('leaders')}
                    <p style="color:var(--text-muted); padding:16px;">Unable to load leaders: ${escapeHtml(err.message)}</p>
                `;
            }
            return;
        }

        if (tab === 'bracket') {
            container.innerHTML = `
                ${renderLeagueSubnavTabs('bracket')}
                <div class="content-state"><span class="loader"></span><p>Loading tournament bracket...</p></div>
            `;
            try {
                const leagueSlug = state.league?.slug || '';
                const data = await fetchJson(`/api/v1/football/leagues/${encodeURIComponent(leagueSlug)}/bracket`);
                const rounds = data.rounds || [];

                container.innerHTML = `
                    ${renderLeagueSubnavTabs('bracket')}
                    ${rounds.length > 0 ? `
                        <div class="tournament-bracket-tree" style="display:flex; gap:16px; overflow-x:auto; padding-bottom:16px;">
                            ${rounds.map(round => `
                                <div class="bracket-column" style="min-width:240px; flex:1 0 240px; display:flex; flex-direction:column; gap:12px;">
                                    <div style="text-align:center; padding:8px; background:var(--bg-canvas); border:1px solid var(--border-subtle); border-radius:8px; font-weight:700; font-size:13px; color:var(--text-main);">
                                        ${escapeHtml(round.name)}
                                    </div>
                                    <div style="display:flex; flex-direction:column; gap:10px; justify-content:space-around; flex:1;">
                                        ${round.matches.map(m => `
                                            <div class="bracket-match-card" style="background:var(--bg-canvas); border:1px solid var(--border-subtle); border-radius:8px; padding:10px; cursor:pointer;" onclick="openMatch('${escapeHtml(m.id)}', '${escapeHtml(leagueSlug)}')">
                                                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; font-size:12px;">
                                                    <span style="font-weight:${(m.home?.score ?? 0) > (m.away?.score ?? 0) ? '700' : '500'}; color:var(--text-main);">${escapeHtml(m.home?.displayName || m.home?.name || 'Home')}</span>
                                                    <strong style="color:var(--color-primary);">${m.status?.completed ? (m.home?.score ?? 0) : '—'}</strong>
                                                </div>
                                                <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px;">
                                                    <span style="font-weight:${(m.away?.score ?? 0) > (m.home?.score ?? 0) ? '700' : '500'}; color:var(--text-main);">${escapeHtml(m.away?.displayName || m.away?.name || 'Away')}</span>
                                                    <strong style="color:var(--color-primary);">${m.status?.completed ? (m.away?.score ?? 0) : '—'}</strong>
                                                </div>
                                                <div style="font-size:10.5px; color:var(--text-muted); margin-top:4px; text-align:right;">
                                                    ${escapeHtml(m.status?.displayClock || m.status?.detail || (m.status?.completed ? 'FT' : 'Scheduled'))}
                                                </div>
                                            </div>
                                        `).join('')}
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    ` : `
                        <div style="text-align:center; padding:32px 16px; background:var(--bg-canvas); border:1px solid var(--border-subtle); border-radius:10px;">
                            <span style="font-size:32px;">🏆</span>
                            <h4 style="margin:8px 0 4px; color:var(--text-main);">Tournament Knockout Bracket</h4>
                            <p style="font-size:13px; color:var(--text-muted); margin:0;">Tournament tree brackets are available for cup &amp; knockout competitions (e.g. Champions League, AFCON, FA Cup). This competition is a round-robin league.</p>
                        </div>
                    `}
                `;
            } catch (err) {
                container.innerHTML = `
                    ${renderLeagueSubnavTabs('bracket')}
                    <p style="color:var(--text-muted); padding:16px;">Unable to load tournament bracket: ${escapeHtml(err.message)}</p>
                `;
            }
        }
    };

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

        // Instant optimistic render from in-memory fixture / live match list (<50ms)
        const liveMatch = (state.liveMatches || []).find(m => String(m.id || m.source?.event_id) === String(eventId));
        const fixtureMatch = (state.fixtures || []).find(m => String(m.id || m.source?.event_id) === String(eventId));
        const matchObj = liveMatch || fixtureMatch;

        // Instant render from client cache if available (only if fresh and not stale pre-match masking an in-play game)
        const cached = matchDetailsClientCache.get(String(eventId));
        const cachedCompStatus = cached?.summary?.header?.competitions?.[0]?.status || {};
        const cachedIsPrematch = cachedCompStatus?.type?.state === 'pre' || cachedCompStatus?.state === 'pre' || cachedCompStatus?.state === 'scheduled';
        const isCurrentlyLive = Boolean(liveMatch || (matchObj?.status?.state === 'in') || (matchObj?.status?.isLive));

        if (cached && (Date.now() - cached.ts < 60000) && (!isCurrentlyLive || !cachedIsPrematch)) {
            renderMatchDetails(cached.summary, cached.plays, cached.predictions, false);
            // Re-fetch in background silently to ensure fresh clock/incidents
            loadMatchDetails(eventId, true, leagueSlug, matchObj);
            return;
        }

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
                        league: { name: cleanCompetitionName(matchObj.note || state.league?.name || '') }
                    }]
                },
                gameInfo: {
                    venue: (matchObj.venue && matchObj.venue.name && !/stadium\s*venue|unknown/i.test(matchObj.venue.name)) ? matchObj.venue : null
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
            loadMatchDetails(eventId, true, leagueSlug, matchObj);
            return;
        }

        await loadMatchDetails(eventId, false, leagueSlug, matchObj);
    }

    async function loadMatchDetails(eventId, silent, leagueSlug = '', matchContext = null) {
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

        const hName = matchContext?.home?.displayName || matchContext?.home?.name || '';
        const aName = matchContext?.away?.displayName || matchContext?.away?.name || '';
        const predQuery = (hName && aName) ? `?home=${encodeURIComponent(hName)}&away=${encodeURIComponent(aName)}&league=${encodeURIComponent(slug)}` : '';
        const base = `/get/soccer/${encodeURIComponent(slug)}/events/${encodeURIComponent(eventId)}`;
        const [summaryResult, playsResult, predResult] = await Promise.allSettled([
            fetchJson(base),
            fetchJson(`${base}/plays?important=true&limit=300`),
            fetchJson(`/api/v1/football/predictions-context/${encodeURIComponent(eventId)}${predQuery}`)
        ]);

        if (state.currentEventId !== eventId) return;

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

        if (state.currentEventId !== eventId) return;

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
        const type = `${event.type?.type || ''} ${event.type?.text || ''} ${event.text || ''}`.toLowerCase();
        if (type.includes('var') || type.includes('video assistant')) return 'var';
        if (event.penaltyKick || type.includes('penalty')) return 'penalty';
        if (event.scoringPlay || type.includes('goal')) return 'goal';
        if (event.redCard || type.includes('red card')) return 'red-card';
        if (event.yellowCard || type.includes('yellow card')) return 'yellow-card';
        if (event.substitution || type.includes('substitution') || type.includes('sub')) return 'substitution';
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

    function parseTimelineClockMinute(raw, text = '') {
        if (raw === null || raw === undefined) raw = '';
        const str = String(raw).trim();
        // 1. Check for stoppage time like 45+2', 45+2, 90+4'
        const stoppageMatch = str.match(/^(\d{1,3})\s*\+\s*(\d{1,2})/);
        if (stoppageMatch) {
            return parseInt(stoppageMatch[1], 10) + (parseInt(stoppageMatch[2], 10) * 0.01);
        }
        // 2. Check for regular minute like 45', 84
        const minMatch = str.match(/^(\d{1,3})/);
        if (minMatch) {
            return parseInt(minMatch[1], 10);
        }
        // 3. Named milestones
        const lower = (str + ' ' + (text || '')).toLowerCase();
        if (lower.includes('ht') || lower.includes('half') || lower.includes('halftime')) {
            return 45.99;
        }
        if (lower.includes('ft') || lower.includes('full') || lower.includes('fulltime') || lower.includes('ended')) {
            return 999;
        }
        // 4. Try extracting minute from text (e.g. "Goal (48')", "Substitution 84'", "45+2' yellow card")
        if (text) {
            const textStoppage = String(text).match(/\b(\d{1,3})\s*\+\s*(\d{1,2})['’]?\b/);
            if (textStoppage) {
                return parseInt(textStoppage[1], 10) + (parseInt(textStoppage[2], 10) * 0.01);
            }
            const textMin = String(text).match(/\b(\d{1,3})['’]?\b/);
            if (textMin) {
                const m = parseInt(textMin[1], 10);
                if (m <= 130) return m;
            }
        }
        return 0;
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

        let clockDisplay = typeof event.clock === 'string'
            ? event.clock.trim()
            : String(event.clock?.displayValue || event.clock?.display_value || event.time?.displayValue || '').trim();
        if (!clockDisplay && event.clock && typeof event.clock === 'object' && event.clock.value != null && Number(event.clock.value) > 0) {
            const cv = Number(event.clock.value);
            clockDisplay = cv > 180 ? `${Math.floor(cv / 60)}'` : `${Math.round(cv)}'`;
        }
        if (!clockDisplay && event.clockValue && Number(event.clockValue) > 0) {
            const cv = Number(event.clockValue);
            clockDisplay = cv > 180 ? `${Math.floor(cv / 60)}'` : `${Math.round(cv)}'`;
        }
        if (!clockDisplay && event.minute) {
            clockDisplay = `${String(event.minute).replace(/['’]+$/g, '')}'`;
        }
        if (!clockDisplay && cleanText) {
            const m = cleanText.match(/\b(\d{1,3}(?:\+\d{1,2})?)['’]\b/) || cleanText.match(/\b(\d{1,2}(?:\+\d{1,2})?)\s*(?:min|minute)/i);
            if (m && parseInt(m[1], 10) > 0 && parseInt(m[1], 10) <= 130) {
                clockDisplay = `${m[1]}'`;
            }
        }
        if (!clockDisplay && kind === 'substitution' && (event.period?.number === 2 || event.period === 2)) {
            clockDisplay = 'HT';
        }

        const clockValue = typeof event.clockValue === 'number' && event.clockValue > 0
            ? event.clockValue
            : parseTimelineClockMinute(clockDisplay, cleanText);

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
        const rawKeyEvents = [];
        const seenRawKeyIds = new Set();
        for (const ev of [...(summary.keyEvents || []), ...(summary.header?.competitions?.[0]?.details || [])]) {
            const rawId = ev.id || `${ev.clock?.displayValue || ev.clock}_${ev.text}_${ev.type?.text}`;
            if (!seenRawKeyIds.has(rawId)) {
                seenRawKeyIds.add(rawId);
                rawKeyEvents.push(ev);
            }
        }
        const keyEvents = rawKeyEvents.map((event, index) =>
            normalizeMatchEvent(event, index, 'key-event', home, away));
        const playEvents = (plays || []).map((event, index) =>
            normalizeMatchEvent(event, index, 'play', home, away));

        const events = [];
        const seenIncidents = new Map();

        for (const event of [...keyEvents, ...playEvents]) {
            const teamSide = event.team?.side || (event.team?.id && String(event.team.id) === String(home.team?.id) ? 'home' : (event.team?.id && String(event.team.id) === String(away.team?.id) ? 'away' : ''));
            const teamId = teamSide || String(event.team?.id || event.team?.source_id || event.team?.displayName || event.team?.name || '').toLowerCase();
            const minute = event.clockValue || parseTimelineClockMinute(event.clock, event.text) || 0;

            // Format display clock if raw seconds
            if (typeof event.clock === 'string' && /^\d{3,}$/.test(event.clock.trim())) {
                const num = Number(event.clock.trim());
                event.clock = `${Math.floor(num / 60)}'`;
            }

            const athleteName = (event.athlete?.displayName || event.athlete?.fullName || '').toLowerCase().trim();
            const normalizedTextKey = String(event.text || '').toLowerCase().replace(/[^a-z0-9]/g, '');

            // Robust duplicate detection across identical text or matching kind+minute
            let isDuplicate = false;
            for (const [key, existing] of seenIncidents.entries()) {
                const exNorm = String(existing.text || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                if (normalizedTextKey && exNorm && normalizedTextKey === exNorm) {
                    isDuplicate = true;
                    if ((!existing.clock || existing.clock === '—') && event.clock && event.clock !== '—') {
                        existing.clock = event.clock;
                        existing.clockValue = event.clockValue;
                    }
                    if (!existing.team && event.team) existing.team = event.team;
                    break;
                }
                const exMin = existing.clockValue || parseTimelineClockMinute(existing.clock, existing.text) || 0;
                const exSide = existing.team?.side || '';
                const exAthlete = (existing.athlete?.displayName || existing.athlete?.fullName || '').toLowerCase().trim();
                if (existing.kind === event.kind && Math.abs(exMin - minute) <= 1.5 && (!teamSide || !exSide || teamSide === exSide)) {
                    if ((athleteName && exAthlete && (athleteName.includes(exAthlete) || exAthlete.includes(athleteName))) || (!athleteName && !exAthlete)) {
                        isDuplicate = true;
                        if ((!existing.clock || existing.clock === '—') && event.clock && event.clock !== '—') {
                            existing.clock = event.clock;
                            existing.clockValue = event.clockValue;
                        }
                        if (!existing.team && event.team) existing.team = event.team;
                        break;
                    }
                }
            }

            if (isDuplicate) continue;
            seenIncidents.set(event.id || `${event.kind}-${minute}-${events.length}`, event);
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
            var: '<span class="event-badge var" style="background:#7c3aed; color:#ffffff; font-weight:700; padding:2px 6px; border-radius:4px; font-size:11px;">📺 VAR</span>',
            penalty: '<span class="event-badge penalty" style="background:#0284c7; color:#ffffff; font-weight:700; padding:2px 6px; border-radius:4px; font-size:11px;">🎯 PENALTY</span>',
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
        const compStatusObj = competition.status || {};
        const isLiveGame = status.state === 'live' || status.state === 'in' || compStatusObj.state === 'in' || status.isLive || Boolean(compStatusObj.isLive);
        const hasScoreOrClock = (home.score != null && home.score !== '' && home.score !== '—') || (status.label && !/upcoming|sched/i.test(status.label));
        const isFinishedGame = status.state === 'finished' || compStatusObj.completed || compStatusObj.state === 'post';
        const isPreMatch = (status.state === 'scheduled' || (!isLiveGame && !isFinishedGame)) && !hasScoreOrClock;
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

        const statNames = [...new Set([...homeStats, ...awayStats].map(item => item.name))].slice(0, 14);
        const statRows = statNames.map(name => {
            const homeItem = homeStats.find(item => item.name === name);
            const awayItem = awayStats.find(item => item.name === name);
            const homeVal = Number(String(homeItem?.displayValue || homeItem?.value || 0).replace('%', ''));
            const awayVal = Number(String(awayItem?.displayValue || awayItem?.value || 0).replace('%', ''));
            const total = (homeVal + awayVal) || 1;
            const homePct = Math.min(95, Math.max(5, Math.round((homeVal / total) * 100)));
            const awayPct = 100 - homePct;
            const isHomeLeading = homeVal > awayVal;
            const isAwayLeading = awayVal > homeVal;

            return `
                <div class="stat-row" style="margin-bottom:12px; background:var(--bg-canvas); border:1px solid var(--border-subtle); border-radius:8px; padding:10px 14px;">
                    <div class="stat-title-row" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; font-size:13px;">
                        <span style="font-weight:700; ${isHomeLeading ? 'color:#10b981; font-size:14px;' : 'color:var(--text-muted);'}">${escapeHtml(homeItem?.displayValue ?? '—')}</span>
                        <span style="text-transform:uppercase; font-size:11px; letter-spacing:0.6px; font-weight:600; color:var(--text-muted); text-align:center;">${escapeHtml(statLabels[name] || name)}</span>
                        <span style="font-weight:700; ${isAwayLeading ? 'color:#3b82f6; font-size:14px;' : 'color:var(--text-muted);'}">${escapeHtml(awayItem?.displayValue ?? '—')}</span>
                    </div>
                    <div class="stat-bar-track" style="height:8px; background:var(--bg-surface-elevated); border-radius:4px; overflow:hidden; display:flex;">
                        <div class="stat-bar-home" style="width:${homePct}%; background:${isHomeLeading ? 'linear-gradient(90deg, #10b981, #059669)' : 'rgba(16, 185, 129, 0.45)'}; transition:width 0.4s ease;"></div>
                        <div class="stat-bar-away" style="width:${awayPct}%; background:${isAwayLeading ? 'linear-gradient(90deg, #2563eb, #3b82f6)' : 'rgba(59, 130, 246, 0.45)'}; transition:width 0.4s ease;"></div>
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

        const timelineRows = (() => {
            const dedupedEvents = [];
            for (const event of events) {
                const eventText = String(event.text || '').toLowerCase();
                let kind = String(event.kind || event.type || '').toLowerCase();
                if (event.scoringPlay || eventText.includes('goal') || kind.includes('goal')) {
                    kind = 'goal';
                    event.kind = 'goal';
                } else if (event.redCard || eventText.includes('red card') || kind.includes('red')) {
                    kind = 'red-card';
                    event.kind = 'red-card';
                } else if (event.yellowCard || eventText.includes('yellow card') || kind.includes('yellow')) {
                    kind = 'yellow-card';
                    event.kind = 'yellow-card';
                } else if (event.substitution || eventText.includes('substitut') || kind.includes('sub')) {
                    kind = 'substitution';
                    event.kind = 'substitution';
                }

                const minuteNum = parseTimelineClockMinute(event.clock || event.minute || event.clockValue, event.text);
                const side = event.team?.side || (event.team?.id && String(event.team.id) === String(home.team?.id) ? 'home' : (event.team?.id && String(event.team.id) === String(away.team?.id) ? 'away' : ''));
                const player = (event.athlete?.displayName || event.athlete?.fullName || event.player || '').trim().toLowerCase();
                const hasDetailedPlayer = Boolean(player && !/^event$/i.test(player));

                // Deduplicate: check if already in dedupedEvents
                let matchedIndex = -1;
                const cleanCurText = String(event.text || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                for (let i = 0; i < dedupedEvents.length; i++) {
                    const ex = dedupedEvents[i];
                    const cleanExText = String(ex.text || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                    if (cleanCurText && cleanExText && cleanCurText === cleanExText) {
                        matchedIndex = i;
                        break;
                    }
                    const exMin = parseTimelineClockMinute(ex.clock || ex.minute || ex.clockValue, ex.text);
                    const exSide = ex.team?.side || (ex.team?.id && String(ex.team.id) === String(home.team?.id) ? 'home' : (ex.team?.id && String(ex.team.id) === String(away.team?.id) ? 'away' : ''));
                    const exKind = ex.kind;
                    const exPlayer = (ex.athlete?.displayName || ex.athlete?.fullName || ex.player || '').trim().toLowerCase();

                    if (exKind === kind && (!side || !exSide || side === exSide)) {
                        const closeTime = Math.abs(exMin - minuteNum) <= 1.5;
                        const samePlayer = (player && exPlayer) ? (player.includes(exPlayer) || exPlayer.includes(player)) : (Boolean(player || exPlayer) ? (cleanCurText.includes(exPlayer) || cleanExText.includes(player)) : true);
                        if (closeTime && samePlayer) {
                            matchedIndex = i;
                            break;
                        }
                    }
                }

                if (matchedIndex >= 0) {
                    const existing = dedupedEvents[matchedIndex];
                    if ((!existing.clock || existing.clock === '—') && event.clock && event.clock !== '—') {
                        existing.clock = event.clock;
                        existing.clockValue = event.clockValue;
                    }
                    if (!existing.team && event.team) {
                        existing.team = event.team;
                    }
                    const existingHasPlayer = Boolean((existing.athlete?.displayName || existing.player || '').trim());
                    if (!existingHasPlayer && hasDetailedPlayer) {
                        existing.athlete = event.athlete;
                        existing.text = event.text;
                    }
                } else {
                    dedupedEvents.push(event);
                }
            }

            dedupedEvents.sort((x, y) => {
                const ma = parseTimelineClockMinute(x.clock || x.minute || x.clockValue, x.text);
                const mb = parseTimelineClockMinute(y.clock || y.minute || y.clockValue, y.text);
                return ma - mb;
            });
            return dedupedEvents.map(event => {
                let text = String(event.text || '').trim();
                const kind = String(event.kind || event.type || '').toLowerCase();
                const player = event.athlete?.displayName || event.player || '';
                if (!text || /^event$/i.test(text) || /^goal$/i.test(text)) {
                    if (kind.includes('goal')) text = player ? `Goal! ${player}` : 'Goal!';
                    else if (kind.includes('yellow')) text = player ? `Yellow card — ${player}` : 'Yellow card';
                    else if (kind.includes('red')) text = player ? `Red card — ${player}` : 'Red card';
                    else if (kind.includes('sub')) text = 'Substitution';
                    else if (kind.includes('var')) text = 'VAR check';
                    else if (kind.includes('pen')) text = player ? `Penalty — ${player}` : 'Penalty';
                    else if (kind.includes('kick')) text = 'Kick-off';
                    else if (kind.includes('half') || kind.includes('ht')) text = 'Half-time';
                    else if (kind.includes('end') || kind.includes('ft')) text = 'Full-time';
                    else text = player ? `Match incident — ${player}` : 'Match incident';
                }
                const displayMinute = String(event.clock || '').trim() || (event.clockValue > 0 ? `${Math.round(event.clockValue)}'` : '—');
                return `<div class="timeline-item">
                <span class="timeline-minute">${escapeHtml(displayMinute)}</span>
                ${eventBadge(event.kind)}
                <div class="timeline-details">
                    <p style="margin:0;">${escapeHtml(text)}</p>
                    ${event.team?.displayName || event.team?.name ? `<small style="color:var(--text-muted);">${escapeHtml(event.team.displayName || event.team.name)}</small>` : ''}
                </div>
            </div>`;
            }).join('');
        })();

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
        let recentH2h = h2h.allMeetings || h2h.recentMeetings || [];

        // Ensure finished games count into all-time H2H count & meetings list
        if (isFinishedGame && home.score != null && away.score != null) {
            const hScore = Number(home.score);
            const aScore = Number(away.score);
            const curEvId = String(summary.header?.id || state.currentEventId || '');
            const curDateStr = competition.date ? new Date(competition.date).toDateString() : '';
            const alreadyInRecent = recentH2h.some(m => String(m.id) === curEvId || (curDateStr && m.date && new Date(m.date).toDateString() === curDateStr));
            if (!alreadyInRecent && !isNaN(hScore) && !isNaN(aScore)) {
                const winner = hScore === aScore ? 'Draw' : (hScore > aScore ? (home.team?.displayName || 'Home') : (away.team?.displayName || 'Away'));
                recentH2h = [{
                    id: curEvId,
                    date: competition.date || new Date().toISOString(),
                    homeTeam: home.team?.displayName || 'Home',
                    awayTeam: away.team?.displayName || 'Away',
                    homeLogo: home.team?.logo || '',
                    awayLogo: away.team?.logo || '',
                    score: `${hScore} - ${aScore}`,
                    winner,
                    homeScore: hScore,
                    awayScore: aScore,
                    isHomeOriginal: true,
                    competition: competitionName || 'Match',
                    source: 'current'
                }, ...recentH2h];
            }
        }

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
                const seenDays = new Set();
                const validEvents = [];
                const normHome = cleanTeamNameForDedup(home.team?.displayName || home.team?.name || '');
                for (const ev of hL5.events) {
                    const opp = ev.opponent?.displayName || 'Opponent';
                    const oppNorm = cleanTeamNameForDedup(opp);
                    if (oppNorm && (oppNorm === normHome || (normHome.length >= 5 && oppNorm.includes(normHome)))) continue;
                    if (/\b(u-?1[5-9]|u-?2[0-3]|youth|reserves?|academy|primavera)\b/i.test(opp)) continue;
                    const day = ev.gameDate ? String(ev.gameDate).slice(0, 10) : (ev.date ? String(ev.date).slice(0, 10) : '');
                    if (day && seenDays.has(day)) continue;
                    if (day) seenDays.add(day);
                    validEvents.push(ev);
                }
                homeAnalytics.recentMatches = validEvents.map(ev => ({
                    date: ev.gameDate || ev.date || '',
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
                const seenDays = new Set();
                const validEvents = [];
                const normAway = cleanTeamNameForDedup(away.team?.displayName || away.team?.name || '');
                for (const ev of aL5.events) {
                    const opp = ev.opponent?.displayName || 'Opponent';
                    const oppNorm = cleanTeamNameForDedup(opp);
                    if (oppNorm && (oppNorm === normAway || (normAway.length >= 5 && oppNorm.includes(normAway)))) continue;
                    if (/\b(u-?1[5-9]|u-?2[0-3]|youth|reserves?|academy|primavera)\b/i.test(opp)) continue;
                    const day = ev.gameDate ? String(ev.gameDate).slice(0, 10) : (ev.date ? String(ev.date).slice(0, 10) : '');
                    if (day && seenDays.has(day)) continue;
                    if (day) seenDays.add(day);
                    validEvents.push(ev);
                }
                awayAnalytics.recentMatches = validEvents.map(ev => ({
                    date: ev.gameDate || ev.date || '',
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
            const seen = new Set();
            const seenDays = new Set();
            const deduped = [];
            for (const m of recentMatches) {
                const day = m.date ? String(m.date).slice(0, 10) : '';
                const opp = cleanTeamNameForDedup(m.opponent || '');
                const key = `${day}_${opp}`;
                if (key && seen.has(key)) continue;
                if (day && seenDays.has(day)) continue;
                if (key) seen.add(key);
                if (day) seenDays.add(day);
                deduped.push(m);
            }
            return `<div style="display:flex; flex-direction:column; gap:6px;">` +
                deduped.slice(0, 5).map(m => {
                    const resColor = m.result === 'W' ? '#10b981' : m.result === 'D' ? '#9ca3af' : '#ef4444';
                    const resBg = m.result === 'W' ? 'rgba(16,185,129,0.12)' : m.result === 'D' ? 'rgba(156,163,175,0.12)' : 'rgba(239,68,68,0.12)';
                    const venueLabel = m.venue === 'Away' || m.atVs === '@' ? '@' : 'vs';
                    const dateFormatted = m.date ? formatDate(m.date, { year: true, weekday: false }) : '';
                    return `<div style="display:flex; justify-content:space-between; align-items:center; padding:6px 10px; background:var(--bg-surface-elevated); border:1px solid var(--border-subtle); border-radius:6px; font-size:12px;">
                        <div style="display:flex; align-items:center; gap:6px; overflow:hidden;">
                            ${dateFormatted && dateFormatted !== 'Time unavailable' ? `<span style="font-size:10.5px; color:var(--text-muted); min-width:68px;">${dateFormatted}</span>` : ''}
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
                const scoreParts = String(meeting.score || '').replace(/[–—]/g, '-').split('-').map(s => parseInt(String(s).trim(), 10));
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

        const h2hMeetingsRows = (() => {
            const seenH2hRow = new Set();
            if (!recentH2h.length) return '';
            const uniqueMeetings = [];
            for (const m of recentH2h) {
                const rowKey = [m.date, m.homeTeam, m.awayTeam, m.score].join('|');
                if (!seenH2hRow.has(rowKey)) {
                    seenH2hRow.add(rowKey);
                    uniqueMeetings.push(m);
                }
            }
            if (!uniqueMeetings.length) return '';
            const displayed = uniqueMeetings.slice(0, 5);
            const remaining = uniqueMeetings.slice(5);

            const renderH2hItem = (m) => {
                const dateLabel = formatDate(m.date, { year: true, weekday: false });
                return `<div style="display:flex; justify-content:space-between; align-items:center; gap:8px; padding:10px 12px; background:var(--bg-canvas); border:1px solid var(--border-subtle); border-radius:8px; margin-bottom:8px; font-size:12.5px;">
                    <span style="color:var(--text-muted); font-size:11px; min-width:72px; flex-shrink:0;">${dateLabel}</span>
                    <span style="flex:1; text-align:right; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(m.homeTeam || '')}</span>
                    <span style="background:var(--bg-surface-elevated); border:1px solid var(--border-subtle); padding:3px 10px; border-radius:6px; font-weight:700; font-size:12px; flex-shrink:0;">${escapeHtml(m.score || '—')}</span>
                    <span style="flex:1; text-align:left; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(m.awayTeam || '')}</span>
                </div>`;
            };

            let out = displayed.map(renderH2hItem).join('');
            if (remaining.length > 0) {
                out += `
                    <div id="h2h-extra-meetings" style="display:none;">
                        ${remaining.map(renderH2hItem).join('')}
                    </div>
                    <button type="button" id="btn-toggle-h2h-all" onclick="(function(btn){var x=document.getElementById('h2h-extra-meetings');if(!x)return;var open=x.style.display!=='none';x.style.display=open?'none':'block';btn.textContent=open?'Show all ${uniqueMeetings.length} lifetime encounters (${remaining.length} more) ↓':'Show recent 5 only ↑';})(this)" style="display:block; width:100%; text-align:center; padding:9px 14px; background:var(--bg-surface-elevated); border:1px solid var(--border-subtle); border-radius:8px; font-size:12px; font-weight:600; color:var(--color-primary); cursor:pointer; margin-top:6px; transition:all 0.2s ease;">
                        Show all ${uniqueMeetings.length} lifetime encounters (${remaining.length} more) ↓
                    </button>
                `;
            }
            return out;
        })();

        const rosters = summary.rosters || [];
        const homeRoster = rosters.find(r => String(r.team?.id) === String(home.team?.id) || r.team?.side === 'home' || r.team?.homeAway === 'home') || rosters[0];
        const awayRoster = rosters.find(r => String(r.team?.id) === String(away.team?.id) || r.team?.side === 'away' || r.team?.homeAway === 'away') || rosters[1];

        function renderTacticalPitchHtml(teamRoster, teamName, isHome = true) {
            if (!teamRoster?.roster?.length) return '';
            const allPlayers = teamRoster.roster;
            let starters = allPlayers.filter(p => p.starter === true || p.starter === 'true' || p.starter === 1);
            if (starters.length < 11) starters = allPlayers.slice(0, 11);
            const squad = starters.slice(0, 11);
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
            if (gk.length > 1) {
                def.push(...gk.slice(1));
                gk.splice(1);
            }
            // Balance lines so no single line exceeds 5 players (prevents pitch player node squeezing)
            while (def.length > 5) {
                mid.unshift(def.pop());
            }
            while (fwd.length > 4) {
                mid.push(fwd.pop());
            }
            while (mid.length > 5) {
                if (def.length < 5) def.push(mid.shift());
                else if (fwd.length < 4) fwd.unshift(mid.pop());
                else break;
            }

            const formationStr = `${def.length}-${mid.length}-${fwd.length}`;
            const themeColor = isHome ? '#10b981' : '#3b82f6';

            function renderLinePlayers(players) {
                return players.map(p => {
                    const name = p.athlete?.displayName || p.athlete?.fullName || p.name || 'Player';
                    const parts = name.trim().split(' ');
                    const shortName = parts.length > 1 ? parts[parts.length - 1] : name;
                    const jersey = p.jersey || p.shirtNumber || '•';
                    return `
                        <div class="pitch-player-node" style="display:flex; flex-direction:column; align-items:center; text-align:center; min-width:0; flex:1 1 0; max-width:60px; z-index:2;">
                            <div style="width:25px; height:25px; border-radius:50%; background:${themeColor}; color:#ffffff; font-weight:800; font-size:11px; display:flex; align-items:center; justify-content:center; box-shadow:0 3px 6px rgba(0,0,0,0.4); border:2px solid #ffffff; flex-shrink:0;">
                                ${escapeHtml(jersey)}
                            </div>
                            <span style="font-size:9.5px; font-weight:700; color:#ffffff; text-shadow:0 1px 4px rgba(0,0,0,0.9); margin-top:3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:54px;">
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
            let starters = teamRoster.roster.filter(p => p.starter === true || p.starter === 'true' || p.starter === 1);
            let bench = teamRoster.roster.filter(p => !(p.starter === true || p.starter === 'true' || p.starter === 1));
            // Cap starters to maximum 11; if provider marked more than 11 players as starters, push excess to bench
            if (starters.length > 11) {
                bench = [...starters.slice(11), ...bench];
                starters = starters.slice(0, 11);
            } else if (starters.length < 11 && teamRoster.roster.length > 11) {
                const ordered = [...teamRoster.roster];
                starters = ordered.slice(0, 11);
                bench = ordered.slice(11);
                // If multiple GKs in starters, keep one GK in XI, push extras to bench
                const isGk = (p) => /gk|goa|goal/i.test(String(p.position?.abbreviation || p.athlete?.position?.abbreviation || ''));
                const gks = starters.filter(isGk);
                if (gks.length > 1) {
                    const keep = gks[0];
                    const extra = gks.slice(1);
                    starters = starters.filter(p => !extra.includes(p));
                    bench = [...extra, ...bench];
                }
            } else if (starters.length === 0) {
                starters = teamRoster.roster.slice(0, Math.min(11, teamRoster.roster.length));
                bench = teamRoster.roster.slice(11);
            }

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
            const hPoss = getStatVal(homeStats, 'possessionPct');
            const aPoss = getStatVal(awayStats, 'possessionPct');
            const hShotsOn = getStatVal(homeStats, 'shotsOnTarget');
            const aShotsOn = getStatVal(awayStats, 'shotsOnTarget');
            const hShots = getStatVal(homeStats, 'totalShots') || (hShotsOn + getStatVal(homeStats, 'shotsOffTarget'));
            const aShots = getStatVal(awayStats, 'totalShots') || (aShotsOn + getStatVal(awayStats, 'shotsOffTarget'));
            const hCorners = getStatVal(homeStats, 'wonCorners');
            const aCorners = getStatVal(awayStats, 'wonCorners');

            const hasRealStats = (homeStats.length + awayStats.length) > 0 && [hPoss, aPoss, hShotsOn, aShotsOn, hShots, aShots, hCorners, aCorners]
                .some(v => Number(v) > 0);
            let hMomentum = 50;
            let aMomentum = 50;
            let momentumVerdict = '';
            let momentumHtml = '';
            if (hasRealStats) {
                const hWeight = ((hPoss || 0) * 0.35) + ((hShotsOn || 0) * 5) + ((hShots || 0) * 2) + ((hCorners || 0) * 2.5);
                const aWeight = ((aPoss || 0) * 0.35) + ((aShotsOn || 0) * 5) + ((aShots || 0) * 2) + ((aCorners || 0) * 2.5);
                const totalWeight = (hWeight + aWeight) || 1;
                hMomentum = Math.min(92, Math.max(8, Math.round((hWeight / totalWeight) * 100)));
                aMomentum = 100 - hMomentum;
                momentumVerdict = '⚖️ Evenly Contested Attacking Momentum';
                if (hMomentum >= 65) momentumVerdict = `🔥 ${escapeHtml(home.team?.displayName || 'Home')} Dominating Attacking Pressure (+${hMomentum - 50}%)`;
                else if (aMomentum >= 65) momentumVerdict = `⚡ ${escapeHtml(away.team?.displayName || 'Away')} Dominating Attacking Pressure (+${aMomentum - 50}%)`;
                else if (hMomentum >= 54) momentumVerdict = `📈 ${escapeHtml(home.team?.displayName || 'Home')} Has the Attacking Edge`;
                else if (aMomentum >= 54) momentumVerdict = `📈 ${escapeHtml(away.team?.displayName || 'Away')} Has the Attacking Edge`;
            }

            const rawVenueCity = venue?.address?.city || '';
            const cityIsComp = /league|cup|friendl|championship|tournament|afcon|nations/i.test(rawVenueCity);
            const compCity = cityIsComp ? rawVenueCity : '';
            const cleanVenueCity = !cityIsComp ? rawVenueCity : '';
            const rawVenueName = venue?.fullName || venue?.name || '';
            const isFakeStadium = !rawVenueName || /^(stadium(\s+venue)?|unknown|tbd|tba|null|undefined)$/i.test(rawVenueName.trim());
            const cleanVenueName = !isFakeStadium ? (cleanVenueCity ? `${rawVenueName}, ${cleanVenueCity}` : rawVenueName) : (cleanVenueCity ? `Stadium (${cleanVenueCity})` : '');

            let competitionName = competition.league?.name ||
                summary.header?.league?.name ||
                summary.league?.name ||
                summary.league_name ||
                compCity ||
                (state.league?.slug && (state.league.slug === competition.league?.slug) ? state.league.name : '') ||
                (summary.note || summary.header?.season?.displayName || 'Football Competition');
            competitionName = cleanCompetitionName(competitionName);

            // Skip tearing down the modal DOM during silent background refreshes if nothing changed or user is mid-scroll
            if (silent && isUserInteracting && elements['dialog-content'].querySelector('.drawer-tabs')) {
                return;
            }
            const nextDialogHtml = `
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
                        ${cleanVenueName ? `${escapeHtml(cleanVenueName)} · ` : ''}
                        ${escapeHtml(competitionName)}
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
                    <div style="margin-top:14px; padding-top:10px; border-top:1px solid var(--border-subtle); display:flex; justify-content:space-between; align-items:center; font-size:11px; color:var(--text-muted);">
                        <span>Live telemetry &amp; incidents</span>
                        <a href="https://sportscore.com/" rel="dofollow" target="_blank" title="Powered by SportScore" aria-label="Powered by SportScore" style="display:inline-flex; align-items:center; gap:5px; text-decoration:none; color:inherit; font-weight:600;">
                            <span>Powered by</span>
                            <span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;background:#0a1e3d;color:#fff;border-radius:50%;font:700 0.62rem system-ui,sans-serif;">SS</span>
                        </a>
                    </div>
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
                        <div class="momentum-gauge-card" style="${hasRealStats ? '' : 'display:none;'}">
                            <div class="momentum-card-header">
                                <div class="momentum-title-wrap">
                                    <span class="momentum-icon" aria-hidden="true">⚡</span>
                                    <strong class="momentum-title">Live Match Momentum &amp; Attacking Pressure</strong>
                                </div>
                                <span class="momentum-verdict-pill">${momentumVerdict}</span>
                            </div>
                            <div class="momentum-teams-row">
                                <span class="momentum-team-home">
                                    <span class="momentum-team-name">${escapeHtml(home.team?.displayName || 'Home')}</span>
                                    <span class="momentum-pct-badge is-home">${hMomentum}%</span>
                                </span>
                                <span class="momentum-team-away">
                                    <span class="momentum-pct-badge is-away">${aMomentum}%</span>
                                    <span class="momentum-team-name">${escapeHtml(away.team?.displayName || 'Away')}</span>
                                </span>
                            </div>
                            <div class="momentum-bar-track" role="progressbar" aria-valuenow="${hMomentum}" aria-valuemin="0" aria-valuemax="100">
                                <div class="momentum-bar-fill is-home" style="width:${hMomentum}%;"></div>
                                <div class="momentum-bar-fill is-away" style="width:${aMomentum}%;"></div>
                            </div>
                            <div class="momentum-stats-grid">
                                <div class="momentum-stat-cell">
                                    <span class="momentum-stat-label">Possession</span>
                                    <div class="momentum-stat-values">
                                        <strong class="is-home">${hPoss}%</strong>
                                        <span class="momentum-stat-sep">vs</span>
                                        <strong class="is-away">${aPoss}%</strong>
                                    </div>
                                </div>
                                <div class="momentum-stat-cell">
                                    <span class="momentum-stat-label">Total Shots</span>
                                    <div class="momentum-stat-values">
                                        <strong class="is-home">${hShots}</strong>
                                        <span class="momentum-stat-sep">vs</span>
                                        <strong class="is-away">${aShots}</strong>
                                    </div>
                                </div>
                                <div class="momentum-stat-cell">
                                    <span class="momentum-stat-label">Corners</span>
                                    <div class="momentum-stat-values">
                                        <strong class="is-home">${hCorners}</strong>
                                        <span class="momentum-stat-sep">vs</span>
                                        <strong class="is-away">${aCorners}</strong>
                                    </div>
                                </div>
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
                            <div style="display:flex; justify-content:space-around; margin-top:10px; padding-top:8px; border-top:1px dashed var(--border-subtle); font-size:11.5px; color:var(--text-muted); flex-wrap:wrap; gap:8px;">
                                <span>Avg Goals: <strong style="color:var(--text-main);">${h2h.averageGoalsPerMatch || '—'}</strong></span>
                                <span>Both Teams Score (BTTS): <strong style="color:var(--text-main);">${h2h.bttsPercentage || 0}%</strong></span>
                                <span>Over 2.5 Goals: <strong style="color:var(--text-main);">${h2h.over25Percentage || 0}%</strong></span>
                            </div>
                        </div>

                        <!-- Recent Encounters (Head-to-Head) -->
                        <h5 style="margin:20px 0 10px; font-size:13px; color:var(--text-main); display:flex; justify-content:space-between; align-items:center;">
                            <span>Recent Encounters (Last ${Math.min(5, recentH2h.length)} Head-to-Head)</span>
                            <span style="font-size:11.5px; color:var(--text-muted); font-weight:normal;">Showing ${Math.min(5, recentH2h.length)} of ${totalLifetimeMeetings} recorded encounters</span>
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
                        <p style="margin:6px 0;"><strong>Competition:</strong> ${escapeHtml(competitionName)}</p>
                        <p style="margin:6px 0;"><strong>Date &amp; Time:</strong> ${formatDate(competition.date, { year: true })} at ${formatTime(competition.date)}</p>
                        <p style="margin:6px 0;"><strong>Venue / Stadium:</strong> ${escapeHtml(cleanVenueName)}${cleanVenueCity ? ` (${escapeHtml(cleanVenueCity)})` : ''}</p>
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
                        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                            <h4 style="margin:0; font-size:14px; color:var(--text-main);">🔮 Norra AI Outcome Probability</h4>
                            <span style="font-size:11px; background:var(--color-primary-subtle); color:var(--color-primary); padding:3px 8px; border-radius:4px; font-weight:700;">${escapeHtml(predHints.confidenceRating || 'LIVE MODEL')}</span>
                        </div>
                        <p style="color:var(--text-muted); font-size:12px; margin:6px 0 16px;">Calculated from historical encounters, team form averages, goals differential, and standings context.</p>

                        <!-- Market 1: Match Winner 1X2 Probabilities -->
                        <div style="font-size:11.5px; font-weight:700; text-transform:uppercase; color:var(--text-muted); margin-bottom:8px; letter-spacing:0.5px;">Match Winner (1X2 Probabilities)</div>
                        <div class="prediction-probs-grid" style="margin-bottom:14px;">
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

                        <!-- Market 2: Double Chance (1X, 12, X2) -->
                        <div style="font-size:11.5px; font-weight:700; text-transform:uppercase; color:var(--text-muted); margin-bottom:8px; letter-spacing:0.5px;">Double Chance Probabilities</div>
                        <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:8px; margin-bottom:14px; font-size:12px;">
                            <div style="background:var(--bg-canvas); border:1px solid var(--border-subtle); border-radius:6px; padding:8px 10px; text-align:center;">
                                <div style="font-size:11px; color:var(--text-muted);">1X (Home / Draw)</div>
                                <strong style="font-size:14.5px; color:var(--text-main);">${predHints.doubleChance?.['1X'] ?? (Number(predHints.homeWinProb || 50) + Number(predHints.drawProb || 26)).toFixed(1)}%</strong>
                            </div>
                            <div style="background:var(--bg-canvas); border:1px solid var(--border-subtle); border-radius:6px; padding:8px 10px; text-align:center;">
                                <div style="font-size:11px; color:var(--text-muted);">12 (Any Team Win)</div>
                                <strong style="font-size:14.5px; color:var(--text-main);">${predHints.doubleChance?.['12'] ?? (Number(predHints.homeWinProb || 50) + Number(predHints.awayWinProb || 24)).toFixed(1)}%</strong>
                            </div>
                            <div style="background:var(--bg-canvas); border:1px solid var(--border-subtle); border-radius:6px; padding:8px 10px; text-align:center;">
                                <div style="font-size:11px; color:var(--text-muted);">X2 (Draw / Away)</div>
                                <strong style="font-size:14.5px; color:var(--text-main);">${predHints.doubleChance?.['X2'] ?? (Number(predHints.drawProb || 26) + Number(predHints.awayWinProb || 24)).toFixed(1)}%</strong>
                            </div>
                        </div>

                        <!-- Market 3: Goals & Both Teams To Score (BTTS) -->
                        <div style="font-size:11.5px; font-weight:700; text-transform:uppercase; color:var(--text-muted); margin-bottom:8px; letter-spacing:0.5px;">Goals &amp; Scoring Markets</div>
                        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:10px; margin-bottom:14px; font-size:12px;">
                            <div style="background:var(--bg-canvas); padding:10px 14px; border-radius:6px; border:1px solid var(--border-subtle);">
                                <span style="color:var(--text-muted); display:block; font-size:11px; margin-bottom:2px;">Total Match Goals</span>
                                <strong style="font-size:15px; color:var(--text-main);">${(predHints.over25Probability ?? 52) >= 50 ? 'Over 2.5 Goals' : 'Under 2.5 Goals'}</strong>
                                <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">Over: ${predHints.over25Probability ?? 52}% &bull; Exp: ${predHints.expectedGoals ?? 2.5}</div>
                            </div>
                            <div style="background:var(--bg-canvas); padding:10px 14px; border-radius:6px; border:1px solid var(--border-subtle);">
                                <span style="color:var(--text-muted); display:block; font-size:11px; margin-bottom:2px;">Both Teams To Score (BTTS)</span>
                                <strong style="font-size:15px; color:${predHints.bttsRecommendation === 'Yes' ? '#10b981' : '#f59e0b'};">${predHints.bttsRecommendation === 'Yes' ? 'Yes (Both Score)' : 'No (Clean Sheet Risk)'}</strong>
                                <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">Likelihood: ${predHints.bttsProbability ?? (predHints.bttsRecommendation === 'Yes' ? 64 : 38)}%</div>
                            </div>
                            <div style="background:var(--bg-canvas); padding:10px 14px; border-radius:6px; border:1px solid var(--border-subtle);">
                                <span style="color:var(--text-muted); display:block; font-size:11px; margin-bottom:2px;">First Team to Score</span>
                                <strong style="font-size:15px; color:var(--text-main);">${escapeHtml(predHints.firstTeamToScore || 'Balanced Odds')}</strong>
                                <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">Based on early opening tempo</div>
                            </div>
                        </div>

                        <div style="text-align:center; margin-top:20px;">
                            <a href="https://mynorra.xyz" target="_blank" rel="noopener" class="btn-primary" style="display:inline-block; padding:10px 20px; text-decoration:none; border-radius:8px; font-weight:700; font-size:13px;">
                                🔮 Deep-Dive Predictions &amp; Bet Slips on Norra AI &rarr;
                            </a>
                            <p style="font-size:11px; color:var(--text-faint); margin:8px 0 0;">Decoupled sync powered by the Norra AI Master API key.</p>
                        </div>
                    </div>
                </div>
            `;

            if (silent && elements['dialog-content'].dataset.lastHtmlLen === String(nextDialogHtml.length) && elements['dialog-content'].innerHTML === nextDialogHtml) {
                return;
            }
            elements['dialog-content'].innerHTML = nextDialogHtml;
            elements['dialog-content'].dataset.lastHtmlLen = String(nextDialogHtml.length);

            // Single delegated click listener on dialog-content so tab clicks never glitch or duplicate
            if (!elements['dialog-content'].dataset.tabsDelegated) {
                elements['dialog-content'].dataset.tabsDelegated = '1';
                elements['dialog-content'].addEventListener('click', (e) => {
                    const tabBtn = e.target.closest('.drawer-tab');
                    if (!tabBtn || !elements['dialog-content'].contains(tabBtn)) return;
                    e.preventDefault();
                    e.stopPropagation();
                    const target = tabBtn.dataset.drawerTab;
                    if (!target) return;
                    state.drawerActiveTab = target;
                    elements['dialog-content'].querySelectorAll('.drawer-tab').forEach(b => b.classList.toggle('active', b === tabBtn));
                    elements['dialog-content'].querySelectorAll('.drawer-tab-content').forEach(c => {
                        c.hidden = c.id !== `drawer-tab-${target}`;
                    });
                });
            }

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
        document.documentElement.classList.toggle('theme-light', cleanTheme === 'light');
        if (document.body) {
            document.body.setAttribute('data-theme', cleanTheme);
            document.body.classList.toggle('theme-light', cleanTheme === 'light');
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

            // Header & Footer custom logos and brand synchronization
            // When a custom logo is uploaded, hide the textual fallback and expand the logo for clear visibility
            const headerLogoImg = document.getElementById('header-logo-img');
            const headerBrandFallback = document.getElementById('header-brand-fallback');
            const headerBallIcon = document.getElementById('header-ball-icon') || document.querySelector('.brand-icon');
            const headerBrandTitle = document.getElementById('header-brand-title') || document.querySelector('.brand-text strong');

            if (res.branding?.headerLogoUrl) {
                if (headerLogoImg) {
                    headerLogoImg.src = res.branding.headerLogoUrl;
                    headerLogoImg.alt = res.branding?.siteTitle || 'Norra Scores';
                    headerLogoImg.hidden = false;
                    headerLogoImg.style.display = 'block';
                }
                if (headerBrandFallback) {
                    headerBrandFallback.style.display = 'none';
                    headerBrandFallback.hidden = true;
                }
            } else {
                if (headerLogoImg) {
                    headerLogoImg.hidden = true;
                    headerLogoImg.style.display = 'none';
                }
                if (headerBrandFallback) {
                    headerBrandFallback.style.display = '';
                    headerBrandFallback.hidden = false;
                }
            }
            if (res.branding?.siteTitle && headerBrandTitle) {
                headerBrandTitle.textContent = res.branding.siteTitle;
            }

            const footerLogoImg = document.getElementById('footer-logo-img');
            const footerBrandText = document.getElementById('footer-brand-text') || (footerLogoImg?.parentElement?.querySelector('span'));
            if (footerLogoImg && res.branding?.footerLogoUrl) {
                footerLogoImg.src = res.branding.footerLogoUrl;
                footerLogoImg.alt = res.branding?.siteTitle || 'Norra Scores';
                footerLogoImg.hidden = false;
                footerLogoImg.style.display = 'block';
                if (footerBrandText) {
                    footerBrandText.style.display = 'none';
                    footerBrandText.hidden = true;
                }
            } else if (footerLogoImg) {
                footerLogoImg.hidden = true;
                footerLogoImg.style.display = 'none';
                if (footerBrandText) {
                    footerBrandText.style.display = '';
                    footerBrandText.hidden = false;
                }
            }

            // Custom Favicon (update ALL icon links & strip svg mime type so PNG/ICO/WebP renders everywhere)
            if (res.branding?.faviconUrl) {
                const iconLinks = document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"], #site-favicon');
                if (iconLinks.length > 0) {
                    iconLinks.forEach(link => {
                        link.removeAttribute('type');
                        link.href = res.branding.faviconUrl;
                    });
                } else {
                    const favLink = document.createElement('link');
                    favLink.rel = 'icon';
                    favLink.href = res.branding.faviconUrl;
                    document.head.appendChild(favLink);
                }
            }

            // Standalone APK download link sync from admin settings
            const apkDownloadLink = document.getElementById('apk-download-link');
            if (apkDownloadLink && res.appSettings?.apkUrl) {
                apkDownloadLink.href = res.appSettings.apkUrl;
                apkDownloadLink.target = '_blank';
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
            renderFooterPartners(res.partnerAttributions, res.partnerSectionTitle);

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
        if (plans.starter && plans.starter.priceUsd !== undefined) {
            document.querySelectorAll('[data-tier-price="starter"]').forEach(el => {
                el.textContent = `$${plans.starter.priceUsd}/mo`;
            });
        }
        if (plans.pro && plans.pro.priceUsd !== undefined) {
            document.querySelectorAll('[data-tier-price="pro"]').forEach(el => {
                el.textContent = `$${plans.pro.priceUsd}/mo`;
            });
        }
        if (plans.whitelabel && plans.whitelabel.priceUsd !== undefined) {
            document.querySelectorAll('[data-tier-price="whitelabel"]').forEach(el => {
                el.textContent = `$${plans.whitelabel.priceUsd}/mo`;
            });
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

    
    function renderFooterPartners(items, sectionTitle = '') {
        const host = document.getElementById('footer-partners');
        if (!host) return;
        let list = Array.isArray(items) ? items.filter(p => p && p.active !== false) : [];
        const hasSS = list.some(p => String(p.label || p.linkTitle || p.linkUrl).toLowerCase().includes('sportscore'));
        if (!hasSS) {
            list = [
                ...list,
                {
                    active: true,
                    category: 'Partner',
                    label: 'SportScore',
                    html: '<a href="https://sportscore.com/" rel="dofollow" target="_blank" title="Powered by SportScore" aria-label="Powered by SportScore" style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;background:#0a1e3d;color:#fff;border-radius:50%;text-decoration:none;font:700 .78rem system-ui,sans-serif;">SS</a>',
                    linkUrl: 'https://sportscore.com/',
                    linkTitle: 'Powered by SportScore',
                    rel: 'dofollow'
                }
            ];
        }
        const itemsHtml = list.map(p => {
            const w = Number(p.width) > 0 ? Number(p.width) : 28;
            const h = Number(p.height) > 0 ? Number(p.height) : 28;
            const rel = escapeHtml(p.rel || 'dofollow');
            const title = escapeHtml(p.linkTitle || p.label || 'Partner');
            const target = p.openInNewTab === false ? '' : ' target="_blank"';

            // Prefer custom HTML (allows full SportScore badge markup or admin pills)
            if (p.html && String(p.html).trim()) {
                let htmlContent = p.html;
                if (!p.imageUrl && !/<img\b/i.test(htmlContent)) {
                    // Prevent circular or narrow width overflow when badge contains text
                    htmlContent = htmlContent
                        .replace(/width:\s*\d+px;?/gi, 'min-width:28px;width:auto;')
                        .replace(/height:\s*\d+px;?/gi, 'height:28px;line-height:28px;')
                        .replace(/border-radius:\s*(50%|10%|\d+px);?/gi, 'border-radius:14px;')
                        .replace(/justify-content:\s*[^;]+;/gi, 'justify-content:center;');
                    if (!htmlContent.includes('padding:')) {
                        htmlContent = htmlContent.replace(/style="/i, 'style="padding:0 12px;white-space:nowrap;');
                    }
                }
                return `<span class="footer-partner-item">${htmlContent}</span>`;
            }
            if (p.imageUrl) {
                const href = p.linkUrl || '#';
                return `<span class="footer-partner-item"><a href="${escapeHtml(href)}" rel="${rel}" title="${title}" aria-label="${title}"${target}><img src="${escapeHtml(p.imageUrl)}" alt="${title}" width="${w}" height="${h}" style="width:${w}px;height:${h}px;object-fit:contain;" loading="lazy" decoding="async"></a></span>`;
            }
            const labelText = String(p.label || 'Partner').trim();
            if (labelText) {
                const isShort = labelText.length <= 3;
                const pillStyle = isShort
                    ? `display:inline-flex;align-items:center;justify-content:center;width:${w}px;height:${h}px;line-height:${h}px;background:#0a1e3d;color:#fff;border-radius:50%;text-decoration:none;font:700 .78rem system-ui,sans-serif;`
                    : `display:inline-flex;align-items:center;justify-content:center;min-width:${w}px;height:${h}px;line-height:${h}px;padding:0 12px;background:#1e40af;color:#fff;border-radius:14px;text-decoration:none;font:600 .78rem system-ui,sans-serif;white-space:nowrap;`;
                const href = p.linkUrl || '#';
                return `<span class="footer-partner-item"><a href="${escapeHtml(href)}" rel="${rel}" title="${title}" aria-label="${title}"${target} style="${pillStyle}">${escapeHtml(labelText)}</a></span>`;
            }
            return '';
        }).filter(Boolean).join('');

        if (!itemsHtml) {
            host.innerHTML = '';
            host.hidden = true;
            return;
        }

        const headingHtml = sectionTitle && String(sectionTitle).trim()
            ? `<div class="footer-partners-heading" style="width:100%;text-align:center;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);margin-bottom:8px;">${escapeHtml(sectionTitle)}</div>`
            : '';

        host.innerHTML = headingHtml + `<div class="footer-partners-row" style="display:inline-flex;align-items:center;justify-content:center;gap:12px 16px;flex-wrap:wrap;">${itemsHtml}</div>`;
        host.hidden = false;
    }

    function renderAdSlot(elementId, slotData) {
        const el = document.getElementById(elementId);
        if (!el) return;
        const isEnabled = Boolean(slotData && (slotData.isEnabled || slotData.enabled));
        if (!isEnabled) {
            el.hidden = true;
            el.innerHTML = '';
            return;
        }

        const customHtml = slotData.customHtml || slotData.htmlContent;
        const targetUrl = slotData.targetUrl || slotData.linkUrl || '#';
        if (customHtml && customHtml.trim()) {
            el.innerHTML = `<span class="ad-slot-label">Sponsored Advertisement</span>` + customHtml;
            el.hidden = false;
        } else if (slotData.imageUrl) {
            el.innerHTML = `
                <span class="ad-slot-label">Sponsored Advertisement</span>
                <a href="${escapeHtml(targetUrl)}" target="_blank" rel="noopener noreferrer">
                    <img src="${escapeHtml(slotData.imageUrl)}" alt="Sponsor" style="max-width:100%; height:auto; border-radius:8px;">
                </a>
            `;
            el.hidden = false;
        } else {
            el.hidden = true;
        }
    }

    function bindEvents() {
        const brandElements = document.querySelectorAll('.brand, a.brand, .brand-text, #header-logo-img, #header-brand-fallback');
        brandElements.forEach(el => {
            el.style.cursor = 'pointer';
            el.addEventListener('click', (e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                const isHome = window.location.pathname === '/' || window.location.pathname === '';
                if (isHome) {
                    e.preventDefault();
                    if (typeof closeDrawer === 'function') closeDrawer();
                    if (elements['match-dialog'] && typeof elements['match-dialog'].close === 'function') {
                        try { elements['match-dialog'].close(); } catch {}
                    }
                    if (window.location.search || window.location.hash) {
                        window.history.pushState({}, '', '/');
                    }
                    selectAllLeagues();
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                } else {
                    window.location.href = '/';
                }
            });
        });

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
                        renderMobileDrawer('all');
                    }
                    if (elements['dashboard-country']) elements['dashboard-country'].textContent = 'Favorites';
                    if (elements['dashboard-title']) elements['dashboard-title'].textContent = '⭐ My Pinned Games';
                    loadAllLeagueFixtures({ favoritesOnly: true });
                } else if (status === 'finished') {
                    if (state.selectedLeagueSlug === 'live') {
                        state.selectedLeagueSlug = 'all';
                        renderQuickLeaguePills('all');
                        renderDesktopSidebar('all');
                        renderMobileDrawer('all');
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
                        renderMobileDrawer('all');
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
            const mid = String(m.id || '');
            const muid = String(m.uid || '');
            const msrc = String(m.source?.event_id || '');
            const row = (mid ? list.querySelector(`.fs-match-row[data-event-id="${mid}"]`) : null) ||
                        (muid ? list.querySelector(`.fs-match-row[data-event-id="${muid}"]`) : null) ||
                        (msrc ? list.querySelector(`.fs-match-row[data-event-id="${msrc}"]`) : null);
            if (row) {
                // Never revert a concluded match row back to in-play or scheduled!
                if (row.querySelector('.fs-status-ft')) {
                    continue;
                }
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
                const clock = m.status?.clock || m.status?.detail || 'Live';
                const statusCol = row.querySelector('.fs-col-status');
                if (statusCol) {
                    const liveStatusEl = statusCol.querySelector('.fs-status-live');
                    if (liveStatusEl) {
                        if (liveStatusEl.textContent !== clock) {
                            liveStatusEl.textContent = clock;
                        }
                    } else {
                        // Smoothly transition scheduled match row to live in-play!
                        row.classList.add('is-live-row');
                        statusCol.innerHTML = `<span class="fs-status-live fs-pulse-dot">${escapeHtml(clock)}</span>`;
                    }
                }
            }
        }
        return matchedCount > 0;
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
                    state.lastScoreMap = new Map();
                    for (const m of liveMatches) {
                        const mid = String(m.id || m.uid || '');
                        if (mid) state.lastScoreMap.set(mid, { h: m.home?.score ?? 0, a: m.away?.score ?? 0 });
                    }
                    return; // Prevent duplicate initial fetch since selectAllLeagues/init runs on boot
                }

                // Check for live goal score changes and trigger goal celebration sound & haptics
                state.lastScoreMap = state.lastScoreMap || new Map();
                for (const m of liveMatches) {
                    const mid = String(m.id || m.uid || '');
                    const curH = m.home?.score ?? 0;
                    const curA = m.away?.score ?? 0;
                    if (mid && state.lastScoreMap.has(mid)) {
                        const prev = state.lastScoreMap.get(mid);
                        if (curH > prev.h || curA > prev.a) {
                            playGoalSound();
                            const scoringTeam = (curH > prev.h) ? (m.home?.displayName || m.home?.name || 'Home') : (m.away?.displayName || m.away?.name || 'Away');
                            const toastText = `⚽ GOAL! ${scoringTeam} (${curH} - ${curA})`;
                            showToast(toastText);
                            sendBrowserNotification(toastText, `${m.name || 'Live match'} on NorraScore`, m.home?.logo || '/assets/icons/icon-192.png');
                        }
                    }
                    if (mid) state.lastScoreMap.set(mid, { h: curH, a: curA });
                }

                // Only patch DOM in-place if live matches set has not changed (no matches started or ended)
                const prevLiveIds = (state.lastLiveIds || []).sort().join(',');
                const currLiveIds = liveMatches.map(m => String(m.id)).sort().join(',');
                const liveIdsChanged = prevLiveIds !== currLiveIds;
                state.lastLiveIds = liveMatches.map(m => String(m.id));

                // If only existing live scores changed in-place without match count/id set change, patch DOM
                if (!liveIdsChanged && digestChanged && patchLiveMatchRowsInDom(liveMatches)) {
                    return;
                }

                // Only update the full visible fixture list if viewing today AND (digest changed OR >60s elapsed)
                const isViewingToday = !state.selectedDayOffset || state.selectedDayOffset === 0;
                if (isViewingToday && (digestChanged || timeSinceLastFullSync > 60000)) {
                    state.lastFullFixturesSync = now;

                    if (state.selectedLeagueSlug === 'live' || state.currentStatus === 'live') {
                        loadLiveMatches({ background: true, initialLive: liveMatches });
                    } else if (state.selectedLeagueSlug === 'all') {
                        loadAllLeagueFixtures({ background: true, initialLive: liveMatches });
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

    function playRedCardSound() {
        if (!state.goalAlertsEnabled) return;
        try {
            if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            if (audioCtx.state === 'suspended') audioCtx.resume();
            const now = audioCtx.currentTime;
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(440, now);
            osc.frequency.exponentialRampToValueAtTime(220, now + 0.35);
            gain.gain.setValueAtTime(0.25, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now);
            osc.stop(now + 0.35);
            if (navigator.vibrate) navigator.vibrate([250, 100, 250]);
        } catch (_) {}
    }

    function sendBrowserNotification(title, body, icon = '/assets/icons/icon-192.png') {
        if ('Notification' in window && Notification.permission === 'granted') {
            try {
                new Notification(title, { body, icon });
            } catch (_) {}
        }
    }

    function initGoalAlertToggle() {
        const toggleBtn = document.getElementById('goal-alert-toggle');
        const headerSoundBtn = document.getElementById('sound-toggle');
        const stickySoundBtn = document.getElementById('sticky-sound-toggle');
        if (!toggleBtn && !headerSoundBtn && !stickySoundBtn) return;

        const updateBtnUi = () => {
            const on = Boolean(state.goalAlertsEnabled);
            if (toggleBtn) {
                toggleBtn.classList.toggle('active', on);
                toggleBtn.setAttribute('aria-pressed', String(on));
            }
            const icon = document.getElementById('goal-alert-icon');
            const label = document.getElementById('goal-alert-label');
            if (icon) icon.textContent = on ? '🔊' : '🔔';
            if (label) label.textContent = on ? 'Sound: ON' : 'Sound: OFF';
            if (headerSoundBtn) {
                headerSoundBtn.textContent = on ? '🔊' : '🔔';
                headerSoundBtn.title = on ? 'Goal Alert Sound: ON (Click to mute)' : 'Goal Alert Sound: MUTED (Click to enable)';
                headerSoundBtn.setAttribute('aria-pressed', String(on));
            }
            if (stickySoundBtn) {
                stickySoundBtn.textContent = on ? '🔊' : '🔔';
                stickySoundBtn.title = on ? 'Goal Alert Sound: ON (Click to mute)' : 'Goal Alert Sound: MUTED (Click to enable)';
                stickySoundBtn.setAttribute('aria-pressed', String(on));
            }
        };

        updateBtnUi();

        const handleSoundToggle = () => {
            state.goalAlertsEnabled = !state.goalAlertsEnabled;
            try {
                localStorage.setItem('norra_goal_alerts', String(state.goalAlertsEnabled));
            } catch {}
            updateBtnUi();
            if (state.goalAlertsEnabled) {
                playGoalSound();
                showToast('🔊 Goal Celebration Sound & Haptics ENABLED');
                if ('Notification' in window && Notification.permission === 'default') {
                    Notification.requestPermission().catch(() => {});
                }
            } else {
                showToast('🔔 Goal alerts muted');
            }
        };

        if (toggleBtn) toggleBtn.addEventListener('click', handleSoundToggle);
        if (headerSoundBtn) headerSoundBtn.addEventListener('click', handleSoundToggle);
        if (stickySoundBtn) stickySoundBtn.addEventListener('click', handleSoundToggle);
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
                    state.liveMatchesCache = matches;
                    const fsBadge = document.getElementById('fs-status-live-badge');
                    if (fsBadge) {
                        fsBadge.textContent = matches.length;
                        fsBadge.style.display = matches.length > 0 ? 'inline-block' : 'none';
                    }
                    const headerLiveCount = document.getElementById('header-live-count');
                    if (headerLiveCount) {
                        headerLiveCount.textContent = matches.length;
                        headerLiveCount.style.display = matches.length > 0 ? 'inline-block' : 'none';
                    }
                } catch {}
            });

            source.addEventListener('score_update', (e) => {
                try {
                    const data = JSON.parse(e.data);
                    const updates = data.deltas || data.updates || [];
                    if (updates && updates.length) {
                        for (const update of updates) {
                            applyRealtimeMatchUpdate(update);
                        }
                    }
                } catch {}
            });

            source.onerror = () => {
                // EventSource standard auto-reconnects
            };

            // Mobile battery and data saver: pause stream when tab is backgrounded
            if (!state.visibilityListenerAttached) {
                state.visibilityListenerAttached = true;
                document.addEventListener('visibilitychange', () => {
                    if (document.hidden) {
                        // User left the tab or locked screen: close SSE to save mobile battery & data
                        if (state.liveEventSource) {
                            state.liveEventSource.close();
                            state.liveEventSource = null;
                        }
                    } else {
                        // User returned to active tab: reconnect SSE stream and revalidate live scores
                        initLiveEventStream();
                        if (state.currentStatus === 'live' || state.selectedLeagueSlug === 'live') {
                            loadLiveMatches({ background: true });
                        }
                    }
                });
            }
        } catch (err) {
            console.warn('SSE stream notice:', err.message);
        }
    }

    function applyRealtimeMatchUpdate(update) {
        if (!update || (!update.id && !update.eventId)) return;
        const matchId = String(update.id || update.eventId);
        const matchRow = document.querySelector(`.fs-match-row[data-event-id="${matchId}"]`);

        const curHome = (update.homeScore !== undefined) ? update.homeScore : (update.home?.score ?? 0);
        const curAway = (update.awayScore !== undefined) ? update.awayScore : (update.away?.score ?? 0);
        const newHomeScore = String(curHome);
        const newAwayScore = String(curAway);

        const homeName = update.home?.displayName || update.home?.name || update.scoringTeam || 'Home';
        const awayName = update.away?.displayName || update.away?.name || 'Away';
        const homeLogo = update.home?.logo || '';

        // Update in-memory live matches cache if present
        if (state.liveMatchesCache && Array.isArray(state.liveMatchesCache)) {
            const cachedMatch = state.liveMatchesCache.find(m => String(m.id || m.eventId) === matchId);
            if (cachedMatch) {
                if (cachedMatch.home) cachedMatch.home.score = curHome;
                if (cachedMatch.away) cachedMatch.away.score = curAway;
                if (cachedMatch.status) {
                    cachedMatch.status.clock = update.clock || cachedMatch.status.clock;
                    cachedMatch.status.detail = update.clock || cachedMatch.status.detail;
                }
            }
        }

        if (matchRow) {
            const scoreDigits = matchRow.querySelectorAll('.fs-score-digit');
            const prevHomeScore = scoreDigits[0] ? scoreDigits[0].textContent.trim() : null;
            const prevAwayScore = scoreDigits[1] ? scoreDigits[1].textContent.trim() : null;

            if (scoreDigits[0]) scoreDigits[0].textContent = newHomeScore;
            if (scoreDigits[1]) scoreDigits[1].textContent = newAwayScore;

            const clockEl = matchRow.querySelector('.fs-status-live');
            if (clockEl) {
                const newClock = update.clock || formatMatchClock(update.status, update.status?.type);
                // Never allow generic 'Live' text to override an existing concrete match clock!
                if (isConcreteClock(newClock) || !isConcreteClock(clockEl.textContent)) {
                    clockEl.textContent = newClock;
                }
            }

            const goalDetected = update.isGoal || (prevHomeScore !== null && (Number(newHomeScore) > Number(prevHomeScore) || Number(newAwayScore) > Number(prevAwayScore)));

            if (goalDetected) {
                playGoalSound();
                matchRow.classList.add('goal-scored-highlight');
                setTimeout(() => matchRow.classList.remove('goal-scored-highlight'), 4000);
                const toastText = `⚽ GOAL! ${homeName} ${newHomeScore} - ${newAwayScore} ${awayName}`;
                showToast(toastText);
                sendBrowserNotification(toastText, `${update.clock || update.status?.displayClock || 'Live'} on NorraScore`, homeLogo || '/assets/icons/icon-192.png');
            }
        }

        if (state.currentEventId === matchId && elements['dialog-content']) {
            const scoreDigits = elements['dialog-content'].querySelector('.score-digits');
            if (scoreDigits) {
                scoreDigits.textContent = `${newHomeScore} - ${newAwayScore}`;
            }
            const minutePill = elements['dialog-content'].querySelector('.minute-pill');
            if (minutePill) {
                const newClock = update.clock || formatMatchClock(update.status, update.status?.type);
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
                                <p style="font-size: 13px; color: var(--text-muted); margin: 0 0 12px;">You've used all 2 free daily web conversions. Upgrade to the Starter plan for 500 conversions/day or the Pro plan for unlimited conversions.</p>
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

    function initDownloadAppModal() {
        const downloadBtn = document.getElementById('header-download-btn');
        const dialog = document.getElementById('download-app-dialog');
        const closeBtn = document.getElementById('close-download-dialog');
        const pwaBtn = document.getElementById('pwa-install-trigger-btn');
        const appLogo = document.getElementById('download-dialog-app-logo');
        const appName = document.getElementById('download-dialog-app-name');

        if (!dialog) return;

        const openDownloadModal = (e) => {
            if (e) e.preventDefault();
            if (state.siteSettings?.siteName && appName) {
                appName.textContent = state.siteSettings.siteName;
            }
            if (state.siteSettings?.logoUrl && appLogo) {
                appLogo.src = state.siteSettings.logoUrl;
            }
            if (typeof dialog.showModal === 'function') {
                dialog.showModal();
            } else {
                dialog.setAttribute('open', '');
            }
        };

        if (downloadBtn) downloadBtn.addEventListener('click', openDownloadModal);
        const footerDownloadLink = document.getElementById('footer-link-download');
        if (footerDownloadLink) footerDownloadLink.addEventListener('click', openDownloadModal);
        document.querySelectorAll('.open-download-app-btn').forEach(btn => btn.addEventListener('click', openDownloadModal));

        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                if (typeof dialog.close === 'function') dialog.close();
                else dialog.removeAttribute('open');
            });
        }

        if (pwaBtn) {
            pwaBtn.addEventListener('click', async () => {
                if (state.deferredPrompt) {
                    state.deferredPrompt.prompt();
                    const { outcome } = await state.deferredPrompt.userChoice;
                    if (outcome === 'accepted') {
                        showToast('🎉 Thank you for installing the NorraScore app!');
                        state.deferredPrompt = null;
                    }
                } else {
                    showToast('📱 To install: Tap browser menu (⋮ or Share) ➔ Add to Home Screen');
                }
            });
        }

        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            state.deferredPrompt = e;
            if (pwaBtn) {
                pwaBtn.innerHTML = '<span>⚡ Tap to Install Now</span>';
            }
        });
    }

    window.openClubHub = async function(teamIdOrName, teamLogo = '', leagueSlug = '') {
        if (!teamIdOrName) return;
        const dialog = document.getElementById('club-hub-dialog');
        const titleEl = document.getElementById('club-hub-title');
        const leagueEl = document.getElementById('club-hub-league-name');
        const contentEl = document.getElementById('club-hub-content');

        if (!dialog || !contentEl) return;

        if (titleEl) titleEl.textContent = teamIdOrName;
        if (leagueEl) leagueEl.textContent = leagueSlug ? leagueSlug.toUpperCase() : 'CLUB PROFILE';
        contentEl.innerHTML = '<div class="content-state"><span class="loader"></span><p>Loading club hub…</p></div>';

        if (typeof dialog.showModal === 'function') {
            dialog.showModal();
        } else {
            dialog.setAttribute('open', '');
        }

        try {
            const res = await fetchJson(`/api/v1/football/teams/${encodeURIComponent(teamIdOrName)}`);
            const club = res.team || {};
            const recent = res.recentMatches || [];
            const upcoming = res.upcomingMatches || [];

            contentEl.innerHTML = `
                <div style="display:flex; align-items:center; gap:16px; margin-bottom:18px; padding-bottom:14px; border-bottom:1px solid var(--border-subtle);">
                    <img src="${escapeHtml(club.logo || teamLogo || '/cdn/crest?url=' + encodeURIComponent(teamLogo))}" alt="${escapeHtml(club.name || teamIdOrName)}" style="width:56px; height:56px; object-fit:contain;" onerror="this.src='/crests/fallback-shield.svg'">
                    <div>
                        <h3 style="margin:0 0 4px; font-size:18px; color:var(--text-main);">${escapeHtml(club.displayName || club.name || teamIdOrName)}</h3>
                        <span style="font-size:12px; color:var(--text-muted);">${escapeHtml(club.country || '')} &bull; ${escapeHtml(club.abbreviation || '')}</span>
                    </div>
                </div>

                <!-- Recent Form (Last 10 matches) -->
                <div style="margin-bottom:20px;">
                    <h4 style="margin:0 0 10px; font-size:13px; text-transform:uppercase; color:var(--text-muted); letter-spacing:0.5px;">Recent Match Form</h4>
                    ${recent.length > 0 ? `
                        <div style="display:flex; flex-direction:column; gap:6px;">
                            ${recent.slice(0, 6).map(m => {
                                const isHome = (m.home?.name || '').toLowerCase().includes(teamIdOrName.toLowerCase());
                                const teamScore = isHome ? (m.home?.score ?? 0) : (m.away?.score ?? 0);
                                const oppScore = isHome ? (m.away?.score ?? 0) : (m.home?.score ?? 0);
                                const oppName = isHome ? (m.away?.displayName || m.away?.name || 'Away') : (m.home?.displayName || m.home?.name || 'Home');
                                const result = teamScore > oppScore ? 'W' : teamScore < oppScore ? 'L' : 'D';
                                const badgeColor = result === 'W' ? '#10b981' : result === 'L' ? '#ef4444' : '#f59e0b';
                                return `
                                    <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-canvas); border:1px solid var(--border-subtle); padding:8px 12px; border-radius:8px; font-size:12.5px;">
                                        <div style="display:flex; align-items:center; gap:8px;">
                                            <span style="background:${badgeColor}; color:#fff; font-weight:700; width:22px; height:22px; border-radius:4px; display:inline-flex; align-items:center; justify-content:center; font-size:11px;">${result}</span>
                                            <span style="color:var(--text-main); font-weight:600;">vs ${escapeHtml(oppName)}</span>
                                        </div>
                                        <div style="font-weight:700; color:var(--text-main); font-variant-numeric:tabular-nums;">
                                            ${m.home?.score ?? 0} - ${m.away?.score ?? 0}
                                            <span style="font-size:11px; color:var(--text-muted); margin-left:6px; font-weight:normal;">FT</span>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    ` : '<p style="color:var(--text-muted); font-size:12px;">No recorded recent matches.</p>'}
                </div>

                <!-- Upcoming Fixtures -->
                <div>
                    <h4 style="margin:0 0 10px; font-size:13px; text-transform:uppercase; color:var(--text-muted); letter-spacing:0.5px;">Upcoming Fixtures</h4>
                    ${upcoming.length > 0 ? `
                        <div style="display:flex; flex-direction:column; gap:6px;">
                            ${upcoming.slice(0, 3).map(m => {
                                const dateStr = m.date ? new Date(m.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Scheduled';
                                return `
                                    <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-canvas); border:1px solid var(--border-subtle); padding:8px 12px; border-radius:8px; font-size:12.5px;">
                                        <span style="color:var(--text-main); font-weight:600;">${escapeHtml(m.home?.displayName || m.home?.name || 'Home')} vs ${escapeHtml(m.away?.displayName || m.away?.name || 'Away')}</span>
                                        <span style="font-size:11.5px; color:var(--color-primary); font-weight:600;">${escapeHtml(dateStr)}</span>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    ` : '<p style="color:var(--text-muted); font-size:12px;">No scheduled fixtures in the next 7 days.</p>'}
                </div>
            `;
        } catch (err) {
            contentEl.innerHTML = `<p style="color:var(--text-muted); padding:16px;">Failed to load club information: ${escapeHtml(err.message)}</p>`;
        }
    };

    function initClubHubDialog() {
        const dialog = document.getElementById('club-hub-dialog');
        const closeBtn = document.getElementById('close-club-hub');
        if (closeBtn && dialog) {
            closeBtn.addEventListener('click', () => {
                if (typeof dialog.close === 'function') dialog.close();
                else dialog.removeAttribute('open');
            });
        }
    }

    async function initialize() {
        setupThemeToggle();
        setupBackToTop();
        setupTimezones();
        bindEvents();
        initGoalAlertToggle();
        initLiveEventStream();
        initBookingConverter();
        initDownloadAppModal();
        initClubHubDialog();
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
