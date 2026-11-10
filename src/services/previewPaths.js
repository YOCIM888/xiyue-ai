/**
 * 预览运行时的纯逻辑层：宿主直接 import，同时按 ?raw 去掉 export 关键字后拼进
 * 内联脚本注入预览 iframe（tests/previewRuntime.test.js 守住这个注入前提）。
 * 因此本文件只能用 export const / export function，且不能依赖任何宿主模块。
 */

/** 预览 iframe → 宿主 */
export const PREVIEW_MESSAGE = 'xiyue-preview'
/** 宿主 → 预览 iframe，只用于应答 fetch */
export const PREVIEW_REPLY = 'xiyue-preview-reply'
/**
 * 宿主 → 预览 iframe 的自测指令，以及它的应答。
 * 必须和上面那对分开：fetch 用自增 id 在 boot 的 pending 表里配对，
 * 指令应答混进去会被当成某个 fetch 的结果吃掉，两边一起卡死。
 */
export const PREVIEW_COMMAND = 'xiyue-preview-command'
export const PREVIEW_COMMAND_REPLY = 'xiyue-preview-command-reply'

export const PREVIEW_LEVELS = ['log', 'info', 'warn', 'error', 'debug']

const EXTERNAL_URL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i
const MAX_ENTRY_CHARS = 2000
const MAX_SOURCE_CHARS = 200
const MAX_STACK_FRAMES = 4
const MAX_ITEMS = 20
const MAX_DEPTH = 3

function truncate(text, max) {
  const value = String(text ?? '')
  return value.length > max ? `${value.slice(0, max)}…（已截断）` : value
}

function formatError(err) {
  const head = truncate(`${err.name || 'Error'}: ${err.message || ''}`.trim() || String(err), MAX_ENTRY_CHARS)
  // about:srcdoc 的行号是「注入运行时之后」的位置，和源文件对不上，留着只会误导
  const frames = String(err.stack || '')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.includes('about:srcdoc'))
    .slice(1, 1 + MAX_STACK_FRAMES)
  return frames.length ? `${head}\n    ${frames.join('\n    ')}` : head
}

/** DOM 节点不能 JSON 化，给一个能认出来的标签 */
function nodeLabel(value) {
  if (typeof value?.nodeType !== 'number' || typeof value.nodeName !== 'string') return null
  const name = String(value.nodeName).toLowerCase()
  if (value.nodeType === 3) return truncate(`"${value.textContent || ''}"`, 120)
  if (value.nodeType !== 1) return name.startsWith('#') ? name : `#${name}`
  const id = value.id ? `#${value.id}` : ''
  const cls = typeof value.className === 'string' && value.className.trim()
    ? `.${value.className.trim().split(/\s+/).slice(0, 3).join('.')}`
    : ''
  return `<${name}${id}${cls}>`
}

function listLabel(value, depth, seen) {
  const items = []
  for (const item of value) {
    if (items.length >= MAX_ITEMS) break
    items.push(formatPreviewArg(item, depth + 1, seen))
  }
  const more = value.length > items.length ? `, …(+${value.length - items.length})` : ''
  return `[${items.join(', ')}${more}]`
}

function objectLabel(value, depth, seen) {
  const items = []
  let keys
  try {
    keys = Object.keys(value)
  } catch {
    return '[无法读取属性]'
  }
  for (const key of keys) {
    if (items.length >= MAX_ITEMS) break
    let text
    try {
      text = formatPreviewArg(value[key], depth + 1, seen)
    } catch {
      text = '[无法读取]'
    }
    items.push(`${key}: ${text}`)
  }
  const more = keys.length > items.length ? `, …(+${keys.length - items.length})` : ''
  let tag = ''
  try {
    const name = value.constructor?.name
    if (name && name !== 'Object') tag = `${name} `
  } catch {
    // 跨域对象的 constructor 会抛，忽略即可
  }
  return `${tag}{${items.join(', ')}${more}}`
}

/**
 * console 参数安全序列化：循环引用、Error、DOM 节点、BigInt、跨域对象都不能抛。
 * 序列化失败意味着预览页看不到日志，所以这里宁可输出「无法读取」也不向上抛。
 */
