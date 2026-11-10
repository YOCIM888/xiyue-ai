import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { watch } from 'vue'
import {
  openPreviewFor, previewClient, previewRequest, registerPreviewClient,
  requestPreview, unregisterPreviewClient, waitClientReady, waitPreviewReady,
} from '../src/services/previewSession.js'
import {
  buildToolPrompt, executeToolCall, extractToolCalls, isParallelSafe,
  planCallBatches, toolUsageHint,
} from '../src/services/tools.js'

/**
 * 假抽屉。路径、就绪、控制台、回复都由用例摆布；
 * reload / goBack 之后会自动重新就绪（真实抽屉是新文档报一次 ready），autoReady: false 用来造「一直起不来」。
 */
function fakeClient({ path = 'index.html', ready = true, autoReady = true } = {}) {
  const state = { path, ready, autoReady, entries: [], canBack: false, back: '', reply: null }
  const calls = []
  const settle = () => { if (state.autoReady) setTimeout(() => { state.ready = true }, 30) }
  return {
    state,
    calls,
    getPath: () => state.path,
    isReady: () => state.ready,
    canGoBack: () => state.canBack,
    goBack: () => { calls.push('goBack'); state.path = state.back || state.path; state.ready = false; settle() },
    reload: () => { calls.push('reload'); state.ready = false; settle() },
    entries: () => state.entries,
    send: vi.fn(async (action, args) => {
      calls.push(`${action} ${JSON.stringify(args)}`)
      return state.reply ? state.reply(action, args) : { ok: true, action, message: '完成' }
    }),
  }
}

const settings = { workModeEnabled: true }
const run = args => executeToolCall({ tool: 'preview', args }, { settings })

/** 推进假时钟让轮询与 350ms 余量跑完，再取结果 */
async function settled(promise, ms = 900) {
  await vi.advanceTimersByTimeAsync(ms)
  return promise
}

const stops = []

beforeEach(() => {
  vi.useFakeTimers()
  previewRequest.value = null
  registerPreviewClient(null)
})

afterEach(() => {
  while (stops.length) stops.pop()()
  registerPreviewClient(null)
  vi.useRealTimers()
})

describe('requestPreview', () => {
  it('记下路径、标题与时间戳，空路径直接拒掉', () => {
    expect(requestPreview('   ')).toBe(false)
    expect(previewRequest.value).toBe(null)
    expect(requestPreview('sub/page.html')).toBe(true)
    expect(previewRequest.value.path).toBe('sub/page.html')
    expect(previewRequest.value.name).toBe('page.html')
    expect(previewRequest.value.at).toBeGreaterThan(0)
  })

  it('同一路径连开两次也换一份对象，订阅方的 watcher 才收得到', () => {
    requestPreview('a.html')
    const first = previewRequest.value
    requestPreview('a.html')
    expect(previewRequest.value).not.toBe(first)
    expect(previewRequest.value.path).toBe('a.html')
  })

  it('显式给了名字就用给的', () => {
    requestPreview('a.html', '首页')
    expect(previewRequest.value.name).toBe('首页')
  })
})

describe('客户端登记', () => {
  it('注销只认自己那一份，不会把刚挂上的新抽屉擦掉', () => {
    const old = fakeClient()
    const next = fakeClient()
    registerPreviewClient(old)
    unregisterPreviewClient(next)
    expect(previewClient()).toBe(old)
    unregisterPreviewClient(old)
    expect(previewClient()).toBe(null)
  })

  it('没有抽屉时 previewClient 是 null', () => {
    expect(previewClient()).toBe(null)
  })
})

