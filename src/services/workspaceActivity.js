const STORAGE_KEY = 'xiyue_workspace_activity_v1'
const MAX_WRITES = 500
const RECENT_WINDOW = 30 * 60 * 1000

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    if (saved && Array.isArray(saved.writes)) {
      return {
        taskId: String(saved.taskId || ''),
        startedAt: Number(saved.startedAt) || 0,
        writes: saved.writes
          .filter(item => item && item.path && item.action)
          .slice(-MAX_WRITES),
      }
    }
  } catch {
    // 记录损坏时从空状态开始
  }
  return { taskId: '', startedAt: 0, writes: [] }
}

const state = loadState()

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      taskId: state.taskId,
      startedAt: state.startedAt,
      writes: state.writes.slice(-MAX_WRITES),
    }))
  } catch {
    // 存储已满时不影响文件写入
  }
}

function emit(path = '') {
  window.dispatchEvent(new CustomEvent('xiyue:workspace-ai-write', { detail: { path } }))
}

export function beginWorkspaceTask() {
  state.taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  state.startedAt = Date.now()
  persist()
  emit()
  return state.taskId
}

export function recordAiFileAction(action, paths) {
  if (!state.taskId) {
    state.taskId = `task_${Date.now()}_adhoc`
    state.startedAt = Date.now()
  }
  const list = Array.isArray(paths) ? paths : [paths]
  const at = Date.now()
  for (const path of list) {
    const normalized = String(path || '').trim()
    if (!normalized) continue
    state.writes.push({ path: normalized, action: String(action), at, taskId: state.taskId })
  }
  if (state.writes.length > MAX_WRITES) state.writes.splice(0, state.writes.length - MAX_WRITES)
  persist()
  emit(list[list.length - 1] || '')
}

/** 当前任务去重后的产物，删除动作会把对应路径剔除 */
export function getTaskArtifacts() {
  if (!state.taskId) return []
  const map = new Map()
  for (const item of state.writes) {
    if (item.taskId !== state.taskId) continue
    if (item.action === 'delete') map.delete(item.path)
    else map.set(item.path, item)
  }
  return [...map.values()].sort((a, b) => b.at - a.at)
}

/** 文件（或目录下任意后代）最近是否被 AI 改过 */
export function isAiTouched(path, { windowMs = RECENT_WINDOW } = {}) {
  const target = String(path || '')
  if (!target) return false
  const now = Date.now()
  return state.writes.some(item =>
    item.action !== 'delete' &&
    now - item.at <= windowMs &&
    (item.path === target || item.path.startsWith(`${target}/`))
  )
}

export function latestAiWriteAt() {
  return state.writes.length ? state.writes[state.writes.length - 1].at : 0
}
