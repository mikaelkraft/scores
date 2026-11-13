const SITE_NAME = 'Scores by Norra AI';
const NORRA_URL = 'https://mynorra.xyz';

// Stored names are provider-shaped ("Italian Serie A"); these are the names
// people actually search for. Extra entries stay inert until the listener
// starts ingesting that competition.
const LEAGUE_NAME_OVERRIDES = {
    'eng.1': 'Premier League',
    'eng.2': 'EFL Championship',
    'esp.1': 'LaLiga',
    'esp.2': 'LaLiga 2',
    'ita.1': 'Serie A',
    'ita.2': 'Serie B',
    'ger.1': 'Bundesliga',
    'ger.2': '2. Bundesliga',
    'fra.1': 'Ligue 1',
    'fra.2': 'Ligue 2',
    'por.1': 'Primeira Liga',
    'ned.1': 'Eredivisie',
    'tur.1': 'Süper Lig',
    'ksa.1': 'Saudi Pro League',
    'usa.1': 'Major League Soccer',
    'bra.1': 'Brasileirão Série A',
    'arg.1': 'Liga Profesional Argentina',
    'mex.1': 'Liga MX',
    'uefa.champions': 'UEFA Champions League',
    'uefa.europa': 'UEFA Europa League',
    'uefa.europa.conf': 'UEFA Conference League',
    'uefa.super_cup': 'UEFA Super Cup',
    'fifa.world': 'FIFA World Cup',
    'fifa.cwc': 'FIFA Club World Cup',
    'caf.champions': 'CAF Champions League',
    'caf.confed': 'CAF Confederation Cup',
    'caf.nations': 'Africa Cup of Nations',
    'concacaf.nations': 'CONCACAF Nations League',
    'rsa.1': 'South African Premiership',
    'egy.1': 'Egyptian Premier League',
    'mar.1': 'Moroccan Botola Pro',
    'nga.1': 'Nigeria Premier League',
    'eng.3': 'EFL League One',
    'eng.4': 'EFL League Two',
    'col.1': 'Colombian Primera A',
    'mex.2': 'Liga de Expansión MX',
    'bra.2': 'Brasileirão Série B',
    'arg.copa': 'Copa Argentina',
    'bol.copa': 'Copa Bolivia',
    'fifa.youth': 'FIFA Youth Championship',
    'club.friendly': 'Club Friendlies',
    'usa.usl.1': 'USL Championship',
    'usa.open': 'U.S. Open Cup'
};

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function safeJson(value) {
    return JSON.stringify(value)
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')
        .replace(/&/g, '\\u0026');
}

function slugifyCountry(value) {
    return String(value || 'other')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'other';
}

function leagueName(league = {}) {
    return LEAGUE_NAME_OVERRIDES[league.slug]
        || league.name
        || league.abbreviation
        || 'Football competition';
}

function leagueUrl(baseUrl, league) {
    return `${baseUrl}/football/${encodeURIComponent(league.slug)}`;
}

function countryUrl(baseUrl, country) {
    return `${baseUrl}/football/country/${slugifyCountry(country)}`;
}

function slugifyName(value) {
    return String(value || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

// Logos arrive from the listener, so only http(s) URLs are ever put in a src.
function safeImageUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
        const url = new URL(raw, 'https://scores.mynorra.xyz');
        return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
    } catch {
        return '';
    }
}

function clubDisplayName(club = {}) {
    return club.display_name || club.name || club.short_display_name || 'Club';
}

// Keyword-rich but permanently addressable: the readable part can change with a
// club rename while the trailing event id keeps the URL resolvable.
function matchSlugFor(match = {}) {
    const home = slugifyName(clubDisplayName(match.home));
    const away = slugifyName(clubDisplayName(match.away));
    const eventId = String(match.source?.event_id || '');
    const readable = [home, away].filter(Boolean).join('-vs-');
    return readable ? `${readable}-${eventId}` : eventId;
}

function matchUrl(baseUrl, match = {}) {
    return `${baseUrl}/football/${encodeURIComponent(match.league_slug || '')}/${matchSlugFor(match)}`;
}

function clubUrl(baseUrl, club = {}) {
    return `${baseUrl}/football/club/${encodeURIComponent(club.slug || '')}`;
}

function matchTitleName(match = {}) {
    const home = clubDisplayName(match.home);
    const away = clubDisplayName(match.away);
    const homeScore = match.home?.score;
    const awayScore = match.away?.score;
    if (match.status?.state === 'post' && homeScore != null && awayScore != null) {
        return `${home} ${homeScore}-${awayScore} ${away}`;
    }
    return `${home} vs ${away}`;
}

