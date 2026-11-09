import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { getItem, setItem } from '../utils/kv'

const KEY = 'xiyue_memories'
const ENABLED_KEY = 'xiyue_memory_enabled'
const ACCESS_KEY = 'xiyue_memory_access'
const AUTO_KEY = 'xiyue_memory_auto'

const AUTO_TURNS_MIN = 2
const AUTO_TURNS_MAX = 50
const AUTO_TURNS_DEFAULT = 10

export const DEFAULT_MEMORY_AUTO = {
  enabled: true,
  turns: AUTO_TURNS_DEFAULT,
}

// 跨模块读取权限。默认全部关闭：老用户升级后保持原有的模块隔离行为。
export const DEFAULT_MEMORY_ACCESS = {
  circleReadMain: false,
  friendReadMain: false,
  groupReadPrivate: false,
  privateReadGroup: false,
}

function loadMemories() {
  try {
    const raw = getItem(KEY)
    const data = raw ? JSON.parse(raw) : []
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

function loadEnabled() {
  const raw = getItem(ENABLED_KEY)
  return raw === null ? true : raw === '1'
}

function loadAccess() {
  const merged = { ...DEFAULT_MEMORY_ACCESS }
  try {
    const raw = getItem(ACCESS_KEY)
    if (!raw) return merged
    const data = JSON.parse(raw)
    if (!data || typeof data !== 'object') return merged
    for (const key of Object.keys(DEFAULT_MEMORY_ACCESS)) {
      if (typeof data[key] === 'boolean') merged[key] = data[key]
    }
  } catch {
    // 设置损坏时回退为全关，保持模块隔离
  }
  return merged
}

function clampAutoTurns(value) {
  const num = Math.round(Number(value))
  if (!Number.isFinite(num)) return AUTO_TURNS_DEFAULT
  return Math.min(AUTO_TURNS_MAX, Math.max(AUTO_TURNS_MIN, num))
}

function loadAuto() {
  const merged = { ...DEFAULT_MEMORY_AUTO }
  try {
    const raw = getItem(AUTO_KEY)
    if (!raw) return merged
    const data = JSON.parse(raw)
    if (!data || typeof data !== 'object') return merged
    if (typeof data.enabled === 'boolean') merged.enabled = data.enabled
    if (data.turns !== undefined) merged.turns = clampAutoTurns(data.turns)
  } catch {
    // 设置损坏时使用默认值
  }
  return merged
}

export const useMemoryStore = defineStore('memory', () => {
  const memories = ref(loadMemories())
  const enabled = ref(loadEnabled())
  const access = ref(loadAccess())
  const auto = loadAuto()
  const autoEnabled = ref(auto.enabled)
  const autoTurns = ref(auto.turns)

  const sorted = computed(() => [...memories.value].sort((a, b) => b.updatedAt - a.updatedAt))

  function persist() {
    try {
      setItem(KEY, JSON.stringify(memories.value))
    } catch { /* 存储超限时静默失败 */ }
  }

  function persistEnabled() {
    setItem(ENABLED_KEY, enabled.value ? '1' : '0')
  }

  function persistAccess() {
    try {
      setItem(ACCESS_KEY, JSON.stringify(access.value))
    } catch { /* 存储超限时静默失败 */ }
  }

  function persistAuto() {
    try {
      setItem(AUTO_KEY, JSON.stringify({
        enabled: autoEnabled.value,
        turns: clampAutoTurns(autoTurns.value),
      }))
    } catch { /* 存储超限时静默失败 */ }
  }

  function create(title, content, source = 'manual') {
    const now = Date.now()
    const item = {
      id: 'mem-' + now + '-' + Math.random().toString(36).slice(2, 7),
      title: title.trim() || '未命名记忆',
      content: content.trim(),
      source,
      createdAt: now,
      updatedAt: now,
    }
    memories.value.push(item)
    return item
  }

  function update(id, patch) {
    const item = memories.value.find(m => m.id === id)
    if (!item) return
    if (patch.title !== undefined) item.title = patch.title.trim() || '未命名记忆'
    if (patch.content !== undefined) item.content = patch.content.trim()
    item.updatedAt = Date.now()
  }

  function remove(id) {
    memories.value = memories.value.filter(m => m.id !== id)
  }

  function removeMany(ids) {
    memories.value = memories.value.filter(m => !ids.includes(m.id))
  }

  watch(memories, persist, { deep: true })
  watch(enabled, persistEnabled)
  watch(access, persistAccess, { deep: true })
  watch([autoEnabled, autoTurns], persistAuto)

  return {
    memories, sorted, enabled, access,
    autoEnabled, autoTurns,
    create, update, remove, removeMany,
  }
})
