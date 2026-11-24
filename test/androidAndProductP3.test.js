'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');

const User = require('../models/user');
const { specs } = require('../swagger');

const ROOT = path.join(__dirname, '..');

test.after(async () => {
    try {
        await mongoose.disconnect();
    } catch (_) {}
});

test('P3-1: MainActivity.java enforces exact host matching, no mixed content, offline fallback, and WebView lifecycle hooks', () => {
    const javaSrc = fs.readFileSync(
        path.join(ROOT, 'android', 'src', 'xyz', 'mynorra', 'scores', 'MainActivity.java'),
        'utf8'
    );

    assert.equal(javaSrc.includes('host.contains("mynorra.xyz")'), false, 'Must not use loose substring host matching');
    assert.match(javaSrc, /isAllowedAppHost/);
    assert.match(javaSrc, /h\.equals\("mynorra\.xyz"\)/);
    assert.match(javaSrc, /h\.endsWith\("\.mynorra\.xyz"\)/);
    assert.match(javaSrc, /MIXED_CONTENT_NEVER_ALLOW/);
    assert.equal(javaSrc.includes('MIXED_CONTENT_ALWAYS_ALLOW'), false);
    assert.match(javaSrc, /onReceivedError/);
    assert.match(javaSrc, /showOfflineFallback/);
    assert.match(javaSrc, /protected void onPause\(/);
    assert.match(javaSrc, /protected void onResume\(/);
    assert.match(javaSrc, /protected void onDestroy\(/);
});

test('P3-1: AndroidManifest.xml disables cleartext traffic and preserves v1.0.0; build-apk.sh supports env signing secrets', () => {
    const manifest = fs.readFileSync(path.join(ROOT, 'android', 'AndroidManifest.xml'), 'utf8');
    assert.match(manifest, /android:usesCleartextTraffic="false"/);
    assert.match(manifest, /android:versionCode="1"/);
    assert.match(manifest, /android:versionName="1\.0\.0"/);

    const buildScript = fs.readFileSync(path.join(ROOT, 'scripts', 'build-apk.sh'), 'utf8');
    assert.match(buildScript, /ANDROID_KEYSTORE_PASS/);
    assert.match(buildScript, /ANDROID_KEY_PASS/);
});

test('P3-2: User schema supports password reset tokens, cross-device favorites, and enterprise tier', () => {
    const paths = User.schema.paths;
    assert.ok(paths.passwordResetToken, 'User schema must include passwordResetToken');
    assert.ok(paths.passwordResetExpires, 'User schema must include passwordResetExpires');
    assert.ok(paths.favoriteTeams, 'User schema must include favoriteTeams');
    assert.ok(paths.favoriteLeagues, 'User schema must include favoriteLeagues');
    assert.ok(paths.favoriteMatches, 'User schema must include favoriteMatches');

    const planEnum = paths.plan.enumValues || [];
    assert.ok(planEnum.includes('enterprise'), 'User plan enum must include enterprise');
});

test('P3-2: accountController exposes forgot-password, reset-password, and favorites endpoints', () => {
    const src = fs.readFileSync(path.join(ROOT, 'controllers', 'accountController.js'), 'utf8');
    assert.match(src, /router\.post\('\/api\/account\/forgot-password'/);
    assert.match(src, /router\.post\('\/api\/account\/reset-password'/);
    assert.match(src, /router\.get\('\/api\/account\/favorites'/);
    assert.match(src, /router\.put\('\/api\/account\/favorites'/);
    assert.match(src, /createHash\('sha256'\)/);
});

test('P3-3: OpenAPI specification documents commercial Football, Booking, Payments, and Account endpoints', () => {
    assert.ok(specs && specs.paths, 'OpenAPI specs.paths should be defined');
    assert.ok(specs.components?.securitySchemes?.ApiKeyAuth, 'ApiKeyAuth security scheme should exist');
    assert.ok(specs.components?.securitySchemes?.BearerAuth, 'BearerAuth security scheme should exist');

    const requiredPaths = [
        '/api/v1/football/live',
        '/api/v1/football/live/stream',
        '/api/v1/football/fixtures',
        '/api/v1/football/standings',
        '/api/v1/football/match/{eventId}/predictions-context',
        '/api/v1/booking/convert',
        '/api/payments/flutterwave/webhook',
        '/api/account/forgot-password',
        '/api/account/reset-password',
        '/api/account/favorites'
    ];
    for (const p of requiredPaths) {
        assert.ok(specs.paths[p], `OpenAPI spec should document ${p}`);
    }
});
