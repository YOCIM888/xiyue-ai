import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'

const KEY = 'xiyue_memories'
const ENABLED_KEY = 'xiyue_memory_enabled'

function loadMemories() {
  try {
    const raw = localStorage.getItem(KEY)
    const data = raw ? JSON.parse(raw) : []
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

function loadEnabled() {
  const raw = localStorage.getItem(ENABLED_KEY)
  return raw === null ? true : raw === '1'
}

export const useMemoryStore = defineStore('memory', () => {
  const memories = ref(loadMemories())
  const enabled = ref(loadEnabled())

  const sorted = computed(() => [...memories.value].sort((a, b) => b.updatedAt - a.updatedAt))

  // 供 UI 直接绑定“禁用记忆”开关
  const disabled = computed({
    get: () => !enabled.value,
    set: (v) => { enabled.value = !v },
  })

  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(memories.value))
    } catch { /* 存储超限时静默失败 */ }
  }

  function persistEnabled() {
    localStorage.setItem(ENABLED_KEY, enabled.value ? '1' : '0')
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

  return { memories, sorted, enabled, disabled, create, update, remove, removeMany }
})
