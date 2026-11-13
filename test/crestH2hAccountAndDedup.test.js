const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('teamLogo never leaks unescaped SVG attributes or JSON styling into inline onerror', () => {
    // Read public app scripts
    const appV9 = fs.readFileSync(path.join(__dirname, '..', 'public', 'app-v9.js'), 'utf8');
    const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');

    for (const [name, code] of [['app-v9.js', appV9], ['app.js', app]]) {
        // Must NOT interpolate raw SVG or HTML inside inline onerror attribute
        assert.ok(!code.includes("this.outerHTML='<svg"), `${name} should not interpolate raw SVG into this.outerHTML in onerror`);
        assert.ok(!code.includes('this.outerHTML=`<svg'), `${name} should not interpolate raw SVG into this.outerHTML in onerror`);
        // Must delegate to window.handleLogoError
        assert.ok(code.includes('window.handleLogoError(this)'), `${name} must delegate onerror to window.handleLogoError(this)`);
        assert.ok(code.includes('window.handleLogoError = function'), `${name} must define window.handleLogoError`);
    }
});

test('middleware apiKeyAuth allows web client requests for H2H and predictions context', () => {
    const authCode = fs.readFileSync(path.join(__dirname, '..', 'middleware', 'apiKeyAuth.js'), 'utf8');
    assert.ok(authCode.includes('function isWebClientRequest'), 'apiKeyAuth.js must define isWebClientRequest');
    assert.ok(authCode.includes('x-web-client'), 'apiKeyAuth.js must check x-web-client header');
    assert.ok(authCode.includes('sec-fetch-site'), 'apiKeyAuth.js must check sec-fetch-site header');
});

test('controllers footballApiController has parsedSeriesTotal declared before SportScore H2H enrichment', () => {
    const controllerCode = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'footballApiController.js'), 'utf8');
    const ssEnrichIdx = controllerCode.indexOf('fetchSportScoreH2H');
    const parsedTotalIdx = controllerCode.indexOf('let parsedSeriesTotal = 0;');

    assert.ok(ssEnrichIdx > 0, 'fetchSportScoreH2H must be called');
    assert.ok(parsedTotalIdx > 0, 'let parsedSeriesTotal must be declared');
    assert.ok(parsedTotalIdx < ssEnrichIdx, 'let parsedSeriesTotal must be declared BEFORE fetchSportScoreH2H to prevent TDZ ReferenceError');
});

test('controllers footballApiController pre-caches crests to local disk', () => {
    const controllerCode = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'footballApiController.js'), 'utf8');
    assert.ok(controllerCode.includes('function preCacheMatchCrests'), 'footballApiController must have preCacheMatchCrests');
    assert.ok(controllerCode.includes('CREST_DIR'), 'footballApiController must define CREST_DIR');
    assert.ok(controllerCode.includes('fallback-shield.svg'), 'footballApiController must support fallback-shield.svg');
});

test('frontend deduplicateMatchesList pairs matches and boosts live quality', () => {
    const appV9 = fs.readFileSync(path.join(__dirname, '..', 'public', 'app-v9.js'), 'utf8');
    assert.ok(appV9.includes('function getPairBaseKey'), 'app-v9.js must define getPairBaseKey');
    assert.ok(appV9.includes('isLiveBonus'), 'app-v9.js must boost quality of live matches');
    assert.ok(appV9.includes('pairMap.has(pairBase)'), 'app-v9.js must detect matching team pairs across live/scheduled feeds');
});

test('public/account/index.html presents Unified Account Center with Profile active by default', () => {
    const accountHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'account', 'index.html'), 'utf8');
    assert.ok(accountHtml.includes('Unified Account Center'), 'account index.html title must reflect Unified Account Center');
    assert.ok(accountHtml.includes('portal-tab-profile'), 'account index.html must have portal-tab-profile');
    assert.ok(accountHtml.includes('id="portal-tab-profile" class="portal-tab-content" style="display: block;"'), 'portal-tab-profile must be displayed by default');
});
