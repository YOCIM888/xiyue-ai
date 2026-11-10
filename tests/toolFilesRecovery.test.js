import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ws = vi.hoisted(() => ({
  listTrash: vi.fn(async () => []),
  writeFile: vi.fn(async () => ({ created: true, size: 3, backedUp: true, backupWarning: '' })),
  editFile: vi.fn(async () => ({ replacements: 1, backedUp: true, backupWarning: '' })),
  appendFile: vi.fn(async () => ({ size: 9, backedUp: true, backupWarning: '' })),
  restoreTrash: vi.fn(async () => ({ path: 'a.js', renamed: false })),
  purgeTrash: vi.fn(async () => {}),
  emptyTrash: vi.fn(async () => ({ removed: 0 })),
  statFile: vi.fn(async () => ({ exists: false })),
  listHistory: vi.fn(async () => []),
  getHistoryText: vi.fn(async () => ({ path: 'a.js', at: 0, size: 12, text: '旧内容' })),
  restoreHistory: vi.fn(async () => ({ path: 'a.js', at: 0, backedUp: true, backupWarning: '' })),
  zipDirectory: vi.fn(async () => ({ blob: { size: 512 }, files: 2, bytes: 900, name: 'src.zip' })),
  zipFiles: vi.fn(async () => ({ blob: { size: 2048 }, files: 3, bytes: 5000, name: 'artifacts.zip' })),
  importZip: vi.fn(async () => ({ imported: 2, skipped: [], bytes: 900, paths: ['pkg/a.js', 'pkg/b.js'] })),
  getFileBlob: vi.fn(async () => ({ name: 'pkg.zip', size: 512 })),
  writeBlob: vi.fn(async () => ({ size: 2048 })),
  recordAiFileAction: vi.fn(),
}))

vi.mock('../src/services/workspace.js', () => ({
  listDir: vi.fn(),
  readFile: vi.fn(),
  writeFile: ws.writeFile,
  editFile: ws.editFile,
  appendFile: ws.appendFile,
  makeDir: vi.fn(),
  deletePath: vi.fn(),
  renamePath: vi.fn(),
  movePath: vi.fn(),
  copyPath: vi.fn(),
  searchFiles: vi.fn(),
  searchWorkspace: vi.fn(),
  formatBytes: size => `${Math.round(Number(size) || 0)} B`,
  listTrash: ws.listTrash,
  restoreTrash: ws.restoreTrash,
  purgeTrash: ws.purgeTrash,
  emptyTrash: ws.emptyTrash,
  statFile: ws.statFile,
  listHistory: ws.listHistory,
  getHistoryText: ws.getHistoryText,
  restoreHistory: ws.restoreHistory,
  zipDirectory: ws.zipDirectory,
  zipFiles: ws.zipFiles,
  importZip: ws.importZip,
  getFileBlob: ws.getFileBlob,
  writeBlob: ws.writeBlob,
}))

vi.mock('../src/services/workspaceActivity.js', () => ({ recordAiFileAction: ws.recordAiFileAction }))

const { executeToolCall, createWriteBudget, isParallelSafe } = await import('../src/services/tools.js')

const settings = { workModeEnabled: true }
const run = (args, extra = {}) => executeToolCall({ tool: 'files', args }, { settings, ...extra })

const at = Date.now()
const trashItem = (name, path, kind = 'file', size = 12) => ({ name, path, kind, size, at, legacy: false })
const confirmMock = vi.fn(async () => true)

