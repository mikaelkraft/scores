const mongoose = require('../database');

const TransactionSchema = new mongoose.Schema({
    tx_ref: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    gateway: {
        type: String,
        enum: ['flutterwave', 'paypal'],
        required: true
    },
    gateway_ref: {
        type: String,
        default: ''
    },
    amount: {
        type: Number,
        required: true
    },
    currency: {
        type: String,
        required: true,
        default: 'USD'
    },
    plan: {
        type: String,
        required: true,
        enum: ['starter', 'pro', 'whitelabel']
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    customer_email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true
    },
    customer_name: {
        type: String,
        default: ''
    },
    status: {
        type: String,
        enum: ['pending', 'successful', 'failed', 'cancelled'],
        default: 'pending',
        index: true
    },
    api_key_issued: {
        type: String,
        default: ''
    },
    raw_response: {
        type: mongoose.Schema.Types.Mixed,
        select: false
    }
}, {
    collection: 'transactions',
    timestamps: true,
    versionKey: false
});

module.exports = mongoose.model('Transaction', TransactionSchema);
