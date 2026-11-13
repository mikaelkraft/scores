const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { resolveLeagueSlug, inferCountryFromTeamNames, normalizeTeamName } = require('../services/soccerSyncService');
const { serializeLeague, serializeStandingGroup } = require('../services/soccerSerializer');

test.after(async () => {
    try {
        if (mongoose.connection && mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
        }
    } catch (_) {}
    process.exit(0);
});

test('resolveLeagueSlug correctly identifies CONCACAF Nations League and does not map American teams to AFCON', () => {
    // Curaçao vs Panama
    const curacaoPanama = resolveLeagueSlug(
        'CONCACAF Nations League',
        'Curaçao vs Panama',
        'concacaf.nations'
    );
    assert.equal(curacaoPanama, 'concacaf.nations');

    // Bermuda vs St. Lucia when generic nations league text passed with team names
    const bermudaStLucia = resolveLeagueSlug(
        'Nations League',
        'Bermuda vs Saint Lucia',
        'nations'
    );
    assert.equal(bermudaStLucia, 'concacaf.nations');

    // If upstream misattributed Curaçao vs Panama to caf.nations, inferCountryFromTeamNames repairs it to concacaf.nations
    const repairedFromAfcon = inferCountryFromTeamNames('Curaçao', 'Panama', 'caf.nations');
    assert.equal(repairedFromAfcon, 'concacaf.nations');

    const repairedBermuda = inferCountryFromTeamNames('Bermuda', 'Saint Lucia', 'caf.nations');
    assert.equal(repairedBermuda, 'concacaf.nations');

    // Genuine AFCON match remains caf.nations
    const nigeriaBenin = resolveLeagueSlug(
        'Africa Cup of Nations',
        'Nigeria vs Benin',
        'caf.nations'
    );
    assert.equal(nigeriaBenin, 'caf.nations');
});

test('normalizeTeamName handles St. and Saint consistently', () => {
    const stLucia = normalizeTeamName('St. Lucia');
    const saintLucia = normalizeTeamName('Saint Lucia');
    assert.equal(stLucia, saintLucia);

    const stMartin = normalizeTeamName('St-Martin');
    const saintMartin = normalizeTeamName('Saint-Martin');
    assert.equal(stMartin, saintMartin);

    const stKitts = normalizeTeamName('St. Kitts and Nevis');
    const saintKitts = normalizeTeamName('Saint Kitts and Nevis');
    assert.equal(stKitts, saintKitts);
});

test('serializeLeague never assigns Premier League 23.png to other leagues and upgrades stale seasons', () => {
    const chnCup = serializeLeague({
        slug: 'chn.cup',
        name: 'Chinese FA Cup',
        country: 'China',
        logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/23.png',
        season: {
            year: 2025,
            display_name: '2025 Chinese FA Cup'
        }
    });

    // Logo must NOT be 23.png
    assert.notEqual(chnCup.logo, 'https://a.espncdn.com/i/leaguelogos/soccer/500/23.png');
    assert.equal(chnCup.logo, null);

    // Stale 2025 season must be upgraded to 2026
    assert.equal(chnCup.season.year, 2026);
    assert.ok(chnCup.season.display_name.includes('2026'));

    const npfl = serializeLeague({
        slug: 'nga.1',
        name: 'Nigeria Premier Football League',
        country: 'Nigeria',
        logo: 'https://flagcdn.com/w80/ng.png',
        season: {
            year: 2025,
            display_name: '2025-26 Nigerian Professional League'
        }
    });

    assert.equal(npfl.season.year, 2026);
    assert.ok(npfl.season.display_name.includes('2026-27'));
});

test('serializeStandingGroup ensures current season_year', () => {
    const currentYear = new Date().getFullYear();
    const group = serializeStandingGroup({
        group_id: 'npfl_table',
        group_name: 'NPFL Table',
        season_year: 2025,
        entries: [
            {
                club: { name: 'Enugu Rangers', source_id: '123' },
                rank: 1,
                stats: { points: 15, gamesPlayed: 7, wins: 4 }
            }
        ]
    });

    assert.equal(group.standings.season, currentYear);
});

test('frontend app-v9 has patchLiveMatchRowsInDom without requiring all global matches to match', () => {
    const appV9 = fs.readFileSync(path.join(__dirname, '..', 'public', 'app-v9.js'), 'utf8');
    assert.ok(appV9.includes('return matchedCount > 0;'), 'patchLiveMatchRowsInDom should return matchedCount > 0');
    assert.ok(!appV9.includes('return matchedCount > 0 && matchedCount === liveMatches.length;'), 'patchLiveMatchRowsInDom should not require all matches');
    assert.ok(appV9.includes('isUserInteracting'), 'app-v9 must track isUserInteracting to protect scrolling');
});
