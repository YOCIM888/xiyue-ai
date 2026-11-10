import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { installOpfs } from './helpers/opfsShim'

const MAX_READ_BYTES = 1024 * 1024
const MAX_READ_CHARS = 100000

let opfs
let ws

beforeEach(async () => {
  opfs = installOpfs()
  vi.resetModules()
  ws = await import('../src/services/workspace.js')
})

afterEach(() => {
  delete globalThis.navigator
  delete globalThis.window
})

describe('路径守卫', () => {
  const rejected = [
    ['../escape.txt', /不允许包含 \.\./],
    ['a/../b.txt', /不允许包含 \.\./],
    ['C:/x/a.txt', /不要带盘符/],
    ['a\tb.txt', /控制字符/],
    [`${'x'.repeat(201)}.txt`, /文件名过长/],
    ['a/b /c.txt', /不能以空格或点结尾/],
    ['a/b.', /不能以空格或点结尾/],
    ['con.txt', /Windows 保留名称/],
    ['nul', /Windows 保留名称/],
    ['.xiyue-trash/x.txt', /回收站与历史目录不允许操作/],
    ['.xiyue-history/x.json', /回收站与历史目录不允许操作/],
  ]

  it.each(rejected)('writeFile(%s) 直接拒绝', async (path, message) => {
    await expect(ws.writeFile(path, 'x')).rejects.toThrow(message)
  })

  it('规范化反斜杠、首斜杠与多余的 . 段', async () => {
    await ws.writeFile('/a/./b\\c.txt', 'ok')
    expect(await opfs.readText('a/b/c.txt')).toBe('ok')
  })

  it('sanitizeFileName 清洗非法字符并保住扩展名', () => {
    expect(ws.sanitizeFileName('a/b:c*d?.txt')).toBe('a_b_c_d_.txt')
    expect(ws.sanitizeFileName('...')).toBe('file')
    expect(ws.sanitizeFileName('con.txt')).toBe('_con.txt')
    expect(ws.sanitizeFileName('尾点文件名.  ')).toBe('尾点文件名')
    const long = ws.sanitizeFileName(`${'x'.repeat(300)}.json`)
    expect(long.length).toBeLessThanOrEqual(120)
    expect(long.endsWith('.json')).toBe(true)
  })
})

