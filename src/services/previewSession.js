import { ref } from 'vue'

/**
 * 预览窗口的跨组件会话。
 * 工具链跑在 stores/chat.js 的编排里，预览抽屉却是 WorkspacePanel 的一个 v-if 子组件，
 * 两边没有父子关系，所以和 chatDraft 一样用模块级单例接起来：
 * 工具在这里登记「我要看哪一页」，抽屉挂载时把自己登记成当前客户端。
 *
 * 只保存「当前是谁在服务」这一个事实，不缓存页面内容 —— 快照每次现取，
 * 缓存下来的那份在 AI 连续改文件时永远是过期的。
 */

/** 抽屉挂载后到页面首屏渲染完之间的一点余量：模块是异步加载的，ready 不等于画完了 */
const PREVIEW_SETTLE_MS = 350
const PREVIEW_POLL_MS = 120
const PREVIEW_READY_TIMEOUT = 25000

export const previewRequest = ref(null)

let client = null

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 请求打开某一页。带时间戳是为了同一路径连开两次也能触发订阅方的 watcher。
 * @param {string} path 工作区里的 .html
 * @param {string} [name] 标题栏显示的名字
 */
export function requestPreview(path, name = '') {
  const value = String(path || '').trim()
  if (!value) return false
  previewRequest.value = {
    path: value,
    name: String(name || '').trim() || value.split('/').pop(),
    at: Date.now(),
  }
  return true
}

export function registerPreviewClient(next) {
  client = next || null
}

/**
 * 注销自己那一份。换页时抽屉会重建，新旧实例的挂载与卸载顺序不保证，
 * 无条件置空有可能把刚登记上的新实例擦掉。
 */
export function unregisterPreviewClient(current) {
  if (current && client !== current) return
  client = null
}

export function previewClient() {
  return client
}

/**
 * 等到某一页真的跑起来。
 * 打开是异步的：面板展开 → 抽屉挂载 → 建模块图 → iframe 载入 → 引导脚本报就绪，
 * 中间任何一步都可能失败，所以返回的是带原因的失败而不是抛异常 —— 工具链要能把它回灌给模型。
 */
export async function waitPreviewReady(path, { signal, timeout = PREVIEW_READY_TIMEOUT } = {}) {
  const limit = Math.max(2000, Number(timeout) || PREVIEW_READY_TIMEOUT)
  const deadline = Date.now() + limit
  let sawClient = false
  while (Date.now() < deadline) {
    if (signal?.aborted) return { ok: false, message: '已取消' }
    const current = client
    if (current && current.getPath?.() === path) {
      sawClient = true
      if (current.isReady?.()) {
        await delay(PREVIEW_SETTLE_MS)
        if (signal?.aborted) return { ok: false, message: '已取消' }
        return { ok: true, client: current }
      }
    }
    await delay(PREVIEW_POLL_MS)
  }
  return {
    ok: false,
    message: sawClient
      ? `预览窗口已经打开 ${path}，但页面在 ${Math.round(limit / 1000)} 秒内没有就绪：先看一眼 console 里有没有报错`
      : `预览窗口没能打开 ${path}：工作区面板可能没有挂载，或这个文件不存在`,
  }
}

/**
 * 打开（或切到）指定页面并等它跑起来。
 * 已经开着同一页时强制重载：模型刚改完文件，它要验收的是新写进去的那一份，不是屏幕上的旧状态。
 */
export async function openPreviewFor(path, { signal, timeout = PREVIEW_READY_TIMEOUT } = {}) {
  const current = client
  if (current && current.getPath?.() === path) await current.reload?.()
  else requestPreview(path)
  return waitPreviewReady(path, { signal, timeout })
}

/**
 * 等已经登记的那个抽屉里的页面重新就绪。
 * 返回上一页、重载都会换掉当前路径，所以这里不校验路径，只看这一个客户端。
 */
export async function waitClientReady(current, { signal, timeout = PREVIEW_READY_TIMEOUT } = {}) {
  const limit = Math.max(2000, Number(timeout) || PREVIEW_READY_TIMEOUT)
  const deadline = Date.now() + limit
  while (Date.now() < deadline) {
    if (signal?.aborted) return { ok: false, message: '已取消' }
    if (client !== current) return { ok: false, message: '预览窗口已经关掉或换了页面' }
    if (current.isReady?.()) {
      await delay(PREVIEW_SETTLE_MS)
      if (signal?.aborted) return { ok: false, message: '已取消' }
      return { ok: true, client: current }
    }
    await delay(PREVIEW_POLL_MS)
  }
  return { ok: false, message: `页面在 ${Math.round(limit / 1000)} 秒内没有重新就绪：先看一眼 console 里有没有报错` }
}
