/* 预览页里的自测执行层：宿主发来的 read / click / type / press / scroll 落到真实 DOM 上，
 * 让模型写完页面能自己点一遍验收，而不是只能「看着像对了」。
 *
 * 沙箱刻意不给 allow-same-origin，父页摸不到 iframe 的 DOM，更截不了图；
 * 所以回给模型的是带 ref 的可访问性快照（角色 + 可访问名 + 控件状态 + 文本），不是截图。
 * 动作词表沿用 browserAgent 那一套，模型不用学第二种协议。
 *
 * 本文件与 previewPaths.js（去掉 export）、previewModules.js、previewBoot.js 拼进同一个 IIFE 注入，
 * installAutomation 由 previewBoot 在它自己的内层 IIFE 里调用 —— report 只在那个作用域里存在。
 * 顶层名字不能和 previewPaths.js / previewModules.js 重名，拼起来就是 SyntaxError，整个预览当场死掉，
 * 所以这里一律带 automate 前缀；也不能出现 import，或字面量的 script 结束标签。
 */

/** iframe 内能执行的动作；open / back / reload / console / wait 是宿主侧的，不在这里 */
export const AUTOMATE_ACTIONS = ['ping', 'read', 'click', 'type', 'press', 'scroll']

/**
 * 指令与应答的消息类型，值和 previewPaths.js 里的 PREVIEW_COMMAND / PREVIEW_COMMAND_REPLY 一样。
 * 那边那份是给宿主 import 用的；本文件在注入作用域里必须自己有一份 —— 直接引用那边的名字，
 * 单独跑单测（不经拼接）就是 ReferenceError。名字不同所以拼进同一个 IIFE 不会撞车，
 * 两边取值一致由 tests/previewAutomate.test.js 钉住。
 */
export const AUTOMATE_COMMAND = 'xiyue-preview-command'
export const AUTOMATE_COMMAND_REPLY = 'xiyue-preview-command-reply'

/** 快照行数上限：再多模型读到的就全是包装层，而且回传要走一次结构化克隆 */
const AUTOMATE_MAX_LINES = 260
const AUTOMATE_MAX_DEPTH = 24
/** 一个节点一行，文字长了整份快照就没法扫读 */
const AUTOMATE_MAX_TEXT = 80
const AUTOMATE_NAME_TEXT = 60
/** 按文字找元素时的扫描上限：页面上可能有几千个候选，不能全遍历 */
const AUTOMATE_SCAN_LIMIT = 400
const AUTOMATE_SCROLL_STEP = 480

const AUTOMATE_SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'LINK', 'META', 'TITLE', 'BASE', 'HEAD', 'BR', 'WBR',
])

const AUTOMATE_TAG_ROLES = {
  a: 'link', area: 'link', button: 'button', select: 'combobox', textarea: 'textbox',
  img: 'image', figure: 'figure', table: 'table', form: 'form', dialog: 'dialog',
  nav: 'navigation', main: 'main', header: 'banner', footer: 'contentinfo', aside: 'complementary',
  article: 'article', section: 'region', ul: 'list', ol: 'list', li: 'listitem',
  p: 'paragraph', blockquote: 'blockquote', pre: 'code', hr: 'separator',
  h1: 'heading', h2: 'heading', h3: 'heading', h4: 'heading', h5: 'heading', h6: 'heading',
  tr: 'row', td: 'cell', th: 'columnheader', thead: 'rowgroup', tbody: 'rowgroup',
  option: 'option', progress: 'progressbar', details: 'group', summary: 'button',
}

const AUTOMATE_INPUT_ROLES = {
  button: 'button', submit: 'button', reset: 'button', image: 'button', file: 'button',
  checkbox: 'checkbox', radio: 'radio', range: 'slider', search: 'searchbox', hidden: '',
}

const AUTOMATE_ACTIONABLE_TAGS = new Set(['a', 'area', 'button', 'input', 'select', 'textarea', 'summary'])
const AUTOMATE_ACTIONABLE_ROLES = new Set([
  'button', 'link', 'checkbox', 'radio', 'textbox', 'searchbox', 'combobox',
  'menuitem', 'tab', 'switch', 'slider',
])

