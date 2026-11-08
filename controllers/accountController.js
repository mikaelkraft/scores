const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const User = require('../models/user');
const ApiKey = require('../models/apiKey');
const Transaction = require('../models/transaction');
const SiteSetting = require('../models/siteSetting');
const emailService = require('../services/emailService');
const googleAuthService = require('../services/googleAuthService');
const { requireUser, JWT_SECRET } = require('../middleware/auth');
const { keyCache } = require('../middleware/apiKeyAuth');
const { config } = require('../config/env');

const PLAN_LIMITS = {
    free: { rateLimit: 120, isAdFree: false },
    starter: { rateLimit: 600, isAdFree: true },
    pro: { rateLimit: 1500, isAdFree: true },
    whitelabel: { rateLimit: 3000, isAdFree: true },
    admin: { rateLimit: 0, isAdFree: true }
};

function maskApiKey(key) {
    if (!key || typeof key !== 'string') return '';
    if (key.length <= 12) return key.slice(0, 4) + '••••••••';
    const prefix = key.slice(0, 10);
    const suffix = key.slice(-4);
    return `${prefix}••••••••••••••••${suffix}`;
}

// Configure disk storage for user avatar uploads
const avatarStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dest = path.join(__dirname, '..', 'public', 'uploads', 'avatars');
        fs.mkdirSync(dest, { recursive: true });
        cb(null, dest);
    },
    filename: (req, file, cb) => {
        const userId = req.user ? String(req.user._id) : 'guest';
        const ext = path.extname(file.originalname).toLowerCase() || '.png';
        cb(null, `avatar-${userId}-${Date.now()}${ext}`);
    }
});

const avatarUpload = multer({
    storage: avatarStorage,
    limits: { fileSize: 4 * 1024 * 1024 }, // 4MB
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|webp|gif|svg\+xml|svg/;
        const mimeValid = allowedTypes.test(file.mimetype);
        const extValid = allowedTypes.test(path.extname(file.originalname).toLowerCase().replace('.', ''));
        if (mimeValid || extValid) return cb(null, true);
        cb(new Error('Only image files (PNG, JPG, WebP, SVG, GIF) are allowed.'));
    }
});

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

        // Determine if user qualifies for admin role
        const adminEmail = (config.ADMIN_EMAIL || '').toLowerCase().trim();
        const isAdmin = (adminEmail && email === adminEmail) ||
                        email === 'admin@mynorra.xyz' ||
                        email.startsWith('admin@') ||
                        (user && user.role === 'admin');

        let isNewUser = false;
        if (user) {
            // Existing user: Link Google ID and mark email verified
            if (!user.googleId) user.googleId = googleId;
            user.isEmailVerified = true;
            if (!user.avatarUrl && avatarUrl) user.avatarUrl = avatarUrl;
            if (!user.fullName && name) user.fullName = name;
            if (isAdmin && user.role !== 'admin') user.role = 'admin';
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
                role: isAdmin ? 'admin' : 'user',
                plan: isAdmin ? 'whitelabel' : 'free'
            });

            // Automatically issue API key
            const keyString = ApiKey.generateKey();
            await ApiKey.create({
                key: keyString,
                user: user._id,
                name: `${user.fullName || 'Google'} ${isAdmin ? 'Admin' : 'Free'} Key`,
                email: user.email,
                plan: isAdmin ? 'whitelabel' : 'free',
                rateLimitPerMinute: isAdmin ? 5000 : 120,
                isAdFree: Boolean(isAdmin)
            });
        }

        // Fetch user's active API key
        const apiKey = await ApiKey.findOne({
            $or: [{ user: user._id }, { email: user.email }],
            active: true
        }).lean();

        const token = jwt.sign(
            { userId: user._id, email: user.email, role: user.role, username: user.username || user.email.split('@')[0] },
            JWT_SECRET,
            { expiresIn: '30d' }
        );

        return res.json({
            status: 'success',
            message: isNewUser ? 'Account registered successfully with Google!' : 'Welcome back!',
            token,
            isAdmin: user.role === 'admin',
            redirectUrl: user.role === 'admin' ? '/admin' : '/account',
            user: {
                id: user._id,
                email: user.email,
                fullName: user.fullName,
                avatarUrl: user.avatarUrl,
                plan: user.plan,
                role: user.role,
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

        const user = await User.findOne({
            $or: [
                { email: cleanUser },
                { username: cleanUser }
            ]
        });
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
            { userId: user._id, email: user.email, role: user.role, username: user.username || user.email.split('@')[0] },
            JWT_SECRET,
            { expiresIn: '30d' }
        );

        return res.json({
            status: 'success',
            token,
            isAdmin: user.role === 'admin',
            redirectUrl: user.role === 'admin' ? '/admin' : '/account',
            user: {
                id: user._id,
                email: user.email,
                username: user.username || '',
                fullName: user.fullName || '',
                companyName: user.companyName || '',
                avatarUrl: user.avatarUrl || '',
                phone: user.phone || '',
                bio: user.bio || '',
                website: user.website || '',
                location: user.location || '',
                plan: user.plan || 'free',
                planExpiresAt: user.planExpiresAt,
                role: user.role,
                isEmailVerified: Boolean(user.isEmailVerified),
                authProvider: user.authProvider,
                hasPassword: Boolean(user.passwordHash)
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
            username: user.username || '',
            fullName: user.fullName || '',
            companyName: user.companyName || '',
            avatarUrl: user.avatarUrl || '',
            phone: user.phone || '',
            bio: user.bio || '',
            website: user.website || '',
            location: user.location || '',
            plan: user.plan || 'free',
            planExpiresAt: user.planExpiresAt,
            role: user.role || 'user',
            isEmailVerified: Boolean(user.isEmailVerified),
            authProvider: user.authProvider,
            hasPassword: Boolean(user.passwordHash),
            createdAt: user.createdAt || user.created_at
        }
    });
});

