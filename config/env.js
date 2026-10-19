const path = require('path');
const dotenv = require('dotenv');

let configLoaded = false;
let config = null;

// Load environment configuration
function loadEnvConfig() {
  if (configLoaded) return config;

  // Determine runtime environment
  const NODE_ENV = (process.env.NODE_ENV || 'development').trim();

  // Load appropriate environment file
  const envFile = NODE_ENV === 'production' ? '.env.production' : '.env.development';
  const envPath = path.resolve(process.cwd(), envFile);

  // Load environment variables
  const result = dotenv.config({ path: envPath });

  if (result.error) {
    // Fallback to default .env if specific file is not found
    dotenv.config();
  }

  // Base platform configuration
  config = {
    // Environment
    NODE_ENV,
    isDev: NODE_ENV === 'development',
    isProd: NODE_ENV === 'production',
    isDevelopment: NODE_ENV === 'development',
    isProduction: NODE_ENV === 'production',

    // Server & Domains
    PORT: parseInt(process.env.PORT) || 3050,
    PUBLIC_SITE_URL: process.env.PUBLIC_SITE_URL || (NODE_ENV === 'production' ? 'https://scores.mynorra.xyz' : `http://localhost:${process.env.PORT || 3050}`),
    API_URL: process.env.API_URL || process.env.PUBLIC_SITE_URL || `http://localhost:${process.env.PORT || 3050}`,
    FRONTEND_URL: process.env.FRONTEND_URL || process.env.PUBLIC_SITE_URL || `http://localhost:${process.env.PORT || 3050}`,

    // Database
    MONGODB_URL: process.env.MONGODB_URL || 'mongodb://localhost:27017/soccer',

    // Admin & Auth
    ADMIN_USERNAME: process.env.ADMIN_USERNAME || 'admin',
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'NorraScoresAdmin2026!',
    ADMIN_JWT_SECRET: process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET || 'norra-scores-jwt-secret-key-2026',

    // Payment Gateways
    FLUTTERWAVE_PUBLIC_KEY: process.env.FLUTTERWAVE_PUBLIC_KEY || '',
    FLUTTERWAVE_SECRET_KEY: process.env.FLUTTERWAVE_SECRET_KEY || '',
    FLUTTERWAVE_ENCRYPTION_KEY: process.env.FLUTTERWAVE_ENCRYPTION_KEY || '',
    PAYPAL_CLIENT_ID: process.env.PAYPAL_CLIENT_ID || '',
    PAYPAL_CLIENT_SECRET: process.env.PAYPAL_CLIENT_SECRET || '',
    PAYPAL_MODE: process.env.PAYPAL_MODE || 'sandbox', // 'sandbox' or 'live'

    // Google Sign-In & Authentication
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',

    // SMTP Email Services
    SMTP_HOST: process.env.SMTP_HOST || '',
    SMTP_PORT: parseInt(process.env.SMTP_PORT) || 587,
    SMTP_USER: process.env.SMTP_USER || '',
    SMTP_PASS: process.env.SMTP_PASS || '',
    SMTP_FROM: process.env.SMTP_FROM || 'Norra AI <support@mynorra.xyz>',
    SMTP_SECURE: process.env.SMTP_SECURE === 'true',

    // Rate Limiting
    RATE_LIMIT_WINDOW: parseInt(process.env.RATE_LIMIT_WINDOW || process.env.RATE_LIMIT_WINDOW_MS) || 60000,
    RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX) || 500,
    PUBLIC_RATE_LIMIT_WINDOW: parseInt(process.env.PUBLIC_RATE_LIMIT_WINDOW || process.env.PUBLIC_RATE_LIMIT_WINDOW_MS) || 60000,
    PUBLIC_RATE_LIMIT_MAX: parseInt(process.env.PUBLIC_RATE_LIMIT_MAX) || 120,

    // CORS
    CORS_ORIGINS: process.env.CORS_ORIGINS || '*',

    // Logging
    LOG_LEVEL: process.env.LOG_LEVEL || (NODE_ENV === 'production' ? 'error' : 'debug'),

    // Swagger
    ENABLE_SWAGGER: process.env.ENABLE_SWAGGER === 'true' || NODE_ENV === 'development',

    // Helper to retrieve CORS origins array
    getCorsOrigins: function() {
      const origins = process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || '*';
      if (origins === '*') return '*';
      return origins.split(',').map(o => o.trim());
    }
  };

  configLoaded = true;
  return config;
}

// Export both function and config object
module.exports = { loadEnvConfig, config: null };

// Getter for config to ensure it's loaded
Object.defineProperty(module.exports, 'config', {
  get: function() {
    if (!config) loadEnvConfig();
    return config;
  }
});
