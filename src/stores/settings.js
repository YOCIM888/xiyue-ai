import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { loadSettings, saveSettings } from '../utils/storage'

export const useSettingsStore = defineStore('settings', () => {
  const defaults = {
    apiKey: '',
    apiBase: 'https://api.deepseek.com',
    model: 'deepseek-v4-flash',
    temperature: 0.7,
    maxTokens: 32768,
    topP: 0.9,
    personaPrompt: '你是一个有用、友好的AI助手。请用中文回答用户的问题。',
    userName: '',
    thinkingEnabled: false,
    userAvatar: '',
    personaEnabled: false,
  }

  const saved = loadSettings()

  const apiKey = ref(saved.apiKey ?? defaults.apiKey)
  const apiBase = ref(saved.apiBase ?? defaults.apiBase)
  const model = ref(saved.model ?? defaults.model)
  const temperature = ref(saved.temperature ?? defaults.temperature)
  const maxTokens = ref(saved.maxTokens ?? defaults.maxTokens)
  const topP = ref(saved.topP ?? defaults.topP)
  const personaPrompt = ref(saved.personaPrompt ?? defaults.personaPrompt)
  const userName = ref(saved.userName ?? defaults.userName)
  const thinkingEnabled = ref(saved.thinkingEnabled ?? defaults.thinkingEnabled)
  const userAvatar = ref(saved.userAvatar ?? defaults.userAvatar)
  const personaEnabled = ref(saved.personaEnabled ?? defaults.personaEnabled)

  // 预设模型列表
  const modelPresets = [
    // DeepSeek
    { label: 'DeepSeek V4 Flash', model: 'deepseek-v4-flash', base: 'https://api.deepseek.com', maxTokens: 32768 },
    { label: 'DeepSeek V4 Pro', model: 'deepseek-v4-pro', base: 'https://api.deepseek.com', maxTokens: 65536 },
    //
    { label: 'XIYUE 1.2 mini',model: 'xiyue-1.2-mini', base:'https://api.yocim.top'},
    { label: 'XIYUE 1.2 flash',model: 'xiyue-1.2-Flash', base:'https://api.yocim.top'},
    { label: 'XIYUE 1.2 Plus',model: 'xiyue-1.2-Plus', base:'https://api.yocim.top'},
    { label: 'XIYUE 1.2 MAX',model: 'xiyue-1.2-MAX', base:'https://api.yocim.top'},
    // GLM (智谱AI)
    { label: 'GLM-5.2', model: 'glm-5.2', base: 'https://open.bigmodel.cn/api/paas/v4/' },
    { label: 'GLM-5.1', model: 'glm-5.1', base: 'https://open.bigmodel.cn/api/paas/v4/' },
    // Qwen (通义千问)
    { label: 'Qwen 3.7 Max', model: 'qwen3.7-max', base: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
    { label: 'Qwen 3.7 Plus', model: 'qwen3.7-plus', base: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
    { label: 'Qwen 3.7 Flash', model: 'qwen3.6-flash', base: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
    // Kimi (月之暗面)
    { label: 'Kimi K3', model: 'kimi-k3', base: 'https://api.moonshot.ai/v1' },
    // GPT (OpenAI)
    { label: 'GPT-5.6 sol', model: 'gpt-5.6 sol', base: 'https://api.openai.com/v1' },
    { label: 'GPT-5.5', model: 'gpt-5.5', base: 'https://api.openai.com/v1' },
    // Gemini (Google)
    { label: 'Gemini 3.6 flash', model: 'gemini-3.6-flash', base: 'https://generativelanguage.googleapis.com/v1beta/openai' },
    { label: 'Gemini 3.6 pro', model: 'gemini-3.6-pro', base: 'https://generativelanguage.googleapis.com/v1beta/openai' },
    // Claude
    { label: 'Claude Fable-5' ,model:'Claude Fable-5', base: 'https://api.anthropic.com' },
    { label:'Claude opus4.8' ,model:'Claude opus4.8', base: 'https://api.anthropic.com'},
    // Ollama 本地模型
    { label: 'Ollama', model: 'deepseek-r1:7b', base: '/ollama' },
  ]

  function applyPreset(preset) {
    model.value = preset.model
    apiBase.value = preset.base
    if (preset.maxTokens) maxTokens.value = preset.maxTokens
  }

  function persist() {
    saveSettings({
      apiKey: apiKey.value,
      apiBase: apiBase.value,
      model: model.value,
      temperature: temperature.value,
      maxTokens: maxTokens.value,
      topP: topP.value,
      personaPrompt: personaPrompt.value,
      userName: userName.value,
      thinkingEnabled: thinkingEnabled.value,
      userAvatar: userAvatar.value,
      personaEnabled: personaEnabled.value,
    })
  }

  const settingsReady = computed(() => !!apiKey.value && !!apiBase.value && !!model.value)

  // 自动持久化：任何设置变更立刻保存
  watch(
    [apiKey, apiBase, model, temperature, maxTokens, topP, personaPrompt, userName, thinkingEnabled, userAvatar, personaEnabled],
    () => persist(),
    { deep: false }
  )

  return {
    apiKey, apiBase, model, temperature, maxTokens, topP, personaPrompt, userName, thinkingEnabled, userAvatar, personaEnabled,
    modelPresets, applyPreset, persist, settingsReady, defaults,
  }
})
