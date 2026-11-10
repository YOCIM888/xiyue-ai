// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AUTOMATE_ACTIONS, AUTOMATE_COMMAND, AUTOMATE_COMMAND_REPLY, automateAccessibleName,
  automateIsVisible, automateRoleOf, automateStateOf, collectSnapshot, installAutomation,
  runAutomateAction,
} from '../src/services/previewAutomate'
import { createCommandChannel, normalizeAutomateResult } from '../src/services/previewRuntime'
import { PREVIEW_COMMAND, PREVIEW_COMMAND_REPLY, PREVIEW_REPLY } from '../src/services/previewPaths'

/** 一份典型的登录页：带 label、aria、禁用态、隐藏子树、纯包装层与裸文字 */
const FIXTURE = `
<main id="app">
  <h1>登录</h1>
  <p class="tip">请输入账号信息</p>
  <form id="loginForm">
    <label for="user">用户名</label>
    <input id="user" placeholder="请输入用户名" value="yocim">
    <div class="row"><input id="pass" type="password" aria-label="密码"></div>
    <label><input type="checkbox" id="remember"> 记住我</label>
    <select id="role">
      <option value="admin">管理员</option>
      <option value="user" selected>普通用户</option>
    </select>
    <button type="submit" id="go"><span>登录</span></button>
    <button id="off" disabled>重置</button>
    <a href="next.html">下一页</a>
    <a href="https://example.com/x">外链</a>
  </form>
  <div style="display:none"><button id="ghost">看不见的按钮</button></div>
  <div hidden><button id="ghost2">也不该出现</button></div>
  <div class="pure-wrapper"><div class="inner-wrapper"></div></div>
  <div class="has-text">这里有一句话</div>
  <img src="cat.png" alt="一只橘猫">
</main>`

/** 硬编码 ref 数字太脆：快照一变用例就全红，这里按 id 反查 */
function refOf(state, id) {
  for (const [ref, el] of state.refs) {
    if (el.id === id) return ref
  }
  throw new Error(`快照里没有 #${id}，实际是：\n${[...state.refs.values()].map(el => el.id || el.tagName).join('、')}`)
}

function readFixture(html = FIXTURE) {
  document.body.innerHTML = html
  const state = { refs: new Map() }
  const result = runAutomateAction({ action: 'read' }, state)
  return { state, result }
}

beforeEach(() => {
  document.body.innerHTML = ''
  document.title = ''
})

