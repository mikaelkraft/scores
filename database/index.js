const mongoose = require('mongoose');
const { loadEnvConfig } = require('../config/env');
loadEnvConfig();

// Set strictQuery before connection
mongoose.set('strictQuery', false);

// MongoDB connection - Configuration from environment variables
const isProd = process.env.NODE_ENV === 'production';

const MONGODB_CONFIG = isProd ? {
    url: process.env.MONGODB_URL,
    options: {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        maxPoolSize: 20,
        minPoolSize: 2,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 30000,
    }
} : {
    url: process.env.MONGODB_URL || 'mongodb://localhost:27017/soccer',
    options: {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        maxPoolSize: 20,
        minPoolSize: 2,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 30000,
    }
};

console.log(`🔌 Connecting to MongoDB (${isProd ? 'Production' : 'Development'})...`);

const connectWithRetry = () => {
    mongoose.connect(MONGODB_CONFIG.url, MONGODB_CONFIG.options)
    .then(() => {
        console.log("✅ Successful connection with MongoDB");
    }).catch((err) => {
        console.warn('⚠️ Warning: MongoDB connection attempt failed:', err.message);
        if (isProd && process.env.STRICT_DB === 'true') {
            console.error('❌ Exiting due to strict DB requirement in production.');
            process.exit(1);
        } else if (process.env.NODE_ENV === 'test') {
            return;
        } else {
            console.log('🔄 Will retry MongoDB connection in 5 seconds...');
            const retryTimer = setTimeout(connectWithRetry, 5000);
            if (retryTimer && typeof retryTimer.unref === 'function') {
                retryTimer.unref();
            }
        }
    });
};

connectWithRetry();

mongoose.Promise = global.Promise;

module.exports = mongoose;