describe('waitPreviewReady', () => {
  it('路径对上且页面报就绪后，再多等一点余量才算成功', async () => {
    const client = fakeClient({ path: 'a.html', ready: false })
    registerPreviewClient(client)
    const pending = waitPreviewReady('a.html')
    client.state.ready = true
    const result = await settled(pending, 600)
    expect(result).toEqual({ ok: true, client })
  })

  it('抽屉一直没挂上：说明面板没挂载或文件不存在', async () => {
    const result = await settled(waitPreviewReady('a.html', { timeout: 2000 }), 2200)
    expect(result.ok).toBe(false)
    expect(result.message).toContain('没能打开 a.html')
    expect(result.message).toContain('工作区面板可能没有挂载')
  })

  it('抽屉挂上了但页面起不来：让模型去看 console', async () => {
    registerPreviewClient(fakeClient({ path: 'a.html', ready: false, autoReady: false }))
    const result = await settled(waitPreviewReady('a.html', { timeout: 2000 }), 2200)
    expect(result.ok).toBe(false)
    expect(result.message).toContain('没有就绪')
    expect(result.message).toContain('console')
  })

  it('开着的不是这一页就不算就绪', async () => {
    registerPreviewClient(fakeClient({ path: 'other.html' }))
    const result = await settled(waitPreviewReady('a.html', { timeout: 2000 }), 2200)
    expect(result.message).toContain('没能打开 a.html')
  })

  it('取消时立刻收手', async () => {
    const controller = new AbortController()
    registerPreviewClient(fakeClient({ path: 'a.html', ready: false, autoReady: false }))
    const pending = waitPreviewReady('a.html', { signal: controller.signal })
    controller.abort()
    const result = await settled(pending, 300)
    expect(result).toEqual({ ok: false, message: '已取消' })
  })
})

describe('openPreviewFor', () => {
  it('已经开着同一页时强制重载，而不是重开一次抽屉', async () => {
    const client = fakeClient({ path: 'a.html' })
    registerPreviewClient(client)
    const result = await settled(openPreviewFor('a.html'), 600)
    expect(result.ok).toBe(true)
    expect(client.calls).toContain('reload')
    expect(previewRequest.value).toBe(null)
  })

  it('换页时只登记请求，由面板真的把抽屉切过去', async () => {
    const client = fakeClient({ path: 'a.html' })
    registerPreviewClient(client)
    stops.push(watch(previewRequest, request => {
      client.state.path = request.path
      client.state.ready = false
      setTimeout(() => { client.state.ready = true }, 30)
    }))
    const result = await settled(openPreviewFor('b/page.html'), 700)
    expect(result.ok).toBe(true)
    expect(client.state.path).toBe('b/page.html')
  })
})

describe('waitClientReady', () => {
  it('抽屉被换掉或关掉就报错，不干等', async () => {
    const client = fakeClient({ ready: false, autoReady: false })
    registerPreviewClient(client)
    const pending = waitClientReady(client)
    registerPreviewClient(fakeClient())
    const result = await settled(pending, 400)
    expect(result.ok).toBe(false)
    expect(result.message).toContain('已经关掉或换了页面')
  })

  it('重新就绪后带一点余量返回', async () => {
    const client = fakeClient({ ready: false })
    registerPreviewClient(client)
    const pending = waitClientReady(client)
    setTimeout(() => { client.state.ready = true }, 40)
    const result = await settled(pending, 700)
    expect(result).toEqual({ ok: true, client })
  })
})

describe('preview 工具的开关与参数', () => {
  it('工作模式没开就拒绝，且不附示例诱导重试', async () => {
    const result = await executeToolCall(
      { tool: 'preview', args: { action: 'read' } },
      { settings: { workModeEnabled: false } }
    )
    expect(result).toEqual({ ok: false, refused: true, text: '工作模式未开启', record: '失败：工作模式未开启' })
  })

  it('不认识的动作把可用清单报出来', async () => {
    const result = await run({ action: 'screenshot' })
    expect(result.ok).toBe(false)
    expect(result.text).toContain('screenshot')
    expect(result.text).toContain('open / read / click / type / press / scroll / back / reload / console / wait')
  })

  it('没写 action 默认读一次快照', async () => {
    const client = fakeClient()
    registerPreviewClient(client)
    const result = await run({})
    expect(result.ok).toBe(true)
    expect(client.send).toHaveBeenCalledWith('read', {})
  })

  it('预览窗口没开时给出正确的 open 写法', async () => {
    const result = await run({ action: 'click', ref: 1 })
    expect(result.ok).toBe(false)
    expect(result.text).toContain('预览窗口没开着')
    expect(result.text).toContain('{"tool":"preview","args":{"action":"open","path":"index.html"}}')
    expect(result.record).toContain('预览窗口没开着')
  })

  it('open 只吃工作区里的 .html，越界路径一律拒掉', async () => {
    for (const path of ['', 'src/app.js', '../secret.html', 'a/../../b.html', '/etc/passwd']) {
      const result = await run({ action: 'open', path })
      expect(result.ok, path).toBe(false)
      expect(result.text, path).toContain('.html')
    }
  })

  it('反斜杠与前导斜杠会被归一化成工作区相对路径', async () => {
    const client = fakeClient({ path: 'src/page.html' })
    registerPreviewClient(client)
    const result = await settled(run({ action: 'open', path: '/src\\page.html' }), 600)
    expect(result.ok).toBe(true)
    expect(client.calls).toContain('reload')
  })
})

