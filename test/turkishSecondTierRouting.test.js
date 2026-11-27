const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const { EventEmitter } = require('node:events');
const express = require('express');
const mongoose = require('mongoose');

test.after(async () => {
    await mongoose.disconnect().catch(() => {});
});

const {
    TOP_FLIGHT_CLUBS,
    DYNAMIC_LEAGUE_CLUBS,
    updateDynamicLeagueRoster,
    refreshDynamicLeagueRostersFromDb,
    TURKISH_SECOND_TIER_CLUBS,
    TURKISH_THIRD_TIER_CLUBS,
    hasTopFlightClub,
    demoteIfNotTopFlight,
    inferCountryFromTeamNames,
    resolveLeagueSlug,
    resolveTurkishTierFromTeams
} = require('../services/soccerSyncService');

const footballApiController = require('../controllers/footballApiController');
const SoccerMatch = require('../models/soccerMatch');
const SoccerLeague = require('../models/soccerLeague');
const SoccerStanding = require('../models/soccerStanding');

test('TOP_FLIGHT_CLUBS[tur.1] excludes relegated TFF 1. Lig / 2. Lig clubs and retains current Süper Lig clubs', () => {
    const tur1 = TOP_FLIGHT_CLUBS['tur.1'];
    assert.ok(tur1 instanceof Set);

    for (const relegated of [
        'istanbulspor', 'pendikspor', 'ankaragucu', 'umraniyespor', 'ümraniyespor',
        'giresunspor', 'adana demirspor', 'hatayspor', 'sivasspor', 'bodrum', 'bodrum fk'
    ]) {
        assert.equal(tur1.has(relegated), false, `${relegated} must NOT be in TOP_FLIGHT_CLUBS['tur.1']`);
    }

    for (const superLigClub of ['galatasaray', 'fenerbahce', 'besiktas', 'trabzonspor', 'istanbul basaksehir', 'kasimpasa', 'samsunspor', 'goztepe', 'eyupspor']) {
        assert.equal(tur1.has(superLigClub), true, `${superLigClub} must remain in TOP_FLIGHT_CLUBS['tur.1']`);
    }

    assert.ok(TURKISH_SECOND_TIER_CLUBS.has('sariyer'));
    assert.ok(TURKISH_SECOND_TIER_CLUBS.has('istanbulspor'));
    assert.ok(TURKISH_THIRD_TIER_CLUBS.has('iskenderunspor'));
    assert.ok(TURKISH_THIRD_TIER_CLUBS.has('giresunspor'));
});

test('Sariyer vs Istanbulspor (1-0, 52\') is never treated as Turkish Süper Lig and routes to tur.2', () => {
    assert.equal(hasTopFlightClub('tur.1', 'Sariyer', 'Istanbulspor'), false);
    assert.equal(hasTopFlightClub('tur.1', 'Sarıyer', 'İstanbulspor'), false);
    assert.equal(hasTopFlightClub('tur.1', 'Pendikspor', 'Sakaryaspor'), false);
    assert.equal(hasTopFlightClub('tur.1', 'Adana Demirspor', 'Hatayspor'), false);
    assert.equal(hasTopFlightClub('tur.1', 'Sivasspor', 'Bodrum FK'), false);

    // Genuine Süper Lig clubs including Istanbul Basaksehir must NOT be confused with Istanbulspor
    assert.equal(hasTopFlightClub('tur.1', 'Istanbul Basaksehir', 'Kasimpasa'), true);
    assert.equal(hasTopFlightClub('tur.1', 'Galatasaray', 'Fenerbahçe'), true);

    assert.equal(demoteIfNotTopFlight('tur.1', 'Sariyer', 'Istanbulspor', 'Süper Lig'), 'tur.2');
    assert.equal(demoteIfNotTopFlight('tur.1', 'Sarıyer', 'İstanbulspor', 'Turkish Süper Lig'), 'tur.2');
    assert.equal(demoteIfNotTopFlight('tur.1', 'Bodrum', 'Çorum', 'Super Lig'), 'tur.2');
    assert.equal(demoteIfNotTopFlight('tur.1', 'Manisa', 'Iğdır', 'Super Lig'), 'tur.2');
    assert.equal(demoteIfNotTopFlight('tur.1', 'Amed', 'Sarıyer', 'Super Lig'), 'tur.2');
    assert.equal(inferCountryFromTeamNames('Sariyer', 'Istanbulspor', 'tur.1'), 'tur.2');
    assert.equal(inferCountryFromTeamNames('Sarıyer', 'İstanbulspor', 'tur.lower'), 'tur.2');
    assert.equal(inferCountryFromTeamNames('Bodrum', 'Çorum', 'tur.lower'), 'tur.2');

    // TFF 2. Lig clubs route cleanly to tur.3 via inferCountryFromTeamNames / resolveTurkishTierFromTeams
    assert.equal(inferCountryFromTeamNames('Iskenderunspor', 'Erbaaspor', 'tur.1'), 'tur.3');
    assert.equal(inferCountryFromTeamNames('Iskenderunspor', 'Erbaaspor', 'tur.lower'), 'tur.3');
    assert.equal(resolveTurkishTierFromTeams('Bursaspor', 'Altay', 'tur.1'), 'tur.3');

    // Cup & friendly competitions are never hijacked
    assert.equal(demoteIfNotTopFlight('tur.cup', 'Galatasaray', 'Sariyer', 'Ziraat Turkiye Kupasi'), 'tur.cup');
    assert.equal(inferCountryFromTeamNames('Galatasaray', 'Sariyer', 'tur.cup'), 'tur.cup');
    assert.equal(inferCountryFromTeamNames('Sariyer', 'Istanbulspor', 'intl.friendly'), 'intl.friendly');
});

