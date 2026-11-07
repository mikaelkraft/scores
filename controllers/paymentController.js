const express = require('express');
const router = express.Router();
const SiteSetting = require('../models/siteSetting');
const Transaction = require('../models/transaction');
const ApiKey = require('../models/apiKey');
const User = require('../models/user');
const flutterwaveService = require('../services/flutterwaveService');
const paypalService = require('../services/paypalService');
const { config } = require('../config/env');

const PLAN_LIMITS = {
    free: { rateLimit: 120, isAdFree: false },
    starter: { rateLimit: 500, isAdFree: true },
    pro: { rateLimit: 1500, isAdFree: true },
    whitelabel: { rateLimit: 5000, isAdFree: true }
};

/**
 * GET /api/plans or /api/v1/payments/plans
 * Returns available commercial API plans and USD pricing from database
 */
router.get(['/api/plans', '/api/v1/payments/plans'], async (req, res) => {
    res.set('Cache-Control', 'public, max-age=120');
    try {
        const settings = await SiteSetting.getGlobalSettings();
        const plans = settings.plans || {};

        return res.json({
            baseCurrency: settings.paymentSettings?.baseCurrency || 'USD',
            gateways: {
                flutterwave: settings.paymentSettings?.flutterwaveEnabled !== false,
                paypal: settings.paymentSettings?.paypalEnabled !== false
            },
            plans: [
                {
                    id: 'free',
                    name: 'Free Developer',
                    priceUsd: 0,
                    rateLimitPerMinute: 120,
                    isAdFree: false,
                    whitelabel: false,
                    allowedLeagues: ['eng.1', 'esp.1', 'nga.1'],
                    capabilities: PLAN_LIMITS.free.features,
                    features: [
                        '120 requests / minute',
                        '3 leagues only: English Premier League, La Liga, Nigeria Premier Football League',
                        'Live scoreboards & minute tickers for those leagues',
                        'Fixtures, results & standings for the 3 free leagues',
                        'No H2H, play-by-play, or booking codes',
                        'Community developer support',
                        'Upgrade to unlock all 100+ competitions'
                    ]
                },
                {
                    id: 'starter',
                    name: plans.starter?.name || 'Starter Plan',
                    priceUsd: plans.starter?.priceUsd || 10,
                    rateLimitPerMinute: plans.starter?.rateLimitPerMinute || 500,
                    isAdFree: true,
                    whitelabel: false,
                    capabilities: PLAN_LIMITS.starter.features,
                    features: [
                        '500 requests / minute',
                        'All world competitions (100+ leagues)',
                        'No league restrictions',
                        'Play-by-play match events',
                        'Universal Bet Booking Code Converter',
                        'Ad-free clean JSON payloads',
                        '30-day historical fixtures',
                        'Standard email support'
                    ]
                },
                {
                    id: 'pro',
                    name: plans.pro?.name || 'Pro Developer',
                    priceUsd: plans.pro?.priceUsd || 29,
                    rateLimitPerMinute: plans.pro?.rateLimitPerMinute || 1500,
                    isAdFree: true,
                    whitelabel: false,
                    capabilities: PLAN_LIMITS.pro.features,
                    features: [
                        '1,500 requests / minute',
                        'All leagues + full play-by-play timelines',
                        'Head-to-head (H2H) statistics',
                        'Predictions context for AI engines',
                        'Universal Booking Code API hook',
                        '365-day historical fixtures',
                        'Team lineups & roster profiles',
                        'Priority technical support'
                    ]
                },
                {
                    id: 'whitelabel',
                    name: plans.whitelabel?.name || 'Enterprise Whitelabel',
                    priceUsd: plans.whitelabel?.priceUsd || 79,
                    rateLimitPerMinute: plans.whitelabel?.rateLimitPerMinute || 5000,
                    isAdFree: true,
                    whitelabel: true,
                    capabilities: PLAN_LIMITS.whitelabel.features,
                    features: [
                        '5,000 requests / minute (High Throughput)',
                        'Everything in Pro',
                        'Custom domain / whitelabel embeds',
                        'Direct Norra AI Prediction Engine access',
                        'Multi-bookmaker booking code conversion',
                        'Full historical archive',
                        'Dedicated account manager & VIP channel',
                        'Custom contract & 99.9% uptime SLA'
                    ]
                }
            ]
        });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to fetch API plans' });
    }
});

