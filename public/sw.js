const CACHE_NAME = 'companion-__BUILD_ID__'

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
  const { request } = event

  // Only cache GET requests
  if (request.method !== 'GET') return

  // Don't cache API calls — stale responses could bypass server-side checks
  if (request.url.includes('/.netlify/functions/')) return

  // SPA navigation requests — always serve index.html (network-first, cache fallback)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.status === 200) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', clone))
          }
          return response
        })
        .catch(() =>
          caches.match('/index.html').then((cached) =>
            cached || new Response(
              '<html><body style="background:#000;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center"><h2>You\'re offline</h2><p style="color:#999">Companion will load when connectivity returns.</p></div></div></body></html>',
              { status: 200, headers: { 'Content-Type': 'text/html' } }
            )
          )
        )
    )
    return
  }

  // Static assets — network first, fall back to cache
  event.respondWith(
    caches.match(request).then((cached) => {
      return fetch(request)
        .then((response) => {
          // Cache successful responses for static assets
          if (response.status === 200) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
          }
          return response
        })
        .catch(() => {
          if (cached) return cached
          // For non-navigation requests with no cache, return a minimal error
          return new Response('', { status: 503, statusText: 'Offline' })
        })
    })
  )
})
