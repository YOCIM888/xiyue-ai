/**
 * 预览运行时宿主侧：拼装注入脚本 + postMessage 桥。
 * 刻意不 import workspace.js —— workspace 要 import 本模块来注入脚本，反向依赖会成环；
 * 读文件的能力由调用方注入（组件本来就 import 了 getFileBlob）。
 */
import { mimeFromPath, resolveAssetPath } from '../utils/htmlInline'
import {
  PREVIEW_COMMAND, PREVIEW_COMMAND_REPLY, PREVIEW_MESSAGE, PREVIEW_REPLY,
  normalizePreviewEntry, readyEntry, runtimeConfigFor,
} from './previewPaths'

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
/** 自测指令的等待上限：页面里可能有个死循环，不能把工具调用一直挂着 */
const COMMAND_TIMEOUT = 12000
/** 快照回灌给模型的字数上限：再长也帮不到判断，只会把上下文挤掉 */
const AUTOMATE_TEXT_CHARS = 12000

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
 * 四份 ?raw 源码走动态 import：它们含大量中文注释，静态引入会把几十 KB 塞进首屏包，
 * 而预览是低频功能。拼接顺序是死的：自测层要用 previewPaths 的消息常量，
 * 引导脚本要在自己的内层 IIFE 里调用自测层的 installAutomation。
 *
 * @param {string} path 预览文档在工作区里的路径
 * @param {object} [bundle] 模块图：modules 是 [{path,text}]，bare 是裸模块名，pageImports 是页面自带映射
 */
