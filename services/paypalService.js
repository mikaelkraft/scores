const { config } = require('../config/env');
const https = require('https');

class PayPalService {
    constructor() {
        this.clientId = config.PAYPAL_CLIENT_ID;
        this.clientSecret = config.PAYPAL_CLIENT_SECRET;
        this.mode = config.PAYPAL_MODE || 'sandbox';
        this.baseUrl = this.mode === 'live' 
            ? 'https://api-m.paypal.com' 
            : 'https://api-m.sandbox.paypal.com';
    }

    isConfigured() {
        return Boolean(this.clientId && this.clientSecret);
    }

    async getAccessToken() {
        if (!this.isConfigured()) return null;

        const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
        const payload = 'grant_type=client_credentials';

        return new Promise((resolve, reject) => {
            const req = https.request(`${this.baseUrl}/v1/oauth2/token`, {
                method: 'POST',
                headers: {
                    Authorization: `Basic ${auth}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Content-Length': Buffer.byteLength(payload)
                }
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(data);
                        resolve(parsed.access_token);
                    } catch (e) {
                        reject(e);
                    }
                });
            });

            req.on('error', reject);
            req.write(payload);
            req.end();
        });
    }

    async createOrder({ amount, currency = 'USD', description = 'Norra AI Sports API' }) {
        if (!this.isConfigured()) {
            return {
                id: `mock_pp_order_${Date.now()}`,
                status: 'CREATED',
                mock: true
            };
        }

        const token = await this.getAccessToken();
        const payload = JSON.stringify({
            intent: 'CAPTURE',
            purchase_units: [{
                description,
                amount: {
                    currency_code: currency,
                    value: Number(amount).toFixed(2)
                }
            }]
        });

        return new Promise((resolve, reject) => {
            const req = https.request(`${this.baseUrl}/v2/checkout/orders`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload)
                }
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(e);
                    }
                });
            });

            req.on('error', reject);
            req.write(payload);
            req.end();
        });
    }

    async captureOrder(orderId) {
        if (!this.isConfigured() || String(orderId).startsWith('mock_pp_order_')) {
            return {
                id: orderId,
                status: 'COMPLETED',
                mock: true
            };
        }

        const token = await this.getAccessToken();
        return new Promise((resolve, reject) => {
            const req = https.request(`${this.baseUrl}/v2/checkout/orders/${orderId}/capture`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(e);
                    }
                });
            });

            req.on('error', reject);
            req.end();
        });
    }
}

module.exports = new PayPalService();