/** 不给「…（已截断）」那种长后缀：快照里每行都可能出现，占位太多 */
function automateClip(text, max = AUTOMATE_MAX_TEXT) {
  const value = String(text ?? '').replace(/\s+/g, ' ').trim()
  return value.length > max ? `${value.slice(0, max)}…` : value
}

function automateAttr(el, name) {
  return typeof el?.getAttribute === 'function' ? el.getAttribute(name) : null
}

/** 只取元素自己的文字：子节点的文字由子节点那行说，重复一遍快照就肿了 */
function automateNodeText(el) {
  let text = ''
  for (const node of el.childNodes || []) {
    if (node.nodeType === 3) text += node.nodeValue || ''
  }
  return automateClip(text)
}

/**
 * 看不见的节点不进快照：模型照着它点，什么都不会发生，还以为是自己写错了。
 * 不查 getClientRects —— 没有布局的环境（happy-dom）会返回空数组，等于把所有节点都判死。
 */
export function automateIsVisible(el) {
  if (el?.hidden === true) return false
  let style
  try {
    style = window.getComputedStyle(el)
  } catch {
    return true
  }
  if (!style) return true
  return style.display !== 'none' && style.visibility !== 'hidden' && style.visibility !== 'collapse'
}

export function automateRoleOf(el) {
  const explicit = automateClip(automateAttr(el, 'role'), 40)
  if (explicit) return explicit
  const tag = String(el?.tagName || '').toLowerCase()
  if (tag === 'input') {
    const type = String(automateAttr(el, 'type') || 'text').toLowerCase()
    return type in AUTOMATE_INPUT_ROLES ? AUTOMATE_INPUT_ROLES[type] : 'textbox'
  }
  return AUTOMATE_TAG_ROLES[tag] || ''
}

/** ARIA 的计算顺序：aria-label → aria-labelledby → label → alt/placeholder/title → 自身文字 */
export function automateAccessibleName(el) {
  const label = automateClip(automateAttr(el, 'aria-label'), AUTOMATE_NAME_TEXT)
  if (label) return label
  const byId = String(automateAttr(el, 'aria-labelledby') || '').trim()
  if (byId) {
    const text = byId.split(/\s+/).map((id) => {
      let node
      try {
        node = document.getElementById(id)
      } catch {
        node = null
      }
      return node?.textContent || ''
    }).join(' ')
    const named = automateClip(text, AUTOMATE_NAME_TEXT)
    if (named) return named
  }
  if (el?.id) {
    let owner
    try {
      owner = document.querySelector(`label[for="${CSS.escape(el.id)}"]`)
    } catch {
      owner = null
    }
    const fromOwner = automateClip(owner?.textContent, AUTOMATE_NAME_TEXT)
    if (fromOwner) return fromOwner
  }
  const wrapping = typeof el?.closest === 'function' ? el.closest('label') : null
  const fromWrapping = automateClip(wrapping?.textContent, AUTOMATE_NAME_TEXT)
  if (fromWrapping) return fromWrapping
  for (const attr of ['alt', 'placeholder', 'title']) {
    const value = automateClip(automateAttr(el, attr), AUTOMATE_NAME_TEXT)
    if (value) return value
  }
  const tag = String(el?.tagName || '').toLowerCase()
  // 下拉框的 textContent 是所有选项拼在一起，报出来没法读；名字取当前选中的那一项
  if (tag === 'select') {
    const picked = el.selectedOptions?.[0] || el.options?.[el.selectedIndex]
    const chosen = automateClip(picked?.textContent, AUTOMATE_NAME_TEXT)
    if (chosen) return chosen
  }
  if (tag === 'input') {
    const type = String(automateAttr(el, 'type') || 'text').toLowerCase()
    if (type === 'submit' || type === 'reset' || type === 'button') return automateClip(el.value, AUTOMATE_NAME_TEXT)
  }
  return automateClip(el?.textContent, AUTOMATE_NAME_TEXT)
}

