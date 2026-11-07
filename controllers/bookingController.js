const express = require('express');
const router = express.Router();
const bookingHookService = require('../services/bookingHookService');
const { extractApiKey } = require('../middleware/apiKeyAuth');
const ApiKey = require('../models/apiKey');
const SiteSetting = require('../models/siteSetting');

// In-memory daily quota store for IP addresses & keys (for web demo / free tier protection)
const quotaCache = new Map();

function getClientIp(req) {
    const fwd = req.headers['x-forwarded-for'];
    if (fwd) return String(fwd).split(',')[0].trim();
    return req.socket?.remoteAddress || req.ip || '127.0.0.1';
}

function checkAndConsumeQuota(identifier, limit = 5) {
    const now = Date.now();
    let entry = quotaCache.get(identifier);
    if (!entry || now > entry.resetAt) {
        entry = { count: 0, resetAt: now + (24 * 60 * 60 * 1000) };
        quotaCache.set(identifier, entry);
    }
    if (entry.count >= limit) {
        return {
            allowed: false,
            count: entry.count,
            limit,
            remaining: 0,
            resetHours: Math.ceil((entry.resetAt - now) / (60 * 60 * 1000))
        };
    }
    entry.count += 1;
    return {
        allowed: true,
        count: entry.count,
        limit,
        remaining: limit - entry.count,
        resetHours: Math.ceil((entry.resetAt - now) / (60 * 60 * 1000))
    };
}

/**
 * GET /api/v1/booking/providers
 * Returns supported bookmakers and conversion capability
 */
router.get('/api/v1/booking/providers', (req, res) => {
    res.set('Cache-Control', 'public, max-age=3600');
    return res.json({
        status: 'success',
        providers: bookingHookService.getSupportedBookmakers()
    });
});

/**
 * POST /api/v1/booking/generate
 * Hook to book selections and return booking slip
 */
router.post('/api/v1/booking/generate', optionalApiKeyAuth, async (req, res) => {
    if (!requireFeature(req, res, 'bookingCodes', 'Betting code generation')) return;
    try {
        const result = await bookingHookService.generateBookingCode(req.body);
        return res.json(result);
    } catch (err) {
        return res.status(400).json({ error: err.message });
    }
});

/**
 * POST /api/v1/booking/convert
 * Hook to convert code between bookmakers with fair-use tier quota enforcement
 */
router.post('/api/v1/booking/convert', optionalApiKeyAuth, async (req, res) => {
    if (!requireFeature(req, res, 'bookingCodes', 'Betting code conversion')) return;
    try {
        const settings = await SiteSetting.getGlobalSettings().catch(() => null);
        if (settings?.bookingSettings?.hookEnabled === false) {
            return res.status(403).json({ error: 'Universal Bet Booking Code Converter is currently disabled by administrator.' });
        }

        const rawKey = extractApiKey(req);
        let tier = 'web_free';
        let quota = null;

        if (rawKey) {
            const keyDoc = await ApiKey.findOne({ key: rawKey, active: true }).lean().catch(() => null);
            if (keyDoc) {
                tier = keyDoc.plan || 'free';
                if (tier === 'pro' || tier === 'whitelabel' || tier === 'admin') {
                    quota = { allowed: true, limit: 'unlimited', remaining: 999999 };
                } else if (tier === 'starter') {
                    // Starter tier: 500 conversions / day
                    quota = checkAndConsumeQuota(`key:${rawKey}`, 500);
                } else {
                    // Free Developer tier: 10 conversions / day
                    quota = checkAndConsumeQuota(`key:${rawKey}`, 10);
                }
            }
        }

        if (!quota) {
            // Anonymous web visitor: 5 free conversions / day per IP
            const ip = getClientIp(req);
            quota = checkAndConsumeQuota(`ip:${ip}`, 5);
        }

        if (!quota.allowed) {
            return res.status(429).json({
                status: 'rate_limited',
                error: `Daily conversion limit reached (${quota.limit}/${quota.limit}). Upgrade to Starter ($10/mo) for 500 conversions/day or Pro ($29/mo) for unlimited conversions.`,
                quotaLimit: quota.limit,
                quotaRemaining: 0,
                tier,
                resetInHours: quota.resetHours,
                upgradeUrl: '/pricing'
            });
        }

        const result = await bookingHookService.convertBookingCode(req.body);
        result.tier = tier;
        result.quotaLimit = quota.limit;
        result.quotaRemaining = quota.remaining;

        return res.json(result);
    } catch (err) {
        return res.status(400).json({ error: err.message });
    }
});

module.exports = app => {
    app.use(router);
};