function formatKickoff(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Kick-off to be confirmed';
    return new Intl.DateTimeFormat('en-GB', {
        timeZone: 'UTC',
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).format(date) + ' UTC';
}

function isoOrEmpty(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function ordinal(value) {
    const number = Number(value);
    if (!Number.isInteger(number) || number < 1) return String(value ?? '');
    const remainderHundred = number % 100;
    if (remainderHundred >= 11 && remainderHundred <= 13) return `${number}th`;
    const suffixes = { 1: 'st', 2: 'nd', 3: 'rd' };
    return `${number}${suffixes[number % 10] || 'th'}`;
}

function renderForm(form) {
    const results = String(form || '').toUpperCase().replace(/[^WDL]/g, '').split('');
    if (!results.length) return '';
    const labels = { W: 'Win', D: 'Draw', L: 'Loss' };
    return `<span class="form-run" role="list" aria-label="Recent form, most recent last">${results
        .map(result => `<b role="listitem" class="form-${result.toLowerCase()}" title="${labels[result]}">${result}</b>`)
        .join('')}</span>`;
}

function seasonName(league = {}) {
    return league.season?.display_name
        || (league.season?.year ? `${league.season.year} season` : 'current season');
}

function formatMatchDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Date to be confirmed';
    return new Intl.DateTimeFormat('en-GB', {
        timeZone: 'UTC',
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).format(date);
}

function formatPageDate(value = new Date()) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'today';
    return new Intl.DateTimeFormat('en-GB', {
        timeZone: 'UTC',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    }).format(date);
}

function matchStatus(match) {
    if (match.status?.state === 'in') return match.status.clock || 'Live';
    if (match.status?.state === 'post') {
        const homeScore = match.home?.score;
        const awayScore = match.away?.score;
        return homeScore == null || awayScore == null ? 'Full time' : `${homeScore}–${awayScore}`;
    }
    return 'Scheduled';
}

function renderLeagueCards(leagues, baseUrl) {
    if (!leagues.length) {
        return '<p class="seo-empty">Competition pages will appear as verified league data becomes available.</p>';
    }

    // Group leagues by country so subdivisions appear under a toggle without repetitive cards
    const countryMap = new Map();
    for (const l of leagues) {
        const country = l.country || 'International';
        if (!countryMap.has(country)) {
            countryMap.set(country, []);
        }
        countryMap.get(country).push(l);
    }

    const COUNTRY_CODES = {
        'england': 'gb-eng', 'spain': 'es', 'italy': 'it', 'germany': 'de', 'france': 'fr',
        'nigeria': 'ng', 'netherlands': 'nl', 'portugal': 'pt', 'brazil': 'br', 'argentina': 'ar',
        'south africa': 'za', 'egypt': 'eg', 'morocco': 'ma', 'kenya': 'ke', 'ghana': 'gh',
        'usa': 'us', 'saudi arabia': 'sa', 'turkey': 'tr', 'belgium': 'be', 'scotland': 'gb-sct'
    };

    const PRIORITY = ['England', 'Spain', 'Italy', 'Germany', 'France', 'International', 'Europe', 'Nigeria', 'South Africa', 'Saudi Arabia', 'USA', 'Brazil', 'Argentina'];
    const sortedCountries = Array.from(countryMap.keys()).sort((a, b) => {
        const aP = PRIORITY.indexOf(a);
        const bP = PRIORITY.indexOf(b);
        if (aP !== -1 && bP !== -1) return aP - bP;
        if (aP !== -1) return -1;
        if (bP !== -1) return 1;
        return a.localeCompare(b, 'en');
    });

    return `<div class="country-accordion-grid">${sortedCountries.map(country => {
        const cLeagues = countryMap.get(country) || [];
        const code = COUNTRY_CODES[country.toLowerCase()] || '';
        const flagHtml = code
            ? `<img src="https://flagcdn.com/w40/${code}.png" alt="${escapeHtml(country)}" loading="lazy" style="width:20px; height:15px; object-fit:cover; border-radius:2px; flex-shrink:0;">`
            : `<span style="font-size:16px; flex-shrink:0;">🌐</span>`;

        if (cLeagues.length === 1) {
            const l = cLeagues[0];
            return `
                <div class="country-league-accordion-card single-league-card">
                    <a class="country-accordion-header" href="${escapeHtml(leagueUrl(baseUrl, l))}" style="text-decoration:none;">
                        <div style="display:flex; align-items:center; gap:8px;">
                            ${flagHtml}
                            <strong style="font-size:13.5px; color:var(--text-main);">${escapeHtml(country)} · ${escapeHtml(leagueName(l))}</strong>
                        </div>
                        <span class="country-league-count-badge">View &rarr;</span>
                    </a>
                </div>
            `;
        }

        return `
            <details class="country-league-accordion-card">
                <summary class="country-accordion-header">
                    <div style="display:flex; align-items:center; gap:8px;">
                        ${flagHtml}
                        <strong style="font-size:13.5px; color:var(--text-main);">${escapeHtml(country)}</strong>
                    </div>
                    <span class="country-league-count-badge">${cLeagues.length} competitions ▾</span>
                </summary>
                <div class="country-accordion-content">
                    ${cLeagues.map(l => `
                        <a class="country-subleague-link" href="${escapeHtml(leagueUrl(baseUrl, l))}">
                            <span>⚽ ${escapeHtml(leagueName(l))}</span>
                            <small style="color:var(--text-muted); font-size:11px;">${l.hasStandings ? 'Table &amp; Fixtures' : 'Fixtures'}</small>
                        </a>
                    `).join('')}
                </div>
            </details>
        `;
    }).join('')}</div>`;
}

function renderCountryLinks(leagues, baseUrl) {
    const countries = [...new Set(leagues.map(league => league.country || 'International'))]
        .sort((a, b) => a.localeCompare(b, 'en'));
    if (!countries.length) return '';

    return `<nav class="country-links" aria-label="Football competitions by country">
        ${countries.map(country => `<a href="${escapeHtml(countryUrl(baseUrl, country))}">${escapeHtml(country)} football</a>`).join('')}
    </nav>`;
}

function renderMatchList(title, matches, options = {}) {
    if (!matches?.length) {
        return options.emptyMessage
            ? `<section class="seo-match-block"><h3>${escapeHtml(title)}</h3><p class="seo-empty">${escapeHtml(options.emptyMessage)}</p></section>`
            : '';
    }

    return `<section class="seo-match-block">
        <h3>${escapeHtml(title)}</h3>
        <ol class="seo-match-list">${matches.map(match => {
        const home = clubDisplayName(match.home);
        const away = clubDisplayName(match.away);
        const dateTime = isoOrEmpty(match.date);
        // Every fixture links to its own match page so crawlers can reach the
        // long-tail pages without relying on the sitemap alone.
        const href = options.baseUrl && match.source?.event_id && match.league_slug
            ? matchUrl(options.baseUrl, match)
            : '';
        const teams = `<strong>${escapeHtml(home)}</strong> vs <strong>${escapeHtml(away)}</strong>`;
        return `<li>
                <span>${options.showLeague && match.league ? `<a class="match-competition" href="${escapeHtml(leagueUrl(options.baseUrl, match.league))}">${escapeHtml(leagueName(match.league))}</a> <span class="match-sep" aria-hidden="true">·</span> ` : ''}${href ? `<a class="match-link" href="${escapeHtml(href)}">${teams}</a>` : teams}</span>
                <time${dateTime ? ` datetime="${dateTime}"` : ''}>${escapeHtml(formatMatchDate(match.date))}</time>
                <b>${escapeHtml(matchStatus(match))}</b>
            </li>`;
    }).join('')}</ol>
    </section>`;
}

function standingStat(entry, names) {
    const stats = entry?.stats;
    for (const name of names) {
        if (stats instanceof Map && stats.has(name)) return stats.get(name);
        if (stats && Object.prototype.hasOwnProperty.call(stats, name)) return stats[name];
    }
    return '–';
}

function renderStandings(standings, name) {
    const availableGroups = (standings || []).filter(group => group?.entries?.length);
    if (!availableGroups.length) {
        return `<section class="seo-standing"><h2>${escapeHtml(name)} standings</h2><p class="seo-empty">A verified league table is not stored for this competition yet.</p></section>`;
    }

    return `<section class="seo-standing" aria-labelledby="seo-standing-title">
        <div class="seo-section-heading">
            <p class="overline">Latest stored table</p>
            <h2 id="seo-standing-title">${escapeHtml(name)} standings</h2>
        </div>
        <div class="seo-standing-groups">${availableGroups.map(standing => `<div class="table-wrap"><table class="standings-table"><caption>${escapeHtml(standing.group_name || `${name} table`)}</caption>
            <thead><tr><th scope="col">Pos</th><th scope="col">Club</th><th scope="col">Played</th><th scope="col">GD</th><th scope="col">Points</th></tr></thead>
            <tbody>${standing.entries.slice(0, 20).map(entry => `<tr>
                <td class="rank">${escapeHtml(entry.rank || '–')}</td>
                <td>${escapeHtml(entry.club?.display_name || 'Club')}</td>
                <td>${escapeHtml(standingStat(entry, ['gamesPlayed', 'played']))}</td>
                <td>${escapeHtml(standingStat(entry, ['pointDifferential', 'goalDifference']))}</td>
                <td class="points">${escapeHtml(standingStat(entry, ['points']))}</td>
            </tr>`).join('')}</tbody>
        </table></div>`).join('')}</div>
    </section>`;
}

function renderClubBadge(club, options = {}) {
    const name = clubDisplayName(club);
    const logo = safeImageUrl(club.logo || club.logos?.[0]?.href);
    const image = logo
        ? `<img src="${escapeHtml(logo)}" alt="${escapeHtml(name)} crest" width="56" height="56" loading="lazy" decoding="async">`
        : `<span class="club-badge-fallback" aria-hidden="true">${escapeHtml((club.abbreviation || name).slice(0, 3).toUpperCase())}</span>`;
    const label = options.href
        ? `<a href="${escapeHtml(options.href)}">${escapeHtml(name)}</a>`
        : escapeHtml(name);
    return `<div class="match-club">
        ${image}
        <strong>${label}</strong>
        ${options.form ? renderForm(options.form) : ''}
    </div>`;
}

function renderMatchTimeline(events) {
    const notable = (events || []).filter(event => {
        const flags = event.flags || {};
        return flags.scoring_play || flags.yellow_card || flags.red_card || flags.substitution;
    });
    if (!notable.length) {
        return `<section class="seo-match-timeline" aria-labelledby="timeline-title">
            <div class="seo-section-heading">
                <p class="overline">Goals, cards and substitutions</p>
                <h2 id="timeline-title">Match events</h2>
            </div>
            <p class="seo-empty">No goals, cards or substitutions are currently stored for this match.</p>
        </section>`;
    }

    const eventLabel = event => {
        const flags = event.flags || {};
        if (flags.own_goal) return 'Own goal';
        if (flags.penalty_kick && flags.scoring_play) return 'Penalty goal';
        if (flags.scoring_play) return 'Goal';
        if (flags.red_card) return 'Red card';
        if (flags.yellow_card) return 'Yellow card';
        if (flags.substitution) return 'Substitution';
        return event.event_type?.name || 'Event';
    };

    return `<section class="seo-match-timeline" aria-labelledby="timeline-title">
        <div class="seo-section-heading">
            <p class="overline">Goals, cards and substitutions</p>
            <h2 id="timeline-title">Match events</h2>
        </div>
        <ol class="timeline-list">${notable.map(event => {
        const minute = event.clock?.display_value || (event.clock?.value != null ? `${event.clock.value}'` : '');
        const score = event.home_score != null && event.away_score != null ? `${event.home_score}-${event.away_score}` : '';
        return `<li class="timeline-item">
                <span class="timeline-clock">${escapeHtml(minute || '—')}</span>
                <span class="timeline-kind">${escapeHtml(eventLabel(event))}</span>
                <span class="timeline-text">${escapeHtml(event.text || event.alternative_text || eventLabel(event))}</span>
                ${score ? `<b class="timeline-score">${escapeHtml(score)}</b>` : ''}
            </li>`;
    }).join('')}</ol>
    </section>`;
}

function matchContent(context) {
    const { match, league, baseUrl, events, homeClub, awayClub, headToHead } = context;
    const name = leagueName(league);
    const country = league?.country || 'International';
    const home = clubDisplayName(match.home);
    const away = clubDisplayName(match.away);
    const state = match.status?.state;
    const isFinished = state === 'post';
    const isLive = state === 'in';
    const homeScore = match.home?.score;
    const awayScore = match.away?.score;
    const scoreLine = homeScore != null && awayScore != null ? `${homeScore} – ${awayScore}` : 'vs';
    const statusLabel = isLive
        ? `Live · ${match.status?.clock || match.status?.short_detail || 'In progress'}`
        : (isFinished ? (match.status?.detail || 'Full time') : 'Scheduled');

    const venue = match.venue?.name
        ? `${match.venue.name}${match.venue.city ? `, ${match.venue.city}` : ''}`
        : '';

    return `<section class="seo-directory shell" id="match" aria-labelledby="match-heading">
        <nav class="breadcrumbs" aria-label="Breadcrumb">
            <a href="/">Home</a><span>›</span>
            <a href="${escapeHtml(countryUrl(baseUrl, country))}">${escapeHtml(country)} football</a><span>›</span>
            <a href="${escapeHtml(leagueUrl(baseUrl, league))}">${escapeHtml(name)}</a><span>›</span>
            <span>${escapeHtml(home)} vs ${escapeHtml(away)}</span>
        </nav>

        <div class="match-scoreline ${isLive ? 'is-live' : ''}">
            ${renderClubBadge(match.home, { href: homeClub?.slug ? clubUrl(baseUrl, homeClub) : '', form: match.home?.form })}
            <div class="match-center">
                <span class="match-state-pill">${escapeHtml(statusLabel)}</span>
                <strong class="match-score">${escapeHtml(scoreLine)}</strong>
                <time datetime="${escapeHtml(isoOrEmpty(match.date))}">${escapeHtml(formatKickoff(match.date))}</time>
            </div>
            ${renderClubBadge(match.away, { href: awayClub?.slug ? clubUrl(baseUrl, awayClub) : '', form: match.away?.form })}
        </div>

        <div class="seo-section-heading">
            <h2 id="match-heading">${escapeHtml(home)} vs ${escapeHtml(away)} ${isFinished ? 'result and match details' : 'live score and match details'}</h2>
            <p>${isFinished
                ? `${escapeHtml(home)} played ${escapeHtml(away)} in the ${escapeHtml(name)} on ${escapeHtml(formatMatchDate(match.date))}. The final score and any stored goals, cards or substitutions are shown below.`
                : (isLive
                    ? `${escapeHtml(home)} vs ${escapeHtml(away)} is in progress in the ${escapeHtml(name)}. The score and match events update as the listener refreshes stored data.`
                    : `${escapeHtml(home)} host ${escapeHtml(away)} in the ${escapeHtml(name)} on ${escapeHtml(formatMatchDate(match.date))}. Follow the live score here once the match kicks off.`)}</p>
        </div>

        <dl class="seo-facts">
            <div><dt>Competition</dt><dd><a href="${escapeHtml(leagueUrl(baseUrl, league))}">${escapeHtml(name)}</a></dd></div>
            <div><dt>Kick-off</dt><dd>${escapeHtml(formatKickoff(match.date))}</dd></div>
            ${venue ? `<div><dt>Venue</dt><dd>${escapeHtml(venue)}</dd></div>` : ''}
            <div><dt>Status</dt><dd>${escapeHtml(statusLabel)}</dd></div>
            ${match.attendance ? `<div><dt>Attendance</dt><dd>${escapeHtml(match.attendance.toLocaleString('en-GB'))}</dd></div>` : ''}
            ${match.season?.year ? `<div><dt>Season</dt><dd>${escapeHtml(seasonName(league))}</dd></div>` : ''}
            ${match.last_synced_at ? `<div><dt>Data updated</dt><dd><time datetime="${escapeHtml(isoOrEmpty(match.last_synced_at))}">${escapeHtml(formatMatchDate(match.last_synced_at))} UTC</time></dd></div>` : ''}
        </dl>

        ${renderMatchTimeline(events)}

        ${headToHead?.length ? `<section class="seo-match-block">
            <h2>Previous ${escapeHtml(home)} vs ${escapeHtml(away)} meetings</h2>
            ${renderMatchList('Recent head-to-head results', headToHead, { baseUrl })}
        </section>` : ''}

        <div class="api-example-grid match-api">
            <article>
                <h2>Match data in JSON</h2>
                <p>Read this match summary, statistics and play-by-play from the free API.</p>
                <code>GET /get/soccer/${escapeHtml(match.league_slug)}/summary?event=${escapeHtml(match.source?.event_id || '')}</code>
            </article>
            <article>
                <h2>More ${escapeHtml(name)} matches</h2>
                <p>Browse the full schedule, live scores and the latest table.</p>
                <p><a class="seo-primary-link" href="${escapeHtml(leagueUrl(baseUrl, league))}">${escapeHtml(name)} fixtures and results</a></p>
            </article>
        </div>
        <p class="seo-disclaimer">This page covers the score, timing and match events. It does not provide or advertise video streams.</p>
    </section>`;
}

function clubContent(context) {
    const { club, baseUrl, upcomingMatches, recentMatches, leagues, standingRow, matchCount } = context;
    const name = clubDisplayName(club);
    const country = club.country || leagues?.[0]?.country || 'International';
    const primaryLeague = leagues?.[0];
    const venue = club.venue?.name || club.venue?.full_name || '';

    return `<section class="seo-directory shell" id="club" aria-labelledby="club-heading">
        <nav class="breadcrumbs" aria-label="Breadcrumb">
            <a href="/">Home</a><span>›</span>
            <a href="${escapeHtml(countryUrl(baseUrl, country))}">${escapeHtml(country)} football</a><span>›</span>
            ${primaryLeague ? `<a href="${escapeHtml(leagueUrl(baseUrl, primaryLeague))}">${escapeHtml(leagueName(primaryLeague))}</a><span>›</span>` : ''}
            <span>${escapeHtml(name)}</span>
        </nav>

        <div class="club-identity-card">
            ${renderClubBadge(club, {})}
            <div class="seo-section-heading">
                <p class="overline">${escapeHtml(country)} football club</p>
                <h2 id="club-heading">${escapeHtml(name)} fixtures, results and league position</h2>
                <p>Upcoming ${escapeHtml(name)} matches, recent results and the current stored league position. All data is free to view and available through the open football API.</p>
            </div>
        </div>

        <dl class="seo-facts">
            <div><dt>Club</dt><dd>${escapeHtml(name)}</dd></div>
            ${club.city ? `<div><dt>City</dt><dd>${escapeHtml(club.city)}</dd></div>` : ''}
            ${venue ? `<div><dt>Stadium</dt><dd>${escapeHtml(venue)}</dd></div>` : ''}
            ${primaryLeague ? `<div><dt>Competition</dt><dd><a href="${escapeHtml(leagueUrl(baseUrl, primaryLeague))}">${escapeHtml(leagueName(primaryLeague))}</a></dd></div>` : ''}
            ${standingRow?.rank ? `<div><dt>League position</dt><dd>${escapeHtml(ordinal(standingRow.rank))}</dd></div>` : ''}
            ${standingRow?.points != null ? `<div><dt>Points</dt><dd>${escapeHtml(standingRow.points)}</dd></div>` : ''}
            <div><dt>Stored matches</dt><dd>${escapeHtml(matchCount || 0)}</dd></div>
            ${club.last_synced_at ? `<div><dt>Data updated</dt><dd><time datetime="${escapeHtml(isoOrEmpty(club.last_synced_at))}">${escapeHtml(formatMatchDate(club.last_synced_at))} UTC</time></dd></div>` : ''}
        </dl>

        <div class="seo-match-columns">
            ${renderMatchList(`${name} upcoming fixtures`, upcomingMatches, { baseUrl, showLeague: true, emptyMessage: `No upcoming ${name} fixtures are stored yet.` })}
            ${renderMatchList(`${name} latest results`, recentMatches, { baseUrl, showLeague: true, emptyMessage: `No completed ${name} results are stored yet.` })}
        </div>

        ${leagues?.length ? `<div class="related-competitions">
            <h2>${escapeHtml(name)} competitions</h2>
            ${renderLeagueCards(leagues, baseUrl)}
        </div>` : ''}
        <p class="seo-disclaimer">Club fixtures, results and table position only. This service does not provide video streaming.</p>
    </section>`;
}

function homeContent(context) {
    const { leagues, baseUrl, todayMatches, recentMatches } = context;
    const today = formatPageDate(context.generatedAt);
    const allMatches = [...(todayMatches || []), ...(recentMatches || [])];
    const matchCrawlerNav = allMatches.length ? `
        <nav class="seo-crawler-matches visually-hidden" aria-label="Index of today's matches">
            ${allMatches.filter(m => m.source?.event_id && m.league_slug).map(m => `<a href="${escapeHtml(matchUrl(baseUrl, m))}">${escapeHtml(clubDisplayName(m.home))} vs ${escapeHtml(clubDisplayName(m.away))}</a>`).join('\n')}
        </nav>` : '';

    return `<section class="seo-directory shell" id="competitions" aria-labelledby="coverage-title">
        <div class="seo-section-heading">
            <p class="overline">Global football competition index</p>
            <h2 id="coverage-title">Football live scores and fixtures today across world leagues</h2>
            <p>Browse live scores, fixtures, standings, and match statistics across ${escapeHtml(leagues.length)} active world competitions. Powered by the Norra AI analytics engine.</p>
        </div>
        ${renderLeagueCards(leagues, baseUrl)}
        ${matchCrawlerNav}
        <div class="seo-topics faq-grid" style="margin-top:28px;">
            <article>
                <h2>Real-Time Live Scores &amp; Clocks</h2>
                <p>Track in-play match scores, live clocks, goal events, card alerts, and substitutions with sub-second polling and WebSocket feeds.</p>
            </article>
            <article>
                <h2>Comprehensive Global Fixtures</h2>
                <p>Access full season schedules, matchday results, head-to-head records, and official league standings across Europe, the Americas, Asia, and Africa.</p>
            </article>
            <article>
                <h2>Commercial Sports API Plans</h2>
                <p>Integrate our low-latency sports API into your websites, apps, and betting platforms. Plans start at $10/mo with free developer sandboxes available in the <a href="/account">Developer Portal</a>.</p>
            </article>
        </div>
    </section>`;
}

function countryContent(context) {
    const { leagues, baseUrl, country, todayMatches, recentMatches } = context;
    return `<section class="seo-directory shell" id="competitions" aria-labelledby="coverage-title">
        <nav class="breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>›</span><span>${escapeHtml(country)} football</span></nav>
        <div class="seo-section-heading">
            <p class="overline">${escapeHtml(country)} football data</p>
            <h2 id="coverage-title">${escapeHtml(country)} football live scores and fixtures</h2>
            <p>Choose from ${escapeHtml(leagues.length)} verified ${escapeHtml(country)} competitions for live score updates, today's matches, upcoming schedules, completed results and available league tables.</p>
        </div>
        <div class="seo-match-columns">
            ${renderMatchList(`${country} football matches today`, todayMatches, { showLeague: true, baseUrl, emptyMessage: `No ${country} matches are stored for today.` })}
            ${renderMatchList(`Latest ${country} football results`, recentMatches, { showLeague: true, baseUrl, emptyMessage: `No recent ${country} results are stored yet.` })}
        </div>
        ${renderLeagueCards(leagues, baseUrl)}
        <p class="seo-disclaimer">Scores and match details are free to view. This service provides football data and does not claim to provide live video streaming.</p>
    </section>`;
}

function leagueContent(context) {
    const { league, relatedLeagues, upcomingMatches, recentMatches, matchCount, standings, baseUrl } = context;
    const name = leagueName(league);
    const country = league.country || 'International';
    const season = seasonName(league);
    const hasTable = (standings || []).some(group => group?.entries?.length);

    return `<section class="seo-directory shell" id="competition-guide" aria-labelledby="coverage-title">
        <nav class="breadcrumbs" aria-label="Breadcrumb">
            <a href="/">Home</a><span>›</span>
            <a href="${escapeHtml(countryUrl(baseUrl, country))}">${escapeHtml(country)} football</a><span>›</span>
            <span>${escapeHtml(name)}</span>
        </nav>
        <div class="seo-section-heading">
            <p class="overline">${escapeHtml(season)}</p>
            <h2 id="coverage-title">${escapeHtml(name)} live scores, fixtures and results</h2>
            <p>Follow ${escapeHtml(name)} live scores today, upcoming fixtures, completed results and detailed match events. ${hasTable ? 'The latest stored league table is included below.' : 'A league table will appear when verified standings are available.'} All score data remains free to view.</p>
        </div>
        <dl class="seo-facts">
            <div><dt>Competition</dt><dd>${escapeHtml(name)}</dd></div>
            <div><dt>Country</dt><dd>${escapeHtml(country)}</dd></div>
            <div><dt>Season</dt><dd>${escapeHtml(season)}</dd></div>
            <div><dt>Stored matches</dt><dd>${escapeHtml(matchCount)}</dd></div>
            ${league.last_synced_at ? `<div><dt>Data updated</dt><dd><time datetime="${escapeHtml(isoOrEmpty(league.last_synced_at))}">${escapeHtml(formatMatchDate(league.last_synced_at))} UTC</time></dd></div>` : ''}
        </dl>
        <div class="seo-match-columns">
            ${renderMatchList(`${name} upcoming fixtures`, upcomingMatches, { baseUrl, emptyMessage: `No upcoming ${name} fixtures are stored yet.` })}
            ${renderMatchList(`${name} latest results`, recentMatches, { baseUrl, emptyMessage: `No completed ${name} results are stored yet.` })}
        </div>
        ${renderStandings(standings, name)}
        ${relatedLeagues?.length ? `<div class="related-competitions"><h2>More ${escapeHtml(country)} football competitions</h2>${renderLeagueCards(relatedLeagues, baseUrl)}</div>` : ''}
        <p class="seo-disclaimer">This page covers scores, schedules${hasTable ? ', tables' : ''} and match data. It does not advertise or provide unauthorised video streams.</p>
    </section>`;
}

function apiContent(context) {
    return `<section class="seo-directory shell api-guide" id="free-football-api" aria-labelledby="api-guide-title">
        <nav class="breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>›</span><span>Commercial &amp; Free Football API</span></nav>
        <div class="seo-section-heading">
            <p class="overline">High-Speed Commercial Sports API &amp; Webhook Engine</p>
            <h2 id="api-guide-title">Free Football API for Live Scores, Fixtures &amp; Standings</h2>
            <p>Build sports websites, mobile apps, and betting bots with documented JSON endpoints. No API key is required for public sandbox evaluation, while commercial production tiers offer high-throughput rate limits, sub-second telemetry, and white-label embeds.</p>
        </div>

        <div class="api-pricing-pointer-card" style="background:var(--bg-surface); border:1px solid var(--border-subtle); border-radius:var(--card-radius); padding:24px 28px; margin:28px 0; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
            <div>
                <span class="overline" style="margin-bottom:4px; display:block; color:var(--color-primary); font-size:12px; font-weight:700;">Commercial Plans &amp; Developer Sandboxes</span>
                <h3 style="margin:0 0 6px; font-size:20px; font-weight:800; color:var(--text-main);">Flexible Sports API Access Starting at $10/month</h3>
                <p style="margin:0; font-size:13.5px; color:var(--text-muted); max-width:620px;">Choose from our Free Developer Sandbox ($0/mo), Starter ($10/mo), Pro ($29/mo), and Enterprise Whitelabel ($79/mo) plans. Global checkout via PayPal and Flutterwave in USD, EUR, GBP, and NGN.</p>
            </div>
            <div style="display:flex; gap:12px; align-items:center;">
                <a href="/pricing" class="btn" style="padding:10px 20px; font-weight:700; font-size:13.5px; border-radius:6px; background:var(--color-primary); color:#ffffff; text-decoration:none;">View Pricing &amp; Plans &rarr;</a>
                <a href="/docs" class="btn" style="padding:10px 18px; font-weight:600; font-size:13.5px; border-radius:6px; border:1px solid var(--border-subtle); color:var(--text-main); text-decoration:none; background:var(--bg-surface-elevated);">Read API Docs</a>
            </div>
        </div>

        <div class="api-example-grid">
            <article><h2>Football fixtures API</h2><p>Browse a stored league schedule, filter by date or status, and paginate results.</p><code>GET /get/soccer/eng.1/fixtures?status=all</code></article>
            <article><h2>Live score API</h2><p>Read fixtures, in-progress match status, scores and available statistics for a date.</p><code>GET /get/soccer/eng.1/scoreboard?dates=20260822</code></article>
            <article><h2>Football standings API</h2><p>Retrieve the latest verified table or competition groups for a league and season.</p><code>GET /get/soccer/esp.1/standings?season=2026</code></article>
            <article><h2>Match events API</h2><p>Read stored match summaries and paginated play-by-play, including goals, cards and substitutions when available.</p><code>GET /get/soccer/esp.1/events/{eventId}/plays</code></article>
        </div>
        <div class="api-actions" style="margin-top:24px; display:flex; gap:12px; flex-wrap:wrap;">
            <a class="seo-primary-link" href="/account" style="background:var(--color-primary); color:#ffffff; padding:10px 18px; border-radius:8px; font-weight:600;">Open Developer Portal</a>
            <a class="seo-home-link" href="/api-docs/" style="border:1px solid var(--border-subtle); padding:10px 18px; border-radius:8px;">Interactive API Docs ↗</a>
        </div>
    </section>`;
}

function notFoundContent() {
    return `<section class="seo-directory shell">
        <div class="seo-section-heading"><h2>Competition not found</h2><p>This league is not active yet. Browse the verified football competitions currently available.</p></div>
        <a class="seo-home-link" href="/">View all football leagues</a>
    </section>`;
}

function unavailableContent() {
    return `<section class="seo-directory shell"><div class="seo-section-heading"><h2>Football data is temporarily unavailable</h2><p>The score database could not be read. Please try again shortly.</p></div></section>`;
}

function itemListSchema(leagues, baseUrl) {
    return {
        '@type': 'ItemList',
        itemListElement: leagues.map((league, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            name: leagueName(league),
            url: leagueUrl(baseUrl, league)
        }))
    };
}

function structuredData(context, canonical, description) {
    const organization = {
        '@type': 'Organization',
        '@id': `${context.baseUrl}/#organization`,
        name: SITE_NAME,
        url: `${context.baseUrl}/`,
        sameAs: [NORRA_URL]
    };
    const website = {
        '@type': 'WebSite',
        '@id': `${context.baseUrl}/#website`,
        url: `${context.baseUrl}/`,
        name: SITE_NAME,
        publisher: { '@id': `${context.baseUrl}/#organization` },
        inLanguage: 'en',
        description: 'Live football scores, fixtures, results, standings, match statistics and REST API data powered by Norra AI.'
    };

    if (['notFound', 'unavailable'].includes(context.kind)) {
        return {};
    }

    if (context.kind === 'match') {
        const { match, league } = context;
        const name = leagueName(league);
        const home = clubDisplayName(match.home);
        const away = clubDisplayName(match.away);
        const state = match.status?.state;
        const eventStatus = state === 'post'
            ? 'https://schema.org/EventCompleted'
            : 'https://schema.org/EventScheduled';
        const team = (club, clubDoc) => {
            const teamName = clubDisplayName(club);
            const node = { '@type': 'SportsTeam', name: teamName };
            const logo = safeImageUrl(club.logo || club.logos?.[0]?.href);
            if (logo) node.logo = logo;
            if (clubDoc?.slug) node.url = clubUrl(context.baseUrl, clubDoc);
            return node;
        };
        const homeTeam = team(match.home, context.homeClub);
        const awayTeam = team(match.away, context.awayClub);
        const sportsEvent = {
            '@type': 'SportsEvent',
            '@id': `${canonical}#event`,
            name: `${home} vs ${away}`,
            url: canonical,
            description,
            sport: 'Football',
            startDate: isoOrEmpty(match.date),
            eventStatus,
            eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
            homeTeam,
            awayTeam,
            competitor: [homeTeam, awayTeam]
        };
        if (match.venue?.name) {
            sportsEvent.location = {
                '@type': 'Place',
                name: match.venue.name,
                address: {
                    '@type': 'PostalAddress',
                    ...(match.venue.city ? { addressLocality: match.venue.city } : {}),
                    ...(match.venue.country ? { addressCountry: match.venue.country } : {})
                }
            };
        }
        return {
            '@context': 'https://schema.org',
            '@graph': [
                organization,
                website,
                {
                    '@type': 'WebPage',
                    '@id': `${canonical}#webpage`,
                    url: canonical,
                    name: `${matchTitleName(match)} — ${name}`,
                    description,
                    isPartOf: { '@id': `${context.baseUrl}/#website` },
                    mainEntity: { '@id': `${canonical}#event` },
                    dateModified: isoOrEmpty(match.last_synced_at) || undefined,
                    inLanguage: 'en'
                },
                sportsEvent,
                {
                    '@type': 'BreadcrumbList',
                    itemListElement: [
                        { '@type': 'ListItem', position: 1, name: 'Football live scores', item: `${context.baseUrl}/` },
                        { '@type': 'ListItem', position: 2, name: `${league?.country || 'International'} football`, item: countryUrl(context.baseUrl, league?.country || 'International') },
                        { '@type': 'ListItem', position: 3, name, item: leagueUrl(context.baseUrl, league) },
                        { '@type': 'ListItem', position: 4, name: `${home} vs ${away}`, item: canonical }
                    ]
                }
            ]
        };
    }

    if (context.kind === 'club') {
        const { club, leagues } = context;
        const name = clubDisplayName(club);
        const primaryLeague = leagues?.[0];
        const country = club.country || primaryLeague?.country || 'International';
        const sportsTeam = {
            '@type': 'SportsTeam',
            '@id': `${canonical}#team`,
            name,
            url: canonical,
            sport: 'Football',
            description
        };
        const logo = safeImageUrl(club.logo || club.logos?.[0]?.href);
        if (logo) sportsTeam.logo = logo;
        if (club.abbreviation) sportsTeam.alternateName = club.abbreviation;
        if (primaryLeague) {
            sportsTeam.memberOf = {
                '@type': 'SportsOrganization',
                name: leagueName(primaryLeague),
                url: leagueUrl(context.baseUrl, primaryLeague)
            };
        }
        const venueName = club.venue?.name || club.venue?.full_name;
        if (venueName) {
            sportsTeam.location = {
                '@type': 'Place',
                name: venueName,
                ...(club.city ? { address: { '@type': 'PostalAddress', addressLocality: club.city } } : {})
            };
        }

        return {
            '@context': 'https://schema.org',
            '@graph': [
                organization,
                website,
                {
                    '@type': 'WebPage',
                    '@id': `${canonical}#webpage`,
                    url: canonical,
                    name: `${name} fixtures, results and league position`,
                    description,
                    isPartOf: { '@id': `${context.baseUrl}/#website` },
                    mainEntity: { '@id': `${canonical}#team` },
                    dateModified: isoOrEmpty(club.last_synced_at) || undefined,
                    inLanguage: 'en'
                },
                sportsTeam,
                {
                    '@type': 'BreadcrumbList',
                    itemListElement: [
                        { '@type': 'ListItem', position: 1, name: 'Football live scores', item: `${context.baseUrl}/` },
                        { '@type': 'ListItem', position: 2, name: `${country} football`, item: countryUrl(context.baseUrl, country) },
                        ...(primaryLeague ? [{ '@type': 'ListItem', position: 3, name: leagueName(primaryLeague), item: leagueUrl(context.baseUrl, primaryLeague) }] : []),
                        { '@type': 'ListItem', position: primaryLeague ? 4 : 3, name, item: canonical }
                    ]
                }
            ]
        };
    }

    if (context.kind === 'league') {
        const name = leagueName(context.league);
        const country = context.league.country || 'International';
        const hasTable = (context.standings || []).some(group => group?.entries?.length);
        return {
            '@context': 'https://schema.org',
            '@graph': [
                organization,
                website,
                {
                    '@type': 'CollectionPage',
                    '@id': `${canonical}#webpage`,
                    url: canonical,
                    name: `${name} live scores, fixtures and ${hasTable ? 'standings' : 'results'}`,
                    description,
                    isPartOf: { '@id': `${context.baseUrl}/#website` },
                    about: { '@id': `${canonical}#dataset` },
                    dateModified: context.league.last_synced_at,
                    inLanguage: 'en'
                },
                {
                    '@type': 'Dataset',
                    '@id': `${canonical}#dataset`,
                    name: `${name} fixtures, results${hasTable ? ' and standings' : ''}`,
                    description,
                    url: canonical,
                    isAccessibleForFree: true,
                    dateModified: isoOrEmpty(context.league.last_synced_at) || undefined,
                    distribution: [{
                        '@type': 'DataDownload',
                        encodingFormat: 'application/json',
                        contentUrl: `${context.baseUrl}/get/soccer/${encodeURIComponent(context.league.slug)}/fixtures`
                    }]
                },
                {
                    '@type': 'BreadcrumbList',
                    itemListElement: [
                        { '@type': 'ListItem', position: 1, name: 'Football live scores', item: `${context.baseUrl}/` },
                        { '@type': 'ListItem', position: 2, name: `${country} football`, item: countryUrl(context.baseUrl, country) },
                        { '@type': 'ListItem', position: 3, name, item: canonical }
                    ]
                }
            ]
        };
    }

    if (context.kind === 'api') {
        return {
            '@context': 'https://schema.org',
            '@graph': [
                organization,
                website,
                {
                    '@type': 'WebPage',
                    '@id': `${canonical}#webpage`,
                    url: canonical,
                    name: 'Free football API for live scores, fixtures and standings',
                    description,
                    isPartOf: { '@id': `${context.baseUrl}/#website` },
                    mainEntity: { '@id': `${canonical}#software` },
                    inLanguage: 'en'
                },
                {
                    '@type': 'SoftwareApplication',
                    '@id': `${canonical}#software`,
                    name: 'Scores by Norra AI Football API',
                    applicationCategory: 'DeveloperApplication',
                    operatingSystem: 'Web',
                    isAccessibleForFree: false,
                    url: canonical,
                    downloadUrl: `${canonical}#api`,
                    featureList: ['Live football scores', 'Fixtures and results', 'League standings', 'Match statistics', 'Live telemetries and play-by-play']
                }
            ]
        };
    }

    const isCountry = context.kind === 'country';
    const pageName = isCountry ? `${context.country} football live scores and fixtures` : 'Football live scores, fixtures and league tables';
    return {
        '@context': 'https://schema.org',
        '@graph': [
            organization,
            website,
            {
                '@type': 'CollectionPage',
                '@id': `${canonical}#webpage`,
                url: canonical,
                name: pageName,
                description,
                isPartOf: { '@id': `${context.baseUrl}/#website` },
                isAccessibleForFree: true,
                inLanguage: 'en'
            },
            ...(!isCountry ? [{
                '@type': 'WebApplication',
                '@id': `${context.baseUrl}/#score-center`,
                name: 'Free Football Live Score Center',
                url: `${context.baseUrl}/`,
                applicationCategory: 'SportsApplication',
                operatingSystem: 'Web',
                isAccessibleForFree: true
            }, {
                '@type': 'FAQPage',
                mainEntity: [{
                    '@type': 'Question',
                    name: 'Are football scores updated live?',
                    acceptedAnswer: { '@type': 'Answer', text: 'Live match snapshots are refreshed by a dedicated listener and published from stored football data.' }
                }, {
                    '@type': 'Question',
                    name: 'Which football leagues are covered?',
                    acceptedAnswer: { '@type': 'Answer', text: 'Verified coverage includes Premier League, EFL, FA Cup, LaLiga, LaLiga 2, Copa del Rey and additional English and Spanish competitions.' }
                }, {
                    '@type': 'Question',
                    name: 'Is the football API free?',
                    acceptedAnswer: { '@type': 'Answer', text: 'Yes. Public read endpoints are free and currently require no API key, subject to fair-use rate limits.' }
                }]
            }] : []),
            itemListSchema(context.leagues || [], context.baseUrl),
            ...(isCountry ? [{
                '@type': 'BreadcrumbList',
                itemListElement: [
                    { '@type': 'ListItem', position: 1, name: 'Football live scores', item: `${context.baseUrl}/` },
                    { '@type': 'ListItem', position: 2, name: `${context.country} football`, item: canonical }
                ]
            }] : [])
        ]
    };
}