export function formatPreviewArg(value, depth = 0, seen = null) {
  if (typeof value === 'string') return truncate(value, MAX_ENTRY_CHARS)
  if (value === null || value === undefined) return String(value)
  const type = typeof value
  if (type === 'number' || type === 'boolean') return String(value)
  if (type === 'bigint') return `${value}n`
  if (type === 'symbol') return value.toString()
  if (type === 'function') return `[Function ${value.name || 'anonymous'}]`
  if (typeof window !== 'undefined' && (value === window || value === document)) return `[${value === window ? 'Window' : 'Document'}]`
  if (value instanceof Error) return formatError(value)
  const node = nodeLabel(value)
  if (node) return node
  if (depth >= MAX_DEPTH) return '…'
  const visited = seen || new WeakSet()
  if (visited.has(value)) return '[循环引用]'
  visited.add(value)
  try {
    if (Array.isArray(value)) return listLabel(value, depth, visited)
    if (value instanceof Map) return listLabel([...value.entries()].map(entry => `${formatPreviewArg(entry[0], depth + 1, visited)} => ${formatPreviewArg(entry[1], depth + 1, visited)}`), depth, visited)
    if (value instanceof Set) return listLabel([...value], depth, visited)
    return objectLabel(value, depth, visited)
  } finally {
    visited.delete(value)
  }
}

/** data: / blob: / about: / http(s): 以及协议相对地址都交给原生 fetch，只有工作区相对路径才走桥 */
export function isExternalUrl(url) {
  return EXTERNAL_URL.test(String(url ?? '').trim())
}

/** 预览文档在工作区里的位置：iframe 内的相对 fetch 由宿主按 base 解析 */
export function runtimeConfigFor(path) {
  const segments = String(path || '').split('/').filter(Boolean)
  return { path: segments.join('/'), base: segments.slice(0, -1) }
}

// ---- 模块图与 importmap ----

/** 裸模块名的兜底来源。预览 iframe 本来就没有 CSP、外链脚本能加载，所以这是补齐而不是放开 */
export const PREVIEW_CDN_BASE = 'https://esm.sh/'

/** 内联 module script 的 lang → 虚拟文件扩展名；扩展名决定要不要过转译 */
export const INLINE_LANG_EXT = {
  js: '.js', javascript: '.js', module: '.js',
  ts: '.ts', typescript: '.ts', tsx: '.tsx', jsx: '.jsx',
}

export function inlineLangExtension(lang) {
  return INLINE_LANG_EXT[String(lang ?? '').trim().toLowerCase()] || '.js'
}

/**
 * HTML 里的内联 module script 在模块图里的虚拟路径。
 * 必须挂在 HTML 所在目录：sub/page.html 里的 ./x.js 要解析成 sub/x.js，指到根目录就全错了。
 */
export function virtualInlinePath(htmlPath, index, lang = '') {
  const segments = String(htmlPath || '').split('/').filter(Boolean)
  return [...segments.slice(0, -1), `__inline_${index}__${inlineLangExtension(lang)}`].join('/')
}

/** 裸模块名 → CDN ESM 地址；已经是绝对地址或空值时返回空串 */
export function cdnModuleUrl(specifier) {
  const name = String(specifier ?? '').trim().replace(/^\/+/, '')
  if (!name || isExternalUrl(name)) return ''
  return `${PREVIEW_CDN_BASE}${name}`
}

const UNSAFE_KEY = /^(?:__proto__|constructor|prototype)$/

function isSafeKey(key) {
  return typeof key === 'string' && key !== '' && !UNSAFE_KEY.test(key)
}

/** 只收 string→string 的映射，其余形状（数组、数字、危险键）丢掉 */
function readStringMap(value) {
  const out = {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'string' && item && isSafeKey(key)) out[key] = item
  }
  return out
}

/**
 * 页面自带的 importmap：只接受 { imports: {串:串}, scopes: {串:{串:串}} }。
 * 这是工作区文件里的内容，形状不对就整张丢掉，绝不透传给浏览器。
 */
