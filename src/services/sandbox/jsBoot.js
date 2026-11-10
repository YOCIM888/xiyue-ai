/* 在 sandbox="allow-scripts" 的 iframe（opaque origin + CSP 全禁网络）内执行。
 * 隔离由浏览器保证，无需代码黑名单：无父页 DOM/存储访问，无网络，无子 Worker。
 *
 * 两种运行方式：
 *  1) 纯代码：AsyncFunction 包裹，return 即结果；
 *  2) 模块图：宿主已把 specifier 换成工作区 canonical 路径，这里按拓扑序把每个模块
 *     做成 blob URL 并把 specifier 换成对应 URL，再 import 入口 —— import/export、
 *     循环依赖、顶层 await 全部交给浏览器原生 ESM 加载器，语义不掺假。
 * 模块路径改写用的 rewriteSpecifiers 来自 modulePaths.js，由宿主把源码拼在本文件之前。
 */

const MAX_OUTPUT_CHARS = 20000
const MAX_JS_CHARS = 20000
const MAX_MODULES = 60

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

async function withConsoleCapture(run) {
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
    return { result: await run(), logs }
  } finally {
    Object.assign(console, original)
  }
}

async function runCode(code) {
  try {
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
    const fn = new AsyncFunction(`"use strict";\n${code}`)
    const { result, logs } = await withConsoleCapture(() => fn())
    return {
      ok: true,
      output: result === undefined ? '' : truncate(formatValue(result)),
      logs: truncate(logs.join('\n')),
    }
  } catch (err) {
    return { ok: false, error: truncate(err?.message || String(err), 4000) }
  }
}

/**
 * blob: URL 反查工作区路径，否则报错栈里只有一串随机 UUID，模型无法定位。
 * 栈帧会在 URL 后紧跟 :行:列，所以要先把位置后缀剥掉再查表；
 * about:srcdoc 是本引导脚本自己的行号，对模型没有意义，直接丢掉。
 */
function mapUrlsToPaths(text, pathsByUrl) {
  const raw = String(text ?? '')
  const mapped = raw.replace(/blob:[^\s)'"]+/g, hit => {
    const tail = /(?::\d+){1,2}$/.exec(hit)
    const suffix = tail ? tail[0] : ''
    const base = suffix ? hit.slice(0, -suffix.length) : hit
    const path = pathsByUrl.get(base)
    return path ? `${path}${suffix}` : hit
  })
  return mapped.split('\n').filter(line => !line.includes('about:srcdoc')).join('\n')
}

async function runModules(payload) {
  if (payload.modules.length > MAX_MODULES) {
    return { ok: false, error: `模块数量 ${payload.modules.length} 超过沙箱上限 ${MAX_MODULES}` }
  }
  const sources = new Map(payload.modules.map(item => [item.path, String(item.text ?? '')]))
  const sequence = (Array.isArray(payload.order) && payload.order.length ? payload.order : [...sources.keys()])
    .filter(path => sources.has(path))
  const urls = new Map()
  const pathsByUrl = new Map()

  try {
    for (const path of sequence) {
      // 拓扑序保证依赖先拿到 URL，所以本模块的 specifier 在这里就能改写完成
      const text = rewriteSpecifiers(sources.get(path), spec => urls.get(spec) || spec)
      const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }))
      urls.set(path, url)
      pathsByUrl.set(url, path)
    }
    const entryUrl = urls.get(payload.entry)
    if (!entryUrl) return { ok: false, error: `入口模块不在本次加载列表里：${payload.entry}` }

    const { result, logs } = await withConsoleCapture(async () => {
      const namespace = await import(entryUrl)
      const runnable = typeof namespace.default === 'function'
        ? namespace.default
        : typeof namespace.main === 'function' ? namespace.main : null
      const value = runnable ? await runnable() : namespace.default
      return { output: value === undefined ? '' : truncate(formatValue(value)) }
    })
    return { ok: true, output: result.output, logs: truncate(logs.join('\n')), entry: payload.entry }
  } catch (err) {
    return {
      ok: false,
      error: truncate(mapUrlsToPaths([err?.message, err?.stack].filter(Boolean).join('\n'), pathsByUrl), 6000),
    }
  } finally {
    for (const url of urls.values()) URL.revokeObjectURL(url)
  }
}

async function run(payload) {
  const source = String(payload.code || '')
  if (Array.isArray(payload.modules) && payload.modules.length) {
    return runModules(payload)
  }
  if (!source.trim()) return { ok: false, error: '代码为空' }
  if (source.length > MAX_JS_CHARS) return { ok: false, error: `代码过长，最多 ${MAX_JS_CHARS} 字符` }
  return runCode(source)
}

window.addEventListener('message', async (event) => {
  if (event.source !== window.parent) return
  const data = event.data || {}
  if (!data.id) return
  let result
  try {
    result = await run(data)
  } catch (err) {
    result = { ok: false, error: truncate(err?.message || String(err), 4000) }
  }
  window.parent.postMessage({ id: data.id, ...result }, '*')
})

window.parent.postMessage({ type: 'ready' }, '*')
