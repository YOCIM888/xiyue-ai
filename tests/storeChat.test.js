// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { kvStore, resetKv } from './helpers/kvMemory.js'

vi.mock('../src/utils/kv', async () => (await import('./helpers/kvMemory.js')).kvMock)

const api = vi.hoisted(() => ({ sendChatRequest: vi.fn(), calls: [] }))
const links = vi.hoisted(() => ({ attachLinkContext: vi.fn(), appendContextToLastUser: vi.fn() }))
const search = vi.hoisted(() => ({
  searchWeb: vi.fn(), buildSearchContext: vi.fn(), buildSearchFallbackText: vi.fn(),
  detectSearchIntent: vi.fn(), detectSearchReply: vi.fn(),
}))
const query = vi.hoisted(() => ({ buildSearchQuery: vi.fn(), detectTimeRange: vi.fn() }))
const usage = vi.hoisted(() => ({ recordUsage: vi.fn() }))
const image = vi.hoisted(() => ({ detectImageIntent: vi.fn(), generateImage: vi.fn() }))
const ocr = vi.hoisted(() => ({
  detectVisionSupport: vi.fn(), isVisionUnsupportedError: vi.fn(), prepareOcrImages: vi.fn(),
  OCR_INSTRUCTION: '【OCR】请把图片里的文字读出来', OCR_MAX_IMAGES: 3,
}))
const mem = vi.hoisted(() => ({ detectMemoryCommand: vi.fn(), extractMemoryEntries: vi.fn() }))
const memCtx = vi.hoisted(() => ({ buildMainChatMemoryContext: vi.fn() }))
const activity = vi.hoisted(() => ({ beginWorkspaceTask: vi.fn() }))
const preflight = vi.hoisted(() => ({ refreshPreflightContext: vi.fn(), getPreflightContext: vi.fn() }))
const exporter = vi.hoisted(() => ({ exportConversation: vi.fn(), printConversation: vi.fn() }))
const tools = vi.hoisted(() => ({ executeToolCall: vi.fn() }))

vi.mock('../src/services/api.js', () => api)
vi.mock('../src/services/linkReader.js', () => links)
vi.mock('../src/services/webSearch.js', () => search)
vi.mock('../src/services/searchQuery.js', () => query)
vi.mock('../src/services/usageStats.js', () => usage)
vi.mock('../src/services/imageGen.js', () => image)
vi.mock('../src/services/ocr.js', () => ocr)
vi.mock('../src/services/memory.js', () => mem)
vi.mock('../src/utils/memoryContext.js', () => memCtx)
vi.mock('../src/services/workspaceActivity.js', () => activity)
vi.mock('../src/services/preflight.js', () => preflight)
vi.mock('../src/services/conversationExport.js', () => exporter)
// 工具协议（解析、分批、预算、归档）保持真的，只把「执行」这一步换成可控桩
vi.mock('../src/services/tools.js', async (importOriginal) => ({
  ...(await importOriginal()),
  executeToolCall: tools.executeToolCall,
}))

const { useChatStore } = await import('../src/stores/chat.js')
const { useTopicsStore } = await import('../src/stores/topics.js')
const { useSettingsStore } = await import('../src/stores/settings.js')
const { useMemoryStore } = await import('../src/stores/memory.js')
const { conversationKey } = await import('../src/utils/conversation.js')
const systemPromptRaw = (await import('../public/prompt/system.md?raw')).default

/** 工具围栏要真的写出来才能被解析：一个围栏一个 JSON，多个调用就是多个围栏 */
const FENCE = '```'
const toolBlock = (...lines) => lines.map(line => `${FENCE}tool\n${line}\n${FENCE}`).join('\n')

const seedSettings = (extra = {}) => kvStore.set('ai_chat_settings', JSON.stringify({
  userPersona: '',
  secondaryApiBase: 'https://open.bigmodel.cn/api/paas/v4',
  skillsAllOnV1: true,
  apiKey: 'sk-test',
  apiBase: 'https://api.test/v1',
  model: 'test-model',
  ...extra,
}))

const archived = topicId => JSON.parse(kvStore.get(conversationKey(topicId)) || 'null')

/** 剧本里的一项：字符串当正文，或 { text, thinking, usage, error }，也可以是拿到 payload 再决定的函数 */
async function playScript(payload, item) {
  api.calls.push(payload)
  const spec = typeof item === 'function' ? item(payload) : item
  const options = spec && typeof spec === 'object' ? spec : {}
  if (options.error) throw options.error
  if (options.thinking) payload.onChunk?.({ type: 'thinking', text: options.thinking })
  const text = typeof spec === 'string' ? spec : String(options.text ?? '')
  for (const chunk of text.match(/[\s\S]{1,8}/g) || []) payload.onChunk?.({ type: 'content', text: chunk })
  return options.usage ?? null
}

/** 按顺序回放请求剧本；剧本用完之后返回空正文（比如自动起标题那一次） */
function script(...items) {
  api.calls.length = 0
  api.sendChatRequest.mockReset()
  let index = 0
  api.sendChatRequest.mockImplementation(async (payload) => {
    const item = index < items.length ? items[index] : { text: '' }
    index += 1
    return playScript(payload, item)
  })
}

const flush = async (times = 4) => {
  for (let i = 0; i < times; i += 1) await new Promise(resolve => setTimeout(resolve, 0))
}

const TITLE_PROMPT = '请用 3~8 个字概括'
/** 首轮结束后会后台补一次「自动起标题」请求，它不属于对话轮次，数轮次前先滤掉 */
const chatCalls = () => api.calls.filter(call => !String(call.messages?.[0]?.content ?? '').includes(TITLE_PROMPT))

/** 本轮没有可见文字时 trace 就是 parts[0]，按类型找比按下标找稳 */
const traceOf = message => message.parts.find(part => part.type === 'trace')

let toasts

function defaults() {
  links.attachLinkContext.mockImplementation(async messages => messages)
  // 只往最后一条用户消息里塞上下文，和真实现一致
  links.appendContextToLastUser.mockImplementation((messages, text) => {
    let target = -1
    messages.forEach((message, index) => { if (message.role === 'user') target = index })
    return messages.map((message, index) => (index === target ? { ...message, content: `${message.content}\n\n${text}` } : message))
  })
  search.detectSearchIntent.mockReturnValue('')
  search.detectSearchReply.mockReturnValue('')
  search.buildSearchFallbackText.mockReturnValue('')
  search.searchWeb.mockResolvedValue({ ok: true, results: [] })
  search.buildSearchContext.mockReturnValue({ text: '【搜索结果】\n1. 一条结果', truncated: false, maxChars: 100 })
  query.buildSearchQuery.mockImplementation(text => String(text || '').trim())
  query.detectTimeRange.mockReturnValue(undefined)
  image.detectImageIntent.mockReturnValue('')
  image.generateImage.mockResolvedValue({ ok: true, dataUrl: 'data:image/png;base64,AAA' })
  ocr.detectVisionSupport.mockReturnValue('vision')
  ocr.isVisionUnsupportedError.mockImplementation(message => String(message || '').includes('不支持图片'))
  ocr.prepareOcrImages.mockImplementation(async images => ({ images, dropped: 0 }))
  mem.detectMemoryCommand.mockReturnValue(false)
  mem.extractMemoryEntries.mockResolvedValue([])
  memCtx.buildMainChatMemoryContext.mockReturnValue('')
  preflight.refreshPreflightContext.mockResolvedValue(undefined)
  preflight.getPreflightContext.mockReturnValue('')
  tools.executeToolCall.mockResolvedValue({ ok: true, text: '工具跑完了', record: '完成' })
}

beforeEach(() => {
  vi.clearAllMocks()
  resetKv()
  defaults()
  toasts = []
  window.__ui = { showToast: (...args) => toasts.push(args) }
  seedSettings()
  setActivePinia(createPinia())
  script({ text: '好的，这是回答。' })
})

/** 建一个话题并把它设成当前会话，返回 store 与 topicId */
function setup(title = '会话') {
  const topics = useTopicsStore()
  const topic = topics.createTopic(title)
  const store = useChatStore()
  store.loadMessages(topic.id)
  return { store, topics, topicId: topic.id, settings: useSettingsStore(), memory: useMemoryStore() }
}