export function parseImportMap(text) {
  let raw
  try {
    raw = JSON.parse(String(text ?? ''))
  } catch {
    return null
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const scopes = {}
  if (raw.scopes && typeof raw.scopes === 'object' && !Array.isArray(raw.scopes)) {
    for (const [scope, value] of Object.entries(raw.scopes)) {
      if (isSafeKey(scope)) scopes[scope] = readStringMap(value)
    }
  }
  return { imports: readStringMap(raw.imports), scopes }
}

/** 多张 importmap 合成一张：后来的覆盖先来的。浏览器只认第一张，合并至少不会静默丢掉后面的 */
export function mergeImportMaps(list) {
  const imports = {}
  const scopes = {}
  for (const map of Array.isArray(list) ? list : []) {
    if (!map) continue
    Object.assign(imports, map.imports || {})
    for (const [scope, value] of Object.entries(map.scopes || {})) {
      scopes[scope] = { ...(scopes[scope] || {}), ...(value || {}) }
    }
  }
  return { imports, scopes }
}

/**
 * 注入用 importmap：模块图的 canonical 路径 → blob URL，裸模块名 → CDN，
 * 页面自带的映射最后覆盖 —— 那是作者显式声明的意图，优先级最高。
 * 映射值必须是绝对地址：宿主把页面写的相对地址换成了 canonical 路径，
 * 这里要再换成对应的 blob URL，否则浏览器按文档基址解析，得到的是一个 404。
 */
export function buildImportMap({ modules = {}, bare = [], page = null } = {}) {
  const imports = {}
  for (const [specifier, url] of Object.entries(modules || {})) {
    if (typeof url === 'string' && url && isSafeKey(specifier)) imports[specifier] = url
  }
  for (const specifier of Array.isArray(bare) ? bare : []) {
    const key = String(specifier ?? '')
    const url = cdnModuleUrl(key)
    if (url && isSafeKey(key) && !imports[key]) imports[key] = url
  }
  const toUrl = value => {
    const hit = modules?.[value]
    return typeof hit === 'string' && hit ? hit : value
  }
  const readPageMap = entries => {
    const out = {}
    for (const [key, value] of Object.entries(entries || {})) {
      if (!isSafeKey(key) || typeof value !== 'string' || !value) continue
      out[key] = toUrl(value)
    }
    return out
  }
  Object.assign(imports, readPageMap(page?.imports))
  const map = { imports }
  const scopes = {}
  for (const [scope, entries] of Object.entries(page?.scopes || {})) {
    if (!isSafeKey(scope)) continue
    const mapped = readPageMap(entries)
    if (Object.keys(mapped).length) scopes[scope] = mapped
  }
  if (Object.keys(scopes).length) map.scopes = scopes
  return map
}

/**
 * blob URL 反查工作区路径：不回映射的话报错栈里只有一串随机 UUID，没法定位到源文件。
 * 栈帧会在 URL 后紧跟 :行:列，所以要先把位置后缀剥掉再查表。
 */
export function mapModuleUrls(text, pathsByUrl) {
  const raw = String(text ?? '')
  if (!pathsByUrl || !pathsByUrl.size || !raw.includes('blob:')) return raw
  return raw.replace(/blob:[^\s)'"]+/g, hit => {
    const tail = /(?::\d+){1,2}$/.exec(hit)
    const suffix = tail ? tail[0] : ''
    const base = suffix ? hit.slice(0, -suffix.length) : hit
    const path = pathsByUrl.get(base)
    return path ? `${path}${suffix}` : hit
  })
}

/**
 * 把 iframe 上报的原始消息整理成控制台条目。
 * 不认识的 kind、空文本一律返回 null：宿主只渲染白名单内容，绝不透传结构。
 */
export function normalizePreviewEntry(data) {
  const kind = String(data?.kind || '')
  if (kind !== 'log' && kind !== 'error') return null
  const level = PREVIEW_LEVELS.includes(String(data?.level)) ? String(data.level) : kind === 'error' ? 'error' : 'log'
  const text = truncate(String(data?.text ?? '').trim(), MAX_ENTRY_CHARS)
  if (!text) return null
  return { level, text, source: truncate(String(data?.source ?? '').replace(/\s+/g, ' ').trim(), MAX_SOURCE_CHARS) }
}

/** 引导脚本就绪时给抽屉一条说明，让人知道存储是内存实现、刷新即清空 */
export function readyEntry(data) {
  const shims = Array.isArray(data?.shims) ? data.shims.filter(item => typeof item === 'string' && item) : []
  return {
    level: 'info',
    text: shims.length
      ? `预览运行时就绪，已接管 ${shims.join(' / ')}；存储是内存实现，刷新即清空`
      : '预览运行时就绪',
    source: '',
  }
}
