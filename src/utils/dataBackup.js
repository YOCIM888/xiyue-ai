// 应用数据统计与备份（数据统一存储在 IndexedDB，localStorage 仅存小配置）
import {
  AUTO_BACKUP_KEEP,
  AUTO_BACKUP_PREFIX,
  MIGRATED_KEY,
  clearAppData,
  flushStorage,
  getItem,
  rawEntries,
  removeItem,
  setItem,
} from './kv'

export const BACKUP_APP = 'XIYUE AI'
export const BACKUP_VERSION = 1

const AUTO_LAST_KEY = 'xiyue_backup_last_run'
const QUOTA_WARN_KEY = 'xiyue_quota_warned_at'
const AUTO_MAX_BYTES = 60 * 1024 * 1024

function localDateKey() {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

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
  if (key === 'xiyue_memories' || key === 'xiyue_memory_enabled' || key === 'xiyue_memory_access') return 'memory'
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
  if (key === 'xiyue_memory_enabled') return '主记忆开关'
  if (key === 'xiyue_memory_access') return '记忆读取权限'
  if (key === 'xiyue_starry_friends') return '好友列表'
  if (key === 'xiyue_starry_groups') return '群聊列表'
  if (key === 'xiyue_starry_active') return '上次打开窗口'
  if (key === 'xiyue_starry_default_avatars') return '头像初始化标记'
  if (key.startsWith('xiyue_starry_msgs_')) return `聊天记录 · ${key.slice('xiyue_starry_msgs_'.length)}`
  if (key === 'xiyue_starry_circle_posts') return '圈子帖子'
  if (key === 'xiyue_dream_sessions') return '推演进度'
  if (key === 'xiyue_assets') return '文档列表'
  if (key.startsWith(AUTO_BACKUP_PREFIX)) return `自动备份 ${key.slice(AUTO_BACKUP_PREFIX.length)}`
  return key
}

function isInternalKey(key) {
  return key === MIGRATED_KEY || key === QUOTA_WARN_KEY || key === AUTO_LAST_KEY
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

  for (const [key, raw] of rawEntries()) {
    if (!key || isInternalKey(key)) continue
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
    if (obj && typeof obj === 'object') {
      const fields = []
      if (obj.apiKey) {
        obj.apiKey = ''
        fields.push('ai_chat_settings.apiKey')
      }
      if (obj.secondaryApiKey) {
        obj.secondaryApiKey = ''
        fields.push('ai_chat_settings.secondaryApiKey')
      }
      if (obj.tavilyApiKey) {
        obj.tavilyApiKey = ''
        fields.push('ai_chat_settings.tavilyApiKey')
      }
      if (fields.length) return { raw: JSON.stringify(obj), fields }
    }
  } catch {
    // 设置损坏时按原样导出
  }
  return { raw, fields: [] }
}

