/**
 * proxyManager.js
 * Intelligent Proxy Rotation & Anti-Scraping Shield
 * Dynamically rotates requests across residential, datacenter, and rotating proxy gateways
 * for upstream providers (Besoccer, SofaScore, LiveScore, SportScore).
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

class ProxyManager {
    constructor() {
        this.proxies = [];
        this.currentIndex = 0;
        this.proxyStats = new Map(); // proxy -> { successes, failures, lastUsed, isBanned }
        this.initFromEnv();
    }

    initFromEnv() {
        const raw = process.env.SCRAPER_PROXIES || process.env.PROXY_URL || process.env.HTTP_PROXY || process.env.HTTPS_PROXY || '';
        if (raw) {
            const list = raw.split(',').map(p => p.trim()).filter(Boolean);
            this.setProxies(list);
        }
    }

    setProxies(proxyList) {
        if (!Array.isArray(proxyList)) return;
        this.proxies = proxyList.filter(p => typeof p === 'string' && (p.startsWith('http://') || p.startsWith('https://')));
        this.currentIndex = 0;
        this.proxies.forEach(p => {
            if (!this.proxyStats.has(p)) {
                this.proxyStats.set(p, { successes: 0, failures: 0, lastUsed: 0, isBanned: false });
            }
        });
        if (this.proxies.length > 0) {
            console.log(`🛡️ [ProxyManager] Initialized with ${this.proxies.length} rotating proxies.`);
        }
    }

    hasProxies() {
        return this.proxies.length > 0;
    }

    getNextProxy() {
        if (!this.hasProxies()) return null;
        
        // Find an unbanned proxy using round-robin
        const total = this.proxies.length;
        for (let i = 0; i < total; i++) {
            const proxy = this.proxies[this.currentIndex];
            this.currentIndex = (this.currentIndex + 1) % total;
            
            const stats = this.proxyStats.get(proxy);
            if (stats && stats.isBanned) {
                // If banned for more than 10 minutes, give it another chance
                if (Date.now() - stats.lastUsed > 10 * 60 * 1000) {
                    stats.isBanned = false;
                    stats.failures = 0;
                    return proxy;
                }
                continue;
            }
            return proxy;
        }

        // If all are marked banned, reset the least recently used one
        const fallback = this.proxies[0];
        const fStats = this.proxyStats.get(fallback);
        if (fStats) {
            fStats.isBanned = false;
            fStats.failures = 0;
        }
        return fallback;
    }

    recordSuccess(proxy) {
        if (!proxy) return;
        const stats = this.proxyStats.get(proxy);
        if (stats) {
            stats.successes += 1;
            stats.failures = 0;
            stats.lastUsed = Date.now();
        }
    }

    recordFailure(proxy) {
        if (!proxy) return;
        const stats = this.proxyStats.get(proxy);
        if (stats) {
            stats.failures += 1;
            stats.lastUsed = Date.now();
            if (stats.failures >= 5) {
                stats.isBanned = true;
                console.warn(`⚠️ [ProxyManager] Proxy ${proxy.split('@').pop()} banned after ${stats.failures} consecutive failures.`);
            }
        }
    }

    getStats() {
        return {
            totalProxies: this.proxies.length,
            activeProxies: this.proxies.filter(p => !this.proxyStats.get(p)?.isBanned).length,
            pool: Array.from(this.proxyStats.entries()).map(([p, s]) => ({
                proxy: p.split('@').pop(),
                successes: s.successes,
                failures: s.failures,
                isBanned: s.isBanned
            }))
        };
    }
}

const proxyManager = new ProxyManager();

module.exports = proxyManager;
