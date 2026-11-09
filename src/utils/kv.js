// 统一存储层：IndexedDB 为主库，localStorage 只保留小配置与迁移标记。
// 对外保持同步读写（内存缓存），写入异步入库，避免主线程阻塞。
import { idbClear, idbDelete, idbGetAll, idbSet, isIDBSupported } from './idb'

const MIGRATED_KEY = 'xiyue_storage_migrated_v1'
const AUTO_BACKUP_PREFIX = 'xiyue_auto_backup_'
const AUTO_BACKUP_KEEP = 3
// 体积小、启动即需要的小配置继续放 localStorage
const LOCAL_KEYS = new Set(['ai_chat_settings'])
const QUOTA_WARN_RATIO = 0.85
const QUOTA_WARN_KEY = 'xiyue_quota_warned_at'

const cache = new Map()
let ready = false
let engine = 'idb'
let bootResult = null
let queue = Promise.resolve()
let lastNoticeAt = 0

export { MIGRATED_KEY, AUTO_BACKUP_PREFIX, AUTO_BACKUP_KEEP }

export function isStorageReady() {
  return ready
}

export function getStorageEngine() {
  return engine
}

export function getBootInfo() {
  return bootResult
}

function isQuotaError(err) {
  const name = err?.name || ''
  const code = err?.code
  return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED' || code === 22 || code === 1014
}

function notify(message, type = 'error', duration = 5000) {
  window.__ui?.showToast?.(message, type, duration)
}

function notifyFull() {
  if (Date.now() - lastNoticeAt < 8000) return
  lastNoticeAt = Date.now()
  notify('本地存储空间不足，最近的数据可能未保存。请到 设置 → 数据设置 导出备份并清理旧会话。', 'error', 6000)
}

function safeLocalSet(key, value) {
  try {
    localStorage.setItem(key, value)
    return true
  } catch (err) {
    if (isQuotaError(err)) {
      // localStorage 仅存小配置，通常不会满；满了清理自动备份的本地残留即可
      notifyFull()
    } else {
      console.warn('[storage] localStorage 写入失败', err)
    }
    return false
  }
}

function cacheBytes() {
  let total = 0
  for (const value of cache.values()) total += new Blob([value ?? '']).size
  return total
}

/** 读取本地全部键值到内存（boot 阶段执行） */
function primeCacheFromLocalStorage() {
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i)
      if (!key) continue
      cache.set(key, localStorage.getItem(key) ?? '')
    }
  } catch {
    // 隐私模式禁用存储时忽略，后续读写会走降级路径
  }
}

async function migrateLocalStorage() {
  const moved = []
  for (const [key, value] of [...cache.entries()]) {
    if (key === MIGRATED_KEY || LOCAL_KEYS.has(key) || key.startsWith(AUTO_BACKUP_PREFIX)) continue
    await idbSet(key, value)
    moved.push(key)
  }
  safeLocalSet(MIGRATED_KEY, '1')
  for (const key of moved) {
    try { localStorage.removeItem(key) } catch { /* ignore */ }
  }
  return moved.length
}

/**
 * 启动存储：优先打开 IndexedDB，并把旧 localStorage 数据一次性迁移过去。
 * 迁移失败时回退 localStorage，保证老用户数据不受影响。
 */
export async function bootStorage() {
  if (ready) return bootResult
  primeCacheFromLocalStorage()

  if (!isIDBSupported()) {
    engine = 'local'
    ready = true
    bootResult = { engine, migrated: false, reason: 'unsupported' }
    return bootResult
  }

  try {
    const rows = await idbGetAll()
    const migrated = (() => {
      try { return localStorage.getItem(MIGRATED_KEY) === '1' } catch { return true }
    })()

    let moved = 0
    if (!migrated) moved = await migrateLocalStorage()

    // IDB 为权威数据源，覆盖内存缓存（保留 localStorage 中的小配置）
    for (const { key, value } of rows) cache.set(key, value)
    for (const key of LOCAL_KEYS) {
      try {
        const local = localStorage.getItem(key)
        if (local !== null) cache.set(key, local)
      } catch { /* ignore */ }
    }

    engine = 'idb'
    ready = true
    bootResult = { engine, migrated: !migrated, movedKeys: moved }
    return bootResult
  } catch (err) {
    console.warn('[storage] IndexedDB 不可用，回退到 localStorage', err)
    engine = 'local'
    ready = true
    bootResult = { engine, migrated: false, reason: err?.message || 'error' }
    return bootResult
  }
}

export function getItem(key) {
  if (cache.has(key)) return cache.get(key)
  try { return localStorage.getItem(key) } catch { return null }
}

function enqueue(op, key) {
  queue = queue.then(op).catch(err => handleWriteError(err, key))
  return queue
}

async function releaseSpace() {
  // 只清理可安全重建的内容：旧版遗留键、超出的自动备份
  let freed = false
  for (const key of [...cache.keys()]) {
    if (key.startsWith('chat_messages_')) {
      const id = key.slice('chat_messages_'.length)
      if (cache.has(`chat_conv_v2_${id}`)) {
        cache.delete(key)
        await idbDelete(key).catch(() => {})
        freed = true
      }
    }
  }
  const backups = [...cache.keys()]
    .filter(k => k.startsWith(AUTO_BACKUP_PREFIX))
    .sort()
  while (backups.length > 1) {
    const key = backups.shift()
    cache.delete(key)
    await idbDelete(key).catch(() => {})
    freed = true
  }
  return freed
}

