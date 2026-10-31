const CACHE = 'xiyue-v3'
const PRECACHE = ['./manifest.json', './xiyue.png']

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE)
    await cache.addAll(PRECACHE)
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    const hadOldCache = keys.some((key) => key !== CACHE)
    await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
    await self.clients.claim()

    // 旧缓存清理后刷新已打开的页面，避免继续使用引用旧资源的 index.html
    if (hadOldCache) {
      const clients = await self.clients.matchAll({ type: 'window' })
      clients.forEach((client) => client.navigate(client.url).catch(() => {}))
    }
  })())
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  // 页面导航始终优先取网络上的最新 index.html，避免旧构建引用已删除的哈希资源
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(networkFirstIndex(req))
    return
  }

  // 带哈希的静态资源命中缓存即可，未命中再回源
  if (!['script', 'style', 'image', 'font'].includes(req.destination)) return
  event.respondWith(cacheFirst(req))
})

async function networkFirstIndex(req) {
  try {
    const res = await fetch(req, { cache: 'no-store' })
    if (res && res.ok) {
      const copy = res.clone()
      const cache = await caches.open(CACHE)
      cache.put('./index.html', copy)
    }
    return res
  } catch {
    const cached = await caches.match('./index.html')
    return cached || Response.error()
  }
}

async function cacheFirst(req) {
  const cached = await caches.match(req)
  if (cached) return cached

  const res = await fetch(req)
  if (res && res.ok) {
    const copy = res.clone()
    const cache = await caches.open(CACHE)
    cache.put(req, copy)
  }
  return res
}
