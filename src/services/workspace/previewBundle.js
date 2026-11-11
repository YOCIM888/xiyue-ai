/**
 * 预览打包：把 HTML 及本地 CSS / JS / 图片 / 字体内联成单文件 HTML，
 * 并注入预览运行时；模块脚本走跨文件 ESM 图。
 */
import {
  MAX_PREVIEW_ASSET_BYTES, MAX_PREVIEW_FILE_BYTES, MAX_PREVIEW_TOTAL_BYTES, MIN_MODULE_BYTES,
  formatBytes, splitPath,
} from './core'
import { getFileBlob } from './fs'
import { resolveAssetPath, mimeFromPath, rewriteCssUrls, rewriteSrcset } from '../../utils/htmlInline'
import {
  buildRuntimeScript, PREVIEW_INERT_MAP_TYPE, PREVIEW_INERT_TYPE, PREVIEW_MODULE_ATTR, PREVIEW_RUNTIME_ATTR,
} from '../previewRuntime'
import {
  inlineLangExtension, isExternalUrl, mergeImportMaps, parseImportMap, virtualInlinePath,
} from '../previewPaths'
import { compileKind, extractImportSpecs } from '../sandbox/modulePaths'
import { compileModule } from '../sandbox/compile'

function blobToDataUrl(blob, fallbackMime) {
  const file = blob.type ? blob : blob.slice(0, blob.size, fallbackMime)
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error || new Error('读取资源失败'))
    reader.readAsDataURL(file)
  })
}

/** 内联 module script 要不要绕模块图：需要转译，或者写了 import（含动态 import） */
function moduleNeedsGraph(text, lang) {
  if (inlineLangExtension(lang) !== '.js') return true
  return extractImportSpecs(String(text || '')).length > 0
}

/** 模块路径写成 JS 字符串字面量；< 一律转义，序列化时才不会被当成 script 结束标签 */
function moduleLiteral(path) {
  return JSON.stringify(String(path || '')).replace(/</g, '\\u003c')
}

/**
 * 把工作区里的 HTML 及其本地 CSS / JS / 图片 / 字体内联成单文件 HTML，
 * 供 iframe srcdoc 预览（需设置 sandbox，不授予同源权限）。
 * 同时在 head 最前注入预览运行时：opaque origin 下页面的 storage / 相对 fetch
 * 会直接抛异常，没有它，脚本启动即死的页面看起来就是「能看不能点」。
 *
 * <script type="module"> 另外走模块图：每个模块脚本被换成 import "canonical 路径"，
 * 模块源码随运行时一起注入，由 iframe 侧做成 blob URL 并用 importmap 解析 ——
 * 跨文件 import、.ts / .vue 转译、循环依赖与顶层 await 都按浏览器原生 ESM 语义跑。
 * 被额度挤掉或找不到的模块会写进 moduleIssues，绝不静默丢弃。
 */
