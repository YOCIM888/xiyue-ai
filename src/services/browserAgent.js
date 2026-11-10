/**
 * 浏览器控制桥接：通过 externally_connectable 与「XIYUE 浏览器控制」扩展通信。
 * 扩展负责真实打开标签页、注入固定动作、截图；这里只做参数校验、超时与截图压缩。
 */
import { compressImageDataUrl } from '../utils/image'

export const DEFAULT_BROWSER_EXTENSION_ID = 'glnmhdipbamjgimhnbmknockgdpmodkm'

const ACTION_TIMEOUT = {
  ping: 2500,
  open: 40000,
  read: 20000,
  click: 28000,
  type: 28000,
  press: 28000,
  scroll: 22000,
  back: 22000,
  forward: 22000,
  screenshot: 15000,
  close: 10000,
}

const SCREENSHOT_OPTIONS = {
  maxWidth: 1440,
  maxHeight: 4000,
  quality: 0.72,
  maxBytes: 900000,
}

const VALID_ACTIONS = new Set(Object.keys(ACTION_TIMEOUT).filter(action => action !== 'ping'))

const ACTION_STATUS = {
  open: '正在打开网页…',
  read: '正在读取页面…',
  click: '正在点击页面元素…',
  type: '正在填写页面…',
  press: '正在发送按键…',
  scroll: '正在滚动页面…',
  screenshot: '正在截取页面…',
  back: '正在后退…',
  forward: '正在前进…',
  close: '正在关闭标签页…',
}

export function browserBridgeAvailable() {
  return typeof window !== 'undefined' && !!window.chrome?.runtime?.sendMessage
}

function getExtensionId(settings) {
  return String(settings?.browserExtensionId || DEFAULT_BROWSER_EXTENSION_ID).trim()
}

function parseDomains(value) {
  return String(value || '')
    .split(/[\s,，、;；]+/)
    .map(item => item.trim().toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '')
      .replace(/^\*\./, ''))
    .filter(Boolean)
}

function formatBridgeError(message) {
  const text = String(message || '')
  if (/receiving end does not exist|could not establish connection|message port closed/i.test(text)) {
    return '未检测到浏览器扩展，请先安装并启用「XIYUE 浏览器控制」扩展'
  }
  return text || '扩展通信失败'
}

function sendToExtension(extensionId, payload, timeout) {
  return new Promise((resolve, reject) => {
    if (!browserBridgeAvailable()) {
      reject(new Error('当前浏览器不支持扩展通信，请使用 Chrome 或 Edge'))
      return
    }
    let settled = false
    const finish = (fn, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fn(value)
    }
    const timer = setTimeout(() => {
      finish(reject, new Error('扩展响应超时，请确认扩展已启用并刷新页面'))
    }, timeout)

    try {
      window.chrome.runtime.sendMessage(extensionId, payload, response => {
        const lastError = window.chrome.runtime.lastError
        if (lastError) {
          finish(reject, new Error(formatBridgeError(lastError.message)))
          return
        }
        if (!response) {
          finish(reject, new Error('扩展没有返回结果，请刷新页面后重试'))
          return
        }
        finish(resolve, response)
      })
    } catch (err) {
      finish(reject, new Error(formatBridgeError(err?.message || String(err))))
    }
  })
}

export async function pingBrowserExtension(settings) {
  try {
    const response = await sendToExtension(
      getExtensionId(settings),
      { type: 'XIYUE_BROWSER', action: 'ping', args: {} },
      ACTION_TIMEOUT.ping
    )
    if (!response?.ok) {
      return { ok: false, message: response?.message || '扩展未响应' }
    }
    return { ok: true, message: response.message || 'pong', version: response.version || '' }
  } catch (err) {
    return { ok: false, message: err?.message || String(err) }
  }
}

/**
 * 执行一次浏览器动作。
 * 返回 { ok, message, url, title, text, elements, screenshot }
 */
export async function runBrowserAction(args, settings, { signal, onStatus } = {}) {
  const action = String(args?.action || '').toLowerCase()
  if (!VALID_ACTIONS.has(action)) {
    return { ok: false, message: `不支持的操作：${action || '空'}` }
  }
  if (signal?.aborted) return { ok: false, message: '浏览器操作已中止' }

  onStatus?.(ACTION_STATUS[action] || '正在操作浏览器…')

  const payload = {
    type: 'XIYUE_BROWSER',
    action,
    args: {
      ...args,
      allowedDomains: parseDomains(settings?.browserAllowedDomains),
    },
  }

  let response
  try {
    response = await sendToExtension(
      getExtensionId(settings),
      payload,
      ACTION_TIMEOUT[action] || 20000
    )
  } catch (err) {
    return { ok: false, message: err?.message || String(err) }
  }

  if (signal?.aborted) return { ok: false, message: '浏览器操作已中止' }
  if (!response.ok) {
    return { ok: false, message: response.message || '浏览器操作失败' }
  }

  let screenshot = String(response.screenshot || '')
  if (screenshot) {
    const compressed = await compressImageDataUrl(screenshot, SCREENSHOT_OPTIONS)
    if (compressed) screenshot = compressed
  }

  return {
    ok: true,
    message: response.message || '操作完成',
    url: response.url || '',
    title: response.title || '',
    text: response.text || '',
    elements: Array.isArray(response.elements) ? response.elements : [],
    elementTotal: Number(response.elementTotal) || 0,
    screenshot,
  }
}