describe('open', () => {
  it('打开的同时把首屏快照带回来，并说明用户看得见', async () => {
    const client = fakeClient({ path: 'index.html' })
    client.state.reply = action => (action === 'read'
      ? {
        ok: true, action: 'read', title: '登录页', scope: 'body',
        text: 'main "登录"\n  [1] button "登录"', refCount: 1, viewport: '1440x900', scrollY: 0,
      }
      : { ok: true, action })
    registerPreviewClient(client)
    const result = await settled(run({ action: 'open', path: 'index.html' }), 600)
    expect(result.ok).toBe(true)
    expect(result.text).toContain('页面标题：登录页')
    expect(result.text).toContain('当前页面：index.html')
    expect(result.text).toContain('[1] button "登录"')
    expect(result.text).toContain('可交互元素 1 个')
    expect(result.text).toContain('视口 1440x900')
    expect(result.text).toContain('预览窗口是打开的')
    expect(result.text).not.toContain('读取范围：body')
    expect(result.record).toBe('preview：打开 index.html → 已就绪')
    expect(client.send).toHaveBeenCalledWith('read', {})
  })

  it('页面起不来时把原因原样回灌', async () => {
    const client = fakeClient({ path: 'index.html', ready: false, autoReady: false })
    registerPreviewClient(client)
    const result = await settled(run({ action: 'open', path: 'index.html' }), 26000)
    expect(result.ok).toBe(false)
    expect(result.text).toContain('没有就绪')
    expect(result.record).toContain('preview：打开 index.html')
  })

  it('打开时顺手带出已有的报错', async () => {
    const client = fakeClient({ path: 'index.html' })
    client.state.reply = () => ({ ok: true, action: 'read', text: '[1] link "首页"', refCount: 1 })
    client.state.entries = [{ level: 'error', text: '模块加载失败：vue', source: 'index.html' }]
    registerPreviewClient(client)
    const result = await settled(run({ action: 'open', path: 'index.html' }), 600)
    expect(result.text).toContain('控制台里有 1 个错误')
    expect(result.text).toContain('模块加载失败：vue')
  })
})

