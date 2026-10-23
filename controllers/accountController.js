const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/user');
const ApiKey = require('../models/apiKey');
const Transaction = require('../models/transaction');
const SiteSetting = require('../models/siteSetting');
const emailService = require('../services/emailService');
const googleAuthService = require('../services/googleAuthService');
const { requireUser, JWT_SECRET } = require('../middleware/auth');
const { config } = require('../config/env');

/**
 * GET /api/account/auth-config
 * Exposes public client IDs for frontend initialization (e.g. Google Sign-In)
 */
router.get('/api/account/auth-config', async (req, res) => {
    try {
        const googleClientId = await googleAuthService.getClientId();
        return res.json({
            googleClientId,
            googleAuthEnabled: Boolean(googleClientId)
        });
    } catch {
        return res.json({
            googleClientId: config.GOOGLE_CLIENT_ID || '',
            googleAuthEnabled: Boolean(config.GOOGLE_CLIENT_ID)
        });
    }
});

/**
 * POST /api/account/register
 * Normal signup with Name, Email, Password, and Email Confirmation Token
 */
router.post('/api/account/register', async (req, res) => {
    try {
        const { email, password, fullName, companyName } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required.' });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
        }

        const normalizedEmail = email.toLowerCase().trim();
        const existing = await User.findOne({ email: normalizedEmail });
        if (existing) {
            return res.status(400).json({ error: 'An account with this email already exists.' });
        }

        const passwordHash = await User.hashPassword(password);
        const verificationToken = crypto.randomBytes(32).toString('hex');
        const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        const user = await User.create({
            email: normalizedEmail,
            passwordHash,
            fullName: fullName || '',
            companyName: companyName || '',
            authProvider: 'local',
            isEmailVerified: false,
            emailVerificationToken: verificationToken,
            emailVerificationExpires: verificationExpires,
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

        // Dispatch verification email in background
        const siteUrl = config.PUBLIC_SITE_URL || `${req.protocol}://${req.get('host')}`;
        emailService.sendVerificationEmail({
            email: user.email,
            name: user.fullName,
            token: verificationToken,
            siteUrl
        }).catch(err => console.error('Verification email dispatch failed:', err.message));

        const token = jwt.sign(
            { userId: user._id, email: user.email, role: user.role },
            JWT_SECRET,
            { expiresIn: '30d' }
        );

        return res.status(201).json({
            status: 'success',
            message: 'Account registered! A confirmation link has been sent to your email.',
            token,
            user: {
                id: user._id,
                email: user.email,
                fullName: user.fullName,
                plan: user.plan,
                isEmailVerified: user.isEmailVerified,
                authProvider: user.authProvider
            },
            apiKey: apiKey.key,
            requiresEmailVerification: true
        });
    } catch (err) {
        console.error('Account register error:', err.message);
        return res.status(500).json({ error: 'Registration failed. Please try again.' });
    }
});

/**
 * POST /api/account/verify-email
 * Verifies email via token
 */
router.post('/api/account/verify-email', async (req, res) => {
    try {
        const { token } = req.body;
        if (!token) {
            return res.status(400).json({ error: 'Verification token is required.' });
        }

        const user = await User.findOne({
            emailVerificationToken: token,
            emailVerificationExpires: { $gt: new Date() }
        });

        if (!user) {
            return res.status(400).json({ error: 'Verification token is invalid or has expired. Please request a new one.' });
        }

        user.isEmailVerified = true;
        user.emailVerificationToken = null;
        user.emailVerificationExpires = null;
        await user.save();

        return res.json({
            status: 'success',
            message: 'Email confirmed successfully! Your developer account is verified.'
        });
    } catch (err) {
        console.error('Verify email error:', err.message);
        return res.status(500).json({ error: 'Failed to verify email address.' });
    }
});

/**
 * GET /api/account/verify-email
 * Route alias supporting GET with query param ?token=...
 */
router.get('/api/account/verify-email', async (req, res) => {
    try {
        const { token } = req.query;
        if (!token) {
            return res.status(400).json({ error: 'Verification token is required.' });
        }

        const user = await User.findOne({
            emailVerificationToken: token,
            emailVerificationExpires: { $gt: new Date() }
        });

        if (!user) {
            return res.status(400).json({ error: 'Verification link is invalid or has expired.' });
        }

        user.isEmailVerified = true;
        user.emailVerificationToken = null;
        user.emailVerificationExpires = null;
        await user.save();

        return res.json({
            status: 'success',
            message: 'Email confirmed successfully!'
        });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to verify email.' });
    }
});

/**
 * POST /api/account/resend-verification
 * Resends a fresh email confirmation link
 */
router.post('/api/account/resend-verification', async (req, res) => {
    try {
        let email = req.body.email;
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            try {
                const decoded = jwt.verify(authHeader.substring(7).trim(), JWT_SECRET);
                if (decoded && decoded.email) email = decoded.email;
            } catch {}
        }

        if (!email) {
            return res.status(400).json({ error: 'Email address is required.' });
        }

        const user = await User.findOne({ email: email.toLowerCase().trim() });
        if (!user) {
            return res.status(404).json({ error: 'Account not found with this email.' });
        }

        if (user.isEmailVerified) {
            return res.json({ status: 'success', message: 'Your email address is already verified!' });
        }

        const verificationToken = crypto.randomBytes(32).toString('hex');
        user.emailVerificationToken = verificationToken;
        user.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await user.save();

        const siteUrl = config.PUBLIC_SITE_URL || `${req.protocol}://${req.get('host')}`;
        await emailService.sendVerificationEmail({
            email: user.email,
            name: user.fullName,
            token: verificationToken,
            siteUrl
        });

        return res.json({
            status: 'success',
            message: 'Verification link has been sent to your email address.'
        });
    } catch (err) {
        console.error('Resend verification error:', err.message);
        return res.status(500).json({ error: 'Failed to resend confirmation email.' });
    }
});

