const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');

const { config } = require('../config/env');
const { isMasterAdminKey, requireApiKey, extractApiKey } = require('../middleware/apiKeyAuth');

test('Norra Master API Key is correctly recognized by isMasterAdminKey', () => {
    const masterKey = config.NORRA_INTERNAL_API_KEY || 'norra_live_master_internal_access_2026';
    assert.equal(isMasterAdminKey(masterKey), true);
    assert.equal(isMasterAdminKey('norra_master_admin_internal_sync'), true);
    assert.equal(isMasterAdminKey('invalid_key_12345'), false);
    assert.equal(isMasterAdminKey(''), false);
    assert.equal(isMasterAdminKey(null), false);
});

test('extractApiKey extracts API key from header, query, and Bearer token', () => {
    assert.equal(extractApiKey({ headers: { 'x-api-key': 'test_key_123' }, query: {} }), 'test_key_123');
    assert.equal(extractApiKey({ headers: { authorization: 'Bearer norra_key_456' }, query: {} }), 'norra_key_456');
    assert.equal(extractApiKey({ headers: {}, query: { api_key: 'query_key_789' } }), 'query_key_789');
    assert.equal(extractApiKey({ headers: {}, query: {} }), null);
});

test('requireApiKey permits Norra Master API key with unlimited throughput', async () => {
    const app = express();
    app.get('/api/test-master', requireApiKey, (req, res) => {
        res.json({
            ok: true,
            tier: req.apiKey?.plan,
            isAdFree: req.isAdFree
        });
    });

    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;

    try {
        const masterKey = config.NORRA_INTERNAL_API_KEY || 'norra_live_master_internal_access_2026';
        const res = await fetch(`http://127.0.0.1:${port}/api/test-master`, {
            headers: { 'x-api-key': masterKey }
        });

        assert.equal(res.status, 200);
        assert.equal(res.headers.get('x-ratelimit-limit'), 'unlimited');
        assert.equal(res.headers.get('x-ratelimit-remaining'), '999999');

        const body = await res.json();
        assert.equal(body.ok, true);
        assert.equal(body.tier, 'admin');
        assert.equal(body.isAdFree, true);
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
});

test('Pricing plans API endpoint returns synchronized features across all tiers', async () => {
    const initPaymentRoutes = require('../controllers/paymentController');
    const app = express();
    initPaymentRoutes(app);

    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;

    try {
        const res = await fetch(`http://127.0.0.1:${port}/api/plans`);
        assert.equal(res.status, 200);
        const data = await res.json();
        assert.ok(Array.isArray(data.plans));
        assert.equal(data.plans.length, 4);

        const free = data.plans.find(p => p.id === 'free');
        const starter = data.plans.find(p => p.id === 'starter');
        const pro = data.plans.find(p => p.id === 'pro');
        const enterprise = data.plans.find(p => p.id === 'whitelabel' || p.id === 'enterprise');

        assert.ok(free.features.some(f => f.includes('Top 10 world leagues')));
        assert.ok(starter.features.some(f => f.includes('All 100+ world competitions')));
        assert.ok(starter.features.some(f => f.includes('Universal Bet Booking Code Converter')));
        assert.ok(pro.features.some(f => f.includes('Sub-second real-time score updates')));
        assert.ok(enterprise.features.some(f => f.includes('Discord/Telegram VIP channel')));
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
});

test.after(async () => {
    const mongoose = require('../database');
    await mongoose.disconnect();
});

