const mongoose = require('mongoose');
const packageJson = require('../package.json');

module.exports = (app) => {
    
    /**
     * @swagger
     * /health:
     *   get:
     *     summary: Health check endpoint
     *     description: Check the health status of the API and database connection
     *     tags: [Health]
     *     security: []
     *     responses:
     *       200:
     *         description: Service is healthy
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 status:
     *                   type: string
     *                   example: healthy
     *                 timestamp:
     *                   type: string
     *                   format: date-time
     *                 uptime:
     *                   type: number
     *                   description: Server uptime in seconds
     *                 version:
     *                   type: string
     *                   example: 2.0.0
     *                 database:
     *                   type: object
     *                   properties:
     *                     status:
     *                       type: string
     *                       example: connected
     *                     name:
     *                       type: string
     *       503:
     *         description: Service is unhealthy
     */
    app.get('/health', async (req, res) => {
        try {
            // Check MongoDB connection
            const dbStatus = mongoose.connection.readyState;
            const dbStatusText = {
                0: 'disconnected',
                1: 'connected',
                2: 'connecting',
                3: 'disconnecting'
            }[dbStatus] || 'unknown';

            const isHealthy = dbStatus === 1;

            const healthData = {
                status: isHealthy ? 'healthy' : 'degraded',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                version: packageJson.version,
                environment: process.env.NODE_ENV || 'development',
                database: {
                    status: dbStatusText,
                    name: mongoose.connection.name || 'N/A'
                },
                memory: {
                    used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
                    total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB'
                }
            };

            // Return 200 for cloud container liveness checks (Render/FastCron) so temporary DB retries don't abort deploys.
            // Support ?strict=true for deep readiness probes.
            const statusCode = (req.query.strict === 'true' && !isHealthy) ? 503 : 200;
            
            return res.status(statusCode).json(healthData);
        } catch (error) {
            return res.status(req.query.strict === 'true' ? 503 : 200).json({
                status: 'degraded',
                timestamp: new Date().toISOString(),
                error: error.message
            });
        }
    });

    /**
     * @swagger
     * /api/health:
     *   get:
     *     summary: API health check (alias)
     *     description: Alternative endpoint for health check
     *     tags: [Health]
     *     security: []
     *     responses:
     *       200:
     *         description: Service is healthy
     */
    app.get('/api/health', async (req, res) => {
        // Redirect to /health endpoint
        req.url = '/health';
        app.handle(req, res);
    });
};
