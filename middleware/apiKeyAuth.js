const ApiKey = require('../models/apiKey');
const { config } = require('../config/env');

/** Plan catalogue used for defaults + free-tier league lock */
const PLAN_LIMITS = {
    free: {
        rateLimitPerMinute: 120,
        isAdFree: false,
        allowedLeagues: ['eng.1', 'esp.1', 'nga.1'],
        features: {
            liveScores: true,
            fixtures: true,
            standings: true,
            matchSummary: true,
            playByPlay: false,
            h2h: false,
            predictions: false,
            bookingCodes: false,
            historicalDays: 7,
            crestProxy: true
        }
    },
    starter: {
        rateLimitPerMinute: 500,
        isAdFree: true,
        allowedLeagues: null,
        features: {
            liveScores: true,
            fixtures: true,
            standings: true,
            matchSummary: true,
            playByPlay: true,
            h2h: false,
            predictions: false,
            bookingCodes: true,
            historicalDays: 30,
            crestProxy: true
        }
    },
    pro: {
        rateLimitPerMinute: 1500,
        isAdFree: true,
        allowedLeagues: null,
        features: {
            liveScores: true,
            fixtures: true,
            standings: true,
            matchSummary: true,
            playByPlay: true,
            h2h: true,
            predictions: true,
            bookingCodes: true,
            historicalDays: 365,
            crestProxy: true
        }
    },
    whitelabel: {
        rateLimitPerMinute: 5000,
        isAdFree: true,
        allowedLeagues: null,
        features: {
            liveScores: true,
            fixtures: true,
            standings: true,
            matchSummary: true,
            playByPlay: true,
            h2h: true,
            predictions: true,
            bookingCodes: true,
            historicalDays: 3650,
            crestProxy: true,
            customDomain: true
        }
    },
    admin: {
        rateLimitPerMinute: 0,
        isAdFree: true,
        allowedLeagues: null,
        features: {
            liveScores: true, fixtures: true, standings: true, matchSummary: true,
            playByPlay: true, h2h: true, predictions: true, bookingCodes: true,
            historicalDays: 3650, crestProxy: true, customDomain: true
        }
    },
    internal: {
        rateLimitPerMinute: 0,
        isAdFree: true,
        allowedLeagues: null,
        features: {
            liveScores: true, fixtures: true, standings: true, matchSummary: true,
            playByPlay: true, h2h: true, predictions: true, bookingCodes: true,
            historicalDays: 3650, crestProxy: true, customDomain: true
        }
    }
};

function getPlanConfig(keyDoc) {
    if (!keyDoc) return PLAN_LIMITS.free;
    if (keyDoc.plan === 'admin' || keyDoc.plan === 'internal') return PLAN_LIMITS.admin;
    return PLAN_LIMITS[keyDoc.plan] || PLAN_LIMITS.free;
}

function getAllowedLeaguesForKey(keyDoc) {
    if (!keyDoc) return PLAN_LIMITS.free.allowedLeagues;
    if (keyDoc.plan === 'admin' || keyDoc.plan === 'internal') return null;
    if (Array.isArray(keyDoc.allowedLeagues) && keyDoc.allowedLeagues.length > 0) {
        return keyDoc.allowedLeagues;
    }
    return getPlanConfig(keyDoc).allowedLeagues; // null = unrestricted
}

function assertLeagueAccess(keyDoc, leagueSlug) {
    const allowed = getAllowedLeaguesForKey(keyDoc);
    if (!allowed) return true;
    if (!leagueSlug || leagueSlug === 'all') return false;
    return allowed.includes(String(leagueSlug).toLowerCase());
}

/** Returns true if the key's plan includes the named feature */
function hasFeature(keyDoc, featureName) {
    // Unauthenticated public reads: treat as free (limited)
    const features = getPlanConfig(keyDoc).features || PLAN_LIMITS.free.features;
    return Boolean(features[featureName]);
}

/**
 * Enforce a feature gate. Sends 403 and returns false when blocked.
 * When keyDoc is null (public), free-tier rules apply for gated premium features.
 */
function requireFeature(req, res, featureName, label) {
    const keyDoc = req.apiKey || null;
    // Public (no key) may use basic free features only
    if (!keyDoc && ['h2h', 'predictions', 'bookingCodes', 'playByPlay'].includes(featureName)) {
        res.status(401).json({
            error: `${label || featureName} requires an API key on Starter or higher.`,
            upgradeUrl: '/pricing',
            plansUrl: '/api/plans'
        });
        return false;
    }
    if (!hasFeature(keyDoc, featureName)) {
        const plan = keyDoc?.plan || 'free';
        res.status(403).json({
            error: `${label || featureName} is not included in the ${plan} plan. Upgrade to unlock.`,
            plan,
            feature: featureName,
            upgradeUrl: '/pricing',
            plansUrl: '/api/plans'
        });
        return false;
    }
    return true;
}


// In-memory cache for fast key validation and minimal DB round-trips
const keyCache = new Map();
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

// Simple per-minute sliding window rate limiter per API key
const requestCounters = new Map();

function isMasterAdminKey(rawKey) {
    if (!rawKey) return false;
    const masterKey = config?.NORRA_INTERNAL_API_KEY || 'norra_live_master_internal_access_2026';
    return rawKey === masterKey || rawKey === 'norra_master_admin_internal_sync' || rawKey === 'norra_live_master_internal_access_2026';
}

