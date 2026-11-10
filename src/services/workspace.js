/**
 * 工作模式存储层：双后端统一文件 API。
 * - 默认：OPFS（浏览器私有文件系统），所有现代浏览器可用；
 * - 可选：File System Access API 挂载本机文件夹（仅 Chrome / Edge），句柄持久化到 IndexedDB。
 * 所有路径相对工作区根目录；删除一律移入 .xiyue-trash 回收目录；
 * 覆盖写前把旧版本备份到 .xiyue-history，保留最近 5 版。
 */
import JSZip from 'jszip'
import { idbGet, idbSet, idbDelete } from '../utils/idb'
import { resolveAssetPath, mimeFromPath, rewriteCssUrls, rewriteSrcset } from '../utils/htmlInline'

const HANDLE_KEY = 'xiyue_workspace_dir_handle'
const OPFS_DIR = 'xiyue-workspace'
const TRASH_DIR = '.xiyue-trash'
const HISTORY_DIR = '.xiyue-history'
const TRASH_RETENTION_DAYS = 30
const HISTORY_KEEP = 5
const HISTORY_TOTAL_MAX = 200
const MAX_READ_BYTES = 1024 * 1024
const MAX_READ_CHARS = 100000
const MAX_WRITE_CHARS = 2 * 1024 * 1024
const MAX_BACKUP_CHARS = 2 * 1024 * 1024
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
const MAX_IMPORT_FILE_BYTES = 50 * 1024 * 1024
const MAX_LIST_ENTRIES = 500
const MAX_PREVIEW_FILE_BYTES = 2 * 1024 * 1024
const MAX_PREVIEW_ASSET_BYTES = 2 * 1024 * 1024
const MAX_PREVIEW_TOTAL_BYTES = 8 * 1024 * 1024
const MAX_ZIP_FILES = 2000
const MAX_ZIP_BYTES = 300 * 1024 * 1024
const RESERVED_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i
const LEGACY_TRASH_RE = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z_(.+)$/

/** 记录最近一次读/写的 { size, modified }，用于发现外部修改 */
const snapshots = new Map()

let folderHandle = null
let folderName = ''
let initialized = false
let opfsRoot = null

/** 通知工作区面板与预览窗口文件已变化 */
export function notifyWorkspaceChanged(path = '') {
  window.dispatchEvent(new CustomEvent('xiyue:workspace-changed', { detail: { path } }))
}

export function folderPickerSupported() {
  return typeof window.showDirectoryPicker === 'function'
}

export function opfsSupported() {
  return !!navigator.storage?.getDirectory
}

async function initWorkspace() {
  if (initialized) return
  initialized = true
  try {
    const saved = await idbGet(HANDLE_KEY)
    if (saved && typeof saved.getDirectoryHandle === 'function') {
      folderHandle = saved
      folderName = saved.name || ''
    }
  } catch {
    // 句柄损坏或存储不可用时退回内置工作区
  }
}

export async function getWorkspaceStatus() {
  await initWorkspace()
  let permission = null
  if (folderHandle) {
    try { permission = await folderHandle.queryPermission({ mode: 'readwrite' }) } catch { permission = 'unknown' }
  }
  return {
    mode: folderHandle ? 'folder' : 'opfs',
    folderName,
    permission,
    folderSupported: folderPickerSupported(),
    opfsSupported: opfsSupported(),
  }
}

/** 用户手势内调用：挑选并挂载本机文件夹 */
export async function pickWorkspaceFolder() {
  if (!folderPickerSupported()) {
    return { ok: false, message: '当前浏览器不支持选择本机文件夹，请使用 Chrome / Edge，或继续使用内置工作区' }
  }
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' })
    folderHandle = handle
    folderName = handle.name || ''
    initialized = true
    await idbSet(HANDLE_KEY, handle)
    notifyWorkspaceChanged('')
    return { ok: true, name: folderName }
  } catch (err) {
    if (err?.name === 'AbortError') return { ok: false, cancelled: true, message: '已取消选择' }
    return { ok: false, message: err?.message || '选择文件夹失败' }
  }
}

export async function clearWorkspaceFolder() {
  folderHandle = null
  folderName = ''
  try { await idbDelete(HANDLE_KEY) } catch { /* ignore */ }
  notifyWorkspaceChanged('')
}