describe('快照', () => {
  it('按文档顺序给可交互元素编 ref，从 1 开始不跳号', () => {
    const { state, result } = readFixture()
    expect(result.ok).toBe(true)
    expect([...state.refs.keys()]).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(result.refCount).toBe(8)
    expect(state.refs.get(refOf(state, 'go')).textContent.trim()).toBe('登录')
  })

  it('一行一个节点：角色 + 可访问名 + 控件状态，缩进表示层级', () => {
    const { result } = readFixture()
    const lines = result.text.split('\n')
    expect(lines[0]).toBe('main id=app')
    expect(lines).toContain('  heading "登录" level=1')
    expect(lines).toContain('  paragraph "请输入账号信息"')
    expect(lines).toContain('  form id=loginForm')
    expect(lines).toContain('    text "用户名"')
    expect(lines).toContain(`    [${1}] textbox "用户名" id=user placeholder="请输入用户名" value="yocim"`)
    expect(lines).toContain('    [4] combobox "普通用户" id=role')
    expect(lines).toContain('      option "管理员"')
    expect(lines).toContain('      option "普通用户" selected')
    expect(lines).toContain('    [6] button "重置" id=off disabled')
    expect(lines).toContain('    [7] link "下一页" href=next.html')
    expect(lines).toContain('  image "一只橘猫" src=cat.png')
  })

  it('链接只报原始 href：a.href 在 about:srcdoc 下解析出来的是宿主地址', () => {
    const { result } = readFixture()
    expect(result.text).toContain('href=https://example.com/x')
    expect(result.text).not.toContain('about:srcdoc')
  })

  it('纯包装层不占行，带文字的容器占一行', () => {
    const { result } = readFixture()
    expect(result.text).not.toContain('pure-wrapper')
    expect(result.text).not.toContain('inner-wrapper')
    expect(result.text).toContain('  text "这里有一句话"')
  })

  it('看不见的子树整棵跳过：模型照着点不动的元素，只会以为是自己写错了', () => {
    const { result } = readFixture()
    expect(result.text).not.toContain('ghost')
    expect(result.text).not.toContain('看不见的按钮')
    expect(result.text).not.toContain('也不该出现')
  })

  it('可访问名的优先级：aria-label > label[for] > 包裹的 label > alt/placeholder > 自身文字', () => {
    document.body.innerHTML = `
      <input id="a" aria-label="甲" placeholder="占位">
      <label for="b">乙</label><input id="b" placeholder="占位">
      <label>丙<input type="checkbox" id="c"></label>
      <img id="d" alt="丁" src="d.png">
      <input id="e" placeholder="戊">
      <button id="f"><span>己</span></button>`
    const byId = id => automateAccessibleName(document.getElementById(id))
    expect(byId('a')).toBe('甲')
    expect(byId('b')).toBe('乙')
    expect(byId('c')).toBe('丙')
    expect(byId('d')).toBe('丁')
    expect(byId('e')).toBe('戊')
    expect(byId('f')).toBe('己')
  })

  it('容器只报自己的直接文字，不会把整棵子树抄一遍', () => {
    document.body.innerHTML = '<section aria-label="分区"><ul><li>一</li><li>二</li></ul></section>'
    const { text } = collectSnapshot(document.body)
    expect(text.split('\n')[0]).toBe('region "分区"')
    expect(text).toContain('list')
    expect(text).toContain('listitem "一"')
    expect(text).not.toContain('region "分区 一 二"')
  })

  it('角色按标签与 input type 推导，显式 role 优先', () => {
    document.body.innerHTML = `
      <input id="a" type="checkbox"><input id="b" type="radio"><input id="c" type="search">
      <input id="d" type="hidden"><input id="e"><div id="f" role="tab">页签</div>`
    const role = id => automateRoleOf(document.getElementById(id))
    expect(role('a')).toBe('checkbox')
    expect(role('b')).toBe('radio')
    expect(role('c')).toBe('searchbox')
    expect(role('d')).toBe('')
    expect(role('e')).toBe('textbox')
    expect(role('f')).toBe('tab')
  })

  it('hidden 的 input 拿不到 ref，带 tabindex 或 onclick 的 div 能拿到', () => {
    document.body.innerHTML = `
      <input type="hidden" id="a" value="x">
      <div id="b" tabindex="0">可聚焦</div>
      <div id="c" onclick="void 0">内联处理器</div>
      <div id="d">点不了</div>`
    const { refs } = collectSnapshot(document.body)
    const ids = [...refs.values()].map(el => el.id)
    expect(ids).toEqual(['b', 'c'])
  })

  it('状态里带 checked / disabled / readonly 与选中文本', () => {
    document.body.innerHTML = `
      <input type="checkbox" id="a" checked>
      <textarea id="b" readonly>草稿</textarea>
      <select id="c"><option>甲</option><option selected>乙</option></select>`
    expect(automateStateOf(document.getElementById('a'))).toEqual(['id=a', 'type=checkbox', 'checked'])
    expect(automateStateOf(document.getElementById('b'))).toEqual(['id=b', 'value="草稿"', 'readonly'])
    expect(automateStateOf(document.getElementById('c'))).toEqual(['id=c'])
  })

  it('display:none / visibility:hidden / hidden 属性都算看不见', () => {
    document.body.innerHTML = `
      <div id="a" style="display:none">A</div>
      <div id="b" style="visibility:hidden">B</div>
      <div id="c" hidden>C</div>
      <div id="d">D</div>`
    expect(automateIsVisible(document.getElementById('a'))).toBe(false)
    expect(automateIsVisible(document.getElementById('b'))).toBe(false)
    expect(automateIsVisible(document.getElementById('c'))).toBe(false)
    expect(automateIsVisible(document.getElementById('d'))).toBe(true)
  })

  it('行数封顶，超出的部分明说被截断了，不静默丢', () => {
    document.body.innerHTML = Array.from({ length: 400 }, (_, i) => `<p>第 ${i} 段</p>`).join('')
    const snapshot = collectSnapshot(document.body)
    expect(snapshot.lines).toBe(260)
    expect(snapshot.truncated).toBe(true)
    expect(snapshot.text.split('\n')).toHaveLength(260)
    expect(snapshot.text).not.toContain('第 300 段')
  })

  it('空页面给出明确说明，而不是回一个空串让模型猜', () => {
    document.body.innerHTML = ''
    const state = { refs: new Map() }
    const result = runAutomateAction({ action: 'read' }, state)
    expect(result.ok).toBe(true)
    expect(result.text).toBe('（页面里没有可见内容）')
    expect(result.refCount).toBe(0)
  })

  it('附带页面事实：标题、视口尺寸与滚动位置 —— 截不了图，这些是模型判断布局的唯一依据', () => {
    document.title = '登录页'
    const { result } = readFixture()
    expect(result.title).toBe('登录页')
    expect(result.viewport).toBe(`${window.innerWidth}x${window.innerHeight}`)
    expect(result.scrollY).toBe(0)
    expect(result.action).toBe('read')
  })

  it('可以只读一个子树，第一行是被读的那个元素', () => {
    readFixture()
    const state = { refs: new Map() }
    const scoped = runAutomateAction({ action: 'read', selector: '#loginForm' }, state)
    expect(scoped.ok).toBe(true)
    expect(scoped.scope).toBe('form id=loginForm')
    expect(scoped.text.split('\n')[0]).toBe('form id=loginForm')
    expect(scoped.text).toContain('button "登录"')
    // 表单外面的东西不该混进来：标题、图片都在 main 里而不在 form 里
    expect(scoped.text).not.toContain('heading "登录"')
    expect(scoped.text).not.toContain('一只橘猫')
    expect(scoped.refCount).toBe(8)
  })
})

