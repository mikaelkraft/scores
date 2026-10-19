const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');

const emailService = require('../services/emailService');
const googleAuthService = require('../services/googleAuthService');
const User = require('../models/user');
const ApiKey = require('../models/apiKey');

test('Email Service generates verification link and formats HTML', async () => {
    const result = await emailService.sendVerificationEmail({
        email: 'developer@mynorra.xyz',
        name: 'Norra Dev',
        token: 'test_verify_token_123',
        siteUrl: 'https://scores.mynorra.xyz'
    });

    assert.equal(result.success, true);
    assert.ok(result.verifyLink);
    assert.match(result.verifyLink, /verify_token=test_verify_token_123/);
});

test('Google Auth Service rejects empty or invalid ID tokens', async () => {
    await assert.rejects(
        () => googleAuthService.verifyIdToken(''),
        /Valid Google ID token is required/i
    );

    await assert.rejects(
        () => googleAuthService.verifyIdToken(null),
        /Valid Google ID token is required/i
    );
});

test('User Model supports googleId, avatarUrl, and email verification status', () => {
    const user = new User({
        email: 'googleuser@mynorra.xyz',
        fullName: 'Google User',
        googleId: 'google_sub_998877',
        avatarUrl: 'https://lh3.googleusercontent.com/avatar.jpg',
        authProvider: 'google',
        isEmailVerified: true
    });

    assert.equal(user.email, 'googleuser@mynorra.xyz');
    assert.equal(user.googleId, 'google_sub_998877');
    assert.equal(user.authProvider, 'google');
    assert.equal(user.isEmailVerified, true);
    assert.equal(user.passwordHash, undefined);
});

test('User verifyPassword safely returns false when passwordHash is undefined', async () => {
    const googleUser = new User({
        email: 'social@mynorra.xyz',
        authProvider: 'google'
    });

    const isValid = await googleUser.verifyPassword('anyPassword');
    assert.equal(isValid, false);
});

test('Account registration generates verification token and sets isEmailVerified to false', () => {
    const verificationToken = 'random_hex_token_abc123';
    const expires = new Date(Date.now() + 24 * 3600 * 1000);

    const user = new User({
        email: 'standard@mynorra.xyz',
        passwordHash: 'dummy_hash',
        isEmailVerified: false,
        emailVerificationToken: verificationToken,
        emailVerificationExpires: expires
    });

    assert.equal(user.isEmailVerified, false);
    assert.equal(user.emailVerificationToken, 'random_hex_token_abc123');
    assert.ok(user.emailVerificationExpires > new Date());
});

test('Auth config endpoint returns Google Client ID availability', async () => {
    const app = express();
    app.use(express.json());
    require('../controllers/accountController')(app);

    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;

    try {
        const res = await fetch(`http://127.0.0.1:${port}/api/account/auth-config`);
        assert.equal(res.status, 200);
        const data = await res.json();
        assert.ok('googleAuthEnabled' in data);
        assert.ok('googleClientId' in data);
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
});

test('Registration endpoint rejects short passwords (< 6 chars)', async () => {
    const app = express();
    app.use(express.json());
    require('../controllers/accountController')(app);

    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;

    try {
        const res = await fetch(`http://127.0.0.1:${port}/api/account/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'short@test.com', password: '123' })
        });
        assert.equal(res.status, 400);
        const data = await res.json();
        assert.match(data.error, /at least 6 characters/i);
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
});

test('Google auth endpoint rejects empty credentials', async () => {
    const app = express();
    app.use(express.json());
    require('../controllers/accountController')(app);

    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;

    try {
        const res = await fetch(`http://127.0.0.1:${port}/api/account/google`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        assert.equal(res.status, 400);
        const data = await res.json();
        assert.match(data.error, /Google authentication credential is required/i);
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
});
