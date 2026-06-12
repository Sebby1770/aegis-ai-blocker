// Aegis service worker: offline shell for the dashboard.
// - Hashed build assets are cache-first (immutable filenames).
// - Navigations are network-first with a cached shell fallback.
// - API requests are never intercepted: entitlement state must stay live.
const CACHE = 'aegis-v1'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

async function cacheFirst(request) {
  const cache = await caches.open(CACHE)
  const cached = await cache.match(request)

  if (cached) {
    return cached
  }

  const response = await fetch(request)

  if (response.ok) {
    cache.put(request, response.clone())
  }

  return response
}

async function navigationNetworkFirst(request) {
  const cache = await caches.open(CACHE)

  try {
    const response = await fetch(request)

    if (response.ok) {
      cache.put('/index.html', response.clone())
    }

    return response
  } catch {
    const cached = await cache.match('/index.html')

    if (cached) {
      return cached
    }

    throw new Error('offline_without_cache')
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)

  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) {
    return
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request))
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(navigationNetworkFirst(request))
  }
})
