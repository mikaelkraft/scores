// Load environment configuration
const { loadEnvConfig, config } = require('./config/env');
const nodeEnv = loadEnvConfig();

const express = require('express');
const path = require('path');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const helmet = require('helmet');
const cors = require('cors');

// Catch unhandled errors
process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err);
    console.error(err.stack);
    // Don't exit in dev
    // if (config.isProd) process.exit(1);
});
process.on('unhandledRejection', (err) => {
    console.error('❌ Unhandled Rejection:', err);
    console.error(err.stack);
    // Don't exit in dev
    // if (config.isProd) process.exit(1);
});

const app = express();
const PORT = config.PORT;

// Trust proxy - MUST be set when behind nginx/reverse proxy
// Fixes: ERR_ERL_UNEXPECTED_X_FORWARDED_FOR
app.set('trust proxy', 1);

// Keep the machine-readable contract available in every environment. The
// interactive Swagger UI remains configurable because it carries more assets.
let swaggerUi, specs;
console.log(`🔍 ENABLE_SWAGGER value: ${config.ENABLE_SWAGGER}`);
try {
    const swagger = require('./swagger');
    specs = swagger.specs;
    if (config.ENABLE_SWAGGER) {
        swaggerUi = swagger.swaggerUi;
    }
    console.log(`✅ OpenAPI loaded: swaggerUi=${!!swaggerUi}, specs=${!!specs}`);
} catch(err) {
    console.error('❌ OpenAPI failed to load:', err.message);
}

// CORS - public read endpoints must be reachable from browsers on other origins
const corsOrigins = config.getCorsOrigins();
const publicCorsOptions = {
    origin: corsOrigins,
    methods: ['GET', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept'],
    credentials: false
};
app.use(cors(publicCorsOptions));

// Security middleware
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));

// Compression for faster responses
app.use(compression());

// Rate limiting - configurable per environment
const { extractApiKey, isMasterAdminKey } = require('./middleware/apiKeyAuth');

const shouldSkipRateLimit = (req) => {
    const rawKey = extractApiKey(req);
    return isMasterAdminKey(rawKey);
};

const baseLimiter = rateLimit({
    windowMs: config.RATE_LIMIT_WINDOW,
    max: config.RATE_LIMIT_MAX,
    message: {
        error: 'Too many requests, please try again later.',
        retryAfter: `${Math.ceil(config.RATE_LIMIT_WINDOW / 1000)} seconds`
    },
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false },
    skip: shouldSkipRateLimit
});
const publicGetLimiter = rateLimit({
    windowMs: config.PUBLIC_RATE_LIMIT_WINDOW,
    max: config.PUBLIC_RATE_LIMIT_MAX,
    message: {
        error: 'Too many requests from this IP, please try again later.',
        retryAfter: `${Math.ceil(config.PUBLIC_RATE_LIMIT_WINDOW / 1000)} seconds`
    },
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false },
    skip: shouldSkipRateLimit
});
app.use((req, res, next) => {
    if (req.path.startsWith('/get')) {
        return publicGetLimiter(req, res, next);
    }

    return baseLimiter(req, res, next);
});

// Logging
app.use(morgan(':date[iso] :method :url :status :res[content-length] - :response-time ms', {
    skip: (req, res) => config.isProd && res.statusCode < 400
}));

if (config.LOG_LEVEL === 'debug') {
    // Request logger - useful locally, too noisy under production traffic
    app.use((req, res, next) => {
        const start = Date.now();
        console.log(`📥 ${req.method} ${req.url} from ${req.ip}`);
        
        res.on('finish', () => {
            const duration = Date.now() - start;
            const statusIcon = res.statusCode >= 400 ? '❌' : '✅';
            console.log(`${statusIcon} ${req.method} ${req.url} → ${res.statusCode} (${duration}ms)`);
        });
        
        next();
    });
}

console.log(`🌍 Environment: ${config.NODE_ENV}`);
console.log(`📊 Rate Limit: ${config.RATE_LIMIT_MAX} req/${config.RATE_LIMIT_WINDOW}ms`);
console.log(`📊 Public /get Rate Limit: ${config.PUBLIC_RATE_LIMIT_MAX} req/${config.PUBLIC_RATE_LIMIT_WINDOW}ms`);
console.log(`🔗 CORS Origin: ${typeof corsOrigins === 'string' ? corsOrigins : corsOrigins.join(', ')}`);

app.use(express.urlencoded({ extended: false }));
app.use(express.json({ limit: '10kb' }));

