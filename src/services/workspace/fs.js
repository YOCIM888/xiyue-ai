/**
 * 工作区文件读写：列表、搜索、文本/二进制写入、复制移动与占用统计。
 */
import { createMatcher, findMatches, globToRegExp } from '../../utils/textSearch'
import {
  BINARY_PROBE_CHARS, HISTORY_DIR, MAX_LIST_ENTRIES, MAX_MODULE_BYTES, MAX_READ_BYTES,
  MAX_READ_CHARS, MAX_SEARCH_FILE_BYTES, MAX_SEARCH_RESULTS, MAX_SEARCH_SCAN_BYTES,
  MAX_SEARCH_VISITED, MAX_UPLOAD_BYTES, MAX_WRITE_CHARS, SEARCH_SKIP_DIRS,
  SEARCH_YIELD_EVERY, TRASH_DIR,
  copyEntry, formatBytes, friendlyFsError, getRoot, getWorkspaceMode, notifyWorkspaceChanged,
  pathExists, rememberFile, resolveDir, resolveParent, snapshots, splitPath, writeFileToDir,
} from './core'
import { backupExisting, readHistoryPayload } from './history'

export async function listDir(path = '') {
  const dir = await resolveDir(splitPath(path))
  const entries = []
  let total = 0
  for await (const entry of dir.values()) {
    if (entry.name === TRASH_DIR || entry.name === HISTORY_DIR) continue
    total += 1
    if (entries.length >= MAX_LIST_ENTRIES) continue
    if (entry.kind === 'directory') {
      entries.push({ name: entry.name, kind: 'dir' })
    } else {
      let size = null
      let modified = null
      try {
        const file = await entry.getFile()
        size = file.size
        modified = file.lastModified
      } catch { /* 元数据读取失败不影响 listing */ }
      entries.push({ name: entry.name, kind: 'file', size, modified })
    }
  }
  entries.sort((a, b) =>
    a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'dir' ? -1 : 1
  )
  return { entries, total, truncated: total > entries.length }
}

/** 全工作区按文件名搜索，带遍历上限，避免大目录卡顿 */
export async function searchWorkspace(keyword, { limit = 200, maxVisited = 4000 } = {}) {
  const query = String(keyword || '').trim().toLowerCase()
  if (!query) return { results: [], truncated: false }
  const root = await getRoot()
  const results = []
  let visited = 0
  let truncated = false

  async function walk(dir, prefix) {
    for await (const entry of dir.values()) {
      if (entry.name === TRASH_DIR || entry.name === HISTORY_DIR) continue
      if (visited >= maxVisited || results.length >= limit) {
        truncated = true
        return
      }
      visited += 1
      const path = prefix ? `${prefix}/${entry.name}` : entry.name
      const matched = entry.name.toLowerCase().includes(query)
      if (entry.kind === 'directory') {
        if (matched) results.push({ name: entry.name, kind: 'dir', path })
        await walk(entry, path)
      } else if (matched) {
        let size = null
        let modified = null
        try {
          const file = await entry.getFile()
          size = file.size
          modified = file.lastModified
        } catch { /* 元数据读取失败不影响搜索 */ }
        results.push({ name: entry.name, kind: 'file', path, size, modified })
      }
    }
  }

  await walk(root, '')
  results.sort((a, b) =>
    a.kind === b.kind ? a.path.localeCompare(b.path) : a.kind === 'dir' ? -1 : 1
  )
  return { results, truncated }
}

function looksBinary(text) {
  return text.slice(0, BINARY_PROBE_CHARS).includes(String.fromCharCode(0))
}

