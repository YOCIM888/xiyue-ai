// 应用数据统计与备份（localStorage 全部来源于本应用）
export const BACKUP_APP = 'XIYUE AI'
export const BACKUP_VERSION = 1

const MODULES = [
  { key: 'chat', label: '主聊天会话', icon: 'fa-solid fa-comments', color: '#6366f1' },
  { key: 'memory', label: '记忆管理', icon: 'fa-solid fa-brain', color: '#8b5cf6' },
  { key: 'starry', label: '探索星空', icon: 'fa-solid fa-star', color: '#0ea5e9' },
  { key: 'circle', label: '圈子动态', icon: 'fa-solid fa-compass', color: '#14b8a6' },
  { key: 'dream', label: '梦境推演', icon: 'fa-solid fa-moon', color: '#a855f7' },
  { key: 'assets', label: '我的文档', icon: 'fa-solid fa-file-lines', color: '#f59e0b' },
  { key: 'settings', label: '各项设置', icon: 'fa-solid fa-gear', color: '#64748b' },
  { key: 'other', label: '其他数据', icon: 'fa-solid fa-box', color: '#94a3b8' },
]

const SETTINGS_KEY = 'ai_chat_settings'

function moduleOf(key) {
  if (key === SETTINGS_KEY || key === 'system_prompt_content') return 'settings'
  if (key === 'ai_chat_topics' || key.startsWith('chat_messages_') || key.startsWith('chat_conv_v2_')) return 'chat'
  if (key === 'xiyue_memories' || key === 'xiyue_memory_enabled') return 'memory'
  if (key === 'xiyue_starry_circle_posts') return 'circle'
  if (key === 'xiyue_dream_sessions') return 'dream'
  if (key === 'xiyue_assets') return 'assets'
  if (key.startsWith('xiyue_starry_')) return 'starry'
  return 'other'
}

function labelOf(key) {
  if (key === SETTINGS_KEY) return '应用设置'
  if (key === 'system_prompt_content') return '系统提示词（旧版）'
  if (key === 'ai_chat_topics') return '对话列表'
  if (key.startsWith('chat_messages_')) return `会话消息 #${key.slice('chat_messages_'.length)}`
  if (key.startsWith('chat_conv_v2_')) return `会话（含分支） #${key.slice('chat_conv_v2_'.length)}`
  if (key === 'xiyue_memories') return '记忆列表'
  if (key === 'xiyue_memory_enabled') return '记忆开关'
  if (key === 'xiyue_starry_friends') return '好友列表'
  if (key === 'xiyue_starry_groups') return '群聊列表'
  if (key === 'xiyue_starry_active') return '上次打开窗口'
  if (key === 'xiyue_starry_default_avatars') return '头像初始化标记'
  if (key.startsWith('xiyue_starry_msgs_')) return `聊天记录 · ${key.slice('xiyue_starry_msgs_'.length)}`
  if (key === 'xiyue_starry_circle_posts') return '圈子帖子'
  if (key === 'xiyue_dream_sessions') return '推演进度'
  if (key === 'xiyue_assets') return '文档列表'
  return key
}

function byteSize(str) {
  return new Blob([str ?? '']).size
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export function computeStorageUsage() {
  const buckets = new Map(MODULES.map(m => [m.key, { ...m, bytes: 0, entries: [] }]))
  let totalBytes = 0
  let keyCount = 0

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key) continue
    const raw = localStorage.getItem(key) ?? ''
    const bytes = byteSize(raw)
    const bucket = buckets.get(moduleOf(key))
    bucket.bytes += bytes
    bucket.entries.push({ key, label: labelOf(key), bytes })
    totalBytes += bytes
    keyCount += 1
  }

  const modules = MODULES
    .map(meta => {
      const bucket = buckets.get(meta.key)
      bucket.entries.sort((a, b) => b.bytes - a.bytes)
      return {
        ...bucket,
        percent: totalBytes ? (bucket.bytes / totalBytes) * 100 : 0,
        entries: bucket.entries.map(e => ({
          ...e,
          percent: totalBytes ? (e.bytes / totalBytes) * 100 : 0,
        })),
      }
    })
    .filter(m => m.entries.length)
    .sort((a, b) => b.bytes - a.bytes)

  return { totalBytes, keyCount, modules }
}

function maskSettings(raw) {
  try {
    const obj = JSON.parse(raw)
    if (obj && typeof obj === 'object' && obj.apiKey) {
      obj.apiKey = ''
      return JSON.stringify(obj)
    }
  } catch {
    // 设置损坏时按原样导出
  }
  return raw
}

export function buildBackupPayload() {
  const data = {}
  const masked = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key) continue
    let raw = localStorage.getItem(key) ?? ''
    if (key === SETTINGS_KEY) {
      const maskedRaw = maskSettings(raw)
      if (maskedRaw !== raw) masked.push('ai_chat_settings.apiKey')
      raw = maskedRaw
    }
    data[key] = raw
  }
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    masked,
    data,
  }
}