/** 直接往存档里塞一份会话，用来造多消息、多分支的现场 */
function seedConversation(topicId, messages, extra = {}) {
  kvStore.set(conversationKey(topicId), JSON.stringify({
    version: 2,
    activeBranchId: 'b-main',
    nextBranchNo: 2,
    branches: [{ id: 'b-main', name: '主线', parentId: null, forkOf: null, createdAt: 1, messages }],
    ...extra,
  }))
}

const msg = (role, content, extra = {}) => ({ id: `${role}-${Math.random().toString(36).slice(2)}`, role, content, ts: 1, ...extra })

describe('会话装载与保存', () => {
  it('没有话题时给一份空的 b-main 会话', () => {
    const store = useChatStore()
    store.loadMessages(null)
    expect(store.messages).toEqual([])
    expect(store.activeBranchId).toBe('b-main')
    expect(store.branches).toHaveLength(1)
  })

  it('装载存档里的分支与消息，并选中存档里的那个分支', () => {
    const { store, topicId } = setup()
    seedConversation(topicId, [msg('user', '你好'), msg('assistant', '在的')], { activeBranchId: 'b-main' })
    store.loadMessages(topicId)
    expect(store.messages.map(m => m.content)).toEqual(['你好', '在的'])
    expect(store.activeBranchId).toBe('b-main')
  })

  it('存档里的 activeBranchId 已经不存在时退回第一个分支', () => {
    const { store, topicId } = setup()
    seedConversation(topicId, [msg('user', '你好')], { activeBranchId: 'b-没了' })
    store.loadMessages(topicId)
    expect(store.activeBranchId).toBe('b-main')
  })

  it('旧键 chat_messages_ 会被迁移成 v2，旧键保留可回退', () => {
    const { store, topicId } = setup()
    kvStore.set(`chat_messages_${topicId}`, JSON.stringify([{ role: 'user', content: '老数据' }, { role: 'assistant', content: '老回答' }]))
    store.loadMessages(topicId)
    expect(store.messages.map(m => m.content)).toEqual(['老数据', '老回答'])
    // 迁移用的是确定性 id，搜索跳转与迁移后读到的是同一条
    expect(store.messages[0].id).toBe(`legacy-${topicId}-0`)
    expect(archived(topicId).branches[0].messages).toHaveLength(2)
    expect(kvStore.has(`chat_messages_${topicId}`)).toBe(true)
  })

  it('已经有 v2 存档时不再动旧键', () => {
    const { store, topicId } = setup()
    seedConversation(topicId, [msg('user', '新数据')])
    kvStore.set(`chat_messages_${topicId}`, JSON.stringify([{ role: 'user', content: '老数据' }]))
    store.loadMessages(topicId)
    expect(store.messages.map(m => m.content)).toEqual(['新数据'])
  })

  it('流式占位消息不会写进存档', async () => {
    const { store, topicId } = setup()
    let duringRequest = null
    script(() => {
      duringRequest = archived(topicId)
      return { text: '好的' }
    })
    await store.sendMessage('你好')
    expect(duringRequest.branches[0].messages).toHaveLength(1)
    expect(duringRequest.branches[0].messages[0].role).toBe('user')
    expect(archived(topicId).branches[0].messages).toHaveLength(2)
    expect(archived(topicId).branches[0].messages.some(m => m.streaming)).toBe(false)
  })

  it('switchBranch 只认存在的分支，切过去会落盘', () => {
    const { store, topicId } = setup()
    seedConversation(topicId, [msg('user', '主线')], {
      branches: [
        { id: 'b-main', name: '主线', parentId: null, forkOf: null, createdAt: 1, messages: [msg('user', '主线')] },
        { id: 'b-2', name: '分支 2', parentId: 'b-main', forkOf: null, createdAt: 2, messages: [msg('user', '分支')] },
      ],
      nextBranchNo: 3,
    })
    store.loadMessages(topicId)
    store.switchBranch('b-不存在的')
    expect(store.activeBranchId).toBe('b-main')
    store.switchBranch('b-2')
    expect(store.activeBranchId).toBe('b-2')
    expect(store.messages.map(m => m.content)).toEqual(['分支'])
    expect(archived(topicId).activeBranchId).toBe('b-2')
  })

  it('clearMessages 重置成空会话并写回存档', () => {
    const { store, topicId } = setup()
    seedConversation(topicId, [msg('user', '要清掉的')])
    store.loadMessages(topicId)
    store.clearMessages()
    expect(store.messages).toEqual([])
    expect(store.activeBranchId).toBe('b-main')
    expect(archived(topicId).branches[0].messages).toEqual([])
  })
})