describe('click', () => {
  it('派发完整的指针序列并冒泡：只发 click 的话，绑在 pointerdown 上的处理器收不到', () => {
    const { state } = readFixture()
    const seen = []
    const el = document.getElementById('go')
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
      el.addEventListener(type, () => seen.push(type))
    }
    document.body.addEventListener('click', () => seen.push('bubbled'))
    const result = runAutomateAction({ action: 'click', ref: refOf(state, 'go') }, state)
    expect(result.ok).toBe(true)
    expect(result.target).toBe(`[${refOf(state, 'go')}] button "登录" id=go`)
    expect(seen).toEqual(['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click', 'bubbled'])
  })

  it('链接点击会走到宿主的导航拦截，页内跳转因此可用', () => {
    const { state } = readFixture()
    let prevented = false
    let href = ''
    document.addEventListener('click', (event) => {
      const link = event.target?.closest?.('a[href]')
      if (!link) return
      href = link.getAttribute('href')
      event.preventDefault()
      prevented = true
    }, true)
    runAutomateAction({ action: 'click', ref: refOf(state, 'go') }, state)
    const linkRefs = [...state.refs.entries()].filter(([, el]) => el.tagName === 'A')
    runAutomateAction({ action: 'click', ref: linkRefs[0][0] }, state)
    expect(prevented).toBe(true)
    expect(href).toBe('next.html')
  })

  it('禁用元素直接拒绝，别假装点过了', () => {
    const { state } = readFixture()
    const result = runAutomateAction({ action: 'click', ref: refOf(state, 'off') }, state)
    expect(result.ok).toBe(false)
    expect(result.message).toContain('禁用')
  })

  it('页面重渲染后旧 ref 指向脱离文档的节点：说清楚要重新 read', () => {
    const { state } = readFixture()
    const ref = refOf(state, 'go')
    document.getElementById('go').remove()
    const result = runAutomateAction({ action: 'click', ref }, state)
    expect(result.ok).toBe(false)
    expect(result.message).toContain('重新 read')
  })

  it('没有 ref 时给出可执行的下一步，而不是笼统的「失败」', () => {
    const state = { refs: new Map() }
    expect(runAutomateAction({ action: 'click', ref: 99 }, state).message).toContain('先 read')
    expect(runAutomateAction({ action: 'click' }, state).message).toContain('ref / selector / text')
  })

  it('selector 与 text 也能定位，和 browser 工具一套写法', () => {
    const { state } = readFixture()
    expect(runAutomateAction({ action: 'click', selector: '#go' }, state).ok).toBe(true)
    const byText = runAutomateAction({ action: 'click', text: '登录' }, state)
    expect(byText.ok).toBe(true)
    expect(byText.target).toContain('button "登录"')
    expect(runAutomateAction({ action: 'click', selector: '#nope' }, state).message).toContain('找不到')
    expect(runAutomateAction({ action: 'click', text: '不存在的按钮' }, state).message).toContain('找不到')
  })

  it('按文字找不到可交互元素时，不会退化成点一个纯文本节点', () => {
    const { state } = readFixture()
    const result = runAutomateAction({ action: 'click', text: '这里有一句话' }, state)
    expect(result.ok).toBe(false)
  })
})

