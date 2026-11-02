const STAT_ABBREVIATIONS = {
    possessionPct: 'PP',
    totalShots: 'SHOT',
    shotsOnTarget: 'SOG',
    wonCorners: 'CW',
    foulsCommitted: 'FC',
    goalAssists: 'A',
    totalGoals: 'G',
    shotAssists: 'SHAST',
    appearances: 'APP'
};

const COUNTRY_BY_SLUG_PREFIX = {
    arg: 'Argentina',
    aus: 'Australia',
    aut: 'Austria',
    bel: 'Belgium',
    bol: 'Bolivia',
    bra: 'Brazil',
    chi: 'Chile',
    chn: 'China',
    col: 'Colombia',
    crc: 'Costa Rica',
    cyp: 'Cyprus',
    den: 'Denmark',
    ecu: 'Ecuador',
    eng: 'England',
    esp: 'Spain',
    fra: 'France',
    ger: 'Germany',
    gha: 'Ghana',
    gre: 'Greece',
    idn: 'Indonesia',
    ind: 'India',
    irl: 'Ireland',
    ita: 'Italy',
    jpn: 'Japan',
    ksa: 'Saudi Arabia',
    mex: 'Mexico',
    mys: 'Malaysia',
    ned: 'Netherlands',
    nga: 'Nigeria',
    nor: 'Norway',
    par: 'Paraguay',
    per: 'Peru',
    por: 'Portugal',
    rsa: 'South Africa',
    sco: 'Scotland',
    sui: 'Switzerland',
    swe: 'Sweden',
    tha: 'Thailand',
    tur: 'Turkey',
    uru: 'Uruguay',
    usa: 'United States',
    ven: 'Venezuela'
};

const INTERNATIONAL_PREFIXES = new Set([
    'afc', 'caf', 'concacaf', 'conmebol', 'fifa', 'ofc', 'uefa'
]);

const COUNTRY_OVERRIDE_BY_LEAGUE = {
    'uefa.champions': 'Other'
};

function cleanLeagueName(name) {
    if (!name) return '';
    return String(name)
        .replace(/^international\s*[-–:/]\s*/i, '')
        .replace(/^international\s+clubs\s*[-–:/]\s*/i, '')
        .replace(/^international\s+/i, '')
        .trim();
}

function inferLeagueCountry(league) {
    const slug = String(league.slug || '').toLowerCase();
    if (COUNTRY_OVERRIDE_BY_LEAGUE[slug]) return COUNTRY_OVERRIDE_BY_LEAGUE[slug];
    const prefix = slug.split('.')[0];
    if (prefix && COUNTRY_BY_SLUG_PREFIX[prefix]) return COUNTRY_BY_SLUG_PREFIX[prefix];
    if (league.country && league.country !== 'International' && league.country !== 'Other') return league.country;
    if (INTERNATIONAL_PREFIXES.has(prefix)) return 'International';
    return COUNTRY_BY_SLUG_PREFIX[prefix] || league.country || 'Other';
}

function toIso(value) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toPlainMap(value) {
    if (!value) return {};
    if (value instanceof Map) return Object.fromEntries(value);
    return { ...value };
}

function statsToArray(stats) {
    return Object.entries(toPlainMap(stats)).map(([name, value]) => ({
        name,
        abbreviation: STAT_ABBREVIATIONS[name] || name,
        displayValue: value == null ? null : String(value)
    }));
}

function serializeLeague(league) {
    return {
        id: league.source?.source_id || league.slug,
        uid: league.source?.source_id ? `s:600~l:${league.source.source_id}` : undefined,
        name: cleanLeagueName(league.name),
        abbreviation: league.abbreviation,
        slug: league.slug,
        country: inferLeagueCountry(league),
        kind: league.kind || 'club',
        logo: league.logo,
        season: league.season || null,
        calendar: league.calendar || [],
        active: league.active,
        lastSyncedAt: toIso(league.last_synced_at),
        coverage: league.coverage || {
            matches: 0,
            clubs: 0,
            dedicatedClubs: 0,
            standingsGroups: 0,
            hasData: false
        }
    };
}

function sanitizeLogoUrl(url) {
    if (!url) return '';
    return String(url).replace('https://static.livescore.com/', 'https://storage.livescore.com/images/team/medium/');
}

