import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { loadSettings, saveSettings } from '../utils/storage'

const defaultSymbolRules = () => [
  { id: 'sym-paren-cn', open: '（', close: '）', color: '#000000', italic: false, bold: false },
  { id: 'sym-paren-en', open: '(', close: ')', color: '#000000', italic: false, bold: false },
  { id: 'sym-brace', open: '{', close: '}', color: '#000000', italic: false, bold: false },
  { id: 'sym-bracket', open: '[', close: ']', color: '#000000', italic: false, bold: false },
  { id: 'sym-corner', open: '【', close: '】', color: '#000000', italic: false, bold: false },
]

export const useSettingsStore = defineStore('settings', () => {
  const defaults = {
    apiKey: '',
    apiBase: 'https://api.deepseek.com',
    model: 'deepseek-flash',
    temperature: 0.7,
    maxTokens: 32768,
    contextLength: 131072,
    topP: 0.9,
    personaPrompt: '你是一个有用、友好的AI助手。请用中文回答用户的问题。',
    userName: '',
    thinkingEnabled: false,
    userAvatar: '',
    personaEnabled: false,
    darkMode: false,
    linkSkillEnabled: true,
    documentSkillEnabled: false,
    ocrSkillEnabled: false,
    modelVisionMode: 'auto',
    searchSkillEnabled: false,
    forceSearch: false,
    tavilyApiKey: '',
    searchDepth: 'basic',
    searchMaxResults: 5,
    imageGenSkillEnabled: false,
    // 副模型 API：负责多模态扩展（图片理解、生图）
    secondaryApiBase: 'https://open.bigmodel.cn/api/paas/v4',
    secondaryApiKey: '',
    secondaryModel: 'glm-4.6v-flash',
    secondaryImageModel: 'glm-image',
    backgroundImage: '',
    symbolRules: defaultSymbolRules(),
    hideUserAvatar: false,
    hideAiAvatar: false,
  }

  const saved = loadSettings()

  const apiKey = ref(saved.apiKey ?? defaults.apiKey)
  const apiBase = ref(saved.apiBase ?? defaults.apiBase)
  const model = ref(saved.model ?? defaults.model)
  const temperature = ref(saved.temperature ?? defaults.temperature)
  const maxTokens = ref(saved.maxTokens ?? defaults.maxTokens)
  const contextLength = ref(saved.contextLength ?? defaults.contextLength)
  const topP = ref(saved.topP ?? defaults.topP)
  const personaPrompt = ref(saved.personaPrompt ?? defaults.personaPrompt)
  const userName = ref(saved.userName ?? defaults.userName)
  const thinkingEnabled = ref(saved.thinkingEnabled ?? defaults.thinkingEnabled)
  const userAvatar = ref(saved.userAvatar ?? defaults.userAvatar)
  const personaEnabled = ref(saved.personaEnabled ?? defaults.personaEnabled)
  const darkMode = ref(saved.darkMode ?? window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? defaults.darkMode)
  const linkSkillEnabled = ref(saved.linkSkillEnabled ?? defaults.linkSkillEnabled)
  const documentSkillEnabled = ref(saved.documentSkillEnabled ?? defaults.documentSkillEnabled)
  const ocrSkillEnabled = ref(saved.ocrSkillEnabled ?? defaults.ocrSkillEnabled)
  const modelVisionMode = ref(saved.modelVisionMode ?? defaults.modelVisionMode)
  const searchSkillEnabled = ref(saved.searchSkillEnabled ?? defaults.searchSkillEnabled)
  const forceSearch = ref(saved.forceSearch ?? defaults.forceSearch)
  const tavilyApiKey = ref(saved.tavilyApiKey ?? defaults.tavilyApiKey)
  const searchDepth = ref(saved.searchDepth ?? defaults.searchDepth)
  const searchMaxResults = ref(saved.searchMaxResults ?? defaults.searchMaxResults)
  const imageGenSkillEnabled = ref(saved.imageGenSkillEnabled ?? defaults.imageGenSkillEnabled)
  const secondaryApiBase = ref(saved.secondaryApiBase ?? defaults.secondaryApiBase)
  const secondaryApiKey = ref(saved.secondaryApiKey ?? defaults.secondaryApiKey)
  const secondaryModel = ref(saved.secondaryModel ?? defaults.secondaryModel)
  const secondaryImageModel = ref(saved.secondaryImageModel ?? defaults.secondaryImageModel)
  const backgroundImage = ref(saved.backgroundImage ?? defaults.backgroundImage)
  const symbolRules = ref(Array.isArray(saved.symbolRules) && saved.symbolRules.length ? saved.symbolRules : defaults.symbolRules)
  const hideUserAvatar = ref(saved.hideUserAvatar ?? defaults.hideUserAvatar)
  const hideAiAvatar = ref(saved.hideAiAvatar ?? defaults.hideAiAvatar)

  // 预设模型列表
  const modelPresets = [
    // DeepSeek
    { label: 'DeepSeek-V4.1-Flash', model: 'deepseek-flash', base: 'https://api.deepseek.com'},
    //XIYUE
    { label: 'XIYUE-2.0-Pro',model: 'xiyue-2.0-Pro', base:'https://api.yocim.top/v1'},
    { label: 'XIYUE-2.0-Flash',model: 'xiyue-2.0-Flash', base:'https://api.yocim.top/v1'},
    // GLM (智谱AI)
    { label: 'GLM-5.3', model: 'glm-5.3', base: 'https://open.bigmodel.cn/api/paas/v4/' },
    { label: 'GLM-5.3-Flash', model: 'glm-5.3-flash', base: 'https://open.bigmodel.cn/api/paas/v4/' },
    { label: 'GLM-5.3-FlashX', model: 'glm-5.3-flashx', base: 'https://open.bigmodel.cn/api/paas/v4/' },
    // Qwen (通义千问)
    { label: 'Qwen-3.8-MAX', model: 'qwen3.8-max', base: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
    { label: 'Qwen-3.8-Flash', model: 'qwen3.8-flash', base: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
    // Kimi (月之暗面)
    { label: 'Kimi K3.1 Pro', model: 'kimi-k3.1-pro', base: 'https://api.moonshot.ai/v1' },
    { label: 'Kimi K3', model: 'kimi-k3', base: 'https://api.moonshot.ai/v1' },
    // Claude
    { label: 'Claude Fable 5.1' ,model:'Claude Fable-5.1', base: 'https://api.anthropic.com' },
    { label:'Claude Opus 5.5' ,model:'Claude opus5.5', base: 'https://api.anthropic.com'},
    { label:'Claude Haiku 5.5' ,model:'Claude haiku5.5', base: 'https://api.anthropic.com'},
    // GPT (OpenAI)
    { label: 'GPT-6 Astra', model: 'gpt-6-astra', base: 'https://api.openai.com/v1' },
    { label: 'GPT-6.1-sol', model: 'gpt-6-sol', base: 'https://api.openai.com/v1' },
    { label: 'GPT-6-luna', model: 'gpt-6-luna', base: 'https://api.openai.com/v1' },
    // Gemini (Google)
    { label: 'Gemini 4 Carbon', model: 'gemini-4-carbon', base: 'https://generativelanguage.googleapis.com/v1beta/openai' },
    { label: 'Gemini 4 Argon', model: 'gemini-4-argon', base: 'https://generativelanguage.googleapis.com/v1beta/openai' },
    // Ollama 本地模型
    { label: 'Ollama', model: 'deepseek-r1:7b', base: '/ollama' },
  ]

  function applyPreset(preset) {
    model.value = preset.model
    apiBase.value = preset.base
    if (preset.maxTokens) maxTokens.value = preset.maxTokens
  }

  // 副模型预设：智谱多模态（图片理解 + 生图）
  const secondaryPresets = [
    { label: 'GLM-4.6V-Flash', model: 'glm-4.6v-flash', base: 'https://open.bigmodel.cn/api/paas/v4' },
  ]

  function applySecondaryPreset(preset) {
    secondaryModel.value = preset.model
    secondaryApiBase.value = preset.base
  }

  const secondaryReady = computed(
    () => !!(secondaryApiBase.value && secondaryApiKey.value && secondaryModel.value)
  )

  function persist() {
    saveSettings({
      apiKey: apiKey.value,
      apiBase: apiBase.value,
      model: model.value,
      temperature: temperature.value,
      maxTokens: maxTokens.value,
      contextLength: contextLength.value,
      topP: topP.value,
      personaPrompt: personaPrompt.value,
      userName: userName.value,
      thinkingEnabled: thinkingEnabled.value,
      userAvatar: userAvatar.value,
      personaEnabled: personaEnabled.value,
      darkMode: darkMode.value,
      linkSkillEnabled: linkSkillEnabled.value,
      documentSkillEnabled: documentSkillEnabled.value,
      ocrSkillEnabled: ocrSkillEnabled.value,
      modelVisionMode: modelVisionMode.value,
      searchSkillEnabled: searchSkillEnabled.value,
      forceSearch: forceSearch.value,
      tavilyApiKey: tavilyApiKey.value,
      searchDepth: searchDepth.value,
      searchMaxResults: searchMaxResults.value,
      imageGenSkillEnabled: imageGenSkillEnabled.value,
      secondaryApiBase: secondaryApiBase.value,
      secondaryApiKey: secondaryApiKey.value,
      secondaryModel: secondaryModel.value,
      secondaryImageModel: secondaryImageModel.value,
      backgroundImage: backgroundImage.value,
      symbolRules: symbolRules.value,
      hideUserAvatar: hideUserAvatar.value,
      hideAiAvatar: hideAiAvatar.value,
    })
  }

  const settingsReady = computed(() => !!apiKey.value && !!apiBase.value && !!model.value)

  // 自动持久化：任何设置变更立刻保存
  watch(
    [apiKey, apiBase, model, temperature, maxTokens, contextLength, topP, personaPrompt, userName, thinkingEnabled, userAvatar, personaEnabled, darkMode, linkSkillEnabled, documentSkillEnabled, ocrSkillEnabled, modelVisionMode, searchSkillEnabled, forceSearch, tavilyApiKey, searchDepth, searchMaxResults, imageGenSkillEnabled, secondaryApiBase, secondaryApiKey, secondaryModel, secondaryImageModel, backgroundImage, hideUserAvatar, hideAiAvatar],
    () => persist(),
    { deep: false }
  )
  watch(symbolRules, () => persist(), { deep: true })

  // 老版本没有副模型配置：首次加载时写回默认结构，同时保留原有主模型配置
  if (!('secondaryApiBase' in saved)) {
    persist()
  }

  return {
    apiKey, apiBase, model, temperature, maxTokens, contextLength, topP, personaPrompt, userName, thinkingEnabled, userAvatar, personaEnabled, darkMode, linkSkillEnabled,
    backgroundImage, symbolRules, hideUserAvatar, hideAiAvatar, documentSkillEnabled,
    ocrSkillEnabled, modelVisionMode,
    searchSkillEnabled, forceSearch, tavilyApiKey, searchDepth, searchMaxResults, imageGenSkillEnabled,
    secondaryApiBase, secondaryApiKey, secondaryModel, secondaryImageModel, secondaryReady, secondaryPresets, applySecondaryPreset,
    modelPresets, applyPreset, persist, settingsReady, defaults,
  }
})
