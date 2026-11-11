import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import {
  getWorkspaceStatus, ensureWorkspacePermission, cleanupTrash, getWorkspaceUsage, formatBytes, sanitizeFileName,
} from '../../services/workspace'
import { previewRequest } from '../../services/previewSession'
import { getTaskArtifacts, latestAiWriteAt } from '../../services/workspaceActivity'

const TRASH_RETENTION_DAYS = 30
const PANEL_WIDTH_KEY = 'xiyue_workspace_width'

function loadPanelWidth() {
  const saved = Number(localStorage.getItem(PANEL_WIDTH_KEY))
  return Number.isFinite(saved) && saved >= 340 && saved <= 760 ? saved : 420
}

/**
 * 工作区面板外壳：打开/关闭、宽度拖拽、状态栏、预览请求与活动提示。
 * 业务动作由 tree / views / actions 三个 composable 提供，通过共享 ctx 调用。
 */
export function useWorkspaceShell(ctx) {
  const isOpen = ref(false)
  const resizing = ref(false)
  const panelWidth = ref(loadPanelWidth())
  const status = ref({ mode: 'opfs', folderName: '', permission: null, folderSupported: false, opfsSupported: true })
  const importInput = ref(null)
  const webPreview = ref(null)
  const zipping = ref(false)
  const view = ref('files')
  const trash = ref([])
  const historyAll = ref([])
  const historyFilter = ref('')
  const viewLoading = ref(false)
  const viewError = ref('')
  const usage = ref(null)
  const changedPath = ref('')
  const preview = ref(null)
  const diffTarget = ref(null)
  const artifacts = ref([])
  const lastAiWriteAt = ref(0)
  const activityTick = ref(0)
  const zippingArtifacts = ref(false)

  let changeTimer = null
  let highlightTimer = null
  let usageTimer = null
  let activityTimer = null

  const readOnly = computed(() => status.value.mode === 'folder' && status.value.permission !== 'granted')
  const historyGroups = computed(() => historyFilter.value
    ? historyAll.value.filter(group => group.path === historyFilter.value)
    : historyAll.value)
  const usagePercent = computed(() => {
    if (!usage.value?.quota) return 0
    return Math.min(100, Math.round((usage.value.usage / usage.value.quota) * 100))
  })
  const usageWarn = computed(() => usagePercent.value >= 85)
  const statusText = computed(() => {
    if (status.value.mode === 'folder') {
      return readOnly.value ? `只读 · ${status.value.folderName || '本机文件夹'}` : `本机文件夹 · ${status.value.folderName}`
    }
    return '浏览器内置工作区'
  })
  const usageText = computed(() => {
    if (!usage.value) return ''
    const files = `${usage.value.files}${usage.value.files >= 5000 ? '+' : ''} 个文件`
    const size = formatBytes(usage.value.bytes)
    if (!usage.value.quota) return `${files} · ${size}`
    return `${files} · ${size} · 存储 ${formatBytes(usage.value.usage)} / ${formatBytes(usage.value.quota)}`
  })
  const usageTitle = computed(() => usage.value
    ? `工作区文件 ${usage.value.files} 个，共 ${formatBytes(usage.value.bytes)}；浏览器存储占用 ${formatBytes(usage.value.usage)}，配额 ${formatBytes(usage.value.quota)}`
    : '')
  const aiWriteText = computed(() => {
    if (activityTick.value < 0 || !lastAiWriteAt.value) return ''
    return timeAgo(lastAiWriteAt.value)
  })
  const aiWriteTitle = computed(() => lastAiWriteAt.value
    ? `最近一次 AI 写入：${formatTime(lastAiWriteAt.value)}`
    : '')

  function toggle() {
    if (isOpen.value) close()
    else open()
  }

  async function open() {
    isOpen.value = true
    preview.value = null
    diffTarget.value = null
    view.value = 'files'
    historyFilter.value = ''
    changedPath.value = ''
    ctx.clearFilter()
    await refreshStatus()
    if (status.value.mode === 'folder' && status.value.permission !== 'granted') {
      const result = await ensureWorkspacePermission()
      if (!result.ok) window.__ui?.showToast(result.message || '文件夹授权失败', 'error', 4200)
      await refreshStatus()
    }
    await ctx.loadTree()
    refreshActivity()
    refreshUsage()
    cleanupTrash()
      .then(result => {
        if (result?.removed) {
          window.__ui?.showToast(`已自动清理 ${result.removed} 个超过 ${TRASH_RETENTION_DAYS} 天的回收站条目`, 'info', 3600)
        }
      })
      .catch(() => {})
  }

  function close() {
    isOpen.value = false
    preview.value = null
    diffTarget.value = null
    webPreview.value = null
  }

  function isPanelOpen() {
    return isOpen.value
  }

  function startResize(event) {
    if (window.innerWidth <= 1024) return
    const startX = event.clientX
    const startWidth = panelWidth.value
    resizing.value = true
    // 合并到每帧一次，避免高频 pointermove 造成掉帧
    let frame = 0
    let lastX = startX
    const apply = () => {
      frame = 0
      panelWidth.value = Math.round(Math.max(340, Math.min(760, startWidth + startX - lastX)))
    }
    const onMove = moveEvent => {
      lastX = moveEvent.clientX
      if (!frame) frame = requestAnimationFrame(apply)
    }
    const onUp = () => {
      if (frame) {
        cancelAnimationFrame(frame)
        apply()
      }
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      resizing.value = false
      try { localStorage.setItem(PANEL_WIDTH_KEY, String(panelWidth.value)) } catch { /* ignore */ }
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onUp)
  }

  function onKeydown(event) {
    if (event.ctrlKey || event.metaKey) return
    if (event.altKey && event.shiftKey && event.code === 'KeyW') {
      event.preventDefault()
      toggle()
    }
  }

  async function refreshStatus() {
    try {
      status.value = await getWorkspaceStatus()
    } catch {
      // 状态读取失败时保持上次结果
    }
  }

  function reportError(err, fallback) {
    window.__ui?.showToast(err?.message || fallback, 'error', 4200)
  }

  function toastReadOnly() {
    window.__ui?.showToast('授权已失效，当前为只读模式', 'error', 3200)
  }

  async function refreshUsage() {
    try {
      usage.value = await getWorkspaceUsage()
    } catch {
      // 统计失败不影响文件操作
    }
  }

  function scheduleUsageRefresh() {
    clearTimeout(usageTimer)
    usageTimer = setTimeout(refreshUsage, 900)
  }

  function refreshActivity() {
    artifacts.value = getTaskArtifacts()
    lastAiWriteAt.value = latestAiWriteAt()
    activityTick.value += 1
  }

  function openWebPreviewPath(path, name) {
    webPreview.value = { path, name }
  }

  /**
   * preview 工具要验收页面时会请求打开抽屉，所以面板收着也要先展开：
   * 自测回路的意义就是模型自己点一遍，不能指望用户刚好把预览开着。
   * 只读模式（文件夹没授权）下不开 —— 那边读不到文件，打开了也只是一屏报错。
   */
  watch(previewRequest, async (request) => {
    const path = String(request?.path || '')
    if (!path || readOnly.value) return
    if (!isOpen.value) await open()
    openWebPreviewPath(path, request.name || path.split('/').pop())
  })

  function saveBlob(blob, filename) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = sanitizeFileName(filename)
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }

  function formatStamp(at) {
    const date = new Date(Number(at) || Date.now())
    const pad = n => String(n).padStart(2, '0')
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`
  }

  function formatTime(at) {
    if (!at) return '时间未知'
    const date = new Date(Number(at))
    if (Number.isNaN(date.getTime())) return '时间未知'
    const pad = n => String(n).padStart(2, '0')
    const now = new Date()
    const datePart = date.getFullYear() === now.getFullYear()
      ? `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
      : `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    return `${datePart} ${pad(date.getHours())}:${pad(date.getMinutes())}`
  }

  function timeAgo(at) {
    const diff = Date.now() - Number(at || 0)
    if (diff < 60_000) return '刚刚'
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
    return shortTime(at)
  }

  function shortTime(at) {
    if (!at) return ''
    const date = new Date(Number(at))
    if (Number.isNaN(date.getTime())) return ''
    const pad = n => String(n).padStart(2, '0')
    const now = new Date()
    if (date.toDateString() === now.toDateString()) return `${pad(date.getHours())}:${pad(date.getMinutes())}`
    if (date.getFullYear() === now.getFullYear()) return `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`
  }

  function onWorkspaceChanged(event) {
    const path = String(event?.detail?.path || '')
    changedPath.value = path
    clearTimeout(highlightTimer)
    highlightTimer = setTimeout(() => { changedPath.value = '' }, 2600)
    activityTick.value += 1

    clearTimeout(changeTimer)
    changeTimer = setTimeout(async () => {
      if (!isOpen.value) return
      if (view.value === 'trash') await ctx.loadTrash()
      else if (view.value === 'history') await ctx.loadHistory()
      else if (view.value === 'artifacts') refreshActivity()
      else if (ctx.searchMode.value) await ctx.runSearch()
      else await ctx.refreshTreePath(path)
      scheduleUsageRefresh()
    }, 300)
  }

  function onAiWrite() {
    refreshActivity()
  }

  function onMinuteTick() {
    activityTick.value += 1
  }

  onMounted(() => {
    window.addEventListener('xiyue:workspace-changed', onWorkspaceChanged)
    window.addEventListener('xiyue:workspace-ai-write', onAiWrite)
    window.addEventListener('keydown', onKeydown)
    activityTimer = setInterval(onMinuteTick, 60_000)
  })

  onUnmounted(() => {
    window.removeEventListener('xiyue:workspace-changed', onWorkspaceChanged)
    window.removeEventListener('xiyue:workspace-ai-write', onAiWrite)
    window.removeEventListener('keydown', onKeydown)
    clearTimeout(changeTimer)
    clearTimeout(highlightTimer)
    clearTimeout(usageTimer)
    clearInterval(activityTimer)
  })

  return {
    isOpen, resizing, panelWidth, status, importInput, webPreview, zipping, view, trash, historyAll,
    historyFilter, viewLoading, viewError, usage, changedPath, preview, diffTarget, artifacts,
    lastAiWriteAt, activityTick, zippingArtifacts, readOnly, historyGroups, usagePercent, usageWarn,
    statusText, usageText, usageTitle, aiWriteText, aiWriteTitle, toggle, open, close, isPanelOpen,
    startResize, refreshStatus, reportError, toastReadOnly, refreshUsage, scheduleUsageRefresh,
    refreshActivity, openWebPreviewPath, saveBlob, formatStamp, formatTime, timeAgo, shortTime,
    sanitizeFileName,
  }
}
