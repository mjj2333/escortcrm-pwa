const CACHE_NAME = 'escortcrm-v13'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll([
        '/',
        '/index.html',
      ])
    })
  )
  // Do NOT call self.skipWaiting() — wait for the user to accept the update
})

// Listen for the app to signal that the user accepted the update
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(
        names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
      )
    })
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  // Only cache GET requests
  if (event.request.method !== 'GET') return

  // Don't cache API calls — stale responses could bypass server-side checks
  if (event.request.url.includes('/.netlify/functions/')) return

  event.respondWith(
    caches.match(event.request).then((cached) => {
      // Network first, fall back to cache
      return fetch(event.request)
        .then((response) => {
          // Cache successful responses
          if (response.status === 200) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
          }
          return response
        })
        .catch(() => cached || new Response('Offline', { status: 503 }))
    })
  )
})
