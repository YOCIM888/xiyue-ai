/**
 * 沙箱只吃 ESM JS，.ts/.tsx/.jsx/.vue/.json 先在宿主编译成 JS 再进图。
 * 重活（esbuild wasm、compiler-sfc）全部动态 import：不碰这些类型就一个字节都不多下载。
 */
import { compileKind } from './modulePaths'
import { parseSourceMap } from './sourceMap'
import { formatTranspileError, transformWith } from './transpile'

const MAX_CACHE_ITEMS = 40
let runtimeAnnounced = false

export function jsonModuleText(text, path) {
  let value
  try {
    value = JSON.parse(String(text ?? ''))
  } catch (err) {
    throw new Error(`${path} 不是合法 JSON：${String(err?.message || err).split('\n')[0]}`, { cause: err })
  }
  return `export default ${JSON.stringify(value)}`
}

export async function compileModule(path, text, { onStatus } = {}) {
  const kind = compileKind(path)
  if (kind === 'none') return { text: String(text ?? ''), lines: null, shift: 0, notes: [] }
  if (kind === 'json') return { text: jsonModuleText(text, path), lines: null, shift: 0, notes: [] }

  let source = String(text ?? '')
  let shift = 0
  let transpileAs = path
  const notes = []
  if (kind === 'vue') {
    onStatus?.(`正在编译 ${path}…`)
    const { compileSfc } = await import('./vueSfc')
    const sfc = compileSfc(path, source)
    source = sfc.text
    shift = sfc.shift
    notes.push(...sfc.ignored)
    if (sfc.lang) transpileAs = `${path}.${sfc.lang}`
  }

  const { isRuntimeReady, loadEsbuild } = await import('./esbuildRuntime')
  const pending = loadEsbuild()
  if (!isRuntimeReady() && !runtimeAnnounced) {
    // 首次要拉约 14 MB wasm 并编译，给个明确的等待提示，别让人以为卡住了
    runtimeAnnounced = true
    onStatus?.('正在加载 TypeScript 转译运行时（首次约 14 MB，之后复用）…')
    pending.catch(() => {})
  }
  try {
    const esbuild = await pending
    const out = await transformWith(esbuild, transpileAs, source)
    return { text: out.text, lines: parseSourceMap(out.map), shift, notes }
  } catch (err) {
    // 装载失败要允许下次再提示一次，成功过就再也不啰嗦
    runtimeAnnounced = false
    // esbuild 的语法错误带 errors[]，摊平成源码行；其余（wasm 下载失败等）原样上报
    if (Array.isArray(err && err.errors)) {
      const label = kind === 'vue' ? `${path}（<script> 编译产物行号）` : path
      throw new Error(formatTranspileError(err, label), { cause: err })
    }
    throw err
  }
}

function cacheKey(path, text) {
  let hash = 2166136261
  const value = String(text ?? '')
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619) >>> 0
  }
  return path + '\u0000' + value.length + '\u0000' + (hash >>> 0).toString(36)
}

/** 按 路径 + 内容 缓存：反复重跑同一个模块不用重复转译。cache 可由调用方共享 */
export function createCompiler({ onStatus, cache = new Map() } = {}) {
  return async function compile(path, text) {
    if (compileKind(path) === 'none') return { text: String(text ?? ''), lines: null, shift: 0, notes: [] }
    const key = cacheKey(path, text)
    const hit = cache.get(key)
    if (hit) {
      cache.delete(key)
      cache.set(key, hit)
      return hit
    }
    const compiled = await compileModule(path, text, { onStatus })
    cache.set(key, compiled)
    while (cache.size > MAX_CACHE_ITEMS) cache.delete(cache.keys().next().value)
    return compiled
  }
}
