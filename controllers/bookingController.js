const express = require('express');
const router = express.Router();
const bookingHookService = require('../services/bookingHookService');

/**
 * GET /api/v1/booking/providers
 * Returns supported bookmakers and conversion capability
 */
router.get('/api/v1/booking/providers', (req, res) => {
    res.set('Cache-Control', 'public, max-age=3600');
    return res.json({
        status: 'success',
        providers: bookingHookService.getSupportedBookmakers()
    });
});

/**
 * POST /api/v1/booking/generate
 * Hook to book selections and return booking slip
 */
router.post('/api/v1/booking/generate', async (req, res) => {
    try {
        const result = await bookingHookService.generateBookingCode(req.body);
        return res.json(result);
    } catch (err) {
        return res.status(400).json({ error: err.message });
    }
});

/**
 * POST /api/v1/booking/convert
 * Hook to convert code between bookmakers
 */
router.post('/api/v1/booking/convert', async (req, res) => {
    try {
        const result = await bookingHookService.convertBookingCode(req.body);
        return res.json(result);
    } catch (err) {
        return res.status(400).json({ error: err.message });
    }
});

module.exports = app => {
    app.use(router);
};
