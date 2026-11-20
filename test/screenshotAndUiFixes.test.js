const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');

const {
    resolveLeagueSlug,
    normalizeTeamName,
    areTeamNamesMatching
} = require('../services/soccerSyncService');

test.after(async () => {
    try {
        await mongoose.disconnect();
    } catch (_) {}
});

test('Team deduplication harmonizes United States/USA and Nordic HB Køge/HB Koege W', () => {
    assert.equal(normalizeTeamName('United States'), normalizeTeamName('USA'));
    assert.equal(areTeamNamesMatching('United States', 'USA', 'concacaf.nations', 'concacaf.nations'), true);

    assert.equal(normalizeTeamName('HB Køge'), normalizeTeamName('HB Koege W'));
    assert.equal(areTeamNamesMatching('HB Køge', 'HB Koege W', 'uefa.wchampions', 'uefa.wchampions'), true);
    assert.equal(areTeamNamesMatching('Paris FC', 'Paris FC W', 'uefa.wchampions', 'uefa.wchampions'), true);
});

test('League resolution fixes National League (England), Keuken Kampioen Divisie (Netherlands), and Indian leagues', () => {
    // English National League must NEVER fall into France (fra.lower / fra.3)
    assert.equal(resolveLeagueSlug('National League', 'International', ''), 'eng.5');
    assert.equal(resolveLeagueSlug('National League', 'England', ''), 'eng.5');
    assert.equal(resolveLeagueSlug('Championnat National', 'France', ''), 'fra.3');

    // Dutch 2nd tier Keuken Kampioen Divisie resolves to ned.2 (Netherlands), never International
    assert.equal(resolveLeagueSlug('Keuken Kampioen Divisie', 'International', ''), 'ned.2');
    assert.equal(resolveLeagueSlug('Eerste Divisie', 'International', ''), 'ned.2');

    // Indian Super League / India Super League / Indian Football League resolve to ind.1 / ind.2
    assert.equal(resolveLeagueSlug('India Super League', 'International', ''), 'ind.1');
    assert.equal(resolveLeagueSlug('Indian Super League', 'International', ''), 'ind.1');
    assert.equal(resolveLeagueSlug('Indian Football League', 'International', ''), 'ind.2');
});

test('Atomic theme switcher uses classList.toggle and preserves no-theme-transition', () => {
    const indexHtml = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
    const sharedShellJs = fs.readFileSync(path.join(__dirname, '../public/shared-shell.js'), 'utf8');
    const stylesCss = fs.readFileSync(path.join(__dirname, '../public/styles.css'), 'utf8');

    assert.match(indexHtml, /documentElement\.classList\.toggle\('theme-light'/);
    assert.doesNotMatch(indexHtml, /documentElement\.className\s*=\s*cleanTheme/);
    assert.match(sharedShellJs, /documentElement\.classList\.toggle\('theme-light'/);
    assert.match(stylesCss, /html\s*\{[\s\S]*background-color:\s*var\(--bg-canvas\)/);
});

test('Custom header & footer logos hide fallback text, expand, and apply light-mode color filter', () => {
    const appJs = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
    const stylesCss = fs.readFileSync(path.join(__dirname, '../public/styles.css'), 'utf8');

    assert.match(appJs, /headerBrandFallback\.style\.display\s*=\s*'none'/);
    assert.match(appJs, /footerBrandText\.style\.display\s*=\s*'none'/);
    assert.match(stylesCss, /body\.theme-light\s+\.brand-logo-img/);
    assert.match(stylesCss, /filter:\s*brightness\(/);
});

test('Momentum power pressure index uses structured 3-column symmetric stat grid', () => {
    const appJs = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
    const stylesCss = fs.readFileSync(path.join(__dirname, '../public/styles.css'), 'utf8');

    assert.match(appJs, /class="momentum-stats-grid"/);
    assert.match(appJs, /class="momentum-stat-cell"/);
    assert.match(stylesCss, /\.momentum-stats-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(3/);
});

test('Unified styles and shared-shell.js across admin and secondary pages without stale hardcoded pricing', () => {
    const adminHtml = fs.readFileSync(path.join(__dirname, '../public/admin/index.html'), 'utf8');
    const docsHtml = fs.readFileSync(path.join(__dirname, '../public/docs/index.html'), 'utf8');
    const indexHtml = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');

    assert.match(adminHtml, /\/assets\/styles\.css\?v=1\.0\.0/);
    assert.match(adminHtml, /\/assets\/shared-shell\.js/);
    assert.match(docsHtml, /\/assets\/styles\.css\?v=1\.0\.0/);
    assert.match(docsHtml, /data-tier-price="starter"/);
    assert.match(indexHtml, /data-tier-price="starter"/);
    assert.doesNotMatch(docsHtml, /\$10 \/ mo/);
});
