/**
 * 工作区历史版本：覆盖写前把旧内容备份到 .xiyue-history。
 * 单文件保留 5 版，全局最多 200 版。
 */
import {
  HISTORY_DIR, HISTORY_KEEP, HISTORY_TOTAL_MAX, MAX_BACKUP_CHARS,
  getRoot, splitPath, formatBytes, hashPath,
} from './core'

export async function getHistoryDir(create = false) {
  const root = await getRoot()
  try {
    return await root.getDirectoryHandle(HISTORY_DIR, { create })
  } catch (err) {
    if (err?.name === 'NotFoundError') return null
    throw err
  }
}

export async function readHistoryIndex(dir) {
  try {
    const file = await (await dir.getFileHandle('index.json')).getFile()
    const parsed = JSON.parse(await file.text())
    if (parsed && parsed.entries && typeof parsed.entries === 'object') return parsed
  } catch {
    // 索引缺失或损坏时按空索引重建
  }
  return { version: 1, entries: {} }
}

export async function writeHistoryIndex(dir, index) {
  const handle = await dir.getFileHandle('index.json', { create: true })
  const writable = await handle.createWritable()
  await writable.write(JSON.stringify(index))
  await writable.close()
}

export function sortVersionsDesc(a, b) {
  return (b.at || 0) - (a.at || 0)
}

/** 备份没做成不能阻断写入，但也不能无声：同一路径一分钟内只提示一次 */
const BACKUP_WARN_COOLDOWN_MS = 60 * 1000
const backupWarnedAt = new Map()

/** 原样返回 reason，方便一路带回写入结果里 */
function reportBackupIssue(pathKey, reason) {
  const last = backupWarnedAt.get(pathKey) || 0
  if (Date.now() - last >= BACKUP_WARN_COOLDOWN_MS) {
    backupWarnedAt.set(pathKey, Date.now())
    window.__ui?.showToast?.(`${pathKey} 这次覆盖没有生成历史版本：${reason}`, 'error', 5200)
  }
  return reason
}

/** 覆盖前把旧内容写入 .xiyue-history；返回 '' 表示无需提醒 */
export async function backupExisting(pathKey, file, nextText) {
  if (!file || file.size === 0) return ''
  if (file.size > MAX_BACKUP_CHARS) {
    return reportBackupIssue(pathKey, `原内容 ${formatBytes(file.size)} 超过 ${formatBytes(MAX_BACKUP_CHARS)}，不备份`)
  }
  let text
  try {
    text = new TextDecoder('utf-8').decode(await file.arrayBuffer())
  } catch {
    return reportBackupIssue(pathKey, '原内容无法按文本读取')
  }
  if (text === String(nextText ?? '')) return ''
  if (text.includes('\u0000')) return reportBackupIssue(pathKey, '原内容是二进制，历史版本只存文本')
  try {
    const dir = await getHistoryDir(true)
    if (!dir) return reportBackupIssue(pathKey, '历史目录无法创建')
    const at = Date.now()
    const fileName = `h_${hashPath(pathKey)}_${at}_${Math.random().toString(36).slice(2, 6)}.json`
    const handle = await dir.getFileHandle(fileName, { create: true })
    const writable = await handle.createWritable()
    await writable.write(JSON.stringify({ path: pathKey, at, size: file.size, text }))
    await writable.close()

    const index = await readHistoryIndex(dir)
    const versions = Array.isArray(index.entries[pathKey]) ? index.entries[pathKey] : []
    versions.unshift({ file: fileName, at, size: file.size })
    const dropped = versions.slice(HISTORY_KEEP)
    index.entries[pathKey] = versions.slice(0, HISTORY_KEEP)

    const all = []
    for (const [key, list] of Object.entries(index.entries)) {
      for (const version of list) all.push({ key, ...version })
    }
    if (all.length > HISTORY_TOTAL_MAX) {
      all.sort(sortVersionsDesc)
      for (const item of all.slice(HISTORY_TOTAL_MAX)) {
        dropped.push(item)
        index.entries[item.key] = (index.entries[item.key] || []).filter(version => version.file !== item.file)
        if (!index.entries[item.key].length) delete index.entries[item.key]
      }
    }
    for (const item of dropped) {
      try { await dir.removeEntry(item.file) } catch { /* 已被清理 */ }
    }
    await writeHistoryIndex(dir, index)
  } catch (err) {
    // 备份没做成不阻断正常写入，只是这次覆盖回不去，必须让调用方知道
    return reportBackupIssue(pathKey, `历史目录不可写（${err?.message || err}）`)
  }
  return ''
}

/** 历史版本列表（按文件分组，最新在前） */
export async function listHistory() {
  const dir = await getHistoryDir(false)
  if (!dir) return []
  const index = await readHistoryIndex(dir)
  return Object.entries(index.entries)
    .flatMap(([path, versions]) => {
      if (!Array.isArray(versions) || !versions.length) return []
      return [{ path, versions: [...versions].sort(sortVersionsDesc) }]
    })
    .sort((a, b) => (b.versions[0]?.at || 0) - (a.versions[0]?.at || 0))
}

export async function readHistoryPayload(file) {
  const dir = await getHistoryDir(false)
  if (!dir) throw new Error('还没有历史版本')
  let payload
  try {
    const source = await (await dir.getFileHandle(file)).getFile()
    payload = JSON.parse(await source.text())
  } catch {
    throw new Error('历史版本不存在或已损坏，可能已被清理')
  }
  if (!payload?.path || typeof payload.text !== 'string') throw new Error('历史版本已损坏')
  return payload
}

export async function getHistoryText(file) {
  const payload = await readHistoryPayload(file)
  return { path: payload.path, at: payload.at, size: payload.size, text: payload.text }
}

/** 某个文件最近一次历史版本（用于 AI 修改 diff） */
export async function getLatestHistoryFor(path) {
  const target = splitPath(path).join('/')
  if (!target) return null
  const dir = await getHistoryDir(false)
  if (!dir) return null
  const index = await readHistoryIndex(dir)
  const versions = index.entries[target]
  if (!Array.isArray(versions) || !versions.length) return null
  return [...versions].sort(sortVersionsDesc)[0]
}

/**
 * 条目彻底删除后，把它原路径（含目录下所有文件）的历史版本一并删掉。
 * 只删删除时刻之前的版本：同路径此后重建的文件，它的新版本必须留下。
 */
export async function pruneHistoryForDeleted(origins) {
  const targets = origins.filter(item => item?.path && item.deletedAt)
  if (!targets.length) return
  const dir = await getHistoryDir(false)
  if (!dir) return
  const index = await readHistoryIndex(dir)
  let dropped = 0
  for (const [key, versions] of Object.entries(index.entries)) {
    const matched = targets.filter(t => key === t.path || key.startsWith(`${t.path}/`))
    if (!matched.length) continue
    // 取最晚的一次彻底删除时刻：更早的版本都已经随文件消失，更晚的属于重建后的新文件
    const cutoff = Math.max(...matched.map(t => t.deletedAt))
    const list = Array.isArray(versions) ? versions : []
    const doomed = list.filter(version => (version.at || 0) <= cutoff)
    const kept = list.filter(version => (version.at || 0) > cutoff)
    for (const version of doomed) {
      try { await dir.removeEntry(version.file) } catch { /* 已被清理 */ }
    }
    dropped += doomed.length
    if (kept.length) index.entries[key] = kept
    else delete index.entries[key]
  }
  if (dropped) await writeHistoryIndex(dir, index)
}