// JSON and health endpoints are useful to clients but should not compete with
// the human-facing league pages in search results.
app.use(['/get', '/health', '/api/health', '/openapi.json', '/service-info.json'], (req, res, next) => {
    const requestPath = req.originalUrl.split('?')[0];
    const discoveryResource = ['/openapi.json', '/service-info.json', '/get/soccer/meta'].includes(requestPath);
    res.set('X-Robots-Tag', discoveryResource ? 'noindex' : 'noindex, nofollow');
    next();
});

// The HTML file is a server-rendering template, not a public static asset.
app.get('/assets/index.html', (req, res) => {
    res.set('X-Robots-Tag', 'noindex, nofollow');
    return res.status(404).type('text/plain').send('Not found');
});

// Crawlers, browsers and social scrapers expect these at the site root.
const ROOT_ASSETS = {
    '/favicon.ico': 'favicon.ico',
    '/favicon.svg': 'favicon.svg',
    '/apple-touch-icon.png': 'apple-touch-icon.png',
    '/apple-touch-icon-precomposed.png': 'apple-touch-icon.png',
    '/og-image.png': 'og-image.png'
};
for (const [route, file] of Object.entries(ROOT_ASSETS)) {
    app.get(route, (req, res) => {
        res.set('Cache-Control', config.isProd ? 'public, max-age=604800' : 'no-store');
        return res.sendFile(path.join(__dirname, 'public', file));
    });
}

app.use('/assets', express.static(path.join(__dirname, 'public'), {
    index: false,
    maxAge: 0,
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.js') || filePath.endsWith('.css')) {
            res.set('Cache-Control', 'public, max-age=0, must-revalidate');
        }
    }
}));

app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads'), {
    maxAge: config.isProd ? '30d' : 0
}));

// Commercial Pricing Page
app.get(['/pricing', '/pricing/'], (req, res) => {
    return res.sendFile(path.join(__dirname, 'public', 'pricing', 'index.html'));
});

// Developer Documentation Portal
app.get(['/docs', '/docs/'], (req, res) => {
    return res.sendFile(path.join(__dirname, 'public', 'docs', 'index.html'));
});

// Customer Account Portal
app.get(['/account', '/account/'], (req, res) => {
    return res.sendFile(path.join(__dirname, 'public', 'account', 'index.html'));
});

