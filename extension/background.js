/**
 * XIYUE 浏览器控制扩展 — MV3 service worker
 * 网页通过 externally_connectable 发送 { type:'XIYUE_BROWSER', action, args }，
 * 这里用 tabs / scripting 执行固定动作，不提供任意脚本执行入口。
 */

const STATE_KEY = 'xiyueTargetTabId'
const ALLOWED_APP_HOSTS = ['yocim.top']

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

function isAllowedAppOrigin(origin) {
  if (!origin) return false
  try {
    const url = new URL(origin)
    const host = url.hostname.toLowerCase()
    if (url.protocol === 'https:') {
      return ALLOWED_APP_HOSTS.some(base => host === base || host.endsWith(`.${base}`))
    }
    // match pattern 无法限定端口，这里放行本机任意端口（仅限 localhost / 127.0.0.1）
    if (url.protocol === 'http:') {
      return host === 'localhost' || host === '127.0.0.1'
    }
  } catch {
    /* ignore */
  }
  return false
}

function assertPageUrl(url) {
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('链接格式无效')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('只支持 http/https 链接')
  }
  return parsed.toString()
}

function isRestrictedTabUrl(url) {
  return /^(chrome|edge|about|devtools|chrome-extension|moz-extension|file):/i.test(String(url || ''))
}

function normalizeDomains(list) {
  if (!Array.isArray(list)) return []
  return [...new Set(
    list
      .map(item => String(item || '').trim().toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/\/.*$/, '')
        .replace(/^\*\./, ''))
      .filter(Boolean)
  )]
}

function assertAllowedDomain(url, domains) {
  const allowed = normalizeDomains(domains)
  if (!allowed.length) return
  const host = new URL(url).hostname.toLowerCase()
  const hit = allowed.some(domain => host === domain || host.endsWith(`.${domain}`))
  if (!hit) throw new Error(`当前网站 ${host} 不在允许列表内`)
}

async function getTargetTabId() {
  const data = await chrome.storage.session.get(STATE_KEY)
  return typeof data[STATE_KEY] === 'number' ? data[STATE_KEY] : null
}

async function setTargetTabId(tabId) {
  await chrome.storage.session.set({ [STATE_KEY]: tabId })
}

async function clearTargetTabId() {
  await chrome.storage.session.remove(STATE_KEY)
}

async function requireTargetTab() {
  const tabId = await getTargetTabId()
  if (tabId == null) throw new Error('尚未打开目标网页，请先使用 open')
  let tab
  try {
    tab = await chrome.tabs.get(tabId)
  } catch {
    await clearTargetTabId()
    throw new Error('目标标签页已关闭，请重新 open')
  }
  if (isRestrictedTabUrl(tab.url)) throw new Error('浏览器内部页面不支持操作')
  return tab
}

function waitForTabComplete(tabId, timeout = 20000) {
  return new Promise(resolve => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      chrome.tabs.onUpdated.removeListener(onUpdated)
      resolve()
    }
    const onUpdated = (id, info) => {
      if (id === tabId && info.status === 'complete') finish()
    }
    const timer = setTimeout(finish, timeout)
    chrome.tabs.onUpdated.addListener(onUpdated)
    chrome.tabs.get(tabId)
      .then(tab => { if (tab?.status === 'complete') finish() })
      .catch(finish)
  })
}

async function runOnPage(tabId, func, args) {
  const [entry] = await chrome.scripting.executeScript({ target: { tabId }, func, args })
  return entry?.result
}

/* ---------- 注入到目标页面的函数（不能引用外层变量） ---------- */

function collectPageSnapshot(options) {
  const opts = options || {}
  const maxChars = Math.max(1000, Math.min(Number(opts.maxChars) || 8000, 20000))
  const withElements = opts.withElements !== false
  const clean = value => String(value || '').replace(/\s+/g, ' ').trim()
  const isVisible = el => {
    if (!el) return false
    const style = window.getComputedStyle(el)
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false
    const rect = el.getBoundingClientRect()
    return rect.width > 1 && rect.height > 1
  }

  const text = clean(document.body?.innerText || '').slice(0, maxChars)
  const result = {
    url: location.href,
    title: document.title || '',
    text,
    elements: [],
    elementTotal: 0,
  }
  if (!withElements) return result

  const selector = [
    'a[href]',
    'button',
    'input:not([type="hidden"])',
    'textarea',
    'select',
    '[role="button"]',
    '[contenteditable="true"]',
    'summary',
  ].join(',')

  const nodes = [...document.querySelectorAll(selector)].filter(isVisible)
  result.elementTotal = nodes.length
  result.elements = nodes.slice(0, 80).map((el, index) => {
    const ref = String(index + 1)
    el.setAttribute('data-xiyue-ref', ref)
    const tag = el.tagName.toLowerCase()
    const type = (el.getAttribute('type') || '').toLowerCase()
    let label = el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.innerText || ''
    if (!label && (type === 'submit' || type === 'button')) label = el.value || ''
    if (type === 'password') label = '[密码框]'
    let stableSelector = ''
    if (el.id) stableSelector = `#${CSS.escape(el.id)}`
    else if (el.getAttribute('name')) stableSelector = `${tag}[name="${el.getAttribute('name')}"]`
    return {
      ref: index + 1,
      tag,
      type: type || undefined,
      text: clean(label).slice(0, 80) || undefined,
      href: tag === 'a' ? el.href : undefined,
      selector: stableSelector || undefined,
      disabled: el.disabled ? true : undefined,
    }
  })
  return result
}