/**
 * GET /api/account/google/callback
 * Handles OAuth redirects safely back to /account
 */
router.get('/api/account/google/callback', (req, res) => {
    const { error, error_description } = req.query;
    if (error) {
        return res.redirect(`/account?auth_error=${encodeURIComponent(error_description || error)}`);
    }
    return res.redirect('/account');
});

/**
 * PUT & POST /api/account/profile
 * Comprehensive profile editing: full name, username, company, phone, bio, website, location, avatar
 */
async function handleProfileUpdate(req, res) {
    try {
        const { fullName, username, companyName, phone, bio, website, location, avatarUrl } = req.body;
        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ error: 'User not found.' });

        if (username !== undefined) {
            const cleanUser = String(username).trim().toLowerCase();
            if (cleanUser && cleanUser !== user.username) {
                if (!/^[a-z0-9_.-]{3,30}$/.test(cleanUser)) {
                    return res.status(400).json({ error: 'Username must be 3-30 characters long and can only contain letters, numbers, underscores, and hyphens.' });
                }
                const existing = await User.findOne({ username: cleanUser, _id: { $ne: user._id } });
                if (existing) {
                    return res.status(400).json({ error: 'This username is already taken by another developer.' });
                }
                user.username = cleanUser;
            } else if (!cleanUser) {
                user.username = undefined;
            }
        }

        if (fullName !== undefined) user.fullName = String(fullName).trim();
        if (companyName !== undefined) user.companyName = String(companyName).trim();
        if (phone !== undefined) user.phone = String(phone).trim();
        if (bio !== undefined) user.bio = String(bio).trim().slice(0, 500);
        if (website !== undefined) user.website = String(website).trim().slice(0, 200);
        if (location !== undefined) user.location = String(location).trim().slice(0, 100);
        if (avatarUrl !== undefined && avatarUrl.trim()) user.avatarUrl = String(avatarUrl).trim();

        await user.save();

        return res.json({
            status: 'success',
            message: 'Profile updated successfully!',
            user: {
                id: user._id,
                email: user.email,
                username: user.username || '',
                fullName: user.fullName || '',
                companyName: user.companyName || '',
                avatarUrl: user.avatarUrl || '',
                phone: user.phone || '',
                bio: user.bio || '',
                website: user.website || '',
                location: user.location || '',
                plan: user.plan || 'free',
                planExpiresAt: user.planExpiresAt,
                isEmailVerified: Boolean(user.isEmailVerified),
                authProvider: user.authProvider,
                hasPassword: Boolean(user.passwordHash),
                createdAt: user.createdAt || user.created_at
            }
        });
    } catch (err) {
        console.error('Update profile error:', err.message);
        return res.status(500).json({ error: 'Failed to update profile: ' + err.message });
    }
}
router.put('/api/account/profile', requireUser, handleProfileUpdate);
router.post('/api/account/profile', requireUser, handleProfileUpdate);