// Admin Dashboard
app.get(['/admin', '/admin/'], (req, res) => {
    return res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

// Legal Pages (Terms & Privacy)
app.get('/terms', (req, res) => {
    return res.sendFile(path.join(__dirname, 'public', 'terms.html'));
});

app.get('/privacy', (req, res) => {
    return res.sendFile(path.join(__dirname, 'public', 'privacy.html'));
});

// OpenAPI is a bounded discovery document for API clients and answer engines.
if (specs) {
    app.get('/openapi.json', (req, res) => {
        res.set('Cache-Control', 'public, max-age=300');
        return res.json(specs);
    });
}

// Swagger Documentation
if (swaggerUi && specs) {
    app.use('/api-docs', (req, res, next) => {
        res.set('Cache-Control', 'no-store, max-age=0');
        next();
    }, swaggerUi.serve, swaggerUi.setup(null, {
        customCss: '.swagger-ui .topbar { display: none }',
        customSiteTitle: 'Norra AI Live Football Scores API Documentation',
        swaggerOptions: {
            url: '/openapi.json',
            displayRequestDuration: true,
            persistAuthorization: false
        }
    }));
    console.log('📚 Swagger UI available at /api-docs');
} else {
    console.log('⚠️ Swagger NOT mounted! swaggerUi:', !!swaggerUi, 'specs:', !!specs);
}

app.get('/service-info.json', (req, res) => {
    res.set('Cache-Control', 'public, max-age=300');
    res.json({
        name: 'Norra AI Live Football Scores & Commercial Sports API',
        version: require('./package.json').version,
        canonicalSite: config.PUBLIC_SITE_URL || 'https://scores.mynorra.xyz',
        dataSource: 'MongoDB',
        upstreamCalls: false,
        access: { price: 'freemium', apiKeyRequired: false, plans: '/api/plans', rateLimited: true },
        documentation: '/api-docs/',
        openapi: '/openapi.json',
        aiGuide: '/ai-data-guide.md',
        llms: '/llms.txt',
        llmsFull: '/llms-full.txt',
        coverage: '/get/soccer/meta',
        limitations: [
            'Values are stored snapshots and are not guaranteed to be real time.',
            'Missing data must not be inferred.',
            'This service does not provide video streaming or claim official league status.'
        ],
        attribution: {
            sourceCodeLicense: 'ISC',
            dataLicense: 'No separate football-data license is asserted.',
            preferredCitation: 'Link to the canonical match, club or competition page.'
        },
        endpoints: {
            leagues: '/get/soccer/leagues',
            scoreboard: '/get/soccer/{league}/scoreboard',
            clubs: '/get/soccer/{league}/clubs',
            standings: '/get/soccer/{league}/standings',
            matchSummary: '/get/soccer/{league}/summary?event={eventId}'
        }
    });
});

app.get('/ai-data-guide.md', (req, res) => {
    res.type('text/markdown');
    res.set('Cache-Control', 'public, max-age=3600');
    return res.sendFile(path.join(__dirname, 'AI-DATA-GUIDE.md'));
});

app.get('/business-context.md', (req, res) => {
    res.type('text/markdown');
    res.set('Cache-Control', 'public, max-age=300');
    return res.sendFile(path.join(__dirname, 'BUSINESS-CONTEXT.md'));
});

require('./controllers/index')(app);

app.use((req, res, next) => {
    console.log(`⚠️ 404 Not Found: ${req.method} ${req.url} from ${req.ip}`);
    const erro = new Error('Route not found');
    erro.status = 404;
    next(erro);
});

app.use((error, req, res, next) => {
    console.error(`❌ Error ${error.status || 500}: ${error.message} | ${req.method} ${req.url}`);
    if (error.stack) console.error(error.stack);
    res.set('X-Robots-Tag', 'noindex, nofollow');
    res.set('Cache-Control', 'no-store');
    res.status(error.status || 500);
    return res.send({
        error: {
            message: error.message
        }
    })
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server started on port ${PORT}`);

    // Seed / Ensure Norra AI Master Admin Key exists in database
    const ApiKey = require('./models/apiKey');
    setTimeout(async () => {
        try {
            const masterKey = config.NORRA_INTERNAL_API_KEY || 'norra_live_master_internal_access_2026';
            await ApiKey.updateOne(
                { key: masterKey },
                {
                    $set: {
                        name: 'Norra AI Prediction Engine (Master Admin Key)',
                        email: 'admin@mynorra.xyz',
                        plan: 'admin',
                        rateLimitPerMinute: 0,
                        isAdFree: true,
                        active: true
                    }
                },
                { upsert: true }
            );
            console.log('🔑 Norra AI Master Admin API Key active and ready for decoupled sync.');
        } catch (e) {
            console.warn('Notice seeding master key:', e.message);
        }
    }, 2000);

    // Auto-sync live scores and world leagues in background
    const { syncAllLeagues, syncLiveScoreboards, syncLiveScoreInPlay, syncInGameStats, cleanupStuckMatchesAndPurgeNcaa } = require('./services/soccerSyncService');

    // Initial live scoreboard and in-play ingestion on boot (5 seconds after server is accepting traffic)
    setTimeout(async () => {
        try {
            await Promise.allSettled([
                syncLiveScoreboards(),
                syncLiveScoreInPlay()
            ]);
            console.log('⚡ [LiveSync] Initial live scoreboard ingestion complete.');
        } catch (e) {
            console.warn('Initial live sync notice:', e.message);
        }
    }, 5000);

    // Run database cleanup and auto-finalize in background 30 seconds after boot
    setTimeout(() => {
        if (typeof cleanupStuckMatchesAndPurgeNcaa === 'function') {
            cleanupStuckMatchesAndPurgeNcaa().catch(e => console.warn('Cleanup notice:', e.message));
        }
    }, 30000);

    // Fast in-play scoreboard and live match infeed refresh every 60 seconds
    const liveScoreInterval = setInterval(() => {
        Promise.allSettled([
            syncLiveScoreboards(),
            syncLiveScoreInPlay()
        ]).then(() => {
            return syncInGameStats({ limit: 20, onlyLive: true });
        }).catch(e => console.warn('Live infeed sync notice:', e.message));
    }, 60 * 1000);
    if (liveScoreInterval && typeof liveScoreInterval.unref === 'function') {
        liveScoreInterval.unref();
    }

    // Initial deep league schedules sync after 5 minutes of server uptime, then every 6 hours
    setTimeout(() => {
        syncAllLeagues().catch(e => console.warn('[LiveSync] Background league sync notice:', e.message));
    }, 5 * 60 * 1000);

    const deepSyncInterval = setInterval(() => {
        Promise.allSettled([
            syncAllLeagues(),
            syncInGameStats({ limit: 60, onlyLive: false })
        ]).catch(e => console.warn('Deep sync notice:', e.message));
    }, 6 * 60 * 60 * 1000);
    if (deepSyncInterval && typeof deepSyncInterval.unref === 'function') {
        deepSyncInterval.unref();
    }
});