describe('type', () => {
  it('走原型上的原生 setter 并派发 input + change：直接赋值会被 React 的值追踪器丢掉', () => {
    const { state } = readFixture()
    const el = document.getElementById('user')
    const seen = []
    el.addEventListener('input', event => seen.push(`input:${event.target.value}`))
    el.addEventListener('change', event => seen.push(`change:${event.target.value}`))
    const result = runAutomateAction({ action: 'type', ref: refOf(state, 'user'), text: '新名字' }, state)
    expect(result.ok).toBe(true)
    expect(el.value).toBe('新名字')
    expect(seen).toEqual(['input:新名字', 'change:新名字'])
    expect(document.activeElement.id).toBe('user')
  })

  it('下拉框按选项文字或 value 选，选不到就把可选项列出来', () => {
    const { state } = readFixture()
    const el = document.getElementById('role')
    expect(runAutomateAction({ action: 'type', ref: refOf(state, 'role'), text: '管理员' }, state).ok).toBe(true)
    expect(el.value).toBe('admin')
    expect(runAutomateAction({ action: 'type', ref: refOf(state, 'role'), text: 'user' }, state).ok).toBe(true)
    expect(el.value).toBe('user')
    const miss = runAutomateAction({ action: 'type', ref: refOf(state, 'role'), text: '超级管理员' }, state)
    expect(miss.ok).toBe(false)
    expect(miss.message).toContain('可选：管理员、普通用户')
  })

  it('勾选框按真假值切换，本来就是目标状态时说清楚没有改动', () => {
    const { state } = readFixture()
    const el = document.getElementById('remember')
    expect(runAutomateAction({ action: 'type', ref: refOf(state, 'remember'), text: 'true' }, state).ok).toBe(true)
    expect(el.checked).toBe(true)
    expect(runAutomateAction({ action: 'type', ref: refOf(state, 'remember'), text: 'false' }, state).ok).toBe(true)
    expect(el.checked).toBe(false)
    const again = runAutomateAction({ action: 'type', ref: refOf(state, 'remember'), text: '' }, state)
    expect(again.ok).toBe(true)
    expect(again.message).toContain('已经是未选中')
  })

  it('不是输入框就拒绝，文件框也拒绝：预览里没有真实文件可传', () => {
    const { state } = readFixture()
    const heading = runAutomateAction({ action: 'type', selector: 'h1', text: 'x' }, state)
    expect(heading.ok).toBe(false)
    expect(heading.message).toContain('不是输入框')
    document.body.innerHTML = '<input type="file" id="f">'
    const fresh = { refs: new Map() }
    runAutomateAction({ action: 'read' }, fresh)
    const file = runAutomateAction({ action: 'type', ref: refOf(fresh, 'f'), text: 'a.png' }, fresh)
    expect(file.ok).toBe(false)
    expect(file.message).toContain('文件输入框')
  })

  it('textarea 同样能填', () => {
    document.body.innerHTML = '<textarea id="t"></textarea>'
    const state = { refs: new Map() }
    runAutomateAction({ action: 'read' }, state)
    const result = runAutomateAction({ action: 'type', ref: refOf(state, 't'), text: '一段话' }, state)
    expect(result.ok).toBe(true)
    expect(document.getElementById('t').value).toBe('一段话')
  })
})

describe('press', () => {
  it('带修饰键的组合键落到当前焦点元素上', () => {
    const { state } = readFixture()
    const el = document.getElementById('user')
    el.focus()
    const seen = []
    el.addEventListener('keydown', event => seen.push([event.type, event.key, event.code, event.ctrlKey]))
    el.addEventListener('keyup', event => seen.push([event.type, event.key]))
    const result = runAutomateAction({ action: 'press', key: 'ctrl+a' }, state)
    expect(result.ok).toBe(true)
    expect(result.message).toContain('input')
    expect(seen).toEqual([['keydown', 'a', 'KeyA', true], ['keyup', 'a']])
  })

  it('缺 key 或写法不对就拒绝', () => {
    const state = { refs: new Map() }
    expect(runAutomateAction({ action: 'press' }, state).ok).toBe(false)
    expect(runAutomateAction({ action: 'press', key: 'ctrl+' }, state).message).toContain('按键写法不对')
  })

  it('结果里说清合成事件不会触发默认行为，别让模型以为按 Enter 就提交了', () => {
    const { state } = readFixture()
    let submitted = false
    document.getElementById('loginForm').addEventListener('submit', () => { submitted = true })
    document.getElementById('go').focus()
    runAutomateAction({ action: 'press', key: 'Enter' }, state)
    expect(submitted).toBe(false)
  })
})

