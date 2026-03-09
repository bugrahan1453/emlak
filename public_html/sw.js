/**
 * EmlakRadar Pro — Service Worker
 * Offline destek, cache stratejisi
 */

const CACHE_NAME    = 'emlakradar-v1';
const CACHE_STATIC  = 'emlakradar-static-v1';
const CACHE_DYNAMIC = 'emlakradar-dynamic-v1';

// Offline'da önbelleklenecek statik dosyalar
const STATIC_ASSETS = [
    '/assets/css/app.css',
    '/assets/js/app.js',
    '/assets/js/pwa.js',
    '/assets/img/logo.svg',
    '/offline.html',
];

// Cache'e alınmayacak URL pattern'leri
const CACHE_EXCLUDE = [
    '/api/',
    '/logout',
    'chrome-extension://',
];

/* ── Install ────────────────────────────────────────────────────────── */
self.addEventListener('install', function (event) {
    event.waitUntil(
        caches.open(CACHE_STATIC).then(function (cache) {
            // Statik dosyaları önbellekle (hata olsa da devam et)
            return Promise.allSettled(
                STATIC_ASSETS.map(url =>
                    cache.add(url).catch(() => null)
                )
            );
        }).then(() => self.skipWaiting())
    );
});

/* ── Activate ───────────────────────────────────────────────────────── */
self.addEventListener('activate', function (event) {
    event.waitUntil(
        caches.keys().then(function (keys) {
            return Promise.all(
                keys
                    .filter(k => k !== CACHE_STATIC && k !== CACHE_DYNAMIC)
                    .map(k => caches.delete(k))
            );
        }).then(() => self.clients.claim())
    );
});

/* ── Fetch ──────────────────────────────────────────────────────────── */
self.addEventListener('fetch', function (event) {
    const url = event.request.url;

    // Dışlanan URL'leri cache'leme
    if (CACHE_EXCLUDE.some(pattern => url.includes(pattern))) {
        return; // Ağa doğrudan git
    }

    // GET olmayan istekleri cache'leme
    if (event.request.method !== 'GET') return;

    // Statik asset'ler: Cache First
    if (isStaticAsset(url)) {
        event.respondWith(cacheFirst(event.request));
        return;
    }

    // HTML sayfalar: Network First, offline fallback
    if (event.request.headers.get('Accept')?.includes('text/html')) {
        event.respondWith(networkFirstWithFallback(event.request));
        return;
    }

    // Diğerleri: Stale While Revalidate
    event.respondWith(staleWhileRevalidate(event.request));
});

/* ── Stratejiler ────────────────────────────────────────────────────── */

// Cache First (statik asset'ler için)
function cacheFirst(request) {
    return caches.match(request).then(function (cached) {
        if (cached) return cached;
        return fetch(request).then(function (response) {
            if (response.ok) {
                const clone = response.clone();
                caches.open(CACHE_STATIC).then(c => c.put(request, clone));
            }
            return response;
        });
    });
}

// Network First (HTML sayfalar için)
function networkFirstWithFallback(request) {
    return fetch(request)
        .then(function (response) {
            if (response.ok) {
                const clone = response.clone();
                caches.open(CACHE_DYNAMIC).then(c => c.put(request, clone));
            }
            return response;
        })
        .catch(function () {
            return caches.match(request).then(function (cached) {
                return cached || caches.match('/offline.html');
            });
        });
}

// Stale While Revalidate
function staleWhileRevalidate(request) {
    return caches.open(CACHE_DYNAMIC).then(function (cache) {
        return cache.match(request).then(function (cached) {
            const fetchPromise = fetch(request).then(function (response) {
                if (response.ok) cache.put(request, response.clone());
                return response;
            }).catch(() => cached);

            return cached || fetchPromise;
        });
    });
}

/* ── Yardımcılar ────────────────────────────────────────────────────── */
function isStaticAsset(url) {
    return url.match(/\.(css|js|svg|png|jpg|jpeg|gif|webp|woff2?|ttf)(\?.*)?$/);
}

/* ── Push Notifications ─────────────────────────────────────────────── */
self.addEventListener('push', function (event) {
    if (!event.data) return;

    let data = {};
    try { data = event.data.json(); } catch (e) { data = { title: 'EmlakRadar', body: event.data.text() }; }

    const options = {
        body:    data.body    || '',
        icon:    data.icon    || '/assets/img/icon-192.png',
        badge:   data.badge   || '/assets/img/icon-72.png',
        tag:     data.tag     || 'emlakradar',
        data:    { url: data.url || '/dashboard.php' },
        actions: data.actions || [],
        vibrate: [200, 100, 200],
    };

    event.waitUntil(
        self.registration.showNotification(data.title || 'EmlakRadar Pro', options)
    );
});

self.addEventListener('notificationclick', function (event) {
    event.notification.close();
    const url = event.notification.data?.url || '/dashboard.php';

    event.waitUntil(
        clients.matchAll({ type: 'window' }).then(function (clientList) {
            for (const client of clientList) {
                if (client.url === url && 'focus' in client) return client.focus();
            }
            if (clients.openWindow) return clients.openWindow(url);
        })
    );
});