function clickOnPage(options) {
  const opts = options || {}
  const clean = value => String(value || '').replace(/\s+/g, ' ').trim()
  const isVisible = el => {
    const style = window.getComputedStyle(el)
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false
    const rect = el.getBoundingClientRect()
    return rect.width > 1 && rect.height > 1
  }
  const find = () => {
    if (opts.ref) return document.querySelector(`[data-xiyue-ref="${opts.ref}"]`)
    let selector = String(opts.selector || '').trim()
    let text = String(opts.text || '').trim()
    if (!text && selector.toLowerCase().startsWith('text=')) {
      text = selector.slice(5).trim()
      selector = ''
    }
    if (text) {
      const candidates = [...document.querySelectorAll('a,button,[role="button"],summary,input[type="submit"],input[type="button"]')]
        .filter(isVisible)
      const target = text.toLowerCase()
      return candidates.find(el => clean(el.innerText || el.value || el.getAttribute('aria-label')).toLowerCase() === target) ||
        candidates.find(el => clean(el.innerText || el.value || el.getAttribute('aria-label')).toLowerCase().includes(target))
    }
    if (selector) {
      try {
        return document.querySelector(selector)
      } catch {
        return null
      }
    }
    return null
  }

  const el = find()
  if (!el) return { ok: false, message: '未找到可点击的元素，请先 read 获取元素编号' }
  if (el.disabled) return { ok: false, message: '目标元素处于禁用状态' }
  el.scrollIntoView({ block: 'center', inline: 'center' })
  const label = clean(el.innerText || el.value || el.getAttribute('aria-label') || el.tagName).slice(0, 60)
  el.click()
  return { ok: true, message: `已点击「${label}」` }
}

function typeOnPage(options) {
  const opts = options || {}
  const text = String(opts.text ?? '')
  const clean = value => String(value || '').replace(/\s+/g, ' ').trim()
  const find = () => {
    if (opts.ref) return document.querySelector(`[data-xiyue-ref="${opts.ref}"]`)
    let selector = String(opts.selector || '').trim()
    if (selector.toLowerCase().startsWith('text=')) selector = selector.slice(5).trim()
    if (selector) {
      try {
        return document.querySelector(selector)
      } catch {
        return null
      }
    }
    return null
  }

  const el = find()
  if (!el) return { ok: false, message: '未找到输入框，请先 read 获取元素编号' }
  if (el.disabled || el.readOnly) return { ok: false, message: '目标输入框不可编辑' }

  el.scrollIntoView({ block: 'center' })
  el.focus()

  const type = (el.getAttribute('type') || '').toLowerCase()
  if (type === 'checkbox' || type === 'radio') {
    el.click()
    return { ok: true, message: '已切换勾选状态' }
  }

  if (el.isContentEditable) {
    el.textContent = text
    el.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }))
  } else if (el.tagName === 'SELECT') {
    el.value = text
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  } else {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
    if (setter) setter.call(el, text)
    else el.value = text
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }

  let message = `已在「${clean(el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.id || el.tagName)}」输入内容`
  if (opts.submit) {
    const form = el.closest('form')
    if (form && typeof form.requestSubmit === 'function') {
      form.requestSubmit()
      message += '，并提交了表单'
    } else {
      message += '，但未找到可提交的表单'
    }
  }
  return { ok: true, message }
}

function pressKeyOnPage(options) {
  const key = String(options?.key || 'Enter')
  const el = document.activeElement || document.body
  el.dispatchEvent(new KeyboardEvent('keydown', { key, code: key, bubbles: true, cancelable: true }))
  el.dispatchEvent(new KeyboardEvent('keyup', { key, code: key, bubbles: true, cancelable: true }))
  return { ok: true, message: `已按下 ${key}` }
}