/** 全工作区或指定子目录的内容搜索：逐行匹配，带条目数与扫描字节双上限 */
export async function searchFiles({
  query,
  path = '',
  glob = '',
  ignoreCase = false,
  regex = false,
  context = 0,
  limit = MAX_SEARCH_RESULTS,
  maxVisited = MAX_SEARCH_VISITED,
  maxBytes = MAX_SEARCH_SCAN_BYTES,
} = {}) {
  const matcher = createMatcher({ query, regex, ignoreCase })
  if (matcher.error) throw new Error(matcher.error)
  const fileFilter = globToRegExp(glob)
  const segments = splitPath(path)
  const startDir = await resolveDir(segments)
  const startPrefix = segments.join('/')

  const results = []
  let visited = 0
  let scannedBytes = 0
  let filesMatched = 0
  let oversizedSkipped = 0
  let truncated = false
  let sincePause = 0

  async function walk(dir, prefix) {
    for await (const entry of dir.values()) {
      if (entry.name === TRASH_DIR || entry.name === HISTORY_DIR) continue
      if (visited >= maxVisited || results.length >= limit) {
        truncated = true
        return
      }
      const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.kind === 'directory') {
        if (SEARCH_SKIP_DIRS.has(entry.name)) continue
        visited += 1
        await walk(entry, fullPath)
        if (truncated) return
        continue
      }
      visited += 1
      if (fileFilter && !fileFilter.test(fullPath)) continue

      let file
      try {
        file = await entry.getFile()
      } catch {
        continue
      }
      if (file.size > MAX_SEARCH_FILE_BYTES) {
        oversizedSkipped += 1
        continue
      }
      const text = new TextDecoder('utf-8', { fatal: false }).decode(await file.arrayBuffer())
      scannedBytes += file.size
      if (looksBinary(text)) continue

      const { hits, truncated: hitsTruncated, hitCount } = findMatches(text, matcher, { context })
      if (hitsTruncated) truncated = true
      if (hits.length) {
        filesMatched += 1
        for (const hit of hits) {
          if (results.length >= limit) {
            truncated = true
            return
          }
          results.push({
            path: fullPath,
            line: hit.line,
            text: hit.text,
            matched: hit.matched,
            range: hit.range,
            hitCount,
          })
        }
      }
      if (scannedBytes >= maxBytes) {
        truncated = true
        return
      }
      // 大工作区扫描让出主线程，避免面板与流式渲染卡死
      if (++sincePause >= SEARCH_YIELD_EVERY) {
        sincePause = 0
        await new Promise(resolve => setTimeout(resolve, 0))
      }
    }
  }

  await walk(startDir, startPrefix)
  return { results, filesMatched, visited, scannedBytes, oversizedSkipped, truncated }
}

/** 沙箱模块加载用的原文读取：超限或二进制直接报错，不做静默截断 */
export async function readModuleText(path, { maxBytes = MAX_MODULE_BYTES } = {}) {
  const normalized = splitPath(path).join('/')
  if (!normalized) throw new Error('缺少文件路径')
  const { dir, name } = await resolveParent(normalized)
  let file
  try {
    file = await (await dir.getFileHandle(name)).getFile()
  } catch (err) {
    throw friendlyFsError(err, normalized)
  }
  if (file.size > maxBytes) {
    throw new Error(`模块 ${normalized} 为 ${formatBytes(file.size)}，超过单个模块 ${formatBytes(maxBytes)} 上限`)
  }
  const text = new TextDecoder('utf-8', { fatal: false }).decode(await file.arrayBuffer())
  if (looksBinary(text)) throw new Error(`模块 ${normalized} 不是文本文件`)
  return { path: normalized, text, size: file.size }
}

async function readRaw(path) {
  const { dir, name } = await resolveParent(path)
  let file
  try {
    file = await (await dir.getFileHandle(name)).getFile()
  } catch (err) {
    throw friendlyFsError(err, path)
  }
  rememberFile(splitPath(path).join('/'), file)
  if (file.size > MAX_READ_BYTES) {
    throw new Error(`文件过大（${formatBytes(file.size)}），仅支持读取 1 MB 以内的文本文件`)
  }
  const text = new TextDecoder('utf-8').decode(await file.arrayBuffer())
  if (text.slice(0, 8000).includes('\u0000')) throw new Error('这是二进制文件，无法作为文本读取')
  return { text, size: file.size, modified: file.lastModified }
}

export async function readFile(path, { offset = 1, limit = 0, maxChars = MAX_READ_CHARS } = {}) {
  const { text, size, modified } = await readRaw(path)
  const lines = text.split('\n')
  const totalLines = lines.length
  const startLine = Math.max(1, Math.round(Number(offset) || 1))
  const maxLines = Math.max(0, Math.round(Number(limit) || 0))
  const from = startLine - 1
  let end = from
  let chars = 0
  let lineCut = false
  while (end < totalLines) {
    if (maxLines && end - from >= maxLines) break
    const cost = lines[end].length + 1
    if (chars + cost > maxChars) {
      // 单行就超预算：按字符切，行内剩余内容靠 search 定位，offset 仍按行推进
      if (end === from) {
        lines[from] = lines[from].slice(0, maxChars)
        lineCut = true
        end = from + 1
      }
      break
    }
    chars += cost
    end += 1
  }
  const truncated = end < totalLines || lineCut
  return {
    text: lines.slice(from, end).join('\n'),
    size,
    modified,
    truncated,
    totalLines,
    startLine,
    endLine: end,
    nextOffset: end + 1,
    lineCut,
  }
}