/**
 * POST /api/account/google
 * Google Sign-In & Sign-Up endpoint
 */
router.post('/api/account/google', async (req, res) => {
    try {
        const { credential } = req.body;
        if (!credential) {
            return res.status(400).json({ error: 'Google authentication credential is required.' });
        }

        const googleProfile = await googleAuthService.verifyIdToken(credential);
        const { googleId, email, name, avatarUrl } = googleProfile;

        // Check if user exists by googleId or email
        let user = await User.findOne({
            $or: [{ googleId }, { email }]
        });

        let isNewUser = false;
        if (user) {
            // Existing user: Link Google ID and mark email verified
            if (!user.googleId) user.googleId = googleId;
            user.isEmailVerified = true;
            if (!user.avatarUrl && avatarUrl) user.avatarUrl = avatarUrl;
            if (!user.fullName && name) user.fullName = name;
            await user.save();
        } else {
            // New user registration via Google
            isNewUser = true;
            user = await User.create({
                email,
                fullName: name || '',
                googleId,
                avatarUrl,
                authProvider: 'google',
                isEmailVerified: true, // Google already verified this email
                plan: 'free'
            });

            // Automatically issue free API key
            const keyString = ApiKey.generateKey();
            await ApiKey.create({
                key: keyString,
                user: user._id,
                name: `${user.fullName || 'Google'} Free Key`,
                email: user.email,
                plan: 'free',
                rateLimitPerMinute: 120,
                isAdFree: false
            });
        }

        // Fetch user's active API key
        const apiKey = await ApiKey.findOne({
            $or: [{ user: user._id }, { email: user.email }],
            active: true
        }).lean();

        const token = jwt.sign(
            { userId: user._id, email: user.email, role: user.role },
            JWT_SECRET,
            { expiresIn: '30d' }
        );

        return res.json({
            status: 'success',
            message: isNewUser ? 'Account registered successfully with Google!' : 'Welcome back!',
            token,
            user: {
                id: user._id,
                email: user.email,
                fullName: user.fullName,
                avatarUrl: user.avatarUrl,
                plan: user.plan,
                isEmailVerified: user.isEmailVerified,
                authProvider: user.authProvider
            },
            apiKey: apiKey ? apiKey.key : null
        });
    } catch (err) {
        console.error('Google auth error:', err.message);
        return res.status(400).json({ error: err.message || 'Google authentication failed.' });
    }
});

/**
 * POST /api/account/login
 */
router.post('/api/account/login', async (req, res) => {
    try {
        const identifier = String(req.body.email || req.body.username || '').trim();
        const password = String(req.body.password || '');
        if (!identifier || !password) {
            return res.status(400).json({ error: 'Email or Username and password are required.' });
        }

        // Check if admin credentials from .env match
        const cleanUser = identifier.toLowerCase();
        const envUser = String(config.ADMIN_USERNAME || 'admin').trim().toLowerCase();
        if ((cleanUser === envUser || cleanUser === 'admin') && password === config.ADMIN_PASSWORD) {
            const token = jwt.sign(
                { username: config.ADMIN_USERNAME || 'admin', role: 'admin' },
                JWT_SECRET,
                { expiresIn: '7d' }
            );
            return res.json({
                status: 'success',
                isAdmin: true,
                redirectUrl: '/admin',
                token,
                message: 'Admin credentials recognized. Redirecting to Admin Console...'
            });
        }

        const user = await User.findOne({ email: identifier.toLowerCase() });
        if (!user || !user.active) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        if (user.authProvider === 'google' && !user.passwordHash) {
            return res.status(400).json({ error: 'This account was created with Google. Please use Google Sign-In.' });
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
                avatarUrl: user.avatarUrl,
                plan: user.plan,
                planExpiresAt: user.planExpiresAt,
                isEmailVerified: user.isEmailVerified,
                authProvider: user.authProvider
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
            avatarUrl: user.avatarUrl,
            plan: user.plan,
            planExpiresAt: user.planExpiresAt,
            isEmailVerified: user.isEmailVerified,
            authProvider: user.authProvider,
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

        const isNorraAdmin = req.user.role === 'admin' || req.user.email.includes('norra') || req.user.email.includes('admin');
        const norraMasterKey = isNorraAdmin ? (config.NORRA_INTERNAL_API_KEY || 'norra_live_master_internal_access_2026') : null;

        return res.json({ keys, norraMasterKey, isNorraAdmin });
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