describe('消息树编辑', () => {
  it('deleteMessage 支持消息 id 与下标，越界不动', () => {
    const { store, topicId } = setup()
    const a = msg('user', 'a')
    const b = msg('assistant', 'b')
    const c = msg('user', 'c')
    seedConversation(topicId, [a, b, c])
    store.loadMessages(topicId)
    store.deleteMessage(b.id)
    expect(store.messages.map(m => m.content)).toEqual(['a', 'c'])
    store.deleteMessage(0)
    expect(store.messages.map(m => m.content)).toEqual(['c'])
    store.deleteMessage(99)
    store.deleteMessage(-1)
    expect(store.messages).toHaveLength(1)
    expect(archived(topicId).branches[0].messages).toHaveLength(1)
  })

  it('setVersion 切回旧版本，下标越界会夹到两端', () => {
    const { store, topicId } = setup()
    const versions = [{ content: '第一版', thinking: '想过' }, { content: '第二版', thinking: undefined }]
    const target = msg('assistant', '第二版', { versions, activeVersion: 1 })
    seedConversation(topicId, [msg('user', '问'), target])
    store.loadMessages(topicId)
    const id = store.messages[1].id
    store.setVersion(id, 0)
    expect(store.messages[1].content).toBe('第一版')
    expect(store.messages[1].thinking).toBe('想过')
    expect(store.messages[1].activeVersion).toBe(0)
    store.setVersion(id, 99)
    expect(store.messages[1].activeVersion).toBe(1)
    store.setVersion(id, -5)
    expect(store.messages[1].activeVersion).toBe(0)
    expect(archived(topicId).branches[0].messages[1].activeVersion).toBe(0)
  })

  it('setVersion 对没有版本的消息不做任何事', () => {
    const { store, topicId } = setup()
    const plain = msg('assistant', '只有一个版本')
    seedConversation(topicId, [msg('user', '问'), plain])
    store.loadMessages(topicId)
    store.setVersion(store.messages[1].id, 1)
    expect(store.messages[1].content).toBe('只有一个版本')
    expect(store.messages[1].activeVersion).toBeUndefined()
  })

  it('branchFromMessage 派生新分支：只复制到那一条，父分支不动', () => {
    const { store, topicId } = setup()
    const a = msg('user', '第一问')
    const b = msg('assistant', '第一答')
    const c = msg('user', '第二问')
    seedConversation(topicId, [a, b, c])
    store.loadMessages(topicId)
    store.branchFromMessage(b.id)
    expect(store.branches).toHaveLength(2)
    const fork = store.activeBranch
    expect(fork.id).not.toBe('b-main')
    expect(fork.name).toBe('分支 2')
    expect(fork.parentId).toBe('b-main')
    expect(fork.forkOf).toBe(b.id)
    expect(fork.messages.map(m => m.content)).toEqual(['第一问', '第一答'])
    // 派生出来的消息是新 id，最后一条记住来源
    expect(fork.messages[1].id).not.toBe(b.id)
    expect(fork.messages[1].forkedFrom).toBe(b.id)
    expect(store.branches[0].messages).toHaveLength(3)
    expect(toasts[0][0]).toContain('已创建「分支 2」')
    expect(archived(topicId).branches).toHaveLength(2)
  })

  it('连续派生两个分支，编号接着往上走', () => {
    const { store, topicId } = setup()
    const a = msg('user', '问')
    seedConversation(topicId, [a])
    store.loadMessages(topicId)
    store.branchFromMessage(a.id)
    store.switchBranch('b-main')
    store.branchFromMessage(a.id)
    expect(store.branches.map(b => b.name)).toEqual(['主线', '分支 2', '分支 3'])
  })

  it('branchFromMessage 找不到消息时只提示，不建分支', () => {
    const { store } = setup()
    store.branchFromMessage('不存在的 id')
    expect(store.branches).toHaveLength(1)
    expect(toasts[0]).toEqual(['未找到该消息', 'error'])
  })

  it('editAndRegenerate 在新分支里替换那条用户消息并重新生成', async () => {
    const { store, topicId } = setup()
    const a = msg('user', '原问题', { displayContent: '/指令 原问题' })
    const b = msg('assistant', '原回答')
    seedConversation(topicId, [a, b])
    store.loadMessages(topicId)
    script({ text: '改过之后的回答' })
    await store.editAndRegenerate(a.id, '  改过的问题  ')
    const fork = store.activeBranch
    expect(fork.id).not.toBe('b-main')
    expect(fork.messages.map(m => m.content)).toEqual(['改过的问题', '改过之后的回答'])
    // 编辑后展示新正文，不再沿用指令原文
    expect(fork.messages[0].displayContent).toBeUndefined()
    expect(store.branches[0].messages.map(m => m.content)).toEqual(['原问题', '原回答'])
    expect(toasts[0][0]).toContain('已编辑并生成「分支 2」')
  })

  it('editAndRegenerate 对空内容、非用户消息、不存在的 id 都不动手', async () => {
    const { store, topicId } = setup()
    const a = msg('user', '问')
    const b = msg('assistant', '答')
    seedConversation(topicId, [a, b])
    store.loadMessages(topicId)
    await store.editAndRegenerate(a.id, '   ')
    await store.editAndRegenerate(b.id, '改成别的')
    await store.editAndRegenerate('不存在的', '改成别的')
    expect(store.branches).toHaveLength(1)
    expect(api.sendChatRequest).not.toHaveBeenCalled()
  })

  it('regenerate 末条回复：原地追加版本，旧版本留着可以切回去', async () => {
    const { store, topicId } = setup()
    const a = msg('user', '问')
    const b = msg('assistant', '第一版回答', { toolTrace: [{ old: true }] })
    seedConversation(topicId, [a, b])
    store.loadMessages(topicId)
    script({ text: '第二版回答', thinking: '这次想了很久' })
    await store.regenerate(b.id)
    const target = store.messages[1]
    expect(target.content).toBe('第二版回答')
    expect(target.thinking).toBe('这次想了很久')
    expect(target.activeVersion).toBe(1)
    expect(target.versions).toHaveLength(2)
    expect(target.versions[0].content).toBe('第一版回答')
    expect(target.versions[0].toolTrace).toEqual([{ old: true }])
    expect(target.streaming).toBeUndefined()
    // 旧版工具链字段已被 parts 取代
    expect(target.toolTrace).toBeUndefined()
    expect(store.messages).toHaveLength(2)
    expect(archived(topicId).branches[0].messages[1].activeVersion).toBe(1)
  })

  it('regenerate 不传 id 时找最后一条 AI 回复', async () => {
    const { store, topicId } = setup()
    seedConversation(topicId, [msg('user', '问'), msg('assistant', '旧回答')])
    store.loadMessages(topicId)
    script({ text: '新回答' })
    await store.regenerate()
    expect(store.messages[1].content).toBe('新回答')
  })

  it('regenerate 非末条时自动派生新分支，后续消息不丢', async () => {
    const { store, topicId } = setup()
    const a = msg('user', '第一问')
    const b = msg('assistant', '第一答')
    const c = msg('user', '第二问')
    const d = msg('assistant', '第二答')
    seedConversation(topicId, [a, b, c, d])
    store.loadMessages(topicId)
    script({ text: '重写的第一答' })
    await store.regenerate(b.id)
    expect(store.branches).toHaveLength(2)
    expect(store.activeBranch.messages.map(m => m.content)).toEqual(['第一问', '重写的第一答'])
    expect(store.branches[0].messages).toHaveLength(4)
    expect(toasts[0]).toEqual(['已在新分支中重新生成', 'success'])
  })

  it('目标是用户消息时不重新生成', async () => {
    const { store, topicId } = setup()
    const a = msg('user', '问')
    seedConversation(topicId, [a])
    store.loadMessages(topicId)
    await store.regenerate(a.id)
    expect(api.sendChatRequest).not.toHaveBeenCalled()
    expect(store.branches).toHaveLength(1)
  })

  it('regenerateWithSecondary 没配副模型时只提示', async () => {
    const { store, topicId, settings } = setup()
    settings.secondaryApiKey = ''
    seedConversation(topicId, [msg('user', '问'), msg('assistant', '答')])
    store.loadMessages(topicId)
    await store.regenerateWithSecondary()
    expect(api.sendChatRequest).not.toHaveBeenCalled()
    expect(toasts[0][0]).toContain('副模型尚未配置')
  })

  it('regenerateWithSecondary 用副模型的配置发请求，结果作为新版本追加', async () => {
    const { store, topicId, settings } = setup()
    settings.secondaryApiKey = 'sk-2'
    settings.secondaryModel = 'glm-4.6v-flash'
    seedConversation(topicId, [msg('user', '问'), msg('assistant', '主模型答的')])
    store.loadMessages(topicId)
    script({ text: '副模型答的' })
    await store.regenerateWithSecondary()
    expect(api.calls[0]).toMatchObject({
      apiKey: 'sk-2',
      model: 'glm-4.6v-flash',
      apiBase: 'https://open.bigmodel.cn/api/paas/v4',
    })
    expect(store.messages[1].content).toBe('副模型答的')
    expect(store.messages[1].versions[0].content).toBe('主模型答的')
  })

  it('continueResponse 续写时「请继续。」不进入会话', async () => {
    const { store, topicId } = setup()
    seedConversation(topicId, [msg('user', '写长一点'), msg('assistant', '前半段')])
    store.loadMessages(topicId)
    script(payload => {
      expect(payload.messages[payload.messages.length - 1].content).toBe('请继续。')
      return { text: '后半段' }
    })
    await store.continueResponse()
    expect(store.messages.map(m => m.content)).toEqual(['写长一点', '前半段', '后半段'])
    expect(archived(topicId).branches[0].messages.map(m => m.content)).not.toContain('请继续。')
  })

  it('没有可续写的 AI 消息时退化成普通发送', async () => {
    const { store } = setup()
    script({ text: '收到' })
    await store.continueResponse()
    expect(store.messages.map(m => m.role)).toEqual(['user', 'assistant'])
    expect(store.messages[0].content).toBe('请继续。')
  })

  it('stopGeneration 在没有生成任务时不报错', () => {
    const { store } = setup()
    expect(() => store.stopGeneration()).not.toThrow()
  })
})