describe('读写与覆盖', () => {
  it('写入新文件再读回，带 size 与 modified', async () => {
    const written = await ws.writeFile('notes.md', '# 标题\n内容')
    expect(written).toEqual({ created: true, size: '# 标题\n内容'.length, backedUp: true, backupWarning: '' })
    const read = await ws.readFile('notes.md')
    expect(read.text).toBe('# 标题\n内容')
    expect(read.size).toBe(new TextEncoder().encode('# 标题\n内容').length)
    expect(read.truncated).toBe(false)
    expect(typeof read.modified).toBe('number')
  })

  it('覆盖写返回 created:false', async () => {
    await ws.writeFile('a.txt', 'one')
    expect((await ws.writeFile('a.txt', 'two')).created).toBe(false)
    expect(await ws.readFile('a.txt')).toMatchObject({ text: 'two' })
  })

  it('读不存在的文件报「文件不存在」', async () => {
    await expect(ws.readFile('missing.txt')).rejects.toThrow(/文件不存在：missing\.txt/)
  })

  it('路径类型不符时给出中文提示', async () => {
    await ws.makeDir('sub')
    await expect(ws.writeFile('sub', 'x')).rejects.toThrow(/路径类型不符/)
    await expect(ws.readFile('sub')).rejects.toThrow(/路径类型不符/)
  })

  it('read 之后被外部改动，覆盖写要冲突', async () => {
    await ws.writeFile('conflict.txt', '原始内容')
    await ws.readFile('conflict.txt')
    await opfs.writeText('conflict.txt', '外部写入的更长内容')
    await expect(ws.writeFile('conflict.txt', '试图覆盖')).rejects.toMatchObject({ code: 'WRITE_CONFLICT' })
    expect(await opfs.readText('conflict.txt')).toBe('外部写入的更长内容')
  })

  it('冲突时 force=true 可以强行覆盖', async () => {
    await ws.writeFile('conflict.txt', '原始内容')
    await ws.readFile('conflict.txt')
    await opfs.writeText('conflict.txt', '外部写入的更长内容')
    await expect(ws.writeFile('conflict.txt', '强制覆盖', { force: true })).resolves.toMatchObject({ created: false })
    expect(await opfs.readText('conflict.txt')).toBe('强制覆盖')
  })

  it('超过 1 MB 的文件拒绝整读，模块读取同样限流', async () => {
    await ws.writeFile('big.txt', 'x'.repeat(MAX_READ_BYTES + 1))
    await expect(ws.readFile('big.txt')).rejects.toThrow(/文件过大/)
    await expect(ws.readModuleText('big.txt')).rejects.toThrow(/超过单个模块/)
  })

  it('超过 10 万字符时截断并标记 truncated', async () => {
    await ws.writeFile('long.txt', 'y'.repeat(MAX_READ_CHARS + 5000))
    const read = await ws.readFile('long.txt')
    expect(read.text.length).toBe(MAX_READ_CHARS)
    expect(read.truncated).toBe(true)
    expect(read.size).toBe(MAX_READ_CHARS + 5000)
  })

  it('二进制内容不能当文本读', async () => {
    await ws.writeFile('bin.txt', `head${String.fromCharCode(0)}tail`)
    await expect(ws.readFile('bin.txt')).rejects.toThrow(/二进制文件/)
    await expect(ws.readModuleText('bin.txt')).rejects.toThrow(/不是文本文件/)
  })

  it('单次写入超过 2 MB 直接拒绝，append 也按合并后大小判断', async () => {
    await expect(ws.writeFile('huge.txt', 'x'.repeat(2 * 1024 * 1024 + 1))).rejects.toThrow(/单次写入内容过大/)
    await ws.writeFile('part.txt', 'x'.repeat(1024))
    await expect(ws.appendFile('part.txt', 'x'.repeat(2 * 1024 * 1024))).rejects.toThrow(/追加后内容过大/)
  })

  it('writeBlob 原样写入二进制，超限拒绝', async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3, 254])])
    expect((await ws.writeBlob('img/data.bin', blob)).size).toBe(4)
    expect([...(await opfs.resolve('img/data.bin')).bytes]).toEqual([1, 2, 3, 254])
    await expect(ws.writeBlob('over.bin', new Blob([new Uint8Array(1024 * 1024 * 11)]), { maxBytes: 1024 * 1024 }))
      .rejects.toThrow(/不能超过/)
  })

  it('statFile 对缺失与空路径都返回 exists:false', async () => {
    expect(await ws.statFile('nope.txt')).toEqual({ exists: false })
    expect(await ws.statFile('')).toEqual({ exists: false })
    await ws.writeFile('here.txt', 'abc')
    expect(await ws.statFile('here.txt')).toMatchObject({ exists: true, size: 3 })
  })
})

describe('edit 与 append', () => {
  beforeEach(async () => {
    await ws.writeFile('code.js', 'const a = 1\nconst b = 2\nconst a = 1\n// tail\n')
  })

  it('唯一匹配才替换，返回替换数', async () => {
    const out = await ws.editFile('code.js', 'const b = 2', 'const b = 3')
    expect(out).toEqual({ replacements: 1, backedUp: true, backupWarning: '' })
    expect((await ws.readFile('code.js')).text).toContain('const b = 3')
  })

  it('匹配不到与匹配多处都报错，后者要求 replace_all', async () => {
    await expect(ws.editFile('code.js', 'const z = 9', 'x')).rejects.toThrow(/未找到 old_text/)
    await expect(ws.editFile('code.js', 'const a = 1', 'x')).rejects.toThrow(/匹配到 2 处/)
    expect((await ws.editFile('code.js', 'const a = 1', 'x', { replaceAll: true })).replacements).toBe(2)
    expect((await ws.readFile('code.js')).text).toBe('x\nconst b = 2\nx\n// tail\n')
  })

  it('old_text 为空时报参数错误', async () => {
    await expect(ws.editFile('code.js', '', 'x')).rejects.toThrow(/old_text/)
  })

  it('append 追加已有文件，文件不存在时新建', async () => {
    expect((await ws.appendFile('code.js', 'tail\n')).created).toBe(false)
    expect((await ws.readFile('code.js')).text).toMatch(/tail\n$/)
    expect((await ws.appendFile('fresh.txt', 'start')).created).toBe(true)
    await expect(ws.appendFile('fresh.txt', '')).rejects.toThrow(/content 参数/)
  })
})