/** 在用户手势内重新请求文件夹授权（会话间权限可能失效） */
export async function ensureWorkspacePermission() {
  try {
    await getRoot({ interactive: true })
    return { ok: true }
  } catch (err) {
    return { ok: false, message: err?.message || '授权失败' }
  }
}

async function getRoot({ interactive = false } = {}) {
  await initWorkspace()
  if (folderHandle) {
    const options = { mode: 'readwrite' }
    let permission = await folderHandle.queryPermission(options)
    if (permission !== 'granted' && interactive) {
      permission = await folderHandle.requestPermission(options)
    }
    if (permission !== 'granted') {
      throw new Error('文件夹授权已失效，请打开「工作区」面板或到 技能管理 → 工作模式 重新授权')
    }
    return folderHandle
  }
  if (!opfsSupported()) {
    throw new Error('当前浏览器不支持本地工作区，请使用较新的 Chrome / Edge / Firefox / Safari')
  }
  if (!opfsRoot) {
    const root = await navigator.storage.getDirectory()
    opfsRoot = await root.getDirectoryHandle(OPFS_DIR, { create: true })
  }
  return opfsRoot
}

/** 规范化相对路径，拒绝 .. 逃逸、绝对盘符、保留名与内部目录 */
function splitPath(path) {
  const raw = String(path ?? '').trim().replace(/\\/g, '/').replace(/^\/+/, '')
  if (!raw || raw === '.') return []
  if (/^[a-zA-Z]:/.test(raw)) throw new Error('请使用相对工作区根目录的路径，不要带盘符')
  const parts = raw.split('/').filter(part => part && part !== '.')
  if (parts.includes('..')) throw new Error('路径不允许包含 ..')
  for (const part of parts) {
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u001f\u007f]/.test(part)) throw new Error('路径包含控制字符')
    if (part.length > 200) throw new Error('文件名过长')
    if (/[. ]$/.test(part)) throw new Error('文件名不能以空格或点结尾')
    if (RESERVED_NAME.test(part)) throw new Error(`「${part}」是 Windows 保留名称，请换一个`)
    if (part === TRASH_DIR || part === HISTORY_DIR) throw new Error('回收站与历史目录不允许操作')
  }
  return parts
}