function scrollOnPage(options) {
  const opts = options || {}
  const direction = String(opts.direction || opts.to || 'down').toLowerCase()
  const step = Math.max(100, Math.min(Number(opts.amount) || 600, 5000))

  if (opts.selector) {
    const el = document.querySelector(String(opts.selector))
    if (!el) return { ok: false, message: '未找到要滚动到的元素' }
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    return { ok: true, message: '已滚动到指定元素' }
  }

  const top = direction === 'top'
    ? 0
    : direction === 'bottom'
      ? Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)
      : window.scrollY + (direction === 'up' ? -step : step)
  window.scrollTo({ top, behavior: 'smooth' })
  const label = direction === 'top' ? '顶部' : direction === 'bottom' ? '底部' : direction === 'up' ? '上' : '下'
  return { ok: true, message: `已向${label}滚动` }
}

/* ---------- 标签页与截图 ---------- */

async function safeCapture(tab) {
  try {
    await chrome.tabs.update(tab.id, { active: true })
    if (tab.windowId != null) {
      await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {})
    }
    await sleep(200)
    return await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 72 })
  } catch {
    return null
  }
}

async function listTabIds() {
  const tabs = await chrome.tabs.query({})
  return new Set(tabs.map(tab => tab.id))
}

async function findNewHttpTab(knownIds, sourceTabId) {
  const tabs = await chrome.tabs.query({})
  const fresh = tabs.filter(tab => !knownIds.has(tab.id) && !isRestrictedTabUrl(tab.url))
  if (!fresh.length) return null
  const opened = fresh.find(tab => tab.openerTabId === sourceTabId) || fresh[fresh.length - 1]
  await setTargetTabId(opened.id)
  return opened
}

async function snapshot(tabId, options) {
  return runOnPage(tabId, collectPageSnapshot, [options])
}

async function settleAfterAction(tab, options = {}) {
  const message = options.message || '操作完成'
  await sleep(options.wait || 650)

  let current = await chrome.tabs.get(tab.id).catch(() => null)
  if (!current) {
    return { ok: true, message: `${message}；目标标签页已关闭` }
  }
  if (current.status === 'loading') {
    await waitForTabComplete(current.id, 15000)
  }
  await sleep(350)
  current = await chrome.tabs.get(current.id).catch(() => current)

  let page = null
  try {
    page = await snapshot(current.id, {
      maxChars: options.maxChars || 3000,
      withElements: !!options.withElements,
    })
  } catch {
    /* 某些页面注入受限，保留动作结果 */
  }
  const screenshot = options.screenshot === false ? null : await safeCapture(current)
  return {
    ok: true,
    message,
    url: page?.url || current.url,
    title: page?.title || current.title,
    text: page?.text || '',
    elements: page?.elements || [],
    screenshot,
  }
}

/* ---------- 动作 ---------- */

async function actionOpen(args) {
  const url = assertPageUrl(args.url)
  assertAllowedDomain(url, args.allowedDomains)

  let tab = null
  const existingId = await getTargetTabId()
  if (existingId != null) {
    try {
      tab = await chrome.tabs.update(existingId, { url, active: true })
    } catch {
      await clearTargetTabId()
      tab = null
    }
  }
  if (!tab) {
    tab = await chrome.tabs.create({ url, active: true })
    await setTargetTabId(tab.id)
  }

  await sleep(700)
  await waitForTabComplete(tab.id, 25000)
  await sleep(400)
  const current = await chrome.tabs.get(tab.id).catch(() => tab)

  let page
  try {
    page = await snapshot(current.id, { maxChars: Number(args.maxChars) || 8000, withElements: true })
  } catch (err) {
    throw new Error(`页面已打开，但无法读取内容：${err?.message || err}`, { cause: err })
  }
  const screenshot = await safeCapture(current)
  return {
    ok: true,
    message: `已打开 ${page?.url || url}`,
    url: page?.url || url,
    title: page?.title || '',
    text: page?.text || '',
    elements: page?.elements || [],
    elementTotal: page?.elementTotal || 0,
    screenshot,
  }
}

async function actionRead(args) {
  const tab = await requireTargetTab()
  assertAllowedDomain(tab.url, args.allowedDomains)
  const page = await snapshot(tab.id, {
    maxChars: Number(args.maxChars) || 8000,
    withElements: args.elements !== false,
  })
  const screenshot = args.screenshot === true ? await safeCapture(tab) : null
  return {
    ok: true,
    message: '已读取当前页面',
    url: page.url,
    title: page.title,
    text: page.text,
    elements: page.elements,
    elementTotal: page.elementTotal,
    screenshot,
  }
}

