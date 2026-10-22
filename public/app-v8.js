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
        return String(value ?? '')
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
    }

    async function fetchJson(path) {
        const response = await fetch(path, { headers: { Accept: 'application/json' } });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
            const message = typeof body.error === 'string'
                ? body.error
                : body.error?.message || `HTTP ${response.status}`;
            throw new Error(message);
        }
        return body;
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

    function teamLogo(team, className = 'team-crest') {
        let logo = safeUrl(team?.logo || team?.logos?.[0]?.href);
        if (logo.includes('static.livescore.com/')) {
            logo = logo.replace('static.livescore.com/', 'storage.livescore.com/images/team/medium/');
        }
        const abbreviation = escapeHtml(team?.abbreviation || 'FC');
        return `<span class="${className}">${logo ? `<img src="${logo}" alt="${escapeHtml(team?.displayName || abbreviation)}" loading="lazy" onerror="this.onerror=null;this.style.display='none';this.parentElement.textContent='${abbreviation}';">` : abbreviation}</span>`;
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

    function statusInfo(event) {
        const status = event?.status || competitionFromEvent(event).status || {};
        const type = status.type || {};
        const stateName = status.state || type.state || 'unknown';
        if (stateName === 'in' || status.isLive) {
            const clock = status.clock || status.displayClock || type.shortDetail || 'Live';
            return { state: 'live', label: clock, pillClass: 'in-play' };
        }
        if (stateName === 'post' || status.completed || type.completed) {
            return { state: 'finished', label: status.detail || type.shortDetail || 'FT', pillClass: 'post' };
        }
        return { state: 'scheduled', label: status.detail || type.shortDetail || 'Upcoming', pillClass: 'pre' };
    }

    function setLoading(kind, loading) {
        if (elements[`${kind}-loading`]) elements[`${kind}-loading`].hidden = !loading;
        if (loading && elements[`${kind}-empty`]) elements[`${kind}-empty`].hidden = true;
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

    async function loadLeagues() {
        const data = await fetchJson('/get/soccer/leagues?kind=club&available=true');
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
                <span class="quick-league-flag">🌐</span>
                <span>All</span>
            </button>
        `;

        const liveBadgeDisplay = state.liveMatchCount > 0 ? `display:inline-block;` : `display:none;`;
        const livePill = `
            <button class="quick-league-btn ${isLive ? 'active' : ''}" type="button" data-slug="live">
                <span class="quick-league-flag ${state.liveMatchCount > 0 ? 'live-pulse-mini' : ''}">🔴</span>
                <span>Live <span id="live-count-badge" class="pill-badge" style="${liveBadgeDisplay}">${state.liveMatchCount}</span></span>
            </button>
        `;

        const leaguePills = state.leagues.map(l => {
            const flag = LEAGUE_FLAGS[l.slug] || '⚽';
            const isActive = l.slug === activeSlug;
            return `
                <button class="quick-league-btn ${isActive ? 'active' : ''}" type="button" data-slug="${escapeHtml(l.slug)}">
                    <span class="quick-league-flag">${flag}</span>
                    <span>${escapeHtml(l.abbreviation || l.name)}</span>
                </button>
            `;
        }).join('');

        container.innerHTML = allPill + livePill + leaguePills;

        container.querySelectorAll('.quick-league-btn').forEach(btn => {
            btn.addEventListener('click', () => {
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

    async function selectLiveMatches() {
        state.selectedLeagueSlug = 'live';
        state.league = null;
        renderQuickLeaguePills('live');
        window.clearInterval(state.matchTimer);

        const leagueToolbar = document.getElementById('league-view-toolbar');
        if (leagueToolbar) leagueToolbar.style.display = 'none';
        switchView('fixtures');

        if (elements['league-card']) elements['league-card'].hidden = true;
        if (elements['welcome-state']) elements['welcome-state'].hidden = true;
        if (elements['league-dashboard']) elements['league-dashboard'].hidden = false;
        if (elements['dashboard-country']) elements['dashboard-country'].textContent = 'In-Play Live';
        if (elements['dashboard-title']) elements['dashboard-title'].textContent = '🔴 Matches Currently Live';
        if (elements['fixture-status']) elements['fixture-status'].value = 'live';

        await loadLiveMatches();
    }

    async function loadLiveMatches({ background = false } = {}) {
        if (!background) {
            setLoading('fixtures', true);
            if (elements['fixtures-list']) elements['fixtures-list'].replaceChildren();
        }

        try {
            const data = await fetchJson('/api/v1/football/live');
            const liveMatches = data.live || [];
            state.liveMatchCount = liveMatches.length;

            const badge = document.getElementById('live-count-badge');
            if (badge) {
                badge.textContent = liveMatches.length;
                badge.style.display = liveMatches.length > 0 ? 'inline-block' : 'none';
            }

            if (!liveMatches.length) {
                if (elements['fixtures-empty']) {
                    elements['fixtures-empty'].hidden = false;
                    elements['fixtures-empty'].innerHTML = '<span class="empty-icon">⚽</span><p>No matches are currently in progress right now.<br><small style="color:var(--text-faint);">Check Scheduled fixtures or tap "All" to browse today’s match schedule.</small></p>';
                }
                if (elements['fixture-count']) elements['fixture-count'].textContent = '0';
                if (!background && elements['fixtures-list']) elements['fixtures-list'].innerHTML = '';
                return;
            }

            // Group live matches by league
            const groupsMap = new Map();
            for (const m of liveMatches) {
                const slug = m.league?.slug || 'other';
                if (!groupsMap.has(slug)) {
                    groupsMap.set(slug, {
                        league: m.league,
                        events: []
                    });
                }
                // Adapt to format expected by renderFlashscoreMatchRow
                groupsMap.get(slug).events.push({
                    id: m.id,
                    date: m.date,
                    name: `${m.home.displayName} vs ${m.away.displayName}`,
                    status: {
                        type: {
                            state: 'in',
                            name: m.status?.name,
                            description: m.status?.description,
                            detail: m.status?.clock
                        },
                        clock: m.status?.clock,
                        displayClock: m.status?.clock,
                        period: m.status?.period
                    },
                    competitions: [{
                        id: m.id,
                        date: m.date,
                        competitors: [
                            { homeAway: 'home', score: m.home.score, winner: m.home.winner, team: m.home },
                            { homeAway: 'away', score: m.away.score, winner: m.away.winner, team: m.away }
                        ]
                    }],
                    league_slug: slug
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

        const requestedSlug = document.body.dataset.leagueSlug
            || new URLSearchParams(location.search).get('league');

        if (requestedSlug && state.leagues.some(l => l.slug === requestedSlug)) {
            renderQuickLeaguePills(requestedSlug);
            selectLeague(requestedSlug);
        } else {
            renderQuickLeaguePills('all');
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
        window.clearInterval(state.matchTimer);

        // Sync status pills
        document.querySelectorAll('.fs-status-pill').forEach(p => {
            const isMatch = p.dataset.status === (state.currentStatus || 'all');
            p.classList.toggle('active', isMatch);
            p.setAttribute('aria-selected', isMatch ? 'true' : 'false');
        });

        if (elements['league-card']) elements['league-card'].hidden = true;
        if (elements['welcome-state']) elements['welcome-state'].hidden = true;
        if (elements['league-dashboard']) elements['league-dashboard'].hidden = false;
        if (elements['dashboard-country']) elements['dashboard-country'].textContent = 'World Football';
        if (elements['dashboard-title']) elements['dashboard-title'].textContent = 'All Live Matches & Fixtures';

        const leagueToolbar = document.getElementById('league-view-toolbar');
        if (leagueToolbar) leagueToolbar.style.display = 'none';
        switchView('fixtures');

        await loadAllLeagueFixtures();
    }

    async function loadAllLeagueFixtures({ background = false } = {}) {
        if (!background) {
            setLoading('fixtures', true);
            if (elements['fixtures-list']) elements['fixtures-list'].replaceChildren();
        }

        try {
            // Determine date param
            let dateParam = 'today';
            if (state.selectedDayOffset === -1) dateParam = 'yesterday';
            else if (state.selectedDayOffset === 1) dateParam = 'tomorrow';
            else if (state.selectedDayOffset === 0) dateParam = 'today';
            else if (state.selectedDateStr) dateParam = state.selectedDateStr;

            const statusParam = state.currentStatus || 'all';
            let url = `/api/v1/football/fixtures?date=${encodeURIComponent(dateParam)}&limit=200`;
            if (statusParam && statusParam !== 'all') {
                url += `&status=${encodeURIComponent(statusParam)}`;
            }

            const data = await fetchJson(url);
            const matches = data.matches || [];

            if (!matches.length) {
                renderAllLeaguesGrouped([]);
                return;
            }

            const groupsMap = new Map();
            for (const m of matches) {
                const slug = m.league?.slug || 'other';
                if (!groupsMap.has(slug)) {
                    groupsMap.set(slug, {
                        league: m.league || { slug, name: 'Competition', country: '' },
                        events: []
                    });
                }
                groupsMap.get(slug).events.push(m);
            }

            renderAllLeaguesGrouped([...groupsMap.values()]);
        } catch (error) {
            if (elements['fixtures-empty']) elements['fixtures-empty'].hidden = false;
            showToast(`Unable to load all fixtures: ${error.message}`);
        } finally {
            if (!background) setLoading('fixtures', false);
        }
    }

    function renderAllLeaguesGrouped(groupedData) {
        if (!elements['fixtures-list']) return;

        let totalCount = 0;

        // Pinned Matches Section at the top
        const pinnedEvents = [];
        for (const grp of groupedData) {
            for (const ev of (grp.events || [])) {
                if (state.pinnedMatches.includes(String(ev.id))) {
                    pinnedEvents.push({ event: ev, league: grp.league });
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

        const html = groupedData.map(({ league, events }) => {
            if (!events || !events.length) return '';
            totalCount += events.length;
            const flag = LEAGUE_FLAGS[league.slug] || '⚽';
            const isCollapsed = state.collapsedLeagues.has(league.slug);
            return `
                <div class="fs-league-section ${isCollapsed ? 'is-collapsed' : ''}" data-league-slug="${escapeHtml(league.slug)}">
                    <div class="fs-league-header" role="button" tabindex="0" data-toggle-slug="${escapeHtml(league.slug)}" aria-expanded="${!isCollapsed}" title="Click to ${isCollapsed ? 'expand' : 'collapse'} ${escapeHtml(league.name)}">
                        <div class="fs-league-title">
                            <span class="fs-collapse-chevron ${isCollapsed ? 'is-collapsed' : ''}" aria-hidden="true">▼</span>
                            <span class="fs-league-flag">${flag}</span>
                            <strong>${escapeHtml(league.name)}</strong>
                            <small class="fs-league-country">${escapeHtml(league.country || '')}</small>
                            <span class="fs-league-match-count" title="${events.length} games">${events.length}</span>
                        </div>
                        <button class="fs-league-view-btn" type="button" data-slug="${escapeHtml(league.slug)}">Table &rsaquo;</button>
                    </div>
                    <div class="fs-league-matches" style="${isCollapsed ? 'display:none;' : ''}">
                        ${events.map(ev => renderFlashscoreMatchRow(ev, league)).join('')}
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
                elements['fixtures-empty'].innerHTML = `
                    <span class="empty-icon">⚽</span>
                    <p style="font-size:15px; font-weight:600; color:var(--text-main); margin-bottom:6px;">There's no games ${dayLabel}.</p>
                    <p style="font-size:13px; color:var(--text-muted); margin:0;">Check Tomorrow or pick an upcoming date to browse world match schedules.</p>
                `;
            }
            elements['fixtures-list'].innerHTML = '';
        } else {
            if (elements['fixtures-empty']) elements['fixtures-empty'].hidden = true;
            elements['fixtures-list'].innerHTML = pinnedHtml + html;

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
        window.clearInterval(state.matchTimer);
        updateLeagueCard(league);
        if (elements['welcome-state']) elements['welcome-state'].hidden = true;
        if (elements['league-dashboard']) elements['league-dashboard'].hidden = false;
        if (elements['dashboard-country']) elements['dashboard-country'].textContent = localCountryName(league.country);
        if (elements['dashboard-title']) elements['dashboard-title'].textContent = league.name;

        const leagueToolbar = document.getElementById('league-view-toolbar');
        if (leagueToolbar) leagueToolbar.style.display = 'flex';

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

    function renderFixtures(fixtures) {
        if (!elements['fixtures-list']) return;
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
            }
        }
        if (elements['fixtures-load-more']) {
            elements['fixtures-load-more'].hidden = !fixtures.length || state.fixturePage >= state.fixturePageCount;
        }
        if (!fixtures.length) {
            elements['fixtures-list'].innerHTML = '';
            return;
        }

        const flag = LEAGUE_FLAGS[state.league?.slug] || '⚽';

        elements['fixtures-list'].innerHTML = `
            <div class="fs-league-section">
                <div class="fs-league-header">
                    <div class="fs-league-title">
                        <span class="fs-league-flag">${flag}</span>
                        <strong>${escapeHtml(state.league?.name || 'League')}</strong>
                        <small class="fs-league-country">${escapeHtml(state.league?.country || '')}</small>
                    </div>
                </div>
                <div class="fs-league-matches">
                    ${fixtures.map(ev => renderFlashscoreMatchRow(ev, state.league)).join('')}
                </div>
            </div>
        `;
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
            ? `<span class="live-pulse-dot"></span><span class="fs-status-live">${escapeHtml(status.label)}</span>`
            : status.state === 'finished'
            ? `<span class="fs-status-ft">FT</span>`
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
            const entries = group.standings?.entries || [];
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

    async function openMatch(eventId, leagueSlug = '') {
        state.currentEventId = eventId;
        if (leagueSlug) {
            const found = state.leagues.find(item => item.slug === leagueSlug);
            if (found) state.league = found;
        }
        window.clearInterval(state.matchTimer);
        if (elements['match-dialog'] && !elements['match-dialog'].open) {
            elements['match-dialog'].showModal();
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
            elements['dialog-content'].innerHTML = '<div class="content-state"><span class="loader"></span><p>Loading match details…</p></div>';
        }

        const base = `/get/soccer/${encodeURIComponent(slug)}/events/${encodeURIComponent(eventId)}`;
        const [summaryResult, playsResult, predResult] = await Promise.allSettled([
            fetchJson(base),
            fetchJson(`${base}/plays?important=true&limit=300`),
            fetchJson(`/api/v1/football/predictions-context/${encodeURIComponent(eventId)}`)
        ]);

        let summary = summaryResult.status === 'fulfilled' ? summaryResult.value : null;

        if (!summary) {
            // Fallback to global match API endpoint with ESPN enrichment
            try {
                const matchApiRes = await fetchJson(`/api/v1/football/matches/${encodeURIComponent(eventId)}`);
                if (matchApiRes?.summary) {
                    summary = matchApiRes.summary;
                }
            } catch (err) {}
        }

        if (!summary) {
            if (elements['dialog-content']) {
                elements['dialog-content'].innerHTML = `<div class="content-state"><span class="empty-icon">!</span><p>${escapeHtml(summaryResult.reason?.message || 'Match details could not be loaded.')}</p></div>`;
            }
            return;
        }

        const plays = playsResult.status === 'fulfilled' ? playsResult.value.items || [] : [];
        const predictions = predResult.status === 'fulfilled' ? predResult.value : null;
        renderMatchDetails(summary, plays, predictions);

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
        return event.team || null;
    }

    function normalizeMatchEvent(event, index, source, home, away) {
        const athlete = event.athletesInvolved?.[0] || null;
        const participants = (event.participants || []).map(participant =>
            participant.athlete || participant).filter(Boolean);
        const kind = matchEventKind(event);
        const typeText = event.type?.text || event.type?.type || 'Match event';
        const team = eventTeam(event, home, away);
        const athleteName = athlete?.displayName || athlete?.fullName || athlete?.shortName || '';
        const text = event.text || event.alternativeText
            || (athleteName ? `${athleteName} · ${typeText}` : typeText);
        return {
            id: event.id || `${source}-${index}`,
            source,
            kind,
            text,
            typeText,
            athlete,
            participants,
            team,
            clock: event.clock?.displayValue || '',
            clockValue: Number(event.clock?.value) || 0,
            scoringPlay: kind === 'goal',
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
        const keyEvents = (summary.keyEvents || []).map((event, index) =>
            normalizeMatchEvent(event, index, 'key-event', home, away));
        const playEvents = (plays || []).map((event, index) =>
            normalizeMatchEvent(event, index, 'play', home, away));

        const events = [];
        const seen = new Set();
        for (const event of [...keyEvents, ...playEvents]) {
            const teamId = event.team?.id || event.team?.source_id || event.team?.displayName || '';
            const signature = `${event.kind}|${event.clockValue}|${teamId}`;
            if (seen.has(signature)) continue;
            seen.add(signature);
            events.push(event);
        }
        return events.sort((left, right) => left.clockValue - right.clockValue);
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

    function renderMatchDetails(summary, plays, predictions = null) {
        const competition = summary.header?.competitions?.[0] || {};
        const event = { date: competition.date, competitions: [competition], status: competition.status };
        const { home, away } = competitorsFromEvent(event);
        const status = statusInfo(event);
        const venue = summary.gameInfo?.venue;
        const homeStats = summary.boxscore?.teams?.find(item => item.homeAway === 'home')?.statistics || [];
        const awayStats = summary.boxscore?.teams?.find(item => item.homeAway === 'away')?.statistics || [];
        const events = matchTimeline(summary, plays, home, away);
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

        if (!homeAnalytics.recentMatches?.length && summary.lastFiveGames?.length) {
            const hL5 = summary.lastFiveGames.find(t => String(t.team?.id) === String(home.team?.id) || t.team?.displayName === home.team?.displayName);
            if (hL5?.events?.length) {
                homeAnalytics.recentMatches = hL5.events.map(ev => ({
                    date: ev.gameDate,
                    opponent: ev.opponent?.displayName || 'Opponent',
                    score: ev.score || '',
                    result: ev.gameResult || 'D',
                    venue: ev.atVs === '@' ? 'Away' : 'Home'
                }));
            }
        }
        if (!awayAnalytics.recentMatches?.length && summary.lastFiveGames?.length) {
            const aL5 = summary.lastFiveGames.find(t => String(t.team?.id) === String(away.team?.id) || t.team?.displayName === away.team?.displayName);
            if (aL5?.events?.length) {
                awayAnalytics.recentMatches = aL5.events.map(ev => ({
                    date: ev.gameDate,
                    opponent: ev.opponent?.displayName || 'Opponent',
                    score: ev.score || '',
                    result: ev.gameResult || 'D',
                    venue: ev.atVs === '@' ? 'Away' : 'Home'
                }));
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

        const totalLifetimeMeetings = Number(h2h.totalMeetings || recentH2h.length || 0);
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
        const homeRoster = rosters.find(r => String(r.team?.id) === String(home.team?.id) || r.team?.side === 'home') || rosters[0];
        const awayRoster = rosters.find(r => String(r.team?.id) === String(away.team?.id) || r.team?.side === 'away') || rosters[1];

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
            const activeTab = state.drawerActiveTab || 'timeline';

            elements['dialog-content'].innerHTML = `
                <section class="drawer-header-card">
                    <div class="team-vs-team-row">
                        <div class="team-side">
                            ${teamLogo(home.team, 'team-crest')}
                            <span class="team-name" style="font-size:15px;">${escapeHtml(home.team?.displayName || 'Home')}</span>
                        </div>
                        <div class="score-center-col">
                            <div class="score-digits" style="font-size:32px;">${escapeHtml(home.score ?? '—')} - ${escapeHtml(away.score ?? '—')}</div>
                            <div class="minute-pill ${status.pillClass}" style="margin-top:6px;">${escapeHtml(competition.status?.displayClock || status.label)}</div>
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
                    <h4 style="margin:0 0 12px; font-size:14px; color:var(--text-main);">Goals &amp; Scorers</h4>
                    <div>${scorerRows || '<p style="color:var(--text-muted); font-size:13px;">No goals recorded for this match.</p>'}</div>

                    <h4 style="margin:20px 0 12px; font-size:14px; color:var(--text-main);">Match Timeline</h4>
                    <div>${timelineRows || '<p style="color:var(--text-muted); font-size:13px;">No play-by-play events recorded.</p>'}</div>
                </div>

                <div id="drawer-tab-stats" class="drawer-tab-content" ${activeTab === 'stats' ? '' : 'hidden'}>
                    <h4 style="margin:0 0 14px; font-size:14px; color:var(--text-main);">In-Play Match Statistics (${escapeHtml(home.team?.displayName || 'Home')} vs ${escapeHtml(away.team?.displayName || 'Away')})</h4>
                    <div>${statRows || `
                        <div style="text-align:center; padding:24px 16px; background:var(--bg-canvas); border:1px solid var(--border-subtle); border-radius:8px;">
                            <span class="empty-icon" style="font-size:24px;">📊</span>
                            <p style="margin:8px 0 4px; font-weight:600; color:var(--text-main);">No in-play statistics available.</p>
                            <small style="color:var(--text-muted);">Match statistics (possession %, shots, corners, fouls, cards) activate during live play or after match conclusion.</small>
                        </div>
                    `}</div>
                </div>

                <div id="drawer-tab-h2h" class="drawer-tab-content" ${activeTab === 'h2h' ? '' : 'hidden'}>
                    <h4 style="margin:0 0 14px; font-size:14px; color:var(--text-main);">Head-to-Head Past Encounters</h4>
                    ${h2h.seriesSummary || h2h.seriesScore ? `
                        <div style="background:var(--color-primary-subtle); border:1px solid var(--border-subtle); border-radius:8px; padding:10px 14px; font-size:13px; font-weight:600; color:var(--color-primary); margin-bottom:16px; text-align:center;">
                            🏆 ${escapeHtml(h2h.seriesSummary || ('Historical Series: ' + h2h.seriesScore))}
                        </div>
                    ` : ''}

                    ${hasPastMeetings ? `
                        <!-- Lifetime Head-to-Head Record -->
                        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:10px; margin-bottom:14px;">
                            <div style="background:var(--bg-canvas); border:1px solid var(--border-subtle); border-radius:8px; padding:12px; text-align:center;">
                                <span style="font-size:11px; text-transform:uppercase; color:var(--text-muted); display:block;">Lifetime Encounters</span>
                                <strong style="font-size:22px; color:var(--text-main);">${totalLifetimeMeetings}</strong>
                            </div>
                            <div style="background:var(--bg-canvas); border:1px solid var(--border-subtle); border-radius:8px; padding:12px; text-align:center;">
                                <span style="font-size:11px; text-transform:uppercase; color:var(--text-muted); display:block;">${escapeHtml(home.team?.displayName || 'Home')} Wins</span>
                                <strong style="font-size:22px; color:#10b981;">${h2h.homeWins || 0}</strong>
                            </div>
                            <div style="background:var(--bg-canvas); border:1px solid var(--border-subtle); border-radius:8px; padding:12px; text-align:center;">
                                <span style="font-size:11px; text-transform:uppercase; color:var(--text-muted); display:block;">All-Time Draws</span>
                                <strong style="font-size:22px; color:var(--text-muted);">${h2h.draws || 0}</strong>
                            </div>
                            <div style="background:var(--bg-canvas); border:1px solid var(--border-subtle); border-radius:8px; padding:12px; text-align:center;">
                                <span style="font-size:11px; text-transform:uppercase; color:var(--text-muted); display:block;">${escapeHtml(away.team?.displayName || 'Away')} Wins</span>
                                <strong style="font-size:22px; color:#3b82f6;">${h2h.awayWins || 0}</strong>
                            </div>
                        </div>

                        <!-- Lifetime Ratio Bar & Quick Rates -->
                        <div style="background:var(--bg-canvas); border:1px solid var(--border-subtle); border-radius:8px; padding:12px 14px; margin-bottom:20px;">
                            <div style="display:flex; justify-content:space-between; font-size:11.5px; color:var(--text-muted); margin-bottom:6px; font-weight:600;">
                                <span style="color:#10b981;">${escapeHtml(home.team?.abbreviation || home.team?.displayName || 'Home')} ${totalLifetimeMeetings > 0 ? Math.round(((h2h.homeWins || 0) / totalLifetimeMeetings) * 100) : 0}%</span>
                                <span>Draws ${totalLifetimeMeetings > 0 ? Math.round(((h2h.draws || 0) / totalLifetimeMeetings) * 100) : 0}%</span>
                                <span style="color:#3b82f6;">${escapeHtml(away.team?.abbreviation || away.team?.displayName || 'Away')} ${totalLifetimeMeetings > 0 ? Math.round(((h2h.awayWins || 0) / totalLifetimeMeetings) * 100) : 0}%</span>
                            </div>
                            <div style="display:flex; height:8px; border-radius:4px; overflow:hidden; background:var(--bg-surface-elevated);">
                                <div style="width:${totalLifetimeMeetings > 0 ? ((h2h.homeWins || 0) / totalLifetimeMeetings) * 100 : 0}%; background:#10b981;"></div>
                                <div style="width:${totalLifetimeMeetings > 0 ? ((h2h.draws || 0) / totalLifetimeMeetings) * 100 : 0}%; background:#9ca3af;"></div>
                                <div style="width:${totalLifetimeMeetings > 0 ? ((h2h.awayWins || 0) / totalLifetimeMeetings) * 100 : 0}%; background:#3b82f6;"></div>
                            </div>
                            <div style="display:flex; justify-content:space-around; margin-top:10px; padding-top:8px; border-top:1px dashed var(--border-subtle); font-size:11.5px; color:var(--text-muted);">
                                <span>Avg Goals: <strong style="color:var(--text-main);">${h2h.averageGoalsPerMatch || '—'}</strong></span>
                                <span>BTTS: <strong style="color:var(--text-main);">${h2h.bttsPercentage || 0}%</strong></span>
                                <span>Over 2.5: <strong style="color:var(--text-main);">${h2h.over25Percentage || 0}%</strong></span>
                            </div>
                        </div>

                        <!-- Recent Encounters (Last 5 Head-to-Head) -->
                        <h5 style="margin:20px 0 10px; font-size:13px; color:var(--text-main); display:flex; justify-content:space-between; align-items:center;">
                            <span>Recent Encounters (Last 5 Head-to-Head)</span>
                            <span style="font-size:11.5px; color:var(--text-muted); font-weight:normal;">Showing ${recentH2h.length} of ${totalLifetimeMeetings} encounters</span>
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
                    <h4 style="margin:0 0 14px; font-size:14px; color:var(--text-main);">Official Team Lineups</h4>
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
                tabBtn.addEventListener('click', () => {
                    const target = tabBtn.dataset.drawerTab;
                    state.drawerActiveTab = target;
                    elements['dialog-content'].querySelectorAll('.drawer-tab').forEach(b => b.classList.toggle('active', b === tabBtn));
                    elements['dialog-content'].querySelectorAll('.drawer-tab-content').forEach(c => {
                        c.hidden = c.id !== `drawer-tab-${target}`;
                    });
                });
            });
        }
    }

    function closeMatchDialog() {
        window.clearInterval(state.matchTimer);
        state.matchTimer = null;
        state.currentEventId = null;
        state.drawerActiveTab = 'timeline';
        if (elements['match-dialog']) elements['match-dialog'].close();
    }

    function setupThemeToggle() {
        const saved = localStorage.getItem('norra_theme') || localStorage.getItem('theme') || 'dark';
        applyTheme(saved);

        const toggleTheme = () => {
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
            toggleBtn.onclick = toggleTheme;
        }
        const stickyToggle = document.getElementById('sticky-theme-toggle');
        if (stickyToggle) {
            stickyToggle.onclick = toggleTheme;
        }
    }

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        if (document.body) document.body.className = theme === 'light' ? 'theme-light' : '';
        const icon = theme === 'light' ? '🌙' : '☀️';
        const title = `Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`;
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
        if (metaTheme) metaTheme.setAttribute('content', theme === 'light' ? '#ffffff' : '#0b0f19');
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
            renderAdSlot('ad-slot-infeed', res.ads?.inFeed);
            renderAdSlot('ad-slot-drawer', res.ads?.drawer);
            renderAdSlot('ad-slot-footer', res.ads?.footer);

        } catch (err) {
            console.warn('Ad/Promo load error:', err);
        }
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
            pill.addEventListener('click', () => {
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
                } else if (state.selectedLeagueSlug === 'all') {
                    loadAllLeagueFixtures();
                } else if (state.league) {
                    loadFixtures();
                }
            });
        });

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

    function togglePinMatch(eventId) {
        if (!eventId) return;
        const idStr = String(eventId);
        const idx = state.pinnedMatches.indexOf(idStr);
        if (idx === -1) {
            state.pinnedMatches.push(idStr);
            showToast('⭐ Match pinned to top of live scores');
        } else {
            state.pinnedMatches.splice(idx, 1);
            showToast('Match unpinned');
        }
        try {
            localStorage.setItem('norra_pinned_matches', JSON.stringify(state.pinnedMatches));
        } catch {}

        // Re-render fixtures list to reflect pinning
        if (state.selectedLeagueSlug === 'all') {
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

        function setMatchdayDate(dateObj) {
            const iso = isoDateInput(dateObj);
            state.selectedDateStr = iso;
            if (elements['date-from']) elements['date-from'].value = iso;
            if (elements['date-to']) elements['date-to'].value = iso;
            if (picker) picker.value = iso;

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
                    const leaguePills = document.querySelectorAll('.quick-league-pill');
                    leaguePills.forEach(p => p.classList.toggle('active', p.dataset.slug === 'all'));
                }
            }

            if (state.selectedLeagueSlug === 'all') {
                loadAllLeagueFixtures();
            } else if (state.league) {
                loadFixtures();
            }
        }

        if (pillsList) {
            pillsList.querySelectorAll('.date-pill-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    pillsList.querySelectorAll('.date-pill-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    const day = btn.dataset.day;
                    const d = new Date();
                    if (day === 'yesterday') {
                        d.setDate(d.getDate() - 1);
                        state.selectedDayOffset = -1;
                    } else if (day === 'tomorrow') {
                        d.setDate(d.getDate() + 1);
                        state.selectedDayOffset = 1;
                    } else {
                        state.selectedDayOffset = 0;
                    }
                    setMatchdayDate(d);
                });
            });
        }

        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                state.selectedDayOffset -= 1;
                const d = new Date();
                d.setDate(d.getDate() + state.selectedDayOffset);
                if (pillsList) pillsList.querySelectorAll('.date-pill-btn').forEach(b => b.classList.remove('active'));
                setMatchdayDate(d);
            });
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                state.selectedDayOffset += 1;
                const d = new Date();
                d.setDate(d.getDate() + state.selectedDayOffset);
                if (pillsList) pillsList.querySelectorAll('.date-pill-btn').forEach(b => b.classList.remove('active'));
                setMatchdayDate(d);
            });
        }

        if (picker) {
            picker.value = isoDateInput(new Date());
            picker.addEventListener('change', (e) => {
                if (e.target.value) {
                    const picked = new Date(e.target.value);
                    if (!isNaN(picked.getTime())) {
                        state.selectedDayOffset = 999;
                        if (pillsList) pillsList.querySelectorAll('.date-pill-btn').forEach(b => b.classList.remove('active'));
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
        if (!elements['fixtures-list']) return;
        const rows = elements['fixtures-list'].querySelectorAll('.fs-match-row');
        if (!query) {
            rows.forEach(r => r.style.display = 'flex');
            elements['fixtures-list'].querySelectorAll('.fs-league-section').forEach(s => s.style.display = 'block');
            return;
        }

        elements['fixtures-list'].querySelectorAll('.fs-league-section').forEach(sec => {
            let sectionHasMatch = false;
            sec.querySelectorAll('.fs-match-row').forEach(row => {
                const searchData = (row.dataset.search || row.textContent).toLowerCase();
                const matched = searchData.includes(query);
                row.style.display = matched ? 'flex' : 'none';
                if (matched) sectionHasMatch = true;
            });
            sec.style.display = sectionHasMatch ? 'block' : 'none';
        });
    }

    function initLiveSync() {
        const refreshBtn = document.getElementById('quick-refresh-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                syncLiveScores();
            });
        }

        async function syncLiveScores() {
            try {
                const res = await fetchJson('/api/v1/football/live');
                const liveMatches = res.live || [];
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

                // If currently viewing live view or matches are live, update smoothly in background without screen flashing
                // Only update the visible fixture list if the user is currently viewing today (offset 0),
                // so browsing tomorrow/yesterday fixtures is never wiped out by background live polling!
                const isViewingToday = !state.selectedDayOffset || state.selectedDayOffset === 0;
                if (isViewingToday) {
                    if (state.selectedLeagueSlug === 'live' || state.currentStatus === 'live') {
                        loadLiveMatches({ background: true });
                    } else if (state.selectedLeagueSlug === 'all') {
                        loadAllLeagueFixtures({ background: true });
                    } else if (state.league) {
                        loadFixtures({ background: true });
                    }
                }
            } catch (e) {
                // background poll notice
            }
        }

        // Background poll every 8 seconds for rapid in-play score changes
        window.clearInterval(state.liveSyncTimer);
        state.liveSyncTimer = window.setInterval(syncLiveScores, 8000);
        // Immediate check and subsequent check
        syncLiveScores();
        setTimeout(syncLiveScores, 1500);
    }

    async function initialize() {
        setupThemeToggle();
        setupBackToTop();
        setupTimezones();
        bindEvents();
        setInitialFixtureWindow();
        const currentYearEl = document.getElementById('current-year');
        if (currentYearEl) currentYearEl.textContent = new Date().getFullYear();

        if (document.body.dataset.pageKind === 'api') {
            const pricingEl = document.getElementById('pricing-page-section');
            if (pricingEl) {
                setTimeout(() => {
                    pricingEl.scrollIntoView({ behavior: 'smooth' });
                }, 400);
            }
        }

        const results = await Promise.allSettled([loadMeta(), loadLeagues(), loadAdsAndPromos()]);
        if (results[1].status === 'rejected' && elements['country-select']) {
            elements['country-select'].replaceChildren(new Option('Unable to load leagues', ''));
            showToast(`Unable to load the league catalog: ${results[1].reason.message}`);
        }
    }

    initialize();
})();
