/**
 * 工作区 ES 模块依赖图（纯逻辑，文件系统与编译由调用方注入，便于单测）。
 * 产出的 order 是拓扑序：被依赖的模块排在前面，沙箱才能按序生成 blob URL 并改写 specifier。
 * 需要转译的模块（.ts/.tsx/.jsx/.vue/.json）在这里就变成 ESM JS，沙箱只认 JS。
 */
import {
  blockedAlternatives, blockedExtension, candidatePaths, compileKind, dirnameOf,
  extractImportSpecs, isBareSpecifier, isUrlSpecifier, isVendorSpecifier, normalizePath,
  rewriteSpecifiers,
} from './modulePaths'
import { vendorByPath, vendorBySpecifier } from './vendorModules'

export const MAX_MODULE_FILES = 60
export const MAX_MODULE_TOTAL_BYTES = 4 * 1024 * 1024
/** 内联代码当成挂在根目录下的模块，于是 ./x.js 指向工作区根的 x.js */
export const VIRTUAL_ENTRY = '__sandbox_entry__.js'

const REASON_TEXT = {
  bare: '沙箱里没有 npm 包，只能加载工作区内的相对路径（以 ./ 或 ../ 开头），第三方只能用内置的 vue',
  outside: '路径越出工作区根目录',
  not_found: '工作区里找不到该文件',
}
const RUNNABLE_KINDS = '.js/.mjs/.cjs/.ts/.mts/.cts/.tsx/.jsx/.vue/.json'
const STYLE_EXTENSIONS = ['.css', '.scss', '.sass', '.less', '.styl', '.stylus']
const ASSET_EXTENSIONS = [
  '.svg', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.ico', '.bmp',
  '.mp3', '.mp4', '.wav', '.woff', '.woff2', '.ttf', '.otf',
]
const TEXT_DATA_EXTENSIONS = [
  '.md', '.txt', '.yaml', '.yml', '.toml', '.xml', '.wasm', '.node',
  '.zip', '.gz', '.pdf', '.docx', '.xlsx',
]

function failureReason(specifier) {
  const ext = blockedExtension(specifier)
  if (ext) {
    if (STYLE_EXTENSIONS.includes(ext)) return `${ext} 是样式，沙箱里没有样式管线，测试入口不要 import 它`
    if (ASSET_EXTENSIONS.includes(ext)) return `${ext} 是静态资源，沙箱没有资源加载器，改成字符串路径或内联数据`
    if (TEXT_DATA_EXTENSIONS.includes(ext)) return `${ext} 不是可执行模块，需要它的数据请写成 .js 里的 export`
    if (ext === '.html' || ext === '.htm') return `沙箱只运行 ${RUNNABLE_KINDS} 模块，不加载 HTML`
    return `沙箱不支持 ${ext}，可运行类型是 ${RUNNABLE_KINDS}`
  }
  if (isBareSpecifier(specifier)) return REASON_TEXT.bare
  return REASON_TEXT.outside
}

/**
 * @param {object} io  { listFiles(dirPath), readText(path), readVendor(path), compile(path, text) }
 *                     compile 返回 { text, lines, shift, notes }，把 TS/Vue/JSON 变成 ESM JS
 * @param {string} entry       入口文件路径
 * @param {string} code        单个内联入口（挂在工作区根目录，只支持 JS）
 * @param {Array<{path: string, text: string}>} inline
 *        多个内联模块。路径必须由调用方按宿主文档所在目录生成：
 *        sub/page.html 里的内联模块要叫 sub/__inline_1__.js，否则它写的 ./x.js 会解析到根目录。
 *        扩展名决定要不要转译，所以 lang="ts" 的内联模块给 .ts 就能过同一套编译。
 * @param {string[]} deps      额外进图的模块路径（只解析依赖，不当入口执行）
 * @param {boolean} allowBare  预览用：裸模块名与 http(s) 绝对地址原样保留，由注入的 importmap
 *                             指到 CDN；沙箱执行时保持 false —— 那里没有网络，两者都必须当场拒绝
 */
