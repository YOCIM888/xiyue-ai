import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import JSZip from 'jszip'
import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

// 使用相对资源路径，同时兼容 GitHub Pages 项目路径与自定义域名
const base = './'
const extensionDir = fileURLToPath(new URL('./extension', import.meta.url))

// 把 extension/ 打包成可下载的 zip（开发/预览服务器与构建产物都提供）
async function buildExtensionZip() {
  const zip = new JSZip()
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) await walk(full)
      else zip.file(relative(extensionDir, full).replace(/\\/g, '/'), await readFile(full))
    }
  }
  await walk(extensionDir)
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}

function extensionDownloadPlugin() {
  const middleware = async (req, res, next) => {
    const pathname = new URL(req.url, 'http://localhost').pathname
    if (pathname !== '/browser-extension.zip') return next()
    try {
      const buffer = await buildExtensionZip()
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/zip')
      res.setHeader('Content-Disposition', 'attachment; filename="xiyue-browser-extension.zip"')
      res.end(buffer)
    } catch (err) {
      res.statusCode = 500
      res.end(`打包扩展失败：${err.message}`)
    }
  }
  return {
    name: 'browser-extension-download',
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
    async generateBundle() {
      const buffer = await buildExtensionZip()
      this.emitFile({ type: 'asset', fileName: 'browser-extension.zip', source: buffer })
    },
  }
}

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
  plugins: [vue(), linkReader(), extensionDownloadPlugin()],
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
  optimizeDeps: {
    // 沙箱转译按需动态 import：不预先声明的话，开发服务器上第一次跑 TS/Vue 会撞上 504 Outdated Optimize Dep
    include: ['esbuild-wasm/esm/browser.js', '@vue/compiler-sfc'],
  },
})
