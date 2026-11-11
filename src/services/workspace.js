/**
 * 工作区存储层（对外入口）。
 * 双后端统一文件 API：默认 OPFS，可选挂载本机文件夹。
 * 删除一律移入 .xiyue-trash 回收目录；覆盖写前备份到 .xiyue-history。
 * 具体实现按领域拆在 ./workspace/ 下，这里保持原有公共导出不变。
 */
export {
  notifyWorkspaceChanged,
  folderPickerSupported,
  opfsSupported,
  getWorkspaceStatus,
  pickWorkspaceFolder,
  clearWorkspaceFolder,
  ensureWorkspacePermission,
  sanitizeFileName,
  formatBytes,
} from './workspace/core'

export {
  listDir,
  searchWorkspace,
  searchFiles,
  readModuleText,
  readFile,
  writeFile,
  appendFile,
  statFile,
  writeBlob,
  editFile,
  makeDir,
  copyPath,
  movePath,
  renamePath,
  getFileBlob,
  restoreHistory,
  getWorkspaceUsage,
} from './workspace/fs'

export { buildPreviewBundle } from './workspace/previewBundle'

export { zipDirectory, zipFiles, importZip } from './workspace/archive'

export {
  deletePath,
  listTrash,
  restoreTrash,
  purgeTrash,
  emptyTrash,
  cleanupTrash,
} from './workspace/trash'

export { listHistory, getHistoryText, getLatestHistoryFor } from './workspace/history'
