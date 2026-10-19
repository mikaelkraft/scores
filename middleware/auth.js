const jwt = require('jsonwebtoken');
const { config } = require('../config/env');
const User = require('../models/user');

const JWT_SECRET = config.ADMIN_JWT_SECRET || 'norra-scores-jwt-secret-key-2026';

function generateToken(payload, expiresIn = '7d') {
    return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch {
        return null;
    }
}

function extractToken(req) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return authHeader.substring(7).trim();
    }
    if (req.query && req.query.token) {
        return String(req.query.token).trim();
    }
    return null;
}

// Admin authorization middleware
async function requireAdmin(req, res, next) {
    const token = extractToken(req);
    if (!token) {
        return res.status(401).json({ error: 'Admin authentication required.' });
    }

    const decoded = verifyToken(token);
    if (!decoded) {
        return res.status(401).json({ error: 'Invalid or expired authentication token.' });
    }

    // Verify admin role or env fallback
    if (decoded.role === 'admin' || decoded.username === config.ADMIN_USERNAME) {
        req.admin = decoded;
        return next();
    }

    // Double check user in database
    if (decoded.userId) {
        try {
            const user = await User.findById(decoded.userId).lean();
            if (user && user.role === 'admin') {
                req.admin = user;
                return next();
            }
        } catch {}
    }

    return res.status(403).json({ error: 'Access denied: Admin privileges required.' });
}

// Customer account portal authorization middleware
async function requireUser(req, res, next) {
    const token = extractToken(req);
    if (!token) {
        return res.status(401).json({ error: 'User authentication required. Please log in.' });
    }

    const decoded = verifyToken(token);
    if (!decoded || !decoded.userId) {
        return res.status(401).json({ error: 'Invalid or expired session. Please log in again.' });
    }

    try {
        const user = await User.findById(decoded.userId).lean();
        if (!user || !user.active) {
            return res.status(401).json({ error: 'Account not found or suspended.' });
        }
        req.user = user;
        return next();
    } catch (err) {
        return res.status(500).json({ error: 'Internal authentication error.' });
    }
}

module.exports = {
    generateToken,
    requireAdmin,
    requireUser,
    verifyToken,
    JWT_SECRET
};
