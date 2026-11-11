import { useSettingsStore } from '../../stores/settings'
import { useAssetsStore } from '../../stores/assets'
import { sendChatRequest } from '../api'
import { attachLinkContext, appendContextToLastUser } from '../linkReader'
import { recordUsage } from '../usageStats'
import { estimateMessagesTokens } from '../../utils/contextUsage'
import {
  detectVisionSupport,
  isVisionUnsupportedError,
  prepareOcrImages,
  OCR_INSTRUCTION,
  OCR_MAX_IMAGES,
} from '../ocr'
import {
  extractToolCalls,
  executeToolCall,
  stripToolBlocks,
  stripStreamingToolBlocks,
  stripIncompleteToolCalls,
  createWriteBudget,
  toolUsageHint,
  shouldShowUsageHint,
  callSignature,
  describeCall,
  callDisplay,
  planCallBatches,
  archiveToolResults,
  toolResultBrief,
} from '../tools'
import { beginWorkspaceTask } from '../workspaceActivity'
import { refreshPreflightContext } from '../preflight'
import { buildSystemPrompt } from './promptBuilder'

// 回灌给模型的单条工具结果上限；超出必须显式标注，否则模型会把自己看到的半截当成全文
const RESULT_CHARS_TO_MODEL = 8000

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

/**
 * 生成一条 AI 回复，包含模型选择、图片处理、工具调用循环与用量统计。
 * state 由 chat store 提供：isLoading / streamingContent / streamingThinking /
 * streamingParts / abortController，用于驱动消息列表里的流式占位气泡。
 */
