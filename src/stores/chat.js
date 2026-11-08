import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useTopicsStore } from './topics'
import { useSettingsStore } from './settings'
import { useMemoryStore } from './memory'
import { useAssetsStore } from './assets'
import { sendChatRequest } from '../services/api'
import { attachLinkContext, appendContextToLastUser } from '../services/linkReader'
import {
  detectSearchIntent,
  detectSearchReply,
  searchWeb,
  buildSearchContext,
} from '../services/webSearch'
import { detectImageIntent, generateImage } from '../services/imageGen'
import {
  detectVisionSupport,
  isVisionUnsupportedError,
  prepareOcrImages,
  OCR_INSTRUCTION,
  OCR_MAX_IMAGES,
} from '../services/ocr'
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
import { buildMainChatMemoryContext } from '../utils/memoryContext'
// 系统提示词文件（Vite 构建时内联，零延迟）
import systemPromptRaw from '../../public/prompt/system.md?raw'

export const useChatStore = defineStore('chat', () => {
  const conversation = ref(createConversation())
  const activeBranchId = ref('b-main')
  const streamingContent = ref('')
  const streamingThinking = ref('')
  const isLoading = ref(false)
  const searching = ref(false)
  const imageGenerating = ref(false)
  const abortController = ref(null)
  // 等待用户确认「要不要联网搜索」的原问题
  const pendingSearch = ref(null)

  const branches = computed(() => conversation.value?.branches || [])
  const activeBranch = computed(() =>
    branches.value.find(b => b.id === activeBranchId.value) || branches.value[0] || null
  )
  const messages = computed(() => activeBranch.value?.messages || [])

  function loadMessages(topicId) {
    pendingSearch.value = null
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

  async function generateReply(history, linkText, documentIds = [], searchBlock = '') {
    const settings = useSettingsStore()
    const ocrEnabled = !!settings.ocrSkillEnabled
    const lastUser = [...history].reverse().find(m => m.role === 'user')
    const hasImages = Array.isArray(lastUser?.images) && lastUser.images.length > 0

    // 副模型已配置时，带图片的请求交给副模型（多模态）；否则沿用主模型
    const useSecondary = ocrEnabled && hasImages && !!settings.secondaryReady
    const activeApiBase = useSecondary ? settings.secondaryApiBase : settings.apiBase
    const activeApiKey = useSecondary ? settings.secondaryApiKey : settings.apiKey
    const activeModel = useSecondary ? settings.secondaryModel : settings.model

    // 没有副模型，且主模型明确是纯文本：直接提示，不发起请求
    if (ocrEnabled && hasImages && !useSecondary &&
      detectVisionSupport(settings.model, settings.apiBase, settings.modelVisionMode) === 'text') {
      return {
        content: `⚠️ 当前主模型「${settings.model}」是纯文本模型，无法读取图片。\n\n` +
          `图片理解 / OCR 需要视觉模型。请在「设置 → 模型设置 → 副模型 API」中配置智谱 GLM-4.6V（或其他视觉模型）后再发图。\n` +
          `主对话仍可正常使用，不受影响。\n\n` +
          `提示：这不是本地 OCR，应用不会在设备上识别文字。`,
      }
    }

    isLoading.value = true
    streamingContent.value = ''
    streamingThinking.value = ''

    let fullContent = ''
    let fullThinking = ''
    let imageNotice = ''
    try {
      const controller = new AbortController()
      abortController.value = controller

      // 图片理解开启时先压缩并控制数量；关闭时保持原有行为
      let historyForRequest = history
      if (ocrEnabled && hasImages) {
        const prepared = await prepareOcrImages(lastUser.images)
        historyForRequest = history.map(m => (m === lastUser ? { ...m, images: prepared.images } : m))
        if (prepared.dropped > 0) {
          imageNotice = `本次共 ${lastUser.images.length} 张图片，为控制上下文体积，仅前 ${OCR_MAX_IMAGES} 张参与识别。`
          window.__ui?.showToast(imageNotice, 'info', 3600)
        }
      }

      const systemPrompt = buildSystemPrompt()
      const chatMessages = systemPrompt
        ? [{ role: 'system', content: systemPrompt }, ...historyForRequest.map(m => ({ role: m.role, content: m.content, images: m.images }))]
        : historyForRequest.map(m => ({ role: m.role, content: m.content, images: m.images }))

      let apiMessages = chatMessages
      if (settings.linkSkillEnabled && linkText) {
        apiMessages = await attachLinkContext(chatMessages, linkText)
      }
      if (settings.documentSkillEnabled && documentIds.length) {
        const { attachDocumentContext } = await import('../services/documentParser')
        const assetsStore = useAssetsStore()
        const documents = documentIds
          .map(id => assetsStore.assets.find(a => a.id === id))
          .filter(Boolean)
        if (documents.length) {
          apiMessages = attachDocumentContext(apiMessages, documents)
        }
      }
      if (searchBlock) {
        apiMessages = appendContextToLastUser(apiMessages, searchBlock)
      }
      if (ocrEnabled && hasImages) {
        apiMessages = appendContextToLastUser(apiMessages, OCR_INSTRUCTION)
      }

      await sendChatRequest({
        apiBase: activeApiBase,
        apiKey: activeApiKey,
        model: activeModel,
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

      const content = imageNotice ? `> ${imageNotice}\n\n${fullContent}` : fullContent
      return { content, thinking: fullThinking || undefined }
    } catch (err) {
      if (err.name === 'AbortError') {
        if (fullContent || fullThinking) {
          return { content: `${fullContent}\n\n*[已中止]*`, thinking: fullThinking || undefined }
        }
        return null
      }
      const message = String(err?.message || err || '')
      if (ocrEnabled && hasImages && isVisionUnsupportedError(message)) {
        return {
          content: useSecondary
            ? `⚠️ 图片理解失败：副模型「${activeModel}」似乎不支持图片输入。\n\n` +
              `接口返回：${message}\n\n` +
              `请在「设置 → 模型设置 → 副模型 API」换成视觉模型（如 glm-4.6v / glm-4.6v-flash）后重试。`
            : `⚠️ 图片理解失败：当前模型「${activeModel}」似乎不支持图片输入。\n\n` +
              `接口返回：${message}\n\n` +
              `可以：1) 在「设置 → 模型设置 → 副模型 API」配置视觉模型；2) 或先把图片里的文字复制成文本再发送。\n\n` +
              `提示：图片理解依赖模型视觉能力，不是本地 OCR。`,
        }
      }
      return { content: `❌ 错误: ${message}` }
    } finally {
      isLoading.value = false
      streamingContent.value = ''
      streamingThinking.value = ''
      abortController.value = null
    }
  }

  async function sendMessage(userContent, images = [], documentIds = []) {
    const settings = useSettingsStore()
    const { topics, topicId, branch } = ensureConversation()
    if (!topicId) return

    const pending = pendingSearch.value
    let confirmedQuery = ''
    let confirmedSearch = false
    let declinedSearch = false

    if (pending) {
      const sameConversation = pending.topicId === topicId && pending.branchId === branch.id
      if (settings.searchSkillEnabled && sameConversation) {
        const kind = detectSearchReply(userContent)
        if (kind === 'yes') {
          confirmedQuery = pending.query
          confirmedSearch = true
        } else if (kind === 'no') {
          declinedSearch = true
        }
      }
      pendingSearch.value = null
    }

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

    // AI 生图技能：命中明确的生图描述时交给副模型出图，不再走普通对话
    const imagePrompt = settings.imageGenSkillEnabled
      ? detectImageIntent(userContent, images.length > 0)
      : ''
    if (imagePrompt) {
      if (!settings.secondaryReady) {
        branch.messages.push({
          id: newMessageId(),
          role: 'assistant',
          content: '❌ 生图需要副模型 API，目前尚未配置。\n\n请在「设置 → 模型设置 → 副模型 API」填写 Base URL、API Key 与模型名（智谱可用 glm-4.6v 系列），并选择生图模型（如 glm-image）。主对话不受影响。',
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

    if (declinedSearch) {
      branch.messages.push({
        id: newMessageId(),
        role: 'assistant',
        content: '好的，不联网搜索。你可以继续直接提问。',
        ts: Date.now(),
      })
      saveMessages(topicId)
      topics.touchTopic(topicId)
      return
    }

    let intent = 'none'
    if (confirmedSearch) intent = 'search'
    else if (settings.searchSkillEnabled) intent = detectSearchIntent(userContent)

    let searchNotice = ''

    // 意图不明确时先问一句，不直接发请求；没配 Key 时问了也搜不了，直接提示
    if (intent === 'confirm') {
      if (!String(settings.tavilyApiKey || '').trim()) {
        searchNotice = '未配置 Tavily API Key，已跳过联网搜索。请在 设置 → 搜索服务 中填写。'
        window.__ui?.showToast(searchNotice, 'error', 4500)
      } else {
        pendingSearch.value = { query: userContent, topicId, branchId: branch.id }
        branch.messages.push({
          id: newMessageId(),
          role: 'assistant',
          content: '这个问题可能需要联网确认最新信息。要我用 Tavily 搜一下再回答吗？回复「搜」即可；不想搜就回复「不用」。',
          ts: Date.now(),
        })
        saveMessages(topicId)
        topics.touchTopic(topicId)
        return
      }
    }

    let searchBlock = ''
    if (intent === 'search') {
      const query = confirmedSearch ? confirmedQuery : userContent
      const apiKey = String(settings.tavilyApiKey || '').trim()

      if (!apiKey) {
        const msg = '未配置 Tavily API Key，已跳过联网搜索。请在 设置 → 搜索服务 中填写。'
        searchNotice = msg
        window.__ui?.showToast(msg, 'error', 4500)
        if (confirmedSearch) {
          branch.messages.push({
            id: newMessageId(),
            role: 'assistant',
            content: msg,
            ts: Date.now(),
          })
          saveMessages(topicId)
          topics.touchTopic(topicId)
          return
        }
      } else {
        // 搜索期间用 AI 气泡提示，搜索完成后直接进入生成
        searching.value = true
        let result
        try {
          result = await searchWeb(query, {
            apiKey,
            depth: settings.searchDepth,
            maxResults: settings.searchMaxResults,
          })
        } finally {
          searching.value = false
        }

        if (result.ok) {
          const built = buildSearchContext(query, result)
          searchBlock = built.text
          if (built.truncated) {
            window.__ui?.showToast('搜索结果较长，已截断至 6000 字后注入', 'info', 3200)
          }
        } else {
          searchNotice = result.message
          window.__ui?.showToast(result.message, 'error', 4500)
          if (confirmedSearch) {
            branch.messages.push({
              id: newMessageId(),
              role: 'assistant',
              content: result.message,
              ts: Date.now(),
            })
            saveMessages(topicId)
            topics.touchTopic(topicId)
            return
          }
        }
      }
    }

    const history = branch.messages.slice()
    const reply = await generateReply(history, userContent, documentIds, searchBlock)
    if (!reply) return

    branch.messages.push({
      id: newMessageId(),
      role: 'assistant',
      thinking: reply.thinking,
      content: searchNotice ? `> ${searchNotice}\n\n${reply.content}` : reply.content,
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
    pendingSearch.value = null
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

    // 长期记忆：主记忆未禁用时生效，读取有上限
    const memory = useMemoryStore()
    const memorySection = buildMainChatMemoryContext(memory)
    if (memorySection) parts.push('\n\n' + memorySection)
    return parts.join('')
  }

  return {
    conversation, branches, activeBranchId, activeBranch, messages,
    streamingContent, streamingThinking, isLoading, searching, imageGenerating,
    loadMessages, saveMessages, sendMessage, stopGeneration, clearMessages,
    regenerate, setVersion, branchFromMessage, editAndRegenerate, switchBranch,
    continueResponse, deleteMessage, buildSystemPrompt,
  }
})
