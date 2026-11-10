import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useTopicsStore } from './topics'
import { useSettingsStore } from './settings'
import { useMemoryStore } from './memory'
import { useAssetsStore } from './assets'
import { sendChatRequest } from '../services/api'
import { attachLinkContext, appendContextToLastUser } from '../services/linkReader'
import {
  searchWeb,
  buildSearchContext,
  buildSearchFallbackText,
} from '../services/webSearch'
import { buildSearchQuery, detectTimeRange } from '../services/searchQuery'
import { recordUsage } from '../services/usageStats'
import { estimateMessagesTokens } from '../utils/contextUsage'
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
import { buildToolPrompt, extractToolCalls, executeToolCall, stripToolBlocks, stripStreamingToolBlocks, createWriteBudget } from '../services/tools'
import { beginWorkspaceTask } from '../services/workspaceActivity'
import { exportConversation, printConversation } from '../services/conversationExport'
// 系统提示词文件（Vite 构建时内联，零延迟）
import systemPromptRaw from '../../public/prompt/system.md?raw'

export const useChatStore = defineStore('chat', () => {
  const conversation = ref(createConversation())
  const activeBranchId = ref('b-main')
  const streamingContent = ref('')
  const streamingThinking = ref('')
  // 分段渲染：文字段落与内联工具卡片按顺序排列，调用工具时消息内容留在原位
  const streamingParts = ref([])
  // 流式回复已经在消息列表里占位，收尾时只更新字段，避免整条消息重建
  const streamingMessageId = ref(null)
  const isLoading = ref(false)
  const searching = ref(false)
  const imageGenerating = ref(false)
  const abortController = ref(null)
  let autoDistillRunning = false

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

  // 服务商未返回 usage 时按字符估算，并标记 estimated
  function buildEstimatedUsage(messages, content, model) {
    const list = (Array.isArray(messages) ? messages : [])
      .map(m => ({ role: m?.role, content: m?.content }))
    const prompt = estimateMessagesTokens(list)
    const completion = content ? estimateMessagesTokens([{ role: 'assistant', content }]) : 0
    return { prompt, completion, total: prompt + completion, model: model || '未知模型', estimated: true }
  }

  function sumUsage(list, model) {
    const prompt = list.reduce((acc, u) => acc + (Number(u?.prompt) || 0), 0)
    const completion = list.reduce((acc, u) => acc + (Number(u?.completion) || 0), 0)
    return {
      prompt,
      completion,
      total: prompt + completion,
      model: list[list.length - 1]?.model || model || '未知模型',
      estimated: list.some(u => u?.estimated),
    }
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

  async function generateReply(history, linkText, documentIds = [], searchBlock = '', options = {}) {
    const settings = useSettingsStore()
    const ocrEnabled = !!settings.ocrSkillEnabled
    const lastUser = [...history].reverse().find(m => m.role === 'user')
    const hasImages = Array.isArray(lastUser?.images) && lastUser.images.length > 0

    const visionSupport = detectVisionSupport(settings.model, settings.apiBase, settings.modelVisionMode)
    const hasSecondary = !!settings.secondaryReady
    // 主模型明确为纯文本时才让副模型先接手；手动/自动判定支持视觉或能力未知时，主模型优先
    const preferMainVision = visionSupport !== 'text'
    const useSecondary = ocrEnabled && hasImages && !preferMainVision && hasSecondary

    // 没有副模型，且主模型明确是纯文本：直接提示，不发起请求
    if (ocrEnabled && hasImages && !preferMainVision && !hasSecondary) {
      return {
        content: `⚠️ 当前主模型「${settings.model}」是纯文本模型，无法读取图片。\n\n` +
          `图片理解 / OCR 需要视觉模型。请在「设置 → 模型设置 → 副模型 API」中配置一个视觉模型后再发图。\n` +
          `主对话仍可正常使用，不受影响。\n\n` +
          `提示：这不是本地 OCR，应用不会在设备上识别文字。`,
      }
    }

    isLoading.value = true
    streamingContent.value = ''
    streamingThinking.value = ''
    streamingParts.value = []
    beginWorkspaceTask()

    let fullContent = ''
    let fullThinking = ''
    const parts = []
    const usageList = []
    let imageNotice = ''
    let attemptedModel = useSecondary ? settings.secondaryModel : settings.model
    let attemptedSecondary = useSecondary
    let fellBackToSecondary = false
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
      const historyForApi = historyForRequest.map(m => ({
        role: m.role,
        content: m.content,
        // 只回传用户上传的图片；助手侧截图/生图仅用于展示，避免后续轮次重复占用上下文
        images: m.role === 'user' ? m.images : undefined,
      }))
      const chatMessages = systemPrompt
        ? [{ role: 'system', content: systemPrompt }, ...historyForApi]
        : historyForApi

      let apiMessages = chatMessages
      if (settings.linkSkillEnabled && linkText) {
        apiMessages = await attachLinkContext(chatMessages, linkText)
      }
      if (settings.documentSkillEnabled && documentIds.length) {
        const { retrieveDocumentContext } = await import('../services/docRetrieval')
        const assetsStore = useAssetsStore()
        const documents = documentIds
          .map(id => assetsStore.assets.find(a => a.id === id))
          .filter(Boolean)
        if (documents.length) {
          // 长文档按当前问题做切片检索；短文档仍整篇注入
          const retrieval = retrieveDocumentContext(apiMessages, documents, lastUser?.content || '')
          apiMessages = retrieval.messages
        }
      }
      if (searchBlock) {
        apiMessages = appendContextToLastUser(apiMessages, searchBlock)
      }
      if (ocrEnabled && hasImages) {
        apiMessages = appendContextToLastUser(apiMessages, OCR_INSTRUCTION)
      }

      // 每次尝试前清空流式内容，避免上一次失败的半截输出混进结果
      const requestChat = async ({ apiBase, apiKey, model, secondary, messages = apiMessages }) => {
        attemptedModel = model
        attemptedSecondary = secondary
        fullContent = ''
        fullThinking = ''
        streamingContent.value = ''
        streamingThinking.value = ''
        const usage = await sendChatRequest({
          apiBase,
          apiKey,
          model,
          temperature: settings.temperature,
          maxTokens: settings.maxTokens,
          contextLength: settings.contextLength,
          topP: settings.topP,
          thinkingEnabled: settings.thinkingEnabled,
          reasoningEffort: settings.reasoningEffort,
          messages,
          signal: controller.signal,
          onChunk: ({ type, text }) => {
            if (type === 'thinking') {
              fullThinking += text
              streamingThinking.value = fullThinking
            } else {
              fullContent += text
              streamingContent.value = stripStreamingToolBlocks(fullContent)
            }
          },
        })
        // 服务商返回 usage 时优先采用；没有返回则保留 null，由下方按字符估算
        const usageEntry = usage ? { ...usage, model, estimated: false } : null
        if (usageEntry) usageList.push(usageEntry)
      }

      const askMain = (messages = apiMessages) => requestChat({
        apiBase: settings.apiBase,
        apiKey: settings.apiKey,
        model: settings.model,
        secondary: false,
        messages,
      })
      const askSecondary = (messages = apiMessages) => requestChat({
        apiBase: settings.secondaryApiBase,
        apiKey: settings.secondaryApiKey,
        model: settings.secondaryModel,
        secondary: true,
        messages,
      })

      if (options.forceSecondary) {
        // 手动指定用副模型回答
        await askSecondary()
      } else if (ocrEnabled && hasImages && preferMainVision) {
        // 主模型优先处理图片；无法识别或请求失败时才自动切到副模型
        try {
          await askMain()
        } catch (err) {
          if (err?.name === 'AbortError' || !hasSecondary) throw err
          fellBackToSecondary = true
          await askSecondary()
        }
      } else if (useSecondary) {
        await askSecondary()
      } else {
        await askMain()
      }

      // 工具调用循环：模型显式选择搜索、读文档、计算、画图、生图、导出
      const chartOptions = []
      const toolImages = []
      let latestBrowserShot = null
      let pendingExport = null
      let toolMessages = apiMessages
      let toolRounds = 0
      let toolImagesRejected = false
      const MAX_TOOL_ROUNDS = settings.workModeEnabled ? 20 : settings.browserSkillEnabled ? 8 : 3
      const toolCallLimit = Math.max(1, Math.min(200, Number(settings.maxToolCallsPerRound) || 10))
      const writeBudget = createWriteBudget()

      while (toolRounds < MAX_TOOL_ROUNDS) {
        const calls = extractToolCalls(fullContent, toolCallLimit)
        if (!calls.length) break
        toolRounds += 1
        const isLastRound = toolRounds >= MAX_TOOL_ROUNDS
        const previousContent = fullContent
        const previousThinking = fullThinking

        // 本轮文字就地保留，工具卡片紧跟其后；清空的只有正在流式的临时区
        const visibleText = stripToolBlocks(previousContent).trim()
        if (visibleText) {
          parts.push({ type: 'text', content: visibleText })
        }
        const roundPart = {
          type: 'trace',
          round: toolRounds,
          running: true,
          status: `正在执行工具（${calls.length}）…`,
          thinking: previousThinking.trim(),
          steps: [],
          notes: [],
        }
        parts.push(roundPart)
        streamingParts.value = parts.slice()
        streamingContent.value = ''
        streamingThinking.value = ''

        const results = []
        for (let index = 0; index < calls.length; index += 1) {
          const call = calls[index]
          if (controller.signal.aborted) break
          roundPart.status = `正在执行 ${call.tool}（${index + 1}/${calls.length}）…`
          streamingParts.value = parts.slice()
          let result
          try {
            result = await executeToolCall(call, {
              settings,
              signal: controller.signal,
              documentIds,
              budget: writeBudget,
              onStatus: text => {
                if (text) {
                  roundPart.status = text
                  streamingParts.value = parts.slice()
                }
              },
            })
          } catch (err) {
            result = { ok: false, text: err?.message || String(err), record: `工具执行失败：${err?.message || err}` }
          }
          results.push({ call, result })
          roundPart.steps.push({
            tool: call.tool,
            ok: !!result.ok,
            summary: String(result.record || (result.ok ? '完成' : result.text) || '').slice(0, 300),
            output: String(result.text || '').slice(0, 1200),
          })
          if (result.chartOption) chartOptions.push(result.chartOption)
          if (Array.isArray(result.images)) {
            if (call.tool === 'browser') latestBrowserShot = result.images[0] || latestBrowserShot
            else toolImages.push(...result.images)
          }
          if (result.exportFormat) pendingExport = result.exportFormat
          streamingParts.value = parts.slice()
        }
        roundPart.running = false
        delete roundPart.status
        streamingParts.value = parts.slice()

        if (controller.signal.aborted) {
          throw Object.assign(new Error('Aborted'), { name: 'AbortError' })
        }

        let resultsText = results
          .map(({ call, result }) => `工具：${call.tool}\n状态：${result.ok ? '成功' : '失败'}\n${String(result.text || '').slice(0, 8000)}`)
          .join('\n\n')

        const visionImages = results
          .filter(({ call }) => call.tool === 'browser')
          .flatMap(({ result }) => result.visionImages || [])
          .slice(-2)
        const activeModel = attemptedSecondary ? settings.secondaryModel : settings.model
        const activeBase = attemptedSecondary ? settings.secondaryApiBase : settings.apiBase
        const modelSeesImages = detectVisionSupport(activeModel, activeBase, settings.modelVisionMode) !== 'text'
        const imagesForModel = modelSeesImages && !toolImagesRejected ? visionImages : []
        if (visionImages.length && !modelSeesImages) {
          resultsText += '\n\n（当前模型不支持查看截图，请依据页面正文和元素列表继续操作。）'
        }

        toolMessages = [
          ...toolMessages.map(message =>
            message.toolResult && message.images ? { ...message, images: undefined } : message
          ),
          { role: 'assistant', content: previousContent },
          {
            role: 'user',
            content: `【工具执行结果】\n${resultsText}\n\n请基于以上真实结果继续回答。不要编造结果，也不要重复调用已经成功的工具。${
              isLastRound ? '这是最后一轮，请直接给出最终回答，不要再调用工具。' : '如仍需其他工具，可以继续调用。'
            }`,
            images: imagesForModel.length ? imagesForModel : undefined,
            toolResult: true,
          },
        ]

        let requestError = null
        try {
          await (attemptedSecondary ? askSecondary : askMain)(toolMessages)
        } catch (err) {
          requestError = err
        }
        // 模型能力未知且服务端拒绝图片时，退回纯文本结果重试一次
        if (requestError && imagesForModel.length && isVisionUnsupportedError(requestError?.message || '')) {
          roundPart.notes.push('当前模型不支持截图，已改用页面文本继续')
          streamingParts.value = parts.slice()
          toolImagesRejected = true
          const textOnlyMessages = toolMessages.map((message, index) =>
            index === toolMessages.length - 1 ? { ...message, images: undefined } : message
          )
          toolMessages = textOnlyMessages
          fullContent = previousContent
          fullThinking = previousThinking
          try {
            await (attemptedSecondary ? askSecondary : askMain)(textOnlyMessages)
            requestError = null
          } catch (err) {
            requestError = err
          }
        }
        if (requestError) {
          fullContent = stripToolBlocks(previousContent).trim()
          fullThinking = previousThinking
          streamingContent.value = ''
          const note = requestError?.name === 'AbortError'
            ? '最终回答已中止，以上为工具执行与原始回答'
            : `最终回答生成失败：${requestError?.message || requestError}`
          roundPart.notes.push(note)
          streamingParts.value = parts.slice()
          break
        }
      }

      // 达到轮次上限后仍有工具调用：移除未执行的代码块，避免把 JSON 展示给用户
      if (extractToolCalls(fullContent, toolCallLimit).length) {
        fullContent = stripToolBlocks(fullContent)
        if (fullContent) fullContent += '\n\n（已达到工具调用上限，以上为当前结果。）'
      }

      const notices = []
      if (imageNotice) notices.push(imageNotice)
      if (fellBackToSecondary) {
        notices.push(`主模型「${settings.model}」未能处理图片，已自动切换到副模型「${settings.secondaryModel}」。`)
      }
      let content = notices.length ? `> ${notices.join('\n> ')}\n\n${fullContent}` : fullContent
      for (const option of chartOptions.slice(0, 2)) {
        content += `\n\n\`\`\`echarts\n${JSON.stringify(option)}\n\`\`\``
      }
      // 最终正文作为最后一个文字段落；与上一段重合时就地补充，避免重复展示
      if (String(content).trim()) {
        const lastText = [...parts].reverse().find(part => part.type === 'text')
        if (lastText && String(content).trim().startsWith(lastText.content)) {
          lastText.content = String(content).trim()
        } else {
          parts.push({ type: 'text', content: String(content).trim() })
        }
      }
      const finalUsage = usageList.length
        ? sumUsage(usageList, attemptedModel)
        : buildEstimatedUsage(apiMessages, fullContent, attemptedModel)
      if (usageList.length) usageList.forEach(u => recordUsage(u))
      else recordUsage(finalUsage)
      const finalImages = latestBrowserShot ? [...toolImages, latestBrowserShot] : toolImages
      return {
        content,
        thinking: fullThinking || undefined,
        parts: parts.length ? parts : undefined,
        usage: finalUsage,
        images: finalImages.length ? finalImages.slice(-4) : undefined,
        pendingExport,
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        if (fullContent || fullThinking || parts.length) {
          const finalUsage = usageList.length
            ? sumUsage(usageList, attemptedModel)
            : buildEstimatedUsage(history, fullContent, attemptedModel)
          if (usageList.length) usageList.forEach(u => recordUsage(u))
          else recordUsage(finalUsage)
          for (const part of parts) {
            if (part.type === 'trace' && part.running) {
              part.running = false
              delete part.status
              part.notes.push('已中止')
            }
          }
          const partial = fullContent ? stripToolBlocks(fullContent).trim() : ''
          const text = partial ? `${partial}\n\n*[已中止]*` : '*[已中止]*'
          const lastText = [...parts].reverse().find(part => part.type === 'text')
          if (lastText && partial && text.startsWith(lastText.content)) lastText.content = text
          else parts.push({ type: 'text', content: text })
          streamingParts.value = parts.slice()
          return {
            content: text,
            thinking: fullThinking || undefined,
            parts: parts.length ? parts : undefined,
            usage: finalUsage,
          }
        }
        return null
      }
      const message = String(err?.message || err || '')
      if (ocrEnabled && hasImages && isVisionUnsupportedError(message)) {
        if (fellBackToSecondary) {
          return {
            content: `⚠️ 图片理解失败：主模型「${settings.model}」和副模型「${settings.secondaryModel}」都无法读取这张图片。\n\n` +
              `接口返回：${message}\n\n` +
              `建议把「设置 → 模型设置 → 模型图片能力」设为「纯文本」，并检查副模型是否为视觉模型（如 glm-4.6v / glm-4.6v-flash）。`,
          }
        }
        return {
          content: attemptedSecondary
            ? `⚠️ 图片理解失败：副模型「${attemptedModel}」似乎不支持图片输入。\n\n` +
              `接口返回：${message}\n\n` +
              `请在「设置 → 模型设置 → 副模型 API」换成视觉模型（如 glm-4.6v / glm-4.6v-flash）后重试。`
            : `⚠️ 图片理解失败：当前模型「${attemptedModel}」似乎不支持图片输入。\n\n` +
              `接口返回：${message}\n\n` +
              `可以：1) 在「设置 → 模型设置 → 副模型 API」配置视觉模型；2) 或先把图片里的文字复制成文本再发送。\n\n` +
              `提示：图片理解依赖模型视觉能力，不是本地 OCR。`,
        }
      }
      const failedNote = fellBackToSecondary
        ? `主模型失败后已尝试副模型，副模型仍失败。\n\n`
        : ''
      return { content: `❌ 错误: ${failedNote}${message}` }
    } finally {
      isLoading.value = false
      streamingContent.value = ''
      streamingThinking.value = ''
      streamingParts.value = []
      abortController.value = null
    }
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
    return msg
  }

  function finishStreamingPlaceholder(branch, msg, reply, prefix = '') {
    if (!msg) return
    msg.thinking = reply.thinking
    msg.parts = reply.parts ? (prefix ? [{ type: 'text', content: prefix }, ...reply.parts] : reply.parts) : undefined
    msg.content = prefix ? `${prefix}\n\n${reply.content}` : reply.content
    msg.images = reply.images
    msg.usage = reply.usage
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

    // 强制联网搜索开关：保留原有直接搜索路径，不参与工具选择
    if (settings.forceSearch) {
      const rawQuery = userContent
      // 去掉口语前缀与时间短语，保留 site: / filetype: 等操作符
      const query = buildSearchQuery(rawQuery) || rawQuery
      const timeRange = detectTimeRange(rawQuery)
      const fallbackText = buildSearchFallbackText(rawQuery)
      const apiKey = String(settings.tavilyApiKey || '').trim()

      if (!apiKey) {
        const msg = '未配置 Tavily API Key，已跳过联网搜索。请在 设置 → 搜索服务 中填写。'
        searchNotice = fallbackText ? `${msg}\n${fallbackText}` : msg
        window.__ui?.showToast(msg, 'error', 4500)
      } else {
        // 搜索期间用 AI 气泡提示，搜索完成后直接进入生成
        searching.value = true
        let result
        try {
          result = await searchWeb(query, {
            apiKey,
            depth: settings.searchDepth,
            maxResults: settings.searchMaxResults,
            timeRange,
          })
        } finally {
          searching.value = false
        }

        if (result.ok) {
          const built = buildSearchContext(query, result, {
            maxChars: settings.searchMaxChars,
            itemMaxChars: settings.searchItemMaxChars,
          })
          searchBlock = built.text
          if (built.truncated) {
            window.__ui?.showToast(`搜索结果较长，已截断至 ${built.maxChars} 字后注入`, 'info', 3200)
          }
        } else {
          searchNotice = fallbackText ? `${result.message}\n${fallbackText}` : result.message
          window.__ui?.showToast(result.message, 'error', 4500)
        }
      }
    }

    const history = branch.messages.slice()
    const streamMsg = createStreamingPlaceholder(branch)
    const reply = await generateReply(history, userContent, documentIds, searchBlock)
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
      maybeAutoDistill(branch, settings, userContent)
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
    const reply = await generateReply(forkHistory, content)
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
    const reply = await generateReply(history, undefined, [], '', options)
    if (!reply) {
      delete msg.streaming
      if (streamingMessageId.value === msg.id) streamingMessageId.value = null
      return
    }

    const versions = Array.isArray(msg.versions) && msg.versions.length
      ? msg.versions.slice()
      : [{ content: msg.content, thinking: msg.thinking, toolTrace: msg.toolTrace, parts: msg.parts, ts: msg.ts || Date.now() }]
    versions.push({ content: reply.content, thinking: reply.thinking, parts: reply.parts, ts: Date.now() })
    msg.versions = versions
    msg.activeVersion = versions.length - 1
    msg.content = reply.content
    msg.thinking = reply.thinking
    msg.parts = reply.parts
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
    const reply = await generateReply(history)
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

  // 自动记忆沉淀：每 N 轮用户消息触发一次，后台执行
  function maybeAutoDistill(branch, settings, userContent) {
    const memory = useMemoryStore()
    if (!memory.autoEnabled || autoDistillRunning || !settings.settingsReady) return
    if (detectMemoryCommand(userContent)) return

    const turns = branch.messages.filter(m => m.role === 'user').length
    const every = Math.max(2, Math.min(50, Number(memory.autoTurns) || 10))
    if (!turns || turns % every !== 0) return

    const transcript = branch.messages
      .filter(m => m.content)
      .slice(-16)
      .map(m => ({ role: m.role, content: m.content }))
    autoDistillRunning = true
    window.__ui?.showToast(`正在进行第 ${turns} 轮记忆沉淀…`, 'info', 2200)
    saveMemoriesFromChat(
      '请从最近对话中自动提炼值得长期保留的用户偏好、事实、目标与约定。',
      transcript,
      settings,
      { auto: true }
    ).finally(() => { autoDistillRunning = false })
  }

  // 提炼并保存记忆（后台执行，不阻塞对话）
  async function saveMemoriesFromChat(userText, transcript, settings, { auto = false } = {}) {
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
      if (added) {
        window.__ui?.showToast(
          auto ? `已自动沉淀 ${added} 条记忆` : `已存入记忆：${added} 条`,
          'success'
        )
      } else if (!auto) {
        window.__ui?.showToast('这些内容已在记忆中', 'info')
      }
    } catch {
      window.__ui?.showToast(
        auto ? '自动记忆沉淀失败，请检查模型配置' : '记忆保存失败，请检查模型配置',
        'error'
      )
    }
  }

  function buildSystemPrompt() {
    const settings = useSettingsStore()
    // 系统提示词从文件内联加载（构建时嵌入），零延迟永不失效
    const externalPrompt = systemPromptRaw || ''
    const persona = settings.personaPrompt || ''
    const userName = settings.userName || ''
    const userPersona = (settings.userPersona || '').trim()
    const replyRules = (settings.replyRules || '').trim()
    const personaOn = settings.personaEnabled

    const parts = []
    if (personaOn && persona.trim()) {
      // 人设优先：只发人设，忽略系统提示词
      parts.push(persona.trim())
    } else if (externalPrompt.trim()) {
      // 关闭 AI 人设时使用默认的白曦月人设
      parts.push(externalPrompt.trim())
    }

    if (userName.trim() || userPersona) {
      const lines = ['\n\n【用户信息】']
      if (userName.trim()) {
        lines.push(`当前与你对话的用户名叫"${userName.trim()}"，请在交流中使用此名称称呼用户，并以此判断用户身份。`)
      }
      if (userPersona) lines.push(`用户人设：${userPersona}`)
      parts.push(lines.join('\n'))
    }

    if (settings.replyRulesEnabled && replyRules) {
      parts.push(`\n\n【回复规则】\n${replyRules}`)
    }

    const toolPrompt = buildToolPrompt(settings)
    if (toolPrompt) parts.push(toolPrompt)

    // 长期记忆：主记忆未禁用时生效，读取有上限
    const memory = useMemoryStore()
    const memorySection = buildMainChatMemoryContext(memory)
    if (memorySection) parts.push('\n\n' + memorySection)
    return parts.join('')
  }

  return {
    conversation, branches, activeBranchId, activeBranch, messages,
    streamingContent, streamingThinking, streamingParts, streamingMessageId, isLoading, searching, imageGenerating,
    loadMessages, saveMessages, sendMessage, stopGeneration, clearMessages,
    regenerate, regenerateWithSecondary, setVersion, branchFromMessage, editAndRegenerate, switchBranch,
    continueResponse, deleteMessage, buildSystemPrompt,
  }
})