test('resolveLeagueSlug broadens Turkish 1. Lig and 2. Lig matching', () => {
    assert.equal(resolveLeagueSlug('1. Lig', 'Turkey'), 'tur.2');
    assert.equal(resolveLeagueSlug('1.Lig', 'Turkey'), 'tur.2');
    assert.equal(resolveLeagueSlug('Trendyol 1. Lig', 'Turkey'), 'tur.2');
    assert.equal(resolveLeagueSlug('TFF 1. Lig', 'Turkey'), 'tur.2');
    assert.equal(resolveLeagueSlug('First League', 'Turkey'), 'tur.2');
    assert.equal(resolveLeagueSlug('Second Division', 'Turkey'), 'tur.2');
    assert.equal(resolveLeagueSlug('2. Lig', 'Turkey'), 'tur.3');
    assert.equal(resolveLeagueSlug('2.Lig', 'Turkey'), 'tur.3');
    assert.equal(resolveLeagueSlug('TFF 2. Lig', 'Turkey'), 'tur.3');
    assert.equal(resolveLeagueSlug('Ziraat Turkiye Kupasi', 'Turkey'), 'tur.cup');
    assert.equal(resolveLeagueSlug('Süper Lig', 'Turkey'), 'tur.1');
});

test('fetchFreshWorldwideLiveMatches and /fixtures read path route mis-tagged Sariyer 1-0 (52\') Istanbulspor to tur.2 (Turkish 1. Lig)', async () => {
    const nowUtc = new Date(Date.now() - 55 * 60 * 1000);
    const pad = (n) => String(n).padStart(2, '0');
    const esd = `${nowUtc.getUTCFullYear()}${pad(nowUtc.getUTCMonth() + 1)}${pad(nowUtc.getUTCDate())}${pad(nowUtc.getUTCHours())}${pad(nowUtc.getUTCMinutes())}00`;
    const dateKey = `${nowUtc.getUTCFullYear()}${pad(nowUtc.getUTCMonth() + 1)}${pad(nowUtc.getUTCDate())}`;

    const mockLiveScorePayload = {
        Stages: [
            {
                Cnm: 'Turkey',
                Sdn: 'Turkey',
                Snm: 'Super Lig',
                Scd: 'super-lig',
                Events: [
                    {
                        Eid: '99112233',
                        Esd: esd,
                        Eps: "52'",
                        Epr: 1,
                        Tr1: '1',
                        Tr2: '0',
                        T1: [{ Nm: 'Sariyer', Abr: 'SAR', Img: 'enet/1001.png' }],
                        T2: [{ Nm: 'Istanbulspor', Abr: 'IST', Img: 'enet/1002.png' }]
                    }
                ]
            }
        ]
    };

    const originalHttpsGet = https.get;
    const originalMatchFind = SoccerMatch.find;
    const originalLeagueFind = SoccerLeague.find;
    https.get = (url, opts, cb) => {
        const callback = typeof opts === 'function' ? opts : cb;
        const req = new EventEmitter();
        req.destroy = () => {};
        const u = String(url || '');
        const body = u.includes('livescore.com')
            ? JSON.stringify(mockLiveScorePayload)
            : JSON.stringify({ events: [] });
        process.nextTick(() => {
            const res = new EventEmitter();
            res.statusCode = 200;
            res.headers = {};
            callback(res);
            res.emit('data', body);
            res.emit('end');
        });
        return req;
    };
    const mockChain = (rows) => ({
        maxTimeMS() { return this; },
        select() { return this; },
        sort() { return this; },
        limit() { return this; },
        lean: async () => rows
    });
    SoccerMatch.find = () => mockChain([
        {
            _id: 'mock-db-sariyer-1',
            league_slug: 'tur.1',
            note: 'Turkish Süper Lig',
            date: nowUtc,
            status: { state: 'in', clock: "52'", detail: "52'", completed: false },
            home: { name: 'Sariyer', display_name: 'Sariyer', score: 1 },
            away: { name: 'Istanbulspor', display_name: 'Istanbulspor', score: 0 },
            source: { provider: 'livescore', event_id: '99112233', livescore_id: '99112233' }
        }
    ]);
    SoccerLeague.find = () => mockChain([]);

    try {
        // 1. Live path (fetchFreshWorldwideLiveMatches) — tests BOTH LiveScore in-play & DB live match paths
        const liveMatches = await footballApiController.fetchFreshWorldwideLiveMatches(true);
        const liveSariyer = liveMatches.find(m => /sariyer/i.test(m.home?.name || '') && /istanbulspor/i.test(m.away?.name || ''));
        assert.ok(liveSariyer, 'Expected live Sariyer vs Istanbulspor match in fetchFreshWorldwideLiveMatches output');
        assert.equal(liveSariyer.league?.slug, 'tur.2', 'Live match must resolve to tur.2, never tur.1');
        assert.equal(liveSariyer.league?.name, 'Turkish 1. Lig');
        assert.equal(liveSariyer.league?.country, 'Turkey');
        assert.equal(liveSariyer.home?.score, 1);
        assert.equal(liveSariyer.away?.score, 0);
        assert.equal(liveSariyer.status?.clock, "52'");

        // 2. Day path (fetchLiveScoreDayMatches)
        const dayMatches = await footballApiController.fetchLiveScoreDayMatches(dateKey);
        const daySariyer = dayMatches.find(m => /sariyer/i.test(m.home?.name || '') && /istanbulspor/i.test(m.away?.name || ''));
        assert.ok(daySariyer, 'Expected Sariyer vs Istanbulspor match in fetchLiveScoreDayMatches output');
        assert.equal(daySariyer.league?.slug, 'tur.2', 'Day match must resolve to tur.2, never tur.1');
        assert.equal(daySariyer.league_slug, 'tur.2');
        assert.equal(daySariyer.league?.name, 'Turkish 1. Lig');
        assert.equal(daySariyer.league?.country, 'Turkey');
        assert.equal(daySariyer.home?.score, 1);
        assert.equal(daySariyer.away?.score, 0);

        // 3. Verify /fixtures read-path normalization invokes demoteIfNotTopFlight + inferCountryFromTeamNames
        const controllerSrc = fs.readFileSync(path.join(__dirname, '..', 'controllers/footballApiController.js'), 'utf8');
        assert.match(controllerSrc, /dedupedMatches[\s\S]*?demoteIfNotTopFlight\(/, '/fixtures dedupedMatches normalization must invoke demoteIfNotTopFlight');
    } finally {
        https.get = originalHttpsGet;
        SoccerMatch.find = originalMatchFind;
        SoccerLeague.find = originalLeagueFind;
    }
});

test('Frontend app.js, app-v9.js, and android/assets/app.js are mirrored and route Turkish 1. Lig clubs out of tur.1', () => {
    const root = path.join(__dirname, '..');
    const appJs = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
    const appV9Js = fs.readFileSync(path.join(root, 'public/app-v9.js'), 'utf8');
    const androidAppJs = fs.readFileSync(path.join(root, 'android/assets/app.js'), 'utf8');

    assert.equal(appV9Js, appJs, 'public/app-v9.js must mirror public/app.js');
    assert.equal(androidAppJs, appJs, 'android/assets/app.js must mirror public/app.js');

    const tur1Line = appJs.match(/'tur\.1':\s*\[[^\]]+\]/);
    assert.ok(tur1Line, 'CLIENT_TOP_FLIGHT[tur.1] must exist in public/app.js');
    assert.equal(tur1Line[0].includes('istanbulspor'), false, 'istanbulspor must not be in CLIENT_TOP_FLIGHT[tur.1]');
    assert.equal(tur1Line[0].includes('pendikspor'), false, 'pendikspor must not be in CLIENT_TOP_FLIGHT[tur.1]');
    assert.equal(tur1Line[0].includes('ankaragucu'), false, 'ankaragucu must not be in CLIENT_TOP_FLIGHT[tur.1]');
    assert.ok(appJs.includes('CLIENT_TURKISH_SECOND_TIER'), 'CLIENT_TURKISH_SECOND_TIER must exist in public/app.js');
    assert.ok(appJs.includes("'sariyer'"), 'sariyer must be in CLIENT_TURKISH_SECOND_TIER');
    assert.ok(appJs.includes("'bodrum'"), 'bare bodrum must be in CLIENT_TURKISH_SECOND_TIER');
    assert.ok(appJs.includes('CLIENT_TURKISH_THIRD_TIER'), 'CLIENT_TURKISH_THIRD_TIER must exist in public/app.js');
    assert.ok(appJs.includes(".replace(/ı/g, 'i')"), 'cleanTeamNameForDedup must fold Turkish dotless ı');
});

