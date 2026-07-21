const KEYS = {
  SETTINGS: 'ai_chat_settings',
  TOPICS: 'ai_chat_topics',
  SYSTEM_PROMPT: 'system_prompt_content',
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEYS.SETTINGS)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

export function saveSettings(data) {
  localStorage.setItem(KEYS.SETTINGS, JSON.stringify(data))
}

export function loadTopics() {
  try {
    const raw = localStorage.getItem(KEYS.TOPICS)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

export function saveTopics(topics) {
  localStorage.setItem(KEYS.TOPICS, JSON.stringify(topics))
}

export function loadSystemPrompt() {
  return localStorage.getItem(KEYS.SYSTEM_PROMPT) || ''
}

export function saveSystemPrompt(content) {
  localStorage.setItem(KEYS.SYSTEM_PROMPT, content)
}