beforeEach(() => {
  vi.clearAllMocks()
  globalThis.window = { __ui: { showConfirm: confirmMock } }
  ws.listTrash.mockResolvedValue([])
  ws.restoreTrash.mockResolvedValue({ path: 'a.js', renamed: false })
  ws.emptyTrash.mockResolvedValue({ removed: 0 })
  ws.statFile.mockResolvedValue({ exists: false })
  ws.listHistory.mockResolvedValue([])
  ws.getHistoryText.mockResolvedValue({ path: 'a.js', at, size: 12, text: '旧内容' })
  ws.restoreHistory.mockResolvedValue({ path: 'a.js', at, backedUp: true, backupWarning: '' })
  ws.writeFile.mockResolvedValue({ created: true, size: 3, backedUp: true, backupWarning: '' })
  ws.editFile.mockResolvedValue({ replacements: 1, backedUp: true, backupWarning: '' })
  ws.appendFile.mockResolvedValue({ size: 9, backedUp: true, backupWarning: '' })
  ws.zipFiles.mockResolvedValue({ blob: { size: 2048 }, files: 3, bytes: 5000, name: 'artifacts.zip' })
  ws.zipDirectory.mockResolvedValue({ blob: { size: 512 }, files: 2, bytes: 900, name: 'src.zip' })
  ws.writeBlob.mockResolvedValue({ size: 2048 })
  ws.importZip.mockResolvedValue({ imported: 2, skipped: [], bytes: 900, paths: ['pkg/a.js', 'pkg/b.js'] })
  confirmMock.mockResolvedValue(true)
})

afterEach(() => {
  delete globalThis.window
})

describe('files 新动作的参数校验', () => {
  it('未知动作列出全部可用动作', async () => {
    const res = await run({ action: 'recycle' })
    expect(res.ok).toBe(false)
    for (const name of ['trash', 'restore', 'purge', 'history', 'zip', 'unzip']) {
      expect(res.text).toContain(name)
    }
  })

  it('restore/purge 缺 path 和 name 时报错而不是动到回收站', async () => {
    for (const action of ['restore', 'purge']) {
      const res = await run({ action })
      expect(res.ok).toBe(false)
      expect(res.text).toContain('需要 path')
    }
    expect(ws.restoreTrash).not.toHaveBeenCalled()
    expect(ws.purgeTrash).not.toHaveBeenCalled()
  })

  it('history_read/history_restore 缺 version 时明确要 version', async () => {
    for (const action of ['history_read', 'history_restore']) {
      const res = await run({ action })
      expect(res.ok).toBe(false)
      expect(res.text).toContain('version')
    }
    expect(ws.getHistoryText).not.toHaveBeenCalled()
    expect(ws.restoreHistory).not.toHaveBeenCalled()
  })

  it('unzip 必须指定压缩包路径', async () => {
    const res = await run({ action: 'unzip' })
    expect(res.ok).toBe(false)
    expect(res.text).toContain('需要 path')
  })
})

