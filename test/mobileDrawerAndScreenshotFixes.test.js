const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const {
    TARGET_LEAGUES,
    resolveLeagueSlug,
    normalizeTeamName,
    areTeamNamesMatching
} = require('../services/soccerSyncService');

test.after(async () => {
    try {
        if (mongoose.connection && mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
        }
    } catch (_) {}
    setTimeout(() => process.exit(0), 100);
});

test('APK download modal copy displays "Real-Time Football Scores and Stats" and v1.0.0 without stale v9 references', () => {
    const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');

    // Stale references must be absent
    assert.equal(html.includes('Real-Time Football Telemetry • Version 9.28'), false, 'Stale telemetry copy must be eliminated');
    assert.equal(html.includes('Version 9.28'), false, 'Version 9.28 must be eliminated');

    // Fresh accurate copy
    assert.ok(
        html.includes('Real-Time Football Scores and Stats') && (html.includes('v1.0.0') || html.includes('1.0.0')),
        'Download modal must present "Real-Time Football Scores and Stats • v1.0.0"'
    );
});

test('Mobile hamburger button, overlay, and drawer elements exist in index.html', () => {
    const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');

    assert.ok(html.includes('id="mobile-hamburger-btn"'), 'Mobile hamburger button must exist');
    assert.ok(html.includes('id="mobile-drawer-overlay"'), 'Mobile drawer overlay must exist');
    assert.ok(html.includes('id="mobile-country-drawer"'), 'Mobile country drawer aside must exist');
    assert.ok(html.includes('id="mobile-country-list"'), 'Mobile country list container must exist');
    assert.ok(html.includes('id="mobile-country-filter"'), 'Mobile country search input must exist');
    assert.ok(html.includes('id="close-mobile-drawer"'), 'Close drawer button must exist');
    assert.ok(html.includes('id="mobile-quick-all"'), 'Quick All button must exist');
    assert.ok(html.includes('id="mobile-quick-live"'), 'Quick Live button must exist');
});

test('Mobile hamburger and drawer CSS rules are defined and hide on desktop', () => {
    const css = fs.readFileSync(path.join(__dirname, '../public/styles.css'), 'utf8');

    assert.ok(css.includes('.mobile-hamburger-btn'), 'CSS must define .mobile-hamburger-btn');
    assert.ok(css.includes('.mobile-drawer-overlay'), 'CSS must define .mobile-drawer-overlay');
    assert.ok(css.includes('.mobile-country-drawer'), 'CSS must define .mobile-country-drawer');
    assert.ok(css.includes('.mobile-country-header'), 'CSS must define .mobile-country-header');
    assert.ok(css.includes('.mobile-country-leagues'), 'CSS must define .mobile-country-leagues');
    assert.ok(css.includes('.quick-league-more-btn'), 'CSS must define .quick-league-more-btn');

    // Desktop view must hide mobile drawer elements
    const desktopMediaQuery = css.indexOf('@media (min-width: 1024px)');
    assert.ok(desktopMediaQuery !== -1, 'CSS must have desktop media query');
    const desktopSection = css.slice(desktopMediaQuery);
    assert.ok(desktopSection.includes('.mobile-hamburger-btn') && desktopSection.includes('display: none !important'), 'Desktop media query must hide mobile hamburger button');
});

test('Header brand elements support dynamic admin logo replacement and title sync', () => {
    const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');

    assert.ok(html.includes('id="header-ball-icon"'), 'Ball icon must have id header-ball-icon');
    assert.ok(html.includes('id="header-brand-title"'), 'Brand title must have id header-brand-title');

    const appJs = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
    assert.ok(appJs.includes('headerBallIcon.innerHTML = `<img src="${escapeHtml(res.branding.headerLogoUrl)}"'), 'app.js must replace ball icon with custom admin header logo');
    assert.ok(appJs.includes('headerBrandTitle.textContent = res.branding.siteTitle'), 'app.js must sync header-brand-title with admin siteTitle');
});