// Helper: Provision or upgrade an API key on successful payment
async function provisionPaidKey({ email, name, plan, txRef }) {
    const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.starter;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 days subscription

    // Find or create customer account
    let user = await User.findOne({ email });
    if (user) {
        user.plan = plan;
        user.planExpiresAt = expiresAt;
        await user.save();
    }

    // Check if an existing key exists for this user/email
    let apiKey = await ApiKey.findOne({ email, active: true });
    if (apiKey) {
        apiKey.plan = plan;
        apiKey.rateLimitPerMinute = limits.rateLimit;
        apiKey.isAdFree = limits.isAdFree;
        apiKey.expiresAt = expiresAt;
        await apiKey.save();
    } else {
        const keyString = ApiKey.generateKey();
        apiKey = await ApiKey.create({
            key: keyString,
            user: user ? user._id : undefined,
            name: name || `${plan} API Key`,
            email,
            plan,
            rateLimitPerMinute: limits.rateLimit,
            isAdFree: limits.isAdFree,
            expiresAt
        });
    }

    return apiKey;
}

/**
 * POST /api/payments/flutterwave/initialize
 */
router.post(['/api/payments/flutterwave/initialize', '/api/v1/payments/flutterwave/initialize'], async (req, res) => {
    try {
        const { plan, email, name, currency = 'USD' } = req.body;
        if (!plan || !email) {
            return res.status(400).json({ error: 'Plan and customer email are required.' });
        }

        const settings = await SiteSetting.getGlobalSettings();
        const planConfig = settings.plans?.[plan];
        if (!planConfig) {
            return res.status(400).json({ error: 'Invalid plan selected.' });
        }

        const amount = planConfig.priceUsd;
        const tx_ref = `norra_flw_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

        // Record pending transaction
        await Transaction.create({
            tx_ref,
            gateway: 'flutterwave',
            amount,
            currency,
            plan,
            customer_email: email,
            customer_name: name || '',
            status: 'pending'
        });

        const redirect_url = `${config.PUBLIC_SITE_URL}/account?payment_status=flw_callback`;
        const flwResponse = await flutterwaveService.initializePayment({
            tx_ref,
            amount,
            currency,
            customer: { email, name },
            redirect_url,
            meta: { plan, email }
        });

        if (flwResponse.status === 'success' && flwResponse.data?.link) {
            return res.json({
                status: 'success',
                paymentUrl: flwResponse.data.link,
                tx_ref
            });
        }

        return res.status(400).json({ error: flwResponse.message || 'Payment initialization failed.' });
    } catch (err) {
        console.error('Flutterwave init error:', err.message);
        return res.status(500).json({ error: 'Internal payment gateway error.' });
    }
});

/**
 * POST /api/payments/flutterwave/verify
 */
router.post(['/api/payments/flutterwave/verify', '/api/v1/payments/flutterwave/verify'], async (req, res) => {
    try {
        const { transaction_id, tx_ref } = req.body;
        if (!transaction_id && !tx_ref) {
            return res.status(400).json({ error: 'Transaction reference is required.' });
        }

        const verification = await flutterwaveService.verifyTransaction(transaction_id || tx_ref);
        if (verification.status === 'success' && verification.data?.status === 'successful') {
            const queryRef = tx_ref || verification.data.tx_ref;
            const tx = await Transaction.findOne({ tx_ref: queryRef });

            if (tx && tx.status !== 'successful') {
                tx.status = 'successful';
                tx.gateway_ref = String(verification.data.id || transaction_id);
                
                // Provision key
                const apiKey = await provisionPaidKey({
                    email: tx.customer_email,
                    name: tx.customer_name,
                    plan: tx.plan,
                    txRef: tx.tx_ref
                });
                tx.api_key_issued = apiKey.key;
                await tx.save();

                return res.json({
                    status: 'success',
                    message: 'Payment verified successfully! Your API key is ready.',
                    apiKey: apiKey.key,
                    plan: tx.plan,
                    expiresAt: apiKey.expiresAt
                });
            } else if (tx && tx.status === 'successful') {
                return res.json({
                    status: 'success',
                    message: 'Payment already processed.',
                    apiKey: tx.api_key_issued,
                    plan: tx.plan
                });
            }
        }

        return res.status(400).json({ error: 'Payment verification failed or was incomplete.' });
    } catch (err) {
        console.error('Flutterwave verify error:', err.message);
        return res.status(500).json({ error: 'Failed to verify transaction.' });
    }
});

/**
 * POST /api/payments/paypal/create-order
 */
router.post(['/api/payments/paypal/create-order', '/api/v1/payments/paypal/create-order'], async (req, res) => {
    try {
        const { plan, email, name } = req.body;
        if (!plan || !email) {
            return res.status(400).json({ error: 'Plan and customer email are required.' });
        }

        const settings = await SiteSetting.getGlobalSettings();
        const planConfig = settings.plans?.[plan];
        if (!planConfig) {
            return res.status(400).json({ error: 'Invalid plan selected.' });
        }

        const amount = planConfig.priceUsd;
        const tx_ref = `norra_pp_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

        const order = await paypalService.createOrder({
            amount,
            currency: 'USD',
            description: `Norra AI Live Scores - ${planConfig.name}`
        });

        if (order && order.id) {
            await Transaction.create({
                tx_ref,
                gateway: 'paypal',
                gateway_ref: order.id,
                amount,
                currency: 'USD',
                plan,
                customer_email: email,
                customer_name: name || '',
                status: 'pending'
            });

            return res.json({
                orderId: order.id,
                tx_ref
            });
        }

        return res.status(400).json({ error: 'Failed to create PayPal order.' });
    } catch (err) {
        console.error('PayPal create-order error:', err.message);
        return res.status(500).json({ error: 'Internal PayPal error.' });
    }
});

