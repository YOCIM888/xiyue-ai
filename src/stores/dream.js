import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { getItem, setItem } from '../utils/kv'
import { DREAM_WORKS } from '../services/dream'

const SESSIONS_KEY = 'xiyue_dream_sessions'
const CUSTOM_WORKS_KEY = 'xiyue_dream_custom_works'
const FALLBACK_OPTIONS = ['先观察周围的情况', '寻找安全的出路', '冷静下来再决定']
let storageWarnAt = 0
let customSeq = 0

function makeId(prefix = 'turn') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

// 同一毫秒里连建两部作品会撞 id，删其中一部会连带删掉另一部的存档
function makeCustomWorkId() {
  customSeq += 1
  return `dream-custom-${Date.now()}-${customSeq}`
}

function notifyStorageError() {
  if (Date.now() - storageWarnAt < 8000) return
  storageWarnAt = Date.now()
  window.__ui?.showToast('梦境进度保存失败：本地存储空间不足，请到 设置 → 数据设置 清理旧数据。', 'error', 6000)
}

function saveJSON(key, value) {
  try {
    setItem(key, JSON.stringify(value))
    return true
  } catch {
    notifyStorageError()
    return false
  }
}

function normalizeTurn(raw) {
  if (!raw || typeof raw !== 'object') return null
  const narrative = String(raw.narrative || '').trim()
  if (!narrative) return null
  const options = Array.isArray(raw.options)
    ? raw.options.map(item => String(item || '').trim()).filter(Boolean).slice(0, 3)
    : []
  while (options.length < 3) options.push(FALLBACK_OPTIONS[options.length])
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : makeId(),
    narrative,
    options,
    fromChoice: String(raw.fromChoice || '').trim(),
    state: raw.state && typeof raw.state === 'object' ? raw.state : {},
    summary: typeof raw.summary === 'string' ? raw.summary : '',
    ts: Number(raw.ts) || Date.now(),
  }
}

function normalizeBranch(raw, index) {
  const turns = (Array.isArray(raw?.turns) ? raw.turns : []).map(normalizeTurn).filter(Boolean)
  const last = turns[turns.length - 1]
  return {
    id: typeof raw?.id === 'string' && raw.id ? raw.id : (index === 0 ? 'b-main' : makeId('branch')),
    name: typeof raw?.name === 'string' && raw.name ? raw.name : (index === 0 ? '主线' : `分支 ${index + 1}`),
    turns,
    state: raw?.state && typeof raw.state === 'object' ? raw.state : (last?.state || {}),
    summary: typeof raw?.summary === 'string' ? raw.summary : (last?.summary || ''),
    createdAt: Number(raw?.createdAt) || Date.now(),
  }
}

function normalizeSession(raw, id) {
  const source = raw && typeof raw === 'object' ? raw : {}
  let branches = Array.isArray(source.branches)
    ? source.branches.map(normalizeBranch)
    : []
  if (!branches.length) {
    const legacyTurns = Array.isArray(source.turns) ? source.turns : []
    branches = [normalizeBranch({ id: 'b-main', name: '主线', turns: legacyTurns }, 0)]
  }
  if (!branches.length) return null
  const activeBranchId = branches.some(branch => branch.id === source.activeBranchId)
    ? source.activeBranchId
    : branches[0].id
  return {
    version: 2,
    id,
    activeBranchId,
    nextBranchNo: Math.max(branches.length + 1, Number(source.nextBranchNo) || 2),
    branches,
    updatedAt: Number(source.updatedAt) || Date.now(),
  }
}

function loadSessions() {
  try {
    const raw = getItem(SESSIONS_KEY)
    if (!raw) return {}
    const data = JSON.parse(raw)
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {}
    const result = {}
    for (const [id, value] of Object.entries(data)) {
      const session = normalizeSession(value, id)
      if (session) result[id] = session
    }
    return result
  } catch {
    return {}
  }
}