/** 清洗下载 / 导入 / 回收站使用的单段文件名 */
export function sanitizeFileName(name, fallback = 'file') {
  let base = String(name ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim()
    .replace(/[. ]+$/g, '')
  if (!base || base === '.' || base === '..') base = fallback
  if (RESERVED_NAME.test(base)) base = `_${base}`
  if (base.length > 120) {
    const dot = base.lastIndexOf('.')
    const ext = dot > 0 && base.length - dot <= 20 ? base.slice(dot) : ''
    base = base.slice(0, 120 - ext.length) + ext
  }
  return base
}

function hashPath(path) {
  let hash = 5381
  const text = String(path ?? '')
  for (let i = 0; i < text.length; i += 1) hash = ((hash * 33) ^ text.charCodeAt(i)) >>> 0
  return hash.toString(36)
}

function rememberFile(key, file) {
  snapshots.set(key, { size: file.size, modified: file.lastModified })
}

async function resolveDir(segments, { create = false } = {}) {
  let dir = await getRoot()
  for (const name of segments) {
    try {
      dir = await dir.getDirectoryHandle(name, { create })
    } catch (err) {
      if (err?.name === 'NotFoundError') throw new Error(`目录不存在：${segments.join('/')}`, { cause: err })
      throw err
    }
  }
  return dir
}

async function resolveParent(path, { create = false } = {}) {
  const segments = splitPath(path)
  if (!segments.length) throw new Error('缺少文件路径')
  const dir = await resolveDir(segments.slice(0, -1), { create })
  return { dir, name: segments[segments.length - 1] }
}

function friendlyFsError(err, path) {
  if (err?.name === 'NotFoundError') {
    return Object.assign(new Error(`文件不存在：${path}`), { code: 'NOT_FOUND' })
  }
  if (err?.name === 'TypeMismatchError') return new Error(`路径类型不符（文件/目录冲突）：${path}`)
  if (err?.name === 'NotAllowedError') {
    return Object.assign(new Error('没有写入权限，请重新授权文件夹'), { code: 'PERMISSION_DENIED' })
  }
  if (err?.name === 'QuotaExceededError') {
    return Object.assign(new Error('浏览器存储空间已满，请导出 zip 备份后清理工作区'), { code: 'QUOTA_EXCEEDED' })
  }
  return err
}

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

export async function readFile(path) {
  const { text, size, modified } = await readRaw(path)
  const truncated = text.length > MAX_READ_CHARS
  return { text: truncated ? text.slice(0, MAX_READ_CHARS) : text, size, modified, truncated }
}

async function getHistoryDir(create = false) {
  const root = await getRoot()
  try {
    return await root.getDirectoryHandle(HISTORY_DIR, { create })
  } catch (err) {
    if (err?.name === 'NotFoundError') return null
    throw err
  }
}

async function readHistoryIndex(dir) {
  try {
    const file = await (await dir.getFileHandle('index.json')).getFile()
    const parsed = JSON.parse(await file.text())
    if (parsed && parsed.entries && typeof parsed.entries === 'object') return parsed
  } catch {
    // 索引缺失或损坏时按空索引重建
  }
  return { version: 1, entries: {} }
}

async function writeHistoryIndex(dir, index) {
  const handle = await dir.getFileHandle('index.json', { create: true })
  const writable = await handle.createWritable()
  await writable.write(JSON.stringify(index))
  await writable.close()
}

function sortVersionsDesc(a, b) {
  return (b.at || 0) - (a.at || 0)
}

/** 覆盖前把旧内容写入 .xiyue-history：单文件保留 5 版，全局最多 200 版 */
async function backupExisting(pathKey, file, nextText) {
  if (!file || file.size === 0 || file.size > MAX_BACKUP_CHARS) return
  let text
  try {
    text = new TextDecoder('utf-8').decode(await file.arrayBuffer())
  } catch {
    return
  }
  if (text.includes('\u0000') || text === String(nextText ?? '')) return
  try {
    const dir = await getHistoryDir(true)
    if (!dir) return
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
  } catch {
    // 备份失败不阻断正常写入
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
  if (existing) await backupExisting(key, existing, text)
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
  return { created, size: text.length }
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
  await writeText(path, updated, { force })
  return { replacements: replaceAll ? count : 1 }
}

export async function makeDir(path) {
  const segments = splitPath(path)
  if (!segments.length) throw new Error('缺少目录路径')
  await resolveDir(segments, { create: true })
  notifyWorkspaceChanged(segments.join('/'))
  return { path: segments.join('/') }
}

async function copyEntry(srcDir, name, destDir) {
  let entry
  try {
    entry = await srcDir.getFileHandle(name)
  } catch {
    entry = await srcDir.getDirectoryHandle(name)
  }
  if (entry.kind === 'file') {
    const file = await entry.getFile()
    const target = await destDir.getFileHandle(name, { create: true })
    const writable = await target.createWritable()
    await writable.write(file)
    await writable.close()
    return
  }
  const target = await destDir.getDirectoryHandle(name, { create: true })
  for await (const child of entry.values()) {
    await copyEntry(entry, child.name, target)
  }
}

async function pathExists(path) {
  const segments = splitPath(path)
  if (!segments.length) return true
  const { dir, name } = await resolveParent(path)
  try {
    await dir.getFileHandle(name)
    return true
  } catch {
    // 继续检查目录
  }
  try {
    await dir.getDirectoryHandle(name)
    return true
  } catch {
    return false
  }
}

/** 恢复冲突时自动改名：xxx（已恢复）.ext、xxx（已恢复 2）.ext… */
async function uniquePath(path) {
  if (!(await pathExists(path))) return path
  const segments = splitPath(path)
  const name = segments[segments.length - 1]
  const dot = name.lastIndexOf('.')
  const base = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''
  for (let i = 1; i <= 99; i += 1) {
    const suffix = i === 1 ? '（已恢复）' : `（已恢复 ${i}）`
    const candidate = [...segments.slice(0, -1), `${base}${suffix}${ext}`].join('/')
    if (!(await pathExists(candidate))) return candidate
  }
  throw new Error('同名文件过多，无法自动重命名')
}

async function writeFileToDir(dir, name, content) {
  const handle = await dir.getFileHandle(name, { create: true })
  const writable = await handle.createWritable()
  await writable.write(content)
  await writable.close()
}

async function writeJsonTo(dir, name, value) {
  await writeFileToDir(dir, name, JSON.stringify(value))
}

async function readJsonFrom(dir, name) {
  const file = await (await dir.getFileHandle(name)).getFile()
  return JSON.parse(await file.text())
}

async function walkSize(entry, state) {
  if (state.files >= 2000) return 0
  if (entry.kind === 'file') {
    state.files += 1
    try {
      return (await entry.getFile()).size
    } catch {
      return 0
    }
  }
  let total = 0
  for await (const child of entry.values()) {
    if (child.name === TRASH_DIR || child.name === HISTORY_DIR) continue
    total += await walkSize(child, state)
  }
  return total
}

async function measureEntry(entry) {
  return walkSize(entry, { files: 0 })
}

function parseLegacyTrashName(name) {
  const match = LEGACY_TRASH_RE.exec(name)
  if (!match) return { at: null, originalName: name }
  const at = Date.parse(`${match[1]}T${match[2]}:${match[3]}:${match[4]}.${match[5]}Z`)
  return { at: Number.isFinite(at) ? at : null, originalName: match[6] }
}

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
    throw new Error('回收站条目不存在，可能已被清理')
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

export async function purgeTrash(trashName) {
  const segments = splitPath(trashName)
  if (segments.length !== 1) throw new Error('无效的回收站条目')
  const root = await getRoot()
  const trash = await root.getDirectoryHandle(TRASH_DIR)
  await trash.removeEntry(segments[0], { recursive: true })
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
  for await (const entry of trash.values()) {
    await trash.removeEntry(entry.name, { recursive: true })
    removed += 1
  }
  if (removed) notifyWorkspaceChanged('')
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
  for await (const entry of trash.values()) {
    let at
    try {
      at = Number((await readJsonFrom(entry, 'meta.json')).at) || null
    } catch {
      at = parseLegacyTrashName(entry.name).at
    }
    if (at && at < deadline) {
      await trash.removeEntry(entry.name, { recursive: true })
      removed += 1
    }
  }
  if (removed) notifyWorkspaceChanged('')
  return { removed }
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

async function readHistoryPayload(file) {
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

export async function restoreHistory(file) {
  const payload = await readHistoryPayload(file)
  await writeFile(payload.path, payload.text, { force: true })
  return { path: payload.path, at: payload.at }
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

function blobToDataUrl(blob, fallbackMime) {
  const file = blob.type ? blob : blob.slice(0, blob.size, fallbackMime)
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error || new Error('读取资源失败'))
    reader.readAsDataURL(file)
  })
}

/**
 * 把工作区里的 HTML 及其本地 CSS / JS / 图片 / 字体内联成单文件 HTML，
 * 供 iframe srcdoc 预览（需设置 sandbox，不授予同源权限）。
 */
export async function buildPreviewHtml(path) {
  const file = await getFileBlob(path)
  if (file.size > MAX_PREVIEW_FILE_BYTES) {
    throw new Error(`网页文件过大（${formatBytes(file.size)}），预览上限 ${formatBytes(MAX_PREVIEW_FILE_BYTES)}`)
  }
  const source = await file.text()
  const segments = splitPath(path)
  const baseSegments = segments.slice(0, -1)
  const doc = new DOMParser().parseFromString(source, 'text/html')
  const used = new Set()
  const missing = new Set()
  let totalBytes = 0

  async function readAsset(assetPath) {
    if (!assetPath) return null
    if (used.has(assetPath)) {
      return getFileBlob(assetPath).catch(() => null)
    }
    let blob
    try {
      blob = await getFileBlob(assetPath)
    } catch {
      missing.add(assetPath)
      return null
    }
    if (blob.size > MAX_PREVIEW_ASSET_BYTES || totalBytes + blob.size > MAX_PREVIEW_TOTAL_BYTES) {
      missing.add(assetPath)
      return null
    }
    totalBytes += blob.size
    used.add(assetPath)
    return blob
  }

  async function inlineUrl(url, cssBase) {
    const assetPath = resolveAssetPath(cssBase, url)
    if (!assetPath) return null
    const blob = await readAsset(assetPath)
    return blob ? blobToDataUrl(blob, mimeFromPath(assetPath)) : null
  }

  async function rewriteCssText(cssText, cssBase) {
    const urls = new Set()
    for (const match of String(cssText || '').matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi)) {
      urls.add(match[2].trim())
    }
    if (!urls.size) return String(cssText || '')
    const mapped = new Map()
    for (const url of urls) mapped.set(url, await inlineUrl(url, cssBase))
    return rewriteCssUrls(cssText, url => mapped.get(url) || null)
  }

  for (const link of [...doc.querySelectorAll('link[rel~="stylesheet"][href]')]) {
    const href = link.getAttribute('href')
    const assetPath = resolveAssetPath(baseSegments, href)
    if (!assetPath) continue
    const blob = await readAsset(assetPath)
    if (!blob) { link.remove(); continue }
    const cssBase = assetPath.split('/').slice(0, -1)
    const style = doc.createElement('style')
    style.textContent = `/* ${assetPath} */\n${await rewriteCssText(await blob.text(), cssBase)}`
    link.replaceWith(style)
  }

  for (const style of [...doc.querySelectorAll('style')]) {
    style.textContent = await rewriteCssText(style.textContent, baseSegments)
  }

  for (const el of [...doc.querySelectorAll('[style]')]) {
    const inline = el.getAttribute('style') || ''
    if (!/url\(/i.test(inline)) continue
    el.setAttribute('style', await rewriteCssText(inline, baseSegments))
  }

  for (const script of [...doc.querySelectorAll('script[src]')]) {
    const src = script.getAttribute('src')
    const assetPath = resolveAssetPath(baseSegments, src)
    if (!assetPath) continue
    const blob = await readAsset(assetPath)
    if (!blob) { script.remove(); continue }
    script.removeAttribute('src')
    script.removeAttribute('integrity')
    script.textContent = await blob.text()
    if (/^(module|importmap)$/i.test(script.getAttribute('type') || '')) {
      script.setAttribute('data-xiyue-module', assetPath)
    }
  }

  for (const el of [...doc.querySelectorAll('img[src], audio[src], video[src], source[src], video[poster]')]) {
    for (const attr of ['src', 'poster']) {
      if (!el.hasAttribute(attr)) continue
      const value = el.getAttribute(attr)
      const assetPath = resolveAssetPath(baseSegments, value)
      if (!assetPath) continue
      const blob = await readAsset(assetPath)
      if (!blob) { el.removeAttribute(attr); continue }
      el.setAttribute(attr, await blobToDataUrl(blob, mimeFromPath(assetPath)))
    }
  }

  for (const el of [...doc.querySelectorAll('[srcset]')]) {
    const raw = el.getAttribute('srcset') || ''
    const mapped = new Map()
    for (const item of raw.split(',')) {
      const url = item.trim().split(/\s+/)[0]
      if (!url || mapped.has(url)) continue
      const assetPath = resolveAssetPath(baseSegments, url)
      if (!assetPath) continue
      const blob = await readAsset(assetPath)
      mapped.set(url, blob ? await blobToDataUrl(blob, mimeFromPath(assetPath)) : null)
    }
    el.setAttribute('srcset', rewriteSrcset(raw, url => mapped.get(url) || null))
  }

  const html = `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`
  return {
    html,
    bytes: file.size,
    missing: [...missing],
    modules: [...doc.querySelectorAll('script[data-xiyue-module]')].map(el => el.getAttribute('data-xiyue-module')),
  }
}

const STORE_EXT = /\.(?:png|jpe?g|gif|webp|avif|ico|mp4|webm|mp3|wav|ogg|woff2?|zip|pdf|docx?|xlsx?|pptx?)$/i

/**
 * 把工作区某个目录（默认根目录）打包成 zip Blob。
 * 跳过回收目录，保留空目录；超过文件数或总大小上限时直接拒绝。
 */
export async function zipDirectory(path = '') {
  const zip = new JSZip()
  const segments = splitPath(path)
  const dir = await resolveDir(segments)
  let files = 0
  let bytes = 0

  async function walk(current, prefix) {
    let count = 0
    for await (const entry of current.values()) {
      if (entry.name === TRASH_DIR || entry.name === HISTORY_DIR) continue
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.kind === 'directory') {
        const childCount = await walk(entry, rel)
        if (!childCount) zip.folder(rel)
        count += childCount
      } else {
        const file = await entry.getFile()
        files += 1
        bytes += file.size
        if (files > MAX_ZIP_FILES) throw new Error(`文件数量超过 ${MAX_ZIP_FILES} 个，请分目录打包`)
        if (bytes > MAX_ZIP_BYTES) throw new Error(`目录总大小超过 ${formatBytes(MAX_ZIP_BYTES)}，请分目录打包`)
        zip.file(rel, file, { compression: STORE_EXT.test(entry.name) ? 'STORE' : 'DEFLATE' })
        count += 1
      }
    }
    return count
  }

  await walk(dir, '')
  if (!files) throw new Error('这个目录是空的，没有可打包的文件')
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } })
  const base = segments.length ? segments[segments.length - 1] : (folderName || 'xiyue-workspace')
  return { blob, files, bytes, name: `${base}.zip` }
}

