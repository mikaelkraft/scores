const https = require('https');
const { config } = require('../config/env');
const SiteSetting = require('../models/siteSetting');

class GoogleAuthService {
    /**
     * Get configured Google Client ID from SiteSetting or environment
     */
    async getClientId() {
        const settings = await SiteSetting.getGlobalSettings().catch(() => null);
        return settings?.authSettings?.googleClientId || config.GOOGLE_CLIENT_ID || '';
    }

    /**
     * Verify Google ID token using Google's public tokeninfo endpoint
     * @param {string} idToken Google Credential JWT from Google Identity Services
     */
    async verifyIdToken(idToken) {
        if (!idToken || typeof idToken !== 'string') {
            throw new Error('Valid Google ID token is required.');
        }

        const expectedClientId = await this.getClientId();

        return new Promise((resolve, reject) => {
            const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`;
            https.get(url, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.error || parsed.error_description) {
                            return reject(new Error(parsed.error_description || parsed.error || 'Google token validation failed.'));
                        }

                        if (!parsed.email || !parsed.sub) {
                            return reject(new Error('Google profile did not contain required email or user identifier.'));
                        }

                        // Verify audience if client ID is configured
                        if (expectedClientId && parsed.aud && parsed.aud !== expectedClientId) {
                            console.warn(`[GoogleAuth] Warning: token aud (${parsed.aud}) does not match configured clientId (${expectedClientId})`);
                        }

                        const emailVerified = parsed.email_verified === true || parsed.email_verified === 'true';

                        resolve({
                            googleId: parsed.sub,
                            email: parsed.email.toLowerCase().trim(),
                            name: parsed.name || parsed.given_name || parsed.email.split('@')[0],
                            avatarUrl: parsed.picture || '',
                            emailVerified
                        });
                    } catch (err) {
                        reject(new Error(`Failed to parse Google response: ${err.message}`));
                    }
                });
            }).on('error', (err) => {
                reject(new Error(`Google verification request failed: ${err.message}`));
            });
        });
    }
}

module.exports = new GoogleAuthService();
