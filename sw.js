// ─── CACHE ────────────────────────────────────────────────────────────────────
// Cambia este número cada vez que subas cambios al código
const CACHE_NAME = 'rv-admin-20250326b';

const PRECACHE_URLS = [
    'login.html',
    'admin.html',
    'admin.js',
    'login.js',
    'manifest.json'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(PRECACHE_URLS).catch(err => {
                console.warn('[SW] Algunos archivos no se pudieron cachear:', err);
            });
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys
                    .filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            )
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);
    const isExternal =
        url.hostname.includes('firebase') ||
        url.hostname.includes('cloudinary') ||
        url.hostname.includes('googleapis') ||
        url.hostname.includes('gstatic') ||
        url.hostname.includes('tailwindcss') ||
        url.hostname.includes('cdnjs') ||
        url.hostname.includes('fonts') ||
        url.hostname.includes('ntfy');

    if (isExternal) return;

    event.respondWith(
        fetch(event.request)
            .then(response => {
                if (response && response.status === 200) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                }
                return response;
            })
            .catch(() => {
                return caches.match(event.request).then(cached => {
                    if (cached) return cached;
                    if (url.pathname.includes('admin')) return caches.match('admin.html');
                    return caches.match('login.html');
                });
            })
    );
});

// ─── CLICK EN LA NOTIFICACIÓN ────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((allClients) => {
            const adminUrl = new URL('admin.html', self.location.origin).href;
            const existing = allClients.find(c =>
                c.url.includes('admin.html') || c.url.includes('admin')
            );
            if (existing) {
                existing.focus();
                return;
            }
            return clients.openWindow(adminUrl);
        })
    );
});