/**
 * POST /api/account/avatar
 * Uploads user profile avatar file
 */
router.post('/api/account/avatar', requireUser, avatarUpload.single('avatar'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Please choose an image file to upload.' });
        }
        const fileUrl = `/uploads/avatars/${req.file.filename}`;
        const user = await User.findById(req.user._id);
        if (user) {
            user.avatarUrl = fileUrl;
            await user.save();
        }
        return res.json({
            status: 'success',
            message: 'Avatar updated successfully!',
            avatarUrl: fileUrl
        });
    } catch (err) {
        return res.status(500).json({ error: err.message || 'Failed to upload avatar.' });
    }
});

/**
 * POST /api/account/change-password
 */
router.post('/api/account/change-password', requireUser, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({ error: 'New password must be at least 6 characters long.' });
        }

        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ error: 'User not found.' });

        if (user.passwordHash) {
            if (!currentPassword) {
                return res.status(400).json({ error: 'Current password is required.' });
            }
            const isMatch = await user.verifyPassword(currentPassword);
            if (!isMatch) {
                return res.status(400).json({ error: 'Current password does not match.' });
            }
        }

        user.passwordHash = await User.hashPassword(newPassword);
        await user.save();

        return res.json({
            status: 'success',
            message: 'Password changed successfully! You can now use your new password.'
        });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to change password.' });
    }
});

/**
 * GET /api/account/keys
 * Returns user keys with masked secret for display security
 */
router.get('/api/account/keys', requireUser, async (req, res) => {
    try {
        const keys = await ApiKey.find({
            $or: [{ user: req.user._id }, { email: req.user.email }],
            active: true
        }).sort({ createdAt: -1 }).lean();

        const isNorraAdmin = req.user.role === 'admin' || req.user.email.includes('norra') || req.user.email.includes('admin');
        const norraMasterKey = isNorraAdmin ? (config.NORRA_INTERNAL_API_KEY || 'norra_live_master_internal_access_2026') : null;

        const sanitizedKeys = keys.map(k => ({
            _id: k._id,
            name: k.name,
            email: k.email,
            plan: k.plan,
            rateLimitPerMinute: k.rateLimitPerMinute,
            isAdFree: k.isAdFree,
            totalRequests: k.totalRequests || 0,
            lastUsedAt: k.lastUsedAt,
            createdAt: k.createdAt,
            expiresAt: k.expiresAt,
            active: k.active,
            keyMasked: maskApiKey(k.key),
            key: maskApiKey(k.key)
        }));

        return res.json({ keys: sanitizedKeys, norraMasterKey, isNorraAdmin });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to retrieve API keys.' });
    }
});

/**
 * POST /api/account/keys/generate
 * Generates an API key tied strictly to authenticated user's account and plan.
 * Returns the rawKey once in this response payload for copy into the one-time reveal info box.
 */
