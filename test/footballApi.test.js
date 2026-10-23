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

test('Training data endpoint returns normalized ML samples with feature engineering', async () => {
    const initFootballApi = require('../controllers/footballApiController');
    const app = express();
    initFootballApi(app);

    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;

    try {
        const res = await fetch(`http://127.0.0.1:${port}/api/v1/football/training-data?limit=5`);
        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.status, 'success');
        assert.ok(data.meta);
        assert.ok(Array.isArray(data.samples));

        if (data.samples.length > 0) {
            const sample = data.samples[0];
            assert.ok(sample.eventId);
            assert.ok(sample.homeTeam);
            assert.ok(sample.awayTeam);
            assert.ok(sample.outcome);
            assert.ok(sample.features);
            assert.equal(typeof sample.features.possessionPctHome, 'number');
            assert.equal(typeof sample.features.expectedGoalsHome, 'number');
            assert.equal(typeof sample.features.expectedGoalsAway, 'number');
        }
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
});

test('Training data endpoint streams JSONL formatted samples', async () => {
    const initFootballApi = require('../controllers/footballApiController');
    const app = express();
    initFootballApi(app);

    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;

    try {
        const res = await fetch(`http://127.0.0.1:${port}/api/v1/football/training-data?limit=3&format=jsonl`);
        assert.equal(res.status, 200);
        assert.ok(res.headers.get('content-type').includes('ndjson'));
        const text = await res.text();
        if (text.trim().length > 0) {
            const lines = text.trim().split('\n');
            assert.ok(lines.length >= 1);
            const firstParsed = JSON.parse(lines[0]);
            assert.ok(firstParsed.eventId);
            assert.ok(firstParsed.features);
        }
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
});

test('syncInGameStats executes safely and returns batch processing summary', async () => {
    const { syncInGameStats } = require('../services/soccerSyncService');
    const result = await syncInGameStats({ limit: 2, onlyLive: false });
    assert.ok(result);
    assert.equal(typeof result.totalChecked, 'number');
    assert.equal(typeof result.statsUpdated, 'number');
    assert.equal(typeof result.eventsInserted, 'number');
    assert.equal(typeof result.leaguesCovered, 'number');
});

test.after(async () => {
    const mongoose = require('../database');
    await mongoose.disconnect();
});