describe('read / click / type / press / scroll', () => {
  it('read 已经把整页摊开，不再附一遍控制台', async () => {
    const client = fakeClient()
    client.state.reply = () => ({ ok: true, action: 'read', text: '[1] button "提交"', refCount: 1 })
    client.state.entries = [{ level: 'error', text: 'boom' }]
    registerPreviewClient(client)
    const result = await run({ action: 'read' })
    expect(result.ok).toBe(true)
    expect(result.text).toContain('页面快照')
    expect(result.text).not.toContain('boom')
    expect(client.send).toHaveBeenCalledWith('read', {})
  })

  it('read 可以只看局部，并回显范围', async () => {
    const client = fakeClient()
    client.state.reply = () => ({ ok: true, action: 'read', text: '[1] textbox "账号"', refCount: 1, scope: '#loginForm' })
    registerPreviewClient(client)
    const result = await run({ action: 'read', selector: '#loginForm' })
    expect(result.text).toContain('读取范围：#loginForm')
    expect(client.send).toHaveBeenCalledWith('read', { selector: '#loginForm' })
  })

  it('快照被截断时告诉模型怎么缩小范围', async () => {
    const client = fakeClient()
    client.state.reply = () => ({ ok: true, action: 'read', text: 'x', refCount: 2, truncated: true })
    registerPreviewClient(client)
    const result = await run({ action: 'read' })
    expect(result.text).toContain('被截掉了')
    expect(result.text).toContain('selector')
  })

  it('click 回显目标，并顺手带出控制台里的错误', async () => {
    const client = fakeClient()
    client.state.reply = () => ({ ok: true, action: 'click', target: '[1] button "登录"', message: '已点击' })
    client.state.entries = [{ level: 'error', text: 'boom' }, { level: 'log', text: 'hi' }]
    registerPreviewClient(client)
    const result = await run({ action: 'click', ref: 1 })
    expect(result.ok).toBe(true)
    expect(result.text).toContain('已点击')
    expect(result.text).toContain('目标：[1] button "登录"')
    expect(result.text).toContain('控制台里有 1 个错误')
    expect(result.text).toContain('boom')
    expect(result.text).not.toContain('hi')
    expect(result.record).toBe('preview：点击 [1] → 完成')
  })

  it('动作失败时把 iframe 给的原因回灌，并记进执行链', async () => {
    const client = fakeClient()
    client.state.reply = () => ({ ok: false, action: 'click', message: '[9] 是禁用状态，点了也没反应' })
    registerPreviewClient(client)
    const result = await run({ action: 'click', ref: 9 })
    expect(result.ok).toBe(false)
    expect(result.text).toContain('禁用状态')
    expect(result.record).toContain('preview：点击 [9] → 失败')
  })

  it('type 把 value 也认成 text，空字符串照发', async () => {
    const client = fakeClient()
    registerPreviewClient(client)
    await run({ action: 'type', ref: 2, value: '李四' })
    expect(client.send).toHaveBeenLastCalledWith('type', { ref: 2, text: '李四' })
    await run({ action: 'type', selector: '#name', text: '' })
    expect(client.send).toHaveBeenLastCalledWith('type', { selector: '#name', text: '' })
  })

  it('只转发白名单里的参数，模型多写的字段不会漏进 iframe', async () => {
    const client = fakeClient()
    registerPreviewClient(client)
    await run({ action: 'type', ref: 2, text: '张三', selector: '', foo: 'bar', path: 'x.html', code: 'rm -rf' })
    expect(client.send).toHaveBeenCalledWith('type', { ref: 2, text: '张三' })
  })

  it('press / scroll 各自的参数写法', async () => {
    const client = fakeClient()
    registerPreviewClient(client)
    await run({ action: 'press', key: 'ctrl+a' })
    expect(client.send).toHaveBeenLastCalledWith('press', { key: 'ctrl+a' })
    await run({ action: 'scroll', direction: 'bottom' })
    expect(client.send).toHaveBeenLastCalledWith('scroll', { direction: 'bottom' })
    await run({ action: 'scroll', to: 400 })
    expect(client.send).toHaveBeenLastCalledWith('scroll', { to: 400 })
    await run({ action: 'scroll', ref: 3 })
    expect(client.send).toHaveBeenLastCalledWith('scroll', { ref: 3 })
  })

  it('text 定位也能用，记录里写的是那段文字', async () => {
    const client = fakeClient()
    client.state.reply = () => ({ ok: true, action: 'click', target: 'button "确定"' })
    registerPreviewClient(client)
    const result = await run({ action: 'click', text: '确定' })
    expect(client.send).toHaveBeenCalledWith('click', { text: '确定' })
    expect(result.record).toBe('preview：点击 确定 → 完成')
  })
})

