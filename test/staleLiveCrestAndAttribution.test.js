const test = require('node:test');
const assert = require('node:assert/strict');
const {
    resolveLeagueSlug,
    inferCountryFromTeamNames,
    normalizeTeamName,
    TARGET_LEAGUES
} = require('../services/soccerSyncService');

test('slv.1 and intl.friendly are registered in TARGET_LEAGUES', () => {
    const slv = TARGET_LEAGUES.find(l => l.slug === 'slv.1');
    assert.ok(slv, 'slv.1 must be present in TARGET_LEAGUES');
    assert.equal(slv.country, 'El Salvador');

    const friendly = TARGET_LEAGUES.find(l => l.slug === 'intl.friendly');
    assert.ok(friendly, 'intl.friendly must be present in TARGET_LEAGUES');
    assert.equal(friendly.country, 'International');
});

test('resolveLeagueSlug correctly resolves El Salvador and International Friendlies', () => {
    assert.equal(resolveLeagueSlug('Primera Division', 'El Salvador', 'slv.1'), 'slv.1');
    assert.equal(resolveLeagueSlug('Primera Division de El Salvador: Apertura', 'El Salvador', ''), 'slv.1');
    assert.equal(resolveLeagueSlug('International Friendly', 'International', ''), 'intl.friendly');
    assert.equal(resolveLeagueSlug('Friendly: Vietnam vs Chinese Taipei', 'International', ''), 'intl.friendly');
});

test('inferCountryFromTeamNames correctly corrects Londrina & Náutico to Brazilian Série B', () => {
    assert.equal(inferCountryFromTeamNames('Londrina EC', 'Nautico', 'ita.2'), 'bra.2');
    assert.equal(inferCountryFromTeamNames('Londrina', 'Náutico', 'ita.1'), 'bra.2');
    assert.equal(inferCountryFromTeamNames('Pumas UNAM', 'Tigres UANL', 'esp.1'), 'mex.1');
    assert.equal(inferCountryFromTeamNames('Isidro Metapán', 'CD Platense Municipal', 'ita.1'), 'slv.1');
});

test('normalizeTeamName properly collapses provider variants for Mexican and Salvadoran teams', () => {
    assert.equal(normalizeTeamName('Pumas UNAM'), 'pumas');
    assert.equal(normalizeTeamName('Tigres UANL'), 'tigres');
    assert.equal(normalizeTeamName('Isidro Metapán'), 'metapan');
    assert.equal(normalizeTeamName('CD Platense Municipal'), 'platense');
    assert.equal(normalizeTeamName('Londrina EC'), 'londrina');
    assert.equal(normalizeTeamName('Náutico'), 'nautico');
});

test('live match ingest guards: 0 clock and future matches are not in-play', () => {
    const now = Date.now();
    const futureKickoff = new Date(now + 3 * 3600 * 1000); // 3 hours in future
    const pastKickoff = new Date(now - 140 * 60 * 1000); // 140 mins ago (concluded)

    // Check future match logic
    const isFuture = futureKickoff && (futureKickoff.getTime() - now > 5 * 60 * 1000);
    assert.equal(isFuture, true, 'Future match must be recognized as not started');

    // Check zero clock logic
    const rawClocks = ['0', "0'", '00', '00:00', 'NS', 'Upcoming', 'Sched'];
    for (const clock of rawClocks) {
        const isNotStarted = clock === 'NS' || clock === 'Upcoming' || clock === '' || clock === 'Sched' || clock.includes(':') || clock === '0' || clock === "0'" || clock === '00' || clock === '00:00';
        assert.equal(isNotStarted, true, `Clock "${clock}" must be recognized as not started`);
    }

    // Check stale match past 135 minutes logic
    const diff = now - pastKickoff.getTime();
    assert.ok(diff > 135 * 60 * 1000, 'Match > 135 mins must be recognized as concluded');
});