describe('files trash / restore', () => {
  it('回收站为空时直接说明，不列条目', async () => {
    const res = await run({ action: 'trash' })
    expect(res.text).toBe('回收站是空的。')
    expect(ws.listTrash).toHaveBeenCalledTimes(1)
  })

  it('列出条目名、类型、大小、原路径和删除时间', async () => {
    ws.listTrash.mockResolvedValue([
      trashItem('b_1.js', 'src/b.js'),
      trashItem('old_dir', 'old/dir', 'dir', 4096),
    ])
    const res = await run({ action: 'trash' })
    expect(res.text).toContain('回收站共 2 项')
    expect(res.text).toContain('· b_1.js｜文件 12 B｜原路径 src/b.js｜删除于 ')
    expect(res.text).toContain('· old_dir｜目录 4096 B｜原路径 old/dir')
    expect(res.text).toContain('restore 传 name 或原路径即可恢复')
  })

  it('超过 limit 只列前若干项并说明总数', async () => {
    ws.listTrash.mockResolvedValue(Array.from({ length: 4 }, (_, i) => trashItem(`f${i}`, `f${i}.js`)))
    const res = await run({ action: 'trash', limit: 2 })
    expect(res.text).toContain('回收站共 4 项，列出前 2 项')
    expect(res.text.match(/· /g)).toHaveLength(2)
    expect(res.record).toBe('files：trash → 2/4 项')
  })

  it('按条目名恢复，并记入本轮文件变更', async () => {
    ws.listTrash.mockResolvedValue([trashItem('b_1.js', 'src/b.js')])
    ws.restoreTrash.mockResolvedValue({ path: 'src/b.js', renamed: false })
    const res = await run({ action: 'restore', name: 'b_1.js' })
    expect(res.ok).toBe(true)
    expect(ws.restoreTrash).toHaveBeenCalledWith('b_1.js')
    expect(res.text).toContain('已从回收站恢复 src/b.js')
    expect(res.text).not.toContain('自动改了名')
    expect(ws.recordAiFileAction).toHaveBeenCalledWith('write', 'src/b.js')
  })

  it('按原路径命中最近一条', async () => {
    ws.listTrash.mockResolvedValue([
      trashItem('new', 'src/a.js'),
      trashItem('old', 'src/a.js'),
    ])
    await run({ action: 'restore', path: 'src/a.js' })
    expect(ws.restoreTrash).toHaveBeenCalledWith('new')
  })

  it('路径在被删目录里时提示整目录恢复', async () => {
    ws.listTrash.mockResolvedValue([trashItem('dir_1', 'old/dir', 'dir')])
    const res = await run({ action: 'restore', path: 'old/dir/inner.js' })
    expect(ws.restoreTrash).toHaveBeenCalledWith('dir_1')
    expect(res.text).toContain('它在被删目录 old/dir 里，目录整体恢复')
  })

  it('同名冲突时告知自动改名', async () => {
    ws.listTrash.mockResolvedValue([trashItem('a_1.js', 'a.js')])
    ws.restoreTrash.mockResolvedValue({ path: 'a（已恢复）.js', renamed: true })
    const res = await run({ action: 'restore', name: 'a_1.js' })
    expect(res.text).toContain('已从回收站恢复 a（已恢复）.js（原路径已有同名文件，自动改了名）')
  })

  it('找不到条目时不改名、不恢复，只提示先列回收站', async () => {
    ws.listTrash.mockResolvedValue([trashItem('a_1.js', 'a.js')])
    const res = await run({ action: 'restore', path: 'nope.js' })
    expect(res.ok).toBe(false)
    expect(res.text).toContain('回收站里没有找到「nope.js」（当前 1 项）')
    expect(ws.restoreTrash).not.toHaveBeenCalled()
  })

  it('恢复不占写入额度但会占一个文件名额', async () => {
    ws.listTrash.mockResolvedValue([trashItem('a_1.js', 'a.js')])
    const budget = createWriteBudget({ maxFiles: 1, maxBytes: 10 })
    const res = await run({ action: 'restore', name: 'a_1.js' }, { budget })
    expect(res.ok).toBe(true)
    expect(budget.files).toBe(1)
    expect(budget.bytes).toBe(0)
  })
})