function serializeClub(club) {
    if (!club) return null;
    const cleanLogo = sanitizeLogoUrl(club.logo);
    return {
        id: club.source_id || club.source?.club_id,
        uid: club.uid || club.source?.uid || '',
        slug: club.slug || '',
        name: club.name || club.display_name,
        displayName: club.display_name || club.name,
        shortDisplayName: club.short_display_name || club.display_name,
        abbreviation: club.abbreviation || '',
        location: club.city || club.country || club.name,
        country: club.country || '',
        city: club.city || '',
        logo: cleanLogo,
        logos: (club.logos || []).map(l => ({ ...l, href: sanitizeLogoUrl(l.href) })),
        color: club.color || '',
        alternateColor: club.alternate_color || '',
        foundedYear: club.founded_year,
        venue: club.venue || null,
        isActive: club.active !== false,
        catalogSource: club.catalog_source || 'club-catalog'
    };
}

function serializeStatus(status = {}) {
    return {
        clock: status.clock_seconds ?? 0,
        displayClock: status.clock || '',
        period: status.period ?? 0,
        type: {
            name: status.name || 'STATUS_UNKNOWN',
            state: status.state || 'unknown',
            completed: Boolean(status.completed),
            description: status.description || '',
            detail: status.detail || '',
            shortDetail: status.short_detail || status.detail || ''
        }
    };
}

function serializeVenue(venue) {
    if (!venue) return null;
    return {
        id: venue.source_id || '',
        fullName: venue.name || '',
        address: {
            city: venue.city || '',
            country: venue.country || ''
        }
    };
}

function serializeCompetitor(club, homeAway) {
    return {
        id: club.source_id,
        uid: club.uid || '',
        type: 'team',
        homeAway,
        score: club.score == null ? null : String(club.score),
        aggregateScore: club.aggregate_score == null ? undefined : String(club.aggregate_score),
        shootoutScore: club.shootout_score == null ? undefined : String(club.shootout_score),
        winner: Boolean(club.winner),
        advance: club.advance,
        form: club.form || '',
        team: serializeClub(club),
        statistics: statsToArray(club.stats)
    };
}

function serializeCompetition(match) {
    const status = serializeStatus(match.status);
    return {
        id: match.source.competition_id,
        uid: match.source.uid || '',
        date: toIso(match.date),
        startDate: toIso(match.date),
        status,
        attendance: match.attendance ?? 0,
        venue: serializeVenue(match.venue),
        competitors: [
            serializeCompetitor(match.home, 'home'),
            serializeCompetitor(match.away, 'away')
        ],
        details: match.key_events || [],
        broadcasts: match.broadcasts || [],
        odds: match.odds || [],
        notes: match.note ? [{ text: match.note }] : [],
        format: match.format || null,
        playByPlayAvailable: Boolean(match.play_by_play_available),
        wasSuspended: Boolean(match.status?.suspended)
    };
}

function serializeScoreboardEvent(match) {
    return {
        id: match.source.event_id,
        uid: match.source.uid || '',
        date: toIso(match.date),
        name: match.name,
        shortName: match.short_name || match.name,
        season: match.season || null,
        competitions: [serializeCompetition(match)],
        status: serializeStatus(match.status),
        venue: match.venue ? { displayName: match.venue.name || '' } : null
    };
}

function serializeSummary(match, league, availability = {}) {
    const competition = serializeCompetition(match);
    const home = serializeCompetitor(match.home, 'home');
    const away = serializeCompetitor(match.away, 'away');
    const keyEvents = match.key_events || [];
    const hasKeyEventGoal = keyEvents.some(event => event?.scoringPlay
        || event?.scoring_play
        || event?.flags?.scoring_play);
    const hasStats = stats => stats instanceof Map
        ? stats.size > 0
        : Boolean(stats && Object.keys(stats).length);
    const timelineAvailable = Boolean(availability.timelineAvailable);
    const goalsAvailable = availability.goalsAvailable === undefined
        ? hasKeyEventGoal
        : Boolean(availability.goalsAvailable || hasKeyEventGoal);
    const statisticsAvailable = hasStats(match.home?.stats) || hasStats(match.away?.stats);

    return {
        header: {
            id: match.source.event_id,
            uid: match.source.uid || '',
            season: match.season || null,
            league: serializeLeague(league),
            competitions: [competition]
        },
        boxscore: {
            teams: [
                {
                    team: home.team,
                    statistics: home.statistics,
                    homeAway: 'home',
                    displayOrder: 1
                },
                {
                    team: away.team,
                    statistics: away.statistics,
                    homeAway: 'away',
                    displayOrder: 2
                }
            ]
        },
        keyEvents,
        rosters: match.lineups || [],
        gameInfo: {
            venue: serializeVenue(match.venue),
            officials: match.officials || []
        },
        commentary: match.commentary || [],
        broadcasts: match.broadcasts || [],
        odds: match.odds || [],
        leaders: match.leaders || [],
        news: match.news || [],
        videos: match.videos || [],
        format: match.format || null,
        meta: {
            dataSource: 'database',
            provider: match.source.provider,
            lastSyncedAt: toIso(match.last_synced_at),
            dataAvailability: {
                timeline: { available: timelineAvailable, storedIn: 'soccer_match_events' },
                matchGoals: {
                    available: goalsAvailable,
                    storedIn: ['soccer_match_events', 'soccer_matches.key_events']
                },
                statisticsAndSummary: { available: statisticsAvailable, storedIn: 'soccer_matches' },
                leagueTopScorers: {
                    available: false,
                    reason: 'Not structurally stored; raw snapshots are not exposed by the customer API.'
                }
            }
        }
    };
}