async function handleWriteError(err, key) {
  if (!isQuotaError(err)) {
    console.error('[storage] 写入失败', err)
    return
  }
  const freed = await releaseSpace()
  if (freed && key && cache.has(key)) {
    try {
      await idbSet(key, cache.get(key))
      return
    } catch (retryErr) {
      if (!isQuotaError(retryErr)) {
        console.error('[storage] 重试写入失败', retryErr)
        return
      }
    }
  }
  notifyFull()
}

export function setItem(key, value) {
  const str = typeof value === 'string' ? value : String(value ?? '')
  cache.set(key, str)

  if (engine === 'local' || LOCAL_KEYS.has(key)) {
    safeLocalSet(key, str)
    return
  }
  enqueue(() => idbSet(key, str), key)
}

export function removeItem(key) {
  cache.delete(key)
  if (engine === 'local' || LOCAL_KEYS.has(key)) {
    try { localStorage.removeItem(key) } catch { /* ignore */ }
    return
  }
  enqueue(() => idbDelete(key), key)
}

export function keys() {
  return [...cache.keys()]
}

export function rawEntries() {
  return [...cache.entries()]
}

/** 等待所有排队中的写入完成（页面隐藏、导入导出、测试时使用） */
export async function flushStorage() {
  try { await queue } catch { /* 已内部处理 */ }
}

/** 估算站点实际用量与配额（含 IndexedDB 与 localStorage） */
export async function storageEstimate() {
  const local = cacheBytes()
  try {
    if (navigator.storage?.estimate) {
      const { usage = 0, quota = 0 } = await navigator.storage.estimate()
      if (quota > 0) {
        return { usage: Math.max(usage, local), quota, percent: Math.min(100, (Math.max(usage, local) / quota) * 100), engine }
      }
    }
  } catch {
    // 浏览器不支持估算时退回本地统计
  }
  return { usage: local, quota: 0, percent: 0, engine }
}

function parseTopicIds() {
  const raw = cache.get('ai_chat_topics')
  if (!raw) return null
  try {
    const list = JSON.parse(raw)
    if (!Array.isArray(list) || !list.length) return null
    return new Set(list.map(t => String(t?.id)))
  } catch {
    return null
  }
}

/**
 * 启动后的安全清理：
 * 1. v2 会话已存在时删除旧版遗留键；
 * 2. 话题列表可读时清理孤儿会话；
 * 3. 自动备份只保留最近 3 份。
 */
export async function runStorageMaintenance() {
  if (!ready) return { removed: 0 }
  const topicIds = parseTopicIds()
  const removed = []

  for (const key of [...cache.keys()]) {
    if (key.startsWith('chat_messages_')) {
      const id = key.slice('chat_messages_'.length)
      if (cache.has(`chat_conv_v2_${id}`)) {
        removeItem(key)
        removed.push(key)
      }
      continue
    }
    if (key.startsWith('chat_conv_v2_') && topicIds) {
      const id = key.slice('chat_conv_v2_'.length)
      if (!topicIds.has(String(id))) {
        removeItem(key)
        removed.push(key)
      }
    }
  }

  const backups = [...cache.keys()].filter(k => k.startsWith(AUTO_BACKUP_PREFIX)).sort()
  while (backups.length > AUTO_BACKUP_KEEP) {
    const key = backups.shift()
    removeItem(key)
    removed.push(key)
  }

  await flushStorage()
  return { removed: removed.length }
}

/** 用量接近上限时提醒一次（每天最多一次） */
export async function maybeWarnQuota() {
  const { usage, quota, percent } = await storageEstimate()
  if (!quota || percent < QUOTA_WARN_RATIO * 100) return false
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  let warned = ''
  try { warned = localStorage.getItem(QUOTA_WARN_KEY) || '' } catch { /* ignore */ }
  if (warned === today) return false
  try { localStorage.setItem(QUOTA_WARN_KEY, today) } catch { /* ignore */ }
  notify(`本地存储已使用 ${percent.toFixed(0)}%，建议到 设置 → 数据设置 导出备份并清理不用的旧会话。`, 'info', 6000)
  return usage > 0
}

/** 清空应用数据（保留自动备份与迁移标记），供导入/清除数据使用 */
export async function clearAppData() {
  const kept = [...cache.entries()].filter(([key]) => key.startsWith(AUTO_BACKUP_PREFIX))
  cache.clear()
  try { await idbClear() } catch { /* ignore */ }
  try { localStorage.clear() } catch { /* ignore */ }
  safeLocalSet(MIGRATED_KEY, '1')
  for (const [key, value] of kept) {
    cache.set(key, value)
    if (engine === 'idb') await idbSet(key, value).catch(() => {})
    else safeLocalSet(key, value)
  }
  await flushStorage()
}

// 页面隐藏/关闭前尽量把排队的写入落库
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushStorage()
  })
}
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => { flushStorage() })
}
