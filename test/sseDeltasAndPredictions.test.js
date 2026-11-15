const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('ProxyManager correctly manages proxy rotation and error tracking', () => {
    const proxyManager = require('../services/proxyManager');
    
    // Test dynamic setting
    proxyManager.setProxies([
        'http://user:pass@proxy1.example.com:8080',
        'http://user:pass@proxy2.example.com:8080'
    ]);

    assert.equal(proxyManager.hasProxies(), true);
    const p1 = proxyManager.getNextProxy();
    const p2 = proxyManager.getNextProxy();
    const p3 = proxyManager.getNextProxy();

    assert.ok(p1.includes('proxy1') || p1.includes('proxy2'));
    assert.ok(p2.includes('proxy1') || p2.includes('proxy2'));
    assert.equal(p1, p3, 'Round-robin must cycle back to the first proxy');

    // Test error tracking and banning
    proxyManager.recordFailure(p1);
    proxyManager.recordFailure(p1);
    proxyManager.recordFailure(p1);
    proxyManager.recordFailure(p1);
    proxyManager.recordFailure(p1);

    const stats = proxyManager.getStats();
    assert.equal(stats.totalProxies, 2);
    const banned = stats.pool.find(p => p.proxy.includes('proxy1.example.com'));
    assert.ok(banned);
    assert.equal(banned.isBanned, true, 'Proxy must be banned after 5 consecutive failures');

    // Next proxy should now skip the banned proxy
    const active = proxyManager.getNextProxy();
    assert.ok(active.includes('proxy2'), 'Next proxy must skip banned proxy');
});

test('footballApiController live stream emits lightweight deltas and enriched prediction hints', () => {
    const apiSrc = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'footballApiController.js'), 'utf8');

    // 1. SSE Stream Delta Verification
    assert.ok(apiSrc.includes("deltas: updates"), 'live/stream must emit deltas array');
    assert.ok(apiSrc.includes("homeScore: curHomeScore"), 'Delta payload must include homeScore');
    assert.ok(apiSrc.includes("awayScore: curAwayScore"), 'Delta payload must include awayScore');
    assert.ok(apiSrc.includes("isGoal,"), 'Delta payload must include isGoal flag');
    assert.ok(apiSrc.includes("scoringTeam,"), 'Delta payload must include scoringTeam');

    // 2. Prediction Context Verification
    assert.ok(apiSrc.includes("bttsRecommendation:"), 'predictions-context must calculate bttsRecommendation');
    assert.ok(apiSrc.includes("bttsProbability:"), 'predictions-context must calculate bttsProbability');
    assert.ok(apiSrc.includes("over25Probability:"), 'predictions-context must calculate over25Probability');
    assert.ok(apiSrc.includes("under25Probability:"), 'predictions-context must calculate under25Probability');
    assert.ok(apiSrc.includes("doubleChance:"), 'predictions-context must calculate doubleChance');
    assert.ok(apiSrc.includes("firstTeamToScore:"), 'predictions-context must calculate firstTeamToScore');
    assert.ok(apiSrc.includes("confidenceRating:"), 'predictions-context must calculate confidenceRating');
    assert.ok(!apiSrc.includes("GG/NG"), 'API code must not use GG/NG shorthand');
});

test('frontend app-v9.js handles SSE deltas, battery visibility saver, and instant live filtering', () => {
    const appV9Src = fs.readFileSync(path.join(__dirname, '..', 'public', 'app-v9.js'), 'utf8');

    // 1. Ingest deltas in applyRealtimeMatchUpdate
    assert.ok(appV9Src.includes("(update.homeScore !== undefined) ? update.homeScore"), 'applyRealtimeMatchUpdate must handle flat delta homeScore');
    assert.ok(appV9Src.includes("(update.awayScore !== undefined) ? update.awayScore"), 'applyRealtimeMatchUpdate must handle flat delta awayScore');
    assert.ok(appV9Src.includes("goalDetected"), 'applyRealtimeMatchUpdate must detect goals and trigger audio chime');

    // 2. Mobile battery & data saver
    assert.ok(appV9Src.includes("document.addEventListener('visibilitychange'"), 'app-v9.js must listen for visibilitychange');
    assert.ok(appV9Src.includes("if (document.hidden)"), 'app-v9.js must pause or close SSE when tab is backgrounded');

    // 3. Sub-second Instant Live Filtering
    assert.ok(appV9Src.includes("instantLive"), 'selectLiveMatches must check for instantLive in memory');
    assert.ok(appV9Src.includes("state.liveMatchesCache"), 'app-v9.js must maintain state.liveMatchesCache');

    // 4. Modern Betting Markets in Predictions Tab (Replacing GG/NG)
    assert.ok(appV9Src.includes("Match Winner (1X2 Probabilities)"), 'Predictions tab must show 1X2 Probabilities');
    assert.ok(appV9Src.includes("Double Chance Probabilities"), 'Predictions tab must show Double Chance');
    assert.ok(appV9Src.includes("Both Teams To Score (BTTS)"), 'Predictions tab must show Both Teams To Score (BTTS)');
    assert.ok(appV9Src.includes("First Team to Score"), 'Predictions tab must show First Team to Score');
    assert.ok(!appV9Src.includes("GG/NG"), 'Predictions tab must never display GG/NG');
});

test('public/index.html includes FAQ section, app download link, and pricing tiers', () => {
    const indexSrc = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

    assert.ok(indexSrc.includes('id="faq-section"'), 'index.html must have faq-section');
    assert.ok(indexSrc.includes('What are the API rate limits and quotas for each tier?'), 'FAQ must document tier rate limits');
    assert.ok(indexSrc.includes('How does Norra AI ingest live scores'), 'FAQ must document Norra AI ingestion');
    assert.ok(indexSrc.includes('Universal Bet Booking Code Converter'), 'FAQ must document booking converter');
    assert.ok(indexSrc.includes('id="footer-link-download"'), 'index.html must have footer download link');
});

test('public/docs/index.html includes Rate Limits section and all football endpoints', () => {
    const docsSrc = fs.readFileSync(path.join(__dirname, '..', 'public', 'docs', 'index.html'), 'utf8');

    assert.ok(docsSrc.includes('id="rate-limits"'), 'docs/index.html must include rate-limits section');
    assert.ok(docsSrc.includes('id="ep-stream"'), 'docs/index.html must document SSE stream endpoint');
    assert.ok(docsSrc.includes('id="ep-leaders"'), 'docs/index.html must document league leaders endpoint');
    assert.ok(docsSrc.includes('id="ep-bracket"'), 'docs/index.html must document tournament bracket endpoint');
    assert.ok(docsSrc.includes('id="ep-h2h"'), 'docs/index.html must document predictions and H2H endpoint');
    assert.ok(docsSrc.includes('id="ep-teams"'), 'docs/index.html must document club hub endpoint');
});
