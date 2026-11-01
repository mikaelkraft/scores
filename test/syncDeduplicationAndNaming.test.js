const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveLeagueSlug, normalizeTeamName, areTeamNamesMatching } = require('../services/soccerSyncService');

test('resolveLeagueSlug explicitly rejects NCAA basketball and college non-soccer events', () => {
    assert.equal(resolveLeagueSlug('NCAA Men\'s Basketball', 'College Basketball', 's:40~l:41'), null);
    assert.equal(resolveLeagueSlug('NCAAM Tournament', 'NCAA Division I', 's:40'), null);
    assert.equal(resolveLeagueSlug('Mens College Basketball', 'NCAA', 'ncaa.m.1'), null);
});

test('resolveLeagueSlug correctly resolves African continental and domestic premier competitions', () => {
    assert.equal(resolveLeagueSlug('CAF Champions League', 'Africa', 'caf.champions'), 'caf.champions');
    assert.equal(resolveLeagueSlug('TotalEnergies CAF CL', 'Africa', ''), 'caf.champions');
    assert.equal(resolveLeagueSlug('CAF Confederation Cup', 'Africa', 'caf.confed'), 'caf.confed');
    assert.equal(resolveLeagueSlug('Africa Cup of Nations', 'International', 'caf.nations'), 'caf.nations');
    assert.equal(resolveLeagueSlug('Nigeria Premier Football League', 'Nigeria', 'nga.1'), 'nga.1');
    assert.equal(resolveLeagueSlug('NPFL Matchday 8', 'Nigeria', ''), 'nga.1');
});

test('resolveLeagueSlug accurately resolves US and European competitions', () => {
    assert.equal(resolveLeagueSlug('USL Championship', 'United States', 'usa.usl.1'), 'usa.usl.1');
    assert.equal(resolveLeagueSlug('English Premier League', 'England', 'eng.1'), 'eng.1');
    assert.equal(resolveLeagueSlug('UEFA Champions League', 'International', 'uefa.champions'), 'uefa.champions');
});

test('areTeamNamesMatching accurately deduplicates teams between ESPN and LiveScore variants', () => {
    // Manchester United aliases
    assert.equal(areTeamNamesMatching('Manchester United', 'Man Utd'), true);
    assert.equal(areTeamNamesMatching('Man United', 'Manchester United FC'), true);

    // Tottenham aliases
    assert.equal(areTeamNamesMatching('Tottenham Hotspur', 'Spurs'), true);

    // Paris Saint-Germain aliases
    assert.equal(areTeamNamesMatching('Paris Saint-Germain', 'PSG'), true);

    // Atletico Madrid aliases
    assert.equal(areTeamNamesMatching('Atlético Madrid', 'Atl. Madrid'), true);

    // Wolves aliases
    assert.equal(areTeamNamesMatching('Wolverhampton Wanderers', 'Wolves'), true);

    // Non-matching teams do not collide
    assert.equal(areTeamNamesMatching('Chelsea', 'Arsenal'), false);
    assert.equal(areTeamNamesMatching('Real Madrid', 'Barcelona'), false);
});

