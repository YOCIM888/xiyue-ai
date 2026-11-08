import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useTopicsStore } from './topics'
import { useSettingsStore } from './settings'
import { useMemoryStore } from './memory'
import { sendChatRequest } from '../services/api'
import { attachLinkContext } from '../services/linkReader'
import { detectMemoryCommand, extractMemoryEntries } from '../services/memory'
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
// 系统提示词文件（Vite 构建时内联，零延迟）
import systemPromptRaw from '../../public/prompt/system.md?raw'

export const useChatStore = defineStore('chat', () => {
  const conversation = ref(createConversation())
  const activeBranchId = ref('b-main')
  const streamingContent = ref('')
  const streamingThinking = ref('')
  const isLoading = ref(false)
  const abortController = ref(null)

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

  async function generateReply(history, linkText) {
    const settings = useSettingsStore()
    isLoading.value = true
    streamingContent.value = ''
    streamingThinking.value = ''

    let fullContent = ''
    let fullThinking = ''
    try {
      const controller = new AbortController()
      abortController.value = controller

      const systemPrompt = buildSystemPrompt()
      const chatMessages = systemPrompt
        ? [{ role: 'system', content: systemPrompt }, ...history.map(m => ({ role: m.role, content: m.content, images: m.images }))]
        : history.map(m => ({ role: m.role, content: m.content, images: m.images }))

      let apiMessages = chatMessages
      if (settings.linkSkillEnabled && linkText) {
        apiMessages = await attachLinkContext(chatMessages, linkText)
      }

      await sendChatRequest({
        apiBase: settings.apiBase,
        apiKey: settings.apiKey,
        model: settings.model,
        temperature: settings.temperature,
        maxTokens: settings.maxTokens,
        contextLength: settings.contextLength,
        topP: settings.topP,
        thinkingEnabled: settings.thinkingEnabled,
        messages: apiMessages,
        signal: controller.signal,
        onChunk: ({ type, text }) => {
          if (type === 'thinking') {
            fullThinking += text
            streamingThinking.value = fullThinking
          } else {
            fullContent += text
            streamingContent.value = fullContent
          }
        },
      })

      return { content: fullContent, thinking: fullThinking || undefined }
    } catch (err) {
      if (err.name === 'AbortError') {
        if (fullContent || fullThinking) {
          return { content: `${fullContent}\n\n*[已中止]*`, thinking: fullThinking || undefined }
        }
        return null
      }
      return { content: `❌ 错误: ${err.message}` }
    } finally {
      isLoading.value = false
      streamingContent.value = ''
      streamingThinking.value = ''
      abortController.value = null
    }
  }

  async function sendMessage(userContent, images = []) {
    const settings = useSettingsStore()
    const { topics, topicId, branch } = ensureConversation()
    if (!topicId) return

    branch.messages.push({
      id: newMessageId(),
      role: 'user',
      content: userContent,
      images: images.length ? images : undefined,
      ts: Date.now(),
    })
    saveMessages(topicId)
    topics.touchTopic(topicId)

    // 自动更新标题
    if (branch.messages.filter(m => m.role === 'user').length === 1) {
      topics.renameTopic(topicId, userContent.slice(0, 30) + (userContent.length > 30 ? '…' : ''))
    }

    const history = branch.messages.slice()
    const reply = await generateReply(history, userContent)
    if (!reply) return

    branch.messages.push({
      id: newMessageId(),
      role: 'assistant',
      thinking: reply.thinking,
      content: reply.content,
      ts: Date.now(),
    })
    saveMessages(topicId)
    topics.touchTopic(topicId)

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
    const { topics, topicId, branch } = ensureConversation()
    const idx = branch.messages.findIndex(m => m.id === messageId)
    if (idx === -1 || branch.messages[idx].role !== 'user') return

    const fork = forkAt(messageId, content)
    if (!fork) return

    const reply = await generateReply(fork.branch.messages.slice(), content)
    if (reply) {
      fork.branch.messages.push({
        id: newMessageId(),
        role: 'assistant',
        thinking: reply.thinking,
        content: reply.content,
        ts: Date.now(),
      })
      saveMessages(fork.topicId)
      topics.touchTopic(fork.topicId)
    }
    window.__ui?.showToast(`已编辑并生成「${fork.branch.name}」，原对话保留`, 'success')
  }

  async function regenerateMessage(topicId, branch, msg) {
    const idx = branch.messages.indexOf(msg)
    if (idx === -1 || msg.role !== 'assistant') return

    const reply = await generateReply(branch.messages.slice(0, idx))
    if (!reply) return

    const versions = Array.isArray(msg.versions) && msg.versions.length
      ? msg.versions.slice()
      : [{ content: msg.content, thinking: msg.thinking, ts: msg.ts || Date.now() }]
    versions.push({ content: reply.content, thinking: reply.thinking, ts: Date.now() })
    msg.versions = versions
    msg.activeVersion = versions.length - 1
    msg.content = reply.content
    msg.thinking = reply.thinking

    saveMessages(topicId)
    useTopicsStore().touchTopic(topicId)
  }

  /**
   * 重新生成 AI 回复：末条回复原地追加版本；非末条自动派生新分支，避免丢后续消息。
   */
  async function regenerate(messageId) {
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
      await regenerateMessage(fork.topicId, fork.branch, cloned)
      window.__ui?.showToast('已在新分支中重新生成', 'success')
      return
    }
    await regenerateMessage(topicId, branch, target)
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
    saveMessages(topicId)
  }

  // 继续生成
  async function continueResponse() {
    await sendMessage('请继续。')
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
      await sendChatRequest({
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
      title = title.trim().replace(/[""「」『』《》]/g, '').slice(0, 20)
      if (title) topics.renameTopic(topicId, title)
    } catch { /* 静默失败 */ }
  }

  // 提炼并保存记忆（后台执行，不阻塞对话）
  async function saveMemoriesFromChat(userText, transcript, settings) {
    const memory = useMemoryStore()
    try {
      const entries = await extractMemoryEntries({
        apiBase: settings.apiBase,
        apiKey: settings.apiKey,
        model: settings.model,
        temperature: settings.temperature,
        messages: transcript,
        userText,
      })
      if (!entries.length) return
      let added = 0
      for (const entry of entries) {
        const exists = memory.memories.some(m => m.title === entry.title && m.content === entry.content)
        if (exists) continue
        memory.create(entry.title, entry.content, 'chat')
        added++
      }
      if (added) window.__ui?.showToast(`已存入记忆：${added} 条`, 'success')
      else window.__ui?.showToast('这些内容已在记忆中', 'info')
    } catch {
      window.__ui?.showToast('记忆保存失败，请检查模型配置', 'error')
    }
  }

  function buildSystemPrompt() {
    const settings = useSettingsStore()
    // 系统提示词从文件内联加载（构建时嵌入），零延迟永不失效
    const externalPrompt = systemPromptRaw || ''
    const persona = settings.personaPrompt || ''
    const userName = settings.userName || ''
    const personaOn = settings.personaEnabled

    const parts = []
    if (personaOn && persona.trim()) {
      // 人设优先：只发人设，忽略系统提示词
      parts.push(persona.trim())
    } else {
      // 系统提示词优先（默认）
      if (externalPrompt.trim()) {
        parts.push(externalPrompt.trim())
      }
    }
    if (userName.trim()) {
      parts.push(`\n\n【用户信息】\n当前与你对话的用户名叫"${userName.trim()}"，请在交流中使用此名称称呼用户，并以此判断用户身份。`)
    }

    // 长期记忆：用户未禁用时在所有对话中生效
    const memory = useMemoryStore()
    if (memory.enabled && memory.memories.length) {
      const lines = memory.memories
        .map(m => `- ${m.title}：${m.content}`)
        .join('\n')
      parts.push(`\n\n【长期记忆】\n以下是用户要求你在所有对话中长期记住的信息，请结合这些内容回答，不要遗漏：\n${lines}`)
    }
    return parts.join('')
  }

  return {
    conversation, branches, activeBranchId, activeBranch, messages,
    streamingContent, streamingThinking, isLoading,
    loadMessages, saveMessages, sendMessage, stopGeneration, clearMessages,
    regenerate, setVersion, branchFromMessage, editAndRegenerate, switchBranch,
    continueResponse, deleteMessage, buildSystemPrompt,
  }
})
