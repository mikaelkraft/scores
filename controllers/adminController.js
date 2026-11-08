const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const mongoose = require('../database');

const { config } = require('../config/env');
const { requireAdmin, JWT_SECRET } = require('../middleware/auth');
const { runInTransaction } = require('../services/transactionService');
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
        let prefix = 'header-logo';
        if (req.body.logoType === 'footer') prefix = 'footer-logo';
        else if (req.body.logoType === 'favicon') prefix = 'favicon';
        const ext = path.extname(file.originalname).toLowerCase() || '.png';
        cb(null, `${prefix}-${Date.now()}${ext}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|svg\+xml|svg|webp|gif|x-icon|vnd\.microsoft\.icon|ico/;
        const mimeValid = allowedTypes.test(file.mimetype);
        const extValid = allowedTypes.test(path.extname(file.originalname).toLowerCase().replace('.', ''));
        if (mimeValid || extValid) {
            return cb(null, true);
        }
        cb(new Error('Only image files (PNG, JPG, SVG, WebP, ICO) are allowed.'));
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
        const cleanUser = String(username).trim().toLowerCase();
        const envUser = String(config.ADMIN_USERNAME || 'admin').trim().toLowerCase();

        // Check against environment variable configured credentials (case-insensitive username)
        if ((cleanUser === envUser || cleanUser === 'admin') && password === config.ADMIN_PASSWORD) {
            isAdminValid = true;
        } else {
            // Check against database admin user
            const adminUser = await User.findOne({
                $or: [{ email: cleanUser }, { fullName: username }],
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

        // Preserve existing SMTP password if none provided on save
        if (updateData.smtpSettings) {
            const existing = await SiteSetting.findOne({ key: 'global' }).lean();
            if (!updateData.smtpSettings.pass && existing?.smtpSettings?.pass) {
                updateData.smtpSettings.pass = existing.smtpSettings.pass;
            }
        }

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
 * POST /api/admin/test-smtp
 * Verifies live SMTP credentials and dispatches a test email
 */
router.post('/api/admin/test-smtp', requireAdmin, async (req, res) => {
    try {
        const { toEmail } = req.body;
        const target = toEmail || req.admin?.email || 'admin@mynorra.xyz';
        const emailService = require('../services/emailService');
        const { transporter, from, isMock } = await emailService.getTransporter();

        if (isMock || !transporter) {
            return res.status(400).json({ error: 'Live SMTP is not enabled or credentials (host, username, password) are missing.' });
        }

        await transporter.verify();
        await transporter.sendMail({
            from,
            to: target,
            subject: '✅ SMTP Configuration Test — Scores by Norra AI',
            html: `
                <div style="font-family:sans-serif; padding:20px; color:#1e293b;">
                    <h2 style="color:#10b981;">🎉 SMTP Dispatch Connected Successfully!</h2>
                    <p>This test email confirms that your SMTP server settings are correctly configured in the Norra AI Admin Console and capable of delivering developer confirmation emails.</p>
                    <hr style="border:none; border-top:1px solid #e2e8f0; margin:20px 0;">
                    <p style="font-size:12px; color:#64748b;">Timestamp: ${new Date().toISOString()}</p>
                </div>
            `
        });

        return res.json({ status: 'success', message: `Test email successfully delivered to ${target}!` });
    } catch (err) {
        return res.status(500).json({ error: 'SMTP connection failed: ' + err.message });
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

        const logoType = req.body.logoType === 'footer' ? 'footer' : (req.body.logoType === 'favicon' ? 'favicon' : 'header');
        const fileUrl = `/uploads/branding/${req.file.filename}`;

        let updateField = { headerLogoUrl: fileUrl };
        if (logoType === 'footer') updateField = { footerLogoUrl: fileUrl };
        else if (logoType === 'favicon') updateField = { faviconUrl: fileUrl };

        await SiteSetting.updateOne({ key: 'global' }, { $set: updateField });

        const labelMap = { header: 'Header logo', footer: 'Footer logo', favicon: 'Favicon' };
        return res.json({
            status: 'success',
            message: `${labelMap[logoType] || 'Logo'} uploaded successfully!`,
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
        const users = await User.find()
            .maxTimeMS(4000)
            .sort({ createdAt: -1 })
            .lean()
            .catch(err => {
                console.warn('[Admin] User fetch warning:', err.message);
                return [];
            });
        return res.json({ users: users || [] });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to load users: ' + err.message, users: [] });
    }
});

/**
 * GET /api/admin/keys
 */
router.get('/api/admin/keys', requireAdmin, async (req, res) => {
    try {
        const keys = await ApiKey.find()
            .maxTimeMS(4000)
            .sort({ createdAt: -1 })
            .lean()
            .catch(err => {
                console.warn('[Admin] ApiKey fetch warning:', err.message);
                return [];
            });
        const masterKey = config.NORRA_INTERNAL_API_KEY || 'norra_live_master_internal_access_2026';
        const sanitizedKeys = (keys || []).map(k => ({
            ...k,
            rawKey: undefined,
            keyMasked: k.key ? `norra_${k.key.slice(6, 10)}••••••••••••••••${k.key.slice(-4)}` : '',
            key: k.key ? `norra_${k.key.slice(6, 10)}••••••••••••••••${k.key.slice(-4)}` : ''
        }));
        return res.json({ keys: sanitizedKeys, norraMasterKey: masterKey });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to load API keys: ' + err.message, keys: [] });
    }
});

/**
 * GET /api/admin/norra-integration
 * Supplies the dedicated Norra AI prediction engine credentials and decoupled sync snippets.
 */
router.get('/api/admin/norra-integration', requireAdmin, async (req, res) => {
    const masterKey = config.NORRA_INTERNAL_API_KEY || 'norra_live_master_internal_access_2026';
    const siteUrl = config.PUBLIC_SITE_URL || 'https://scores.mynorra.xyz';
    return res.json({
        status: 'active',
        masterKey,
        tier: 'Admin Master (Free Internal Norra Engine)',
        rateLimit: 'Unlimited',
        isAdFree: true,
        endpoints: {
            liveScores: `${siteUrl}/api/v1/football/live`,
            fixtures: `${siteUrl}/api/v1/football/fixtures?date=today`,
            predictionContext: `${siteUrl}/api/v1/football/predictions-context/{eventId}`,
            h2h: `${siteUrl}/api/v1/football/h2h/{team1Id}/{team2Id}`,
            trainingData: `${siteUrl}/api/v1/football/training-data?limit=500&format=jsonl`,
            leagues: `${siteUrl}/api/v1/football/leagues`,
            standings: `${siteUrl}/api/v1/football/standings`
        },
        snippets: {
            curl: `curl -H "x-api-key: ${masterKey}" ${siteUrl}/api/v1/football/live`,
            node: `const res = await fetch("${siteUrl}/api/v1/football/live", { headers: { "x-api-key": "${masterKey}" } });\nconst data = await res.json();`,
            python: `import requests\nheaders = {"x-api-key": "${masterKey}"}\nres = requests.get("${siteUrl}/api/v1/football/live", headers=headers).json()`
        }
    });
});

/**
 * POST /api/admin/keys
 * Issue manual enterprise/partner key
 */
router.post('/api/admin/keys', requireAdmin, async (req, res) => {
    try {
        const { name, email, plan = 'pro', daysValid = 365 } = req.body;
        if (!email) {
            return res.status(400).json({ error: 'Customer email is required.' });
        }

        const planKey = (plan || 'pro').toLowerCase();
        const isNorraTarget = /norra/i.test(email || '') || /norra/i.test(name || '') || planKey === 'internal' || planKey === 'admin';
        const defaultLimits = {
            free: { rateLimit: 120, isAdFree: false },
            starter: { rateLimit: 500, isAdFree: true },
            pro: { rateLimit: 1500, isAdFree: true },
            whitelabel: { rateLimit: isNorraTarget ? 0 : 5000, isAdFree: true },
            enterprise: { rateLimit: isNorraTarget ? 0 : 5000, isAdFree: true },
            internal: { rateLimit: 0, isAdFree: true },
            admin: { rateLimit: 0, isAdFree: true }
        };
        const limits = defaultLimits[planKey] || defaultLimits.whitelabel;

        let expiresAt = null;
        if (Number(daysValid) > 0) {
            expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + Number(daysValid));
        }

        const keyString = ApiKey.generateKey();
        const apiKey = await ApiKey.create({
            key: keyString,
            name: name || `${planKey.toUpperCase()} Enterprise Key`,
            email: email.toLowerCase().trim(),
            plan: planKey,
            rateLimitPerMinute: req.body.rateLimitPerMinute ? Number(req.body.rateLimitPerMinute) : limits.rateLimit,
            isAdFree: req.body.isAdFree !== undefined ? Boolean(req.body.isAdFree) : limits.isAdFree,
            expiresAt
        });

        return res.status(201).json({
            status: 'success',
            message: 'API key issued successfully.',
            rawKey: apiKey.key,
            key: {
                _id: apiKey._id,
                name: apiKey.name,
                email: apiKey.email,
                plan: apiKey.plan,
                rateLimitPerMinute: apiKey.rateLimitPerMinute,
                isAdFree: apiKey.isAdFree,
                expiresAt: apiKey.expiresAt,
                keyMasked: `norra_${apiKey.key.slice(6, 10)}••••••••••••••••${apiKey.key.slice(-4)}`
            }
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
 * GET /api/admin/transactions
 * Lists all subscription transactions with optional filtering by status and search.
 */
router.get('/api/admin/transactions', requireAdmin, async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 30));
        const status = req.query.status && req.query.status !== 'all' ? req.query.status : null;
        const search = req.query.search ? String(req.query.search).trim() : null;

        const filter = {};
        if (status) {
            filter.status = status;
        }
        if (search) {
            const rx = new RegExp(search, 'i');
            filter.$or = [
                { tx_ref: rx },
                { customer_email: rx },
                { customer_name: rx },
                { gateway_ref: rx },
                { plan: rx }
            ];
        }

        const [totalCount, transactions, stats] = await Promise.all([
            Transaction.countDocuments(filter).maxTimeMS(4000).catch(() => 0),
            Transaction.find(filter)
                .maxTimeMS(4000)
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .populate('user', 'email fullName companyName plan')
                .lean()
                .catch(() => []),
            Transaction.aggregate([
                {
                    $group: {
                        _id: '$status',
                        count: { $sum: 1 },
                        totalAmount: { $sum: '$amount' }
                    }
                }
            ]).catch(() => [])
        ]);

        let totalVolume = 0;
        let successfulCount = 0;
        let pendingCount = 0;
        let failedCount = 0;

        for (const s of (stats || [])) {
            if (s._id === 'successful') {
                totalVolume = s.totalAmount || 0;
                successfulCount = s.count || 0;
            } else if (s._id === 'pending') {
                pendingCount = s.count || 0;
            } else {
                failedCount += s.count || 0;
            }
        }

        return res.json({
            transactions: transactions || [],
            totalCount,
            page,
            totalPages: Math.ceil(totalCount / limit) || 1,
            summary: {
                totalVolume: Math.round(totalVolume * 100) / 100,
                successfulCount,
                pendingCount,
                failedCount
            }
        });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to load transactions: ' + err.message, transactions: [] });
    }
});

/**
 * PUT /api/admin/transactions/:id/status
 * Manually updates transaction status using transaction management with atomic plan upgrade.
 */
router.put('/api/admin/transactions/:id/status', requireAdmin, async (req, res) => {
    try {
        const { status, note } = req.body;
        if (!['successful', 'pending', 'failed', 'cancelled'].includes(status)) {
            return res.status(400).json({ error: 'Invalid transaction status.' });
        }

        const tx = await Transaction.findById(req.params.id);
        if (!tx) {
            return res.status(404).json({ error: 'Transaction not found.' });
        }

        const prevStatus = tx.status;
        tx.status = status;

        await runInTransaction(async (session) => {
            const opts = session ? { session } : {};
            await tx.save(opts);

            // If marked successful and was not successful before, upgrade user and generate key
            if (status === 'successful' && prevStatus !== 'successful') {
                const targetEmail = tx.customer_email;
                if (targetEmail) {
                    const user = session 
                        ? await User.findOne({ email: targetEmail }).session(session)
                        : await User.findOne({ email: targetEmail });
                    if (user) {
                        user.plan = tx.plan;
                        await user.save(opts);
                    }

                    // Check if an API key needs to be issued
                    if (!tx.api_key_issued) {
                        const crypto = require('crypto');
                        const rawKey = `norra_${tx.plan}_${crypto.randomBytes(16).toString('hex')}`;
                        const rateLimits = { starter: 120, pro: 300, whitelabel: 1200 };
                        const limit = rateLimits[tx.plan] || 120;

                        const newKey = new ApiKey({
                            key: rawKey,
                            name: `${tx.customer_name || targetEmail} (${tx.plan.toUpperCase()})`,
                            email: targetEmail,
                            plan: tx.plan,
                            rateLimitPerMinute: limit,
                            isAdFree: tx.plan === 'pro' || tx.plan === 'whitelabel',
                            active: true,
                            expiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000)
                        });

                        await newKey.save(opts);
                        tx.api_key_issued = rawKey;
                        await tx.save(opts);
                    }
                }
            }
        });

        return res.json({ status: 'success', message: `Transaction status updated to ${status}.`, transaction: tx });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to update transaction status: ' + err.message });
    }
});

/**
 * POST /api/admin/transactions/:id/issue-key
 * Manually issues an API key tied to this transaction.
 */
router.post('/api/admin/transactions/:id/issue-key', requireAdmin, async (req, res) => {
    try {
        const tx = await Transaction.findById(req.params.id);
        if (!tx) {
            return res.status(404).json({ error: 'Transaction not found.' });
        }

        const crypto = require('crypto');
        const rawKey = `norra_${tx.plan}_${crypto.randomBytes(16).toString('hex')}`;
        const rateLimits = { starter: 120, pro: 300, whitelabel: 1200 };
        const limit = rateLimits[tx.plan] || 120;

        const newKey = new ApiKey({
            key: rawKey,
            name: `${tx.customer_name || tx.customer_email} (${tx.plan.toUpperCase()})`,
            email: tx.customer_email,
            plan: tx.plan,
            rateLimitPerMinute: limit,
            isAdFree: tx.plan === 'pro' || tx.plan === 'whitelabel',
            active: true,
            expiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000)
        });

        await newKey.save();
        tx.api_key_issued = rawKey;
        await tx.save();

        return res.json({
            status: 'success',
            message: 'API key successfully generated and linked to transaction.',
            key: rawKey,
            keyMasked: `norra_${rawKey.slice(6, 10)}••••••••••••••••${rawKey.slice(-4)}`
        });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to issue key: ' + err.message });
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

/**
 * POST /api/admin/sync
 * Triggers upstream synchronization of live infeed, leagues, or all fixtures.
 */
router.post('/api/admin/sync', requireAdmin, async (req, res) => {
    try {
        const { syncAllLeagues, syncLiveScoreboards, syncLiveScoreInPlay, syncInGameStats } = require('../services/soccerSyncService');
        const SoccerMatch = require('../models/soccerMatch');
        const SoccerLeague = require('../models/soccerLeague');

        const syncType = req.body?.type || 'all';
        let message = '';
        let statsResult = null;

        if (syncType === 'stats') {
            const limit = Math.min(500, Math.max(10, parseInt(req.body?.limit, 10) || 300));
            statsResult = await syncInGameStats({ limit, forceAll: true });
            message = `Norra AI Training Feed: Deep match telemetry ingested for ${statsResult.statsUpdated} matches across ${statsResult.leaguesCovered} leagues (${statsResult.eventsInserted} key incidents recorded for model training).`;
        } else if (syncType === 'infeed' || syncType === 'live') {
            await Promise.allSettled([syncLiveScoreboards(), syncLiveScoreInPlay()]);
            statsResult = await syncInGameStats({ limit: 60, onlyLive: true });
            message = `Norra AI Live In-Play Telemetry: Real-time infeed sync completed (${statsResult.statsUpdated} active matches updated with live telemetry).`;
        } else {
            await Promise.allSettled([syncAllLeagues(), syncLiveScoreboards(), syncLiveScoreInPlay()]);
            statsResult = await syncInGameStats({ limit: 250, onlyLive: false });
            message = 'Norra AI Multiverse Pipeline: Global league fixtures, tables, and rich match telemetry synchronized successfully.';
        }

        const [matchesCount, inPlayCount, leaguesCount, withStatsCount] = await Promise.all([
            SoccerMatch.countDocuments(),
            SoccerMatch.countDocuments({ 'status.state': 'in' }),
            SoccerLeague.countDocuments({ active: true }),
            SoccerMatch.countDocuments({
                $or: [
                    { 'home.stats': { $exists: true, $ne: null } },
                    { 'key_events.0': { $exists: true } }
                ]
            })
        ]);

        const trainingSamplesCount = withStatsCount;

        // Proactively push sync notification to Norra AI predictor backend so it ingests training samples immediately
        const norraPredictorUrl = process.env.NORRA_PREDICTOR_URL || 'https://i.mynorra.xyz';
        const norraSecretToken = process.env.CRON_TOKEN || process.env.NORRA_INTERNAL_API_KEY || 'norra_live_master_internal_access_2026';
        let norraWebhookDispatched = false;

        try {
            const fetchFn = typeof fetch !== 'undefined' ? fetch : require('node-fetch');
            fetchFn(`${norraPredictorUrl}/api/admin/sync-scores-training-data`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': norraSecretToken
                },
                body: JSON.stringify({
                    token: norraSecretToken,
                    sync_type: syncType,
                    source: 'scores.mynorra.xyz',
                    limit: syncType === 'stats' ? 500 : 200,
                    trigger_refit: (syncType === 'stats' || syncType === 'all')
                })
            }).then(() => {
                console.log(`[LiveSync] Successfully dispatched background training sync webhook to Norra AI (${norraPredictorUrl}).`);
            }).catch(pErr => {
                console.warn('[LiveSync] Notice dispatching training sync webhook to Norra AI:', pErr.message);
            });
            norraWebhookDispatched = true;
        } catch (dispatchErr) {
            console.warn('[LiveSync] Failed to initiate webhook to Norra AI:', dispatchErr.message);
        }

        return res.json({
            success: true,
            message,
            stats: {
                matchesCount,
                inPlayCount,
                leaguesCount,
                withStatsCount,
                trainingSamplesCount,
                norraWebhookDispatched,
                statsResult,
                syncedAt: new Date().toISOString()
            }
        });
    } catch (err) {
        return res.status(500).json({ error: 'Sync failed: ' + err.message });
    }
});

module.exports = app => {
    app.use(router);
};