export async function buildPreviewBundle(path) {
  const file = await getFileBlob(path)
  if (file.size > MAX_PREVIEW_FILE_BYTES) {
    throw new Error(`网页文件过大（${formatBytes(file.size)}），预览上限 ${formatBytes(MAX_PREVIEW_FILE_BYTES)}`)
  }
  const source = await file.text()
  const segments = splitPath(path)
  const baseSegments = segments.slice(0, -1)
  const doc = new DOMParser().parseFromString(source, 'text/html')
  const used = new Set()
  const missing = new Set()
  const moduleIssues = []
  const inlineModules = []
  const moduleRoots = []
  const moduleWrappers = []
  const pageImportMaps = []
  const moduleEntries = []
  let totalBytes = 0

  async function readAsset(assetPath) {
    if (!assetPath) return null
    if (used.has(assetPath)) {
      return getFileBlob(assetPath).catch(() => null)
    }
    let blob
    try {
      blob = await getFileBlob(assetPath)
    } catch {
      missing.add(assetPath)
      return null
    }
    if (blob.size > MAX_PREVIEW_ASSET_BYTES || totalBytes + blob.size > MAX_PREVIEW_TOTAL_BYTES) {
      missing.add(assetPath)
      return null
    }
    totalBytes += blob.size
    used.add(assetPath)
    return blob
  }

  async function inlineUrl(url, cssBase) {
    const assetPath = resolveAssetPath(cssBase, url)
    if (!assetPath) return null
    const blob = await readAsset(assetPath)
    return blob ? blobToDataUrl(blob, mimeFromPath(assetPath)) : null
  }

  async function rewriteCssText(cssText, cssBase) {
    const urls = new Set()
    for (const match of String(cssText || '').matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi)) {
      urls.add(match[2].trim())
    }
    if (!urls.size) return String(cssText || '')
    const mapped = new Map()
    for (const url of urls) mapped.set(url, await inlineUrl(url, cssBase))
    return rewriteCssUrls(cssText, url => mapped.get(url) || null)
  }

  /** 读工作区里的文本资源；读不到返回 null（缺失已经记进 missing） */
  async function workspaceText(href) {
    const target = resolveAssetPath(baseSegments, href)
    if (!target) return null
    const blob = await readAsset(target)
    return blob ? await blob.text() : null
  }

  for (const link of [...doc.querySelectorAll('link[rel~="stylesheet"][href]')]) {
    const href = link.getAttribute('href')
    const assetPath = resolveAssetPath(baseSegments, href)
    if (!assetPath) continue
    const blob = await readAsset(assetPath)
    if (!blob) { link.remove(); continue }
    const cssBase = assetPath.split('/').slice(0, -1)
    const style = doc.createElement('style')
    style.textContent = `/* ${assetPath} */\n${await rewriteCssText(await blob.text(), cssBase)}`
    link.replaceWith(style)
  }

  for (const style of [...doc.querySelectorAll('style')]) {
    style.textContent = await rewriteCssText(style.textContent, baseSegments)
  }

  for (const el of [...doc.querySelectorAll('[style]')]) {
    const inline = el.getAttribute('style') || ''
    if (!/url\(/i.test(inline)) continue
    el.setAttribute('style', await rewriteCssText(inline, baseSegments))
  }

  // 一次遍历覆盖 importmap / module / 经典脚本：module 脚本的执行顺序就是文档顺序，不能分两趟处理
  let inlineSeq = 0
  for (const script of [...doc.querySelectorAll('script')]) {
    const type = String(script.getAttribute('type') || '').trim().toLowerCase()
    const src = script.getAttribute('src')

    if (type === 'importmap') {
      // 浏览器只认一张 importmap，注入的那张已经生效：原件改成未知 type 留档，导出时再改回去
      script.setAttribute('type', PREVIEW_INERT_MAP_TYPE)
      if (src && isExternalUrl(src)) {
        // 外链的那张取不到内容，合并不了；不说清就等于静默丢掉作者写的映射
        moduleIssues.push({ level: 'warn', text: `外链 importmap（${src}）在预览里无法合并，已忽略` })
        continue
      }
      const text = src ? await workspaceText(src) : script.textContent
      const parsed = text === null ? null : parseImportMap(text)
      if (parsed) pageImportMaps.push(parsed)
      else if (text !== null) moduleIssues.push({ level: 'warn', text: '页面自带的 importmap 不是合法 JSON，已忽略' })
      continue
    }

    if (type === 'module') {
      if (src && isExternalUrl(src)) continue
      let target
      if (src) {
        target = resolveAssetPath(baseSegments, src) || ''
        if (!target) continue
        moduleRoots.push(target)
      } else {
        const lang = script.getAttribute('lang')
        // 没有 import 也不需要转译的内联模块原样执行：少绕一圈，导出的独立 HTML 里它也还能跑
        if (!script.textContent.trim() || !moduleNeedsGraph(script.textContent, lang)) continue
        inlineSeq += 1
        target = virtualInlinePath(path, inlineSeq, lang)
        inlineModules.push({ path: target, text: script.textContent })
      }
      const wrapper = doc.createElement('script')
      wrapper.setAttribute('type', 'module')
      wrapper.setAttribute(PREVIEW_MODULE_ATTR, target)
      // 用 import 语句而不是 src：importmap 对 import 的解析是所有浏览器都实现的部分
      wrapper.textContent = `import ${moduleLiteral(target)}`
      // 原脚本改成未知 type 就地留档：预览时不执行也不请求，导出时改回 module 就是作者那份文档
      script.setAttribute('type', PREVIEW_INERT_TYPE)
      script.after(wrapper)
      moduleWrappers.push({ path: target, el: wrapper, origin: script })
      continue
    }

    if (!src) continue
    const assetPath = resolveAssetPath(baseSegments, src)
    if (!assetPath) continue
    const blob = await readAsset(assetPath)
    if (!blob) { script.remove(); continue }
    let text = await blob.text()
    // 经典脚本里的 TS 只是类型标注，过一遍转译就能跑；有 import/export 的话浏览器会自己报错
    if (compileKind(assetPath) === 'ts') {
      try {
        text = (await compileModule(assetPath, text)).text
      } catch (err) {
        moduleIssues.push({ level: 'error', text: `${assetPath} 转译失败：${String(err?.message || err).split('\n')[0]}` })
        script.remove()
        continue
      }
    }
    script.removeAttribute('src')
    script.removeAttribute('integrity')
    script.textContent = text
  }

  for (const el of [...doc.querySelectorAll('img[src], audio[src], video[src], source[src], video[poster]')]) {
    for (const attr of ['src', 'poster']) {
      if (!el.hasAttribute(attr)) continue
      const value = el.getAttribute(attr)
      const assetPath = resolveAssetPath(baseSegments, value)
      if (!assetPath) continue
      const blob = await readAsset(assetPath)
      if (!blob) { el.removeAttribute(attr); continue }
      el.setAttribute(attr, await blobToDataUrl(blob, mimeFromPath(assetPath)))
    }
  }

  for (const el of [...doc.querySelectorAll('[srcset]')]) {
    const raw = el.getAttribute('srcset') || ''
    const mapped = new Map()
    for (const item of raw.split(',')) {
      const url = item.trim().split(/\s+/)[0]
      if (!url || mapped.has(url)) continue
      const assetPath = resolveAssetPath(baseSegments, url)
      if (!assetPath) continue
      const blob = await readAsset(assetPath)
      mapped.set(url, blob ? await blobToDataUrl(blob, mimeFromPath(assetPath)) : null)
    }
    el.setAttribute('srcset', rewriteSrcset(raw, url => mapped.get(url) || null))
  }

  // 页面自带的 importmap：相对地址在 srcdoc 里解析不到工作区文件，改成 canonical 路径并进图，
  // 作者写的映射才和它在自己服务器上等价（以 / 结尾的前缀映射保持原样，不猜目录里有什么）
  const pageImports = pageImportMaps.length ? mergeImportMaps(pageImportMaps) : null
  for (const [key, value] of Object.entries(pageImports?.imports || {})) {
    if (isExternalUrl(value) || value.endsWith('/')) continue
    const target = resolveAssetPath(baseSegments, value)
    if (!target) {
      delete pageImports.imports[key]
      moduleIssues.push({ level: 'warn', text: `页面 importmap 的 ${key} 指向 ${value}，越出工作区根目录，已忽略` })
      continue
    }
    pageImports.imports[key] = target
    if (!moduleRoots.includes(target)) moduleRoots.push(target)
  }

  // 资源内联完才知道还剩多少额度：模块图与图片共用同一个 8 MB 预算
  let graph = null
  if (inlineModules.length || moduleRoots.length) {
    // 动态 import：转译运行时（esbuild wasm / compiler-sfc）只在真的预览模块页面时才拉
    const { collectModules } = await import('../workspaceModules')
    graph = await collectModules({
      inline: inlineModules,
      deps: moduleRoots,
      allowBare: true,
      maxBytes: Math.max(MIN_MODULE_BYTES, MAX_PREVIEW_TOTAL_BYTES - totalBytes),
    })
    const kept = new Set(graph.modules.map(item => item.path))
    for (const wrapper of moduleWrappers) {
      if (kept.has(wrapper.path)) {
        moduleEntries.push(wrapper.path)
        continue
      }
      // 被额度挤掉或找不到的入口没有 importmap 条目：包装脚本撤掉、原脚本改回去自己跑，
      // 丢掉的模块由下面的 moduleIssues 逐条说明，绝不静默
      wrapper.el.remove()
      wrapper.origin.setAttribute('type', 'module')
    }
    for (const item of graph.missing) {
      moduleIssues.push({
        level: 'error',
        text: `${item.from ? `${item.from} 依赖的 ` : ''}${item.specifier}：${item.reason}`,
      })
    }
    for (const item of graph.notes) {
      for (const note of item.notes || []) moduleIssues.push({ level: 'warn', text: `${item.path}：${note}` })
    }
    if (graph.cycles.length) {
      moduleIssues.push({
        level: 'warn',
        text: `存在循环依赖（原生 ESM 能跑，但可能读到 undefined）：${graph.cycles.slice(0, 3).join('；')}`,
      })
    }
  }

  // 页面 importmap 已经接管的裸名不会走 CDN，报出去就成了假消息
  const cdnBare = graph ? graph.bare.filter(name => !pageImports?.imports?.[name]) : []

  // 必须排在页面任何脚本之前：shim 晚一步，页面启动时就已经抛过 SecurityError 了
  const runtime = doc.createElement('script')
  runtime.setAttribute(PREVIEW_RUNTIME_ATTR, 'true')
  runtime.textContent = await buildRuntimeScript(path, {
    modules: graph ? graph.modules.map(item => ({ path: item.path, text: item.text })) : [],
    bare: cdnBare,
    pageImports,
  })
  doc.head.insertBefore(runtime, doc.head.firstChild)

  const html = `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`
  return {
    html,
    bytes: file.size,
    missing: [...missing],
    moduleCount: graph ? graph.modules.length : 0,
    moduleEntries,
    moduleMaps: graph ? graph.maps : {},
    bare: cdnBare,
    moduleIssues,
  }
}