describe('files purge / empty_trash 确认门', () => {
  it('purge 用户取消时返回 refused，条目仍在回收站', async () => {
    ws.listTrash.mockResolvedValue([trashItem('a_1.js', 'a.js')])
    confirmMock.mockResolvedValue(false)
    const res = await run({ action: 'purge', name: 'a_1.js' })
    expect(res.ok).toBe(false)
    expect(res.refused).toBe(true)
    expect(res.text).toContain('用户没有确认彻底删除')
    expect(ws.purgeTrash).not.toHaveBeenCalled()
  })

  it('purge 确认后按条目名彻底删除', async () => {
    ws.listTrash.mockResolvedValue([trashItem('a_1.js', 'a.js')])
    const res = await run({ action: 'purge', path: 'a.js' })
    expect(res.ok).toBe(true)
    expect(confirmMock).toHaveBeenCalledTimes(1)
    expect(ws.purgeTrash).toHaveBeenCalledWith('a_1.js')
    expect(res.record).toBe('files：purge a.js')
  })

  it('purge 命中条目后才会弹框，弹窗带原路径与大小', async () => {
    ws.listTrash.mockResolvedValue([trashItem('d_1', 'old/dir', 'dir', 4096)])
    await run({ action: 'purge', name: 'd_1' })
    expect(confirmMock.mock.calls[0][0]).toContain('彻底删除「old/dir」（目录，4096 B）？')
  })

  it('界面无法弹确认框时拒绝执行而不是静默删除', async () => {
    globalThis.window = {}
    ws.listTrash.mockResolvedValue([trashItem('a_1.js', 'a.js')])
    const res = await run({ action: 'purge', name: 'a_1.js' })
    expect(res.refused).toBe(true)
    expect(res.text).toContain('当前界面无法弹出确认框')
    expect(ws.purgeTrash).not.toHaveBeenCalled()
  })

  it('empty_trash 空回收站不弹确认框', async () => {
    const res = await run({ action: 'empty_trash' })
    expect(res.text).toBe('回收站已经是空的。')
    expect(confirmMock).not.toHaveBeenCalled()
    expect(ws.emptyTrash).not.toHaveBeenCalled()
  })

  it('empty_trash 确认后清空', async () => {
    ws.listTrash.mockResolvedValue([trashItem('a_1.js', 'a.js'), trashItem('b_1.js', 'b.js')])
    ws.emptyTrash.mockResolvedValue({ removed: 2 })
    const res = await run({ action: 'empty_trash' })
    expect(res.text).toBe('已清空回收站，永久删除 2 个条目。')
    expect(confirmMock.mock.calls[0][0]).toContain('2 个条目会永久删除')
  })

  it('empty_trash 取消时 refused', async () => {
    ws.listTrash.mockResolvedValue([trashItem('a_1.js', 'a.js')])
    confirmMock.mockResolvedValue(false)
    const res = await run({ action: 'empty_trash' })
    expect(res.refused).toBe(true)
    expect(ws.emptyTrash).not.toHaveBeenCalled()
  })
})

describe('files history 三动作', () => {
  it('按文件分组并给出版本文件名', async () => {
    ws.listHistory.mockResolvedValue([
      { path: 'a.js', versions: [{ file: 'a@1.json', at, size: 12 }, { file: 'a@2.json', at, size: 24 }] },
      { path: 'src/b.js', versions: [{ file: 'b@1.json', at, size: 30 }] },
    ])
    const res = await run({ action: 'history' })
    expect(res.text).toContain('历史版本：工作区全部文件，共 2 个文件')
    expect(res.text).toContain('· a.js（2 个版本）')
    expect(res.text).toContain('1. a@1.json')
    expect(res.text).toContain('history_restore 传 version')
  })

  it('path 精确命中单文件，目录则按前缀收集', async () => {
    ws.listHistory.mockResolvedValue([
      { path: 'src/b.js', versions: [{ file: 'b@1.json', at, size: 30 }] },
    ])
    const one = await run({ action: 'history', path: 'src/b.js' })
    expect(one.text).toContain('历史版本：src/b.js，共 1 个文件')
    const dir = await run({ action: 'history', path: 'src' })
    expect(dir.text).toContain('src/b.js')
    const miss = await run({ action: 'history', path: 'other.js' })
    expect(miss.text).toContain('other.js 还没有历史版本')
  })

  it('没有任何历史版本时说明原因', async () => {
    const res = await run({ action: 'history' })
    expect(res.text).toBe('工作区里还没有历史版本。')
    expect(res.record).toBe('files：history 全部 → 0 组')
  })

  it('读取版本内容，并声明不是当前文件', async () => {
    const res = await run({ action: 'history_read', version: 'a@1.json' })
    expect(ws.getHistoryText).toHaveBeenCalledWith('a@1.json')
    expect(res.text).toContain('历史版本 a@1.json：a.js')
    expect(res.text).toContain('旧内容')
    expect(res.text).toContain('不要当成当前文件')
  })

  it('恢复版本走写入额度并记录变更', async () => {
    const budget = createWriteBudget({ maxFiles: 3, maxBytes: 1000 })
    const res = await run({ action: 'history_restore', version: 'a@1.json' }, { budget })
    expect(ws.restoreHistory).toHaveBeenCalledWith('a@1.json')
    expect(res.text).toContain('已把 a.js 恢复')
    expect(res.text).toContain('恢复前的内容也已存为新的历史版本')
    expect(budget.files).toBe(1)
    expect(ws.recordAiFileAction).toHaveBeenCalledWith('write', 'a.js')
  })

  it('版本不存在时把服务层错误原样回灌', async () => {
    ws.getHistoryText.mockRejectedValue(new Error('历史版本不存在或已损坏，可能已被清理'))
    const res = await run({ action: 'history_read', version: 'bad.json' })
    expect(res.ok).toBe(false)
    expect(res.text).toContain('历史版本不存在或已损坏')
  })
})