export function buildBackupPayload({ includeAutoBackups = false } = {}) {
  const data = {}
  const masked = []
  for (const [key, raw] of rawEntries()) {
    if (!key || isInternalKey(key)) continue
    if (!includeAutoBackups && key.startsWith(AUTO_BACKUP_PREFIX)) continue
    let value = raw
    if (key === SETTINGS_KEY) {
      const result = maskSettings(value)
      if (result.fields.length) masked.push(...result.fields)
      value = result.raw
    }
    data[key] = value
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
  const memoryAccess = parseRaw(entries.xiyue_memory_access || 'null', null)
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
  if (memoryAccess && typeof memoryAccess === 'object') {
    const enabledCount = ['circleReadMain', 'friendReadMain', 'groupReadPrivate', 'privateReadGroup']
      .filter(k => memoryAccess[k] === true).length
    if (enabledCount) parts.push(`记忆读取权限 ${enabledCount} 项开启`)
  }
  if (dream && typeof dream === 'object' && Object.keys(dream).length) {
    parts.push(`梦境 ${Object.keys(dream).length} 部作品进度`)
  }
  if (Array.isArray(assets) && assets.length) parts.push(`文档 ${assets.length} 篇`)

  const settingsObj = parseRaw(entries[SETTINGS_KEY] || '{}', {})
  if (settingsObj && typeof settingsObj === 'object') {
    if (settingsObj.searchSkillEnabled) {
      parts.push('联网搜索已开启')
    } else if (settingsObj.tavilyApiKey) {
      parts.push('搜索服务已配置')
    }
    if (settingsObj.secondaryApiBase && settingsObj.secondaryModel) {
      parts.push(settingsObj.secondaryApiKey ? '副模型已配置' : '副模型配置（Key 脱敏）')
    }
  }
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

export async function applyBackup(entries) {
  // 空备份不允许执行：避免误清空现有数据
  if (!entries || typeof entries !== 'object' || Object.keys(entries).length === 0) {
    throw new Error('备份内容为空，已取消导入')
  }
  // 导入前保留本机密钥，避免备份中的脱敏空值覆盖真实 Key
  let currentApiKey = ''
  let currentSecondaryKey = ''
  let currentTavilyKey = ''
  try {
    const current = JSON.parse(getItem(SETTINGS_KEY) || '{}')
    currentApiKey = current.apiKey || ''
    currentSecondaryKey = current.secondaryApiKey || ''
    currentTavilyKey = current.tavilyApiKey || ''
  } catch {
    currentApiKey = ''
    currentSecondaryKey = ''
    currentTavilyKey = ''
  }

  // 清除全部应用数据（保留自动备份与迁移标记）
  await clearAppData()

  for (const [key, raw] of Object.entries(entries)) {
    if (!key) continue
    if (key === SETTINGS_KEY) {
      const obj = parseRaw(raw, null)
      if (obj && typeof obj === 'object') {
        if (!obj.apiKey && currentApiKey) obj.apiKey = currentApiKey
        if (!obj.secondaryApiKey && currentSecondaryKey) obj.secondaryApiKey = currentSecondaryKey
        if (!obj.tavilyApiKey && currentTavilyKey) obj.tavilyApiKey = currentTavilyKey
        setItem(key, JSON.stringify(obj))
        continue
      }
    }
    setItem(key, raw)
  }
  await flushStorage()
  try {
    localStorage.setItem(AUTO_LAST_KEY, localDateKey())
  } catch { /* ignore */ }

  return Object.keys(entries).length
}

// ---- 自动备份：每天首次启动生成一份快照，最多保留 3 份 ----

export function listAutoBackups() {
  return rawEntries()
    .filter(([key]) => key.startsWith(AUTO_BACKUP_PREFIX))
    .map(([key, raw]) => ({
      key,
      date: key.slice(AUTO_BACKUP_PREFIX.length),
      bytes: byteSize(raw),
    }))
    .sort((a, b) => b.date.localeCompare(a.date))
}

function pruneAutoBackups() {
  for (const item of listAutoBackups().slice(AUTO_BACKUP_KEEP)) {
    removeItem(item.key)
  }
}

export async function maybeAutoBackup() {
  const today = localDateKey()
  let last = ''
  try { last = localStorage.getItem(AUTO_LAST_KEY) || '' } catch { last = '' }
  if (last === today) return null

  const payload = buildBackupPayload()
  const text = JSON.stringify(payload)
  try { localStorage.setItem(AUTO_LAST_KEY, today) } catch { /* ignore */ }

  if (byteSize(text) > AUTO_MAX_BYTES) {
    window.__ui?.showToast?.('数据量较大，已跳过本次自动备份，建议到数据设置手动导出', 'info', 5000)
    return null
  }

  const key = `${AUTO_BACKUP_PREFIX}${today}`
  setItem(key, text)
  await flushStorage()
  pruneAutoBackups()
  return key
}

export async function restoreAutoBackup(key) {
  const raw = getItem(key)
  if (!raw) throw new Error('自动备份不存在')
  const parsed = parseBackup(raw)
  return applyBackup(parsed.entries)
}