function serializePlay(event) {
    const source = event.source || {};
    const type = event.event_type || event.type || event.raw?.type || {};
    const clock = event.clock || event.raw?.clock || {};
    const flags = event.flags || {};
    const rootFlag = (snakeCase, camelCase) => {
        if (flags[snakeCase] !== undefined) return Boolean(flags[snakeCase]);
        if (event[snakeCase] !== undefined) return Boolean(event[snakeCase]);
        if (event[camelCase] !== undefined) return Boolean(event[camelCase]);
        return Boolean(event.raw?.[camelCase]);
    };

    return {
        id: source.event_key || source.event_id || event.source_event_id
            || event.event_id || String(event._id || ''),
        type: {
            id: type.id || '',
            text: type.text || type.name || type.type || '',
            type: type.name || type.type || ''
        },
        text: event.text || event.alternative_text || type.text || '',
        alternativeText: event.alternative_text || event.alternativeText || '',
        awayScore: event.away_score ?? event.awayScore ?? null,
        homeScore: event.home_score ?? event.homeScore ?? null,
        period: { number: event.period ?? 0 },
        clock: {
            value: clock.value ?? 0,
            displayValue: clock.display_value || clock.displayValue || ''
        },
        addedClock: {
            value: clock.added_value ?? clock.addedValue ?? 0,
            displayValue: clock.added_display_value || clock.addedDisplayValue || ''
        },
        valid: event.valid !== false,
        scoringPlay: rootFlag('scoring_play', 'scoringPlay'),
        scoreValue: event.score_value ?? event.scoreValue ?? 0,
        substitution: rootFlag('substitution', 'substitution'),
        wallclock: toIso(event.wallclock || event.raw?.wallclock),
        redCard: rootFlag('red_card', 'redCard'),
        yellowCard: rootFlag('yellow_card', 'yellowCard'),
        penaltyKick: rootFlag('penalty_kick', 'penaltyKick'),
        ownGoal: rootFlag('own_goal', 'ownGoal'),
        shootout: rootFlag('shootout', 'shootout'),
        modified: toIso(source.modified_at || event.modified_at),
        // Kept as `team` in the public response for provider compatibility; the
        // normalized database field is named `club`.
        team: event.club || event.team || event.raw?.team || null,
        athleteSourceIds: event.athlete_source_ids || event.athleteSourceIds || [],
        athletesInvolved: event.athletes_involved || event.athletesInvolved || [],
        participants: event.participants || event.raw?.participants || []
    };
}

function serializeStandingGroup(group) {
    return {
        id: group.group_id,
        name: group.group_name,
        abbreviation: group.group_name,
        standings: {
            season: group.season_year,
            entries: (group.entries || []).map(entry => ({
                team: serializeClub(entry.club),
                stats: statsToArray(entry.stats),
                note: entry.note || null,
                rank: entry.rank ?? null
            }))
        },
        lastSyncedAt: toIso(group.last_synced_at)
    };
}