describe('files zip / unzip', () => {
  it('按清单打包并写入工作区，按压缩包体积计费', async () => {
    const budget = createWriteBudget({ maxFiles: 5, maxBytes: 100000 })
    const res = await run({ action: 'zip', files: ['a.js', 'b.js'], to: 'dist/out.zip' }, { budget })
    expect(ws.zipFiles).toHaveBeenCalledWith(['a.js', 'b.js'], 'out.zip')
    expect(ws.writeBlob).toHaveBeenCalledWith('dist/out.zip', { size: 2048 })
    expect(res.text).toContain('压缩包已生成 dist/out.zip（来源：2 个清单项')
    expect(res.text).toContain('3 个文件 / 5000 B')
    expect(budget.bytes).toBe(2048)
    expect(ws.recordAiFileAction).toHaveBeenCalledWith('write', 'dist/out.zip')
  })

  it('to 缺少 .zip 后缀时补齐，同名覆盖要说明', async () => {
    ws.statFile.mockResolvedValue({ exists: true, size: 1 })
    const res = await run({ action: 'zip', files: ['a.js'], to: 'dist/out' })
    expect(ws.writeBlob).toHaveBeenCalledWith('dist/out.zip', { size: 2048 })
    expect(res.text).toContain('覆盖了同名文件')
  })

  it('不给清单时打包目录，缺省用服务层文件名', async () => {
    const res = await run({ action: 'zip', path: 'src' })
    expect(ws.zipDirectory).toHaveBeenCalledWith('src')
    expect(res.text).toContain('压缩包已生成 src.zip（来源：目录 src')
    const root = await run({ action: 'zip' })
    expect(root.text).toContain('压缩包已生成 src.zip（来源：整个工作区')
  })

  it('打包超出额度时报额度错误而不是半写文件', async () => {
    const budget = createWriteBudget({ maxFiles: 5, maxBytes: 100 })
    const res = await run({ action: 'zip', files: ['a.js'], to: 'out.zip' }, { budget })
    expect(res.ok).toBe(false)
    expect(res.text).toContain('写入额度已用完')
    expect(ws.writeBlob).not.toHaveBeenCalled()
  })

  it('解压后记录导入路径并列出跳过项', async () => {
    ws.importZip.mockResolvedValue({
      imported: 2,
      skipped: ['../evil.js', 'big.bin（超过 1 B）'],
      bytes: 900,
      paths: ['pkg/a.js', 'pkg/b.js'],
    })
    const res = await run({ action: 'unzip', path: 'pkg.zip', to: 'pkg' })
    expect(ws.getFileBlob).toHaveBeenCalledWith('pkg.zip')
    expect(ws.importZip).toHaveBeenCalledWith({ name: 'pkg.zip', size: 512 }, 'pkg')
    expect(res.text).toContain('已解压 pkg.zip：写入 2 个文件（900 B）到 pkg，首个落点 pkg/a.js')
    expect(res.text).toContain('跳过 2 项：../evil.js、big.bin（超过 1 B）')
    expect(res.text).toContain('解到子目录时会多出一层同名目录')
    expect(ws.recordAiFileAction).toHaveBeenCalledWith('write', ['pkg/a.js', 'pkg/b.js'])
  })

  it('全部跳过时不报告落点', async () => {
    ws.importZip.mockResolvedValue({ imported: 0, skipped: ['../evil.js'], bytes: 0, paths: [] })
    const res = await run({ action: 'unzip', path: 'pkg.zip' })
    expect(res.ok).toBe(true)
    expect(res.text).not.toContain('，首个落点')
    expect(res.text).toContain('到 工作区根目录，跳过 1 项：../evil.js')
  })

  it('解压只占一个文件名额，不重复计入体积', async () => {
    const budget = createWriteBudget({ maxFiles: 2, maxBytes: 100 })
    const res = await run({ action: 'unzip', path: 'pkg.zip' }, { budget })
    expect(res.ok).toBe(true)
    expect(budget.files).toBe(1)
    expect(budget.bytes).toBe(0)
  })
})