describe('系统提示词', () => {
  it('开着 AI 人设时只发人设，不带内置提示词', () => {
    const { store, settings } = setup()
    settings.personaEnabled = true
    settings.personaPrompt = '  我是白曦月  '
    const prompt = store.buildSystemPrompt()
    expect(prompt.startsWith('我是白曦月')).toBe(true)
    expect(prompt).not.toContain(systemPromptRaw.trim().slice(0, 20))
  })

  it('关掉 AI 人设时改用内置提示词', () => {
    const { store, settings } = setup()
    settings.personaEnabled = false
    settings.personaPrompt = '我是白曦月'
    expect(store.buildSystemPrompt()).toContain(systemPromptRaw.trim().slice(0, 20))
    expect(store.buildSystemPrompt()).not.toContain('我是白曦月')
  })

  it('用户信息段只在填了名字或人设时出现', () => {
    const { store, settings } = setup()
    expect(store.buildSystemPrompt()).not.toContain('【用户信息】')
    settings.userName = '  小明 '
    settings.userPersona = '喜欢简短回答'
    const prompt = store.buildSystemPrompt()
    expect(prompt).toContain('【用户信息】')
    expect(prompt).toContain('用户名叫"小明"')
    expect(prompt).toContain('用户人设：喜欢简短回答')
  })

  it('回复规则受开关控制', () => {
    const { store, settings } = setup()
    settings.replyRules = '不要说教'
    settings.replyRulesEnabled = true
    expect(store.buildSystemPrompt()).toContain('【回复规则】\n不要说教')
    settings.replyRulesEnabled = false
    expect(store.buildSystemPrompt()).not.toContain('不要说教')
  })

  it('工具段随工作模式开关出现，preview 也在里面', () => {
    const { store, settings } = setup()
    settings.workModeEnabled = true
    const on = store.buildSystemPrompt()
    expect(on).toContain('【工具调用】')
    expect(on).toContain('files：')
    expect(on).toContain('preview：')
    settings.workModeEnabled = false
    const off = store.buildSystemPrompt()
    expect(off).not.toContain('preview：')
  })

  it('开工预取与长期记忆按有就拼、没有就不拼', () => {
    const { store } = setup()
    expect(store.buildSystemPrompt()).not.toContain('【工作区快照】')
    preflight.getPreflightContext.mockReturnValue('\n\n【工作区快照】3 个文件')
    memCtx.buildMainChatMemoryContext.mockReturnValue('【长期记忆】用户喜欢简洁')
    const prompt = store.buildSystemPrompt()
    expect(prompt).toContain('【工作区快照】3 个文件')
    expect(prompt).toContain('【长期记忆】用户喜欢简洁')
    expect(memCtx.buildMainChatMemoryContext).toHaveBeenCalled()
  })

  it('发消息前会刷一次预取快照', async () => {
    const { store, settings } = setup()
    await store.sendMessage('你好')
    expect(preflight.refreshPreflightContext).toHaveBeenCalledWith(settings)
    expect(activity.beginWorkspaceTask).toHaveBeenCalled()
  })
})

describe('发送与流式', () => {
  it('一条消息走完：入列、落盘、话题时间被 touch', async () => {
    const { store, topics, topicId } = setup()
    const before = topics.currentTopic.updatedAt
    await store.sendMessage('你好呀')
    expect(store.messages.map(m => m.role)).toEqual(['user', 'assistant'])
    expect(store.messages[1].content).toBe('好的，这是回答。')
    expect(store.isLoading).toBe(false)
    expect(store.streamingContent).toBe('')
    expect(store.streamingMessageId).toBe(null)
    expect(archived(topicId).branches[0].messages).toHaveLength(2)
    expect(topics.currentTopic.updatedAt).toBeGreaterThanOrEqual(before)
  })

  it('请求带的是系统提示词 + 历史，助手侧图片不回传', async () => {
    const { store, topicId } = setup()
    seedConversation(topicId, [
      msg('user', '第一问', { images: ['data:1'] }),
      msg('assistant', '第一答', { images: ['data:2'] }),
    ])
    store.loadMessages(topicId)
    await store.sendMessage('第二问')
    const sent = api.calls[0].messages
    expect(sent[0].role).toBe('system')
    expect(sent[1]).toMatchObject({ role: 'user', content: '第一问', images: ['data:1'] })
    expect(sent[2].images).toBeUndefined()
    expect(sent[3]).toMatchObject({ role: 'user', content: '第二问' })
    expect(api.calls[0]).toMatchObject({ apiKey: 'sk-test', apiBase: 'https://api.test/v1', model: 'test-model' })
  })

  it('流式期间 streamingContent 一直在长，结束后就地补全占位消息而不是新建一条', async () => {
    const { store } = setup()
    const seen = []
    script(payload => {
      payload.onChunk({ type: 'thinking', text: '想一想' })
      payload.onChunk({ type: 'content', text: '第一段' })
      seen.push(store.streamingContent)
      payload.onChunk({ type: 'content', text: '第二段' })
      seen.push(store.streamingContent)
      expect(store.streamingThinking).toBe('想一想')
      expect(store.messages[store.messages.length - 1].streaming).toBe(true)
      return { text: '' }
    })
    await store.sendMessage('写点东西')
    expect(seen).toEqual(['第一段', '第一段第二段'])
    expect(store.messages).toHaveLength(2)
    expect(store.messages[1].content).toBe('第一段第二段')
    expect(store.messages[1].thinking).toBe('想一想')
    expect(store.messages[1].streaming).toBeUndefined()
    expect(store.streamingThinking).toBe('')
  })

  it('流式期间就把工具围栏藏起来，不把 JSON 露给用户', async () => {
    const { store } = setup()
    tools.executeToolCall.mockResolvedValue({ ok: true, text: 'a.js\nb.js', record: 'files：列出目录' })
    script(
      payload => {
        payload.onChunk({ type: 'content', text: '看一下目录\n' })
        payload.onChunk({ type: 'content', text: toolBlock('{"tool":"files","args":{"action":"list"}}') })
        expect(store.streamingContent).not.toContain('"tool"')
        return { text: '' }
      },
      { text: '一共有两个文件。' }
    )
    await store.sendMessage('看看目录')
    expect(store.messages[1].content).toBe('一共有两个文件。')
  })

  it('第一条消息会把话题标题截到 30 字，斜杠指令用指令原文当标题', async () => {
    const { store, topics } = setup()
    const long = '一'.repeat(50)
    await store.sendMessage(long)
    expect(topics.currentTopic.title).toBe(`${'一'.repeat(30)}…`)

    const { store: second, topics: topics2 } = setup()
    script({ text: '好的，这是回答。' })
    await second.sendMessage('展开后的完整提示词', [], [], { displayText: '/翻译 你好' })
    expect(topics2.currentTopic.title).toBe('/翻译 你好')
    expect(second.messages[0].displayContent).toBe('/翻译 你好')
    expect(second.messages[0].content).toBe('展开后的完整提示词')
    expect(api.calls[0].messages.at(-1).content).toBe('展开后的完整提示词')
  })

  it('首轮对话之后自动起标题，去掉引号并截到 20 字', async () => {
    const { store, topics } = setup()
    script({ text: '回答' }, { text: `「${'标'.repeat(30)}」` })
    await store.sendMessage('你好')
    await flush()
    expect(topics.currentTopic.title).toBe('标'.repeat(20))
    expect(api.calls[1].maxTokens).toBe(50)
    expect(api.calls[1].messages[0].content).toContain('请用 3~8 个字概括')
  })

  it('第二轮不再自动起标题', async () => {
    const { store, topics } = setup()
    await store.sendMessage('第一句')
    await flush()
    const calls = api.calls.length
    await store.sendMessage('第二句')
    await flush()
    expect(api.calls.length).toBe(calls + 1)
    expect(topics.currentTopic.title).toBe('第一句')
  })

  it('起标题失败不影响对话', async () => {
    const { store, topics } = setup()
    script({ text: '回答' }, { error: new Error('标题接口挂了') })
    await store.sendMessage('你好')
    await flush()
    expect(store.messages[1].content).toBe('回答')
    expect(topics.currentTopic.title).toBe('你好')
  })

  it('没有话题时 sendMessage 会先建一个', async () => {
    const store = useChatStore()
    const topics = useTopicsStore()
    expect(topics.currentTopicId).toBe(null)
    await store.sendMessage('你好')
    expect(topics.currentTopicId).not.toBe(null)
    expect(store.messages).toHaveLength(2)
  })

  it('接口报错时把错误放进回复，不留半截流式状态', async () => {
    const { store } = setup()
    script({ error: new Error('401 未授权') })
    await store.sendMessage('你好')
    expect(store.messages[1].content).toBe('❌ 错误: 401 未授权')
    expect(store.isLoading).toBe(false)
    expect(store.streamingContent).toBe('')
  })

  it('stopGeneration 中止后保留已经写出来的部分', async () => {
    const { store } = setup()
    api.sendChatRequest.mockReset()
    api.sendChatRequest.mockImplementation(payload => new Promise((resolve, reject) => {
      payload.onChunk({ type: 'content', text: '已经写了一半' })
      payload.signal.addEventListener('abort', () => {
        reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }))
      })
    }))
    const pending = store.sendMessage('写长一点')
    await flush(2)
    expect(store.isLoading).toBe(true)
    store.stopGeneration()
    await pending
    expect(store.messages[1].content).toBe('已经写了一半\n\n*[已中止]*')
    expect(store.isLoading).toBe(false)
    expect(store.messages[1].streaming).toBeUndefined()
  })

  it('一个字都没写出来就中止时，不留空回复', async () => {
    const { store } = setup()
    api.sendChatRequest.mockReset()
    api.sendChatRequest.mockImplementation(payload => new Promise((resolve, reject) => {
      payload.signal.addEventListener('abort', () => {
        reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }))
      })
    }))
    const pending = store.sendMessage('写长一点')
    await flush(2)
    store.stopGeneration()
    await pending
    expect(store.messages).toHaveLength(1)
  })
})