/** 容器只报自己的直接文字，否则一个 ul 会把所有 li 的内容再抄一遍；aria-label 例外，那是作者显式起的名字 */
function automateNameOf(el, actionable) {
  const aria = automateClip(automateAttr(el, 'aria-label'), AUTOMATE_NAME_TEXT)
  if (aria) return aria
  if (!actionable && el?.children?.length) return automateNodeText(el)
  return automateAccessibleName(el)
}

export function automateIsActionable(el, role) {
  const tag = String(el?.tagName || '').toLowerCase()
  if (tag === 'input' && String(automateAttr(el, 'type') || '').toLowerCase() === 'hidden') return false
  if (AUTOMATE_ACTIONABLE_TAGS.has(tag)) return true
  if (role && AUTOMATE_ACTIONABLE_ROLES.has(role)) return true
  if (typeof el?.hasAttribute === 'function' && el.hasAttribute('onclick')) return true
  const tabindex = automateAttr(el, 'tabindex')
  if (tabindex !== null && tabindex !== '' && Number(tabindex) >= 0) return true
  return !!el?.isContentEditable
}

export function automateStateOf(el) {
  const tag = String(el?.tagName || '').toLowerCase()
  const out = []
  if (el?.id) out.push(`id=${el.id}`)
  const heading = /^h([1-6])$/.exec(tag)
  if (heading) out.push(`level=${heading[1]}`)
  if (tag === 'a' || tag === 'area') {
    // a.href 在 about:srcdoc 下解析成宿主地址，只有原始属性说的是作者写的那个链接
    const href = automateClip(automateAttr(el, 'href'), 120)
    if (href) out.push(`href=${href}`)
  }
  if (tag === 'img') {
    const src = automateClip(automateAttr(el, 'src'), 120)
    if (src) out.push(`src=${src}`)
  }
  if (tag === 'input') {
    const type = String(automateAttr(el, 'type') || 'text').toLowerCase()
    if (type !== 'text') out.push(`type=${type}`)
    const placeholder = automateClip(automateAttr(el, 'placeholder'), 40)
    if (placeholder) out.push(`placeholder="${placeholder}"`)
    if (type === 'checkbox' || type === 'radio') {
      if (el.checked) out.push('checked')
    } else if (type !== 'file') {
      const value = automateClip(el.value, 60)
      if (value) out.push(`value="${value}"`)
    }
  }
  if (tag === 'textarea') {
    const placeholder = automateClip(automateAttr(el, 'placeholder'), 40)
    if (placeholder) out.push(`placeholder="${placeholder}"`)
    const value = automateClip(el.value, 60)
    if (value) out.push(`value="${value}"`)
  }
  if (tag === 'select' && el.multiple) out.push('multiple')
  if (tag === 'option' && el.selected) out.push('selected')
  const tabindex = automateAttr(el, 'tabindex')
  if (tabindex !== null && tabindex !== '') out.push(`tabindex=${tabindex}`)
  if (el?.disabled) out.push('disabled')
  if (automateAttr(el, 'aria-disabled') === 'true') out.push('aria-disabled')
  if (el?.readOnly) out.push('readonly')
  return out
}

/**
 * 一个元素在快照里的那一行；没有语义、又点不动、还不带文字的包装层返回空串，不占行。
 * @param {Element} el
 * @param {Map<number, Element>|null} refs 传 Map 时给可交互元素分配 ref，传 null 表示只描述不登记
 */
export function automateDescribe(el, refs) {
  const role = automateRoleOf(el)
  const text = automateNodeText(el)
  const actionable = automateIsActionable(el, role)
  if (!role && !actionable) return text ? `text "${text}"` : ''
  const parts = []
  if (actionable && refs) {
    const ref = refs.size + 1
    refs.set(ref, el)
    parts.push(`[${ref}]`)
  }
  // div 挂 onclick / tabindex 就是作者拿它当按钮用：没有语义角色也得给个 ref，否则模型点不到
  parts.push(role || (el?.isContentEditable ? 'textbox' : String(el?.tagName || 'element').toLowerCase()))
  const name = automateNameOf(el, actionable)
  if (name) parts.push(`"${name}"`)
  for (const item of automateStateOf(el)) parts.push(item)
  return parts.join(' ')
}

