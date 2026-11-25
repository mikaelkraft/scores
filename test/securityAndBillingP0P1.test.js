'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');

const { config } = require('../config/env');
const { requireAdmin, generateToken } = require('../middleware/auth');
const { isMasterAdminKey, PLAN_LIMITS } = require('../middleware/apiKeyAuth');
const flutterwaveService = require('../services/flutterwaveService');
const paypalService = require('../services/paypalService');
const footballApiController = require('../controllers/footballApiController');

const ROOT = path.join(__dirname, '..');

function makeMockRes() {
    const res = {
        statusCode: 200,
        headers: {},
        body: null,
        set(k, v) { this.headers[String(k).toLowerCase()] = v; return this; },
        setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; return this; },
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.body = payload; return this; },
        send(payload) { this.body = payload; return this; }
    };
    return res;
}

test.after(async () => {
    try {
        await mongoose.disconnect();
    } catch (_) {}
});

test('P0-1: requireAdmin rejects non-admin JWT even when username matches ADMIN_USERNAME', async () => {
    const spoofedToken = generateToken({
        _id: '000000000000000000000001',
        email: 'attacker@example.com',
        username: config.ADMIN_USERNAME || 'admin',
        role: 'user'
    });
    const req = { headers: { authorization: `Bearer ${spoofedToken}` } };
    const res = makeMockRes();
    let nextCalled = false;

    await requireAdmin(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
});

test('P0-1: requireAdmin accepts JWT with role === admin', async () => {
    const adminToken = generateToken({
        _id: '000000000000000000000002',
        email: 'admin@mynorra.xyz',
        username: 'ops',
        role: 'admin'
    });
    const req = { headers: { authorization: `Bearer ${adminToken}` } };
    const res = makeMockRes();
    let nextCalled = false;

    await requireAdmin(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, true);
    assert.equal(res.statusCode, 200);
});

test('P0-2: isMasterAdminKey disables hardcoded fallback keys in production', () => {
    const origIsProd = config.isProd;
    const origMaster = process.env.NORRA_INTERNAL_API_KEY;
    const origCron = process.env.CRON_SECRET;
    try {
        config.isProd = true;
        delete process.env.NORRA_INTERNAL_API_KEY;
        delete process.env.CRON_SECRET;

        assert.equal(isMasterAdminKey('norra_live_master_internal_access_2026'), false);
        assert.equal(isMasterAdminKey('norra_master_admin_internal_sync'), false);
        assert.equal(isMasterAdminKey('norra_cron_secret_token_2026'), false);

        process.env.NORRA_INTERNAL_API_KEY = 'prod_real_secret_key_999';
        assert.equal(isMasterAdminKey('prod_real_secret_key_999'), true);
    } finally {
        config.isProd = origIsProd;
        if (origMaster === undefined) delete process.env.NORRA_INTERNAL_API_KEY;
        else process.env.NORRA_INTERNAL_API_KEY = origMaster;
        if (origCron === undefined) delete process.env.CRON_SECRET;
        else process.env.CRON_SECRET = origCron;
    }
});

test('P0-2 & P1-2: accountController enforces strict role === admin, raster-only avatars, same-origin postMessage, and canonical PLAN_LIMITS', () => {
    const src = fs.readFileSync(path.join(ROOT, 'controllers', 'accountController.js'), 'utf8');

    // No email substring admin elevation
    assert.equal(src.includes("includes('norra')"), false);
    assert.equal(src.includes("includes('admin')"), false);

    // Canonical PLAN_LIMITS imported, no drifted local map
    assert.match(src, /require\(['"]\.\.\/middleware\/apiKeyAuth['"]\)/);
    assert.equal(src.includes('rateLimit: 2500'), false);

    // Raster-only avatar filter (blocks svg/html)
    assert.equal(src.includes('svg+xml'), false);
    assert.match(src, /mimeValid && extValid/);

    // Same-origin postMessage (no '*')
    assert.equal(src.includes("postMessage({ type: 'NORRA_GOOGLE_AUTH', token }, '*')"), false);
    assert.match(src, /window\.location\.origin/);
});

test('P0-3: flutterwaveService mock redirect URL has single query string and rejects mock_flw_* when live key is active', async () => {
    const origSecret = flutterwaveService.secretKey;
    try {
        flutterwaveService.secretKey = '';
        const initRes = await flutterwaveService.initializePayment({
            tx_ref: 'NORRA-TEST-123',
            amount: 29,
            currency: 'USD',
            customer: { email: 'dev@example.com' },
            redirect_url: 'https://scores.mynorra.xyz/pricing?gateway=flutterwave&tx_ref=NORRA-TEST-123'
        });
        assert.equal(initRes.status, 'success');
        const link = initRes.data?.link || '';
        const questionMarks = (link.match(/\?/g) || []).length;
        assert.equal(questionMarks, 1, `Expected 1 '?' in redirect URL, got: ${link}`);

        // Now simulate live credentials configured: mock_flw_* MUST be rejected
        flutterwaveService.secretKey = 'FLW' + 'SECK-live-test-key';
        await assert.rejects(
            () => flutterwaveService.verifyTransaction('mock_flw_12345'),
            /Mock transaction references are rejected/i
        );
    } finally {
        flutterwaveService.secretKey = origSecret;
    }
});

test('P0-3: paypalService rejects mock_pp_order_* when live credentials are active', async () => {
    const origId = paypalService.clientId;
    const origSecret = paypalService.clientSecret;
    try {
        paypalService.clientId = 'live-client-id';
        paypalService.clientSecret = 'live-client-secret';
        await assert.rejects(
            () => paypalService.captureOrder('mock_pp_order_999'),
            /Mock PayPal order IDs are rejected/i
        );
    } finally {
        paypalService.clientId = origId;
        paypalService.clientSecret = origSecret;
    }
});

test('P0-3 & P1-1: paymentController locks USD currency, verifies amount/tx_ref, evicts keyCache, and exposes signed Flutterwave webhook', () => {
    const src = fs.readFileSync(path.join(ROOT, 'controllers', 'paymentController.js'), 'utf8');

    // provisionPaidKey uses rateLimitPerMinute, clears allowedLeagues, evicts keyCache
    assert.match(src, /limits\.rateLimitPerMinute/);
    assert.match(src, /allowedLeagues:\s*\[\]/);
    assert.match(src, /keyCache\.delete\(/);

    // Currency locked to USD (no client-controlled currency arbitrage)
    assert.equal(src.includes("currency = 'USD' } = req.body"), false);
    assert.match(src, /const currency = 'USD'/);

    // Signed Flutterwave webhook route present
    assert.match(src, /\/api\/payments\/flutterwave\/webhook/);
    assert.match(src, /verif-hash/);
});

test('P0-4: SSRF protection blocks private/metadata hosts and disallowed crest hosts', async () => {
    const { isPrivateOrLoopbackHost, isAllowedCrestUrl, handleCrestProxy } = footballApiController;

    const blockedHosts = [
        'localhost', '127.0.0.1', '127.1.2.3', '0.0.0.0', '::1',
        '169.254.169.254', '10.0.0.1', '192.168.1.50',
        '172.16.0.1', '172.31.255.254', '100.64.0.1',
        'fc00::1', 'fe80::1', '::ffff:127.0.0.1',
        'metadata.google.internal', 'printer.local'
    ];
    for (const h of blockedHosts) {
        assert.equal(isPrivateOrLoopbackHost(h), true, `Expected ${h} to be blocked`);
    }
    assert.equal(isPrivateOrLoopbackHost('a.espncdn.com'), false);
    assert.equal(isPrivateOrLoopbackHost('hooks.example.com'), false);

    // Crest URL allowlist
    assert.equal(isAllowedCrestUrl('https://a.espncdn.com/i/teamlogos/soccer/500/359.png'), true);
    assert.equal(isAllowedCrestUrl('https://lsm-static-prod.livescore.com/medium/enet/9825.png'), true);
    assert.equal(isAllowedCrestUrl('https://flagcdn.com/w40/gb.png'), true);

    assert.equal(isAllowedCrestUrl('http://169.254.169.254/latest/meta-data/'), false);
    assert.equal(isAllowedCrestUrl('http://127.0.0.1:27017/'), false);
    assert.equal(isAllowedCrestUrl('https://evil.example.com/payload.svg'), false);
    assert.equal(isAllowedCrestUrl('file:///etc/passwd'), false);

    // Handler rejects SSRF with 403 immediately
    const req = { query: { url: 'http://169.254.169.254/latest/meta-data/' } };
    const res = makeMockRes();
    await handleCrestProxy(req, res);
    assert.equal(res.statusCode, 403);
});

test('P0-5 & P1-3/P1-4: admin regex escaping, CORS headers, /uploads sandbox, favicon model, and APK route order', () => {
    const adminSrc = fs.readFileSync(path.join(ROOT, 'controllers', 'adminController.js'), 'utf8');
    assert.equal(adminSrc.includes('const escaped = search.replace('), true);

    const indexSrc = fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8');

    // CORS supports POST & x-api-key / Authorization
    assert.match(indexSrc, /methods:\s*\[[^\]]*'POST'[^\]]*\]/);
    assert.match(indexSrc, /allowedHeaders:\s*\[[^\]]*'x-api-key'[^\]]*\]/);
    assert.match(indexSrc, /allowedHeaders:\s*\[[^\]]*'Authorization'[^\]]*\]/);

    // /uploads hardened with nosniff + sandbox CSP
    assert.match(indexSrc, /X-Content-Type-Options',\s*'nosniff'/);
    assert.match(indexSrc, /default-src 'none'; sandbox/);

    // resolveCustomFavicon uses singular ./models/siteSetting and top-level faviconUrl
    assert.equal(indexSrc.includes("require('./models/siteSettings')"), false);
    assert.equal(indexSrc.includes('branding.faviconUrl'), false);
    assert.match(indexSrc, /select\('faviconUrl headerLogoUrl'\)/);

    // Dynamic APK route mounted BEFORE static /download
    const apkRouteIdx = indexSrc.indexOf("app.get(['/download/norrascore.apk'");
    const staticDownloadIdx = indexSrc.indexOf("app.use('/download', express.static");
    assert.ok(apkRouteIdx > 0 && staticDownloadIdx > 0, 'Both APK route and static /download should exist');
    assert.ok(apkRouteIdx < staticDownloadIdx, 'Dynamic /download/norrascore.apk route must be mounted before express.static(/download)');
});

test('P1-2: canonical PLAN_LIMITS retains expected commercial tier rate limits', () => {
    assert.equal(PLAN_LIMITS.free.rateLimitPerMinute, 120);
    assert.equal(PLAN_LIMITS.starter.rateLimitPerMinute, 500);
    assert.equal(PLAN_LIMITS.pro.rateLimitPerMinute, 1500);
    assert.equal(PLAN_LIMITS.whitelabel.rateLimitPerMinute, 5000);
});
