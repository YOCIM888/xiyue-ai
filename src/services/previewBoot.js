/* 预览运行时引导脚本：在 sandbox="allow-scripts" 且不给 allow-same-origin 的 srcdoc iframe 内执行。
 *
 * 为什么需要它：opaque origin 下 localStorage / sessionStorage / indexedDB / document.cookie
 * 一访问就抛 SecurityError，相对路径 fetch 也没有基准 URL。AI 生成的页面几乎都会在启动时
 * 读一次存储，脚本第一行就死、事件从未绑定——表现就是「界面能看、点什么都没反应」。
 * 这里用内存实现把它们兜住，并把 console 与错误回传宿主，让白屏变成可读的诊断信息。
 *
 * 宿主把 previewPaths.js（去掉 export 关键字）、previewAutomate.js（同样去掉 export）、
 * previewModules.js 和本文件一起包进同一个 IIFE 注入，配置是同作用域的常量 __XIYUE_PREVIEW__，
 * 不往全局挂任何东西；末尾调用的 loadPreviewModules 来自 previewModules.js，负责 blob URL 与 importmap，
 * installAutomation 来自 previewAutomate.js —— 它要在本文件的内层 IIFE 里调用才拿得到 report。
 * 每个 shim 独立 try/catch：shim 自身失败绝不能拖垮被预览的页面。
 * 本文件是经典脚本，不能出现 import / export，也不能出现字面量的 script 结束标签。
 */
