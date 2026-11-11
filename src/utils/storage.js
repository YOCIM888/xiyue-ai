// 设置/话题等读写入口：实际存储由统一存储层 kv 负责（IndexedDB 为主）
import { getItem, setCachedItem, setItem } from './kv'
import { persistSettingsCiphertext } from './settingsSecret'

export const KEYS = {
  SETTINGS: 'ai_chat_settings',
  TOPICS: 'ai_chat_topics',
}

export function loadSettings() {
  try {
    const raw = getItem(KEYS.SETTINGS)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

export function saveSettings(data) {
  // 内存里保留明文供同步读取；落盘时把 Key 字段加密
  setCachedItem(KEYS.SETTINGS, JSON.stringify(data))
  persistSettingsCiphertext(data)
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