describe('工具调用循环', () => {
  const listCall = toolBlock('{"tool":"files","args":{"action":"list"}}')

  it('模型要求调用工具时先执行再回灌，最终正文里没有 JSON', async () => {
    const { store, settings } = setup()
    tools.executeToolCall.mockResolvedValue({ ok: true, text: 'a.js\nb.js', record: 'files：列出目录' })
    script(`看一下目录\n${listCall}`, '一共有两个文件。')
    await store.sendMessage('看看目录')

    expect(tools.executeToolCall).toHaveBeenCalledTimes(1)
    const [call, options] = tools.executeToolCall.mock.calls[0]
    expect(call).toEqual({ tool: 'files', args: { action: 'list' } })
    expect(options.settings).toBe(settings)
    expect(options.signal).toBeInstanceOf(AbortSignal)
    expect(options.budget.maxFiles).toBeGreaterThan(0)
    expect(typeof options.onStatus).toBe('function')

    const second = api.calls[1].messages
    expect(second.at(-2).role).toBe('assistant')
    expect(second.at(-2).content).toContain('"tool":"files"')
    const feedback = second.at(-1)
    expect(feedback.toolResult).toBe(true)
    expect(feedback.content).toContain('【工具执行结果】')
    expect(feedback.content).toContain('工具：files')
    expect(feedback.content).toContain('状态：成功')
    expect(feedback.content).toContain('a.js\nb.js')
    expect(feedback.content).toContain('还剩 19 轮工具调用')
    expect(feedback.toolBrief).toContain('第 1 轮工具结果')

    const reply = store.messages[1]
    expect(reply.content).toBe('一共有两个文件。')
    expect(reply.content).not.toContain('"tool"')
    expect(reply.parts.map(part => part.type)).toEqual(['text', 'trace', 'text'])
    expect(reply.parts[0].content).toBe('看一下目录')
    const trace = reply.parts[1]
    expect(trace).toMatchObject({ round: 1, running: false })
    expect(trace.status).toBeUndefined()
    expect(trace.steps).toEqual([{ tool: 'files', ok: true, summary: 'files：列出目录', output: 'a.js\nb.js' }])
    expect(trace.used).toMatchObject({ rounds: 1, roundsTotal: 20, files: 0 })
    expect(reply.parts[2].content).toBe('一共有两个文件。')
  })

  it('工具失败时把失败原因回灌，并附上正确写法', async () => {
    const { store } = setup()
    tools.executeToolCall.mockResolvedValue({ ok: false, text: '缺少参数 path', record: '失败：缺少参数' })
    script(listCall, '那我换个方式。')
    await store.sendMessage('看看目录')
    const feedback = api.calls[1].messages.at(-1)
    expect(feedback.content).toContain('状态：失败')
    expect(feedback.content).toContain('缺少参数 path')
    expect(feedback.content).toContain('正确写法')
    expect(traceOf(store.messages[1]).steps[0].ok).toBe(false)
  })

  it('开关造成的拒绝不附示例，免得诱导模型原样重发', async () => {
    const { store } = setup()
    tools.executeToolCall.mockResolvedValue({ ok: false, refused: true, text: '工作模式未开启', record: '失败：工作模式未开启' })
    script(listCall, '好的。')
    await store.sendMessage('看看目录')
    const feedback = api.calls[1].messages.at(-1)
    expect(feedback.content).toContain('工作模式未开启')
    expect(feedback.content).not.toContain('正确写法')
  })

  it('同一个调用重复失败两次就打断空转', async () => {
    const { store } = setup()
    tools.executeToolCall.mockResolvedValue({ ok: false, text: '缺少参数', record: '失败' })
    script(listCall, listCall, '做不到，我说明一下原因。')
    await store.sendMessage('看看目录')
    const calls = chatCalls()
    expect(calls).toHaveLength(3)
    expect(calls[1].messages.at(-1).content).not.toContain('已重复失败')
    const feedback = calls[2].messages.at(-1)
    expect(feedback.content).toContain('以上这些调用已重复失败')
    expect(feedback.content).toContain('files list')
    expect(feedback.content).toContain('不要再发出同样的调用')
    expect(store.messages[1].content).toBe('做不到，我说明一下原因。')
  })

  it('只读调用同批并行，写操作各自成批', async () => {
    const { store } = setup()
    tools.executeToolCall.mockResolvedValue({ ok: true, text: '结果', record: '完成' })
    script(toolBlock(
      '{"tool":"search_web","args":{"query":"a"}}',
      '{"tool":"read_document","args":{"query":"b"}}',
      '{"tool":"files","args":{"action":"write","path":"c.js","content":"1"}}'
    ), '都做完了。')
    await store.sendMessage('一起做')
    expect(tools.executeToolCall).toHaveBeenCalledTimes(3)
    expect(tools.executeToolCall.mock.calls.map(([call]) => call.tool)).toEqual(['search_web', 'read_document', 'files'])
    expect(traceOf(store.messages[1]).steps).toHaveLength(3)
  })

  it('超长结果回灌时被截断，并明确告诉模型这不是全文', async () => {
    const { store } = setup()
    tools.executeToolCall.mockResolvedValue({ ok: true, text: 'x'.repeat(9000), record: '完成' })
    script(listCall, '看完了。')
    await store.sendMessage('看看目录')
    const feedback = api.calls[1].messages.at(-1)
    expect(feedback.content).toContain('结果已截断，原文 9000 字符')
    expect(feedback.content.length).toBeLessThan(9000)
    // 步骤卡片另有更短的上限，不要把整份结果塞进消息里
    expect(traceOf(store.messages[1]).steps[0].output.length).toBeLessThanOrEqual(1200)
  })

  it('工具产出的图表与图片挂到回复上，导出动作等正文入列后再执行', async () => {
    const { store, topics } = setup()
    tools.executeToolCall
      .mockResolvedValueOnce({ ok: true, text: '画好了', record: '完成', chartOption: { type: 'pie' } })
      .mockResolvedValueOnce({ ok: true, text: '已导出', record: '完成', exportFormat: 'md' })
    script(toolBlock(
      '{"tool":"draw_chart","args":{"type":"pie"}}',
      '{"tool":"export_conversation","args":{"format":"md"}}'
    ), '都完成了。')
    await store.sendMessage('画个图再导出')
    expect(store.messages[1].content).toContain('```echarts')
    expect(store.messages[1].content).toContain('"type":"pie"')
    expect(exporter.exportConversation).toHaveBeenCalledTimes(1)
    expect(exporter.exportConversation.mock.calls[0][0]).toMatchObject({ format: 'md', title: topics.currentTopic.title })
    expect(exporter.exportConversation.mock.calls[0][0].messages).toHaveLength(2)
    expect(toasts.map(t => t[0])).toContain('对话已导出')
  })

  it('pdf 走打印那条路', async () => {
    const { store } = setup()
    tools.executeToolCall.mockResolvedValue({ ok: true, text: '已导出', record: '完成', exportFormat: 'pdf' })
    script(toolBlock('{"tool":"export_conversation","args":{"format":"pdf"}}'), '导出好了。')
    await store.sendMessage('导出 pdf')
    expect(exporter.printConversation).toHaveBeenCalledTimes(1)
    expect(exporter.exportConversation).not.toHaveBeenCalled()
  })

  it('导出抛错时提示用户，不影响回复', async () => {
    const { store } = setup()
    exporter.exportConversation.mockImplementation(() => { throw new Error('磁盘满了') })
    tools.executeToolCall.mockResolvedValue({ ok: true, text: '已导出', record: '完成', exportFormat: 'md' })
    script(toolBlock('{"tool":"export_conversation","args":{"format":"md"}}'), '导出好了。')
    await store.sendMessage('导出')
    expect(store.messages[1].content).toBe('导出好了。')
    expect(toasts.map(t => t[0]).some(text => text.includes('导出失败：磁盘满了'))).toBe(true)
  })

  it('浏览器截图排最后，其余工具图片按顺序保留，最多四张', async () => {
    const { store } = setup()
    tools.executeToolCall
      .mockResolvedValueOnce({ ok: true, text: '图1', record: '完成', images: ['shot-1'] })
      .mockResolvedValueOnce({ ok: true, text: '图2', record: '完成', images: ['page-1'] })
    script(toolBlock(
      '{"tool":"generate_image","args":{"prompt":"a"}}',
      '{"tool":"browser","args":{"action":"open","url":"https://x.com"}}'
    ), '都拿到了。')
    await store.sendMessage('取图')
    expect(store.messages[1].images).toEqual(['shot-1', 'page-1'])
  })

  it('模型不支持看截图时，回灌里说明只能看正文', async () => {
    const { store, settings } = setup()
    ocr.detectVisionSupport.mockReturnValue('text')
    tools.executeToolCall.mockResolvedValue({
      ok: true, text: '页面正文', record: '完成', images: ['page-1'], visionImages: ['page-1'],
    })
    script(toolBlock('{"tool":"browser","args":{"action":"open","url":"https://x.com"}}'), '看完了。')
    await store.sendMessage('打开看看')
    const feedback = api.calls[1].messages.at(-1)
    expect(feedback.content).toContain('当前模型不支持查看截图')
    expect(feedback.images).toBeUndefined()
    expect(settings.model).toBe('test-model')
  })

  it('服务端拒绝图片后自动退回纯文本重试一次', async () => {
    const { store } = setup()
    tools.executeToolCall.mockResolvedValue({ ok: true, text: '页面正文', record: '完成', visionImages: ['page-1'] })
    script(
      toolBlock('{"tool":"browser","args":{"action":"open","url":"https://x.com"}}'),
      { error: new Error('这个模型不支持图片') },
      '看完了。'
    )
    await store.sendMessage('打开看看')
    const calls = chatCalls()
    expect(calls).toHaveLength(3)
    expect(calls[1].messages.at(-1).images).toEqual(['page-1'])
    expect(calls[2].messages.at(-1).images).toBeUndefined()
    expect(traceOf(store.messages[1]).notes).toContain('当前模型不支持截图，已改用页面文本继续')
    expect(store.messages[1].content).toBe('看完了。')
  })

  it('工具轮次用满后仍未收敛：去掉没执行的调用并说明已到上限', async () => {
    const { store, settings } = setup()
    settings.workModeEnabled = false
    settings.browserSkillEnabled = false
    tools.executeToolCall.mockResolvedValue({ ok: true, text: '结果', record: '完成' })
    // 每一轮都接着要求调用工具，直到轮次用满；剧本项用完就返回空正文，所以要把生成器排满
    const keepCalling = () => ({ text: `第 ${chatCalls().length} 次\n${listCall}` })
    script(keepCalling, keepCalling, keepCalling, keepCalling, keepCalling)
    await store.sendMessage('一直调用')
    // 3 轮上限：1 次首发 + 3 次回灌
    expect(chatCalls()).toHaveLength(4)
    expect(traceOf(store.messages[1]).used.roundsTotal).toBe(3)
    expect(store.messages[1].content).toContain('已达到工具调用上限')
    expect(store.messages[1].content).not.toContain('"tool"')
  })

  it('工具执行抛异常时当成失败回灌，不整条崩掉', async () => {
    const { store } = setup()
    tools.executeToolCall.mockRejectedValue(new Error('沙箱炸了'))
    script(listCall, '出错了，我说明一下。')
    await store.sendMessage('看看目录')
    const feedback = api.calls[1].messages.at(-1)
    expect(feedback.content).toContain('状态：失败')
    expect(feedback.content).toContain('沙箱炸了')
    expect(store.messages[1].content).toBe('出错了，我说明一下。')
  })

  it('回灌时会压缩更早轮次的工具结果，最近一轮保留全文', async () => {
    const { store } = setup()
    tools.executeToolCall.mockResolvedValue({ ok: true, text: 'y'.repeat(900), record: '完成' })
    script(listCall, listCall, listCall, '三轮都跑完了。')
    await store.sendMessage('看看目录')
    const calls = chatCalls()
    expect(calls).toHaveLength(4)
    // 第 3 轮回灌时，前两轮里只有更早的那轮被压成摘要：上一轮要留着给模型取 old_text
    const feedbacks = calls[3].messages.filter(message => message.toolResult)
    expect(feedbacks).toHaveLength(3)
    expect(feedbacks[0].content).toContain('第 1 轮工具结果已归档')
    expect(feedbacks[0].content).not.toContain('yyy')
    expect(feedbacks[0].images).toBeUndefined()
    expect(feedbacks[1].content).toContain('yyy')
    expect(feedbacks[2].content).toContain('yyy')
    // 第 2 轮回灌时上一轮还是「最近一轮」，不该被压
    const secondRound = calls[2].messages.filter(message => message.toolResult)
    expect(secondRound).toHaveLength(2)
    expect(secondRound[0].content).toContain('yyy')
  })

  it('每轮工具调用数量受设置上限约束', async () => {
    const { store, settings } = setup()
    settings.maxToolCallsPerRound = 1
    tools.executeToolCall.mockResolvedValue({ ok: true, text: '结果', record: '完成' })
    script(toolBlock(
      '{"tool":"files","args":{"action":"list"}}',
      '{"tool":"files","args":{"action":"read","path":"a.js"}}'
    ), '做完了。')
    await store.sendMessage('两个一起做')
    expect(tools.executeToolCall).toHaveBeenCalledTimes(1)
    expect(tools.executeToolCall.mock.calls[0][0].args).toEqual({ action: 'list' })
  })
})

