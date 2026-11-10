/**
 * 预览运行时宿主侧：拼装注入脚本 + postMessage 桥。
 * 刻意不 import workspace.js —— workspace 要 import 本模块来注入脚本，反向依赖会成环；
 * 读文件的能力由调用方注入（组件本来就 import 了 getFileBlob）。
 */
import { mimeFromPath, resolveAssetPath } from '../utils/htmlInline'
import { PREVIEW_MESSAGE, PREVIEW_REPLY, normalizePreviewEntry, readyEntry, runtimeConfigFor } from './previewPaths'

export const PREVIEW_RUNTIME_ATTR = 'data-xiyue-runtime'
/** 宿改写出来的模块包装脚本：<script type="module" data-xiyue-module="canonical 路径">import "…"</script> */
export const PREVIEW_MODULE_ATTR = 'data-xiyue-module'
/**
 * 被接管的 module 脚本就地改成这个 type：浏览器不执行也不请求，文档里仍留着原始 src / 源码，
 * 导出时把 type 改回 module 就还原成作者写的那份文档。
 */
export const PREVIEW_INERT_TYPE = 'xiyue/module-source'
/** 同理：页面自带的 importmap 已被合并进注入的那张，原件留档等导出时还原 */
export const PREVIEW_INERT_MAP_TYPE = 'xiyue/importmap-source'

const MAX_REPLY_BYTES = 2 * 1024 * 1024

/** 去掉 export 关键字后，纯逻辑层就成了经典脚本里的全局函数（tests/previewRuntime.test.js 守住前提） */
function toClassicScript(source) {
  return String(source).replace(/^export\s+/gm, '')
}

/**
 * 注入到预览 HTML 最前面的内联脚本内容。
 * 整体包在一个 IIFE 里：注入的是页面自己的文档，纯逻辑层那些顶层 const / function
 * 会进入全局词法作用域，页面若声明了同名变量（MAX_DEPTH、truncate 这类很常见）
 * 就是 SyntaxError，等于把页面整个打死。
 * script 结束标签序列必须转义：HTML 序列化器不会替 script 文本做转义，字面量会提前截断文档。
 *
 * 三份 ?raw 源码走动态 import：它们含大量中文注释，静态引入会把几十 KB 塞进首屏包，
 * 而预览是低频功能。
 *
 * @param {string} path 预览文档在工作区里的路径
 * @param {object} [bundle] 模块图：modules 是 [{path,text}]，bare 是裸模块名，pageImports 是页面自带映射
 */
export async function buildRuntimeScript(path, { modules = [], bare = [], pageImports = null } = {}) {
  const [boot, paths, loader] = await Promise.all([
    import('./previewBoot.js?raw'),
    import('./previewPaths.js?raw'),
    import('./previewModules.js?raw'),
  ])
  const config = { ...runtimeConfigFor(path) }
  if (modules.length) config.modules = modules
  if (bare.length) config.bare = bare
  if (pageImports) config.pageImports = pageImports
  const body = [
    `const __XIYUE_PREVIEW__ = ${JSON.stringify(config)};`,
    toClassicScript(paths.default),
    loader.default,
    boot.default,
  ].join('\n')
  return `(function () {\n${body}\n})()`.replace(/<\/script/gi, '<\\/script')
}

/** 导出的独立 HTML 不该带着桥脚本：没有宿主时它只会让相对 fetch 白等 10 秒 */
export function stripPreviewRuntime(html) {
  const doc = new DOMParser().parseFromString(String(html || ''), 'text/html')
  for (const el of doc.querySelectorAll(`script[${PREVIEW_RUNTIME_ATTR}]`)) el.remove()
  // 包装脚本要靠注入的 importmap 才解析得到，留着只会在导出文件里报「无法解析模块名」
  for (const el of doc.querySelectorAll(`script[${PREVIEW_MODULE_ATTR}]`)) el.remove()
  // 被接管的原始 module 脚本与 importmap 改回去：导出的文档要能独立打开，作者的内容不能凭空消失
  for (const el of doc.querySelectorAll(`script[type="${PREVIEW_INERT_TYPE}"]`)) el.setAttribute('type', 'module')
  for (const el of doc.querySelectorAll(`script[type="${PREVIEW_INERT_MAP_TYPE}"]`)) el.setAttribute('type', 'importmap')
  return `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`
}

/**
 * 建一座宿主 ↔ 预览 iframe 的桥：应答工作区内的相对 fetch，把日志与错误转成控制台条目。
 * 只接受 event.source 恰好是当前 iframe 的消息；iframe 拿到的读权限与工作区根目录同级，
 * 和内联资源时的边界一致（越出根目录的 .. 由 resolveAssetPath 拒绝）。
 *
 * @param {object} options
 * @param {() => HTMLIFrameElement|null} options.getFrame 当前 iframe（v-if 会重建，所以每次取）
 * @param {() => string[]} options.getBase 预览文档所在目录，用于解析相对地址
 * @param {(path: string) => Promise<Blob>} options.readFile
 * @param {(entry: {level: string, text: string, source: string}) => void} options.onEntry
 */
export function createPreviewBridge({ getFrame, getBase, readFile, onEntry }) {
  function post(frame, payload) {
    try {
      frame.contentWindow?.postMessage(payload, '*')
    } catch {
      // iframe 刚好被卸载，应答丢掉即可
    }
  }

  async function answerFetch(frame, data) {
    const reply = { type: PREVIEW_REPLY, id: data.id }
    const url = String(data.url || '')
    const target = resolveAssetPath(getBase?.() || [], url)
    if (!target) {
      Object.assign(reply, { ok: false, status: 404, message: `预览环境读不到该地址：${url}` })
    } else {
      try {
        const blob = await readFile(target)
        if (blob.size > MAX_REPLY_BYTES) {
          Object.assign(reply, {
            ok: false,
            status: 413,
            message: `${target} 有 ${(blob.size / 1024 / 1024).toFixed(1)} MB，预览单次最多读取 ${MAX_REPLY_BYTES / 1024 / 1024} MB`,
          })
        } else {
          Object.assign(reply, {
            ok: true,
            status: 200,
            mime: mimeFromPath(target),
            buffer: await blob.arrayBuffer(),
          })
        }
      } catch (err) {
        Object.assign(reply, { ok: false, status: 404, message: err?.message || `读取 ${target} 失败` })
      }
    }
    post(frame, reply)
  }

  function handle(event) {
    const frame = getFrame?.()
    if (!frame || event.source !== frame.contentWindow) return
    const data = event.data
    if (!data || data.type !== PREVIEW_MESSAGE) return
    if (data.kind === 'fetch') {
      if (typeof data.id !== 'number') return
      answerFetch(frame, data).catch(() => { /* 读文件失败已在内部转成应答 */ })
      return
    }
    if (data.kind === 'ready') {
      onEntry?.(readyEntry(data))
      return
    }
    const entry = normalizePreviewEntry(data)
    if (entry) onEntry?.(entry)
  }

  window.addEventListener('message', handle)
  return {
    destroy() { window.removeEventListener('message', handle) },
  }
}