function pageMetadata(context) {
    if (context.kind === 'match') {
        const { match, league } = context;
        const name = leagueName(league);
        const home = clubDisplayName(match.home);
        const away = clubDisplayName(match.away);
        const state = match.status?.state;
        const isFinished = state === 'post';
        const isLive = state === 'in';
        const homeScore = match.home?.score;
        const awayScore = match.away?.score;
        const hasScore = homeScore != null && awayScore != null;

        // Lead with the phrase people actually search for, then the competition.
        const title = isFinished && hasScore
            ? `${home} ${homeScore}-${awayScore} ${away} — ${name} Result`
            : `${home} vs ${away} Live Score — ${name}`;
        const description = isFinished && hasScore
            ? `${home} ${homeScore}-${awayScore} ${away} in the ${name} on ${formatMatchDate(match.date)}. Full-time result and stored match events, free to view.`
            : (isLive
                ? `${home} vs ${away} live score in the ${name}. Current match state and available events as stored data refreshes.`
                : `${home} vs ${away} in the ${name} kicks off ${formatMatchDate(match.date)}. Live score and stored match events, free to view.`);

        return {
            title,
            description,
            canonical: matchUrl(context.baseUrl, match),
            overline: `${name} · ${isFinished ? 'Result' : (isLive ? 'Live now' : 'Fixture')}`,
            heading: `${escapeHtml(home)} vs ${escapeHtml(away)} <em>${isFinished ? '&mdash; result.' : 'live score.'}</em>`,
            lede: `${escapeHtml(name)} · ${escapeHtml(formatKickoff(match.date))}${match.venue?.name ? ` · ${escapeHtml(match.venue.name)}` : ''}`,
            content: matchContent(context),
            pageKind: 'match',
            leagueSlug: match.league_slug || '',
            country: league?.country || ''
        };
    }

    if (context.kind === 'club') {
        const { club, leagues, standingRow } = context;
        const name = clubDisplayName(club);
        const primaryLeague = leagues?.[0];
        const leagueLabel = primaryLeague ? leagueName(primaryLeague) : 'football';

        return {
            title: `${name} Fixtures, Results & ${primaryLeague ? 'Table' : 'Live Scores'}`,
            description: `${name} upcoming fixtures, latest results${standingRow?.rank ? `, currently ${ordinal(standingRow.rank)} in the ${leagueLabel} table` : ''} and live match scores. Free to view, no account needed.`,
            canonical: clubUrl(context.baseUrl, club),
            overline: `${club.country || primaryLeague?.country || 'Football'} club · ${leagueLabel}`,
            heading: `${escapeHtml(name)} fixtures <em>&amp; results.</em>`,
            lede: `Upcoming ${escapeHtml(name)} matches, recent results and the latest stored league position.`,
            content: clubContent(context),
            pageKind: 'club',
            leagueSlug: primaryLeague?.slug || '',
            country: club.country || primaryLeague?.country || ''
        };
    }

    if (context.kind === 'league') {
        const name = leagueName(context.league);
        const country = context.league.country || 'International';
        const hasTable = (context.standings || []).some(group => group?.entries?.length);
        return {
            title: `${name} Live Scores Today, Fixtures & ${hasTable ? 'Table' : 'Results'}`,
            description: `Free ${name} live scores, today's fixtures, results and match details for the ${seasonName(context.league)}.${hasTable ? ' View the latest league table.' : ''}`,
            canonical: leagueUrl(context.baseUrl, context.league),
            overline: `${country} football · ${seasonName(context.league)}`,
            heading: `${escapeHtml(name)} live scores, fixtures <em>&amp; ${hasTable ? 'table' : 'results'}.</em>`,
            lede: `Today's ${escapeHtml(name)} matches, results and schedule${hasTable ? ', plus the latest standings' : ''} in one free live score center.`,
            content: leagueContent(context),
            pageKind: 'league',
            leagueSlug: context.league.slug,
            country
        };
    }

    if (context.kind === 'country') {
        return {
            title: `${context.country} Football Live Scores Today & Fixtures`,
            description: `Free ${context.country} football live scores today, fixtures, results and available league tables across ${context.leagues.length} verified competitions.`,
            canonical: countryUrl(context.baseUrl, context.country),
            overline: 'Football competitions by country',
            heading: `${escapeHtml(context.country)} football live scores <em>&amp; fixtures.</em>`,
            lede: `Schedules, results, league tables and live match details for verified ${escapeHtml(context.country)} competitions.`,
            content: countryContent(context),
            pageKind: 'country',
            leagueSlug: '',
            country: context.country
        };
    }

    if (context.kind === 'api') {
        return {
            title: 'Free Football API for Live Scores, Fixtures & Standings',
            description: `Free JSON football API with no API key. Access live scores, fixtures, results, standings, clubs and match events across ${context.leagues.length} verified competitions.`,
            canonical: `${context.baseUrl}/football-api`,
            overline: 'Free and open-source football data',
            heading: 'Free football API for live scores, fixtures <em>&amp; standings.</em>',
            lede: 'Build football websites and apps with documented JSON endpoints, no API key and expanding verified league coverage.',
            content: apiContent(context),
            pageKind: 'api',
            leagueSlug: '',
            country: '',
            robots: 'index, follow, max-image-preview:large'
        };
    }

    if (context.kind === 'notFound') {
        return {
            title: `Competition Not Found | ${SITE_NAME}`,
            description: 'The requested football competition is not available.',
            canonical: context.canonical || `${context.baseUrl}/`,
            overline: 'Football competition',
            heading: 'Competition <em>not found.</em>',
            lede: 'Browse the active leagues with verified fixtures, results and standings.',
            content: notFoundContent(),
            pageKind: 'not-found',
            leagueSlug: '',
            country: '',
            robots: 'noindex, nofollow'
        };
    }

    if (context.kind === 'unavailable') {
        return {
            title: `Service Temporarily Unavailable | ${SITE_NAME}`,
            description: 'Football score data is temporarily unavailable.',
            canonical: `${context.baseUrl}/`,
            overline: 'Temporary service issue',
            heading: 'Football data is <em>temporarily unavailable.</em>',
            lede: 'Please try again shortly.',
            content: unavailableContent(),
            pageKind: 'unavailable',
            leagueSlug: '',
            country: '',
            robots: 'noindex, nofollow'
        };
    }

    return {
        title: 'Free Football Live Scores Today, Fixtures & Results',
        description: `Free live football scores today, fixtures, results and available league tables across ${context.leagues.length} verified competitions, plus an open football API.`,
        canonical: `${context.baseUrl}/`,
        overline: 'Free live football score center and API',
        heading: 'Free football live scores today, fixtures <em>&amp; results.</em>',
        lede: "Follow today's football matches, live scores, schedules, results and verified league tables across England and Spain.",
        content: homeContent(context),
        pageKind: 'home',
        leagueSlug: '',
        country: '',
        robots: 'index, follow, max-image-preview:large'
    };
}

