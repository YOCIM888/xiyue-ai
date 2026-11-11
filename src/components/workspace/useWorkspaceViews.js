import {
  listTrash, listHistory, ensureWorkspacePermission, zipFiles, zipDirectory, getFileBlob, getHistoryText, formatBytes,
} from '../../services/workspace'

const ACTION_LABEL = {
  write: '写入', edit: '修改', append: '追加', mkdir: '新建目录',
  rename: '重命名', move: '移动', copy: '复制', delete: '删除',
}

/** 回收站 / 历史版本 / 任务产物视图，以及文件预览与下载动作。 */
export function useWorkspaceViews(ctx) {
  function openFile(row) {
    ctx.preview.value = {
      path: row.path,
      name: row.name,
      entry: { size: row.size, modified: row.modified },
    }
  }

  function openHit(hit) {
    ctx.preview.value = { path: hit.path, name: hit.name, entry: null, focusLine: hit.line }
  }

  function openDiff(row) {
    ctx.diffTarget.value = { path: row.path, name: row.name, fromViewer: false }
    ctx.preview.value = null
  }

  function openDiffFromViewer(path) {
    ctx.diffTarget.value = { path, name: String(path).split('/').pop() || '', fromViewer: true }
  }

  function closeDiff() {
    ctx.diffTarget.value = null
  }

  function onDiffRestored(path) {
    ctx.refreshTreePath(path)
  }

  async function deleteFromViewer(path, name) {
    const label = name || String(path).split('/').pop() || path
    if (await ctx.removePath(path, label)) {
      ctx.preview.value = null
      ctx.diffTarget.value = null
      await ctx.refreshAfterDelete(path)
    }
  }

  function actionLabel(action) {
    return ACTION_LABEL[action] || action
  }

  async function refreshAll() {
    await ctx.refreshStatus()
    if (ctx.view.value === 'trash') await loadTrash()
    else if (ctx.view.value === 'history') await loadHistory()
    else if (ctx.view.value === 'artifacts') ctx.refreshActivity()
    else {
      if (ctx.searchMode.value) await ctx.runSearch()
      await ctx.loadTree()
    }
    ctx.refreshUsage()
  }

  async function switchView(next) {
    if (ctx.view.value === next) return
    ctx.view.value = next
    ctx.preview.value = null
    ctx.diffTarget.value = null
    ctx.viewError.value = ''
    ctx.historyFilter.value = ''
    if (next === 'trash') await loadTrash()
    else if (next === 'history') await loadHistory()
    else if (next === 'artifacts') ctx.refreshActivity()
    else {
      ctx.clearFilter()
      await ctx.loadTree()
    }
  }

  async function loadTrash() {
    ctx.viewLoading.value = true
    ctx.viewError.value = ''
    try {
      ctx.trash.value = await listTrash()
    } catch (err) {
      ctx.trash.value = []
      ctx.viewError.value = err?.message || '读取回收站失败'
    } finally {
      ctx.viewLoading.value = false
    }
  }

  async function loadHistory() {
    ctx.viewLoading.value = true
    ctx.viewError.value = ''
    try {
      ctx.historyAll.value = await listHistory()
      if (ctx.historyFilter.value && !ctx.historyAll.value.some(group => group.path === ctx.historyFilter.value)) {
        ctx.historyFilter.value = ''
      }
    } catch (err) {
      ctx.historyAll.value = []
      ctx.viewError.value = err?.message || '读取历史版本失败'
    } finally {
      ctx.viewLoading.value = false
    }
  }

  async function reauthorize() {
    const result = await ensureWorkspacePermission()
    await ctx.refreshStatus()
    if (!result.ok) {
      ctx.reportError(result, '重新授权失败')
      return
    }
    window.__ui?.showToast('文件夹授权已恢复', 'success')
    await refreshAll()
  }

  async function openPreviewFromPath(path) {
    ctx.view.value = 'files'
    ctx.clearFilter()
    ctx.preview.value = { path, name: String(path).split('/').pop() || path, entry: null }
    await ctx.revealPath(path)
  }

  async function openHistoryFor(path) {
    ctx.view.value = 'history'
    ctx.preview.value = null
    ctx.diffTarget.value = null
    ctx.historyFilter.value = String(path || '')
    ctx.viewError.value = ''
    await loadHistory()
  }

  async function openArtifact(item) {
    if (item.action === 'mkdir') {
      ctx.view.value = 'files'
      await ctx.revealInTree(item.path)
      return
    }
    ctx.view.value = 'files'
    await ctx.revealPath(item.path)
    ctx.preview.value = { path: item.path, name: ctx.artifactName(item.path), entry: null }
  }

  async function downloadArtifacts() {
    if (!ctx.artifacts.value.length || ctx.zippingArtifacts.value) return
    ctx.zippingArtifacts.value = true
    try {
      const result = await zipFiles(
        ctx.artifacts.value.map(item => item.path),
        `任务产物-${ctx.formatStamp(Date.now())}.zip`
      )
      ctx.saveBlob(result.blob, result.name)
      window.__ui?.showToast(`已打包 ${result.files} 个文件（${formatBytes(result.bytes)}）`, 'success')
    } catch (err) {
      ctx.reportError(err, '打包任务产物失败')
    } finally {
      ctx.zippingArtifacts.value = false
    }
  }

  async function downloadZip(path) {
    if (ctx.zipping.value) return
    ctx.zipping.value = true
    try {
      const result = await zipDirectory(path)
      ctx.saveBlob(result.blob, result.name)
      window.__ui?.showToast(`已打包 ${result.files} 个文件（${formatBytes(result.bytes)}）`, 'success')
    } catch (err) {
      ctx.reportError(err, '打包失败')
    } finally {
      ctx.zipping.value = false
    }
  }

  function downloadCurrentZip() {
    return downloadZip('')
  }

  async function downloadFileByPath(path, name) {
    try {
      const file = await getFileBlob(path)
      ctx.saveBlob(file, name || path.split('/').pop() || 'file')
    } catch (err) {
      ctx.reportError(err, '下载失败')
    }
  }

  async function copyPath(path) {
    try {
      await navigator.clipboard.writeText(path)
      window.__ui?.showToast(`已复制路径 ${path}`, 'success', 2400)
    } catch {
      window.__ui?.showToast('复制失败，请检查剪贴板权限', 'error', 3200)
    }
  }

  async function downloadVersion(version) {
    try {
      const payload = await getHistoryText(version.file)
      const name = payload.path.split('/').pop() || 'history.txt'
      const dot = name.lastIndexOf('.')
      const base = ctx.sanitizeFileName(dot > 0 ? name.slice(0, dot) : name)
      const ext = dot > 0 ? name.slice(dot) : '.txt'
      const stamp = ctx.formatStamp(version.at || payload.at)
      ctx.saveBlob(new Blob([payload.text], { type: 'text/plain;charset=utf-8' }), `${base}-${stamp}${ext}`)
    } catch (err) {
      ctx.reportError(err, '下载历史版本失败')
    }
  }

  return {
    openFile, openHit, openDiff, openDiffFromViewer, closeDiff, onDiffRestored, deleteFromViewer,
    actionLabel, refreshAll, switchView, loadTrash, loadHistory, reauthorize, openPreviewFromPath,
    openHistoryFor, openArtifact, downloadArtifacts, downloadZip, downloadCurrentZip,
    downloadFileByPath, copyPath, downloadVersion,
  }
}