describe('联网搜索', () => {
  it('强制搜索时先搜再问，结果注入到最后一条用户消息', async () => {
    const { store, settings } = setup()
    settings.forceSearch = true
    settings.tavilyApiKey = 'tvly-1'
    await store.sendMessage('最近的新闻')
    expect(search.searchWeb).toHaveBeenCalledWith('最近的新闻', expect.objectContaining({ apiKey: 'tvly-1' }))
    expect(api.calls[0].messages.at(-1).content).toContain('【搜索结果】')
    expect(store.searching).toBe(false)
  })

  it('没配 Tavily Key 时跳过搜索并说明原因', async () => {
    const { store, settings } = setup()
    settings.forceSearch = true
    settings.tavilyApiKey = ''
    search.buildSearchFallbackText.mockReturnValue('（可以换个说法再问一次）')
    await store.sendMessage('最近的新闻')
    expect(search.searchWeb).not.toHaveBeenCalled()
    expect(store.messages[1].content).toContain('> 未配置 Tavily API Key')
    expect(store.messages[1].content).toContain('（可以换个说法再问一次）')
    expect(api.calls[0].messages.at(-1).content).not.toContain('【搜索结果】')
  })

  it('搜索失败时把失败原因放在回复前面，仍然继续回答', async () => {
    const { store, settings } = setup()
    settings.forceSearch = true
    settings.tavilyApiKey = 'tvly-1'
    search.searchWeb.mockResolvedValue({ ok: false, message: '搜索服务超时' })
    await store.sendMessage('最近的新闻')
    expect(store.messages[1].content.startsWith('> 搜索服务超时')).toBe(true)
    expect(store.messages[1].content).toContain('好的，这是回答。')
  })

  it('开关关着但命中搜索意图时也会搜', async () => {
    const { store, settings } = setup()
    settings.forceSearch = false
    settings.tavilyApiKey = 'tvly-1'
    search.detectSearchIntent.mockReturnValue('search')
    await store.sendMessage('2026 年的新闻')
    expect(search.searchWeb).toHaveBeenCalledTimes(1)
    expect(api.calls[0].messages.at(-1).content).toContain('【搜索结果】')
  })

  it('闲聊不触发搜索请求', async () => {
    const { store, settings } = setup()
    settings.forceSearch = false
    settings.tavilyApiKey = 'tvly-1'
    search.detectSearchIntent.mockReturnValue('chat')
    await store.sendMessage('今天心情不错')
    expect(search.searchWeb).not.toHaveBeenCalled()
  })

  it('意图存疑时先正常回答，用户回「搜」再用原问题去搜', async () => {
    const { store, settings } = setup()
    settings.forceSearch = false
    settings.tavilyApiKey = 'tvly-1'
    search.detectSearchIntent.mockReturnValue('confirm')
    await store.sendMessage('这个说法对吗')
    expect(search.searchWeb).not.toHaveBeenCalled()
    expect(store.messages[1].content).toContain('回复「搜」我就查一下')

    search.detectSearchReply.mockReturnValue('yes')
    await store.sendMessage('搜')
    expect(search.searchWeb).toHaveBeenCalledWith('这个说法对吗', expect.anything())
  })

  it('确认只消费一次，回「不用」就不搜', async () => {
    const { store, settings } = setup()
    settings.forceSearch = false
    settings.tavilyApiKey = 'tvly-1'
    // 只有第一句被判成「存疑」，后面两句是普通闲聊，不该再挂上待确认
    search.detectSearchIntent.mockReturnValueOnce('confirm')
    await store.sendMessage('这个说法对吗')
    search.detectSearchReply.mockReturnValue('no')
    await store.sendMessage('不用了')
    expect(search.searchWeb).not.toHaveBeenCalled()
    // 待确认已经被上一句消费掉，再说「搜」也不会回头搜老问题
    search.detectSearchReply.mockReturnValue('yes')
    await store.sendMessage('搜')
    expect(search.searchWeb).not.toHaveBeenCalled()
  })

  it('确认窗口过期后不再回头搜老问题', async () => {
    const { store, settings } = setup()
    settings.forceSearch = false
    settings.tavilyApiKey = 'tvly-1'
    search.detectSearchIntent.mockReturnValue('confirm')
    await store.sendMessage('这个说法对吗')
    const realNow = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(realNow + 11 * 60 * 1000)
    search.detectSearchReply.mockReturnValue('yes')
    await store.sendMessage('搜')
    expect(search.searchWeb).not.toHaveBeenCalled()
    vi.mocked(Date.now).mockRestore()
  })

  it('搜索结果被截断时提示一声', async () => {
    const { store, settings } = setup()
    settings.forceSearch = true
    settings.tavilyApiKey = 'tvly-1'
    search.buildSearchContext.mockReturnValue({ text: '【搜索结果】截过的', truncated: true, maxChars: 400 })
    await store.sendMessage('最近的新闻')
    expect(toasts.map(t => t[0]).some(text => text.includes('已截断至 400 字'))).toBe(true)
  })
})

