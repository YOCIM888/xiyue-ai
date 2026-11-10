/**
 * 计算沙箱调度层：
 * - 表格统计：Worker 中运行应用自有的纯解析代码（不执行模型代码）
 * - JS / Python：在 sandbox="allow-scripts" 的隐藏 iframe 中执行模型代码。
 *   iframe 无 allow-same-origin → opaque origin，天然无法访问父页 DOM、
 *   localStorage、IndexedDB、Cookie；CSP 再禁掉网络/子 Worker（Python 仅放行
 *   Pyodide CDN）。JS 侧额外放开 blob:，只用于把工作区模块源码喂进同一个
 *   opaque origin 里加载，不引入任何外部来源。隔离由浏览器强制，
 *   不再依赖可绕过的正则黑名单。
 *   超时或中止时直接移除 iframe，等价于终止整个运行时。
 */
import jsBoot from './jsBoot.js?raw'
import pyBoot from './pyBoot.js?raw'
import modulePathsRaw from './modulePaths.js?raw'

const JS_TIMEOUT = 15000
const TABLE_TIMEOUT = 20000
const PYTHON_TIMEOUT = 120000
const READY_TIMEOUT = 15000

const PY_CDN_HOSTS = 'https://cdn.jsdelivr.net https://unpkg.com https://registry.npmmirror.com'
const CSP = {
  js: "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:",
  python: `default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' ${PY_CDN_HOSTS}; connect-src ${PY_CDN_HOSTS}`,
}

/**
 * modulePaths.js 里只允许 `export function` 形式的导出，去掉关键字后这些函数
 * 就成了经典脚本的全局函数，供 jsBoot 在 iframe 内直接调用（tests/sandboxModules.test.js 守住这个前提）。
 */
function toClassicScript(source) {
  return String(source).replace(/^export\s+function/gm, 'function')
}

function buildSrcdoc(kind) {
  const boot = kind === 'python' ? pyBoot : `${toClassicScript(modulePathsRaw)}\n${jsBoot}`
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${CSP[kind]}"></head><body><script>${boot}</script></body></html>`
}

// ---- 表格统计 Worker ----
let tableWorker = null
let tableSeq = 0
const tablePending = new Map()

function terminateTableWorker(error) {
  for (const pending of tablePending.values()) {
    clearTimeout(pending.timer)
    pending.cleanup?.()
    pending.reject(error)
  }
  tablePending.clear()
  try { tableWorker?.terminate() } catch { /* ignore */ }
  tableWorker = null
}

function ensureTableWorker() {
  if (tableWorker) return tableWorker
  tableWorker = new Worker(new URL('./tableWorker.js', import.meta.url), { type: 'module' })
  tableWorker.onmessage = (event) => {
    const data = event.data || {}
    const pending = tablePending.get(data.id)
    if (!pending) return
    clearTimeout(pending.timer)
    pending.cleanup?.()
    tablePending.delete(data.id)
    if (data.ok) pending.resolve(data)
    else pending.reject(new Error(data.error || '表格统计失败'))
  }
  tableWorker.onerror = (event) => {
    terminateTableWorker(new Error(event?.message || '表格统计 Worker 运行失败'))
  }
  return tableWorker
}

function callTable(text, timeout, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('已中止'))
      return
    }
    let worker
    try {
      worker = ensureTableWorker()
    } catch (err) {
      reject(err)
      return
    }
    const id = ++tableSeq
    const timer = setTimeout(() => {
      terminateTableWorker(new Error('表格统计超时'))
    }, timeout)
    const onAbort = () => terminateTableWorker(new Error('已中止'))
    signal?.addEventListener('abort', onAbort, { once: true })
    const cleanup = () => signal?.removeEventListener('abort', onAbort)
    tablePending.set(id, { resolve, reject, timer, cleanup })
    worker.postMessage({ id, payload: { text } })
  })
}

