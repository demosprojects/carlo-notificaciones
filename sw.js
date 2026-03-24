const CACHE_NAME = 'rv-admin-v1';

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
    url.hostname.includes('fonts');

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
// ─── NOTIFICACIONES DE NUEVOS PEDIDOS ────────────────────────────────────────
// La página detecta nuevos pedidos via onSnapshot y le manda un mensaje al SW
// para que dispare la notificación nativa (funciona incluso con la app en background)

self.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || data.type !== 'NUEVO_PEDIDO') return;

    const { nombre, total, cantItems, pedidoId } = data;
    const totalFmt = Number(total).toLocaleString('es-AR');
    const itemsTxt = cantItems === 1 ? '1 producto' : `${cantItems} productos`;

    self.registration.showNotification('🛍️ Nuevo pedido en tienda', {
        body: `${nombre}  ·  $${totalFmt}  ·  ${itemsTxt}`,
        icon: 'https://res.cloudinary.com/dkqevscys/image/upload/v1773541304/m9c9n2hvpmmidixvek1s.png',
        badge: 'https://res.cloudinary.com/dkqevscys/image/upload/v1773541304/m9c9n2hvpmmidixvek1s.png',
        tag: `pedido-${pedidoId}`,
        renotify: true,
        requireInteraction: false,
        vibrate: [200, 80, 200, 80, 400],
        data: { pedidoId, url: 'admin.html' },
        actions: [
            { action: 'ver', title: '👀 Ver pedido' },
            { action: 'ok',  title: 'OK' }
        ]
    });
});

// ─── CLICK EN LA NOTIFICACIÓN ────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    if (event.action === 'ok') return;

    // Abrir o enfocar la pestaña del admin
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((allClients) => {
            const adminUrl = new URL('admin.html', self.location.origin).href;

            // Si ya hay una pestaña de admin abierta, enfocarla
            const existing = allClients.find(c =>
                c.url.includes('admin.html') || c.url.includes('admin')
            );
            if (existing) {
                existing.focus();
                // Decirle que muestre el detalle del pedido
                if (event.notification.data?.pedidoId) {
                    existing.postMessage({
                        type: 'ABRIR_PEDIDO',
                        pedidoId: event.notification.data.pedidoId
                    });
                }
                return;
            }
            // Si no hay pestaña, abrir una nueva
            return clients.openWindow(adminUrl);
        })
    );
});