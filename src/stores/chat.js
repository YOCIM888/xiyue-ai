import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useTopicsStore } from './topics'
import { useSettingsStore } from './settings'
import { sendChatRequest } from '../services/api'
import { detectSearchIntent, detectSearchReply } from '../services/webSearch'
import { recordUsage } from '../services/usageStats'
import { detectImageIntent, generateImage } from '../services/imageGen'
import { detectMemoryCommand } from '../services/memory'
import {
  createConversation,
  loadConversation,
  saveConversation,
  hasStoredConversation,
  hasLegacyConversation,
  newMessageId,
  newBranchId,
  cloneMessagesForFork,
} from '../utils/conversation'
import { exportConversation, printConversation } from '../services/conversationExport'
import { buildSystemPrompt } from '../services/chat/promptBuilder'
import { generateReply } from '../services/chat/replyEngine'
import { runSearchPrefetch } from '../services/chat/searchPrefetch'
import { maybeAutoDistill, saveMemoriesFromChat } from '../services/chat/memoryDistill'

// 「要不要联网搜」的确认窗口：过久之后用户一句「要」不该再回头搜老问题
const SEARCH_CONFIRM_TTL_MS = 10 * 60 * 1000

export const useChatStore = defineStore('chat', () => {
  const conversation = ref(createConversation())
  const activeBranchId = ref('b-main')
  const streamingContent = ref('')
  const streamingThinking = ref('')
  // 分段渲染：文字段落与内联工具卡片按顺序排列，调用工具时消息内容留在原位
  const streamingParts = ref([])
  // 流式回复已经在消息列表里占位，收尾时只更新字段，避免整条消息重建
  const streamingMessageId = ref(null)
  // 本轮生成的开始时刻，驱动消息头部的「已处理 …」实时计时
  const streamingStartedAt = ref(0)
  const isLoading = ref(false)
  const searching = ref(false)
  const imageGenerating = ref(false)
  const abortController = ref(null)
  let autoDistillRunning = false
  let pendingSearchConfirm = null

  // 传给回复引擎的流式状态，避免把整个 store 反向注入 service
  const replyState = {
    isLoading,
    streamingContent,
    streamingThinking,
    streamingParts,
    streamingStartedAt,
    abortController,
  }

  const branches = computed(() => conversation.value?.branches || [])
  const activeBranch = computed(() =>
    branches.value.find(b => b.id === activeBranchId.value) || branches.value[0] || null
  )
  const messages = computed(() => activeBranch.value?.messages || [])

  function loadMessages(topicId) {
    if (!topicId) {
      conversation.value = createConversation()
      activeBranchId.value = 'b-main'
      return
    }
    conversation.value = loadConversation(topicId)
    activeBranchId.value = conversation.value.activeBranchId
    // 一次性迁移：旧键 chat_messages_<id> 保留不动，可回退
    if (!hasStoredConversation(topicId) && hasLegacyConversation(topicId)) {
      saveMessages(topicId)
    }
  }

  function saveMessages(topicId) {
    const id = topicId ?? useTopicsStore().currentTopicId
    if (!id || !conversation.value) return
    conversation.value.activeBranchId = activeBranchId.value
    saveConversation(id, conversation.value)
  }

  function ensureConversation() {
    const topics = useTopicsStore()
    topics.ensureTopic()
    if (!conversation.value || !conversation.value.branches?.length) {
      conversation.value = createConversation()
    }
    let branch = conversation.value.branches.find(b => b.id === activeBranchId.value)
    if (!branch) {
      branch = conversation.value.branches[0]
      activeBranchId.value = branch.id
    }
    return { topics, topicId: topics.currentTopicId, branch }
  }

  function switchBranch(branchId) {
    if (!conversation.value) return
    if (!conversation.value.branches.some(b => b.id === branchId)) return
    activeBranchId.value = branchId
    saveMessages()
  }

  // 工具调用产生的导出动作：等最终回答入列后再执行
  function handlePendingExport(reply, branch, topics) {
    if (!reply?.pendingExport) return
    try {
      const settings = useSettingsStore()
      const payload = {
        title: topics.currentTopic?.title || '对话导出',
        messages: branch.messages,
        userName: settings.userName,
      }
      if (reply.pendingExport === 'pdf') printConversation(payload)
      else exportConversation({ format: reply.pendingExport, ...payload })
      window.__ui?.showToast('对话已导出', 'success')
    } catch (err) {
      console.error('[export] 工具调用导出失败', err)
      window.__ui?.showToast(`导出失败：${err?.message || '未知错误'}`, 'error', 4200)
    }
  }

  // 上一轮问过「要不要联网搜」：本轮按用户回答取回原问题，无论回答如何都只消费一次
  function takeSearchConfirm(topicId, text) {
    const pending = pendingSearchConfirm
    if (!pending) return ''
    pendingSearchConfirm = null
    if (pending.topicId !== topicId) return ''
    if (Date.now() - pending.at > SEARCH_CONFIRM_TTL_MS) return ''
    return detectSearchReply(text) === 'yes' ? pending.query : ''
  }

  // 生成期间先在消息列表里放一条占位消息，后续流式内容都渲染在同一个组件实例上
  function createStreamingPlaceholder(branch) {
    const msg = {
      id: newMessageId(),
      role: 'assistant',
      content: '',
      parts: [],
      streaming: true,
      ts: Date.now(),
    }
    branch.messages.push(msg)
    streamingMessageId.value = msg.id
    // 必须返回响应式代理：收尾时若通过原始对象写字段，不会触发依赖更新（上下文圆环会停在空占位的数值）
    return branch.messages[branch.messages.length - 1]
  }

  function finishStreamingPlaceholder(branch, msg, reply, prefix = '') {
    if (!msg) return
    msg.thinking = reply.thinking
    msg.parts = reply.parts ? (prefix ? [{ type: 'text', content: prefix }, ...reply.parts] : reply.parts) : undefined
    msg.content = prefix ? `${prefix}\n\n${reply.content}` : reply.content
    msg.images = reply.images
    msg.usage = reply.usage
    msg.duration = reply.duration
    delete msg.streaming
    if (streamingMessageId.value === msg.id) streamingMessageId.value = null
    if (branch && !branch.messages.includes(msg)) branch.messages.push(msg)
  }

  function dropStreamingPlaceholder(branch, msg) {
    if (!msg) return
    const idx = branch?.messages.indexOf(msg) ?? -1
    if (idx !== -1) branch.messages.splice(idx, 1)
    if (streamingMessageId.value === msg.id) streamingMessageId.value = null
  }

  async function sendMessage(userContent, images = [], documentIds = [], options = {}) {
    const settings = useSettingsStore()
    const { topics, topicId, branch } = ensureConversation()
    if (!topicId) return

    branch.messages.push({
      id: newMessageId(),
      role: 'user',
      content: userContent,
      // 斜杠指令：气泡里展示原始指令文本，实际发送的是转换后的提示词
      displayContent: options.displayText || undefined,
      images: images.length ? images : undefined,
      ts: Date.now(),
    })
    saveMessages(topicId)
    topics.touchTopic(topicId)

    // 自动更新标题
    const titleSource = options.displayText || userContent
    if (branch.messages.filter(m => m.role === 'user').length === 1) {
      topics.renameTopic(topicId, titleSource.slice(0, 30) + (titleSource.length > 30 ? '…' : ''))
    }

    // AI 生图技能：/画图 指令强制生图；否则仅在命中明确描述时交给副模型出图
    const forcedImage = options.forceImage === true
    let imagePrompt = ''
    if (forcedImage) imagePrompt = String(userContent || '').trim()
    else if (settings.imageGenSkillEnabled) imagePrompt = detectImageIntent(userContent, images.length > 0)
    if (forcedImage && !imagePrompt) {
      branch.messages.push({
        id: newMessageId(),
        role: 'assistant',
        content: '❌ 请在 /画图 后描述你想生成的画面，例如：/画图 一只在月球上晒太阳的橘猫',
        ts: Date.now(),
      })
      saveMessages(topicId)
      topics.touchTopic(topicId)
      return
    }
    if (imagePrompt) {
      if (!settings.secondaryReady) {
        branch.messages.push({
          id: newMessageId(),
          role: 'assistant',
          content: '❌ 生图需要副模型 API，目前尚未配置。\n\n请在「设置 → 模型设置 → 副模型 API」填写 Base URL、API Key、模型名与生图模型（支持任意 OpenAI 兼容服务，如智谱 glm-image）。主对话不受影响。',
          ts: Date.now(),
        })
        saveMessages(topicId)
        topics.touchTopic(topicId)
        return
      }
      imageGenerating.value = true
      try {
        const result = await generateImage(imagePrompt, {
          apiBase: settings.secondaryApiBase,
          apiKey: settings.secondaryApiKey,
          model: settings.secondaryImageModel || 'glm-image',
        })
        const imageSrc = result.ok ? (result.dataUrl || result.url) : ''
        branch.messages.push({
          id: newMessageId(),
          role: 'assistant',
          content: result.ok ? '已根据你的描述生成图片，点击图片可查看原图。' : `❌ ${result.message}`,
          images: imageSrc ? [imageSrc] : undefined,
          ts: Date.now(),
        })
        saveMessages(topicId)
        topics.touchTopic(topicId)
      } finally {
        imageGenerating.value = false
      }
      return
    }

    let searchNotice = ''
    let searchBlock = ''

    // 联网搜索：开关开启时每条都先搜；关闭时按本条消息的意图判断，闲聊不会触发网络请求
    const confirmQuery = takeSearchConfirm(topicId, userContent)
    if (settings.forceSearch || confirmQuery) {
      const prefetched = await runSearchPrefetch(confirmQuery || userContent, searching)
      searchNotice = prefetched.notice
      searchBlock = prefetched.block
    } else if (settings.searchSkillEnabled && String(settings.tavilyApiKey || '').trim()) {
      const intent = detectSearchIntent(userContent)
      if (intent === 'search') {
        const prefetched = await runSearchPrefetch(userContent, searching)
        searchNotice = prefetched.notice
        searchBlock = prefetched.block
      } else if (intent === 'confirm') {
        // 时效性存疑但不确定要搜：先正常回答，把要不要搜的选择留给用户
        pendingSearchConfirm = { topicId, query: userContent, at: Date.now() }
        searchNotice = '本次没有联网搜索；如果答案需要最新信息，回复「搜」我就查一下。'
      }
    }

    const history = branch.messages.slice()
    const streamMsg = createStreamingPlaceholder(branch)
    const reply = await generateReply(history, userContent, documentIds, searchBlock, {}, replyState)
    if (!reply) {
      dropStreamingPlaceholder(branch, streamMsg)
      return
    }

    const prefix = searchNotice
      ? `> ${String(searchNotice).trim().split('\n').join('\n> ')}`
      : ''
    // 多行提示逐行加引用前缀，避免 Markdown 结构断裂
    finishStreamingPlaceholder(branch, streamMsg, reply, prefix)
    saveMessages(topicId)
    topics.touchTopic(topicId)

    handlePendingExport(reply, branch, topics)

    // 首轮对话自动生成标题
    if (branch.messages.filter(m => m.role === 'user').length === 1) {
      generateTitle(topicId, userContent, reply.content)
    }

    // 记忆指令：提炼当前对话并保存到记忆
    if (detectMemoryCommand(userContent)) {
      const transcript = branch.messages
        .filter(m => m.content)
        .map(m => ({ role: m.role, content: m.content }))
      window.__ui?.showToast('正在提炼记忆…', 'info')
      saveMemoriesFromChat(userContent, transcript, settings)
    } else {
      runAutoDistill(branch, settings, userContent)
    }
  }

  function stopGeneration() {
    if (abortController.value) {
      abortController.value.abort()
    }
  }

  function clearMessages() {
    conversation.value = createConversation()
    activeBranchId.value = 'b-main'
    const topics = useTopicsStore()
    if (topics.currentTopicId) {
      saveMessages(topics.currentTopicId)
    }
  }

  /**
   * 从某条消息派生新分支：复制该消息及之前的历史，父分支保持不变。
   * replaceContent 用于「编辑后重新生成」，替换分支内最后一条用户消息内容。
   */
  function forkAt(messageId, replaceContent) {
    const { topics, topicId, branch } = ensureConversation()
    const idx = branch.messages.findIndex(m => m.id === messageId)
    if (idx === -1) return null

    const conv = conversation.value
    const name = `分支 ${conv.nextBranchNo}`
    conv.nextBranchNo += 1

    const newBranch = {
      id: newBranchId(),
      name,
      parentId: branch.id,
      forkOf: messageId,
      createdAt: Date.now(),
      messages: cloneMessagesForFork(branch.messages, idx, messageId),
    }
    if (typeof replaceContent === 'string') {
      const last = newBranch.messages[newBranch.messages.length - 1]
      last.content = replaceContent
      // 编辑后展示新的正文，不再沿用指令原文
      delete last.displayContent
    }

    conv.branches.push(newBranch)
    activeBranchId.value = newBranch.id
    saveMessages(topicId)
    topics.touchTopic(topicId)
    return { topics, topicId, branch: newBranch }
  }

  function branchFromMessage(messageId) {
    const res = forkAt(messageId)
    if (!res) {
      window.__ui?.showToast('未找到该消息', 'error')
      return
    }
    window.__ui?.showToast(`已创建「${res.branch.name}」，原对话保留`, 'success')
  }

  /**
   * 编辑用户消息：派生新分支，并在新分支内重新生成 AI 回复。
   */
  async function editAndRegenerate(messageId, newContent) {
    const content = String(newContent ?? '').trim()
    if (!content) return
    const { topics, branch } = ensureConversation()
    const idx = branch.messages.findIndex(m => m.id === messageId)
    if (idx === -1 || branch.messages[idx].role !== 'user') return

    const fork = forkAt(messageId, content)
    if (!fork) return

    const forkHistory = fork.branch.messages.slice()
    const streamMsg = createStreamingPlaceholder(fork.branch)
    const reply = await generateReply(forkHistory, content, [], '', {}, replyState)
    if (!reply) {
      dropStreamingPlaceholder(fork.branch, streamMsg)
      return
    }
    finishStreamingPlaceholder(fork.branch, streamMsg, reply)
    saveMessages(fork.topicId)
    topics.touchTopic(fork.topicId)
    handlePendingExport(reply, fork.branch, topics)
    window.__ui?.showToast(`已编辑并生成「${fork.branch.name}」，原对话保留`, 'success')
  }

  async function regenerateMessage(topicId, branch, msg, options = {}) {
    const idx = branch.messages.indexOf(msg)
    if (idx === -1 || msg.role !== 'assistant') return

    const history = branch.messages.slice(0, idx)
    // 原消息就地进入流式状态，重新生成的过渡不再移除/重建气泡
    msg.streaming = true
    streamingMessageId.value = msg.id
    const reply = await generateReply(history, undefined, [], '', options, replyState)
    if (!reply) {
      delete msg.streaming
      if (streamingMessageId.value === msg.id) streamingMessageId.value = null
      return
    }

    const versions = Array.isArray(msg.versions) && msg.versions.length
      ? msg.versions.slice()
      : [{ content: msg.content, thinking: msg.thinking, toolTrace: msg.toolTrace, parts: msg.parts, duration: msg.duration, ts: msg.ts || Date.now() }]
    versions.push({ content: reply.content, thinking: reply.thinking, parts: reply.parts, duration: reply.duration, ts: Date.now() })
    msg.versions = versions
    msg.activeVersion = versions.length - 1
    msg.content = reply.content
    msg.thinking = reply.thinking
    msg.parts = reply.parts
    msg.duration = reply.duration
    delete msg.streaming
    if (streamingMessageId.value === msg.id) streamingMessageId.value = null
    // 旧版工具链字段已被 parts 取代，避免旧数据残留显示
    delete msg.toolTrace
    if (reply.images?.length) msg.images = reply.images

    saveMessages(topicId)
    const topics = useTopicsStore()
    topics.touchTopic(topicId)
    handlePendingExport(reply, branch, topics)
  }

  /**
   * 重新生成 AI 回复：末条回复原地追加版本；非末条自动派生新分支，避免丢后续消息。
   */
  async function regenerate(messageId, options = {}) {
    const { topicId, branch } = ensureConversation()
    let target = messageId ? branch.messages.find(m => m.id === messageId) : null
    if (!target) {
      for (let i = branch.messages.length - 1; i >= 0; i--) {
        if (branch.messages[i].role === 'assistant') { target = branch.messages[i]; break }
      }
    }
    if (!target || target.role !== 'assistant') return

    const idx = branch.messages.indexOf(target)
    if (idx !== branch.messages.length - 1) {
      const fork = forkAt(target.id)
      if (!fork) return
      const cloned = fork.branch.messages[fork.branch.messages.length - 1]
      await regenerateMessage(fork.topicId, fork.branch, cloned, options)
      window.__ui?.showToast('已在新分支中重新生成', 'success')
      return
    }
    await regenerateMessage(topicId, branch, target, options)
  }

  // 用副模型回答同一条消息，结果作为新版本追加，可随时切回主模型版本
  async function regenerateWithSecondary(messageId) {
    const settings = useSettingsStore()
    if (!settings.secondaryReady) {
      window.__ui?.showToast('副模型尚未配置，请到 设置 → 模型设置 → 副模型 API 填写', 'error', 4200)
      return
    }
    await regenerate(messageId, { forceSecondary: true })
  }

  function setVersion(messageId, index) {
    const { topicId, branch } = ensureConversation()
    const msg = branch.messages.find(m => m.id === messageId)
    if (!msg || !Array.isArray(msg.versions) || !msg.versions.length) return
    const idx = Math.min(Math.max(0, index), msg.versions.length - 1)
    const v = msg.versions[idx]
    msg.activeVersion = idx
    msg.content = v.content
    msg.thinking = v.thinking
    msg.toolTrace = v.toolTrace
    msg.parts = v.parts
    msg.duration = v.duration
    saveMessages(topicId)
  }

  // 继续生成：续写指令只进入本次请求上下文，不写入会话，界面上不会出现「请继续」
  async function continueResponse() {
    const { topics, topicId, branch } = ensureConversation()
    if (!topicId) return

    const last = branch.messages[branch.messages.length - 1]
    if (!last || last.role !== 'assistant') {
      // 没有可续写的 AI 消息时保持原行为
      await sendMessage('请继续。')
      return
    }

    const history = [
      ...branch.messages,
      { role: 'user', content: '请继续。' },
    ]
    const streamMsg = createStreamingPlaceholder(branch)
    const reply = await generateReply(history, undefined, [], '', {}, replyState)
    if (!reply) {
      dropStreamingPlaceholder(branch, streamMsg)
      return
    }

    finishStreamingPlaceholder(branch, streamMsg, reply)
    saveMessages(topicId)
    topics.touchTopic(topicId)
    handlePendingExport(reply, branch, topics)
  }

  // 删除单条消息（支持消息 id 或下标）
  function deleteMessage(target) {
    const { topicId, branch } = ensureConversation()
    const idx = typeof target === 'number'
      ? target
      : branch.messages.findIndex(m => m.id === target)
    if (idx < 0 || idx >= branch.messages.length) return
    branch.messages.splice(idx, 1)
    saveMessages(topicId)
    useTopicsStore().touchTopic(topicId)
  }

  // 自动生成话题标题
  async function generateTitle(topicId, userMsg, aiReply) {
    const settings = useSettingsStore()
    const topics = useTopicsStore()
    try {
      const prompt = `请用 3~8 个字概括以下对话的主题，只返回标题，不要加引号或句号。\n用户：${userMsg.slice(0, 100)}\nAI：${aiReply.slice(0, 200)}`
      const controller = new AbortController()
      let title = ''
      const usage = await sendChatRequest({
        apiBase: settings.apiBase,
        apiKey: settings.apiKey,
        model: settings.model,
        temperature: 0.3,
        maxTokens: 50,
        topP: 0.9,
        thinkingEnabled: false,
        messages: [{ role: 'user', content: prompt }],
        signal: controller.signal,
        onChunk: ({ text }) => { title += text },
      })
      if (usage) recordUsage({ ...usage, model: settings.model, estimated: false })
      title = title.trim().replace(/[""「」『』《》]/g, '').slice(0, 20)
      if (title) topics.renameTopic(topicId, title)
    } catch { /* 静默失败 */ }
  }

  // 自动记忆沉淀：把 store 内的运行标记交给服务层管理
  function runAutoDistill(branch, settings, userContent) {
    maybeAutoDistill(branch, settings, userContent, {
      isRunning: () => autoDistillRunning,
      setRunning: value => { autoDistillRunning = value },
    })
  }

  return {
    conversation, branches, activeBranchId, activeBranch, messages,
    streamingContent, streamingThinking, streamingParts, streamingMessageId, streamingStartedAt, isLoading, searching, imageGenerating,
    loadMessages, saveMessages, sendMessage, stopGeneration, clearMessages,
    regenerate, regenerateWithSecondary, setVersion, branchFromMessage, editAndRegenerate, switchBranch,
    continueResponse, deleteMessage, buildSystemPrompt,
  }
})
