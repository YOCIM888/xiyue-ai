/* 在 sandbox="allow-scripts" 的 iframe（opaque origin + CSP 全禁网络）内执行。
 * 隔离由浏览器保证，无需代码黑名单：无父页 DOM/存储访问，无网络，无子 Worker。 */

const MAX_OUTPUT_CHARS = 20000
const MAX_JS_CHARS = 20000

function truncate(text, max = MAX_OUTPUT_CHARS) {
  const value = String(text ?? '')
  return value.length > max ? `${value.slice(0, max)}\n…（输出过长已截断）` : value
}

function formatValue(value) {
  if (typeof value === 'string') return value
  if (value === null || value === undefined) return String(value)
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value)
  try {
    return JSON.stringify(value, (_, v) => typeof v === 'bigint' ? `${v}n` : v, 2)
  } catch {
    return String(value)
  }
}

async function runCode(code) {
  const logs = []
  let logSize = 0
  const original = { log: console.log, warn: console.warn, error: console.error, info: console.info }
  const capture = (...args) => {
    const line = args.map(formatValue).join(' ')
    logSize += line.length
    if (logSize <= MAX_OUTPUT_CHARS * 2) logs.push(line)
  }
  console.log = capture
  console.warn = capture
  console.error = capture
  console.info = capture
  try {
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
    const fn = new AsyncFunction(`"use strict";\n${code}`)
    const value = await fn()
    return {
      ok: true,
      output: value === undefined ? '' : truncate(formatValue(value)),
      logs: truncate(logs.join('\n')),
    }
  } catch (err) {
    return { ok: false, error: truncate(err?.message || String(err), 4000) }
  } finally {
    Object.assign(console, original)
  }
}

window.addEventListener('message', async (event) => {
  if (event.source !== window.parent) return
  const { id, code } = event.data || {}
  if (!id) return
  const source = String(code || '')
  let result
  if (!source.trim()) result = { ok: false, error: '代码为空' }
  else if (source.length > MAX_JS_CHARS) result = { ok: false, error: `代码过长，最多 ${MAX_JS_CHARS} 字符` }
  else result = await runCode(source)
  window.parent.postMessage({ id, ...result }, '*')
})

window.parent.postMessage({ type: 'ready' }, '*')