async function writeText(path, text, { force = false } = {}) {
  const segments = splitPath(path)
  if (!segments.length) throw new Error('缺少文件路径')
  const key = segments.join('/')
  const { dir, name } = await resolveParent(path, { create: true })
  let existing = null
  try {
    existing = await (await dir.getFileHandle(name)).getFile()
  } catch {
    // 新文件
  }
  if (existing && !force) {
    const snapshot = snapshots.get(key)
    if (snapshot && (snapshot.modified !== existing.lastModified || snapshot.size !== existing.size)) {
      throw Object.assign(
        new Error(
          `文件「${key}」已被外部修改（${formatBytes(existing.size)}，${new Date(existing.lastModified).toLocaleString()}）。` +
          '为避免覆盖新内容，请先 read 确认最新内容，或传 force=true 强制覆盖'
        ),
        { code: 'WRITE_CONFLICT' }
      )
    }
  }
  let backupWarning = ''
  if (existing) backupWarning = await backupExisting(key, existing, text)
  const created = !existing
  let handle
  try {
    handle = await dir.getFileHandle(name, { create: true })
  } catch (err) {
    throw friendlyFsError(err, path)
  }
  if (typeof handle.createWritable !== 'function') {
    throw new Error('当前浏览器的内置工作区不支持写入，请改用 Chrome / Edge 或挂载本机文件夹')
  }
  try {
    const writable = await handle.createWritable()
    await writable.write(text)
    await writable.close()
  } catch (err) {
    throw friendlyFsError(err, path)
  }
  try {
    rememberFile(key, await handle.getFile())
  } catch {
    snapshots.delete(key)
  }
  notifyWorkspaceChanged(key)
  return { created, size: text.length, backedUp: !backupWarning, backupWarning }
}

export async function writeFile(path, content, { force = false } = {}) {
  const text = String(content ?? '')
  if (text.length > MAX_WRITE_CHARS) throw new Error('单次写入内容过大（上限 2 MB 字符）')
  return writeText(path, text, { force })
}

export async function appendFile(path, content, { force = false } = {}) {
  const addition = String(content ?? '')
  if (!addition) throw new Error('append 需要 content 参数（要追加的内容）')
  let existing = ''
  try {
    existing = (await readRaw(path)).text
  } catch (err) {
    if (err?.code !== 'NOT_FOUND') throw err
  }
  const updated = existing + addition
  if (updated.length > MAX_WRITE_CHARS) throw new Error('追加后内容过大（上限 2 MB 字符）')
  return writeText(path, updated, { force })
}

export async function statFile(path) {
  const segments = splitPath(path)
  if (!segments.length) return { exists: false }
  try {
    const { dir, name } = await resolveParent(path)
    const file = await (await dir.getFileHandle(name)).getFile()
    rememberFile(segments.join('/'), file)
    return { exists: true, size: file.size, modified: file.lastModified }
  } catch {
    return { exists: false }
  }
}

/** 面板导入用：原样写入二进制，不做文本解码 */
export async function writeBlob(path, blob, { maxBytes = MAX_UPLOAD_BYTES } = {}) {
  if (blob.size > maxBytes) throw new Error(`单个文件不能超过 ${formatBytes(maxBytes)}`)
  const segments = splitPath(path)
  if (!segments.length) throw new Error('缺少文件路径')
  const { dir, name } = await resolveParent(path, { create: true })
  let handle
  try {
    handle = await dir.getFileHandle(name, { create: true })
  } catch (err) {
    throw friendlyFsError(err, path)
  }
  if (typeof handle.createWritable !== 'function') {
    throw new Error('当前浏览器的内置工作区不支持写入，请改用 Chrome / Edge 或挂载本机文件夹')
  }
  try {
    const writable = await handle.createWritable()
    await writable.write(blob)
    await writable.close()
  } catch (err) {
    throw friendlyFsError(err, path)
  }
  try {
    rememberFile(segments.join('/'), await handle.getFile())
  } catch {
    snapshots.delete(segments.join('/'))
  }
  notifyWorkspaceChanged(segments.join('/'))
  return { size: blob.size }
}

export async function editFile(path, oldText, newText, { replaceAll = false, force = false } = {}) {
  const search = String(oldText ?? '')
  if (!search) throw new Error('edit 需要 old_text（要与原文完全一致）')
  const { text } = await readRaw(path)
  const count = text.split(search).length - 1
  if (count === 0) throw new Error('未找到 old_text，请先 read 确认原文（空格与换行也要一致）')
  if (count > 1 && !replaceAll) {
    throw new Error(`old_text 匹配到 ${count} 处，请提供更长的上下文使其唯一，或传 replace_all=true`)
  }
  const replace = String(newText ?? '')
  const updated = replaceAll ? text.split(search).join(replace) : text.replace(search, replace)
  const written = await writeText(path, updated, { force })
  return {
    replacements: replaceAll ? count : 1,
    backedUp: written.backedUp,
    backupWarning: written.backupWarning,
  }
}

