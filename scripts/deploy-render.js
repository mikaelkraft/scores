#!/usr/bin/env node

/**
 * Triggers a deployment of Scores by Norra AI on Render via Deploy Hook.
 * Usage:
 *   npm run deploy:render
 */

const https = require('https');
const { loadEnvConfig } = require('../config/env');

loadEnvConfig();

const deployHookUrl = process.env.RENDER_DEPLOY_HOOK_URL || 'https://api.render.com/deploy/srv-dbble8bbc2fs73bjb82g?key=8OBDfcJI7t8';
const serviceId = process.env.RENDER_SERVICE_ID || 'srv-dbble8bbc2fs73bjb82g';

console.log('🚀 Triggering deployment on Render...');
console.log(`📦 Service ID: ${serviceId}`);

const req = https.get(deployHookUrl, (res) => {
    let data = '';

    res.on('data', chunk => {
        data += chunk;
    });

    res.on('end', () => {
        const isSuccess = res.statusCode >= 200 && res.statusCode < 300;
        let deployId = null;

        try {
            const parsed = JSON.parse(data);
            if (parsed.deploy && parsed.deploy.id) {
                deployId = parsed.deploy.id;
            }
        } catch (e) {
            // Text response like 'Accepted'
        }

        if (isSuccess) {
            console.log('✅ Deployment triggered successfully on Render!');
            if (deployId) {
                console.log(`🆔 Deploy ID: ${deployId}`);
                console.log(`🌐 Deploy URL: https://dashboard.render.com/web/${serviceId}/deploys/${deployId}`);
            } else {
                console.log(`🌐 Deploys Dashboard: https://dashboard.render.com/web/${serviceId}/deploys`);
            }
            console.log('📡 Render is fetching the latest GitHub commit and building with zero downtime.');
        } else {
            console.error(`❌ Render returned status ${res.statusCode}:`, data);
            process.exit(1);
        }
    });
});

req.on('error', (err) => {
    console.error('❌ Failed to trigger Render deployment:', err.message);
    process.exit(1);
});

req.end();