export async function generateReply(history, linkText, documentIds = [], searchBlock = '', options = {}, state) {
  const { isLoading, streamingContent, streamingThinking, streamingParts, streamingStartedAt, abortController } = state
  const startedAt = Date.now()
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
      duration: Date.now() - startedAt,
    }
  }

  isLoading.value = true
  streamingContent.value = ''
  streamingThinking.value = ''
  streamingParts.value = []
  if (streamingStartedAt) streamingStartedAt.value = startedAt
  beginWorkspaceTask()

  let fullContent = ''
  let fullThinking = ''
  // 最后一次请求的结束原因：finish_reason=length 表示被 max_tokens 截断
  let lastFinishReason = null
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

    await refreshPreflightContext(settings)
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
      const { retrieveDocumentContext } = await import('../docRetrieval')
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
      lastFinishReason = null
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
      lastFinishReason = usage?.finishReason || null
      const usageEntry = usage && (usage.prompt || usage.completion || usage.total)
        ? { ...usage, model, estimated: false }
        : null
      if (usageEntry) {
        delete usageEntry.finishReason
        usageList.push(usageEntry)
      }
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
    // 同一条回答里累计的失败指纹，用来打断「同一个错误调用反复发」的空转
    const failedCalls = new Map()

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
        // 先把整轮条目按原顺序摆出来（待执行），执行到哪条哪条点亮
        steps: calls.map(call => ({ tool: call.tool, pending: true, ...callDisplay(call) })),
        notes: [],
      }
      parts.push(roundPart)
      streamingParts.value = parts.slice()
      streamingContent.value = ''
      streamingThinking.value = ''

      const results = []
      const runOne = async (call, onStatus) => {
        try {
          return await executeToolCall(call, {
            settings,
            signal: controller.signal,
            documentIds,
            budget: writeBudget,
            onStatus,
          })
        } catch (err) {
          // 中止要交给外层统一收尾，把挂起的步骤标记为「已中止」而不是失败
          if (err?.name === 'AbortError') throw err
          return {
            ok: false,
            refused: err?.code === 'WRITE_BUDGET',
            text: err?.message || String(err),
            record: `工具执行失败：${err?.message || err}`,
          }
        }
      }
      // 无论串行还是并行，都按调用原顺序落账，步骤卡片与回灌顺序保持一致
      const settleOne = ({ call, result }) => {
        results.push({ call, result })
        const step = roundPart.steps[calls.indexOf(call)]
        Object.assign(step, {
          ok: !!result.ok,
          pending: false,
          running: false,
          label: result.meta?.created === true ? '创建' : step.label,
          summary: String(result.record || (result.ok ? '完成' : result.text) || '').slice(0, 300),
          output: String(result.text || '').slice(0, 1200),
        })
        if (result.meta?.stats) step.stats = result.meta.stats
        if (result.chartOption) chartOptions.push(result.chartOption)
        if (Array.isArray(result.images)) {
          if (call.tool === 'browser') latestBrowserShot = result.images[0] || latestBrowserShot
          else toolImages.push(...result.images)
        }
        if (result.exportFormat) pendingExport = result.exportFormat
      }

      for (const batch of planCallBatches(calls)) {
        if (controller.signal.aborted) break
        for (const call of batch.items) {
          const step = roundPart.steps[calls.indexOf(call)]
          step.pending = false
          step.running = true
        }
        if (batch.parallel && batch.items.length > 1) {
          const names = batch.items.map(item => item.tool).join(' + ')
          roundPart.status = `正在并行执行 ${names}（${batch.items.length} 个只读调用）…`
          streamingParts.value = parts.slice()
          const settled = await Promise.all(batch.items.map(call => runOne(call)))
          batch.items.forEach((call, k) => settleOne({ call, result: settled[k] }))
        } else {
          const [call] = batch.items
          roundPart.status = `正在执行 ${call.tool}（${batch.start + 1}/${calls.length}）…`
          streamingParts.value = parts.slice()
          const result = await runOne(call, text => {
            if (text) {
              roundPart.status = text
              streamingParts.value = parts.slice()
            }
          })
          settleOne({ call, result })
        }
        streamingParts.value = parts.slice()
      }
      roundPart.running = false
      delete roundPart.status
      // 与回灌给模型的口径一致：已用轮次和跨轮累计的写入额度都留痕
      roundPart.used = {
        rounds: toolRounds,
        roundsTotal: MAX_TOOL_ROUNDS,
        files: writeBudget.files,
        filesTotal: writeBudget.maxFiles,
        bytes: writeBudget.bytes,
        bytesTotal: writeBudget.maxBytes,
      }
      streamingParts.value = parts.slice()

      if (controller.signal.aborted) {
        throw Object.assign(new Error('Aborted'), { name: 'AbortError' })
      }

      let resultsText = results
        .map(({ call, result }) => {
          const body = String(result.text || '')
          const shown = body.length > RESULT_CHARS_TO_MODEL
            ? `${body.slice(0, RESULT_CHARS_TO_MODEL)}\n…（结果已截断，原文 ${body.length} 字符；不要把它当成全文，请缩小查询范围或提高 limit）`
            : body
          const hint = shouldShowUsageHint(call, result) ? `\n\n${toolUsageHint(call.tool)}` : ''
          return `工具：${call.tool}\n状态：${result.ok ? '成功' : '失败'}\n${shown}${hint}`
        })
        .join('\n\n')

      for (const { call, result } of results) {
        if (result.ok) continue
        const key = callSignature(call)
        failedCalls.set(key, (failedCalls.get(key) || 0) + 1)
      }
      const repeated = [...new Set(
        results
          .filter(({ call, result }) => !result.ok && failedCalls.get(callSignature(call)) >= 2)
          .map(({ call }) => describeCall(call))
      )]
      if (repeated.length) {
        resultsText += `\n\n以上这些调用已重复失败：${repeated.join('；')}。不要再发出同样的调用，请换工具或换参数；确实做不到时，直接向用户说明原因和已完成的部分。`
      }

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
        ...archiveToolResults(toolMessages),
        { role: 'assistant', content: previousContent },
        {
          role: 'user',
          content: `【工具执行结果】\n${resultsText}\n\n请基于以上真实结果继续回答。不要编造结果，也不要重复调用已经成功的工具。${
            isLastRound ? '这是最后一轮，请直接给出最终回答，不要再调用工具。' : '如仍需其他工具，可以继续调用。'
          }\n（本轮之后还剩 ${Math.max(0, MAX_TOOL_ROUNDS - toolRounds)} 轮工具调用；${writeBudget.remainingText()}。）`,
          images: imagesForModel.length ? imagesForModel : undefined,
          toolResult: true,
          toolBrief: toolResultBrief(toolRounds, results),
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

    // 没写完的裸 JSON / 半截 ```tool 围栏不该留在正文里（模型被截断时尤其常见）
    fullContent = stripIncompleteToolCalls(fullContent)

    // 达到轮次上限后仍有工具调用：移除未执行的代码块，避免把 JSON 展示给用户
    if (extractToolCalls(fullContent, toolCallLimit).length) {
      fullContent = stripToolBlocks(fullContent)
      if (fullContent) fullContent += '\n\n（已达到工具调用上限，以上为当前结果。）'
    }

    const notices = []
    if (imageNotice) notices.push(imageNotice)
    if (lastFinishReason === 'length') {
      notices.push('回答被「最大输出长度」截断，最后一段可能不完整；可在设置里调大 max_tokens 后重试。')
    }
    if (fellBackToSecondary) {
      notices.push(`主模型「${settings.model}」未能处理图片，已自动切换到副模型「${settings.secondaryModel}」。`)
    }
    let content = notices.length ? `> ${notices.join('\n> ')}\n\n${fullContent}` : fullContent
    for (const option of chartOptions.slice(0, 2)) {
      content += `\n\n\`\`\`echarts\n${JSON.stringify(option)}\n\`\`\``
    }
    // 最后一轮思考作为独立分段插进时间线，时间上落在最终正文之前；
    // 与上一轮 trace 的思考同源时（最终回答失败回退）不重复插
    const finalThinking = fullThinking.trim()
    const lastTrace = [...parts].reverse().find(part => part.type === 'trace')
    if (finalThinking && parts.length && finalThinking !== (lastTrace?.thinking || '')) {
      parts.push({ type: 'thinking', content: finalThinking })
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
      duration: Date.now() - startedAt,
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
            for (const step of part.steps || []) {
              if (step.pending || step.running) {
                step.pending = false
                step.running = false
                step.aborted = true
              }
            }
          }
        }
        const abortedThinking = fullThinking.trim()
        const abortedLastTrace = [...parts].reverse().find(part => part.type === 'trace')
        if (abortedThinking && parts.length && abortedThinking !== (abortedLastTrace?.thinking || '')) {
          parts.push({ type: 'thinking', content: abortedThinking })
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
          duration: Date.now() - startedAt,
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
          duration: Date.now() - startedAt,
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
        duration: Date.now() - startedAt,
      }
    }
    const failedNote = fellBackToSecondary
      ? `主模型失败后已尝试副模型，副模型仍失败。\n\n`
      : ''
    return { content: `❌ 错误: ${failedNote}${message}`, duration: Date.now() - startedAt }
  } finally {
    isLoading.value = false
    streamingContent.value = ''
    streamingThinking.value = ''
    streamingParts.value = []
    abortController.value = null
  }
}