test('GET /fixtures Express handler reclassifies stale tur.1 Sariyer vs Istanbulspor to tur.2 and enforces ?league= filter post-reclassification', async () => {
    const app = express();
    footballApiController(app);
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();

    const getJson = (reqPath) => new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${port}${reqPath}`, (res) => {
            let data = '';
            res.on('data', (c) => { data += c; });
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
                catch (e) { reject(e); }
            });
        }).on('error', reject);
    });

    const futureDate = '2099-04-12';
    const matchDate = new Date('2099-04-12T15:00:00Z');
    const seededRows = [
        {
            _id: 'stale-tur1-sariyer',
            league_slug: 'tur.1',
            note: 'Turkish Süper Lig',
            scoreboard_date: '20990412',
            date: matchDate,
            status: { state: 'in', clock: "52'", detail: "52'", completed: false },
            home: { name: 'Sarıyer', display_name: 'Sarıyer', score: 1 },
            away: { name: 'İstanbulspor', display_name: 'İstanbulspor', score: 0 },
            source: { provider: 'livescore', event_id: 'ls_e2e_sariyer', livescore_id: 'e2e_sariyer' }
        },
        {
            _id: 'genuine-tur1-gala',
            league_slug: 'tur.1',
            note: 'Turkish Süper Lig',
            scoreboard_date: '20990412',
            date: matchDate,
            status: { state: 'pre', clock: 'NS', detail: 'Scheduled', completed: false },
            home: { name: 'Galatasaray', display_name: 'Galatasaray', score: 0 },
            away: { name: 'Fenerbahçe', display_name: 'Fenerbahçe', score: 0 },
            source: { provider: 'livescore', event_id: 'ls_e2e_gala', livescore_id: 'e2e_gala' }
        }
    ];

    const matchesFilter = (row, filter) => {
        if (!filter || !filter.league_slug) return true;
        if (typeof filter.league_slug === 'string') return row.league_slug === filter.league_slug;
        if (Array.isArray(filter.league_slug.$in)) return filter.league_slug.$in.includes(row.league_slug);
        return true;
    };

    const mockChain = (rows) => ({
        maxTimeMS() { return this; },
        select() { return this; },
        sort() { return this; },
        skip() { return this; },
        limit() { return this; },
        lean: async () => rows.map(r => JSON.parse(JSON.stringify(r)))
    });

    const originalMatchFind = SoccerMatch.find;
    const originalMatchCount = SoccerMatch.countDocuments;
    const originalLeagueFind = SoccerLeague.find;
    const originalFetch = global.fetch;

    SoccerMatch.find = (filter = {}) => mockChain(seededRows.filter(r => matchesFilter(r, filter)));
    SoccerMatch.countDocuments = (filter = {}) => ({
        maxTimeMS() { return this; },
        catch: () => Promise.resolve(seededRows.filter(r => matchesFilter(r, filter)).length),
        then: (res, rej) => Promise.resolve(seededRows.filter(r => matchesFilter(r, filter)).length).then(res, rej)
    });
    SoccerLeague.find = () => mockChain([
        { slug: 'tur.1', name: 'Turkish Süper Lig', abbreviation: 'Süper Lig', country: 'Turkey', active: true },
        { slug: 'tur.2', name: 'Turkish 1. Lig', abbreviation: '1. Lig', country: 'Turkey', active: true }
    ]);
    global.fetch = async () => ({ ok: true, json: async () => ({ Stages: [] }) });

    try {
        // 1. All-leagues query reclassifies Sariyer vs Istanbulspor to tur.2 while keeping Galatasaray vs Fenerbahçe in tur.1
        const allRes = await getJson(`/api/v1/football/fixtures?date=${futureDate}`);
        assert.equal(allRes.status, 200);
        const allSariyer = allRes.body.matches.find(m => /sar[iı]yer/i.test(m.home?.name || ''));
        const allGala = allRes.body.matches.find(m => /galatasaray/i.test(m.home?.name || ''));
        assert.ok(allSariyer, 'Expected Sariyer vs Istanbulspor in all-leagues /fixtures response');
        assert.equal(allSariyer.league?.slug, 'tur.2');
        assert.equal(allSariyer.league_slug, 'tur.2');
        assert.equal(allSariyer.league?.name, 'Turkish 1. Lig');
        assert.equal(allSariyer.league?.country, 'Turkey');
        assert.ok(allGala, 'Expected Galatasaray vs Fenerbahçe in all-leagues /fixtures response');
        assert.equal(allGala.league?.slug, 'tur.1');

        // 2. ?league=tur.1 MUST NOT leak Sariyer vs Istanbulspor after reclassification
        const tur1Res = await getJson(`/api/v1/football/fixtures?date=${futureDate}&league=tur.1`);
        assert.equal(tur1Res.status, 200);
        assert.equal(tur1Res.body.matches.some(m => /sar[iı]yer/i.test(m.home?.name || '')), false, '?league=tur.1 must exclude reclassified tur.2 match');
        assert.equal(tur1Res.body.matches.some(m => /galatasaray/i.test(m.home?.name || '')), true, '?league=tur.1 must retain Galatasaray vs Fenerbahçe');

        // 3. ?league=tur.2 MUST surface stale tur.1 Sariyer vs Istanbulspor as tur.2 and exclude tur.1 clubs
        const tur2Res = await getJson(`/api/v1/football/fixtures?date=${futureDate}&league=tur.2`);
        assert.equal(tur2Res.status, 200);
        const tur2Sariyer = tur2Res.body.matches.find(m => /sar[iı]yer/i.test(m.home?.name || ''));
        assert.ok(tur2Sariyer, '?league=tur.2 must return reclassified Sariyer vs Istanbulspor');
        assert.equal(tur2Sariyer.league?.slug, 'tur.2');
        assert.equal(tur2Sariyer.league?.name, 'Turkish 1. Lig');
        assert.equal(tur2Res.body.matches.some(m => /galatasaray/i.test(m.home?.name || '')), false, '?league=tur.2 must exclude genuine tur.1 match');
    } finally {
        SoccerMatch.find = originalMatchFind;
        SoccerMatch.countDocuments = originalMatchCount;
        SoccerLeague.find = originalLeagueFind;
        global.fetch = originalFetch;
        await new Promise((resolve) => server.close(resolve));
    }
});

test('Dynamic standings roster (tur.1 & eng.1) automatically demotes relegated clubs and accepts newly promoted clubs', () => {
    const prevTur1 = DYNAMIC_LEAGUE_CLUBS.get('tur.1');
    const prevEng1 = DYNAMIC_LEAGUE_CLUBS.get('eng.1');
    const prevEng2 = DYNAMIC_LEAGUE_CLUBS.get('eng.2');
    try {
        // 1. Turkish Süper Lig: simulate future season where Kasimpasa & Alanyaspor were relegated
        //    and Amedspor & Erzurumspor were promoted (neither is in static TOP_FLIGHT_CLUBS['tur.1'])
        const futureTur1 = [
            'Galatasaray', 'Fenerbahçe', 'Beşiktaş', 'Trabzonspor', 'İstanbul Başakşehir',
            'Samsunspor', 'Göztepe', 'Eyüpspor', 'Rizespor', 'Antalyaspor',
            'Gaziantep FK', 'Konyaspor', 'Kayserispor', 'Fatih Karagümrük', 'Kocaelispor',
            'Gençlerbirliği', 'Amedspor', 'Erzurumspor'
        ];
        assert.equal(updateDynamicLeagueRoster('tur.1', futureTur1), 18);

        // Newly relegated clubs still in static TOP_FLIGHT_CLUBS['tur.1'] are now automatically excluded
        assert.equal(hasTopFlightClub('tur.1', 'Kasimpasa', 'Alanyaspor'), false);
        assert.equal(demoteIfNotTopFlight('tur.1', 'Kasimpasa', 'Alanyaspor', 'Süper Lig'), 'tur.lower');

        // Newly promoted clubs absent from static TOP_FLIGHT_CLUBS['tur.1'] (and even in static TURKISH_SECOND_TIER_CLUBS)
        // are automatically accepted in tur.1 once live standings include them
        assert.equal(hasTopFlightClub('tur.1', 'Amedspor', 'Galatasaray'), true);
        assert.equal(demoteIfNotTopFlight('tur.1', 'Amedspor', 'Galatasaray', 'Süper Lig'), 'tur.1');
        assert.equal(inferCountryFromTeamNames('Amedspor', 'Galatasaray', 'tur.1'), 'tur.1');
        assert.equal(hasTopFlightClub('tur.1', 'Amedspor', 'Erzurumspor'), true);
        assert.equal(demoteIfNotTopFlight('tur.1', 'Amedspor', 'Erzurumspor', 'Süper Lig'), 'tur.1');

        // 2. English Premier League: simulate live 20-club table where Sunderland is promoted
        //    and Leicester City & Southampton are relegated (both still exist in static TOP_FLIGHT_CLUBS['eng.1'])
        const currentEng1 = [
            'Arsenal', 'Liverpool', 'Manchester City', 'Chelsea', 'Newcastle United',
            'Aston Villa', 'Nottingham Forest', 'Brighton & Hove Albion', 'Bournemouth', 'Fulham',
            'Brentford', 'Crystal Palace', 'Manchester United', 'Tottenham Hotspur', 'West Ham United',
            'Everton', 'Wolverhampton Wanderers', 'Leeds United', 'Burnley', 'Sunderland'
        ];
        assert.equal(updateDynamicLeagueRoster('eng.1', currentEng1), 20);

        // Newly promoted Sunderland (not in static TOP_FLIGHT_CLUBS['eng.1']) is accepted in eng.1
        assert.equal(hasTopFlightClub('eng.1', 'Sunderland', 'Arsenal'), true);
        assert.equal(demoteIfNotTopFlight('eng.1', 'Sunderland', 'Arsenal', 'Premier League'), 'eng.1');

        // Relegated Leicester City vs Southampton (both in static TOP_FLIGHT_CLUBS['eng.1']) are rejected from eng.1
        assert.equal(hasTopFlightClub('eng.1', 'Leicester City', 'Southampton'), false);
        assert.equal(demoteIfNotTopFlight('eng.1', 'Leicester City', 'Southampton', 'Premier League'), 'eng.lower');

        // Even if a stale eng.2 table still lists Sunderland, both clubs being in live eng.1 protects the PL match
        updateDynamicLeagueRoster('eng.2', ['Sunderland', 'Leicester City', 'Southampton', 'Ipswich Town', 'Millwall', 'Coventry City', 'Middlesbrough', 'Watford', 'Norwich City', 'Sheffield United']);
        assert.equal(hasTopFlightClub('eng.1', 'Sunderland', 'Arsenal'), true);
        assert.equal(demoteIfNotTopFlight('eng.1', 'Sunderland', 'Arsenal', 'Premier League'), 'eng.1');
        // Meanwhile relegated Leicester City vs Southampton routes directly to eng.2
        assert.equal(demoteIfNotTopFlight('eng.1', 'Leicester City', 'Southampton', 'Premier League'), 'eng.2');
    } finally {
        if (prevTur1) DYNAMIC_LEAGUE_CLUBS.set('tur.1', prevTur1); else DYNAMIC_LEAGUE_CLUBS.delete('tur.1');
        if (prevEng1) DYNAMIC_LEAGUE_CLUBS.set('eng.1', prevEng1); else DYNAMIC_LEAGUE_CLUBS.delete('eng.1');
        if (prevEng2) DYNAMIC_LEAGUE_CLUBS.set('eng.2', prevEng2); else DYNAMIC_LEAGUE_CLUBS.delete('eng.2');
    }
});

test('Dynamic second-tier roster (eng.2) routes relegated clubs to eng.2 even when both remain in static TOP_FLIGHT_CLUBS[eng.1]', () => {
    const prevEng1 = DYNAMIC_LEAGUE_CLUBS.get('eng.1');
    const prevEng2 = DYNAMIC_LEAGUE_CLUBS.get('eng.2');
    try {
        // Ensure eng.1 dynamic roster is NOT populated (forcing static TOP_FLIGHT_CLUBS['eng.1'] fallback)
        DYNAMIC_LEAGUE_CLUBS.delete('eng.1');
        assert.equal(TOP_FLIGHT_CLUBS['eng.1'].has('leicester'), true);
        assert.equal(TOP_FLIGHT_CLUBS['eng.1'].has('southampton'), true);

        updateDynamicLeagueRoster('eng.2', [
            'Leicester City', 'Southampton', 'Ipswich Town', 'Sheffield United',
            'Middlesbrough', 'Coventry City', 'Norwich City', 'Watford',
            'Millwall', 'West Bromwich Albion', 'Bristol City', 'Blackburn Rovers'
        ]);

        // Relegated Leicester City vs Southampton must route to eng.2 instead of eng.1
        assert.equal(hasTopFlightClub('eng.1', 'Leicester City', 'Southampton'), false);
        assert.equal(demoteIfNotTopFlight('eng.1', 'Leicester City', 'Southampton', 'Premier League'), 'eng.2');
        assert.equal(demoteIfNotTopFlight('eng.1', 'Leicester', 'Ipswich Town', 'Premier League'), 'eng.2');

        // Genuine Premier League clubs remain in eng.1
        assert.equal(hasTopFlightClub('eng.1', 'Arsenal', 'Chelsea'), true);
        assert.equal(demoteIfNotTopFlight('eng.1', 'Arsenal', 'Chelsea', 'Premier League'), 'eng.1');

        // Cup and friendly competitions are never hijacked
        assert.equal(demoteIfNotTopFlight('eng.fa', 'Arsenal', 'Leicester City', 'FA Cup'), 'eng.fa');
        assert.equal(demoteIfNotTopFlight('intl.friendly', 'Leicester City', 'Southampton', 'Club Friendly'), 'intl.friendly');
    } finally {
        if (prevEng1) DYNAMIC_LEAGUE_CLUBS.set('eng.1', prevEng1); else DYNAMIC_LEAGUE_CLUBS.delete('eng.1');
        if (prevEng2) DYNAMIC_LEAGUE_CLUBS.set('eng.2', prevEng2); else DYNAMIC_LEAGUE_CLUBS.delete('eng.2');
    }
});

test('refreshDynamicLeagueRostersFromDb hydrates only the latest season_year per league from SoccerStanding', async () => {
    const originalStandingFind = SoccerStanding.find;
    const prevTestSlug = DYNAMIC_LEAGUE_CLUBS.get('esp.1');
    try {
        const mockDocs = [
            {
                league_slug: 'esp.1',
                season_year: 2026,
                group_id: 'overall',
                last_synced_at: new Date('2026-11-20T00:00:00Z'),
                entries: [
                    'Real Madrid', 'Barcelona', 'Atletico Madrid', 'Athletic Bilbao', 'Villarreal',
                    'Real Betis', 'Real Sociedad', 'Sevilla', 'Valencia', 'Osasuna',
                    'Girona', 'Mallorca', 'Celta Vigo', 'Getafe', 'Rayo Vallecano',
                    'Espanyol', 'Alaves', 'Real Oviedo', 'Levante', 'Elche'
                ].map(name => ({ club: { display_name: name } }))
            },
            {
                league_slug: 'esp.1',
                season_year: 2025,
                group_id: 'overall',
                last_synced_at: new Date('2025-05-25T00:00:00Z'),
                entries: [
                    'Real Madrid', 'Barcelona', 'Las Palmas', 'Valladolid', 'Leganes',
                    'Cadiz', 'Granada', 'Almeria', 'Sevilla', 'Valencia'
                ].map(name => ({ club: { display_name: name } }))
            }
        ];

        SoccerStanding.find = () => ({
            select() { return this; },
            sort() { return this; },
            lean: async () => mockDocs
        });

        const updated = await refreshDynamicLeagueRostersFromDb();
        assert.equal(updated, 1);
        const esp1 = DYNAMIC_LEAGUE_CLUBS.get('esp.1');
        assert.ok(esp1 instanceof Set);
        assert.equal(esp1.size, 20);
        // Promoted 2026 club Real Oviedo is accepted; relegated 2025 clubs Valladolid vs Leganes are excluded
        assert.equal(hasTopFlightClub('esp.1', 'Real Oviedo', 'Real Madrid'), true);
        assert.equal(hasTopFlightClub('esp.1', 'Valladolid', 'Leganes'), false);
        assert.equal(demoteIfNotTopFlight('esp.1', 'Valladolid', 'Leganes', 'LaLiga'), 'esp.lower');
    } finally {
        SoccerStanding.find = originalStandingFind;
        if (prevTestSlug) DYNAMIC_LEAGUE_CLUBS.set('esp.1', prevTestSlug); else DYNAMIC_LEAGUE_CLUBS.delete('esp.1');
    }
});

test('Dynamic rosters ignore reserve/B/Jong teams, match short aliases (AZ/PSV/Wolves/Nottm Forest), and require both clubs when .1 table is complete (>=12)', () => {
    const slugs = ['ned.1', 'ned.2', 'por.1', 'por.2', 'esp.1', 'esp.2', 'eng.1', 'eng.2'];
    const prev = new Map(slugs.map(s => [s, DYNAMIC_LEAGUE_CLUBS.get(s)]));
    try {
        // 1. Reserve/B/Jong teams in .2 standings must NEVER demote senior .1 parent clubs
        DYNAMIC_LEAGUE_CLUBS.delete('ned.1');
        updateDynamicLeagueRoster('ned.2', ['Jong Ajax', 'Jong PSV', 'Jong AZ', 'Jong FC Utrecht', 'Cambuur', 'De Graafschap', 'Volendam', 'Excelsior', 'ADO Den Haag', 'FC Emmen']);
        assert.equal(hasTopFlightClub('ned.1', 'Ajax', 'Feyenoord'), true);
        assert.equal(demoteIfNotTopFlight('ned.1', 'Ajax', 'Feyenoord', 'Eredivisie'), 'ned.1');

        DYNAMIC_LEAGUE_CLUBS.delete('por.1');
        updateDynamicLeagueRoster('por.2', ['Benfica B', 'FC Porto B', 'Vizela', 'Tondela', 'Chaves', 'Penafiel', 'Academico Viseu', 'Maritimo', 'Leiria', 'Pacos Ferreira']);
        assert.equal(hasTopFlightClub('por.1', 'Benfica', 'Sporting CP'), true);
        assert.equal(demoteIfNotTopFlight('por.1', 'Benfica', 'Sporting CP', 'Primeira Liga'), 'por.1');

        DYNAMIC_LEAGUE_CLUBS.delete('esp.1');
        updateDynamicLeagueRoster('esp.2', ['Real Sociedad B', 'Racing Santander', 'Real Zaragoza', 'Sporting Gijon', 'Cadiz', 'Granada', 'Almeria', 'Eibar', 'Huesca', 'Burgos']);
        assert.equal(hasTopFlightClub('esp.1', 'Real Sociedad', 'Real Madrid'), true);
        assert.equal(demoteIfNotTopFlight('esp.1', 'Real Sociedad', 'Real Madrid', 'LaLiga'), 'esp.1');

        // 2. Short-name clubs (AZ vs PSV) match full-name live standings (AZ Alkmaar, PSV Eindhoven)
        updateDynamicLeagueRoster('ned.1', [
            'Ajax', 'PSV Eindhoven', 'Feyenoord', 'AZ Alkmaar', 'FC Twente',
            'FC Utrecht', 'SC Heerenveen', 'FC Groningen', 'Sparta Rotterdam', 'NEC Nijmegen',
            'Go Ahead Eagles', 'Fortuna Sittard', 'Heracles Almelo', 'PEC Zwolle', 'Willem II',
            'NAC Breda', 'RKC Waalwijk', 'Almere City'
        ]);
        assert.equal(hasTopFlightClub('ned.1', 'AZ', 'PSV'), true);
        assert.equal(demoteIfNotTopFlight('ned.1', 'AZ', 'PSV', 'Eredivisie'), 'ned.1');
        // Reserve teams must not match senior ned.1 table
        assert.equal(hasTopFlightClub('ned.1', 'Jong Ajax', 'Jong PSV'), false);

        // 3. Complete .1 table (size >= 12) requires BOTH teams so mis-tagged Arsenal vs Millwall
        //    is rejected even when eng.2 is unpopulated, while short aliases (Wolves, Nottm Forest, Man Utd) pass
        DYNAMIC_LEAGUE_CLUBS.delete('eng.2');
        updateDynamicLeagueRoster('eng.1', [
            'Arsenal', 'Liverpool', 'Manchester City', 'Chelsea', 'Newcastle United',
            'Aston Villa', 'Nottingham Forest', 'Brighton & Hove Albion', 'Bournemouth', 'Fulham',
            'Brentford', 'Crystal Palace', 'Manchester United', 'Tottenham Hotspur', 'West Ham United',
            'Everton', 'Wolverhampton Wanderers', 'Leeds United', 'Burnley', 'Sunderland'
        ]);
        assert.equal(hasTopFlightClub('eng.1', 'Wolves', 'Nottm Forest'), true);
        assert.equal(hasTopFlightClub('eng.1', 'Man Utd', 'Spurs'), true);
        assert.equal(hasTopFlightClub('eng.1', 'Arsenal', 'Millwall'), false);
        assert.equal(demoteIfNotTopFlight('eng.1', 'Arsenal', 'Millwall', 'Premier League'), 'eng.lower');
    } finally {
        for (const s of slugs) {
            if (prev.get(s)) DYNAMIC_LEAGUE_CLUBS.set(s, prev.get(s));
            else DYNAMIC_LEAGUE_CLUBS.delete(s);
        }
    }
});
