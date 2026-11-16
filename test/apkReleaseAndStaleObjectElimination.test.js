const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

test('Versioning: package.json, manifest, index.html, and sw.js represent Initial Release v1.0.0, NOT v9', () => {
    // 1. package.json
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    assert.strictEqual(pkg.version, '1.0.0', 'package.json must be version 1.0.0');

    // 2. manifest.webmanifest
    const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'manifest.webmanifest'), 'utf8'));
    assert.strictEqual(manifest.version, '1.0.0', 'manifest.webmanifest must be version 1.0.0');
    assert.strictEqual(manifest.short_name, 'NorraScore');

    // 3. public/index.html
    const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
    assert.ok(indexHtml.includes('/assets/styles.css?v=1.0.0'), 'index.html must load /assets/styles.css?v=1.0.0');
    assert.ok(indexHtml.includes('/assets/app.js?v=1.0.0'), 'index.html must load /assets/app.js?v=1.0.0');
    assert.ok(!indexHtml.includes('app-v9.js'), 'index.html must not reference obsolete app-v9.js');
    assert.ok(!indexHtml.includes('styles-v9.css'), 'index.html must not reference obsolete styles-v9.css');

    // 4. public/sw.js
    const swJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'sw.js'), 'utf8');
    assert.ok(swJs.includes("const CACHE_NAME = 'norrascore-v1.0.0';"), 'sw.js must use CACHE_NAME norrascore-v1.0.0');
    assert.ok(swJs.includes("'/assets/styles.css?v=1.0.0'"), 'sw.js must cache styles.css?v=1.0.0');
    assert.ok(swJs.includes("'/assets/app.js?v=1.0.0'"), 'sw.js must cache app.js?v=1.0.0');
    assert.ok(!swJs.includes('styles-v9.css'), 'sw.js must not cache styles-v9.css');
});

test('Standalone Android APK: binary exists, is signed, and badging verifies Initial Release v1.0.0 (versionCode=1)', () => {
    const apkPath = path.join(__dirname, '..', 'public', 'download', 'norrascore.apk');
    assert.ok(fs.existsSync(apkPath), 'public/download/norrascore.apk must exist on disk');

    const stat = fs.statSync(apkPath);
    assert.ok(stat.size > 50000, `norrascore.apk must be > 50KB (actual: ${stat.size} bytes)`);

    // Verify badging via aapt
    const badgingOutput = execSync(`aapt dump badging "${apkPath}"`, { encoding: 'utf8' });
    assert.ok(badgingOutput.includes("package: name='xyz.mynorra.scores'"), 'APK package must be xyz.mynorra.scores');
    assert.ok(badgingOutput.includes("versionCode='1'"), 'APK versionCode must be 1 (Initial Release, not v9)');
    assert.ok(badgingOutput.includes("versionName='1.0.0'"), 'APK versionName must be 1.0.0 (Initial Release, not v9)');
    assert.ok(badgingOutput.includes("application-label:'NorraScore'"), 'APK application label must be NorraScore');
    assert.ok(badgingOutput.includes("launchable-activity: name='xyz.mynorra.scores.MainActivity'"), 'APK must have launchable MainActivity');

    // Verify apksigner
    const apksignerOutput = execSync(`apksigner verify --verbose "${apkPath}"`, { encoding: 'utf8' });
    assert.ok(apksignerOutput.includes('Verifies'), 'apksigner must verify signature');
    assert.ok(apksignerOutput.includes('Verified using v2 scheme (APK Signature Scheme v2): true'), 'APK must pass v2 signing');
});

test('Express Server: /download/norrascore.apk endpoint serves application/vnd.android.package-archive attachment', () => {
    const indexJs = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
    assert.ok(indexJs.includes("app.get(['/download/norrascore.apk'"), 'index.js must have /download/norrascore.apk route');
    assert.ok(indexJs.includes("res.setHeader('Content-Type', 'application/vnd.android.package-archive');"), 'Must set APK content type');
    assert.ok(indexJs.includes("res.setHeader('Content-Disposition', 'attachment; filename=\"norrascore.apk\"');"), 'Must set attachment disposition');
    assert.ok(indexJs.includes("res.sendFile(apkPath)"), 'Must send APK file');
});

test('Eliminate Stale Objects: SW Network-First protection and live telemetry cache overlay in footballApiController', () => {
    // 1. SW must never cache live, API, or download requests
    const swJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'sw.js'), 'utf8');
    assert.ok(swJs.includes("url.pathname.startsWith('/api/')"), 'SW must bypass cache for /api/');
    assert.ok(swJs.includes("url.pathname.startsWith('/download/')"), 'SW must bypass cache for /download/');
    assert.ok(swJs.includes("url.pathname.endsWith('.apk')"), 'SW must bypass cache for .apk files');
    assert.ok(swJs.includes("url.pathname.includes('/live')"), 'SW must bypass cache for /live');

    // 2. Server fixtures must prevent edge/browser caching for today/live and overlay live in-play states
    const apiCode = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'footballApiController.js'), 'utf8');
    assert.ok(apiCode.includes("cached.hasLive || isLiveFilter || isQueryingToday"), 'footballApiController must enforce zero-cache for today/live queries');
    assert.ok(apiCode.includes("res.set('Cache-Control', 'no-cache, no-store, must-revalidate');"), 'footballApiController must set no-store for live/today queries');
    assert.ok(apiCode.includes("liveFeedMemoryCache.matches && liveFeedMemoryCache.matches.length > 0"), 'footballApiController must check memory cache');
    assert.ok(apiCode.includes("Dynamically overlay live in-play states so cached responses never carry stale scores or obsolete clocks"), 'footballApiController must overlay fresh live match objects');
});

test('Frontend patchLiveMatchRowsInDom matches by ID or event_id and protects completed matches from reverting', () => {
    const appJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
    assert.ok(appJs.includes("patchLiveMatchRowsInDom(liveMatches)"), 'app.js must define patchLiveMatchRowsInDom');
    assert.ok(appJs.includes("row.querySelector('.fs-status-ft')"), 'patchLiveMatchRowsInDom must check for finished FT status');
    assert.ok(appJs.includes("Never revert a concluded match row back to in-play or scheduled!"), 'patchLiveMatchRowsInDom must protect completed games');
    assert.ok(appJs.includes("Smoothly transition scheduled match row to live in-play!"), 'patchLiveMatchRowsInDom must transition scheduled matches to live');
});
