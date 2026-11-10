/**
 * 工作区 ES 模块的 specifier 扫描与路径解析（纯函数，不做任何 IO）。
 * 误判方向是安全的：解析不到的 specifier 一律原样保留，交给浏览器报原生错误，
 * 不会出现「悄悄改了不该改的字符串」这种假绿灯。
 */

const NATIVE_EXTENSIONS = ['.js', '.mjs', '.cjs']
/** 宿主侧先转译成 JS 再喂给沙箱的类型 */
const SOURCE_EXTENSIONS = ['.ts', '.mts', '.cts', '.tsx', '.jsx']
const SFC_EXTENSIONS = ['.vue']
const DATA_EXTENSIONS = ['.json']
/** 无扩展名 specifier 的补全顺序：TypeScript 源码优先于产物 */
const LOADABLE_EXTENSIONS = [...SOURCE_EXTENSIONS, ...SFC_EXTENSIONS, ...NATIVE_EXTENSIONS, ...DATA_EXTENSIONS]
const INDEX_EXTENSIONS = ['.ts', '.tsx', '.js', '.mjs', '.vue']
/** 沙箱里既不能转译也没有意义的类型 */
const BLOCKED_EXTENSIONS = [
  '.svelte', '.css', '.scss', '.sass', '.less', '.styl', '.stylus',
  '.html', '.htm', '.md', '.txt', '.yaml', '.yml', '.toml', '.xml',
  '.svg', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.ico', '.bmp',
  '.mp3', '.mp4', '.wav', '.woff', '.woff2', '.ttf', '.otf',
  '.wasm', '.node', '.zip', '.gz', '.pdf', '.docx', '.xlsx',
]
/** TS 里 import 相对路径通常写编译产物的 .js，解析要回指到源文件 */
const JS_TO_SOURCE = { '.js': ['.ts', '.tsx'], '.mjs': ['.mts'], '.cjs': ['.cts'] }
const IDENT_CHAR = /[A-Za-z0-9_$]/

/** 沙箱内置的第三方模块垫片名：只垫 vue 与其 JSX 运行时，其余裸模块名仍然拒绝 */
const VENDOR_NAMES = new Set(['vue', 'vue/jsx-runtime', 'xiyue:vue-mount'])

function extensionOf(value) {
  const tail = String(value ?? '').split('/').pop() || ''
  const dot = tail.lastIndexOf('.')
  return dot < 0 ? '' : tail.slice(dot).toLowerCase()
}

/** 需要宿主转译/编译的模块类型；'none' 表示浏览器可直接运行 */
export function compileKind(path) {
  const ext = extensionOf(path)
  if (ext === '.vue') return 'vue'
  if (ext === '.json') return 'json'
  if (ext === '.tsx') return 'tsx'
  if (ext === '.jsx') return 'jsx'
  if (['.ts', '.mts', '.cts'].includes(ext)) return 'ts'
  return 'none'
}

/** 按 TypeScript 语义解析 specifier 的 importer：它写的 .js 往往指 .ts */
function prefersSourceModules(fromPath) {
  return compileKind(fromPath) !== 'none' && compileKind(fromPath) !== 'json'
}

/** specifier 是否命中沙箱内置垫片 */
export function isVendorSpecifier(specifier) {
  return VENDOR_NAMES.has(String(specifier ?? '').trim())
}

/** 工作区相对路径规范化：去掉 ./ 与开头的 /，折叠 . 与 .. */
export function normalizePath(path) {
  const out = []
  for (const part of String(path ?? '').trim().replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue
    if (part === '..') {
      out.pop()
      continue
    }
    out.push(part)
  }
  return out.join('/')
}

/** 所在目录：'src/a/b.js' → 'src/a'，'b.js' → '' */
export function dirnameOf(path) {
  const clean = normalizePath(path)
  const index = clean.lastIndexOf('/')
  return index < 0 ? '' : clean.slice(0, index)
}

/**
 * 把 specifier 解析成工作区相对路径。
 * 返回 null 表示无法解析（裸模块名、URL、或 .. 越出工作区根目录）。
 */
export function resolveRelative(fromPath, specifier) {
  const spec = String(specifier ?? '').trim().replace(/\\/g, '/')
  // 只认显式的相对/根相对路径；裸模块名在浏览器里本来就无法解析，不做猜测
  if (!spec || (!spec.startsWith('./') && !spec.startsWith('../') && !spec.startsWith('/') && spec !== '.' && spec !== '..')) {
    return null
  }
  const parts = spec.startsWith('/') ? [] : dirnameOf(fromPath).split('/').filter(Boolean)
  for (const part of spec.replace(/^\/+/, '').split('/')) {
    if (!part || part === '.') continue
    if (part === '..') {
      if (!parts.length) return null
      parts.pop()
      continue
    }
    parts.push(part)
  }
  const path = parts.join('/')
  return path ? { path } : null
}

