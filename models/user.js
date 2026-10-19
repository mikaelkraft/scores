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
        required: true
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
    return bcrypt.compare(password, this.passwordHash);
};

UserSchema.statics.hashPassword = async function(password) {
    return bcrypt.hash(password, 10);
};

module.exports = mongoose.model('User', UserSchema);