function loadCustomWorks() {
  try {
    const raw = getItem(CUSTOM_WORKS_KEY)
    if (!raw) return []
    const data = JSON.parse(raw)
    if (!Array.isArray(data)) return []
    return data
      .filter(item => item && typeof item === 'object' && item.title && item.setting && item.opening)
      .map(item => {
        const options = Array.isArray(item.openingOptions)
          ? item.openingOptions.map(opt => String(opt || '').trim()).filter(Boolean).slice(0, 3)
          : []
        while (options.length < 3) options.push(FALLBACK_OPTIONS[options.length])
        return {
          id: typeof item.id === 'string' && item.id ? item.id : makeCustomWorkId(),
          custom: true,
          title: String(item.title).trim(),
          mark: String(item.mark || item.title).trim().slice(0, 1) || '梦',
          tag: '自定义 · 抉择叙事',
          meta: '自定义世界 · 多线走向',
          description: String(item.description || item.setting || '').trim().slice(0, 120),
          voice: String(item.voice || '紧贴主角视角，克制、写实').trim(),
          setting: String(item.setting).trim(),
          opening: String(item.opening).trim(),
          openingOptions: options,
        }
      })
  } catch {
    return []
  }
}

export const useDreamStore = defineStore('dream', () => {
  const sessions = ref(loadSessions())
  const customWorks = ref(loadCustomWorks())
  const activeId = ref('')
  const activeBranchId = ref('')
  const loading = ref(false)

  const allWorks = computed(() => [...DREAM_WORKS, ...customWorks.value])

  const activeSession = computed(() =>
    activeId.value ? sessions.value[activeId.value] || null : null
  )
  const branches = computed(() => activeSession.value?.branches || [])
  const activeBranch = computed(() => {
    const list = branches.value
    return list.find(branch => branch.id === activeBranchId.value) || list[0] || null
  })
  const turns = computed(() => activeBranch.value?.turns || [])
  const state = computed(() => activeBranch.value?.state || {})
  const summary = computed(() => activeBranch.value?.summary || '')

  function persistSessions() {
    saveJSON(SESSIONS_KEY, sessions.value)
  }

  function persistCustomWorks() {
    saveJSON(CUSTOM_WORKS_KEY, customWorks.value)
  }

  function ensureSession(id) {
    if (!sessions.value[id]) {
      sessions.value[id] = {
        version: 2,
        id,
        activeBranchId: 'b-main',
        nextBranchNo: 2,
        branches: [normalizeBranch({ id: 'b-main', name: '主线', turns: [] }, 0)],
        updatedAt: Date.now(),
      }
    }
    return sessions.value[id]
  }

  function openWork(id) {
    activeId.value = id
    const session = ensureSession(id)
    if (!session.branches.some(branch => branch.id === session.activeBranchId)) {
      session.activeBranchId = session.branches[0]?.id || 'b-main'
    }
    activeBranchId.value = session.activeBranchId
    persistSessions()
  }

  function progressOf(id) {
    const session = sessions.value[id]
    if (!session) return 0
    return Math.max(0, ...session.branches.map(branch => branch.turns.length))
  }

  function progressSummary(id) {
    const session = sessions.value[id]
    if (!session) return ''
    const branch = [...session.branches].sort((a, b) => b.turns.length - a.turns.length)[0]
    const last = branch?.turns?.[branch.turns.length - 1]
    return last ? String(last.narrative || '').replace(/\s+/g, ' ').slice(0, 60) : ''
  }

  function lastPlayed(id) {
    return Number(sessions.value[id]?.updatedAt) || 0
  }

  function addTurn({ narrative, options, fromChoice, state: nextState, summary: nextSummary }) {
    if (!activeId.value || !activeBranch.value) return
    const branch = activeBranch.value
    branch.turns.push({
      id: makeId(),
      narrative: String(narrative || '').trim(),
      options: Array.isArray(options) ? options.slice(0, 3) : [],
      fromChoice: String(fromChoice || '').trim(),
      state: nextState && typeof nextState === 'object' ? nextState : {},
      summary: typeof nextSummary === 'string' ? nextSummary : '',
      ts: Date.now(),
    })
    if (nextState && typeof nextState === 'object') branch.state = nextState
    if (typeof nextSummary === 'string' && nextSummary) branch.summary = nextSummary
    const session = activeSession.value
    if (session) session.updatedAt = Date.now()
    persistSessions()
  }

  /** 回到某一幕之前重新选择；当前分支保留，新分支成为活动分支 */
  function rewindTo(turnIndex) {
    const session = activeSession.value
    const branch = activeBranch.value
    if (!session || !branch) return false
    const index = Math.floor(Number(turnIndex))
    if (!Number.isFinite(index) || index < 0 || index >= branch.turns.length) return false

    const keptTurns = branch.turns.slice(0, index).map(turn => JSON.parse(JSON.stringify(turn)))
    const last = keptTurns[keptTurns.length - 1]
    const newBranch = {
      id: makeId('branch'),
      name: `分支 ${session.nextBranchNo || session.branches.length + 1}`,
      turns: keptTurns,
      state: last?.state || {},
      summary: last?.summary || '',
      createdAt: Date.now(),
    }
    session.nextBranchNo = (session.nextBranchNo || session.branches.length + 1) + 1
    session.branches.push(newBranch)
    session.activeBranchId = newBranch.id
    session.updatedAt = Date.now()
    activeBranchId.value = newBranch.id
    persistSessions()
    return true
  }

  function switchBranch(branchId) {
    const session = activeSession.value
    if (!session || !session.branches.some(branch => branch.id === branchId)) return
    session.activeBranchId = branchId
    activeBranchId.value = branchId
    persistSessions()
  }

  function resetWork(id = activeId.value) {
    if (!id) return
    delete sessions.value[id]
    if (id === activeId.value) {
      activeId.value = ''
      activeBranchId.value = ''
    }
    persistSessions()
  }

  function setLoading(value) {
    loading.value = !!value
  }

  function createWork(payload = {}) {
    const title = String(payload.title || '').trim()
    const setting = String(payload.setting || '').trim()
    const opening = String(payload.opening || '').trim()
    if (!title || !setting || !opening) {
      window.__ui?.showToast('作品标题、世界设定和开场剧情不能为空', 'error', 3500)
      return null
    }
    const options = Array.isArray(payload.openingOptions)
      ? payload.openingOptions.map(item => String(item || '').trim()).filter(Boolean).slice(0, 3)
      : []
    while (options.length < 3) options.push(FALLBACK_OPTIONS[options.length])
    const work = {
      id: makeCustomWorkId(),
      custom: true,
      title,
      mark: String(payload.mark || title).trim().slice(0, 1) || '梦',
      tag: '自定义 · 抉择叙事',
      meta: '自定义世界 · 多线走向',
      description: String(payload.description || setting).trim().slice(0, 120),
      voice: String(payload.voice || '紧贴主角视角，克制、写实').trim(),
      setting,
      opening,
      openingOptions: options,
    }
    customWorks.value.push(work)
    persistCustomWorks()
    return work
  }

  function removeCustomWork(id) {
    customWorks.value = customWorks.value.filter(work => work.id !== id)
    persistCustomWorks()
    if (sessions.value[id]) {
      delete sessions.value[id]
      if (id === activeId.value) {
        activeId.value = ''
        activeBranchId.value = ''
      }
      persistSessions()
    }
  }

  return {
    sessions,
    customWorks,
    allWorks,
    activeId,
    activeBranchId,
    loading,
    turns,
    state,
    summary,
    branches,
    activeBranch,
    openWork,
    progressOf,
    progressSummary,
    lastPlayed,
    addTurn,
    rewindTo,
    switchBranch,
    resetWork,
    setLoading,
    createWork,
    removeCustomWork,
  }
})