describe('console', () => {
  it('统计条数与错误数，并标出来源', async () => {
    const client = fakeClient()
    client.state.entries = [
      { level: 'log', text: '启动完成', at: '10:00', source: '' },
      { level: 'error', text: 'boom', at: '10:01', source: 'main.js:12' },
    ]
    registerPreviewClient(client)
    const result = await run({ action: 'console' })
    expect(result.ok).toBe(true)
    expect(result.text).toContain('共 2 条，其中 1 个错误')
    expect(result.text).toContain('[log] 启动完成')
    expect(result.text).toContain('[error] boom')
    expect(result.text).toContain('← main.js:12')
    expect(result.record).toBe('preview：读取控制台 → 2 条，1 个错误')
  })

  it('控制台空着也如实说', async () => {
    registerPreviewClient(fakeClient())
    const result = await run({ action: 'console' })
    expect(result.text).toContain('控制台是空的')
  })

  it('只列最近 40 条，并说明少列了几条', async () => {
    const client = fakeClient()
    client.state.entries = Array.from({ length: 45 }, (_, index) => ({ level: 'log', text: `第${index}条`, at: '' }))
    registerPreviewClient(client)
    const result = await run({ action: 'console' })
    expect(result.text).toContain('另有 5 条较早的没有列出')
    expect(result.text).toContain('第44条')
    expect(result.text).not.toContain('第0条')
  })
})

describe('back / reload / wait', () => {
  it('没有上一页时不硬来', async () => {
    registerPreviewClient(fakeClient())
    const result = await run({ action: 'back' })
    expect(result.ok).toBe(false)
    expect(result.text).toContain('没有可返回的上一页')
  })

  it('返回后等页面重新就绪才报完成', async () => {
    const client = fakeClient({ path: 'detail.html' })
    client.state.canBack = true
    client.state.back = 'list.html'
    registerPreviewClient(client)
    const result = await settled(run({ action: 'back' }), 700)
    expect(result.ok).toBe(true)
    expect(result.text).toContain('已返回 list.html')
    expect(client.calls).toContain('goBack')
  })

  it('改完文件用 reload 验收新版本', async () => {
    const client = fakeClient()
    registerPreviewClient(client)
    const result = await settled(run({ action: 'reload' }), 700)
    expect(result.ok).toBe(true)
    expect(result.text).toContain('已重新载入 index.html')
    expect(client.calls).toContain('reload')
    expect(result.record).toBe('preview：重新载入 index.html')
  })

  it('reload 之后页面起不来就报失败', async () => {
    const client = fakeClient({ autoReady: false })
    registerPreviewClient(client)
    const result = await settled(run({ action: 'reload' }), 26000)
    expect(result.ok).toBe(false)
    expect(result.text).toContain('没有重新就绪')
  })

  it('wait 缺省 500ms，最多 10 秒', async () => {
    registerPreviewClient(fakeClient())
    expect((await settled(run({ action: 'wait' }), 900)).text).toBe('已等待 500 毫秒')
    expect((await settled(run({ action: 'wait', ms: 99999 }), 11000)).text).toBe('已等待 10000 毫秒')
  })
})

describe('提示词与调度', () => {
  it('开了工作模式才介绍 preview，并给出标准写法', () => {
    const prompt = buildToolPrompt({ workModeEnabled: true })
    expect(prompt).toContain('preview：')
    expect(prompt).toContain('{"tool":"preview","args":{"action":"open","path":"index.html"}}')
    expect(prompt).toContain('页面验收')
    expect(prompt).toContain('可访问性快照')
  })

  it('没开工作模式时一个字都不提', () => {
    const prompt = buildToolPrompt({ workModeEnabled: false })
    expect(prompt).not.toContain('preview')
  })

  it('写错工具名时别名会归一到 preview', () => {
    for (const name of ['preview', 'selftest', 'self_test', 'preview_page']) {
      const calls = extractToolCalls(`\`\`\`tool\n{"tool":"${name}","args":{"action":"read"}}\n\`\`\``)
      expect(calls[0].tool, name).toBe('preview')
    }
    expect(toolUsageHint('preview')).toContain('{"tool":"preview"')
  })

  it('preview 调用一律串行：前后动作有依赖，不能同批并发', () => {
    expect(isParallelSafe({ tool: 'preview', args: { action: 'read' } })).toBe(false)
    const batches = planCallBatches([
      { tool: 'preview', args: { action: 'open', path: 'a.html' } },
      { tool: 'preview', args: { action: 'click', ref: 1 } },
    ])
    expect(batches).toHaveLength(2)
    expect(batches.every(batch => batch.parallel === false)).toBe(true)
  })
})