describe('图片与视觉', () => {
  it('主模型是纯文本又没配副模型时直接说明，不发请求', async () => {
    const { store, settings } = setup()
    settings.secondaryApiKey = ''
    ocr.detectVisionSupport.mockReturnValue('text')
    await store.sendMessage('这张图写了什么', ['data:1'])
    expect(chatCalls()).toHaveLength(0)
    expect(store.messages[1].content).toContain('纯文本模型')
    expect(store.messages[1].content).toContain('副模型 API')
  })

  it('主模型明确不支持图片时让副模型先接手', async () => {
    const { store, settings } = setup()
    settings.secondaryApiKey = 'sk-2'
    settings.secondaryModel = 'glm-4.6v-flash'
    ocr.detectVisionSupport.mockReturnValue('text')
    await store.sendMessage('这张图写了什么', ['data:1'])
    const calls = chatCalls()
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ apiKey: 'sk-2', model: 'glm-4.6v-flash' })
    expect(calls[0].messages.at(-1).content).toContain(ocr.OCR_INSTRUCTION)
    // 主动交给副模型不算「回退」，不需要在正文里加提示
    expect(store.messages[1].content).not.toContain('未能处理图片')
  })

  it('主模型视觉失败时自动切副模型，并在正文里说明', async () => {
    const { store, settings } = setup()
    settings.secondaryApiKey = 'sk-2'
    settings.secondaryModel = 'glm-4.6v-flash'
    ocr.detectVisionSupport.mockReturnValue('vision')
    script({ error: new Error('这个模型不支持图片') }, { text: '图里写着「 hello 」。' })
    await store.sendMessage('这张图写了什么', ['data:1'])
    const calls = chatCalls()
    expect(calls).toHaveLength(2)
    expect(calls[0].apiKey).toBe('sk-test')
    expect(calls[1].apiKey).toBe('sk-2')
    expect(store.messages[1].content).toContain('> 主模型「test-model」未能处理图片，已自动切换到副模型「glm-4.6v-flash」。')
    expect(store.messages[1].content).toContain('图里写着「 hello 」。')
  })

  it('主副模型都读不了图时给出可操作的建议', async () => {
    const { store, settings } = setup()
    settings.secondaryApiKey = 'sk-2'
    ocr.detectVisionSupport.mockReturnValue('vision')
    script({ error: new Error('这个模型不支持图片') }, { error: new Error('这个模型不支持图片') })
    await store.sendMessage('这张图写了什么', ['data:1'])
    expect(store.messages[1].content).toContain('都无法读取这张图片')
    expect(store.messages[1].content).toContain('纯文本')
  })

  it('图片太多时只送前几张，并告诉用户', async () => {
    const { store } = setup()
    const images = ['data:1', 'data:2', 'data:3', 'data:4', 'data:5']
    ocr.prepareOcrImages.mockResolvedValue({ images: images.slice(0, ocr.OCR_MAX_IMAGES), dropped: 2 })
    await store.sendMessage('看看这些图', images)
    expect(api.calls[0].messages.at(-1).images).toHaveLength(3)
    expect(store.messages[1].content).toContain('> 本次共 5 张图片')
    expect(store.messages[0].images).toHaveLength(5)
  })

  it('图片理解关掉时不压缩图片、不注入 OCR 指令', async () => {
    const { store, settings } = setup()
    settings.ocrSkillEnabled = false
    await store.sendMessage('看看这张图', ['data:1', 'data:2'])
    expect(ocr.prepareOcrImages).not.toHaveBeenCalled()
    expect(api.calls[0].messages.at(-1).content).not.toContain(ocr.OCR_INSTRUCTION)
    expect(api.calls[0].messages.at(-1).images).toHaveLength(2)
  })

  it('/画图 指令没写内容时只提示，不发请求', async () => {
    const { store } = setup()
    await store.sendMessage('   ', [], [], { forceImage: true })
    expect(api.sendChatRequest).not.toHaveBeenCalled()
    expect(store.messages[1].content).toContain('请在 /画图 后描述')
  })

  it('生图需要副模型，没配就说明去哪儿配', async () => {
    const { store, settings } = setup()
    settings.secondaryApiKey = ''
    image.detectImageIntent.mockReturnValue('一只橘猫')
    await store.sendMessage('画一只橘猫')
    expect(api.sendChatRequest).not.toHaveBeenCalled()
    expect(store.messages[1].content).toContain('生图需要副模型 API')
  })

  it('命中生图意图时走副模型出图，不发对话请求', async () => {
    const { store, settings } = setup()
    settings.secondaryApiKey = 'sk-2'
    settings.secondaryImageModel = 'cogview-3-flash'
    image.detectImageIntent.mockReturnValue('一只在月球上晒太阳的橘猫')
    await store.sendMessage('帮我画一只在月球上的橘猫')
    expect(api.sendChatRequest).not.toHaveBeenCalled()
    expect(image.generateImage).toHaveBeenCalledWith('一只在月球上晒太阳的橘猫', expect.objectContaining({
      apiKey: 'sk-2',
      model: 'cogview-3-flash',
    }))
    expect(store.messages[1].images).toEqual(['data:image/png;base64,AAA'])
    expect(store.messages[1].content).toContain('已根据你的描述生成图片')
    expect(store.imageGenerating).toBe(false)
  })

  it('生图失败时把原因放进回复', async () => {
    const { store, settings } = setup()
    settings.secondaryApiKey = 'sk-2'
    image.detectImageIntent.mockReturnValue('一只橘猫')
    image.generateImage.mockResolvedValue({ ok: false, message: '额度用完了' })
    await store.sendMessage('画一只橘猫')
    expect(store.messages[1].content).toBe('❌ 额度用完了')
    expect(store.messages[1].images).toBeUndefined()
    expect(store.imageGenerating).toBe(false)
  })

  it('已经带图上传时不再触发生图意图', async () => {
    const { store, settings } = setup()
    settings.secondaryApiKey = 'sk-2'
    image.detectImageIntent.mockReturnValue('')
    await store.sendMessage('这张图里有什么', ['data:1'])
    expect(image.generateImage).not.toHaveBeenCalled()
    expect(chatCalls()).toHaveLength(1)
    expect(image.detectImageIntent).toHaveBeenCalledWith('这张图里有什么', true)
  })
})

