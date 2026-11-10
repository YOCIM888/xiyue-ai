/**
 * esbuild-wasm 的按需装载。
 * wasm 约 14 MB，绝不进主包：只有真的遇到 .ts/.tsx/.jsx 才被动态 import。
 * 先 fetch 成 WebAssembly.Module 再交给 initialize，绕开相对 base 与
 * service worker 对资源路径的影响（esbuild 的 worker 由它自己内联成 blob）。
 */
import wasmUrl from 'esbuild-wasm/esbuild.wasm?url'

let loading = null
let ready = false

async function boot() {
  const esbuild = await import('esbuild-wasm/esm/browser.js')
  const response = await fetch(wasmUrl)
  if (!response.ok) throw new Error(`转译运行时下载失败（HTTP ${response.status}）`)
  const wasmModule = await WebAssembly.compile(await response.arrayBuffer())
  await esbuild.initialize({ wasmModule })
  ready = true
  return esbuild
}

export function isRuntimeReady() {
  return ready
}

export function loadEsbuild() {
  if (!loading) {
    loading = boot().catch(err => {
      // 失败要允许下次重试，否则一次网络抖动就永久失去转译能力
      loading = null
      throw err
    })
  }
  return loading
}
