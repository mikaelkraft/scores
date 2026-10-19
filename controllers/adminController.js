const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const { config } = require('../config/env');
const { requireAdmin, JWT_SECRET } = require('../middleware/auth');
const SiteSetting = require('../models/siteSetting');
const User = require('../models/user');
const ApiKey = require('../models/apiKey');
const Transaction = require('../models/transaction');
const SoccerLeague = require('../models/soccerLeague');
const SoccerMatch = require('../models/soccerMatch');
const SoccerMatchEvent = require('../models/soccerMatchEvent');

// Configure disk storage for custom logo uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dest = path.join(__dirname, '..', 'public', 'uploads', 'branding');
        fs.mkdirSync(dest, { recursive: true });
        cb(null, dest);
    },
    filename: (req, file, cb) => {
        const logoType = req.body.logoType === 'footer' ? 'footer-logo' : 'header-logo';
        const ext = path.extname(file.originalname).toLowerCase() || '.png';
        cb(null, `${logoType}-${Date.now()}${ext}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|svg\+xml|svg|webp|gif/;
        const mimeValid = allowedTypes.test(file.mimetype);
        const extValid = allowedTypes.test(path.extname(file.originalname).toLowerCase().replace('.', ''));
        if (mimeValid || extValid) {
            return cb(null, true);
        }
        cb(new Error('Only image files (PNG, JPG, SVG, WebP) are allowed.'));
    }
});

/**
 * POST /api/admin/login
 * Supports both .env credentials and initial-visit setup
 */
router.post('/api/admin/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required.' });
        }

        let isAdminValid = false;

        // Check against environment variable configured credentials
        if (username === config.ADMIN_USERNAME && password === config.ADMIN_PASSWORD) {
            isAdminValid = true;
        } else {
            // Check against database admin user
            const adminUser = await User.findOne({
                $or: [{ email: username.toLowerCase().trim() }, { fullName: username }],
                role: 'admin'
            });
            if (adminUser) {
                isAdminValid = await adminUser.verifyPassword(password);
            }
        }

        if (!isAdminValid) {
            return res.status(401).json({ error: 'Invalid admin credentials.' });
        }

        const token = jwt.sign(
            { username, role: 'admin' },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        return res.json({
            status: 'success',
            token,
            admin: { username }
        });
    } catch (err) {
        console.error('Admin login error:', err.message);
        return res.status(500).json({ error: 'Admin authentication failed.' });
    }
});

/**
 * GET /api/admin/settings
 */
router.get('/api/admin/settings', requireAdmin, async (req, res) => {
    try {
        const settings = await SiteSetting.getGlobalSettings();
        return res.json({ settings });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to load settings.' });
    }
});

/**
 * PUT /api/admin/settings
 */
router.put('/api/admin/settings', requireAdmin, async (req, res) => {
    try {
        const updateData = req.body;
        delete updateData._id;
        delete updateData.key;

        const settings = await SiteSetting.findOneAndUpdate(
            { key: 'global' },
            { $set: updateData },
            { new: true, upsert: true }
        );

        return res.json({
            status: 'success',
            message: 'Settings updated successfully.',
            settings
        });
    } catch (err) {
        console.error('Settings update error:', err.message);
        return res.status(500).json({ error: 'Failed to update settings.' });
    }
});

/**
 * POST /api/admin/upload-logo
 * Uploads sized header or footer logo
 */
router.post('/api/admin/upload-logo', requireAdmin, upload.single('logo'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No image file uploaded.' });
        }

        const logoType = req.body.logoType === 'footer' ? 'footer' : 'header';
        const fileUrl = `/uploads/branding/${req.file.filename}`;

        const updateField = logoType === 'footer' ? { footerLogoUrl: fileUrl } : { headerLogoUrl: fileUrl };
        await SiteSetting.updateOne({ key: 'global' }, { $set: updateField });

        return res.json({
            status: 'success',
            message: `${logoType === 'footer' ? 'Footer' : 'Header'} logo uploaded successfully!`,
            url: fileUrl,
            logoType
        });
    } catch (err) {
        console.error('Logo upload error:', err.message);
        return res.status(500).json({ error: err.message || 'Failed to upload logo image.' });
    }
});

/**
 * GET /api/admin/users
 */
router.get('/api/admin/users', requireAdmin, async (req, res) => {
    try {
        const users = await User.find().sort({ createdAt: -1 }).lean();
        return res.json({ users });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to load users.' });
    }
});

/**
 * GET /api/admin/keys
 */
router.get('/api/admin/keys', requireAdmin, async (req, res) => {
    try {
        const keys = await ApiKey.find().sort({ createdAt: -1 }).lean();
        return res.json({ keys });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to load API keys.' });
    }
});

/**
 * POST /api/admin/keys
 * Issue manual enterprise/partner key
 */
router.post('/api/admin/keys', requireAdmin, async (req, res) => {
    try {
        const { name, email, plan = 'pro', rateLimitPerMinute = 1500, isAdFree = true, daysValid = 365 } = req.body;
        if (!email) {
            return res.status(400).json({ error: 'Customer email is required.' });
        }

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + Number(daysValid));

        const keyString = ApiKey.generateKey();
        const apiKey = await ApiKey.create({
            key: keyString,
            name: name || `${plan.toUpperCase()} Enterprise Key`,
            email: email.toLowerCase().trim(),
            plan,
            rateLimitPerMinute: Number(rateLimitPerMinute) || 1500,
            isAdFree: Boolean(isAdFree),
            expiresAt
        });

        return res.status(201).json({
            status: 'success',
            message: 'API key issued successfully.',
            key: apiKey
        });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to issue API key.' });
    }
});

/**
 * DELETE /api/admin/keys/:id
 */
router.delete('/api/admin/keys/:id', requireAdmin, async (req, res) => {
    try {
        await ApiKey.findByIdAndUpdate(req.params.id, { active: false });
        return res.json({ status: 'success', message: 'API key revoked.' });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to revoke API key.' });
    }
});

/**
 * GET /api/admin/stats
 */
router.get('/api/admin/stats', requireAdmin, async (req, res) => {
    try {
        const [
            leagueCount,
            matchCount,
            eventCount,
            userCount,
            keyCount,
            recentTransactions
        ] = await Promise.all([
            SoccerLeague.countDocuments({ active: true }).catch(() => 0),
            SoccerMatch.countDocuments().catch(() => 0),
            SoccerMatchEvent.countDocuments().catch(() => 0),
            User.countDocuments().catch(() => 0),
            ApiKey.countDocuments({ active: true }).catch(() => 0),
            Transaction.find().sort({ createdAt: -1 }).limit(10).lean().catch(() => [])
        ]);

        return res.json({
            stats: {
                activeLeagues: leagueCount,
                storedMatches: matchCount,
                playEvents: eventCount,
                totalUsers: userCount,
                activeApiKeys: keyCount
            },
            recentTransactions
        });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to load platform statistics.' });
    }
});

module.exports = app => {
    app.use(router);
};
