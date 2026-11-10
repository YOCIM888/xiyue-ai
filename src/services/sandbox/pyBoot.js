/* 在 sandbox="allow-scripts" 的 iframe（opaque origin）内执行。
 * CSP 仅放行 Pyodide CDN 的脚本与网络请求，其余全部禁止；
 * 即使代码通过 import js 拿到 window，也无法访问父页存储或外发数据。 */

const PYODIDE_VERSION = '0.29.5'
const CDN_LIST = [
  `https://cdn.jsdelivr.net/npm/pyodide@${PYODIDE_VERSION}/`,
  `https://unpkg.com/pyodide@${PYODIDE_VERSION}/`,
  `https://registry.npmmirror.com/pyodide/${PYODIDE_VERSION}/files/`,
]
const MAX_CODE_CHARS = 20000
const MAX_OUTPUT_CHARS = 20000

let runtimePromise = null

function postStatus(id, text) {
  window.parent.postMessage({ id, type: 'status', text }, '*')
}

function truncate(text, max = MAX_OUTPUT_CHARS) {
  const value = String(text ?? '')
  return value.length > max ? `${value.slice(0, max)}\n…（输出过长已截断）` : value
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = src
    script.onload = resolve
    script.onerror = () => reject(new Error(`脚本加载失败：${src}`))
    document.head.appendChild(script)
  })
}

async function loadRuntime(id) {
  if (runtimePromise) return runtimePromise
  const promise = (async () => {
    let lastError
    for (const base of CDN_LIST) {
      try {
        postStatus(id, `正在从 ${new URL(base).host} 加载 Python 运行时…`)
        await loadScript(`${base}pyodide.js`)
        if (typeof window.loadPyodide !== 'function') throw new Error('Pyodide 加载器不可用')
        const pyodide = await window.loadPyodide({ indexURL: base })
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

async function runPython(id, source) {
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
  return { id, ok: true, output: truncate(combined || '（无输出）') }
}

window.addEventListener('message', async (event) => {
  if (event.source !== window.parent) return
  const { id, code } = event.data || {}
  if (!id) return
  const source = String(code || '')
  try {
    if (!source.trim()) throw new Error('代码为空')
    if (source.length > MAX_CODE_CHARS) throw new Error(`代码过长，最多 ${MAX_CODE_CHARS} 字符`)
    const result = await runPython(id, source)
    window.parent.postMessage(result, '*')
  } catch (err) {
    window.parent.postMessage({ id, ok: false, error: truncate(err?.message || String(err), 4000) }, '*')
  }
})

window.parent.postMessage({ type: 'ready' }, '*')