/** 本地表格校验与统计 */
export async function analyzeTable(text, { signal } = {}) {
  const source = String(text || '')
  if (!source.trim()) return { ok: false, error: '没有可统计的表格数据' }
  try {
    const result = await callTable(source, TABLE_TIMEOUT, signal)
    return { ok: true, summary: result.summary || '' }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
}

// ---- 隔离 iframe ----
const frames = { js: null, python: null }

function destroyFrame(kind, error) {
  const frame = frames[kind]
  if (!frame) return
  frames[kind] = null
  clearTimeout(frame.readyTimer)
  window.removeEventListener('message', frame.handler)
  for (const pending of frame.pending.values()) {
    clearTimeout(pending.timer)
    pending.cleanup?.()
    pending.reject(error)
  }
  frame.pending.clear()
  frame.readyReject(error)
  try { frame.el.remove() } catch { /* ignore */ }
}

function ensureFrame(kind) {
  if (frames[kind]) return frames[kind]
  const el = document.createElement('iframe')
  el.setAttribute('sandbox', 'allow-scripts')
  el.setAttribute('aria-hidden', 'true')
  el.style.display = 'none'
  const frame = { el, pending: new Map(), seq: 0, handler: null, readyTimer: null, readyReject: () => {} }
  frame.ready = new Promise((resolve, reject) => {
    frame.readyReject = reject
    frame.readyTimer = setTimeout(() => {
      destroyFrame(kind, new Error('沙箱初始化超时'))
    }, READY_TIMEOUT)
    frame.handler = (event) => {
      if (event.source !== el.contentWindow) return
      const data = event.data || {}
      if (data.type === 'ready') {
        clearTimeout(frame.readyTimer)
        resolve()
        return
      }
      const pending = frame.pending.get(data.id)
      if (!pending) return
      if (data.type === 'status') {
        pending.onStatus?.(data.text || '')
        return
      }
      clearTimeout(pending.timer)
      pending.cleanup?.()
      frame.pending.delete(data.id)
      if (data.ok) pending.resolve(data)
      else pending.reject(new Error(data.error || '沙箱执行失败'))
    }
    window.addEventListener('message', frame.handler)
  })
  frame.ready.catch(() => { /* 失败通过 pending 拒绝传递给调用方 */ })
  el.srcdoc = buildSrcdoc(kind)
  document.body.appendChild(el)
  frames[kind] = frame
  return frame
}

function callFrame(kind, payload, timeout, signal, onStatus) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('已中止'))
      return
    }
    let frame
    try {
      frame = ensureFrame(kind)
    } catch (err) {
      reject(err)
      return
    }
    const id = ++frame.seq
    const timer = setTimeout(() => {
      destroyFrame(kind, new Error(kind === 'python' ? 'Python 执行超时，已终止运行时' : '计算超时，已终止本地沙箱'))
    }, timeout)
    const onAbort = () => destroyFrame(kind, new Error('已中止'))
    signal?.addEventListener('abort', onAbort, { once: true })
    const cleanup = () => signal?.removeEventListener('abort', onAbort)
    frame.pending.set(id, { resolve, reject, timer, cleanup, onStatus })
    frame.ready.then(() => {
      if (frame.pending.has(id)) frame.el.contentWindow.postMessage({ id, ...payload }, '*')
    }).catch(() => { /* ready 失败时 pending 已被 destroyFrame 拒绝 */ })
  })
}

/**
 * 执行受限 JavaScript。
 * 传 modules 时按工作区模块图加载（入口可为模块文件或内联代码），代码用 return 或
 * 导出函数返回结果；不传时保持旧的纯代码语义。
 */
export async function runJavaScript(code, { modules, order, entry, signal } = {}) {
  const graph = Array.isArray(modules) && modules.length ? { modules, order, entry } : null
  try {
    const result = await callFrame(
      'js',
      graph ? { code: String(code || ''), ...graph } : { code: String(code || '') },
      JS_TIMEOUT,
      signal
    )
    return {
      ok: true,
      output: [result.logs, result.output].filter(Boolean).join('\n') || '（无输出）',
    }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
}

/** 按需加载 Pyodide 并执行 Python 代码 */
export async function runPython(code, { onStatus, signal } = {}) {
  try {
    const result = await callFrame('python', { code: String(code || '') }, PYTHON_TIMEOUT, signal, onStatus)
    return { ok: true, output: result.output || '（无输出）' }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
}

/** 从模型回复中提取 sandbox 代码块 */
export function extractSandboxTasks(content) {
  const tasks = []
  const regex = /```(sandbox-js|sandbox-python|calc-js|calc-python)[^\n]*\n([\s\S]*?)```/gi
  for (const match of String(content || '').matchAll(regex)) {
    const lang = /python/i.test(match[1]) ? 'python' : 'js'
    const code = match[2].trim()
    if (code && code.length <= 20000) tasks.push({ lang, code })
    if (tasks.length >= 2) break
  }
  return tasks
}
