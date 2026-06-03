const CACHE_NAME = 'auto-glow-pro-v14'

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './assets/icons/icon.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './js/config.js',
  './js/app.js',
  './js/services/supabase.js',
  './js/services/auth.js',
  './js/services/db.js',
  './js/services/payments.js',
  './js/services/discounts.js',
  './services/supabase.js',
  './services/auth.js',
  './services/db.js',
  './services/payments.js',
  './services/discounts.js',
  './js/components/toast.js',
  './js/components/layout.js',
  './js/pages/authPage.js',
  './js/pages/clientDashboard.js',
  './js/pages/adminDashboard.js',
  './js/utils/dates.js',
  './js/utils/dom.js',
  './js/utils/plans.js'
]

const CDN_ASSETS = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.105.3/+esm'
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => caches.open(CACHE_NAME))
      .then((cache) => cache.addAll(CDN_ASSETS).catch(() => undefined))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  if (request.method !== 'GET') return

  if (url.hostname.includes('supabase.co')) {
    event.respondWith(fetch(request))
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('./index.html')))
    return
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
          }
          return response
        })
        .catch(() => cached)

      return cached || network
    })
  )
})
