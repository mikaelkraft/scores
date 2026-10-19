const nodemailer = require('nodemailer');
const { config } = require('../config/env');
const SiteSetting = require('../models/siteSetting');

class EmailService {
    async getTransporter() {
        const settings = await SiteSetting.getGlobalSettings().catch(() => null);
        const smtp = settings?.smtpSettings || {};

        const host = smtp.host || config.SMTP_HOST;
        const port = smtp.port || config.SMTP_PORT || 587;
        const secure = smtp.secure !== undefined ? smtp.secure : config.SMTP_SECURE;
        const user = smtp.user || config.SMTP_USER;
        const pass = smtp.pass || config.SMTP_PASS;

        if (host && user && pass) {
            return {
                transporter: nodemailer.createTransport({
                    host,
                    port,
                    secure,
                    auth: { user, pass }
                }),
                from: smtp.fromEmail || config.SMTP_FROM || 'Norra AI <support@mynorra.xyz>',
                isMock: false
            };
        }

        return {
            transporter: null,
            from: 'Norra AI <support@mynorra.xyz>',
            isMock: true
        };
    }

    /**
     * Send email verification link
     */
    async sendVerificationEmail({ email, name, token, siteUrl }) {
        const base = (siteUrl || config.PUBLIC_SITE_URL || 'https://scores.mynorra.xyz').replace(/\/$/, '');
        const verifyLink = `${base}/account?verify_token=${encodeURIComponent(token)}`;
        const recipientName = name || email.split('@')[0];

        const subject = 'Confirm your email — Scores by Norra AI';
        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0f19; color: #f8fafc; margin: 0; padding: 40px 20px; }
                .card { max-width: 560px; margin: 0 auto; background: #111827; border: 1px solid #1e293b; border-radius: 12px; padding: 32px; }
                .logo { font-size: 20px; font-weight: 800; color: #3b82f6; margin-bottom: 24px; }
                h1 { font-size: 22px; font-weight: 700; color: #f8fafc; margin-top: 0; }
                p { font-size: 14px; line-height: 1.6; color: #94a3b8; }
                .btn { display: inline-block; background: #3b82f6; color: #ffffff !important; text-decoration: none; font-weight: 600; font-size: 14px; padding: 12px 28px; border-radius: 8px; margin: 20px 0; }
                .btn:hover { background: #2563eb; }
                .alt-link { word-break: break-all; font-size: 12px; color: #64748b; }
                .footer { margin-top: 30px; border-top: 1px solid #1e293b; padding-top: 20px; font-size: 12px; color: #64748b; }
            </style>
        </head>
        <body>
            <div class="card">
                <div class="logo">⚽ Scores by Norra AI</div>
                <h1>Confirm your developer email</h1>
                <p>Hello <strong>${recipientName}</strong>,</p>
                <p>Thank you for joining the Norra AI live scores and sports data platform. Please click the button below to confirm your email address and verify your developer account.</p>
                <p style="text-align: center;">
                    <a href="${verifyLink}" class="btn" target="_blank">Verify Email Address</a>
                </p>
                <p>This verification link will expire in 24 hours.</p>
                <p class="alt-link">If the button doesn't work, copy and paste this link into your browser:<br>${verifyLink}</p>
                <div class="footer">
                    &copy; ${new Date().getFullYear()} Norra AI (scores.mynorra.xyz). Commercial Sports Telemetry Platform.
                </div>
            </div>
        </body>
        </html>
        `;

        const text = `Hello ${recipientName},\n\nPlease confirm your email address for Scores by Norra AI by visiting:\n${verifyLink}\n\nThis link will expire in 24 hours.\n\n- The Norra AI Team`;

        const { transporter, from, isMock } = await this.getTransporter();

        if (isMock || !transporter) {
            console.log(`\n============================================================`);
            console.log(`📧 [MOCK EMAIL SERVICE] Verification Email to: ${email}`);
            console.log(`🔗 Verification Link: ${verifyLink}`);
            console.log(`============================================================\n`);
            return {
                success: true,
                mock: true,
                verifyLink,
                message: 'Mock email generated (configure SMTP in admin to send live emails).'
            };
        }

        try {
            const info = await transporter.sendMail({
                from,
                to: email,
                subject,
                text,
                html
            });
            return { success: true, messageId: info.messageId };
        } catch (err) {
            console.error('SMTP send error:', err.message);
            // Fallback to mock log so onboarding is never blocked
            console.log(`🔗 Fallback Verification Link for ${email}: ${verifyLink}`);
            return { success: false, error: err.message, verifyLink };
        }
    }
}

module.exports = new EmailService();