/** 依次尝试的存在性候选路径：原样、按 TS 语义回指源文件、补全可加载扩展名、目录下的 index */
export function candidatePaths(fromPath, specifier) {
  const resolved = resolveRelative(fromPath, specifier)
  if (!resolved) return []
  const { path } = resolved
  const ext = extensionOf(path)
  if (ext) {
    const sourceSiblings = prefersSourceModules(fromPath)
      ? (JS_TO_SOURCE[ext] || []).map(s => `${path.slice(0, -ext.length)}${s}`)
      : []
    return [...sourceSiblings, path]
  }
  const candidates = [
    path,
    ...LOADABLE_EXTENSIONS.map(candidateExt => `${path}${candidateExt}`),
    ...INDEX_EXTENSIONS.map(indexExt => `${path}/index${indexExt}`),
  ]
  return candidates
}

/** 沙箱既不能转译也无法运行的模块类型时返回扩展名，供调用方给出可执行的提示 */
export function blockedExtension(specifier) {
  const ext = extensionOf(specifier)
  return BLOCKED_EXTENSIONS.includes(ext) ? ext : ''
}

/**
 * 同名但类型不可加载的候选路径。
 * 用于把「找不到 ./chart」升级成「只找到 ./chart.svelte，沙箱不支持 .svelte」。
 */
export function blockedAlternatives(fromPath, specifier) {
  const resolved = resolveRelative(fromPath, specifier)
  if (!resolved) return []
  const { path } = resolved
  if (extensionOf(path)) return []
  return BLOCKED_EXTENSIONS.map(ext => `${path}${ext}`)
}

function isBare(specifier) {
  const spec = String(specifier ?? '')
  return !/^\.{1,2}\//.test(spec) && !spec.startsWith('/') && !/^[a-z][a-z0-9+.-]*:/i.test(spec)
}

/** 裸模块名（未打包的 npm 包），沙箱里没有 */
export function isBareSpecifier(specifier) {
  return isBare(specifier)
}

/**
 * 从字符串字面量位置回溯，判断它是不是模块 specifier。
 * 规则：紧邻的前一个有意义词是 from / import，或前一个非空字符是 ( 且再往前是 import。
 */
function classifyLiteral(src, start) {
  let i = start - 1
  while (i >= 0 && /\s/.test(src[i])) i -= 1
  if (i < 0) return null

  if (src[i] === '(') {
    i -= 1
    while (i >= 0 && /\s/.test(src[i])) i -= 1
    const token = readWordBackward(src, i)
    return token && token.word === 'import' && !isKey(src, token) ? 'dynamic' : null
  }

  const token = readWordBackward(src, i)
  if (!token || isKey(src, token)) return null
  return token.word === 'from' || token.word === 'import' ? 'static' : null
}

/** `from` / `import` 作为对象键（后面紧跟冒号）时不算 specifier */
function isKey(src, token) {
  return src[token.end + 1] === ':'
}

function readWordBackward(src, end) {
  let i = end
  while (i >= 0 && !IDENT_CHAR.test(src[i])) {
    // 只允许跨过空白与常见分隔符，遇到别的字符说明这不是我们要找的关键字
    if (i !== end && !/[\s;{}()[\],=:*]/.test(src[i])) return null
    i -= 1
  }
  let j = i
  while (j >= 0 && IDENT_CHAR.test(src[j])) j -= 1
  if (j >= i) return null
  return { word: src.slice(j + 1, i + 1), end: i }
}

/**
 * 遍历源码里的引号字符串，对判定为 specifier 的调用 visit。
 * visit 返回字符串即替换字面量内容（保持行号不变，只在同一行内替换）。
 */
function scanSpecifiers(src, visit) {
  const text = String(src ?? '')
  const replacements = []
  let i = 0

  while (i < text.length) {
    const char = text[i]
    if (char === '/' && (text[i + 1] === '/' || text[i + 1] === '*')) {
      const block = text[i + 1] === '*'
      const end = block ? text.indexOf('*/', i + 2) : text.indexOf('\n', i + 2)
      i = end < 0 ? text.length : (block ? end + 2 : end)
      continue
    }
    if (char === '"' || char === "'" || char === '`') {
      const quote = char
      let j = i + 1
      while (j < text.length && text[j] !== quote) {
        if (text[j] === '\\') j += 1
        j += 1
      }
      // ESM 的 specifier 只能是引号字面量，模板串一律跳过
      if (quote !== '`') {
        const value = text.slice(i + 1, j)
        const kind = classifyLiteral(text, i)
        if (kind && !value.includes('\n')) {
          const replaced = visit(value, kind)
          if (typeof replaced === 'string' && replaced !== value) {
            replacements.push({ from: i + 1, to: j, value: replaced })
          }
        }
      }
      i = j + 1
      continue
    }
    i += 1
  }

  // 按位置拼接，避免多次 replace 互相影响
  let cursor = 0
  let out = ''
  for (const item of replacements) {
    out += text.slice(cursor, item.from) + item.value
    cursor = item.to
  }
  out += text.slice(cursor)
  return out
}

/** 列出源码中出现的模块 specifier（含动态 import 的字面量形式） */
export function extractImportSpecs(src) {
  const found = []
  scanSpecifiers(src, (value, kind) => {
    found.push({ specifier: value, kind })
    return null
  })
  return found
}

/** 用 resolver 给出的新值改写源码中的 specifier；resolver 返回 null 表示保持原样 */
export function rewriteSpecifiers(src, resolver) {
  return scanSpecifiers(src, (value, kind) => resolver(value, kind))
}
