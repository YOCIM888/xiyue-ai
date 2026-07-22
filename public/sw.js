const CACHE = 'xiyue-v2'

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll([
        '/',
        '/index.html',
        '/manifest.json',
        '/xiyue.png',
      ])
    )
  )
})

self.addEventListener('fetch', (e) => {
  // 只处理 http/https 请求，忽略 chrome-extension 等
  if (!e.request.url.startsWith('http')) return
  e.respondWith(
    caches.match(e.request).then((r) => r || fetch(e.request))
  )
})