describe('scroll', () => {
  it('支持方向与绝对位置，方向写错了要说清支持哪些', () => {
    const { state } = readFixture()
    expect(runAutomateAction({ action: 'scroll', to: 200 }, state).message).toContain('已滚到 200px')
    expect(runAutomateAction({ action: 'scroll', direction: 'down' }, state).ok).toBe(true)
    expect(runAutomateAction({ action: 'scroll', direction: 'top' }, state).ok).toBe(true)
    const bad = runAutomateAction({ action: 'scroll', direction: 'sideways' }, state)
    expect(bad.ok).toBe(false)
    expect(bad.message).toContain('up / down / top / bottom')
  })

  it('给了 ref 就滚到那个元素，找不到时和 click 一样的说法', () => {
    const { state } = readFixture()
    const result = runAutomateAction({ action: 'scroll', ref: refOf(state, 'go') }, state)
    expect(result.ok).toBe(true)
    expect(result.message).toContain('已滚到')
    expect(runAutomateAction({ action: 'scroll', ref: 4242 }, state).message).toContain('先 read')
  })
})

describe('不支持的动作', () => {
  it('截图在 opaque origin 下做不到，直接说清用什么代替', () => {
    const state = { refs: new Map() }
    const result = runAutomateAction({ action: 'screenshot' }, state)
    expect(result.ok).toBe(false)
    expect(result.message).toContain(`不支持 screenshot`)
    expect(result.message).toContain(AUTOMATE_ACTIONS.join(' / '))
  })

  it('动作词表和 browserAgent 那套对齐，模型不用学第二种协议', () => {
    expect(AUTOMATE_ACTIONS).toEqual(['ping', 'read', 'click', 'type', 'press', 'scroll'])
  })
})

// ---- 消息回路 ----

const replies = []
const notes = []
let installed = false

/** happy-dom 里 window.parent 就是 window，指令与应答都在同一个窗口上收发 */
function ensureInstalled() {
  if (installed) return
  installed = true
  installAutomation({ report: entry => notes.push(entry) })
  window.addEventListener('message', (event) => {
    if (event.data?.type === PREVIEW_COMMAND_REPLY) replies.push(event.data)
  })
}

async function sendCommand(payload) {
  ensureInstalled()
  const seen = replies.length
  // happy-dom 的 window.postMessage 会把 source 设成别的对象，而真浏览器里父页发来的消息
  // source 就是父窗口 —— 这里手动派发，才是「来自宿主」的那条消息
  window.dispatchEvent(new MessageEvent('message', { data: { type: PREVIEW_COMMAND, ...payload }, source: window }))
  for (let attempt = 0; attempt < 80; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 5))
    const hit = replies.slice(seen).find(item => item.id === payload.id)
    if (hit) return hit
  }
  throw new Error(`指令 ${payload.action} 没有应答`)
}

