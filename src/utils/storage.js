// 设置/话题等读写入口：实际存储由统一存储层 kv 负责（IndexedDB 为主）
import { getItem, setItem } from './kv'

const KEYS = {
  SETTINGS: 'ai_chat_settings',
  TOPICS: 'ai_chat_topics',
  SYSTEM_PROMPT: 'system_prompt_content',
}

export function loadSettings() {
  try {
    const raw = getItem(KEYS.SETTINGS)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

export function saveSettings(data) {
  setItem(KEYS.SETTINGS, JSON.stringify(data))
}

export function loadTopics() {
  try {
    const raw = getItem(KEYS.TOPICS)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

export function saveTopics(topics) {
  setItem(KEYS.TOPICS, JSON.stringify(topics))
}

export function loadSystemPrompt() {
  return getItem(KEYS.SYSTEM_PROMPT) || ''
}

export function saveSystemPrompt(content) {
  setItem(KEYS.SYSTEM_PROMPT, content)
}