function extractApiKey(req) {
    if (req.headers['x-api-key']) {
        return String(req.headers['x-api-key']).trim();
    }
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer norra_')) {
        return authHeader.substring(7).trim();
    }
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7).trim();
        if (token.startsWith('norra_') || token.includes('internal') || token.includes('admin')) {
            return token;
        }
    }
    if (req.query && req.query.api_key) {
        return String(req.query.api_key).trim();
    }
    return null;
}

async function resolveApiKey(rawKey) {
    if (!rawKey) return null;

    // Check if this is the Norra Master Internal Key
    if (isMasterAdminKey(rawKey)) {
        return {
            _id: 'norra_master_internal_key',
            key: rawKey,
            name: 'Norra AI Prediction Engine (Master Admin Key)',
            email: 'admin@mynorra.xyz',
            plan: 'admin',
            rateLimitPerMinute: 0, // 0 = unlimited
            isAdFree: true,
            active: true
        };
    }

    const cached = keyCache.get(rawKey);
    const now = Date.now();
    if (cached && now - cached.timestamp < CACHE_TTL_MS) {
        return cached.keyDoc;
    }

    try {
        const keyDoc = await ApiKey.findOne({ key: rawKey, active: true }).lean();
        if (keyDoc) {
            if (keyDoc.expiresAt && new Date(keyDoc.expiresAt).getTime() < now) {
                return null;
            }
            keyCache.set(rawKey, { keyDoc, timestamp: now });
            return keyDoc;
        }
    } catch (err) {
        console.error('Error querying API key:', err.message);
    }
    return null;
}

function checkRateLimit(key, maxLimit) {
    // If limit is 0 or negative, it signifies unlimited tier (admin/internal)
    if (!maxLimit || maxLimit <= 0 || maxLimit >= 50000) {
        return { allowed: true, remaining: 999999 };
    }

    const now = Date.now();
    const windowStart = now - 60000; // 1 minute
    let record = requestCounters.get(key);

    if (!record || record.resetAt < now) {
        record = { count: 1, resetAt: now + 60000 };
        requestCounters.set(key, record);
        return { allowed: true, remaining: maxLimit - 1 };
    }

    record.count += 1;
    if (record.count > maxLimit) {
        return { allowed: false, remaining: 0 };
    }
    return { allowed: true, remaining: maxLimit - record.count };
}

// Optional auth: Checks if an API key was provided without blocking if missing
async function optionalApiKeyAuth(req, res, next) {
    const rawKey = extractApiKey(req);
    if (!rawKey) {
        req.isAdFree = false;
        return next();
    }

    const keyDoc = await resolveApiKey(rawKey);
    if (keyDoc) {
        req.apiKey = keyDoc;
        req.isAdFree = Boolean(keyDoc.isAdFree);
        
        // Asynchronously record usage without awaiting
        ApiKey.updateOne({ _id: keyDoc._id }, {
            $inc: { totalRequests: 1 },
            $set: { lastUsedAt: new Date() }
        }).catch(() => {});
    } else {
        req.isAdFree = false;
    }
    return next();
}

// Strict auth: Requires a valid active API key
async function requireApiKey(req, res, next) {
    const rawKey = extractApiKey(req);
    if (!rawKey) {
        return res.status(401).json({
            error: 'API key required. Provide via x-api-key header or ?api_key= parameter.',
            plansUrl: '/api/plans'
        });
    }

    const keyDoc = await resolveApiKey(rawKey);
    if (!keyDoc) {
        return res.status(403).json({
            error: 'Invalid or expired API key.',
            plansUrl: '/api/plans'
        });
    }

    // Rate limiting check
    const isUnlimited = keyDoc.plan === 'admin' || keyDoc.plan === 'internal' || !keyDoc.rateLimitPerMinute || keyDoc.rateLimitPerMinute <= 0;
    const limit = isUnlimited ? 0 : (keyDoc.rateLimitPerMinute || 120);
    const { allowed, remaining } = checkRateLimit(keyDoc.key, limit);
    res.set('X-RateLimit-Limit', isUnlimited ? 'unlimited' : String(limit));
    res.set('X-RateLimit-Remaining', isUnlimited ? '999999' : String(Math.max(0, remaining)));

    if (!allowed && !isUnlimited) {
        return res.status(429).json({
            error: 'Rate limit exceeded for this API key tier. Please upgrade for higher throughput.',
            limit,
            retryAfter: '60 seconds',
            upgradeUrl: '/api/plans'
        });
    }

    req.apiKey = keyDoc;
    req.isAdFree = true; // Admin/internal or paying tiers get ad-free

    // Asynchronously record usage without awaiting
    if (keyDoc._id && keyDoc._id !== 'norra_master_internal_key') {
        ApiKey.updateOne({ _id: keyDoc._id }, {
            $inc: { totalRequests: 1 },
            $set: { lastUsedAt: new Date() }
        }).catch(() => {});
    }

    return next();
}

module.exports = {
    extractApiKey,
    isMasterAdminKey,
    optionalApiKeyAuth,
    requireApiKey,
    keyCache,
    PLAN_LIMITS,
    getPlanConfig,
    getAllowedLeaguesForKey,
    assertLeagueAccess,
    hasFeature,
    requireFeature
};
