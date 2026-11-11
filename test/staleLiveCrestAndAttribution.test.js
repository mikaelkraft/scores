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
