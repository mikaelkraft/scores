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
     * Get configured Google Client Secret from SiteSetting or environment
     */
    async getClientSecret() {
        const settings = await SiteSetting.getGlobalSettings().catch(() => null);
        return settings?.authSettings?.googleClientSecret || config.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || '';
    }

    /**
     * Exchange OAuth2 authorization code for tokens
     * @param {string} code Authorization code from Google redirect
     * @param {string} redirectUri Callback URI matching Google Console configuration
     */
    async exchangeCodeForTokens(code, redirectUri) {
        if (!code) throw new Error('Authorization code is required.');
        const clientId = await this.getClientId();
        const clientSecret = await this.getClientSecret();
        if (!clientId) throw new Error('Google Client ID is not configured.');

        const postData = new URLSearchParams({
            code,
            client_id: clientId,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code'
        });
        if (clientSecret) {
            postData.append('client_secret', clientSecret);
        }

        return new Promise((resolve, reject) => {
            const req = https.request('https://oauth2.googleapis.com/token', {
                method: 'POST',
                timeout: 10000,
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Content-Length': Buffer.byteLength(postData.toString())
                }
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.error || parsed.error_description) {
                            return reject(new Error(parsed.error_description || parsed.error));
                        }
                        resolve(parsed);
                    } catch (err) {
                        reject(new Error(`Failed to parse Google token response: ${err.message}`));
                    }
                });
            });

            req.on('timeout', () => {
                req.destroy(new Error('Google token exchange timed out.'));
            });
            req.on('error', (err) => reject(new Error(`Google token exchange failed: ${err.message}`)));
            req.write(postData.toString());
            req.end();
        });
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
            const req = https.get(url, { timeout: 10000 }, (res) => {
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

                        // Strictly verify issuer, expiration, audience, and email verification
                        if (parsed.iss && parsed.iss !== 'accounts.google.com' && parsed.iss !== 'https://accounts.google.com') {
                            return reject(new Error('Invalid Google token issuer.'));
                        }
                        if (parsed.exp && Number(parsed.exp) * 1000 <= Date.now()) {
                            return reject(new Error('Google ID token has expired.'));
                        }
                        if (expectedClientId && parsed.aud !== expectedClientId) {
                            return reject(new Error('Google token audience does not match configured Client ID.'));
                        }

                        const emailVerified = parsed.email_verified === true || parsed.email_verified === 'true';
                        if (!emailVerified) {
                            return reject(new Error('Google account email is not verified.'));
                        }

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
            });
            req.on('timeout', () => {
                req.destroy(new Error('Google verification request timed out.'));
            });
            req.on('error', (err) => {
                reject(new Error(`Google verification request failed: ${err.message}`));
            });
        });
    }
}

module.exports = new GoogleAuthService();