describe('新动作的并行与提示词', () => {
  it('只读的新动作可以并行，改动文件的不行', async () => {
    for (const action of ['trash', 'history', 'history_read']) {
      expect(isParallelSafe({ tool: 'files', args: { action } })).toBe(true)
    }
    for (const action of ['restore', 'purge', 'empty_trash', 'history_restore', 'zip', 'unzip']) {
      expect(isParallelSafe({ tool: 'files', args: { action } })).toBe(false)
    }
  })

  it('delete 结果告诉模型用 restore 找回', async () => {
    const { deletePath } = await import('../src/services/workspace.js')
    deletePath.mockResolvedValueOnce({ trashedAs: '.xiyue-trash/a_1.js' })
    const res = await run({ action: 'delete', path: 'a.js' })
    expect(res.text).toContain('移入 .xiyue-trash/a_1.js，要找回用 files 的 restore')
  })
})

describe('备份没做成时的写入文案', () => {
  const failed = { backedUp: false, backupWarning: '历史目录不可写（NoModificationAllowedError）' }

  it('write 覆盖成功但要明确说明这次回不去', async () => {
    ws.writeFile.mockResolvedValue({ ...failed, created: false, size: 3 })
    const res = await run({ action: 'write', path: 'a.js', content: 'abc' })
    expect(res.ok).toBe(true)
    expect(res.text).toContain('已覆盖 a.js（3 B）。')
    expect(res.text).toContain('注意：本次覆盖没有生成历史版本（历史目录不可写')
    expect(res.text).toContain('旧内容找不回来')
  })

  it('备份正常时不多说一句', async () => {
    const res = await run({ action: 'write', path: 'a.js', content: 'abc' })
    expect(res.text).toBe('已创建 a.js（3 B）。')
  })

  it('edit 与 append 带同一句提醒', async () => {
    ws.editFile.mockResolvedValue({ ...failed, replacements: 2 })
    ws.appendFile.mockResolvedValue({ ...failed, size: 6 })
    const edited = await run({ action: 'edit', path: 'a.js', old_text: 'x', new_text: 'y' })
    expect(edited.text).toContain('已修改 a.js，替换 2 处。注意：本次覆盖没有生成历史版本')
    const appended = await run({ action: 'append', path: 'a.js', content: 'y' })
    expect(appended.text).toContain('已向 a.js 追加内容（当前 6 B）。注意：本次覆盖没有生成历史版本')
  })

  it('history_restore 备份失败时不再承诺可以回退', async () => {
    ws.restoreHistory.mockResolvedValue({ path: 'a.js', at, ...failed })
    const res = await run({ action: 'history_restore', version: 'v1.json' })
    expect(res.text).toContain('已把 a.js 恢复到')
    expect(res.text).toContain('恢复前的内容没有备份成功')
    expect(res.text).toContain('这次回退无法再撤销')
    expect(res.text).not.toContain('也已存为新的历史版本')
  })
})
