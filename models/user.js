const mongoose = require('../database');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
        index: true
    },
    passwordHash: {
        type: String,
        required: false // Optional for Google Sign-In users
    },
    googleId: {
        type: String,
        sparse: true,
        index: true
    },
    authProvider: {
        type: String,
        enum: ['local', 'google'],
        default: 'local'
    },
    avatarUrl: {
        type: String,
        default: ''
    },
    fullName: {
        type: String,
        default: '',
        trim: true
    },
    companyName: {
        type: String,
        default: '',
        trim: true
    },
    isEmailVerified: {
        type: Boolean,
        default: false
    },
    emailVerificationToken: {
        type: String,
        default: null,
        index: true
    },
    emailVerificationExpires: {
        type: Date,
        default: null
    },
    plan: {
        type: String,
        enum: ['free', 'starter', 'pro', 'whitelabel'],
        default: 'free'
    },
    planExpiresAt: {
        type: Date
    },
    role: {
        type: String,
        enum: ['user', 'admin'],
        default: 'user'
    },
    active: {
        type: Boolean,
        default: true
    }
}, {
    collection: 'users',
    timestamps: true,
    versionKey: false
});

UserSchema.methods.verifyPassword = async function(password) {
    if (!this.passwordHash) return false;
    return bcrypt.compare(password, this.passwordHash);
};

UserSchema.statics.hashPassword = async function(password) {
    return bcrypt.hash(password, 10);
};

module.exports = mongoose.model('User', UserSchema);
