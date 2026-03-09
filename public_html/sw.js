/**
 * EmlakRadar Pro — Service Worker v2
 * Cache First: statik | Network First: sayfalar + API | Push: bildirimler
 */

const CACHE_VERSION = 'v2';
const CACHE_STATIC  = 'emlakradar-static-'  + CACHE_VERSION;
const CACHE_DYNAMIC = 'emlakradar-dynamic-' + CACHE_VERSION;
const CACHE_PAGES   = 'emlakradar-pages-'   + CACHE_VERSION;

const PRECACHE_URLS = [
    '/dashboard.php',
    '/gorevler.php',
    '/ilanlar.php',
    '/assets/css/app.css',
    '/assets/js/app.js',
    '/assets/js/pwa.js',
    '/assets/img/logo.svg',
    '/offline.html',
];

const CACHE_EXCLUDE = ['/api/', '/logout', '/uploads/', 'chrome-extension://'];

/* ── Install ────────────────────────────────────────────────────────── */
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_STATIC)
            .then(cache => Promise.allSettled(PRECACHE_URLS.map(url => cache.add(url).catch(() => null))))
            .then(() => self.skipWaiting())
    );
});

/* ── Activate ───────────────────────────────────────────────────────── */
self.addEventListener('activate', (event) => {
    const valid = [CACHE_STATIC, CACHE_DYNAMIC, CACHE_PAGES];
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => !valid.includes(k)).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

/* ── Fetch ──────────────────────────────────────────────────────────── */
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    if (request.method !== 'GET') return;
    if (CACHE_EXCLUDE.some(ex => request.url.includes(ex))) return;
    if (url.origin !== self.location.origin) return;

    const isStatik = /\.(css|js|svg|png|jpg|jpeg|gif|woff2?|ico)$/i.test(url.pathname);
    const isSayfa  = url.pathname.endsWith('.php') || url.pathname === '/';

    if (isStatik) {
        event.respondWith(cacheFirst(request, CACHE_STATIC));
    } else if (isSayfa) {
        event.respondWith(networkFirstOffline(request));
    } else {
        event.respondWith(networkFirst(request, CACHE_DYNAMIC));
    }
});

/* ── Push Bildirimleri ──────────────────────────────────────────────── */
self.addEventListener('push', (event) => {
    let payload = { title: 'EmlakRadar Pro', body: 'Yeni bildirim', link: '/dashboard.php', tip: 'genel' };
    try { payload = Object.assign(payload, event.data?.json()); } catch {}

    event.waitUntil(
        self.registration.showNotification(payload.title, {
            body:     payload.body,
            icon:     '/assets/img/icon-192.svg',
            badge:    '/assets/img/icon-192.svg',
            data:     { link: payload.link },
            vibrate:  [200, 100, 200],
            tag:      'emlakradar-' + payload.tip,
            renotify: true,
        })
    );
});

/* ── Notification Click ─────────────────────────────────────────────── */
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const link = event.notification.data?.link || '/dashboard.php';
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
            for (const c of list) {
                if (c.url.includes(self.location.origin) && 'focus' in c) {
                    c.navigate(link);
                    return c.focus();
                }
            }
            return clients.openWindow(link);
        })
    );
});

/* ── Background Sync ────────────────────────────────────────────────── */
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-gorevler') {
        event.waitUntil(syncBekleyenler());
    }
});

async function syncBekleyenler() {
    const db = await openIDB();
    const bekleyenler = await idbGetAll(db, 'pending_updates');
    for (const item of bekleyenler) {
        try {
            const r = await fetch(item.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: item.body });
            if (r.ok) await idbDelete(db, 'pending_updates', item.id);
        } catch {}
    }
}

/* ── Cache Stratejileri ─────────────────────────────────────────────── */
async function cacheFirst(request, cacheName) {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
        const resp = await fetch(request);
        if (resp.ok) (await caches.open(cacheName)).put(request, resp.clone());
        return resp;
    } catch {
        return new Response('Kaynak yüklenemedi.', { status: 503 });
    }
}

async function networkFirst(request, cacheName) {
    try {
        const resp = await fetch(request);
        if (resp.ok) (await caches.open(cacheName)).put(request, resp.clone());
        return resp;
    } catch {
        return (await caches.match(request)) || new Response('Çevrimdışı', { status: 503 });
    }
}

async function networkFirstOffline(request) {
    try {
        const resp = await fetch(request);
        if (resp.ok) (await caches.open(CACHE_PAGES)).put(request, resp.clone());
        return resp;
    } catch {
        const cached  = await caches.match(request);
        if (cached) return cached;
        const offline = await caches.match('/offline.html');
        return offline || new Response('<h1>Çevrimdışısınız</h1>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }
}

/* ── IndexedDB Yardımcıları ─────────────────────────────────────────── */
function openIDB() {
    return new Promise((res, rej) => {
        const req = indexedDB.open('emlakradar_sw', 1);
        req.onupgradeneeded = e => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('pending_updates'))
                db.createObjectStore('pending_updates', { keyPath: 'id', autoIncrement: true });
        };
        req.onsuccess = e => res(e.target.result);
        req.onerror   = e => rej(e.target.error);
    });
}

function idbGetAll(db, store) {
    return new Promise((res, rej) => {
        const req = db.transaction(store, 'readonly').objectStore(store).getAll();
        req.onsuccess = e => res(e.target.result);
        req.onerror   = e => rej(e.target.error);
    });
}

function idbDelete(db, store, id) {
    return new Promise((res, rej) => {
        const req = db.transaction(store, 'readwrite').objectStore(store).delete(id);
        req.onsuccess = () => res();
        req.onerror   = e => rej(e.target.error);
    });
}