/**
 * POST /api/payments/paypal/capture-order
 */
router.post(['/api/payments/paypal/capture-order', '/api/v1/payments/paypal/capture-order'], async (req, res) => {
    try {
        const { orderId, tx_ref } = req.body;
        if (!orderId) {
            return res.status(400).json({ error: 'Order ID is required.' });
        }

        const capture = await paypalService.captureOrder(orderId);
        if (capture && (capture.status === 'COMPLETED' || capture.mock)) {
            const tx = await Transaction.findOne({ gateway_ref: orderId }) || await Transaction.findOne({ tx_ref });
            if (tx && tx.status !== 'successful') {
                tx.status = 'successful';
                
                const apiKey = await provisionPaidKey({
                    email: tx.customer_email,
                    name: tx.customer_name,
                    plan: tx.plan,
                    txRef: tx.tx_ref
                });
                tx.api_key_issued = apiKey.key;
                await tx.save();

                return res.json({
                    status: 'success',
                    message: 'PayPal payment completed successfully!',
                    apiKey: apiKey.key,
                    plan: tx.plan,
                    expiresAt: apiKey.expiresAt
                });
            }
        }

        return res.status(400).json({ error: 'Could not capture PayPal order.' });
    } catch (err) {
        console.error('PayPal capture error:', err.message);
        return res.status(500).json({ error: 'Failed to capture PayPal payment.' });
    }
});

module.exports = app => {
    app.use(router);
};