test('Cross-source deduplication accurately matches team aliases for Spain and Peru', () => {
    // Spanish Primera Federación / Segunda aliases: Celta Vigo B vs RC Celta Fortuna
    assert.equal(areTeamNamesMatching('Celta Vigo B', 'RC Celta Fortuna', 'esp.3', 'esp.3'), true);
    assert.equal(areTeamNamesMatching('Celta Vigo B', 'Celta Fortuna', 'esp.3', 'esp.3'), true);

    // Peruvian Liga 1: UTC vs CD UT Cajamarca (Universidad Técnica de Cajamarca)
    assert.equal(areTeamNamesMatching('UTC', 'CD UT Cajamarca', 'per.1', 'per.1'), true);
    assert.equal(areTeamNamesMatching('CD UT Cajamarca', 'Univ. Tecnica de Cajamarca', 'per.1', 'per.1'), true);

    // Peruvian Liga 1: ADT vs Asociación Deportiva Tarma
    assert.equal(areTeamNamesMatching('ADT', 'Asociacion Deportiva Tarma', 'per.1', 'per.1'), true);
    assert.equal(areTeamNamesMatching('ADT', 'Asoc. Deportiva Tarma', 'per.1', 'per.1'), true);

    // Peruvian Liga 1: Los Chankas vs Los Chankas CYC
    assert.equal(areTeamNamesMatching('Los Chankas', 'Los Chankas CYC', 'per.1', 'per.1'), true);

    // Domestic vs International Youth: Bosnia U21 vs Montenegro U21 must resolve to youth/intl, not bih.2
    const slug = resolveLeagueSlug('Bosnia-Herzegovina U21 vs Montenegro U21', 'Under-21 International Friendly', '');
    assert.equal(slug, 'intl.u21', 'U21 international match must resolve to intl.u21, not domestic Bosnian league');
});

test('Every target league country resolves to a complete flag in the app catalog', () => {
    const appJs = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');

    // Extract COUNTRY_CODES object from app.js
    const match = appJs.match(/const\s+COUNTRY_CODES\s*=\s*\{([^}]+)\};/s);
    assert.ok(match, 'COUNTRY_CODES must be defined in app.js');
    const codesContent = match[1];

    const targetCountries = [...new Set(TARGET_LEAGUES.map(l => l.country).filter(Boolean))];
    const regional = ['africa', 'south america', 'north america', 'asia'];

    const missingCountries = [];
    for (const country of targetCountries) {
        const clean = country.toLowerCase().trim();
        const regex = new RegExp(`['"]?${clean.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}['"]?\\s*:`, 'i');
        const hasCode = regex.test(codesContent);
        const isRegional = regional.includes(clean);
        if (!hasCode && !isRegional) {
            missingCountries.push(country);
        }
    }

    assert.deepEqual(missingCountries, [], `All target countries must have a flag code. Missing: ${missingCountries.join(', ')}`);
});

test('Predictions context in footballApiController counts finished matches in lifetime H2H', () => {
    const controller = fs.readFileSync(path.join(__dirname, '../controllers/footballApiController.js'), 'utf8');

    // Verify finished match inclusion
    assert.ok(controller.includes('isCurrentMatchFinished'), 'Controller must check isCurrentMatchFinished');
    assert.ok(controller.includes('h2hExcludeFilter = isCurrentMatchFinished ? {} : excludeCurrentMatch'), 'H2H query must not exclude finished match');
    assert.ok(controller.includes('if (isThisMatch && !isCurrentMatchFinished) return false;'), 'Lifetime H2H filter must include current match if finished');
});

test('Download endpoint and index.html serve norrascore.apk with download attribute and no missing fs module', () => {
    const indexJs = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');
    assert.ok(indexJs.includes("const fs = require('fs');"), 'index.js must import fs module');
    assert.ok(indexJs.includes("res.setHeader('Content-Type', 'application/vnd.android.package-archive');"), 'index.js must set APK mime type');

    const indexHtml = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
    assert.ok(indexHtml.includes('download="norrascore.apk"'), 'APK download link must have download attribute');
});
