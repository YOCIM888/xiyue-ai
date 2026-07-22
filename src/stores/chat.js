import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { useTopicsStore } from './topics'
import { useSettingsStore } from './settings'
import { sendChatRequest } from '../services/api'
// 系统提示词文件（Vite 构建时内联，零延迟）
import systemPromptRaw from '../../public/prompt/system.md?raw'

export const useChatStore = defineStore('chat', () => {
  const messages = ref([])
  const streamingContent = ref('')
  const streamingThinking = ref('')
  const isLoading = ref(false)
  const abortController = ref(null)

  function loadMessages(topicId) {
    if (!topicId) {
      messages.value = []
      return
    }
    try {
      const raw = localStorage.getItem(`chat_messages_${topicId}`)
      messages.value = raw ? JSON.parse(raw) : []
    } catch {
      messages.value = []
    }
  }

  function saveMessages(topicId) {
    if (!topicId) return
    localStorage.setItem(`chat_messages_${topicId}`, JSON.stringify(messages.value))
  }

  async function sendMessage(userContent) {
    const topics = useTopicsStore()
    const settings = useSettingsStore()

    topics.ensureTopic()
    const topicId = topics.currentTopicId
    if (!topicId) return

    // 添加用户消息
    messages.value.push({ role: 'user', content: userContent })
    saveMessages(topicId)
    topics.touchTopic(topicId)

    // 自动更新标题（取前20个字符）
    if (messages.value.filter(m => m.role === 'user').length === 1) {
      topics.renameTopic(topicId, userContent.slice(0, 30) + (userContent.length > 30 ? '…' : ''))
    }

    // 构建消息列表（带系统提示词）
    const systemPrompt = buildSystemPrompt()
    const chatMessages = systemPrompt
      ? [{ role: 'system', content: systemPrompt }, ...messages.value.map(m => ({ role: m.role, content: m.content }))]
      : messages.value.map(m => ({ role: m.role, content: m.content }))

    isLoading.value = true
    streamingContent.value = ''
    streamingThinking.value = ''

    try {
      const controller = new AbortController()
      abortController.value = controller

      let fullContent = ''
      let fullThinking = ''
      await sendChatRequest({
        apiBase: settings.apiBase,
        apiKey: settings.apiKey,
        model: settings.model,
        temperature: settings.temperature,
        maxTokens: settings.maxTokens,
        topP: settings.topP,
        thinkingEnabled: settings.thinkingEnabled,
        messages: chatMessages,
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

      // 完成后添加助手消息
      messages.value.push({ role: 'assistant', thinking: fullThinking || undefined, content: fullContent })
      saveMessages(topicId)
      topics.touchTopic(topicId)
    } catch (err) {
      if (err.name !== 'AbortError') {
        messages.value.push({ role: 'assistant', content: `❌ 错误: ${err.message}` })
        saveMessages(topicId)
      } else if (streamingContent.value || streamingThinking.value) {
        // 用户取消但已有部分内容
        messages.value.push({
          role: 'assistant',
          thinking: streamingThinking.value || undefined,
          content: streamingContent.value + '\n\n*[已中止]*',
        })
        saveMessages(topicId)
      }
    } finally {
      isLoading.value = false
      streamingContent.value = ''
      streamingThinking.value = ''
      abortController.value = null
    }
  }

  function stopGeneration() {
    if (abortController.value) {
      abortController.value.abort()
    }
  }

  function clearMessages() {
    messages.value = []
    const topics = useTopicsStore()
    if (topics.currentTopicId) {
      saveMessages(topics.currentTopicId)
    }
  }

  // 重新生成：移除最后一条 assistant 消息，用最后一条 user 消息重新请求
  async function regenerate() {
    let lastUserIdx = -1
    for (let i = messages.value.length - 1; i >= 0; i--) {
      if (messages.value[i].role === 'user') { lastUserIdx = i; break }
    }
    if (lastUserIdx === -1) return
    const lastUserContent = messages.value[lastUserIdx].content
    messages.value = messages.value.slice(0, lastUserIdx)
    const topics = useTopicsStore()
    saveMessages(topics.currentTopicId)
    await sendMessage(lastUserContent)
  }

  // 继续生成
  async function continueResponse() {
    await sendMessage('请继续。')
  }

  // 删除单条消息
  function deleteMessage(idx) {
    messages.value.splice(idx, 1)
    const topics = useTopicsStore()
    saveMessages(topics.currentTopicId)
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
      // 人设优先：人设放前面，系统提示词作补充
      parts.push(persona.trim())
      if (externalPrompt.trim()) {
        parts.push('\n\n【补充系统指令】\n' + externalPrompt.trim())
      }
    } else {
      // 系统提示词优先（默认）
      if (externalPrompt.trim()) {
        parts.push(externalPrompt.trim())
      }
    }
    if (userName.trim()) {
      parts.push(`\n\n【用户信息】\n当前与你对话的用户名叫"${userName.trim()}"，请在交流中使用此名称称呼用户，并以此判断用户身份。`)
    }
    return parts.join('')
  }

  return {
    messages, streamingContent, streamingThinking, isLoading,
    loadMessages, saveMessages, sendMessage, stopGeneration, clearMessages,
    regenerate, continueResponse, deleteMessage, buildSystemPrompt,
  }
})
