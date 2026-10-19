const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/user');
const ApiKey = require('../models/apiKey');
const Transaction = require('../models/transaction');
const { requireUser, JWT_SECRET } = require('../middleware/auth');
const { config } = require('../config/env');

/**
 * POST /api/account/register
 */
router.post('/api/account/register', async (req, res) => {
    try {
        const { email, password, fullName, companyName } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required.' });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters.' });
        }

        const existing = await User.findOne({ email: email.toLowerCase().trim() });
        if (existing) {
            return res.status(400).json({ error: 'An account with this email already exists.' });
        }

        const passwordHash = await User.hashPassword(password);
        const user = await User.create({
            email: email.toLowerCase().trim(),
            passwordHash,
            fullName: fullName || '',
            companyName: companyName || '',
            plan: 'free'
        });

        // Automatically issue an initial free API key
        const keyString = ApiKey.generateKey();
        const apiKey = await ApiKey.create({
            key: keyString,
            user: user._id,
            name: `${user.companyName || user.fullName || 'Default'} Free Key`,
            email: user.email,
            plan: 'free',
            rateLimitPerMinute: 120,
            isAdFree: false
        });

        const token = jwt.sign(
            { userId: user._id, email: user.email, role: user.role },
            JWT_SECRET,
            { expiresIn: '30d' }
        );

        return res.status(201).json({
            status: 'success',
            token,
            user: {
                id: user._id,
                email: user.email,
                fullName: user.fullName,
                plan: user.plan
            },
            apiKey: apiKey.key
        });
    } catch (err) {
        console.error('Account register error:', err.message);
        return res.status(500).json({ error: 'Registration failed. Please try again.' });
    }
});

/**
 * POST /api/account/login
 */
router.post('/api/account/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required.' });
        }

        const user = await User.findOne({ email: email.toLowerCase().trim() });
        if (!user || !user.active) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        const isValid = await user.verifyPassword(password);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        const token = jwt.sign(
            { userId: user._id, email: user.email, role: user.role },
            JWT_SECRET,
            { expiresIn: '30d' }
        );

        return res.json({
            status: 'success',
            token,
            user: {
                id: user._id,
                email: user.email,
                fullName: user.fullName,
                companyName: user.companyName,
                plan: user.plan,
                planExpiresAt: user.planExpiresAt
            }
        });
    } catch (err) {
        console.error('Account login error:', err.message);
        return res.status(500).json({ error: 'Login failed.' });
    }
});

/**
 * GET /api/account/me
 */
router.get('/api/account/me', requireUser, async (req, res) => {
    const user = req.user;
    return res.json({
        user: {
            id: user._id,
            email: user.email,
            fullName: user.fullName,
            companyName: user.companyName,
            plan: user.plan,
            planExpiresAt: user.planExpiresAt,
            createdAt: user.created_at
        }
    });
});

/**
 * GET /api/account/keys
 */
router.get('/api/account/keys', requireUser, async (req, res) => {
    try {
        const keys = await ApiKey.find({
            $or: [{ user: req.user._id }, { email: req.user.email }],
            active: true
        }).sort({ createdAt: -1 }).lean();

        return res.json({ keys });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to retrieve API keys.' });
    }
});

/**
 * POST /api/account/keys/regenerate
 */
router.post('/api/account/keys/regenerate', requireUser, async (req, res) => {
    try {
        const { keyId } = req.body;
        const apiKey = await ApiKey.findOne({
            _id: keyId,
            $or: [{ user: req.user._id }, { email: req.user.email }]
        });

        if (!apiKey) {
            return res.status(404).json({ error: 'API key not found.' });
        }

        const newKey = ApiKey.generateKey();
        apiKey.key = newKey;
        await apiKey.save();

        return res.json({
            status: 'success',
            message: 'API key regenerated successfully.',
            key: apiKey
        });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to regenerate API key.' });
    }
});

/**
 * GET /api/account/whitelabel-snippet
 */
router.get('/api/account/whitelabel-snippet', requireUser, async (req, res) => {
    try {
        const apiKey = await ApiKey.findOne({
            $or: [{ user: req.user._id }, { email: req.user.email }],
            active: true
        }).lean();

        const keyVal = apiKey ? apiKey.key : 'YOUR_API_KEY';
        const siteUrl = config.PUBLIC_SITE_URL || 'https://scores.mynorra.xyz';

        const iframeSnippet = `<iframe src="${siteUrl}/?api_key=${keyVal}&embed=true" width="100%" height="750" frameborder="0" style="border: 1px solid #1e293b; border-radius: 12px; overflow: hidden;" title="Live Football Scores"></iframe>`;

        const jsSnippet = `<!-- Norra AI Livescore Embed Widget -->\n<div id="norra-livescore-widget" data-api-key="${keyVal}"></div>\n<script src="${siteUrl}/assets/app.js" async></script>`;

        return res.json({
            iframeSnippet,
            jsSnippet,
            apiKey: keyVal
        });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to generate embed snippet.' });
    }
});

/**
 * GET /api/account/invoices
 */
router.get('/api/account/invoices', requireUser, async (req, res) => {
    try {
        const invoices = await Transaction.find({
            $or: [{ user: req.user._id }, { customer_email: req.user.email }]
        }).sort({ createdAt: -1 }).limit(50).lean();

        return res.json({ invoices });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to retrieve invoice history.' });
    }
});

module.exports = app => {
    app.use(router);
};