describe('记忆', () => {
  it('命中记忆指令时提炼并保存，重复的不再存一遍', async () => {
    const { store, memory } = setup()
    mem.detectMemoryCommand.mockReturnValue(true)
    mem.extractMemoryEntries.mockResolvedValue([
      { title: '用户偏好', content: '喜欢简短回答' },
      { title: '用户偏好', content: '喜欢简短回答' },
    ])
    await store.sendMessage('记住我喜欢简短回答')
    await flush()
    expect(mem.extractMemoryEntries).toHaveBeenCalledTimes(1)
    const payload = mem.extractMemoryEntries.mock.calls[0][0]
    expect(payload.userText).toBe('记住我喜欢简短回答')
    // 提炼发生在回复入列之后，转录里用户那句和 AI 那句都在
    expect(payload.messages.map(m => m.role)).toEqual(['user', 'assistant'])
    expect(payload.messages[0].content).toBe('记住我喜欢简短回答')
    expect(memory.memories).toHaveLength(1)
    expect(memory.memories[0]).toMatchObject({ title: '用户偏好', content: '喜欢简短回答', source: 'chat' })
    expect(toasts.map(t => t[0])).toContain('已存入记忆：1 条')
  })

  it('内容已经在记忆里时提示一声，不重复写', async () => {
    const { store, memory } = setup()
    memory.create('用户偏好', '喜欢简短回答')
    mem.detectMemoryCommand.mockReturnValue(true)
    mem.extractMemoryEntries.mockResolvedValue([{ title: '用户偏好', content: '喜欢简短回答' }])
    await store.sendMessage('记住')
    await flush()
    expect(memory.memories).toHaveLength(1)
    expect(toasts.map(t => t[0])).toContain('这些内容已在记忆中')
  })

  it('提炼失败时提示检查模型配置，对话本身照常完成', async () => {
    const { store, memory } = setup()
    mem.detectMemoryCommand.mockReturnValue(true)
    mem.extractMemoryEntries.mockRejectedValue(new Error('接口挂了'))
    await store.sendMessage('记住这件事')
    await flush()
    expect(store.messages[1].content).toBe('好的，这是回答。')
    expect(memory.memories).toEqual([])
    expect(toasts.map(t => t[0])).toContain('记忆保存失败，请检查模型配置')
  })

  it('自动沉淀按轮数触发，提示里带上是自动的', async () => {
    const { store, memory, settings } = setup()
    memory.autoEnabled = true
    memory.autoTurns = 2
    expect(settings.settingsReady).toBe(true)
    mem.extractMemoryEntries.mockResolvedValue([{ title: '自动记下的', content: '内容' }])
    await store.sendMessage('第一句')
    await flush()
    expect(mem.extractMemoryEntries).not.toHaveBeenCalled()
    await store.sendMessage('第二句')
    await flush()
    expect(mem.extractMemoryEntries).toHaveBeenCalledTimes(1)
    expect(mem.extractMemoryEntries.mock.calls[0][0].userText).toContain('自动提炼')
    expect(memory.memories.map(m => m.title)).toEqual(['自动记下的'])
    expect(toasts.map(t => t[0]).some(text => text.includes('正在进行第 2 轮记忆沉淀'))).toBe(true)
    expect(toasts.map(t => t[0])).toContain('已自动沉淀 1 条记忆')
  })

  it('自动沉淀关掉、或轮数没到、或模型没配好时都不触发', async () => {
    const { store, memory } = setup()
    memory.autoTurns = 3
    await store.sendMessage('第一句')
    await flush()
    memory.autoEnabled = false
    await store.sendMessage('第二句')
    await store.sendMessage('第三句')
    await flush()
    expect(mem.extractMemoryEntries).not.toHaveBeenCalled()
  })

  it('命中记忆指令的那一轮不再叠加自动沉淀', async () => {
    const { store, memory } = setup()
    memory.autoTurns = 2
    mem.detectMemoryCommand.mockImplementation(text => String(text).startsWith('记住'))
    mem.extractMemoryEntries.mockResolvedValue([])
    await store.sendMessage('第一句')
    await store.sendMessage('记住第二句')
    await flush()
    expect(mem.extractMemoryEntries).toHaveBeenCalledTimes(1)
    expect(mem.extractMemoryEntries.mock.calls[0][0].userText).toBe('记住第二句')
  })
})

describe('用量统计', () => {
  it('服务商给了 usage 就用真的，并逐次记账', async () => {
    const { store } = setup()
    script({ text: '回答', usage: { prompt: 100, completion: 20, total: 120 } })
    await store.sendMessage('你好')
    expect(usage.recordUsage).toHaveBeenCalledWith({ prompt: 100, completion: 20, total: 120, model: 'test-model', estimated: false })
    expect(store.messages[1].usage).toMatchObject({ prompt: 100, completion: 20, total: 120, estimated: false })
  })

  it('没给 usage 时按字符估算并标出来', async () => {
    const { store } = setup()
    script({ text: '一段不算短的回答' })
    await store.sendMessage('你好')
    const recorded = usage.recordUsage.mock.calls[0][0]
    expect(recorded.estimated).toBe(true)
    expect(recorded.model).toBe('test-model')
    expect(recorded.prompt).toBeGreaterThan(0)
    expect(recorded.completion).toBeGreaterThan(0)
    expect(recorded.total).toBe(recorded.prompt + recorded.completion)
    expect(store.messages[1].usage.estimated).toBe(true)
  })

  it('多轮工具调用时把每轮用量加起来，模型名取最后一次', async () => {
    const { store } = setup()
    tools.executeToolCall.mockResolvedValue({ ok: true, text: '结果', record: '完成' })
    script(
      { text: toolBlock('{"tool":"files","args":{"action":"list"}}'), usage: { prompt: 10, completion: 5, total: 15 } },
      { text: '做完了', usage: { prompt: 30, completion: 7, total: 37 } }
    )
    await store.sendMessage('看看目录')
    expect(usage.recordUsage).toHaveBeenCalledTimes(2)
    expect(store.messages[1].usage).toMatchObject({ prompt: 40, completion: 12, total: 52, model: 'test-model', estimated: false })
  })

  it('用了副模型时记账记的是副模型名', async () => {
    const { store, settings } = setup()
    settings.secondaryApiKey = 'sk-2'
    settings.secondaryModel = 'glm-4.6v-flash'
    ocr.detectVisionSupport.mockReturnValue('text')
    script({ text: '图里的字', usage: { prompt: 8, completion: 4, total: 12 } })
    await store.sendMessage('看看这张图', ['data:1'])
    expect(usage.recordUsage).toHaveBeenCalledWith(expect.objectContaining({ model: 'glm-4.6v-flash' }))
    expect(store.messages[1].usage.model).toBe('glm-4.6v-flash')
  })
})
