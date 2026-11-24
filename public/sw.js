/**
 * NorraScore Service Worker — Progressive Web App (PWA) Caching
 * Ensures offline shell availability, lightning-fast static resource loading,
 * and passes live scores & telemetry strictly through network-first strategy.
 */

const CACHE_NAME = 'norrascore-v1.0.0';
const STATIC_ASSETS = [
    '/',
    '/assets/styles.css?v=1.0.0',
    '/assets/app.js?v=1.0.0',
    '/assets/shared-shell.js',
    '/favicon.svg',
    '/favicon.ico',
    '/apple-touch-icon.png',
    '/manifest.webmanifest'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS).catch((err) => {
                console.warn('[SW] Cache addAll notice:', err.message);
            });
        }).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // 1. Live match data, SSE streams, accounts, downloads, and APIs: ALWAYS network-first (never serve stale match telemetry)
    if (
        request.method !== 'GET' ||
        url.pathname.startsWith('/api/') ||
        url.pathname.startsWith('/admin/') ||
        url.pathname.startsWith('/account/') ||
        url.pathname.startsWith('/download/') ||
        url.pathname.endsWith('.apk') ||
        url.pathname.includes('/live') ||
        request.headers.get('accept')?.includes('text/event-stream')
    ) {
        event.respondWith(
            fetch(request).catch(() => {
                return new Response(JSON.stringify({ error: 'Network offline. Live scores require an active internet connection.' }), {
                    status: 503,
                    headers: { 'Content-Type': 'application/json' }
                });
            })
        );
        return;
    }

    // 2. Navigation requests: Network-first with offline cache fallback
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request).catch(() => {
                return caches.match(request).then((cached) => {
                    return cached || caches.match('/');
                });
            })
        );
        return;
    }

    // 3. Core CSS & JS bundles: Network-first with offline cache fallback so UI/header/footer updates land immediately
    if (url.pathname.endsWith('.css') || url.pathname.endsWith('.js')) {
        event.respondWith(
            fetch(request).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200) {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(request, responseToCache);
                    });
                }
                return networkResponse;
            }).catch(() => caches.match(request))
        );
        return;
    }

    // 4. Static images, fonts, icons, crests: Stale-While-Revalidate
    event.respondWith(
        caches.match(request).then((cachedResponse) => {
            const fetchPromise = fetch(request).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200) {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(request, responseToCache);
                    });
                }
                return networkResponse;
            }).catch(() => null);

            return cachedResponse || fetchPromise;
        })
    );
});