export function backupFileName() {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `xiyue-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`
}

function parseRaw(raw, fallback) {
  try { return JSON.parse(raw) } catch { return fallback }
}

export function summarizeBackup(entries) {
  const topics = parseRaw(entries.ai_chat_topics || '[]', [])
  // 每个会话优先统计 v2（含所有分支），否则退回旧版数组，避免重复计数
  const chatTopicIds = new Set()
  Object.keys(entries).forEach(key => {
    if (key.startsWith('chat_messages_')) chatTopicIds.add(key.slice('chat_messages_'.length))
    if (key.startsWith('chat_conv_v2_')) chatTopicIds.add(key.slice('chat_conv_v2_'.length))
  })
  let chatMessages = 0
  chatTopicIds.forEach(id => {
    const conv = parseRaw(entries[`chat_conv_v2_${id}`] || 'null', null)
    if (conv && Array.isArray(conv.branches)) {
      conv.branches.forEach(b => {
        if (Array.isArray(b.messages)) chatMessages += b.messages.length
      })
      return
    }
    const list = parseRaw(entries[`chat_messages_${id}`] || '[]', [])
    if (Array.isArray(list)) chatMessages += list.length
  })
  const friends = parseRaw(entries.xiyue_starry_friends || '[]', [])
  const groups = parseRaw(entries.xiyue_starry_groups || '[]', [])
  const starryMsgs = Object.keys(entries)
    .filter(k => k.startsWith('xiyue_starry_msgs_'))
    .reduce((sum, k) => {
      const list = parseRaw(entries[k], [])
      return sum + (Array.isArray(list) ? list.length : 0)
    }, 0)
  const posts = parseRaw(entries.xiyue_starry_circle_posts || '[]', [])
  const memories = parseRaw(entries.xiyue_memories || '[]', [])
  const dream = parseRaw(entries.xiyue_dream_sessions || '{}', {})
  const assets = parseRaw(entries.xiyue_assets || '[]', [])

  const parts = []
  if (Array.isArray(topics) && topics.length) parts.push(`主聊天 ${topics.length} 个对话`)
  if (chatTopicIds.size) parts.push(`主聊天 ${chatMessages} 条消息`)
  if (Array.isArray(friends) && friends.length) parts.push(`星空 ${friends.length} 位好友`)
  if (Array.isArray(groups) && groups.length) parts.push(`${groups.length} 个群聊`)
  if (starryMsgs) parts.push(`星空 ${starryMsgs} 条消息`)
  if (Array.isArray(posts) && posts.length) parts.push(`圈子 ${posts.length} 条动态`)
  if (Array.isArray(memories) && memories.length) parts.push(`记忆 ${memories.length} 条`)
  if (dream && typeof dream === 'object' && Object.keys(dream).length) {
    parts.push(`梦境 ${Object.keys(dream).length} 部作品进度`)
  }
  if (Array.isArray(assets) && assets.length) parts.push(`文档 ${assets.length} 篇`)
  if (entries[SETTINGS_KEY]) parts.push('应用设置')

  return parts
}

export function parseBackup(text) {
  const obj = JSON.parse(text)
  if (!obj || typeof obj !== 'object' || !obj.data || typeof obj.data !== 'object') {
    throw new Error('不是有效的 XIYUE 备份文件')
  }
  const entries = {}
  for (const [key, value] of Object.entries(obj.data)) {
    if (!key) continue
    entries[key] = typeof value === 'string' ? value : JSON.stringify(value)
  }
  return {
    version: obj.version,
    exportedAt: obj.exportedAt,
    entries,
    summary: summarizeBackup(entries),
    masked: Array.isArray(obj.masked) ? obj.masked : [],
  }
}

export function applyBackup(entries) {
  // 导入前保留本机 API Key，避免备份中的脱敏空值覆盖真实密钥
  let currentApiKey = ''
  try {
    currentApiKey = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}').apiKey || ''
  } catch {
    currentApiKey = ''
  }

  // 清除全部应用数据（本域名下 localStorage 仅由本应用使用）
  const existingKeys = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key) existingKeys.push(key)
  }
  existingKeys.forEach(key => localStorage.removeItem(key))

  for (const [key, raw] of Object.entries(entries)) {
    if (key === SETTINGS_KEY) {
      const obj = parseRaw(raw, null)
      if (obj && typeof obj === 'object') {
        if (!obj.apiKey && currentApiKey) obj.apiKey = currentApiKey
        localStorage.setItem(key, JSON.stringify(obj))
        continue
      }
    }
    localStorage.setItem(key, raw)
  }

  return Object.keys(entries).length
}
