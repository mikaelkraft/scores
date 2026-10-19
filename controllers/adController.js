const express = require('express');
const router = express.Router();
const SiteSetting = require('../models/siteSetting');
const { optionalApiKeyAuth } = require('../middleware/apiKeyAuth');

/**
 * Public endpoint to fetch active ads and sponsor promotions.
 * Automatically suppressed if the client provides a valid paid API key.
 */
router.get('/api/ads/active', optionalApiKeyAuth, async (req, res) => {
    res.set('Cache-Control', 'public, max-age=60');

    // If client is an ad-free paid API user or white-label customer, suppress all ads
    if (req.isAdFree) {
        return res.json({
            isAdFree: true,
            ads: {
                header: { enabled: false },
                infeed: { enabled: false },
                drawer: { enabled: false },
                footer: { enabled: false }
            },
            bookiePromos: []
        });
    }

    try {
        const settings = await SiteSetting.getGlobalSettings();
        const activePromos = (settings.bookiePromos || []).filter(p => p.active !== false);

        return res.json({
            isAdFree: false,
            ads: settings.ads || {},
            bookiePromos: activePromos
        });
    } catch (err) {
        console.error('Failed to load active ads:', err.message);
        return res.json({
            isAdFree: false,
            ads: {},
            bookiePromos: []
        });
    }
});

module.exports = app => {
    app.use(router);
};
