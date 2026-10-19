const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');

const bookingHookService = require('../services/bookingHookService');
const flutterwaveService = require('../services/flutterwaveService');
const paypalService = require('../services/paypalService');
const { requireApiKey } = require('../middleware/apiKeyAuth');
const { generateToken, verifyToken } = require('../middleware/auth');

test('Booking Hook Service returns supported bookmaker providers', () => {
    const bookmakers = bookingHookService.getSupportedBookmakers();
    assert.ok(Array.isArray(bookmakers));
    const ids = bookmakers.map(b => b.id);
    assert.ok(ids.includes('sportybet'));
    assert.ok(ids.includes('bet9ja'));
    assert.ok(ids.includes('msport'));
});

test('Booking Hook Service registers booking code for selections', async () => {
    const result = await bookingHookService.generateBookingCode({
        bookmaker: 'sportybet',
        selections: [
            { matchId: '101', market: '1X2', pick: '1', odds: 1.85 },
            { matchId: '102', market: 'Over/Under 2.5', pick: 'Over', odds: 1.65 }
        ]
    });

    assert.equal(result.status, 'hook_registered');
    assert.equal(result.bookmaker, 'sportybet');
    assert.equal(result.totalSelections, 2);
    assert.equal(result.hookEnabled, true);
});

test('Booking Hook Service converts booking code between bookmakers', async () => {
    const conversion = await bookingHookService.convertBookingCode({
        sourceCode: 'SB-998877',
        fromBookmaker: 'sportybet',
        toBookmaker: 'bet9ja'
    });

    assert.equal(conversion.status, 'hook_registered');
    assert.equal(conversion.sourceCode, 'SB-998877');
    assert.equal(conversion.from, 'sportybet');
    assert.equal(conversion.to, 'bet9ja');
});

test('Flutterwave Service initiates mock checkout when live credentials not set', async () => {
    const payment = await flutterwaveService.initializePayment({
        tx_ref: 'tx_norra_test_123',
        amount: 29,
        currency: 'USD',
        customer: { email: 'dev@mynorra.xyz', name: 'Norra Dev' },
        redirect_url: 'https://scores.mynorra.xyz/account',
        meta: { plan: 'starter' }
    });

    assert.equal(payment.status, 'success');
    assert.ok(payment.data?.link);
    assert.match(payment.data.link, /mock_flw_/);
});

test('PayPal Service creates mock order when live credentials not set', async () => {
    const order = await paypalService.createOrder({
        amount: 79,
        currency: 'USD',
        description: 'Norra AI Pro Plan'
    });

    assert.equal(order.status, 'CREATED');
    assert.ok(order.id);
    assert.equal(order.mock, true);
});

test('JWT Auth generates and verifies tokens', () => {
    const token = generateToken({ id: 'user_123', email: 'dev@mynorra.xyz', role: 'developer' });
    assert.ok(typeof token === 'string');

    const decoded = verifyToken(token);
    assert.equal(decoded.id, 'user_123');
    assert.equal(decoded.email, 'dev@mynorra.xyz');
    assert.equal(decoded.role, 'developer');
});

test('API Key Middleware rejects requests without an API key', async () => {
    const app = express();
    app.get('/protected', requireApiKey, (req, res) => res.json({ ok: true }));

    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;

    try {
        const res = await fetch(`http://127.0.0.1:${port}/protected`);
        assert.equal(res.status, 401);
        const data = await res.json();
        assert.match(data.error, /API key required/i);
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
});

test.after(async () => {
    const mongoose = require('../database');
    await mongoose.disconnect();
});
