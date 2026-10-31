import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

const SESSIONS_KEY = 'xiyue_dream_sessions'

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // 存储空间不足时忽略，本次会话仍可继续
  }
}

function makeId() {
  return `turn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export const useDreamStore = defineStore('dream', () => {
  const sessions = ref(loadJSON(SESSIONS_KEY, {}))
  const activeId = ref('')
  const loading = ref(false)

  const turns = computed(() => (activeId.value ? sessions.value[activeId.value]?.turns || [] : []))

  function persist() {
    saveJSON(SESSIONS_KEY, sessions.value)
  }

  /** 打开某部作品；保留已有进度 */
  function openWork(id) {
    activeId.value = id
    if (!sessions.value[id]) {
      sessions.value[id] = { id, turns: [], updatedAt: Date.now() }
      persist()
    }
  }

  function progressOf(id) {
    return sessions.value[id]?.turns?.length || 0
  }

  function addTurn({ narrative, options, fromChoice }) {
    const id = activeId.value
    if (!id) return
    const session = sessions.value[id] || { id, turns: [], updatedAt: 0 }
    session.turns.push({
      id: makeId(),
      narrative,
      options,
      fromChoice,
      ts: Date.now(),
    })
    session.updatedAt = Date.now()
    sessions.value[id] = session
    persist()
  }

  function resetWork(id = activeId.value) {
    if (!id) return
    delete sessions.value[id]
    if (id === activeId.value) {
      activeId.value = ''
    }
    persist()
  }

  function setLoading(value) {
    loading.value = value
  }

  return {
    sessions,
    activeId,
    loading,
    turns,
    openWork,
    progressOf,
    addTurn,
    resetWork,
    setLoading,
  }
})
