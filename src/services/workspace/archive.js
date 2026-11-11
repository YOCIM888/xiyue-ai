/**
 * 工作区压缩包：目录/产物打包与 zip 导入。
 */
import JSZip from 'jszip'
import {
  HISTORY_DIR, MAX_IMPORT_FILE_BYTES, MAX_ZIP_BYTES, MAX_ZIP_FILES, TRASH_DIR,
  formatBytes, getFolderName, notifyWorkspaceChanged, resolveDir, resolveParent,
  sanitizeFileName, splitPath,
} from './core'
import { writeBlob } from './fs'

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
  const base = segments.length ? segments[segments.length - 1] : (getFolderName() || 'xiyue-workspace')
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
  const paths = []
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
    paths.push(rel)
  }
  notifyWorkspaceChanged(path)
  return { imported, skipped, bytes, paths }
}