async function actionClick(args) {
  const tab = await requireTargetTab()
  assertAllowedDomain(tab.url, args.allowedDomains)
  const knownIds = await listTabIds()
  const result = await runOnPage(tab.id, clickOnPage, [args])
  if (!result?.ok) throw new Error(result?.message || '点击失败')

  await sleep(600)
  const opened = await findNewHttpTab(knownIds, tab.id)
  if (opened) {
    await waitForTabComplete(opened.id, 15000)
    return settleAfterAction(opened, { message: result.message, maxChars: 3000 })
  }
  const current = await chrome.tabs.get(tab.id).catch(() => null)
  if (!current) {
    return { ok: true, message: `${result.message}；目标标签页已关闭` }
  }
  return settleAfterAction(current, { message: result.message, maxChars: 3000 })
}

async function actionType(args) {
  const tab = await requireTargetTab()
  assertAllowedDomain(tab.url, args.allowedDomains)
  const knownIds = await listTabIds()
  const result = await runOnPage(tab.id, typeOnPage, [args])
  if (!result?.ok) throw new Error(result?.message || '输入失败')

  const opened = await findNewHttpTab(knownIds, tab.id)
  if (opened) {
    await waitForTabComplete(opened.id, 15000)
    return settleAfterAction(opened, { message: result.message, maxChars: 3000 })
  }
  return settleAfterAction(tab, { message: result.message, maxChars: 3000 })
}

async function actionPress(args) {
  const tab = await requireTargetTab()
  assertAllowedDomain(tab.url, args.allowedDomains)
  const result = await runOnPage(tab.id, pressKeyOnPage, [args])
  if (!result?.ok) throw new Error(result?.message || '按键失败')
  return settleAfterAction(tab, { message: result.message, maxChars: 3000 })
}

async function actionScroll(args) {
  const tab = await requireTargetTab()
  assertAllowedDomain(tab.url, args.allowedDomains)
  const result = await runOnPage(tab.id, scrollOnPage, [args])
  if (!result?.ok) throw new Error(result?.message || '滚动失败')
  return settleAfterAction(tab, { message: result.message, maxChars: 3000, wait: 800 })
}

async function actionScreenshot() {
  const tab = await requireTargetTab()
  const screenshot = await safeCapture(tab)
  if (!screenshot) throw new Error('截图失败，请确认目标标签页处于前台且未被浏览器保护')
  const page = await snapshot(tab.id, { maxChars: 2000, withElements: false }).catch(() => null)
  return {
    ok: true,
    message: '已截取当前页面',
    url: page?.url || tab.url,
    title: page?.title || tab.title,
    screenshot,
  }
}

async function actionBack(args) {
  const tab = await requireTargetTab()
  assertAllowedDomain(tab.url, args.allowedDomains)
  try {
    await chrome.tabs.goBack(tab.id)
  } catch {
    throw new Error('无法后退，可能已是第一页')
  }
  return settleAfterAction(tab, { message: '已后退', maxChars: 3000 })
}

async function actionForward(args) {
  const tab = await requireTargetTab()
  assertAllowedDomain(tab.url, args.allowedDomains)
  try {
    await chrome.tabs.goForward(tab.id)
  } catch {
    throw new Error('无法前进，可能已是最后一页')
  }
  return settleAfterAction(tab, { message: '已前进', maxChars: 3000 })
}

async function actionClose() {
  const tab = await requireTargetTab()
  await chrome.tabs.remove(tab.id).catch(() => {})
  await clearTargetTabId()
  return { ok: true, message: '已关闭目标标签页' }
}

const ACTIONS = {
  ping: async () => ({ ok: true, message: 'pong', version: chrome.runtime.getManifest().version }),
  open: actionOpen,
  read: actionRead,
  click: actionClick,
  type: actionType,
  press: actionPress,
  scroll: actionScroll,
  screenshot: actionScreenshot,
  back: actionBack,
  forward: actionForward,
  close: actionClose,
}

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'XIYUE_BROWSER') return false
  if (!isAllowedAppOrigin(sender.origin)) {
    sendResponse({ ok: false, message: `未授权的来源：${sender.origin || '未知'}` })
    return false
  }
  const action = String(message.action || '').toLowerCase()
  const handler = ACTIONS[action]
  if (!handler) {
    sendResponse({ ok: false, message: `不支持的操作：${action || '空'}` })
    return false
  }
  Promise.resolve()
    .then(() => handler(message.args || {}))
    .then(result => sendResponse(result))
    .catch(err => sendResponse({ ok: false, message: err?.message || String(err) }))
  return true
})

chrome.tabs.onRemoved.addListener(async tabId => {
  const current = await getTargetTabId()
  if (current === tabId) await clearTargetTabId()
})
