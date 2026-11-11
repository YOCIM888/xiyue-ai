import {
  deletePath, restoreTrash, purgeTrash, emptyTrash, listDir, writeBlob, writeFile, statFile,
  makeDir, renamePath, pickWorkspaceFolder, clearWorkspaceFolder, importZip, sanitizeFileName,
  formatBytes, restoreHistory,
} from '../../services/workspace'
import { PROJECT_TEMPLATES, scaffoldProject } from '../../services/projectTemplates'

/** 文件树的菜单与写操作：新建、重命名、删除、回收站、导入和挂载文件夹。 */
export function useWorkspaceActions(ctx) {
  function rowMenuItems(row) {
    const items = []
    if (row.kind === 'dir') {
      items.push({
        label: ctx.searchMode.value ? '打开' : (ctx.expanded.has(row.path) ? '折叠' : '展开'),
        action: () => ctx.onRowClick(row),
      })
      if (!ctx.readOnly.value) {
        items.push({ label: '新建文件…', action: () => createFileIn(row.path) })
        items.push({ label: '新建文件夹…', action: () => createFolderIn(row.path) })
      }
      items.push({ label: '打包下载', action: () => ctx.downloadZip(row.path) })
      items.push({ label: '复制路径', action: () => ctx.copyPath(row.path) })
      if (!ctx.readOnly.value) {
        items.push({ label: '重命名…', action: () => renameNode(row) })
        items.push({ label: '删除', action: () => deleteRow(row) })
      }
      return items
    }
    items.push({ label: '打开', action: () => ctx.openFile(row) })
    if (ctx.isAiChanged(row.path)) items.push({ label: '查看 AI 修改', action: () => ctx.openDiff(row) })
    items.push({ label: '历史版本', action: () => ctx.openHistoryFor(row.path) })
    if (/\.html?$/i.test(row.name)) {
      items.push({ label: '网页预览', action: () => ctx.openWebPreviewPath(row.path, row.name) })
    }
    items.push({ label: '复制路径', action: () => ctx.copyPath(row.path) })
    items.push({ label: '下载', action: () => ctx.downloadFileByPath(row.path, row.name) })
    if (!ctx.readOnly.value) {
      items.push({ label: '重命名…', action: () => renameNode(row) })
      items.push({ label: '删除', action: () => deleteRow(row) })
    }
    return items
  }

  function openRowMenu(event, row) {
    if (row.pseudo) {
      openRootMenu(event)
      return
    }
    window.__ui?.showMenu(event.clientX, event.clientY, rowMenuItems(row))
  }

  function openRowMenuFromButton(event, row) {
    const rect = event.currentTarget.getBoundingClientRect()
    window.__ui?.showMenu(rect.right - 170, rect.bottom + 4, rowMenuItems(row))
  }

  function openRootMenu(event) {
    const items = []
    if (!ctx.readOnly.value) {
      items.push({ label: '新建文件…', action: () => createFileIn('') })
      items.push({ label: '新建文件夹…', action: () => createFolderIn('') })
    }
    items.push({ label: '刷新', action: ctx.refreshAll })
    items.push({ label: '全部折叠', action: ctx.collapseAll })
    items.push({ label: '打包下载工作区', action: () => ctx.downloadZip('') })
    window.__ui?.showMenu(event.clientX, event.clientY, items)
  }

  function openMountMenu(event) {
    const items = ctx.status.value.mode === 'folder'
      ? [
          { label: '更换文件夹…', action: chooseFolder },
          { label: '改回内置工作区', action: unmountFolder },
        ]
      : [{ label: '选择本机文件夹…', action: chooseFolder }]
    const rect = event.currentTarget.getBoundingClientRect()
    window.__ui?.showMenu(rect.left, rect.bottom + 4, items)
  }

  function cleanRelativeName(input) {
    return String(input || '')
      .split('/')
      .map(seg => sanitizeFileName(seg, ''))
      .filter(seg => seg && seg !== '.' && seg !== '..')
      .join('/')
  }

  function openTemplateMenu(event) {
    const rect = event.currentTarget.getBoundingClientRect()
    window.__ui?.showMenu(rect.right - 170, rect.bottom + 4, PROJECT_TEMPLATES.map(template => ({
      label: template.label,
      action: () => createProjectFrom(template),
    })))
  }

  async function createProjectFrom(template) {
    if (ctx.readOnly.value) {
      ctx.toastReadOnly()
      return
    }
    const input = await window.__ui?.showPrompt(`用「${template.label}」模板新建项目：${template.description}`, {
      value: template.dir,
      confirmText: '生成',
    })
    if (!input) return
    try {
      const result = await scaffoldProject(template.id, input)
      await ctx.revealPath(result.entry)
      window.__ui?.showToast(`已生成 ${result.dir}/，共 ${result.paths.length} 个文件`, 'success', 2800)
      // 生成完直接开预览：模板的意义就是「新建 → 能跑」，让人当场看见它在动
      ctx.openWebPreviewPath(result.entry, 'index.html')
    } catch (err) {
      ctx.reportError(err, '生成项目失败')
    }
  }

  async function createFileIn(dir) {
    if (ctx.readOnly.value) {
      ctx.toastReadOnly()
      return
    }
    const input = await window.__ui?.showPrompt(`在「${dir || '工作区根目录'}」新建文件`, {
      placeholder: '例如 notes.md 或 sub/notes.md',
      confirmText: '新建',
    })
    if (!input) return
    const rel = cleanRelativeName(input)
    if (!rel) {
      window.__ui?.showToast('文件名不合法', 'error', 3200)
      return
    }
    const path = dir ? `${dir}/${rel}` : rel
    try {
      const exists = await statFile(path)
      if (exists.exists) {
        window.__ui?.showToast(`「${path}」已存在`, 'error', 3200)
        return
      }
      await writeFile(path, '')
      await ctx.revealPath(path)
      window.__ui?.showToast(`已创建 ${path}`, 'success', 2600)
      ctx.preview.value = { path, name: path.split('/').pop(), entry: { size: 0, modified: Date.now() } }
    } catch (err) {
      ctx.reportError(err, '新建文件失败')
    }
  }

  async function createFolderIn(dir) {
    if (ctx.readOnly.value) {
      ctx.toastReadOnly()
      return
    }
    const input = await window.__ui?.showPrompt(`在「${dir || '工作区根目录'}」新建文件夹`, {
      placeholder: '例如 assets 或 pages/blog',
      confirmText: '新建',
    })
    if (!input) return
    const rel = cleanRelativeName(input)
    if (!rel) {
      window.__ui?.showToast('文件夹名不合法', 'error', 3200)
      return
    }
    const path = dir ? `${dir}/${rel}` : rel
    try {
      await makeDir(path)
      const segments = path.split('/')
      for (let i = 0; i < segments.length; i += 1) {
        const dirPath = segments.slice(0, i + 1).join('/')
        if (!ctx.expanded.has(dirPath) && ctx.expanded.size < 60) ctx.expanded.add(dirPath)
        await ctx.ensureChildren(dirPath, { force: true })
      }
      ctx.persistExpanded()
      window.__ui?.showToast(`已创建 ${path}/`, 'success', 2600)
    } catch (err) {
      ctx.reportError(err, '新建文件夹失败')
    }
  }

  async function renameNode(row) {
    if (ctx.readOnly.value) {
      ctx.toastReadOnly()
      return
    }
    const input = await window.__ui?.showPrompt(`重命名「${row.name}」`, {
      value: row.name,
      confirmText: '重命名',
    })
    if (!input) return
    const target = sanitizeFileName(input)
    if (!target || target === row.name) return
    try {
      const result = await renamePath(row.path, target)
      ctx.migratePathState(row.path, result.path)
      if (ctx.preview.value?.path === row.path) {
        ctx.preview.value = { ...ctx.preview.value, path: result.path, name: target }
      } else if (ctx.preview.value?.path?.startsWith(`${row.path}/`)) {
        const suffix = ctx.preview.value.path.slice(row.path.length)
        ctx.preview.value = { ...ctx.preview.value, path: `${result.path}${suffix}` }
      }
      if (ctx.diffTarget.value?.path === row.path) ctx.diffTarget.value = null
      await ctx.refreshTreePath(row.path)
      window.__ui?.showToast(`已重命名为 ${result.path}${row.kind === 'dir' ? '/' : ''}`, 'success', 2800)
    } catch (err) {
      ctx.reportError(err, '重命名失败')
    }
  }

  async function deleteRow(row) {
    if (await removePath(row.path, row.name)) {
      if (ctx.preview.value?.path === row.path) ctx.preview.value = null
      if (ctx.diffTarget.value?.path === row.path) ctx.diffTarget.value = null
      await ctx.refreshAfterDelete(row.path)
    }
  }

  async function removePath(path, label) {
    if (ctx.readOnly.value) {
      ctx.toastReadOnly()
      return null
    }
    const ok = await window.__ui?.showConfirm(`删除「${label}」？文件会移入回收站，可在面板「回收站」撤销。`)
    if (!ok) return null
    try {
      const result = await deletePath(path)
      window.__ui?.showToast('已移入回收站', 'success', 6000, {
        actionText: '撤销',
        onAction: () => undoDelete(result.trashName),
      })
      ctx.scheduleUsageRefresh()
      return result
    } catch (err) {
      ctx.reportError(err, '删除失败')
      return null
    }
  }

  async function undoDelete(trashName) {
    try {
      const result = await restoreTrash(trashName)
      window.__ui?.showToast(
        result.renamed ? `原路径已被占用，已恢复为 ${result.path}` : `已恢复到 ${result.path}`,
        'success', 3600
      )
      await ctx.refreshAfterDelete(result.path)
      if (ctx.view.value === 'trash') await ctx.loadTrash()
      ctx.scheduleUsageRefresh()
    } catch (err) {
      ctx.reportError(err, '撤销失败')
    }
  }

  async function restoreEntry(item) {
    if (ctx.readOnly.value) return
    try {
      const result = await restoreTrash(item.name)
      window.__ui?.showToast(
        result.renamed ? `原路径已被占用，已恢复为 ${result.path}` : `已恢复到 ${result.path}`,
        'success', 3600
      )
      await ctx.loadTrash()
      await ctx.refreshTreePath(result.path)
      ctx.scheduleUsageRefresh()
    } catch (err) {
      ctx.reportError(err, '恢复失败')
    }
  }

  async function purgeEntry(item) {
    if (ctx.readOnly.value) return
    const ok = await window.__ui?.showConfirm(`永久删除「${item.originalName}」？此操作无法撤销。`)
    if (!ok) return
    try {
      await purgeTrash(item.name)
      await ctx.loadTrash()
      ctx.scheduleUsageRefresh()
    } catch (err) {
      ctx.reportError(err, '永久删除失败')
    }
  }

  async function clearTrash() {
    if (ctx.readOnly.value) return
    const ok = await window.__ui?.showConfirm(`清空回收站？其中 ${ctx.trash.value.length} 个条目将被永久删除。`)
    if (!ok) return
    try {
      const result = await emptyTrash()
      window.__ui?.showToast(`已永久删除 ${result.removed} 个条目`, 'success')
      await ctx.loadTrash()
      ctx.scheduleUsageRefresh()
    } catch (err) {
      ctx.reportError(err, '清空回收站失败')
    }
  }

  async function restoreVersion(version) {
    if (ctx.readOnly.value) return
    try {
      const result = await restoreHistory(version.file)
      window.__ui?.showToast(`已恢复 ${result.path} 的历史版本`, 'success', 3600)
      await ctx.loadHistory()
      await ctx.refreshTreePath(result.path)
      ctx.scheduleUsageRefresh()
    } catch (err) {
      ctx.reportError(err, '恢复历史版本失败')
    }
  }

  async function chooseFolder() {
    const result = await pickWorkspaceFolder()
    if (result.ok) {
      window.__ui?.showToast(`已挂载文件夹「${result.name}」`, 'success')
      ctx.preview.value = null
      ctx.diffTarget.value = null
      ctx.expanded.clear()
      ctx.persistExpanded()
      await ctx.refreshStatus()
      await ctx.loadTree()
      ctx.refreshUsage()
    } else if (!result.cancelled) {
      ctx.reportError(result, '选择文件夹失败')
    }
  }

  async function unmountFolder() {
    const ok = await window.__ui?.showConfirm('改回内置工作区？原本机文件夹中的文件不会被删除。')
    if (!ok) return
    await clearWorkspaceFolder()
    ctx.preview.value = null
    ctx.diffTarget.value = null
    ctx.expanded.clear()
    ctx.persistExpanded()
    await ctx.refreshStatus()
    await ctx.loadTree()
    ctx.refreshUsage()
  }

  async function handleImport(e) {
    const files = [...(e.target.files || [])]
    e.target.value = ''
    if (!files.length) return
    if (ctx.readOnly.value) {
      ctx.toastReadOnly()
      return
    }
    const zipList = files.filter(file => /\.zip$/i.test(file.name))
    const plainFiles = files.filter(file => !/\.zip$/i.test(file.name))

    if (zipList.length) {
      const ok = await window.__ui?.showConfirm(`将把 ${zipList.length} 个 zip 备份解压到工作区根目录，同名文件会被覆盖，继续？`)
      if (!ok) return
      for (const file of zipList) {
        try {
          const result = await importZip(file, '')
          const skipped = result.skipped.length ? `，跳过 ${result.skipped.length} 项` : ''
          window.__ui?.showToast(
            `已从 ${file.name} 恢复 ${result.imported} 个文件（${formatBytes(result.bytes)}${skipped}）`,
            'success', 4800
          )
        } catch (err) {
          ctx.reportError(err, `${file.name} 导入失败`)
        }
      }
    }

    if (plainFiles.length) {
      let names = new Set()
      try {
        const listing = await listDir('')
        names = new Set(listing.entries.map(entry => entry.name))
      } catch {
        // 列目录失败时直接覆盖导入
      }
      if (plainFiles.some(file => names.has(file.name))) {
        const ok = await window.__ui?.showConfirm('工作区根目录存在同名文件，导入将覆盖，继续？')
        if (!ok) {
          await ctx.loadTree()
          return
        }
      }
      let failed = 0
      for (const file of plainFiles) {
        try {
          await writeBlob(sanitizeFileName(file.name), file)
        } catch (err) {
          failed += 1
          ctx.reportError(err, `${file.name} 导入失败`)
        }
      }
      if (failed < plainFiles.length) window.__ui?.showToast(`已导入 ${plainFiles.length - failed} 个文件`, 'success')
    }

    await ctx.loadTree()
    ctx.scheduleUsageRefresh()
  }

  return {
    rowMenuItems, openRowMenu, openRowMenuFromButton, openRootMenu, openMountMenu, cleanRelativeName,
    openTemplateMenu, createProjectFrom, createFileIn, createFolderIn, renameNode, deleteRow,
    removePath, undoDelete, restoreEntry, purgeEntry, clearTrash, restoreVersion, chooseFolder,
    unmountFolder, handleImport,
  }
}
