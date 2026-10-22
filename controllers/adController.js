const express = require('express');
const router = express.Router();
const SiteSetting = require('../models/siteSetting');
const { optionalApiKeyAuth } = require('../middleware/apiKeyAuth');

/**
 * Public endpoint to fetch active ads, promos, live infeed card and social links.
 * Automatically suppressed for ad slots if the client provides a valid paid API key.
 */
router.get(['/api/v1/ads', '/api/ads/active', '/api/v1/settings/public'], optionalApiKeyAuth, async (req, res) => {
    res.set('Cache-Control', 'public, max-age=30');

    try {
        const settings = await SiteSetting.getGlobalSettings();
        const activePromos = (settings.bookiePromos || []).filter(p => p.active !== false);

        if (req.isAdFree) {
            return res.json({
                isAdFree: true,
                announcement: settings.announcementActive ? settings.announcement : '',
                branding: {
                    siteTitle: settings.siteTitle,
                    tagline: settings.tagline,
                    headerLogoUrl: settings.headerLogoUrl,
                    footerLogoUrl: settings.footerLogoUrl
                },
                ads: {
                    header: { enabled: false },
                    infeed: { enabled: false },
                    inFeed: { enabled: false },
                    drawer: { enabled: false },
                    footer: { enabled: false }
                },
                infeedSettings: settings.infeedSettings || {},
                bookiePromos: [],
                bookmakerPromos: [],
                socialLinks: settings.socialLinks || {}
            });
        }

        return res.json({
            isAdFree: false,
            announcement: settings.announcementActive ? settings.announcement : '',
            branding: {
                siteTitle: settings.siteTitle,
                tagline: settings.tagline,
                headerLogoUrl: settings.headerLogoUrl,
                footerLogoUrl: settings.footerLogoUrl
            },
            ads: {
                header: settings.ads?.header || { enabled: false },
                infeed: settings.ads?.infeed || { enabled: false },
                inFeed: settings.ads?.infeed || { enabled: false },
                drawer: settings.ads?.drawer || { enabled: false },
                footer: settings.ads?.footer || { enabled: false }
            },
            infeedSettings: settings.infeedSettings || {},
            bookiePromos: activePromos,
            bookmakerPromos: activePromos.map(p => ({
                provider: p.bookmaker,
                badgeColor: p.badgeColor,
                headline: p.headline,
                promoCode: p.promoCode,
                ctaText: p.ctaText,
                ctaUrl: p.linkUrl,
                isActive: p.active !== false
            })),
            socialLinks: settings.socialLinks || {}
        });
    } catch (err) {
        console.error('Failed to load active settings/ads:', err.message);
        return res.json({
            isAdFree: false,
            ads: {},
            infeedSettings: {},
            bookiePromos: [],
            socialLinks: {}
        });
    }
});

module.exports = app => {
    app.use(router);
};