router.post('/api/account/keys/generate', requireUser, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ error: 'User not found.' });

        const plan = user.plan || 'free';
        const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;

        // Deactivate previous active keys for this user and evict from cache
        const prevKeys = await ApiKey.find(
            { $or: [{ user: user._id }, { email: user.email }], active: true }
        ).select('key').lean();
        await ApiKey.updateMany(
            { $or: [{ user: user._id }, { email: user.email }], active: true },
            { $set: { active: false } }
        );
        if (keyCache && prevKeys?.length) {
            prevKeys.forEach(k => { if (k.key) keyCache.delete(k.key); });
        }

        const rawKey = ApiKey.generateKey();
        const apiKey = await ApiKey.create({
            key: rawKey,
            user: user._id,
            name: `${user.companyName || user.fullName || user.username || 'Developer'} ${plan.toUpperCase()} Key`,
            email: user.email,
            plan: plan,
            rateLimitPerMinute: limits.rateLimit,
            isAdFree: limits.isAdFree,
            active: true,
            expiresAt: user.planExpiresAt || null
        });

        return res.status(201).json({
            status: 'success',
            message: 'API key generated successfully! Please copy your key now.',
            rawKey: apiKey.key,
            key: {
                _id: apiKey._id,
                name: apiKey.name,
                plan: apiKey.plan,
                rateLimitPerMinute: apiKey.rateLimitPerMinute,
                isAdFree: apiKey.isAdFree,
                createdAt: apiKey.createdAt,
                keyMasked: maskApiKey(apiKey.key)
            }
        });
    } catch (err) {
        console.error('Key generation error:', err.message);
        return res.status(500).json({ error: 'Failed to generate API key.' });
    }
});

/**
 * POST /api/account/keys/regenerate
 */
router.post('/api/account/keys/regenerate', requireUser, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ error: 'User not found.' });

        const plan = user.plan || 'free';
        const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;

        // Deactivate previous active keys and evict from cache
        const prevKeys = await ApiKey.find(
            { $or: [{ user: user._id }, { email: user.email }], active: true }
        ).select('key').lean();
        await ApiKey.updateMany(
            { $or: [{ user: user._id }, { email: user.email }], active: true },
            { $set: { active: false } }
        );
        if (keyCache && prevKeys?.length) {
            prevKeys.forEach(k => { if (k.key) keyCache.delete(k.key); });
        }

        const rawKey = ApiKey.generateKey();
        const apiKey = await ApiKey.create({
            key: rawKey,
            user: user._id,
            name: `${user.companyName || user.fullName || user.username || 'Developer'} ${plan.toUpperCase()} Key`,
            email: user.email,
            plan: plan,
            rateLimitPerMinute: limits.rateLimit,
            isAdFree: limits.isAdFree,
            active: true,
            expiresAt: user.planExpiresAt || null
        });

        return res.json({
            status: 'success',
            message: 'New API key generated. Previous key was revoked.',
            rawKey: apiKey.key,
            key: {
                _id: apiKey._id,
                name: apiKey.name,
                plan: apiKey.plan,
                rateLimitPerMinute: apiKey.rateLimitPerMinute,
                isAdFree: apiKey.isAdFree,
                createdAt: apiKey.createdAt,
                keyMasked: maskApiKey(apiKey.key)
            }
        });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to regenerate API key.' });
    }
});

/**
 * POST /api/account/keys/revoke
 */
router.post('/api/account/keys/revoke', requireUser, async (req, res) => {
    try {
        const { keyId } = req.body;
        const filter = {
            $or: [{ user: req.user._id }, { email: req.user.email }],
            active: true
        };
        if (keyId) filter._id = keyId;

        const keysToRevoke = await ApiKey.find(filter).select('key').lean();
        await ApiKey.updateMany(filter, { $set: { active: false } });
        if (keyCache && keysToRevoke?.length) {
            keysToRevoke.forEach(k => { if (k.key) keyCache.delete(k.key); });
        }
        return res.json({
            status: 'success',
            message: 'API key revoked successfully.'
        });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to revoke API key.' });
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