export async function buildGraph({
  io,
  entry = '',
  code = '',
  inline = [],
  deps = [],
  allowBare = false,
  maxFiles = MAX_MODULE_FILES,
  maxBytes = MAX_MODULE_TOTAL_BYTES,
}) {
  const inlineCode = String(code || '')
  const inlineSources = new Map()
  if (inlineCode.trim()) inlineSources.set(VIRTUAL_ENTRY, inlineCode)
  for (const item of Array.isArray(inline) ? inline : []) {
    const path = normalizePath(item?.path)
    if (path) inlineSources.set(path, String(item?.text ?? ''))
  }
  const entryPath = inlineCode.trim() ? VIRTUAL_ENTRY : String(entry || '').trim()
  const entryRoots = [...(entryPath ? [entryPath] : []), ...[...inlineSources.keys()].filter(p => p !== entryPath)]
  const roots = [
    ...entryRoots,
    ...deps.map(dep => String(dep || '').trim()).filter(Boolean).filter(dep => !entryRoots.includes(dep)),
  ]
  if (!roots.length) throw new Error('需要 entry、code 或 inline 才能运行模块')

  const dirCache = new Map()
  const modules = new Map()
  const maps = {}
  const notes = []
  const missing = []
  const order = []
  const cycles = []
  /** allowBare 时原样保留的裸模块名，由调用方决定指到哪个 CDN */
  const bare = new Set()
  let totalBytes = 0
  let truncated = false

  async function dirIndex(dirPath) {
    const key = dirPath || ''
    if (dirCache.has(key)) return dirCache.get(key)
    let index = { files: new Set(), dirs: new Set() }
    try {
      index = await io.listFiles(key)
    } catch {
      // 目录不存在等于没有候选，交给下面的 not_found 说明
    }
    dirCache.set(key, index)
    return index
  }

  async function fileExists(path) {
    const index = await dirIndex(dirnameOf(path))
    return index.files.has(path.split('/').pop())
  }

  async function requireFile(path, from, stack) {
    if (modules.has(path)) return
    const trail = [...stack, path]
    // 垫片模块不在工作区里，本身已是 JS：不占用户的体积额度
    const isVendor = Boolean(vendorByPath(path))

    let source
    if (isVendor) {
      try {
        source = await io.readVendor(path)
      } catch (err) {
        missing.push({ from, specifier: path, reason: err?.message || String(err) })
        return
      }
      modules.set(path, { path, text: source })
      // 垫片文本里写死了同目录的兄弟垫片路径，靠 requires 把它拉进图并排在前面
      for (const dep of vendorByPath(path).requires || []) {
        if (trail.includes(dep)) {
          cycles.push([...trail, dep].join(' → '))
          continue
        }
        await requireFile(dep, path, trail)
      }
      order.push(path)
      return
    }
    if (inlineSources.has(path)) {
      source = inlineSources.get(path)
    } else if (await fileExists(path)) {
      try {
        source = await io.readText(path)
      } catch (err) {
        missing.push({ from, specifier: path, reason: err?.message || String(err) })
        return
      }
    } else {
      missing.push({ from, specifier: path, reason: REASON_TEXT.not_found })
      return
    }

    if (modules.size >= maxFiles) {
      truncated = true
      missing.push({ from, specifier: path, reason: `模块数量超过上限 ${maxFiles} 个，请精简依赖` })
      return
    }
    if (totalBytes + source.length > maxBytes) {
      truncated = true
      missing.push({ from, specifier: path, reason: `模块总大小超过上限 ${(maxBytes / 1024 / 1024).toFixed(1)} MB` })
      return
    }
    totalBytes += source.length

    if (compileKind(path) !== 'none') {
      try {
        const compiled = await io.compile(path, source)
        source = compiled.text
        if (compiled.lines || compiled.shift) maps[path] = { lines: compiled.lines || null, shift: compiled.shift || 0 }
        if (compiled.notes?.length) notes.push({ path, notes: compiled.notes })
      } catch (err) {
        missing.push({ from, specifier: path, reason: err?.message || String(err) })
        return
      }
    }

    const resolved = new Map()
    for (const { specifier, kind } of extractImportSpecs(source)) {
      if (isVendorSpecifier(specifier)) {
        resolved.set(specifier, vendorBySpecifier(specifier).path)
        continue
      }
      if (allowBare && isUrlSpecifier(specifier)) continue
      if (allowBare && isBareSpecifier(specifier)) {
        bare.add(specifier)
        continue
      }
      if (blockedExtension(specifier)) {
        missing.push({ from: path, specifier, kind, reason: failureReason(specifier) })
        continue
      }
      const candidates = candidatePaths(path, specifier)
      if (!candidates.length) {
        missing.push({ from: path, specifier, kind, reason: failureReason(specifier) })
        continue
      }
      let target = ''
      for (const candidate of candidates) {
        if (await fileExists(candidate)) {
          target = candidate
          break
        }
      }
      if (!target) {
        // 同名但沙箱加载不了的类型存在时，说清原因，而不是让模型继续找
        const blocked = []
        for (const alternative of blockedAlternatives(path, specifier)) {
          if (await fileExists(alternative)) blocked.push(alternative)
        }
        const reason = blocked.length
          ? `只找到 ${blocked.join('、')}：${failureReason(blocked[0])}`
          : `${REASON_TEXT.not_found}（试过 ${candidates.join('、')}）`
        missing.push({ from: path, specifier, kind, reason })
        continue
      }
      resolved.set(specifier, target)
    }

    // 先登记再递归，环不会导致无限展开
    modules.set(path, { path, text: rewriteSpecifiers(source, spec => resolved.get(spec) || null) })

    for (const target of new Set(resolved.values())) {
      if (trail.includes(target)) {
        cycles.push([...trail, target].join(' → '))
        continue
      }
      await requireFile(target, path, trail)
    }
    order.push(path)
  }

  for (const root of roots) {
    if (inlineSources.has(root)) {
      await requireFile(root, null, [])
      continue
    }
    if (!(await fileExists(root))) {
      const index = await dirIndex(dirnameOf(root))
      missing.push({
        from: null,
        specifier: root,
        reason: index.dirs.has(root.split('/').pop()) ? `${root} 是目录，入口需要是 ${RUNNABLE_KINDS} 文件` : REASON_TEXT.not_found,
      })
      continue
    }
    await requireFile(root, null, [])
  }

  return {
    modules: [...modules.values()],
    order: order.filter(path => modules.has(path)),
    entry: entryPath,
    missing,
    cycles: [...new Set(cycles)],
    bare: [...bare],
    truncated,
    totalBytes,
    maps,
    notes,
  }
}