/**
 * 生成带 ref 的可访问性快照。ref 按文档顺序递增，click / type 直接引用它。
 * @param {Element} [root] 起点，缺省是整个 body
 * @returns {{text: string, refs: Map<number, Element>, lines: number, refCount: number, truncated: boolean}}
 */
export function collectSnapshot(root, { maxLines = AUTOMATE_MAX_LINES } = {}) {
  const refs = new Map()
  const lines = []
  let truncated = false
  const limit = Math.max(10, Number(maxLines) || AUTOMATE_MAX_LINES)

  function walk(el, level) {
    for (const child of el.children || []) {
      if (lines.length >= limit) {
        truncated = true
        return
      }
      if (AUTOMATE_SKIP_TAGS.has(String(child.tagName || ''))) continue
      if (!automateIsVisible(child)) continue
      const line = automateDescribe(child, refs)
      let next = level
      if (line) {
        lines.push(`${'  '.repeat(Math.min(level, 12))}${line}`)
        next = level + 1
      }
      if (level < AUTOMATE_MAX_DEPTH) walk(child, next)
    }
  }

  const start = root || document.body
  if (start) walk(start, 0)
  return { text: lines.join('\n'), refs, lines: lines.length, refCount: refs.size, truncated }
}

/**
 * ref / selector / text 三种定位方式，和 browser 工具一致。
 * ref 来自上一次 read；页面重新渲染后旧 ref 指向的是已经脱离文档的节点，必须说清楚而不是静默点空气。
 */
export function automateFindTarget(args, refs) {
  const ref = args?.ref
  if (ref !== undefined && ref !== null && ref !== '') {
    const key = Number(ref)
    const el = Number.isFinite(key) ? refs?.get?.(key) : null
    if (!el) return { error: `没有 ref ${ref}：先 read 拿一份新快照，ref 是按快照顺序编的` }
    if (!el.isConnected) return { error: `ref ${key} 已经不在页面上了（页面重新渲染过），请重新 read 再操作` }
    return { el, label: `[${key}]` }
  }
  if (args?.selector) {
    let el
    try {
      el = document.querySelector(String(args.selector))
    } catch (err) {
      return { error: `选择器无效：${err?.message || err}` }
    }
    if (!el) return { error: `页面上找不到 ${args.selector}` }
    return { el, label: String(args.selector) }
  }
  if (args?.text) {
    const want = automateClip(args.text, AUTOMATE_NAME_TEXT).toLowerCase()
    if (!want) return { error: '按文字定位要给非空的 text' }
    const candidates = document.querySelectorAll('a[href], area[href], button, input, select, textarea, summary, [role], [onclick], [tabindex]')
    let scanned = 0
    let loose = null
    for (const el of candidates) {
      if ((scanned += 1) > AUTOMATE_SCAN_LIMIT) break
      if (!automateIsVisible(el)) continue
      const role = automateRoleOf(el)
      if (!automateIsActionable(el, role)) continue
      const name = automateNameOf(el, true).toLowerCase()
      if (name === want) return { el, label: `文字「${args.text}」` }
      if (!loose && name.includes(want)) loose = { el, label: `文字「${args.text}」` }
    }
    if (loose) return loose
    return { error: `页面上找不到文字是「${args.text}」的可交互元素，改用 read 给出的 ref 或 selector` }
  }
  return { error: '要用 ref / selector / text 之一指定目标，ref 来自上一次 read' }
}

