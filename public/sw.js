const CACHE_VERSION = 'lofimart-v20260530';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const PAGE_CACHE = `${CACHE_VERSION}-pages`;
const API_CACHE = `${CACHE_VERSION}-api`;
const OFFLINE_FALLBACK_URL = '/offline.html';
const ESSENTIAL_URLS = [
  '/',
  '/shop',
  '/categories',
  '/flash-sale',
  '/manifest.json',
  '/icon.svg',
  OFFLINE_FALLBACK_URL,
];

function isSameOrigin(requestUrl) {
  return new URL(requestUrl).origin === self.location.origin;
}

function isProtectedPath(pathname) {
  return (
    pathname.startsWith('/api') ||
    pathname.startsWith('/account') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/seller') ||
    pathname.startsWith('/reseller-dashboard') ||
    pathname.startsWith('/checkout') ||
    pathname.startsWith('/payment') ||
    pathname.startsWith('/auth')
  );
}

async function warmCache(cacheName, urls) {
  const cache = await caches.open(cacheName);
  await Promise.allSettled(
    urls.map(async (url) => {
      const response = await fetch(url, { cache: 'no-store' });
      if (response.ok) {
        await cache.put(url, response.clone());
      }
    }),
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      self.skipWaiting();
      await warmCache(STATIC_CACHE, ESSENTIAL_URLS);
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const validCaches = new Set([STATIC_CACHE, PAGE_CACHE, API_CACHE]);
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => (validCaches.has(key) ? Promise.resolve() : caches.delete(key))));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  const type = event.data?.type;

  if (type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (type === 'CLEAR_OLD_CACHES') {
    event.waitUntil(
      (async () => {
        const validCaches = new Set([STATIC_CACHE, PAGE_CACHE, API_CACHE]);
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => (validCaches.has(key) ? Promise.resolve() : caches.delete(key))));
      })(),
    );
  }
});

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);

  try {
    const networkResponse = await fetch(request, { cache: 'no-store' });
    if (networkResponse.ok) {
      await cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    const cachedResponse = await cache.match(request);
    return cachedResponse || Response.error();
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);

  if (cachedResponse) {
    return cachedResponse;
  }

  const networkResponse = await fetch(request);
  if (networkResponse.ok) {
    await cache.put(request, networkResponse.clone());
  }
  return networkResponse;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET' || !isSameOrigin(request.url)) {
    return;
  }

  const url = new URL(request.url);
  const { pathname } = url;

  if (request.mode === 'navigate') {
    if (isProtectedPath(pathname)) {
      event.respondWith(
        fetch(request).catch(async () => {
          const offlineResponse = await caches.match(OFFLINE_FALLBACK_URL);
          return (
            offlineResponse ||
            new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
          );
        }),
      );
      return;
    }

    event.respondWith(
      (async () => {
        const pageCache = await caches.open(PAGE_CACHE);
        try {
          const networkResponse = await fetch(request);
          if (networkResponse.ok) {
            await pageCache.put(request, networkResponse.clone());
          }
          return networkResponse;
        } catch {
          const cachedResponse = await pageCache.match(request);
          if (cachedResponse) {
            return cachedResponse;
          }
          const offlineResponse = await caches.match(OFFLINE_FALLBACK_URL);
          return (
            offlineResponse ||
            new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
          );
        }
      })(),
    );
    return;
  }

  if (request.destination === 'style' || request.destination === 'script' || request.destination === 'worker') {
    event.respondWith(networkFirst(request, STATIC_CACHE));
    return;
  }

  if (request.destination === 'font' || request.destination === 'image') {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  if (pathname.startsWith('/api/public/')) {
    event.respondWith(networkFirst(request, API_CACHE));
  }
});

self.addEventListener('push', (event) => {
  let payload = { title: 'LofiMart', body: 'You have a new notification.' };

  try {
    if (event.data) {
      payload = JSON.parse(event.data.text());
    }
  } catch {
    // fall back to default payload
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || 'LofiMart', {
      body: payload.body || 'You have a new notification.',
      icon: '/icon.svg',
      badge: '/icon.svg',
      data: payload.data || {},
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow('/'));
});
