const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');

const {
    PLAN_LIMITS,
    getPlanConfig,
    getAllowedLeaguesForKey,
    assertLeagueAccess,
    hasFeature,
    requireFeature,
    isMasterAdminKey
} = require('../middleware/apiKeyAuth');

test('Norra Master Key recognition', () => {
    assert.equal(isMasterAdminKey('norra_live_master_internal_access_2026'), true);
    assert.equal(isMasterAdminKey('norra_master_admin_internal_sync'), true);
    assert.equal(isMasterAdminKey('random_dev_key_123'), false);
    assert.equal(isMasterAdminKey(null), false);
});

test('Developer Tier Feature Catalog and Norra Internal bypass', () => {
    // 1. Free Tier checks
    const freeKey = { plan: 'free', allowedLeagues: ['eng.1', 'esp.1', 'nga.1'] };
    assert.equal(hasFeature(freeKey, 'liveScores'), true);
    assert.equal(hasFeature(freeKey, 'matchSummary'), true);
    assert.equal(hasFeature(freeKey, 'h2h'), false);
    assert.equal(hasFeature(freeKey, 'predictions'), false);
    assert.equal(hasFeature(freeKey, 'trainingData'), false);
    assert.equal(assertLeagueAccess(freeKey, 'eng.1'), true);
    assert.equal(assertLeagueAccess(freeKey, 'ita.1'), false);

    // 2. Starter Tier checks
    const starterKey = { plan: 'starter' };
    assert.equal(hasFeature(starterKey, 'liveScores'), true);
    assert.equal(hasFeature(starterKey, 'playByPlay'), true);
    assert.equal(hasFeature(starterKey, 'bookingCodes'), true);
    assert.equal(hasFeature(starterKey, 'h2h'), false);
    assert.equal(hasFeature(starterKey, 'predictions'), false);
    assert.equal(assertLeagueAccess(starterKey, 'ita.1'), true);

    // 3. Pro Tier checks
    const proKey = { plan: 'pro' };
    assert.equal(hasFeature(proKey, 'h2h'), true);
    assert.equal(hasFeature(proKey, 'predictions'), true);
    assert.equal(hasFeature(proKey, 'trainingData'), true);
    assert.equal(hasFeature(proKey, 'lineups'), true);
    assert.equal(hasFeature(proKey, 'webhooks'), false);

    // 4. Enterprise / Whitelabel checks
    const entKey = { plan: 'enterprise' };
    assert.equal(hasFeature(entKey, 'predictions'), true);
    assert.equal(hasFeature(entKey, 'trainingData'), true);
    assert.equal(hasFeature(entKey, 'webhooks'), true);
    assert.equal(hasFeature(entKey, 'customDomain'), true);

    // 5. Norra AI Internal Master Key checks: 100% bypass across all features & leagues
    const norraMasterKey = { plan: 'internal', _id: 'norra_master_internal_key' };
    assert.equal(hasFeature(norraMasterKey, 'any_future_feature_xyz'), true);
    assert.equal(hasFeature(norraMasterKey, 'predictions'), true);
    assert.equal(hasFeature(norraMasterKey, 'trainingData'), true);
    assert.equal(assertLeagueAccess(norraMasterKey, 'any_obscure_league'), true);
});

test('requireFeature enforces tier gates with structured upgrade payload', () => {
    const freeReq = { apiKey: { plan: 'free' } };
    let statusSent = null;
    let bodySent = null;
    const mockRes = {
        status(code) { statusSent = code; return this; },
        json(data) { bodySent = data; return this; }
    };

    const allowed = requireFeature(freeReq, mockRes, 'predictions', 'AI Predictions');
    assert.equal(allowed, false);
    assert.equal(statusSent, 403);
    assert.equal(bodySent.feature, 'predictions');
    assert.equal(bodySent.plan, 'free');

    // Norra Internal always passes
    const norraReq = { apiKey: { plan: 'internal' } };
    const norraAllowed = requireFeature(norraReq, mockRes, 'predictions', 'AI Predictions');
    assert.equal(norraAllowed, true);
});

test('Regenerated Whitelabel Key for Norra AI grants full access, streaming, and unlimited bypass', () => {
    const regeneratedWhitelabelKey = {
        name: 'Norra AI Prediction Model',
        email: 'predictor@mynorra.xyz',
        plan: 'whitelabel',
        rateLimitPerMinute: 0,
        allowedLeagues: null
    };

    assert.equal(hasFeature(regeneratedWhitelabelKey, 'trainingData'), true);
    assert.equal(hasFeature(regeneratedWhitelabelKey, 'predictions'), true);
    assert.equal(hasFeature(regeneratedWhitelabelKey, 'h2h'), true);
    assert.equal(hasFeature(regeneratedWhitelabelKey, 'webhooks'), true);
    assert.equal(hasFeature(regeneratedWhitelabelKey, 'customDomain'), true);
    assert.equal(assertLeagueAccess(regeneratedWhitelabelKey, 'kor.1'), true);
    assert.equal(assertLeagueAccess(regeneratedWhitelabelKey, 'chn.1'), true);
    assert.equal(assertLeagueAccess(regeneratedWhitelabelKey, 'arg.1'), true);
    assert.equal(assertLeagueAccess(regeneratedWhitelabelKey, 'col.1'), true);

    const mockRes = {
        status() { return this; },
        json() { return this; }
    };
    assert.equal(requireFeature({ apiKey: regeneratedWhitelabelKey }, mockRes, 'trainingData'), true);
    assert.equal(requireFeature({ apiKey: regeneratedWhitelabelKey }, mockRes, 'predictions'), true);
});

test('Starter or Free user naming their key Norra is strictly blocked from Pro/Whitelabel features', () => {
    const starterUserSpoofedKey = {
        name: 'Norra AI Prediction Model',
        email: 'user-with-norra-in-email@gmail.com',
        plan: 'starter',
        rateLimitPerMinute: 500,
        allowedLeagues: null
    };

    assert.equal(hasFeature(starterUserSpoofedKey, 'predictions'), false);
    assert.equal(hasFeature(starterUserSpoofedKey, 'h2h'), false);
    assert.equal(hasFeature(starterUserSpoofedKey, 'trainingData'), false);

    let statusSent = null;
    const mockRes = {
        status(code) { statusSent = code; return this; },
        json() { return this; }
    };

    const allowed = requireFeature({ apiKey: starterUserSpoofedKey }, mockRes, 'predictions');
    assert.equal(allowed, false);
    assert.equal(statusSent, 403);
});

test('Training Dataset endpoint serves rich ML feature vectors', async () => {
    const initFootballApi = require('../controllers/footballApiController');
    const app = express();
    initFootballApi(app);

    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;

    try {
        const res = await fetch(`http://127.0.0.1:${port}/api/v1/football/training-data?limit=10`);
        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.status, 'success');
        assert.ok(data.meta);
        assert.equal(data.meta.tier, 'public_free');
        assert.ok(Array.isArray(data.samples));
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
});

test.after(() => {
    const mongoose = require('mongoose');
    try { mongoose.disconnect().catch(() => {}); } catch {}
    process.exit(0);
});
