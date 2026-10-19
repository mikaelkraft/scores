const ApiKey = require('../models/apiKey');

// In-memory cache for fast key validation and minimal DB round-trips
const keyCache = new Map();
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

// Simple per-minute sliding window rate limiter per API key
const requestCounters = new Map();

function extractApiKey(req) {
    if (req.headers['x-api-key']) {
        return String(req.headers['x-api-key']).trim();
    }
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer norra_')) {
        return authHeader.substring(7).trim();
    }
    if (req.query && req.query.api_key) {
        return String(req.query.api_key).trim();
    }
    return null;
}

async function resolveApiKey(rawKey) {
    if (!rawKey) return null;

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
    const limit = keyDoc.rateLimitPerMinute || 120;
    const { allowed, remaining } = checkRateLimit(keyDoc.key, limit);
    res.set('X-RateLimit-Limit', String(limit));
    res.set('X-RateLimit-Remaining', String(Math.max(0, remaining)));

    if (!allowed) {
        return res.status(429).json({
            error: 'Rate limit exceeded for this API key tier. Please upgrade for higher throughput.',
            limit,
            retryAfter: '60 seconds',
            upgradeUrl: '/api/plans'
        });
    }

    req.apiKey = keyDoc;
    req.isAdFree = Boolean(keyDoc.isAdFree);

    // Asynchronously record usage without awaiting
    ApiKey.updateOne({ _id: keyDoc._id }, {
        $inc: { totalRequests: 1 },
        $set: { lastUsedAt: new Date() }
    }).catch(() => {});

    return next();
}

module.exports = {
    extractApiKey,
    optionalApiKeyAuth,
    requireApiKey,
    keyCache
};
