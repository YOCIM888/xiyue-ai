/**
 * 工作区核心：存储后端、路径规范化、目录解析与通用文件辅助。
 * 双后端统一：默认 OPFS，可选挂载本机文件夹。
 */
import { idbGet, idbSet, idbDelete } from '../../utils/idb'
import { broadcastTab, onTabMessage } from '../tabSync'

export const HANDLE_KEY = 'xiyue_workspace_dir_handle'
export const OPFS_DIR = 'xiyue-workspace'
export const TRASH_DIR = '.xiyue-trash'
export const HISTORY_DIR = '.xiyue-history'
export const TRASH_RETENTION_DAYS = 30
export const HISTORY_KEEP = 5
export const HISTORY_TOTAL_MAX = 200
export const MAX_READ_BYTES = 1024 * 1024
export const MAX_READ_CHARS = 100000
export const MAX_WRITE_CHARS = 2 * 1024 * 1024
export const MAX_BACKUP_CHARS = 2 * 1024 * 1024
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
export const MAX_IMPORT_FILE_BYTES = 50 * 1024 * 1024
export const MAX_LIST_ENTRIES = 500
export const MAX_PREVIEW_FILE_BYTES = 2 * 1024 * 1024
export const MAX_PREVIEW_ASSET_BYTES = 2 * 1024 * 1024
export const MAX_PREVIEW_TOTAL_BYTES = 8 * 1024 * 1024
/** 图片把 8 MB 额度吃光时，至少给模块图留这么多，否则页面连脚本都跑不起来 */
export const MIN_MODULE_BYTES = 256 * 1024
export const MAX_ZIP_FILES = 2000
export const MAX_ZIP_BYTES = 300 * 1024 * 1024
export const MAX_SEARCH_VISITED = 6000
export const MAX_SEARCH_SCAN_BYTES = 40 * 1024 * 1024
export const MAX_SEARCH_FILE_BYTES = 1024 * 1024
export const MAX_SEARCH_RESULTS = 200
export const SEARCH_YIELD_EVERY = 24
export const BINARY_PROBE_CHARS = 4096
export const MAX_MODULE_BYTES = 512 * 1024
export const SEARCH_SKIP_DIRS = new Set([
  'node_modules', 'dist', 'build', 'out', 'target', 'coverage',
  '__pycache__', '.venv', 'venv', '.git', '.svn', '.next', '.nuxt', '.cache',
])
const RESERVED_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i
const LEGACY_TRASH_RE = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z_(.+)$/

/** 记录最近一次读/写的 { size, modified }，用于发现外部修改 */
export const snapshots = new Map()

let folderHandle = null
let folderName = ''
let initialized = false
let opfsRoot = null

/** 通知工作区面板与预览窗口文件已变化，并告诉其他标签页 */
export function notifyWorkspaceChanged(path = '') {
  window.dispatchEvent(new CustomEvent('xiyue:workspace-changed', { detail: { path } }))
  broadcastTab('workspace', { path })
}

// 其他标签改了工作区：只派发本地事件让文件树/查看器/预览自己刷新，
// 绝不能再走 notifyWorkspaceChanged，否则两个标签会互相广播到天荒地老
onTabMessage((message) => {
  if (message.type !== 'workspace') return
  window.dispatchEvent(new CustomEvent('xiyue:workspace-changed', {
    detail: { path: String(message.path || ''), remote: true, from: message.from },
  }))
})

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

export function getWorkspaceMode() {
  return folderHandle ? 'folder' : 'opfs'
}

export function getFolderName() {
  return folderName
}

export async function getRoot({ interactive = false } = {}) {
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
export function splitPath(path) {
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

export function hashPath(path) {
  let hash = 5381
  const text = String(path ?? '')
  for (let i = 0; i < text.length; i += 1) hash = ((hash * 33) ^ text.charCodeAt(i)) >>> 0
  return hash.toString(36)
}

export function rememberFile(key, file) {
  snapshots.set(key, { size: file.size, modified: file.lastModified })
}

export async function resolveDir(segments, { create = false } = {}) {
  let dir = await getRoot()
  for (const name of segments) {
    try {
      dir = await dir.getDirectoryHandle(name, { create })
    } catch (err) {
      if (err?.name === 'NotFoundError') throw new Error(`目录不存在：${segments.join('/')}`, { cause: err })
      // 把「拿目录却拿到文件」的原始 DOMException 翻成可读提示（如 search 的 path 传了文件）
      if (err?.name === 'TypeMismatchError') throw new Error(`路径不是目录：${segments.join('/')}`, { cause: err })
      throw err
    }
  }
  return dir
}

export async function resolveParent(path, { create = false } = {}) {
  const segments = splitPath(path)
  if (!segments.length) throw new Error('缺少文件路径')
  const dir = await resolveDir(segments.slice(0, -1), { create })
  return { dir, name: segments[segments.length - 1] }
}

export function friendlyFsError(err, path) {
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

export async function copyEntry(srcDir, name, destDir) {
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

export async function pathExists(path) {
  const segments = splitPath(path)
  if (!segments.length) return true
  // 父目录都不存在时答案是「不存在」而不是报错：copy/move/恢复的目标路径常常要先建新目录
  let dir
  try {
    dir = await resolveDir(segments.slice(0, -1))
  } catch {
    return false
  }
  const name = segments[segments.length - 1]
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
export async function uniquePath(path) {
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

export async function writeFileToDir(dir, name, content) {
  const handle = await dir.getFileHandle(name, { create: true })
  const writable = await handle.createWritable()
  await writable.write(content)
  await writable.close()
}

export async function writeJsonTo(dir, name, value) {
  await writeFileToDir(dir, name, JSON.stringify(value))
}

export async function readJsonFrom(dir, name) {
  const file = await (await dir.getFileHandle(name)).getFile()
  return JSON.parse(await file.text())
}

export async function walkSize(entry, state) {
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

export async function measureEntry(entry) {
  return walkSize(entry, { files: 0 })
}

export function parseLegacyTrashName(name) {
  const match = LEGACY_TRASH_RE.exec(name)
  if (!match) return { at: null, originalName: name }
  const at = Date.parse(`${match[1]}T${match[2]}:${match[3]}:${match[4]}.${match[5]}Z`)
  return { at: Number.isFinite(at) ? at : null, originalName: match[6] }
}

export function formatBytes(size) {
  const n = Number(size) || 0
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}