/** 按路径清单打包（本次任务产物），跳过不存在或不合法的条目 */
export async function zipFiles(paths, name = '') {
  const zip = new JSZip()
  const seen = new Set()
  let files = 0
  let bytes = 0
  for (const raw of paths || []) {
    let segments
    try {
      segments = splitPath(raw)
    } catch {
      continue
    }
    const key = segments.join('/')
    if (!key || seen.has(key)) continue
    seen.add(key)
    try {
      const { dir, name: fileName } = await resolveParent(key)
      const file = await (await dir.getFileHandle(fileName)).getFile()
      zip.file(key, file, { compression: STORE_EXT.test(fileName) ? 'STORE' : 'DEFLATE' })
      files += 1
      bytes += file.size
    } catch {
      // 已被删除的产物直接跳过
    }
  }
  if (!files) throw new Error('本次任务还没有可打包的产物')
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } })
  return { blob, files, bytes, name: name || `xiyue-artifacts-${Date.now()}.zip` }
}

export function formatBytes(size) {
  const n = Number(size) || 0
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
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
  return { files: state.files, bytes: state.bytes, quota, usage, mode: folderHandle ? 'folder' : 'opfs' }
}

/**
 * 解压 zip 到工作区（默认根目录），用于一键还原备份。
 * 自动跳过内部目录、macOS 元数据与非法路径；逐文件限额 50 MB。
 */
