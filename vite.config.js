import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// GitHub Pages: 自动检测仓库名作为 base 路径
const repo = process.env.GITHUB_REPOSITORY?.split('/')[1] || ''
const base = repo && !repo.endsWith('.github.io') ? `/${repo}/` : '/'

export default defineConfig({
  base,
  plugins: [vue()],
  server: {
    host: '0.0.0.0',
    port: 5174,
    allowedHosts: ['xiyue.yocim.top', '.yocim.top', 'localhost', '127.0.0.1'],
    proxy: {
      '/ollama-api': {
        target: 'http://127.0.0.1:11434',
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