/** 只派发 click 的话，绑在 pointerdown 上的处理器（按下即生效的按钮、拖拽）收不到 */
export function automateClickElement(el) {
  try {
    el.scrollIntoView?.({ block: 'center', inline: 'center' })
  } catch {
    // 没有布局能力的环境里滚动是空操作，点还是要点的
  }
  for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
    const Ctor = type.startsWith('pointer') && typeof window.PointerEvent === 'function'
      ? window.PointerEvent
      : window.MouseEvent
    el.dispatchEvent(new Ctor(type, { bubbles: true, cancelable: true, composed: true, view: window, button: 0 }))
  }
}

export function automateTypeValue(el, raw) {
  const tag = String(el?.tagName || '').toLowerCase()
  const value = String(raw ?? '')
  if (tag === 'select') {
    const want = automateClip(value, 60).toLowerCase()
    const options = [...(el.options || [])]
    const hit = options.find(option => (
      String(option.value || '').toLowerCase() === want
      || automateClip(option.textContent, 60).toLowerCase() === want
    ))
    if (!hit) {
      const listed = options.slice(0, 12).map(option => automateClip(option.textContent, 30) || option.value).filter(Boolean)
      return { ok: false, message: `下拉框里没有「${value}」这一项${listed.length ? `，可选：${listed.join('、')}` : ''}` }
    }
    el.value = hit.value
    el.dispatchEvent(new Event('change', { bubbles: true }))
    return { ok: true, message: `已选中「${automateClip(hit.textContent, 40) || hit.value}」` }
  }
  if (tag === 'input') {
    const type = String(automateAttr(el, 'type') || 'text').toLowerCase()
    if (type === 'checkbox' || type === 'radio') {
      const want = !!value.trim() && !/^(false|0|off|no|unchecked)$/i.test(value.trim())
      if (el.checked === want) return { ok: true, message: `${type} 已经是${want ? '选中' : '未选中'}状态` }
      el.checked = want
      el.dispatchEvent(new Event('change', { bubbles: true }))
      return { ok: true, message: `已把 ${type} 设为${want ? '选中' : '未选中'}` }
    }
    if (type === 'file') return { ok: false, message: '文件输入框填不了：预览里没有真实文件可传' }
  }
  if (tag !== 'input' && tag !== 'textarea' && !el?.isContentEditable) {
    return { ok: false, message: `${tag || '这个元素'}不是输入框，type 只能填 input / textarea / contenteditable` }
  }
  try {
    el.focus?.()
  } catch {
    // 聚焦失败不影响赋值
  }
  if (el.isContentEditable && tag !== 'input' && tag !== 'textarea') {
    el.textContent = value
    el.dispatchEvent(new Event('input', { bubbles: true }))
    return { ok: true, message: '已填入内容' }
  }
  // React 在 input 上挂了值追踪器，直接赋值再派发 input 会被它当成「值没变」丢掉，
  // 所以走原型上的原生 setter，让追踪器认为这次修改来自外部
  const proto = tag === 'textarea' ? window.HTMLTextAreaElement?.prototype : window.HTMLInputElement?.prototype
  const setter = proto ? Object.getOwnPropertyDescriptor(proto, 'value')?.set : null
  try {
    if (setter) setter.call(el, value)
    else el.value = value
  } catch {
    el.value = value
  }
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
  return { ok: true, message: `已填入 ${automateClip(value, 40)}` }
}

/**
 * 合成按键。浏览器不会为它执行默认行为（Enter 提交表单、Tab 移动焦点），
 * 需要提交就 click 那个按钮 —— 与其假装支持，不如在结果里说清楚。
 */