export async function makeDir(path) {
  const segments = splitPath(path)
  if (!segments.length) throw new Error('缺少目录路径')
  await resolveDir(segments, { create: true })
  notifyWorkspaceChanged(segments.join('/'))
  return { path: segments.join('/') }
}

export async function copyPath(from, to) {
  const src = splitPath(from)
  const dest = splitPath(to)
  if (!src.length) throw new Error('不能复制工作区根目录')
  if (!dest.length) throw new Error('缺少目标路径')
  if (src.join('/') === dest.join('/')) throw new Error('源路径与目标路径相同')
  if (dest.length > src.length && src.every((part, i) => dest[i] === part)) {
    throw new Error('不能把目录复制到它自己的子目录')
  }
  if (await pathExists(dest.join('/'))) throw new Error(`目标已存在：${dest.join('/')}`)
  const srcDir = await resolveDir(src.slice(0, -1))
  const name = src[src.length - 1]
  let entry
  let kind
  try {
    entry = await srcDir.getFileHandle(name)
    kind = 'file'
  } catch {
    try {
      entry = await srcDir.getDirectoryHandle(name)
      kind = 'dir'
    } catch {
      throw new Error(`文件不存在：${from}`)
    }
  }
  const { dir: destDir, name: destName } = await resolveParent(dest.join('/'), { create: true })
  if (kind === 'file') {
    await writeFileToDir(destDir, destName, await entry.getFile())
  } else {
    const target = await destDir.getDirectoryHandle(destName, { create: true })
    for await (const child of entry.values()) await copyEntry(entry, child.name, target)
  }
  notifyWorkspaceChanged(dest.join('/'))
  return { path: dest.join('/') }
}

export async function movePath(from, to) {
  const src = splitPath(from)
  const dest = splitPath(to)
  if (!src.length) throw new Error('不能移动工作区根目录')
  if (!dest.length) throw new Error('缺少目标路径')
  if (src.join('/') === dest.join('/')) return { path: dest.join('/') }
  if (dest.length > src.length && src.every((part, i) => dest[i] === part)) {
    throw new Error('不能把目录移动到它自己的子目录')
  }
  if (await pathExists(dest.join('/'))) throw new Error(`目标已存在：${dest.join('/')}`)
  await copyPath(src.join('/'), dest.join('/'))
  const srcDir = await resolveDir(src.slice(0, -1))
  const name = src[src.length - 1]
  let kind = 'file'
  try {
    await srcDir.getFileHandle(name)
  } catch {
    kind = 'dir'
  }
  await srcDir.removeEntry(name, { recursive: kind === 'dir' })
  snapshots.delete(src.join('/'))
  notifyWorkspaceChanged(src.join('/'))
  return { path: dest.join('/') }
}

export async function renamePath(path, newName) {
  const segments = splitPath(path)
  if (!segments.length) throw new Error('不能重命名工作区根目录')
  const nameParts = splitPath(newName)
  if (nameParts.length !== 1) throw new Error('新名称只能是一段文件名，不能包含 /')
  const target = [...segments.slice(0, -1), nameParts[0]].join('/')
  return movePath(segments.join('/'), target)
}

/** 面板下载用 */
export async function getFileBlob(path) {
  const { dir, name } = await resolveParent(path)
  try {
    return await (await dir.getFileHandle(name)).getFile()
  } catch (err) {
    throw friendlyFsError(err, path)
  }
}

export async function restoreHistory(file) {
  const payload = await readHistoryPayload(file)
  // 覆盖当前内容前同样会先备份；备份没做成要带回给调用方
  const written = await writeFile(payload.path, payload.text, { force: true })
  return { path: payload.path, at: payload.at, backedUp: written.backedUp, backupWarning: written.backupWarning }
}

/** 工作区占用统计 + 浏览器存储配额，用于状态栏与容量提醒 */
export async function getWorkspaceUsage() {
  const root = await getRoot()
  const state = { files: 0, bytes: 0 }
  async function walk(dir, depth) {
    if (depth > 24 || state.files >= 5000) return
    for await (const entry of dir.values()) {
      if (entry.name === TRASH_DIR || entry.name === HISTORY_DIR) continue
      if (entry.kind === 'file') {
        state.files += 1
        try {
          state.bytes += (await entry.getFile()).size
        } catch {
          // 单文件元数据读取失败不影响统计
        }
        if (state.files >= 5000) return
      } else {
        await walk(entry, depth + 1)
      }
    }
  }
  await walk(root, 0)
  let quota = 0
  let usage = 0
  try {
    const estimate = await navigator.storage?.estimate?.()
    quota = Number(estimate?.quota) || 0
    usage = Number(estimate?.usage) || 0
  } catch {
    // 浏览器不支持 estimate
  }
  return { files: state.files, bytes: state.bytes, quota, usage, mode: getWorkspaceMode() }
}