function synthesizeMatchTelemetry(match, summary = {}) {
    const homeComp = summary.header?.competitions?.[0]?.competitors?.find(c => c.homeAway === 'home')
        || { team: summary.boxscore?.teams?.[0]?.team || match.home };
    const awayComp = summary.header?.competitions?.[0]?.competitors?.find(c => c.homeAway === 'away')
        || { team: summary.boxscore?.teams?.[1]?.team || match.away };

    const homeScore = parseInt(homeComp.score ?? match.home?.score ?? 0, 10) || 0;
    const awayScore = parseInt(awayComp.score ?? match.away?.score ?? 0, 10) || 0;

    const events = summary.keyEvents || match.key_events || [];
    let homeYellows = 0;
    let awayYellows = 0;
    let homeReds = 0;
    let awayReds = 0;
    let homeFouls = 0;
    let awayFouls = 0;

    for (const ev of events) {
        const isHome = ev.team?.side === 'home' || String(ev.team?.id) === String(homeComp.id || homeComp.team?.id);
        const text = (ev.type?.text || ev.type?.type || ev.text || '').toLowerCase();
        if (ev.yellowCard || text.includes('yellow')) {
            if (isHome) homeYellows++; else awayYellows++;
        }
        if (ev.redCard || text.includes('red')) {
            if (isHome) homeReds++; else awayReds++;
        }
        if (text.includes('foul')) {
            if (isHome) homeFouls++; else awayFouls++;
        }
    }

    const scoreDiff = homeScore - awayScore;
    let homePossession = Math.min(65, Math.max(35, 50 + (scoreDiff * 3)));
    const awayPossession = 100 - homePossession;

    const homeShotsOn = Math.max(homeScore, Math.round(homeScore * 1.5) + (homePossession > 50 ? 2 : 1));
    const awayShotsOn = Math.max(awayScore, Math.round(awayScore * 1.5) + (awayPossession > 50 ? 2 : 1));
    const homeTotal = homeShotsOn + Math.max(2, Math.round((homePossession / 100) * 8));
    const awayTotal = awayShotsOn + Math.max(2, Math.round((awayPossession / 100) * 8));
    const homeOff = homeTotal - homeShotsOn;
    const awayOff = awayTotal - awayShotsOn;

    const homeCorners = Math.max(1, Math.round((homePossession / 100) * 7));
    const awayCorners = Math.max(1, Math.round((awayPossession / 100) * 7));

    const homeFoulsTotal = Math.max(homeFouls || 8, Math.round(11 + (awayPossession > 50 ? 2 : -1)));
    const awayFoulsTotal = Math.max(awayFouls || 8, Math.round(11 + (homePossession > 50 ? 2 : -1)));

    const homeSaves = Math.max(0, awayShotsOn - awayScore);
    const awaySaves = Math.max(0, homeShotsOn - homeScore);
    const homeXg = parseFloat(((homeShotsOn * 0.32) + (homeOff * 0.05) + (homeScore * 0.35)).toFixed(2));
    const awayXg = parseFloat(((awayShotsOn * 0.32) + (awayOff * 0.05) + (awayScore * 0.35)).toFixed(2));

    const makeStats = (poss, onT, offT, tot, cor, fls, yel, red, sav, xg) => [
        { name: 'possessionPct', displayName: 'Possession', displayValue: `${poss}%`, value: poss },
        { name: 'shotsOnTarget', displayName: 'Shots on Target', displayValue: `${onT}`, value: onT },
        { name: 'shotsOffTarget', displayName: 'Shots off Target', displayValue: `${offT}`, value: offT },
        { name: 'totalShots', displayName: 'Total Shots', displayValue: `${tot}`, value: tot },
        { name: 'wonCorners', displayName: 'Corner Kicks', displayValue: `${cor}`, value: cor },
        { name: 'foulsCommitted', displayName: 'Fouls', displayValue: `${fls}`, value: fls },
        { name: 'yellowCards', displayName: 'Yellow Cards', displayValue: `${yel}`, value: yel },
        { name: 'redCards', displayName: 'Red Cards', displayValue: `${red}`, value: red },
        { name: 'saves', displayName: 'Goalkeeper Saves', displayValue: `${sav}`, value: sav },
        { name: 'expectedGoals', displayName: 'Expected Goals (xG)', displayValue: `${xg ?? 0}`, value: xg ?? 0 }
    ];

    return {
        isDerivedTelemetry: true,
        teams: [
            {
                id: 'home',
                homeAway: 'home',
                team: homeComp.team,
                statistics: makeStats(homePossession, homeShotsOn, homeOff, homeTotal, homeCorners, homeFoulsTotal, homeYellows, homeReds, homeSaves, homeXg)
            },
            {
                id: 'away',
                homeAway: 'away',
                team: awayComp.team,
                statistics: makeStats(awayPossession, awayShotsOn, awayOff, awayTotal, awayCorners, awayFoulsTotal, awayYellows, awayReds, awaySaves, awayXg)
            }
        ]
    };
}

module.exports = {
    inferLeagueCountry,
    serializeLeague,
    serializeClub,
    serializePlay,
    serializeScoreboardEvent,
    serializeStandingGroup,
    serializeSummary,
    synthesizeMatchTelemetry,
    statsToArray,
    sanitizeLogoUrl
};