export async function importZip(file, path = '') {
  if (!file) throw new Error('缺少 zip 文件')
  if (file.size > MAX_ZIP_BYTES) throw new Error(`压缩包超过 ${formatBytes(MAX_ZIP_BYTES)}，无法导入`)
  let zip
  try {
    zip = await JSZip.loadAsync(file)
  } catch {
    throw new Error('无法读取压缩包，文件可能已损坏或不是 zip 格式')
  }
  const skipped = []
  const entries = []
  let declaredBytes = 0
  for (const [rawName, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue
    const normalized = String(rawName).replace(/\\/g, '/')
    if (!normalized || normalized.startsWith('/') || normalized.includes('..')) {
      skipped.push(rawName)
      continue
    }
    const segments = normalized.split('/').filter(Boolean).map(part => sanitizeFileName(part))
    let rel
    try {
      rel = splitPath([path, ...segments].filter(Boolean).join('/'))
    } catch {
      skipped.push(rawName)
      continue
    }
    if (!rel.length) {
      skipped.push(rawName)
      continue
    }
    declaredBytes += Number(entry._data?.uncompressedSize) || 0
    if (entries.length + 1 > MAX_ZIP_FILES) throw new Error(`压缩包内文件超过 ${MAX_ZIP_FILES} 个，请分目录导入`)
    if (declaredBytes > MAX_ZIP_BYTES) throw new Error(`解压后总大小超过 ${formatBytes(MAX_ZIP_BYTES)}，请分目录导入`)
    entries.push({ rel: rel.join('/'), entry })
  }
  if (!entries.length) throw new Error('压缩包里没有可导入的文件')
  let imported = 0
  let bytes = 0
  for (const { rel, entry } of entries) {
    let blob
    try {
      blob = await entry.async('blob')
    } catch {
      skipped.push(rel)
      continue
    }
    if (blob.size > MAX_IMPORT_FILE_BYTES) {
      skipped.push(`${rel}（超过 ${formatBytes(MAX_IMPORT_FILE_BYTES)}）`)
      continue
    }
    await writeBlob(rel, blob, { maxBytes: MAX_IMPORT_FILE_BYTES })
    imported += 1
    bytes += blob.size
  }
  notifyWorkspaceChanged(path)
  return { imported, skipped, bytes }
}