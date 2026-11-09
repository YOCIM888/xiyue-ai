/**
 * Python 计算沙箱 Worker：
 * 按需从 CDN 加载 Pyodide（首次约 10MB），之后复用同一个运行时。
 * 主线程负责超时；超时后会终止本 Worker 并重新加载。
 */

const PYODIDE_VERSION = '0.29.5'
const CDN_LIST = [
  `https://cdn.jsdelivr.net/npm/pyodide@${PYODIDE_VERSION}/`,
  `https://unpkg.com/pyodide@${PYODIDE_VERSION}/`,
  `https://registry.npmmirror.com/pyodide/${PYODIDE_VERSION}/files/`,
]
const MAX_CODE_CHARS = 20000
const MAX_OUTPUT_CHARS = 20000
const PY_BLOCKED = /\b(import\s+js|from\s+js\s+import|pyodide\.http|pyfetch|open_url|os\.system|subprocess)\b/

let runtimePromise = null

function postStatus(id, text) {
  self.postMessage({ id, type: 'status', text })
}

function truncate(text) {
  const value = String(text ?? '')
  return value.length > MAX_OUTPUT_CHARS ? `${value.slice(0, MAX_OUTPUT_CHARS)}\n…（输出过长已截断）` : value
}

async function loadRuntime(id) {
  if (runtimePromise) return runtimePromise
  const promise = (async () => {
    let lastError
    for (const base of CDN_LIST) {
      try {
        const host = new URL(base).host
        postStatus(id, `正在从 ${host} 加载 Python 运行时…`)
        importScripts(`${base}pyodide.js`)
        if (typeof self.loadPyodide !== 'function') throw new Error('Pyodide 加载器不可用')
        const pyodide = await self.loadPyodide({ indexURL: base })
        postStatus(id, 'Python 运行时加载完成，正在执行代码…')
        return pyodide
      } catch (err) {
        lastError = err
      }
    }
    throw new Error(`Python 运行时加载失败：${lastError?.message || '网络不可用或 CDN 被拦截'}`)
  })()
  runtimePromise = promise
  promise.catch(() => {
    if (runtimePromise === promise) runtimePromise = null
  })
  return promise
}

self.onmessage = async (event) => {
  const { id, code } = event.data || {}
  if (!id) return
  const source = String(code || '')
  try {
    if (!source.trim()) throw new Error('代码为空')
    if (source.length > MAX_CODE_CHARS) throw new Error(`代码过长，最多 ${MAX_CODE_CHARS} 字符`)
    if (PY_BLOCKED.test(source)) throw new Error('沙箱禁止网络访问与系统命令')

    const pyodide = await loadRuntime(id)
    await pyodide.loadPackagesFromImports(source)

    const logs = []
    let logSize = 0
    const pushLog = text => {
      logSize += String(text).length
      if (logSize <= MAX_OUTPUT_CHARS * 2) logs.push(text)
    }
    pyodide.setStdout({ batched: pushLog })
    pyodide.setStderr({ batched: pushLog })

    let value = await pyodide.runPythonAsync(source)
    let output = ''
    if (value !== undefined && value !== null) {
      output = String(value)
      if (typeof value?.destroy === 'function') {
        try { value.destroy() } catch { /* 忽略代理释放失败 */ }
      }
    }
    const combined = [logs.join('').trim(), output.trim()].filter(Boolean).join('\n')
    self.postMessage({ id, ok: true, output: truncate(combined || '（无输出）') })
  } catch (err) {
    self.postMessage({ id, ok: false, error: truncate(err?.message || String(err), 4000) })
  }
}
