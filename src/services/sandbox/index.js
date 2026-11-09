/**
 * 计算沙箱调度层：
 * - JS Worker：表格统计校验 + 受限 JavaScript 执行
 * - Python Worker：按需加载 Pyodide，执行 Python 代码
 */

const JS_TIMEOUT = 15000
const TABLE_TIMEOUT = 20000
const PYTHON_TIMEOUT = 120000

let jsWorker = null
let jsSeq = 0
const jsPending = new Map()

let pyWorker = null
let pySeq = 0
const pyPending = new Map()

function makeError(data) {
  return new Error(data?.error || '沙箱执行失败')
}

function terminateJsWorker(error) {
  for (const pending of jsPending.values()) {
    clearTimeout(pending.timer)
    pending.cleanup?.()
    pending.reject(error)
  }
  jsPending.clear()
  try { jsWorker?.terminate() } catch { /* ignore */ }
  jsWorker = null
}

function ensureJsWorker() {
  if (jsWorker) return jsWorker
  jsWorker = new Worker(new URL('./jsWorker.js', import.meta.url), { type: 'module' })
  jsWorker.onmessage = (event) => {
    const data = event.data || {}
    const pending = jsPending.get(data.id)
    if (!pending) return
    clearTimeout(pending.timer)
    pending.cleanup?.()
    jsPending.delete(data.id)
    if (data.ok) pending.resolve(data)
    else pending.reject(makeError(data))
  }
  jsWorker.onerror = (event) => {
    terminateJsWorker(new Error(event?.message || '沙箱 Worker 运行失败'))
  }
  return jsWorker
}

function callJs(kind, payload, timeout, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('已中止'))
      return
    }
    let worker
    try {
      worker = ensureJsWorker()
    } catch (err) {
      reject(err)
      return
    }
    const id = ++jsSeq
    const timer = setTimeout(() => {
      terminateJsWorker(new Error('计算超时，已终止本地沙箱'))
    }, timeout)
    const onAbort = () => terminateJsWorker(new Error('已中止'))
    signal?.addEventListener('abort', onAbort, { once: true })
    const cleanup = () => signal?.removeEventListener('abort', onAbort)
    jsPending.set(id, { resolve, reject, timer, cleanup })
    worker.postMessage({ id, kind, payload })
  })
}

/** 本地表格校验与统计 */
export async function analyzeTable(text, { signal } = {}) {
  const source = String(text || '')
  if (!source.trim()) return { ok: false, error: '没有可统计的表格数据' }
  try {
    const result = await callJs('table', { text: source }, TABLE_TIMEOUT, signal)
    return { ok: true, summary: result.summary || '' }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
}

/** 执行受限 JavaScript，代码需要用 return 返回结果 */
export async function runJavaScript(code, { signal } = {}) {
  try {
    const result = await callJs('js', { code: String(code || '') }, JS_TIMEOUT, signal)
    return {
      ok: true,
      output: [result.logs, result.output].filter(Boolean).join('\n') || '（无输出）',
    }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
}

function terminatePyWorker(error) {
  for (const pending of pyPending.values()) {
    clearTimeout(pending.timer)
    pending.cleanup?.()
    pending.resolve({ ok: false, error: error?.message || String(error) })
  }
  pyPending.clear()
  try { pyWorker?.terminate() } catch { /* ignore */ }
  pyWorker = null
}

function ensurePyWorker() {
  if (pyWorker) return pyWorker
  pyWorker = new Worker(new URL('./pythonWorker.js', import.meta.url))
  pyWorker.onmessage = (event) => {
    const data = event.data || {}
    const pending = pyPending.get(data.id)
    if (!pending) return
    if (data.type === 'status') {
      pending.onStatus?.(data.text || '')
      return
    }
    clearTimeout(pending.timer)
    pending.cleanup?.()
    pyPending.delete(data.id)
    if (data.ok) pending.resolve({ ok: true, output: data.output || '（无输出）' })
    else pending.resolve({ ok: false, error: data.error || 'Python 执行失败' })
  }
  pyWorker.onerror = (event) => {
    terminatePyWorker(new Error(event?.message || 'Python 沙箱运行失败'))
  }
  return pyWorker
}

/** 按需加载 Pyodide 并执行 Python 代码 */
export async function runPython(code, { onStatus, signal } = {}) {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve({ ok: false, error: '已中止' })
      return
    }
    let worker
    try {
      worker = ensurePyWorker()
    } catch (err) {
      resolve({ ok: false, error: err?.message || String(err) })
      return
    }
    const id = ++pySeq
    const timer = setTimeout(() => {
      terminatePyWorker(new Error('Python 执行超时，已终止运行时'))
    }, PYTHON_TIMEOUT)
    const onAbort = () => terminatePyWorker(new Error('已中止'))
    signal?.addEventListener('abort', onAbort, { once: true })
    const cleanup = () => signal?.removeEventListener('abort', onAbort)
    pyPending.set(id, { resolve, timer, onStatus, cleanup })
    worker.postMessage({ id, code: String(code || '') })
  })
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
