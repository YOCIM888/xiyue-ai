/**
 * 工作区回收站：删除移入 .xiyue-trash，可恢复；彻底删除会同步清理历史版本。
 */
import {
  TRASH_DIR, TRASH_RETENTION_DAYS,
  copyEntry, getRoot, measureEntry, notifyWorkspaceChanged, parseLegacyTrashName,
  readJsonFrom, resolveDir, resolveParent, sanitizeFileName, snapshots, splitPath, uniquePath,
  writeFileToDir, writeJsonTo,
} from './core'
import { pruneHistoryForDeleted } from './history'

/** 删除 = 移入根目录下的 .xiyue-trash，记录原路径与时间，可随时恢复 */
export async function deletePath(path) {
  const segments = splitPath(path)
  if (!segments.length) throw new Error('不能删除工作区根目录')
  const key = segments.join('/')
  const root = await getRoot()
  const parent = await resolveDir(segments.slice(0, -1))
  const name = segments[segments.length - 1]
  let kind
  try {
    await parent.getFileHandle(name)
    kind = 'file'
  } catch {
    try {
      await parent.getDirectoryHandle(name)
      kind = 'dir'
    } catch {
      throw new Error(`文件不存在：${path}`)
    }
  }
  const trash = await root.getDirectoryHandle(TRASH_DIR, { create: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  let entryName = `${stamp}_${sanitizeFileName(name)}`
  for (let i = 2; i <= 999; i += 1) {
    try {
      await trash.getDirectoryHandle(entryName)
      entryName = `${stamp}_${i}_${sanitizeFileName(name)}`
    } catch {
      break
    }
  }
  const itemDir = await trash.getDirectoryHandle(entryName, { create: true })
  await writeJsonTo(itemDir, 'meta.json', { version: 1, path: key, name, kind, at: Date.now() })
  if (kind === 'file') {
    const file = await (await parent.getFileHandle(name)).getFile()
    await writeFileToDir(itemDir, 'content', file)
  } else {
    const src = await parent.getDirectoryHandle(name)
    const dest = await itemDir.getDirectoryHandle('content', { create: true })
    for await (const child of src.values()) await copyEntry(src, child.name, dest)
  }
  await parent.removeEntry(name, { recursive: kind === 'dir' })
  snapshots.delete(key)
  notifyWorkspaceChanged(key)
  return { trashedAs: `${TRASH_DIR}/${entryName}`, trashName: entryName, path: key }
}

/** 回收站列表：兼容旧版扁平条目 */
export async function listTrash() {
  const root = await getRoot()
  let trash
  try {
    trash = await root.getDirectoryHandle(TRASH_DIR)
  } catch {
    return []
  }
  const items = []
  for await (const entry of trash.values()) {
    if (entry.kind === 'directory') {
      let meta = null
      try {
        meta = await readJsonFrom(entry, 'meta.json')
      } catch {
        // 旧格式目录
      }
      if (meta?.path && meta?.kind) {
        let content = null
        try {
          content = meta.kind === 'file'
            ? await entry.getFileHandle('content')
            : await entry.getDirectoryHandle('content')
        } catch {
          // 内容缺失，仍展示以便清理
        }
        items.push({
          name: entry.name,
          path: meta.path,
          originalName: meta.name || String(meta.path).split('/').pop(),
          kind: meta.kind,
          at: Number(meta.at) || null,
          size: content ? await measureEntry(content) : 0,
          legacy: false,
        })
        continue
      }
    }
    const legacy = parseLegacyTrashName(entry.name)
    items.push({
      name: entry.name,
      path: legacy.originalName,
      originalName: legacy.originalName,
      kind: entry.kind === 'directory' ? 'dir' : 'file',
      at: legacy.at,
      size: await measureEntry(entry),
      legacy: true,
    })
  }
  items.sort((a, b) => (b.at || 0) - (a.at || 0) || a.name.localeCompare(b.name))
  return items
}

export async function restoreTrash(trashName) {
  const segments = splitPath(trashName)
  if (segments.length !== 1) throw new Error('无效的回收站条目')
  const entryName = segments[0]
  const root = await getRoot()
  const trash = await root.getDirectoryHandle(TRASH_DIR)
  let entry
  try {
    entry = await trash.getDirectoryHandle(entryName)
  } catch {
    // 旧版把文件扁平地存在回收站根下，句柄类型是 file
    try {
      entry = await trash.getFileHandle(entryName)
    } catch {
      throw new Error('回收站条目不存在，可能已被清理')
    }
  }
  let meta = null
  try {
    meta = await readJsonFrom(entry, 'meta.json')
  } catch {
    // 旧格式条目
  }
  let source
  let kind
  let targetPath
  if (meta?.path && meta?.kind) {
    kind = meta.kind
    targetPath = meta.path
    try {
      source = kind === 'file' ? await entry.getFileHandle('content') : await entry.getDirectoryHandle('content')
    } catch {
      throw new Error('回收站条目内容缺失，无法恢复')
    }
  } else {
    const legacy = parseLegacyTrashName(entryName)
    kind = entry.kind === 'directory' ? 'dir' : 'file'
    targetPath = legacy.originalName
    source = entry
  }
  const restoredPath = await uniquePath(targetPath)
  const { dir, name: targetName } = await resolveParent(restoredPath, { create: true })
  if (kind === 'file') {
    await writeFileToDir(dir, targetName, await source.getFile())
  } else {
    const target = await dir.getDirectoryHandle(targetName, { create: true })
    for await (const child of source.values()) await copyEntry(source, child.name, target)
  }
  await trash.removeEntry(entryName, { recursive: true })
  notifyWorkspaceChanged(restoredPath)
  return { path: restoredPath, renamed: restoredPath !== targetPath }
}

/** 读取回收站条目的原路径与删除时刻，供彻底删除后清理历史版本用 */
async function readTrashOrigin(trash, entryName) {
  try {
    const meta = await readJsonFrom(await trash.getDirectoryHandle(entryName), 'meta.json')
    if (!meta?.path) return null
    return { path: String(meta.path), deletedAt: Number(meta.at) || null }
  } catch {
    return null
  }
}

export async function purgeTrash(trashName) {
  const segments = splitPath(trashName)
  if (segments.length !== 1) throw new Error('无效的回收站条目')
  const root = await getRoot()
  const trash = await root.getDirectoryHandle(TRASH_DIR)
  const entryName = segments[0]
  const origin = await readTrashOrigin(trash, entryName)
  await trash.removeEntry(entryName, { recursive: true })
  await pruneHistoryForDeleted([origin])
  notifyWorkspaceChanged('')
}

export async function emptyTrash() {
  const root = await getRoot()
  let trash
  try {
    trash = await root.getDirectoryHandle(TRASH_DIR)
  } catch {
    return { removed: 0 }
  }
  let removed = 0
  const origins = []
  for await (const entry of trash.values()) {
    origins.push(await readTrashOrigin(trash, entry.name))
    await trash.removeEntry(entry.name, { recursive: true })
    removed += 1
  }
  if (removed) {
    await pruneHistoryForDeleted(origins)
    notifyWorkspaceChanged('')
  }
  return { removed }
}

/** 清理超过 30 天的回收站条目，面板打开时调用 */
export async function cleanupTrash() {
  const root = await getRoot()
  let trash
  try {
    trash = await root.getDirectoryHandle(TRASH_DIR)
  } catch {
    return { removed: 0 }
  }
  const deadline = Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000
  let removed = 0
  const origins = []
  for await (const entry of trash.values()) {
    let at
    try {
      at = Number((await readJsonFrom(entry, 'meta.json')).at) || null
    } catch {
      at = parseLegacyTrashName(entry.name).at
    }
    if (at && at < deadline) {
      origins.push(await readTrashOrigin(trash, entry.name))
      await trash.removeEntry(entry.name, { recursive: true })
      removed += 1
    }
  }
  if (removed) {
    await pruneHistoryForDeleted(origins)
    notifyWorkspaceChanged('')
  }
  return { removed }
}
