const { config } = require('../config/env');
const https = require('https');

class FlutterwaveService {
    constructor() {
        this.secretKey = config.FLUTTERWAVE_SECRET_KEY;
        this.publicKey = config.FLUTTERWAVE_PUBLIC_KEY;
    }

    isConfigured() {
        return Boolean(this.secretKey && this.secretKey.startsWith('FLWSECK'));
    }

    async initializePayment({ tx_ref, amount, currency = 'USD', customer, redirect_url, meta }) {
        if (!this.isConfigured()) {
            // Mock sandbox link when real keys are not yet configured in admin
            return {
                status: 'success',
                message: 'Flutterwave sandbox session initialized (Mock Mode)',
                data: {
                    link: `${redirect_url}?status=successful&tx_ref=${tx_ref}&transaction_id=mock_flw_${Date.now()}`
                }
            };
        }

        const payload = JSON.stringify({
            tx_ref,
            amount,
            currency,
            redirect_url,
            customer: {
                email: customer.email,
                name: customer.name || customer.email
            },
            customizations: {
                title: 'Scores by Norra AI - API Subscription',
                description: `Payment for ${meta.plan || 'API'} subscription`,
                logo: 'https://scores.mynorra.xyz/favicon.svg'
            },
            meta
        });

        return new Promise((resolve, reject) => {
            const req = https.request('https://api.flutterwave.com/v3/payments', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${this.secretKey}`,
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload)
                }
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(data);
                        resolve(parsed);
                    } catch (e) {
                        reject(new Error(`Failed to parse Flutterwave response: ${data}`));
                    }
                });
            });

            req.on('error', reject);
            req.write(payload);
            req.end();
        });
    }

    async verifyTransaction(transactionId) {
        if (!this.isConfigured() || String(transactionId).startsWith('mock_flw_')) {
            return {
                status: 'success',
                data: {
                    status: 'successful',
                    id: transactionId,
                    amount: 49,
                    currency: 'USD'
                }
            };
        }

        return new Promise((resolve, reject) => {
            const req = https.request(`https://api.flutterwave.com/v3/transactions/${transactionId}/verify`, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${this.secretKey}`,
                    'Content-Type': 'application/json'
                }
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(data);
                        resolve(parsed);
                    } catch (e) {
                        reject(new Error(`Failed to verify Flutterwave transaction: ${data}`));
                    }
                });
            });

            req.on('error', reject);
            req.end();
        });
    }
}

module.exports = new FlutterwaveService();
