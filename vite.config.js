import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 已绑定自定义域名 xiyue.yocim.top，GitHub Pages 部署时资源使用根路径
const base = '/'

// 链接识别：抓取任意网页正文（仅开发/预览服务器可用）
function linkReader() {
  const handler = async (req, res, next) => {
    const parsed = new URL(req.url, 'http://localhost')
    if (parsed.pathname !== '/api/read-link') return next()
    const target = parsed.searchParams.get('url') || ''
    if (!/^https?:\/\//i.test(target)) {
      res.statusCode = 400
      res.end('invalid url')
      return
    }
    try {
      const resp = await fetch(target, {
        redirect: 'follow',
        signal: AbortSignal.timeout(15000),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        },
      })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const contentType = resp.headers.get('content-type') || ''
      const buffer = Buffer.from(await resp.arrayBuffer()).subarray(0, 3 * 1024 * 1024)
      let charset = (contentType.match(/charset=([^\s;]+)/i) || [])[1] || ''
      let html = ''
      if (charset) {
        try { html = new TextDecoder(charset).decode(buffer) } catch { /* 回退到 meta 检测 */ }
      }
      if (!html) {
        const head = new TextDecoder('latin1').decode(buffer.subarray(0, 4096))
        const meta = (head.match(/<meta[^>]+charset=["']?([a-zA-Z0-9_-]+)/i) || [])[1]
        try { html = new TextDecoder(meta || 'utf-8').decode(buffer) } catch { html = new TextDecoder().decode(buffer) }
      }
      res.statusCode = 200
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.setHeader('X-Link-Reader', '1')
      res.end(html)
    } catch (err) {
      res.statusCode = 502
      res.setHeader('X-Link-Reader', '1')
      res.end(err.message || '读取失败')
    }
  }
  return {
    name: 'link-reader',
    configureServer(server) { server.middlewares.use(handler) },
    configurePreviewServer(server) { server.middlewares.use(handler) },
  }
}

export default defineConfig({
  base,
  plugins: [vue(), linkReader()],
  server: {
    host: '0.0.0.0',
    port: 5174,
    allowedHosts: ['xiyue.yocim.top', '.yocim.top', 'localhost', '127.0.0.1'],
    proxy: {
      '/ollama-api': {
        target: 'http://127.0.0.1:11434',
        changeOrigin: true,
        rewrite: (path) => path.replace('/ollama-api', '/api'),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.removeHeader('origin')
            proxyReq.removeHeader('referer')
          })
        },
      },
    },
  },
  build: {
    target: 'esnext',
  },
})