describe('指令回路', () => {
  it('两份消息常量的取值必须一致，且不能和 fetch 应答共用一条通道', () => {
    expect(AUTOMATE_COMMAND).toBe(PREVIEW_COMMAND)
    expect(AUTOMATE_COMMAND_REPLY).toBe(PREVIEW_COMMAND_REPLY)
    // boot 用 PREVIEW_REPLY + 自增 id 给 fetch 配对，指令应答混进去会被当成某个 fetch 的结果吃掉
    expect(AUTOMATE_COMMAND_REPLY).not.toBe(PREVIEW_REPLY)
  })

  it('收到指令就应答，id 原样带回；ping 不往控制台里写', async () => {
    document.body.innerHTML = FIXTURE
    const reply = await sendCommand({ id: 1, action: 'ping' })
    expect(reply.ok).toBe(true)
    expect(reply.ready).toBe(true)
    expect(notes).toEqual([])
  })

  it('read 之后 click：整条自测链在一次安装里跑通，每步都在控制台留痕', async () => {
    document.body.innerHTML = FIXTURE
    let clicked = false
    document.getElementById('go').addEventListener('click', () => { clicked = true })

    const read = await sendCommand({ id: 2, action: 'read' })
    expect(read.ok).toBe(true)
    expect(read.text).toContain('button "登录"')
    const ref = Number(/\[(\d+)\] button "登录"/.exec(read.text)?.[1])
    expect(ref).toBeGreaterThan(0)

    const click = await sendCommand({ id: 3, action: 'click', ref })
    expect(click.ok).toBe(true)
    expect(clicked).toBe(true)
    expect(notes.map(item => item.text)).toEqual([
      '自测 read：完成',
      `自测 click：已点击 [${ref}] button "登录" id=go`,
    ])
    expect(notes.every(item => item.kind === 'log' && item.level === 'info')).toBe(true)
  })

  it('动作抛异常也要应答，并把错误说清楚：否则宿主只能等到超时', async () => {
    document.body.innerHTML = FIXTURE
    const reply = await sendCommand({ id: 4, action: 'click', selector: '[[[' })
    expect(reply.ok).toBe(false)
    expect(reply.message).toContain('选择器无效')
    expect(notes.at(-1)).toMatchObject({ level: 'warn' })
  })

  it('不认识的动作同样应答，不会因为没人回而卡住工具链', async () => {
    const reply = await sendCommand({ id: 5, action: 'teleport' })
    expect(reply.ok).toBe(false)
    expect(reply.message).toContain('不支持 teleport')
  })
})

// ---- 宿主侧指令通道 ----

function fakeFrame() {
  const contentWindow = { postMessage: vi.fn() }
  return { contentWindow }
}

function dispatchReply(source, data) {
  window.dispatchEvent(new MessageEvent('message', { data, source }))
}

describe('createCommandChannel', () => {
  it('按 id 认领应答，只认当前 iframe 发来的消息', async () => {
    const frame = fakeFrame()
    const channel = createCommandChannel({ getFrame: () => frame, timeout: 1000 })
    const promise = channel.send('read')
    expect(frame.contentWindow.postMessage).toHaveBeenCalledWith(
      { type: PREVIEW_COMMAND, id: 1, action: 'read' },
      '*'
    )
    // 别的窗口（例如同时开着的第二个预览）发来的同 id 应答不能认领
    dispatchReply({}, { type: PREVIEW_COMMAND_REPLY, id: 1, ok: true, action: 'read', text: '别人的' })
    dispatchReply(frame.contentWindow, { type: PREVIEW_COMMAND_REPLY, id: 1, ok: true, action: 'read', text: '[1] button "登录"' })
    const result = await promise
    expect(result.text).toBe('[1] button "登录"')
    expect(result).toEqual(normalizeAutomateResult(result))
    channel.destroy()
  })

  it('超时不是异常，是一次可读的失败：页面可能正卡在死循环里', async () => {
    const frame = fakeFrame()
    const channel = createCommandChannel({ getFrame: () => frame, timeout: 1000 })
    const result = await channel.send('click', { ref: 1 })
    expect(result.ok).toBe(false)
    expect(result.message).toContain('1 秒内没有应答 click')
    channel.destroy()
  })

  it('预览窗口没打开时立刻失败，不去等一个永远不来的应答', async () => {
    const channel = createCommandChannel({ getFrame: () => null })
    const result = await channel.send('read')
    expect(result.ok).toBe(false)
    expect(result.message).toContain('预览窗口没打开')
    channel.destroy()
  })

  it('销毁时把还挂着的调用放掉：抽屉关掉不该让工具一直等着', async () => {
    const frame = fakeFrame()
    const channel = createCommandChannel({ getFrame: () => frame, timeout: 30000 })
    const promise = channel.send('read')
    channel.destroy()
    const result = await promise
    expect(result.ok).toBe(false)
    expect(result.message).toContain('预览窗口已关闭')
  })

  it('指令 id 自增，和 fetch 桥的 id 各走各的通道', async () => {
    const frame = fakeFrame()
    const channel = createCommandChannel({ getFrame: () => frame, timeout: 1000 })
    channel.send('ping')
    channel.send('read')
    const ids = frame.contentWindow.postMessage.mock.calls.map(call => call[0].id)
    expect(ids).toEqual([1, 2])
    expect(frame.contentWindow.postMessage.mock.calls.every(call => call[0].type === PREVIEW_COMMAND)).toBe(true)
    channel.destroy()
  })
})