export function automatePressKey(raw) {
  const combo = automateClip(raw, 40)
  if (!combo) return { ok: false, message: 'press 需要 key，例如 Enter、Escape、Tab、ctrl+a' }
  const segments = combo.split('+')
  // 「ctrl+」这种少写了一个键的，按下去等于什么也没发生，不如当场说清楚
  if (segments.length > 1 && segments.some(part => !part.trim())) {
    return { ok: false, message: `按键写法不对：${combo}，应该像 Enter 或 ctrl+a` }
  }
  const parts = segments.map(part => part.trim()).filter(Boolean)
  const key = parts.pop() || ''
  if (!key) return { ok: false, message: `按键写法不对：${combo}，应该像 Enter 或 ctrl+a` }
  const mods = parts.map(part => part.toLowerCase())
  const init = {
    key,
    code: key.length === 1 ? `Key${key.toUpperCase()}` : key,
    bubbles: true,
    cancelable: true,
    composed: true,
    ctrlKey: mods.includes('ctrl') || mods.includes('control'),
    metaKey: mods.includes('meta') || mods.includes('cmd') || mods.includes('command'),
    altKey: mods.includes('alt'),
    shiftKey: mods.includes('shift'),
  }
  const target = document.activeElement || document.body
  for (const type of ['keydown', 'keyup']) target.dispatchEvent(new KeyboardEvent(type, init))
  return { ok: true, message: `已在 ${String(target?.tagName || 'document').toLowerCase()} 上按下 ${combo}` }
}

/** 统一走「算出目标位置再滚过去」：没有布局能力的环境里 scrollBy 可能压根不存在 */
function automateScrollTo(top) {
  const doc = document.scrollingElement || document.documentElement
  const value = Math.max(0, Math.round(Number(top) || 0))
  try {
    if (typeof window.scrollTo === 'function') window.scrollTo(0, value)
    else if (doc) doc.scrollTop = value
  } catch {
    try {
      if (doc) doc.scrollTop = value
    } catch {
      // 滚不动就算了，快照里会说清当前 scrollY
    }
  }
  return value
}

export function automateScroll(args, refs) {
  if (args?.ref || args?.selector || args?.text) {
    const found = automateFindTarget(args, refs)
    if (found.error) return { ok: false, message: found.error }
    try {
      found.el.scrollIntoView?.({ block: 'center', inline: 'center' })
    } catch {
      return { ok: false, message: '这个环境滚不动页面' }
    }
    return { ok: true, message: `已滚到 ${found.label}`, scrollY: automateCurrentScrollY() }
  }
  const doc = document.scrollingElement || document.documentElement
  const current = automateCurrentScrollY()
  const max = Math.max(0, Number(doc?.scrollHeight || 0) - Number(window.innerHeight || 0))
  if (args?.to !== undefined && args?.to !== null && args?.to !== '') {
    return { ok: true, message: `已滚到 ${automateScrollTo(args.to)}px`, scrollY: automateCurrentScrollY() }
  }
  const direction = String(args?.direction || 'down').toLowerCase()
  if (direction === 'up') return { ok: true, message: '已向上滚', scrollY: automateScrollTo(current - AUTOMATE_SCROLL_STEP) }
  if (direction === 'down') return { ok: true, message: '已向下滚', scrollY: automateScrollTo(current + AUTOMATE_SCROLL_STEP) }
  if (direction === 'top') return { ok: true, message: '已回到顶部', scrollY: automateScrollTo(0) }
  if (direction === 'bottom') return { ok: true, message: '已滚到底部', scrollY: automateScrollTo(max) }
  return { ok: false, message: `滚动方向只支持 up / down / top / bottom，收到的是 ${direction}` }
}

function automateCurrentScrollY() {
  const doc = document.scrollingElement || document.documentElement
  return Math.round(Number(window.scrollY ?? doc?.scrollTop ?? 0) || 0)
}

/** 快照之外的页面事实：模型看不到截图，这些数字是它判断布局的唯一依据 */
function automatePageMeta() {
  return {
    title: automateClip(document.title, 120),
    viewport: `${Math.round(window.innerWidth || 0)}x${Math.round(window.innerHeight || 0)}`,
    scrollY: automateCurrentScrollY(),
  }
}

/**
 * 执行一条自测指令。refs 是跨指令的登记簿：read 会把它整份换掉，click / type 靠它找到元素。
 * @param {object} data 宿主发来的指令
 * @param {{refs: Map<number, Element>}} state 可变状态
 */
