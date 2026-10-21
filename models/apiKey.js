const mongoose = require('../database');
const crypto = require('crypto');

const ApiKeySchema = new mongoose.Schema({
    key: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        index: true
    },
    name: {
        type: String,
        required: true,
        trim: true,
        default: 'Production Key'
    },
    email: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
        index: true
    },
    plan: {
        type: String,
        enum: ['free', 'starter', 'pro', 'whitelabel', 'admin', 'internal'],
        default: 'free'
    },
    rateLimitPerMinute: {
        type: Number,
        default: 120
    },
    isAdFree: {
        type: Boolean,
        default: false
    },
    allowedDomains: [{
        type: String,
        trim: true
    }],
    active: {
        type: Boolean,
        default: true
    },
    expiresAt: {
        type: Date
    },
    totalRequests: {
        type: Number,
        default: 0
    },
    lastUsedAt: {
        type: Date
    }
}, {
    collection: 'api_keys',
    timestamps: true,
    versionKey: false
});

// Helper to generate a secure random API key with 'norra_' prefix
ApiKeySchema.statics.generateKey = function(prefix = 'norra') {
    const randomBytes = crypto.randomBytes(24).toString('hex');
    return `${prefix}_${randomBytes}`;
};

module.exports = mongoose.model('ApiKey', ApiKeySchema);
