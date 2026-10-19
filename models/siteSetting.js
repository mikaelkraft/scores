const mongoose = require('../database');

const SiteSettingSchema = new mongoose.Schema({
    key: {
        type: String,
        required: true,
        unique: true,
        default: 'global'
    },
    siteTitle: {
        type: String,
        default: 'Scores by Norra AI'
    },
    tagline: {
        type: String,
        default: 'Real-Time Global Football Scores, Stats & Commercial Sports API'
    },
    headerLogoUrl: {
        type: String,
        default: ''
    },
    footerLogoUrl: {
        type: String,
        default: ''
    },
    announcement: {
        type: String,
        default: 'Welcome to Scores by Norra AI — Real-time live match telemetry and commercial sports API'
    },
    announcementActive: {
        type: Boolean,
        default: false
    },
    plans: {
        starter: {
            priceUsd: { type: Number, default: 19 },
            name: { type: String, default: 'Starter' },
            rateLimitPerMinute: { type: Number, default: 500 },
            description: { type: String, default: 'Ideal for small apps and developer projects.' }
        },
        pro: {
            priceUsd: { type: Number, default: 49 },
            name: { type: String, default: 'Pro Developer' },
            rateLimitPerMinute: { type: Number, default: 1500 },
            description: { type: String, default: 'High throughput for growing sports media websites.' }
        },
        whitelabel: {
            priceUsd: { type: Number, default: 99 },
            name: { type: String, default: 'Whitelabel / Enterprise' },
            rateLimitPerMinute: { type: Number, default: 5000 },
            description: { type: String, default: 'Dedicated limits, custom branded embeds, and full commercial rights.' }
        }
    },
    bookiePromos: [{
        bookmaker: { type: String, default: 'SportyBet' },
        badgeColor: { type: String, default: '#dc2626' },
        headline: { type: String, default: '150% Welcome Bonus on First Deposit' },
        promoCode: { type: String, default: 'NORRA' },
        ctaText: { type: String, default: 'Claim Bonus' },
        linkUrl: { type: String, default: '#' },
        active: { type: Boolean, default: true }
    }],
    ads: {
        header: {
            enabled: { type: Boolean, default: false },
            type: { type: String, enum: ['html', 'image'], default: 'html' },
            htmlContent: { type: String, default: '' },
            imageUrl: { type: String, default: '' },
            linkUrl: { type: String, default: '' }
        },
        infeed: {
            enabled: { type: Boolean, default: false },
            type: { type: String, enum: ['html', 'image'], default: 'html' },
            htmlContent: { type: String, default: '' },
            imageUrl: { type: String, default: '' },
            linkUrl: { type: String, default: '' }
        },
        drawer: {
            enabled: { type: Boolean, default: false },
            type: { type: String, enum: ['html', 'image'], default: 'html' },
            htmlContent: { type: String, default: '' },
            imageUrl: { type: String, default: '' },
            linkUrl: { type: String, default: '' }
        },
        footer: {
            enabled: { type: Boolean, default: false },
            type: { type: String, enum: ['html', 'image'], default: 'html' },
            htmlContent: { type: String, default: '' },
            imageUrl: { type: String, default: '' },
            linkUrl: { type: String, default: '' }
        }
    },
    paymentSettings: {
        flutterwaveEnabled: { type: Boolean, default: true },
        paypalEnabled: { type: Boolean, default: true },
        baseCurrency: { type: String, default: 'USD' }
    },
    featuredLeagues: [{
        type: String
    }],
    bookingSettings: {
        hookEnabled: { type: Boolean, default: true },
        referralCode: { type: String, default: 'NORRA_AI' }
    },
    authSettings: {
        googleClientId: { type: String, default: '' },
        requireEmailVerification: { type: Boolean, default: true }
    },
    smtpSettings: {
        enabled: { type: Boolean, default: false },
        host: { type: String, default: '' },
        port: { type: Number, default: 587 },
        secure: { type: Boolean, default: false },
        user: { type: String, default: '' },
        pass: { type: String, default: '' },
        fromEmail: { type: String, default: 'Norra AI <support@mynorra.xyz>' }
    }
}, {
    collection: 'site_settings',
    timestamps: true,
    versionKey: false
});

// Singleton helper to fetch or create default settings
SiteSettingSchema.statics.getGlobalSettings = async function() {
    let settings = await this.findOne({ key: 'global' });
    if (!settings) {
        settings = await this.create({
            key: 'global',
            bookiePromos: [
                {
                    bookmaker: 'SportyBet',
                    badgeColor: '#dc2626',
                    headline: '150% Welcome Bonus on First Deposit',
                    promoCode: 'NORRA',
                    ctaText: 'Claim Bonus',
                    linkUrl: 'https://www.sportybet.com/',
                    active: true
                },
                {
                    bookmaker: 'Bet9ja',
                    badgeColor: '#16a34a',
                    headline: '100% Match Bonus + 170% Multiple Boost',
                    promoCode: 'NORRABET',
                    ctaText: 'Play Now',
                    linkUrl: 'https://sports.bet9ja.com/',
                    active: true
                },
                {
                    bookmaker: 'MSport',
                    badgeColor: '#ea580c',
                    headline: 'Up to 500,000 NGN Welcome Voucher Pack',
                    promoCode: 'NORRAVIP',
                    ctaText: 'Get Voucher',
                    linkUrl: 'https://www.msport.com/',
                    active: true
                }
            ],
            featuredLeagues: ['eng.1', 'esp.1', 'uefa.champions', 'ita.1', 'ger.1']
        });
    }
    return settings;
};

module.exports = mongoose.model('SiteSetting', SiteSettingSchema);