export function runAutomateAction(data, state) {
  const action = String(data?.action || '').toLowerCase()
  const args = data && typeof data === 'object' ? data : {}
  if (!AUTOMATE_ACTIONS.includes(action)) {
    return { ok: false, action, message: `预览页里不支持 ${action || '这个动作'}，可用：${AUTOMATE_ACTIONS.join(' / ')}` }
  }
  if (action === 'ping') {
    return { ok: true, action, ready: true, ...automatePageMeta() }
  }
  if (action === 'read') {
    let root = null
    if (args.ref || args.selector || args.text) {
      const found = automateFindTarget(args, state?.refs)
      if (found.error) return { ok: false, action, message: found.error }
      root = found.el
    }
    const snapshot = collectSnapshot(root || document.body)
    state.refs = snapshot.refs
    const header = root ? automateDescribe(root, null) : ''
    const text = snapshot.text || '（页面里没有可见内容）'
    return {
      ok: true,
      action,
      ...automatePageMeta(),
      scope: root ? (header || String(root.tagName || '').toLowerCase()) : 'body',
      text: header ? `${header}\n${text}` : text,
      refCount: snapshot.refCount,
      lines: snapshot.lines,
      truncated: snapshot.truncated,
    }
  }
  // press 打在焦点元素上，scroll 不带目标时滚的是整个页面，都不需要先定位
  if (action === 'press') return { ...automatePressKey(args.key), action, ...automatePageMeta() }
  if (action === 'scroll') return { ...automateScroll(args, state?.refs), action }
  const found = automateFindTarget(args, state?.refs)
  if (found.error) return { ok: false, action, message: found.error }
  const described = automateDescribe(found.el, null) || String(found.el.tagName || '').toLowerCase()
  // 用 ref 定位时把编号回显出来，模型才能确认自己点的是快照里的哪一个
  const target = found.label.startsWith('[') ? `${found.label} ${described}` : described
  if (action === 'click') {
    if (found.el.disabled) return { ok: false, action, message: `${target} 是禁用状态，点了也没反应` }
    automateClickElement(found.el)
    return { ok: true, action, target, message: `已点击 ${target}`, ...automatePageMeta() }
  }
  const typed = automateTypeValue(found.el, args.text ?? args.value ?? '')
  return { ...typed, action, target, ...automatePageMeta() }
}

/**
 * 装上指令监听。由 previewBoot 在它自己的内层 IIFE 里调用，report 是它的日志通道，
 * 自测的每一步都会在抽屉控制台里留一行，用户能看见 AI 正在点什么。
 *
 * 应答走独立的消息类型：boot 的 fetch 用 PREVIEW_REPLY + 自增 id 配对，
 * 混用同一条通道的话，指令应答会被当成某个 fetch 的结果吃掉。
 */
export function installAutomation({ report } = {}) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false
  const state = { refs: new Map() }

  function note(text, level = 'info') {
    if (typeof report !== 'function') return
    try {
      report({ kind: 'log', level, text })
    } catch {
      // 日志通道出错不该让自测本身失败
    }
  }

  function reply(id, payload) {
    try {
      window.parent.postMessage(Object.assign({ type: AUTOMATE_COMMAND_REPLY, id }, payload), '*')
    } catch {
      // 抽屉刚好被关掉：应答丢掉即可
    }
  }

  function handle(data) {
    const id = typeof data.id === 'number' ? data.id : 0
    const action = String(data.action || '').toLowerCase()
    let result
    try {
      result = runAutomateAction(data, state)
    } catch (err) {
      result = { ok: false, action, message: `${err?.name || 'Error'}: ${err?.message || err}` }
    }
    if (!result || typeof result !== 'object') result = { ok: false, action, message: '这个动作没有返回结果' }
    // ping 只是宿主在等页面就绪，报进控制台纯属噪声
    if (action !== 'ping') {
      note(`自测 ${action}：${result.message || result.target || (result.ok ? '完成' : '失败')}`, result.ok ? 'info' : 'warn')
    }
    reply(id, result)
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window.parent) return
    const data = event.data
    if (!data || data.type !== AUTOMATE_COMMAND) return
    handle(data)
  })
  return true
}