export async function buildRuntimeScript(path, { modules = [], bare = [], pageImports = null } = {}) {
  const [boot, paths, loader, automate] = await Promise.all([
    import('./previewBoot.js?raw'),
    import('./previewPaths.js?raw'),
    import('./previewModules.js?raw'),
    import('./previewAutomate.js?raw'),
  ])
  const config = { ...runtimeConfigFor(path) }
  if (modules.length) config.modules = modules
  if (bare.length) config.bare = bare
  if (pageImports) config.pageImports = pageImports
  const body = [
    `const __XIYUE_PREVIEW__ = ${JSON.stringify(config)};`,
    toClassicScript(paths.default),
    toClassicScript(automate.default),
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
 * 预览页里点开的地址 → 工作区路径。
 * 只有 .html 能重建预览：预览里没有服务器，别的文件点开也只是下载或白屏。
 * 越出根目录的 .. 与外链由 resolveAssetPath 挡掉，返回 null 让调用方说明原因。
 */
export function resolveNavPath(baseSegments, href) {
  const target = resolveAssetPath(baseSegments, href)
  return target && /\.html?$/i.test(target) ? target : null
}

const FIX_MAX_ITEMS = 8
const FIX_MAX_FILES = 6

/** 条目里的 source 是 path:行:列，取回路径部分 */
function sourcePath(source) {
  return String(source || '').replace(/(?::\d+){1,2}$/, '').trim()
}

/**
 * 「发给 AI 修」的草稿：控制台里的错误加上已定位到的源文件路径，组织成一段中文描述。
 * 只输出人能读的文字 —— 往对话里倒原始 JSON 是明确禁止的。
 */
export function buildFixRequest({ path = '', entries = [] } = {}) {
  const all = Array.isArray(entries) ? entries : []
  const errors = all.filter(item => item?.level === 'error')
  // 没有错误时退回警告：抽屉上的按钮只在有错误时出现，但调用方可能先清空过控制台
  const picked = errors.length ? errors : all.filter(item => item?.level === 'warn')
  if (!picked.length) return ''
  const lines = picked.slice(0, FIX_MAX_ITEMS).map((item, index) => {
    const at = item.source ? `${item.source} —— ` : ''
    return `${index + 1}. ${at}${String(item.text || '').replace(/\s+/g, ' ').trim()}`
  })
  const files = [...new Set(picked.map(item => sourcePath(item.source)).filter(Boolean))].slice(0, FIX_MAX_FILES)
  const more = picked.length > lines.length ? `\n（另有 ${picked.length - lines.length} 条没有列出）` : ''
  const tail = files.length ? `\n\n涉及文件：${files.join('、')}` : ''
  return [
    path ? `预览工作区里的 ${path} 时控制台报错，请先读相关文件再修复：` : '预览网页时控制台报错，请先读相关文件再修复：',
    '',
    `${lines.join('\n')}${more}${tail}`,
    '',
    '（以上来自工作区预览控制台，行号已按 sourcemap 换回源文件）',
  ].join('\n')
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
 * @param {(nav: {href: string, path: string|null}) => void} [options.onNavigate] 页内跳转请求
 * @param {() => void} [options.onTouched] 用户已在页面里操作过
 * @param {() => void} [options.onReady] 引导脚本跑起来了，页面可以开始接受自测指令
 */
export function createPreviewBridge({ getFrame, getBase, readFile, onEntry, onNavigate, onTouched, onReady }) {
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
      onReady?.()
      onEntry?.(readyEntry(data))
      return
    }
    if (data.kind === 'touched') {
      onTouched?.()
      return
    }
    if (data.kind === 'navigate') {
      const href = String(data.href || '')
      onNavigate?.({ href, path: resolveNavPath(getBase?.() || [], href) })
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

function clip(text, max) {
  const value = String(text ?? '').replace(/\s+/g, ' ').trim()
  return value.length > max ? `${value.slice(0, max)}…` : value
}

/**
 * 白名单式收敛 iframe 的应答。
 * 预览页里跑的是 AI 生成的代码，它自己也能 postMessage 伪造一条应答，
 * 所以结构一律不透传：只挑认识的字段，逐个裁长度，快照文本单独限字数。
 */
export function normalizeAutomateResult(data) {
  const out = { ok: data?.ok === true, action: String(data?.action || '') }
  if (data?.message) out.message = clip(data.message, 400)
  if (data?.target) out.target = clip(data.target, 200)
  if (data?.scope) out.scope = clip(data.scope, 200)
  if (data?.title) out.title = clip(data.title, 160)
  if (data?.viewport) out.viewport = clip(data.viewport, 24)
  if (data?.ready === true) out.ready = true
  if (Number.isFinite(Number(data?.scrollY))) out.scrollY = Math.max(0, Math.round(Number(data.scrollY)))
  if (Number.isFinite(Number(data?.refCount))) out.refCount = Math.max(0, Math.min(9999, Math.round(Number(data.refCount))))
  if (data?.truncated === true) out.truncated = true
  if (typeof data?.text === 'string') out.text = data.text.slice(0, AUTOMATE_TEXT_CHARS)
  return out
}

/**
 * 宿主 → 预览 iframe 的自测指令通道，一问一答。
 * 和 createPreviewBridge 分开：那条是 iframe 主动上报（日志、fetch、跳转），没有配对需求；
 * 这条要按 id 把应答认领回来，混在一起会互相吃掉消息。
 *
 * @param {object} options
 * @param {() => HTMLIFrameElement|null} options.getFrame 当前 iframe（v-if 会重建，所以每次取）
 * @param {number} [options.timeout] 单次指令的等待毫秒数
 */
export function createCommandChannel({ getFrame, timeout = COMMAND_TIMEOUT } = {}) {
  const pending = new Map()
  const limit = Math.max(1000, Number(timeout) || COMMAND_TIMEOUT)
  let seq = 0

  function handle(event) {
    const frame = getFrame?.()
    if (!frame || event.source !== frame.contentWindow) return
    const data = event.data
    if (!data || data.type !== PREVIEW_COMMAND_REPLY || typeof data.id !== 'number') return
    const item = pending.get(data.id)
    if (!item) return
    pending.delete(data.id)
    clearTimeout(item.timer)
    item.resolve(normalizeAutomateResult(data))
  }

  window.addEventListener('message', handle)

  return {
    /**
     * @param {string} action ping / read / click / type / press / scroll
     * @param {object} [args] ref / selector / text / key / direction 等
     * @returns {Promise<object>} 永远 resolve：失败也是一种结果，工具链不该被一次超时打断
     */
    send(action, args = {}) {
      const name = String(action || '')
      return new Promise((resolve) => {
        const frame = getFrame?.()
        if (!frame?.contentWindow) {
          resolve({ ok: false, action: name, message: '预览窗口没打开，或页面还没挂上' })
          return
        }
        const id = (seq += 1)
        const timer = setTimeout(() => {
          pending.delete(id)
          resolve({ ok: false, action: name, message: `预览页在 ${Math.round(limit / 1000)} 秒内没有应答 ${name}：页面可能卡住或还在加载` })
        }, limit)
        pending.set(id, { resolve, timer })
        try {
          frame.contentWindow.postMessage({ type: PREVIEW_COMMAND, id, action: name, ...args }, '*')
        } catch (err) {
          pending.delete(id)
          clearTimeout(timer)
          resolve({ ok: false, action: name, message: `指令发不进预览页：${err?.message || err}` })
        }
      })
    },
    destroy() {
      window.removeEventListener('message', handle)
      for (const item of pending.values()) {
        clearTimeout(item.timer)
        item.resolve({ ok: false, message: '预览窗口已关闭，自测中断' })
      }
      pending.clear()
    },
  }
}