function renderSeoPage(template, context) {
    const metadata = pageMetadata(context);
    const schema = structuredData(context, metadata.canonical, metadata.description);
    const baseUrl = context.baseUrl || '';
    const replacements = {
        '{{SEO_IMAGE}}': escapeHtml(`${baseUrl}/og-image.png`),
        '{{SEO_IMAGE_ALT}}': escapeHtml(metadata.imageAlt || `${SITE_NAME} — live scores, fixtures and results`),
        '{{SEO_TITLE}}': escapeHtml(metadata.title),
        '{{SEO_DESCRIPTION}}': escapeHtml(metadata.description),
        '{{SEO_ROBOTS}}': escapeHtml(metadata.robots || 'index, follow, max-image-preview:large'),
        '{{SEO_CANONICAL}}': escapeHtml(metadata.canonical),
        '{{SEO_JSON_LD}}': safeJson(schema),
        '{{SEO_OVERLINE}}': escapeHtml(metadata.overline),
        '{{SEO_HEADING}}': metadata.heading,
        '{{SEO_LEDE}}': metadata.lede,
        '{{SEO_CONTENT}}': metadata.content,
        '{{PAGE_KIND}}': escapeHtml(metadata.pageKind),
        '{{LEAGUE_SLUG}}': escapeHtml(metadata.leagueSlug),
        '{{COUNTRY_NAME}}': escapeHtml(metadata.country)
    };

    return Object.entries(replacements).reduce(
        (html, [token, value]) => html.split(token).join(value),
        template
    );
}

module.exports = {
    clubDisplayName,
    clubUrl,
    countryUrl,
    escapeHtml,
    leagueName,
    leagueUrl,
    matchSlugFor,
    matchUrl,
    pageMetadata,
    renderSeoPage,
    slugifyCountry,
    slugifyName
};