(function () {
  const config = typeof __XIYUE_PREVIEW__ === 'undefined' ? {} : __XIYUE_PREVIEW__
  const MAX_REPORTS = 200
  const FETCH_TIMEOUT = 10000
  const NO_HOST_TEXT = '预览桥没有响应（页面可能被单独导出打开）'
  const pending = new Map()
  let seq = 0
  let reports = 0
  /** 模块图加载后才有内容：blob URL → 工作区路径，报错栈靠它才能指到源文件 */
  let blobPaths = new Map()

  function send(payload) {
    try {
      window.parent.postMessage(Object.assign({ type: PREVIEW_MESSAGE }, payload), '*')
    } catch {
      // 导出的独立 HTML 里没有宿主，静默
    }
  }

  /** 模块跑在 blob URL 里，不回映射的话栈帧只剩一串随机 UUID */
  function mapBlobUrls(payload) {
    if (!blobPaths.size) return payload
    const mapped = Object.assign({}, payload)
    if (mapped.text) mapped.text = mapModuleUrls(mapped.text, blobPaths)
    if (mapped.source) mapped.source = mapModuleUrls(mapped.source, blobPaths)
    return mapped
  }

  /** 页面若在 rAF 里刷日志会瞬间淹掉抽屉，所以按文档计数截断 */
  function report(payload) {
    if (reports > MAX_REPORTS) return
    reports += 1
    if (reports === MAX_REPORTS) {
      send({ kind: 'log', level: 'warn', text: `预览日志超过 ${MAX_REPORTS - 1} 条，后续不再上报` })
      return
    }
    send(mapBlobUrls(payload))
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window.parent) return
    const data = event.data || {}
    if (data.type !== PREVIEW_REPLY || !data.id) return
    const item = pending.get(data.id)
    if (!item) return
    pending.delete(data.id)
    clearTimeout(item.timer)
    item.resolve(data)
  })

  function request(payload, timeoutText) {
    return new Promise((resolve, reject) => {
      const id = (seq += 1)
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error(timeoutText))
      }, FETCH_TIMEOUT)
      pending.set(id, { resolve, timer })
      send(Object.assign({ id }, payload))
    })
  }

  // ---- 存储与网络 shim ----

  function createMemoryStorage() {
    const map = new Map()
    return {
      get length() { return map.size },
      key(index) {
        const keys = [...map.keys()]
        return index >= 0 && index < keys.length ? keys[index] : null
      },
      getItem(key) {
        const name = String(key)
        return map.has(name) ? map.get(name) : null
      },
      setItem(key, value) { map.set(String(key), String(value)) },
      removeItem(key) { map.delete(String(key)) },
      clear() { map.clear() },
    }
  }

  /** opaque origin 下这些是原型上会抛异常的访问器，用实例自有属性盖掉 */
  function defineOnWindow(name, value) {
    Object.defineProperty(window, name, { value, configurable: true, enumerable: true })
    return true
  }

  function installCookie() {
    const jar = new Map()
    Object.defineProperty(Document.prototype, 'cookie', {
      configurable: true,
      enumerable: true,
      get() { return [...jar].map(([name, value]) => `${name}=${value}`).join('; ') },
      // 只取第一段 name=value：path / expires / samesite 这些属性在预览里没有意义
      set(raw) {
        const pair = String(raw ?? '').split(';')[0]
        const eq = pair.indexOf('=')
        if (eq <= 0) return
        jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim())
      },
    })
    return true
  }

  const IDB_TEXT = '预览环境不支持 IndexedDB（沙箱没有同源权限），请改用 localStorage 或内存状态'

  function failedIdbRequest() {
    const request = {
      result: undefined,
      error: new Error(IDB_TEXT),
      readyState: 'done',
      onsuccess: null,
      onerror: null,
      onblocked: null,
      source: null,
      transaction: null,
      addEventListener(type, handler) { if (type === 'error') request.onerror = handler },
    }
    // 异步触发 onerror：同步抛会把调用方整段脚本带走，正是 shim 要避免的事
    setTimeout(() => {
      try { request.onerror?.({ type: 'error', target: request }) } catch { /* 页面自己的处理出错不影响预览 */ }
    }, 0)
    return request
  }

  function installIndexedDb() {
    return defineOnWindow('indexedDB', {
      open: () => failedIdbRequest(),
      deleteDatabase: () => failedIdbRequest(),
      databases: () => Promise.reject(new Error(IDB_TEXT)),
      cmp: () => 0,
    })
  }

  function installFetch() {
    const nativeFetch = window.fetch.bind(window)
    window.fetch = async function patchedFetch(input, init) {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL ? input.href : String(input?.url || '')
      if (!url || isExternalUrl(url)) return nativeFetch(input, init)
      let reply
      try {
        reply = await request(
          { kind: 'fetch', url, method: String(init?.method || input?.method || 'GET').toUpperCase() },
          `${NO_HOST_TEXT}：${url}`
        )
      } catch (err) {
        const text = String(err?.message || err)
        report({ kind: 'log', level: 'warn', text: `相对路径请求失败（${text}）：${url}` })
        // 返回 502 而不是抛异常：页面通常只检查 res.ok，抛出去会变成又一次「启动即死」
        return new Response(text, { status: 502, headers: { 'content-type': 'text/plain; charset=utf-8' } })
      }
      if (!reply.ok) {
        return new Response(String(reply.message || '预览环境读取失败'), {
          status: Number(reply.status) || 404,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        })
      }
      return new Response(reply.buffer ?? null, {
        status: Number(reply.status) || 200,
        headers: { 'content-type': String(reply.mime || 'application/octet-stream') },
      })
    }
    return true
  }

  // ---- 页内导航与交互上报 ----

  let touched = false

  /**
   * 只报第一次：宿主据此把「文件一变就整页重载」切成「标脏 + 手动重载」，别冲掉用户正在操作的状态。
   * 合成事件不算 —— AI 自测点出来的 pointerdown 不该让页面转成「等人手动重载」，
   * 那样它改完文件就再也看不到自己刚写的东西了。
   */
  function reportTouched(event) {
    if (touched) return
    if (event && event.isTrusted === false) return
    touched = true
    send({ kind: 'touched' })
  }

  /**
   * 页内锚点自己滚。srcdoc 的文档地址是 about:srcdoc、基址却继承自宿主页面，
   * 交给浏览器做默认行为，它会把整个 iframe 导航到宿主地址上，预览当场就没了。
   */
  function scrollToFragment(fragment) {
    if (!fragment) {
      window.scrollTo(0, 0)
      return
    }
    let target
    try {
      target = document.getElementById(fragment) || document.querySelector(`[name="${CSS.escape(fragment)}"]`)
    } catch {
      return
    }
    target?.scrollIntoView()
  }

  function installNavigation() {
    document.addEventListener('click', (event) => {
      const link = event.target?.closest?.('a[href], area[href]')
      if (!link) return
      // 带修饰键是「另开一处」的意图，沙箱里本来也开不出去，交给浏览器自己处理
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      // 只能用原始属性：a.href 是按 about:srcdoc 的基址解析出来的宿主地址，照着它走就跳错了
      const raw = String(link.getAttribute('href') ?? '').trim()
      // 外链与带协议的地址（javascript: / mailto: / data:）原样放行，拦错了就是「页面点不动」
      if (isExternalUrl(raw)) return
      event.preventDefault()
      reportTouched(event)
      if (!raw || raw.startsWith('#')) scrollToFragment(raw.slice(1))
      else send({ kind: 'navigate', href: raw })
    }, true)

    document.addEventListener('submit', (event) => {
      // 不 stopPropagation：页面自己的 submit 处理器还要跑，这里只是不让文档跳走
      event.preventDefault()
      reportTouched(event)
      const raw = String(event.target?.getAttribute?.('action') ?? '').trim()
      if (!raw || raw.startsWith('#') || isExternalUrl(raw)) {
        report({ kind: 'log', level: 'warn', text: '表单提交已被拦下：预览里没有服务器，页面不会跳转（要发数据请用 fetch）' })
        return
      }
      send({ kind: 'navigate', href: raw })
    }, true)
    return true
  }

  function installInteractionProbe() {
    for (const type of ['pointerdown', 'keydown', 'input', 'change']) {
      document.addEventListener(type, reportTouched, true)
    }
    return true
  }

  // ---- 诊断回传 ----

  function installConsole() {
    for (const level of PREVIEW_LEVELS) {
      const original = console[level]
      if (typeof original !== 'function') continue
      console[level] = function patched(...args) {
        report({ kind: 'log', level, text: args.map(item => formatPreviewArg(item)).join(' ') })
        try { original.apply(console, args) } catch { /* DevTools 不可用时只上报 */ }
      }
    }
    return true
  }

  function locationOf(event) {
    const file = String(event.filename || '')
    // about:srcdoc 是引导脚本自己的位置，对用户没有意义
    if (!file || file === 'about:srcdoc') return ''
    return `${file}:${event.lineno || 0}:${event.colno || 0}`
  }

  function installErrorBridge() {
    // 捕获阶段才收得到 script / link / img 这类资源加载失败，它们不冒泡到 window
    window.addEventListener('error', (event) => {
      const target = event.target
      if (target && target !== window) {
        const url = String(target.src || target.href || '')
        if (url) {
          report({
            kind: 'error',
            level: 'error',
            text: `资源加载失败：${url}`,
            source: String(target.tagName || '').toLowerCase(),
          })
          return
        }
      }
      const detail = event.error instanceof Error
        ? formatPreviewArg(event.error)
        : String(event.message || '脚本错误')
      report({ kind: 'error', level: 'error', text: detail, source: locationOf(event) })
    }, true)

    window.addEventListener('unhandledrejection', (event) => {
      report({ kind: 'error', level: 'error', text: `未处理的 Promise 拒绝：${formatPreviewArg(event.reason)}` })
    })
    return true
  }

  const installed = []
  const failed = []

  // silent：诊断通道本身不算「接管的页面 API」，就绪消息里不列出来
  function install(name, fn, silent = false) {
    try {
      if (fn() === false) failed.push(name)
      else if (!silent) installed.push(name)
    } catch {
      failed.push(name)
    }
  }

  install('console', installConsole, true)
  install('error', installErrorBridge, true)
  install('localStorage', () => defineOnWindow('localStorage', createMemoryStorage()))
  install('sessionStorage', () => defineOnWindow('sessionStorage', createMemoryStorage()))
  install('cookie', installCookie)
  install('indexedDB', installIndexedDb)
  install('fetch', installFetch)
  install('页内跳转', installNavigation)
  install('interaction', installInteractionProbe, true)
  // 自测通道必须在 ready 之前装好：宿主收到 ready 就会开始 ping，晚了它以为页面没起来
  install('自测通道', () => installAutomation({ report }), true)

  if (failed.length) {
    report({
      kind: 'log',
      level: 'warn',
      text: `预览环境未能接管：${failed.join('、')}（存储类仍会抛 SecurityError，页内跳转会真的跳走）`,
    })
  }
  send({ kind: 'ready', path: String(config.path || ''), shims: installed })

  // 必须在这段脚本里同步做完：importmap 只有赶在解析到 body 之前插入，后面的模块脚本才解析得到
  try {
    blobPaths = loadPreviewModules(config).pathsByUrl
  } catch (err) {
    report({ kind: 'log', level: 'error', text: `预览模块加载失败：${formatPreviewArg(err)}` })
  }
})()