describe('目录、复制、移动与重命名', () => {
  beforeEach(async () => {
    await ws.writeFile('src/index.js', 'export const a = 1')
    await ws.writeFile('src/util/str.js', 'export const b = 2')
    await ws.writeFile('src/util/str.test.js', 'test')
  })

  it('listDir 目录在前、同类按名称排序，且不暴露回收站与历史目录', async () => {
    await opfs.resolve('.xiyue-trash', { dir: true, create: true })
    await opfs.resolve('.xiyue-history', { dir: true, create: true })
    await opfs.writeText('.xiyue-history/index.json', '{}')
    const { entries, total, truncated } = await ws.listDir('src')
    expect(entries.map(e => e.name)).toEqual(['util', 'index.js'])
    expect(entries[0]).toEqual({ name: 'util', kind: 'dir' })
    expect(entries[1].kind).toBe('file')
    expect(entries[1].size).toBe(new TextEncoder().encode('export const a = 1').length)
    expect(total).toBe(2)
    expect(truncated).toBe(false)
    expect((await ws.listDir('')).entries.map(e => e.name)).toEqual(['src'])
  })

  it('超过 500 条时截断但 total 记全量', async () => {
    for (let i = 0; i < 503; i += 1) await ws.writeFile(`many/f${String(i).padStart(4, '0')}.txt`, 'x')
    const { entries, total, truncated } = await ws.listDir('many')
    expect(entries.length).toBe(500)
    expect(total).toBe(503)
    expect(truncated).toBe(true)
  })

  it('copyPath 递归复制目录，目标存在与自我嵌套都拒绝', async () => {
    await ws.copyPath('src/util', 'copy/util')
    expect((await ws.readFile('copy/util/str.js')).text).toBe('export const b = 2')
    await expect(ws.copyPath('src/util', 'copy/util')).rejects.toThrow(/目标已存在/)
    await expect(ws.copyPath('src', 'src/sub')).rejects.toThrow(/不能把目录复制到它自己的子目录/)
    await expect(ws.copyPath('src/index.js', 'src/index.js')).rejects.toThrow(/源路径与目标路径相同/)
    await expect(ws.copyPath('missing.js', 'x.js')).rejects.toThrow(/文件不存在/)
  })

  it('movePath 复制后删源，同路径移动是空操作', async () => {
    await ws.movePath('src/util/str.js', 'src/util/text.js')
    expect(await opfs.exists('src/util/text.js')).toBe(true)
    expect(await opfs.exists('src/util/str.js')).toBe(false)
    await expect(ws.movePath('src', 'src/inner')).rejects.toThrow(/不能把目录移动到它自己的子目录/)
    expect(await ws.movePath('src/util/text.js', 'src/util/text.js')).toEqual({ path: 'src/util/text.js' })
  })

  it('renamePath 只允许单段新名', async () => {
    expect(await ws.renamePath('src/util/str.test.js', 'str.spec.js')).toEqual({ path: 'src/util/str.spec.js' })
    await expect(ws.renamePath('src/util/text.js', 'a/b.js')).rejects.toThrow(/不能包含 \//)
    await expect(ws.renamePath('', 'x')).rejects.toThrow(/不能重命名工作区根目录/)
  })

  it('getFileBlob 拿到原始字节', async () => {
    const blob = await ws.getFileBlob('src/index.js')
    expect(blob.size).toBe('export const a = 1'.length)
    expect(await blob.text()).toBe('export const a = 1')
    await expect(ws.getFileBlob('nope.js')).rejects.toThrow(/文件不存在/)
  })
})

describe('容量与格式化', () => {
  it('formatBytes 按 B/KB/MB/GB 分档', () => {
    expect(ws.formatBytes(0)).toBe('0 B')
    expect(ws.formatBytes(999)).toBe('999 B')
    expect(ws.formatBytes(1024)).toBe('1.0 KB')
    expect(ws.formatBytes(1024 * 1024 * 15)).toBe('15.0 MB')
    expect(ws.formatBytes(1024 ** 3 * 2.5)).toBe('2.50 GB')
    expect(ws.formatBytes(undefined)).toBe('0 B')
  })

  it('getWorkspaceUsage 统计文件数与字节数，跳过回收站与历史目录', async () => {
    await ws.writeFile('u/a.txt', 'aaaa')
    await ws.writeFile('u/b/c.txt', 'bb')
    await ws.writeFile('u/big.txt', 'x'.repeat(1000))
    const before = await ws.getWorkspaceUsage()
    expect(before).toMatchObject({ files: 3, bytes: 1006, mode: 'opfs', quota: 1024 * 1024 * 1024, usage: 1024 * 1024 })

    await ws.writeFile('u/a.txt', 'x'.repeat(10))
    await ws.deletePath('u/b')
    const after = await ws.getWorkspaceUsage()
    expect(after.files).toBe(2)
    expect(after.bytes).toBe(1010)
  })

  it('getWorkspaceStatus 在无 showDirectoryPicker 的环境下报 opfs 模式', async () => {
    const status = await ws.getWorkspaceStatus()
    expect(status).toMatchObject({ mode: 'opfs', folderName: '', permission: null, folderSupported: false, opfsSupported: true })
  })
})