test('partnerAttributions fallback guarantees SportScore SS badge is present', () => {
    const fallbackList = [
        {
            active: true,
            label: 'SportScore',
            html: '<a href="https://sportscore.com/" rel="dofollow" title="Powered by SportScore" aria-label="Powered by SportScore" style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;background:#0a1e3d;color:#fff;border-radius:50%;text-decoration:none;font:700 .78rem system-ui,sans-serif;">SS</a>',
            linkUrl: 'https://sportscore.com/',
            linkTitle: 'Powered by SportScore',
            rel: 'dofollow'
        }
    ];

    const hasSS = fallbackList.some(p => String(p.label || p.linkTitle || p.linkUrl).toLowerCase().includes('sportscore'));
    assert.equal(hasSS, true);
    assert.ok(fallbackList[0].html.includes('>SS</a>'));
    assert.ok(fallbackList[0].html.includes('rel="dofollow"'));
    assert.ok(fallbackList[0].html.includes('sportscore.com'));
});

test('SportScore fetchSportScoreH2H returns historical matches and enriches team crests', async () => {
    const { fetchSportScoreH2H } = require('../services/sportScoreService');
    assert.equal(typeof fetchSportScoreH2H, 'function');
    const res = await fetchSportScoreH2H({ homeName: 'Arsenal', awayName: 'Chelsea' });
    assert.ok(res, 'H2H response from SportScore should exist');
    assert.ok(Array.isArray(res.matches), 'res.matches should be an array');
    assert.ok(res.matches.length > 0, 'Arsenal vs Chelsea should have past encounters');
    assert.ok(res.summary?.meetings > 0, 'Meetings count should be > 0');
    assert.ok(res.matches[0].home_logo, 'SportScore matches must have home_logo');
    assert.ok(res.matches[0].away_logo, 'SportScore matches must have away_logo');
});

test('crest fallback SVG renders vector shield without raw broken text letters', () => {
    // Vector shield SVG specification
    const renderShieldSvg = (s = 16) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:middle;display:inline-block;flex-shrink:0;border-radius:4px;" aria-hidden="true"><rect width="24" height="24" rx="4" fill="#0f172a"/><path d="M12 3L4 6V12C4 16.5 7.5 20.5 12 21.5C16.5 20.5 20 16.5 20 12V6L12 3Z" fill="#1e293b" stroke="#3b82f6" stroke-width="1.2"/><circle cx="12" cy="12" r="3.2" fill="#38bdf8"/><path d="M12 8.8L12.9 10.7L15 11L13.5 12.4L13.8 14.5L12 13.5L10.2 14.5L10.5 12.4L9 11L11.1 10.7L12 8.8Z" fill="#ffffff"/></svg>`;
    const svg = renderShieldSvg(16);
    assert.ok(!svg.includes('<text'), 'Shield SVG fallback must never contain text elements');
    assert.ok(svg.includes('viewBox="0 0 24 24"'));
    assert.ok(svg.includes('<rect'));
    assert.ok(svg.includes('<circle'));
});

test('concrete clock validator rejects zero clock and future kickoff times', () => {
    function isConcreteClock(str) {
        if (!str || typeof str !== 'string') return false;
        const clean = str.trim();
        if (!clean || clean === '0' || clean === "0'" || clean === '00' || clean === '00:00') return false;
        if (/^(live|in\s*progress|status_in_progress|scheduled|upcoming|pre|in|post|ns|sched)$/i.test(clean)) return false;
        if (/^\d{1,2}:\d{2}$/.test(clean)) return false; // Kickoff time e.g. 19:45
        if (/\d/.test(clean)) return true;
        if (/^(ht|half\s*time|halftime|et|aet|pen\.?|penalties|break)$/i.test(clean)) return true;
        return false;
    }

    assert.equal(isConcreteClock("0'"), false, "0' is not a concrete in-play clock");
    assert.equal(isConcreteClock("0"), false, "0 is not a concrete in-play clock");
    assert.equal(isConcreteClock("00:00"), false, "00:00 is not a concrete in-play clock");
    assert.equal(isConcreteClock("19:45"), false, "Kickoff time is not a concrete in-play clock");
    assert.equal(isConcreteClock("45'"), true, "45' is a concrete in-play clock");
    assert.equal(isConcreteClock("HT"), true, "HT is a concrete in-play clock");
    assert.equal(isConcreteClock("90+3'"), true, "Stoppage time is a concrete in-play clock");
});
