import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import JSZip from 'jszip'
import { installOpfs } from './helpers/opfsShim'

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

async function entriesOf(blob) {
  const zip = await JSZip.loadAsync(Buffer.from(await blob.arrayBuffer()))
  return zip
}

describe('zipDirectory 打包', () => {
  beforeEach(async () => {
    await ws.writeFile('src/app.js', 'app content')
    await ws.writeFile('src/util/str.js', 'str content')
    await ws.writeFile('docs/说明.md', '# 中文文件名')
    await ws.makeDir('assets/empty')
  })

  it('保留目录结构与中文文件名，空目录也进包', async () => {
    const out = await ws.zipDirectory('')
    expect(out).toMatchObject({ files: 3, name: 'xiyue-workspace.zip' })
    expect(out.bytes).toBe('app content'.length + 'str content'.length + Buffer.byteLength('# 中文文件名'))
    const zip = await entriesOf(out.blob)
    expect(Object.keys(zip.files).sort()).toEqual([
      'assets/', 'assets/empty/', 'docs/', 'docs/说明.md', 'src/', 'src/app.js', 'src/util/', 'src/util/str.js',
    ])
    expect(await zip.file('src/util/str.js').async('string')).toBe('str content')
    expect(await zip.file('docs/说明.md').async('string')).toBe('# 中文文件名')
    expect(zip.files['assets/empty/'].dir).toBe(true)
  })

  it('打包子目录时路径相对该目录，包名取目录名', async () => {
    const out = await ws.zipDirectory('src')
    expect(out).toMatchObject({ files: 2, name: 'src.zip' })
    const zip = await entriesOf(out.blob)
    expect(Object.keys(zip.files).sort()).toEqual(['app.js', 'util/', 'util/str.js'])
  })

  it('空目录与只有回收站/历史内容的目录不算有产物', async () => {
    await expect(ws.zipDirectory('assets/empty')).rejects.toThrow(/这个目录是空的/)
    await expect(ws.zipDirectory('no-such-dir')).rejects.toThrow(/目录不存在/)
  })

  it('回收站与历史目录不进包', async () => {
    await ws.writeFile('src/app.js', 'second version')
    await ws.deletePath('docs/说明.md')
    const zip = await entriesOf((await ws.zipDirectory('')).blob)
    expect(Object.keys(zip.files).some(name => name.includes('.xiyue'))).toBe(false)
    expect(zip.file('docs/说明.md')).toBeNull()
  })

  it('二进制内容原样往返', async () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255])
    await ws.writeBlob('assets/logo.bin', new Blob([bytes]))
    const zip = await entriesOf((await ws.zipDirectory('assets')).blob)
    expect([...new Uint8Array(await zip.file('logo.bin').async('arraybuffer'))]).toEqual([...bytes])
  })
})

describe('zipFiles 按清单打包', () => {
  beforeEach(async () => {
    await ws.writeFile('job/a.md', 'aaa')
    await ws.writeFile('job/b.md', 'bbb')
    await ws.writeFile('job/c.md', 'ccc')
    await ws.writeFile('job/deep/ok.md', 'ok')
  })

  it('只打包清单里的路径，重复、非法与不存在的条目自动跳过', async () => {
    const out = await ws.zipFiles(['job/a.md', 'job/a.md', 'job/gone.md', 'bad\tname.md', 'job/deep/ok.md'])
    expect(out).toMatchObject({ files: 2, bytes: 5 })
    expect(out.name).toMatch(/^xiyue-artifacts-\d+\.zip$/)
    const zip = await entriesOf(out.blob)
    expect(Object.keys(zip.files).filter(name => !name.endsWith('/')).sort()).toEqual(['job/a.md', 'job/deep/ok.md'])
  })

  it('可指定包名', async () => {
    expect((await ws.zipFiles(['job/a.md'], 'report.zip')).name).toBe('report.zip')
  })

  it('没有有效产物时明确报错', async () => {
    await expect(ws.zipFiles([])).rejects.toThrow(/还没有可打包的产物/)
    await expect(ws.zipFiles(['gone.md'])).rejects.toThrow(/还没有可打包的产物/)
  })
})

describe('importZip 还原', () => {
  async function buildZip(files, folders = []) {
    const zip = new JSZip()
    for (const [name, content] of Object.entries(files)) zip.file(name, content)
    for (const name of folders) zip.folder(name)
    return Buffer.from(await zip.generateAsync({ type: 'nodebuffer' }))
  }

  it('往返 zipDirectory 的产物，并通知面板刷新', async () => {
    await ws.writeFile('p/src/app.js', 'app')
    await ws.writeFile('p/README.md', 'readme')
    const out = await ws.zipDirectory('p')
    await ws.deletePath('p')
    await ws.emptyTrash()
    expect(await opfs.exists('p/src/app.js')).toBe(false)
    const events = []
    globalThis.window.dispatchEvent = event => { events.push(event.detail.path); return true }
    const result = await ws.importZip(Buffer.from(await out.blob.arrayBuffer()), 'p')
    expect(result).toMatchObject({ imported: 2, bytes: 9, skipped: [] })
    expect((await ws.readFile('p/src/app.js')).text).toBe('app')
    expect((await ws.readFile('p/README.md')).text).toBe('readme')
    expect(events.filter(path => path.startsWith('p/')).sort()).toEqual(['p/README.md', 'p/src/app.js'])
  })

  it('导入到指定子目录，反斜杠按目录分隔、非法字符被清洗', async () => {
    const buf = await buildZip({ 'day/notes\\win.txt': 'win', 'day/bad:name.txt': 'bad' })
    const result = await ws.importZip(buf, 'restored')
    expect(result.imported).toBe(2)
    expect((await ws.readFile('restored/day/notes/win.txt')).text).toBe('win')
    expect((await ws.readFile('restored/day/bad_name.txt')).text).toBe('bad')
  })

  it('拒绝绝对路径；.. 逃逸在 JSZip 解析阶段已被归一化，最多落在工作区根', async () => {
    const zip = new JSZip()
    zip.file('/etc/passwd', 'nope')
    zip.file('a/../../escape.txt', 'nope')
    zip.file('ok/keep.txt', 'keep')
    zip.file('empty/', '', { dir: true })
    const result = await ws.importZip(Buffer.from(await zip.generateAsync({ type: 'nodebuffer' })))
    expect(result).toMatchObject({ imported: 2, bytes: 8 })
    expect(result.skipped).toEqual(['/etc/passwd'])
    expect((await ws.readFile('ok/keep.txt')).text).toBe('keep')
    // JSZip 把 a/../../escape.txt 归一化成根下的 escape.txt，不会写到工作区外面
    expect((await ws.readFile('escape.txt')).text).toBe('nope')
    expect(await opfs.exists('a/escape.txt')).toBe(false)
    expect(await opfs.exists('etc/passwd')).toBe(false)
    expect(await opfs.exists('empty')).toBe(false)
  })

  it('空包与损坏文件给出可读错误', async () => {
    await expect(ws.importZip(Buffer.from(await new JSZip().generateAsync({ type: 'nodebuffer' }))))
      .rejects.toThrow(/没有可导入的文件/)
    await expect(ws.importZip(Buffer.from('this is not a zip'))).rejects.toThrow(/无法读取压缩包/)
    await expect(ws.importZip(null)).rejects.toThrow(/缺少 zip 文件/)
  })

  it('导入会覆盖同名文件并保留其余内容', async () => {
    await ws.writeFile('mix/old.txt', 'old content')
    await ws.writeFile('mix/keep.txt', 'untouched')
    const buf = await buildZip({ 'mix/old.txt': 'new' })
    expect((await ws.importZip(buf)).imported).toBe(1)
    expect((await ws.readFile('mix/old.txt')).text).toBe('new')
    expect((await ws.readFile('mix/keep.txt')).text).toBe('untouched')
  })

  it('导入后体积统计立即反映新文件', async () => {
    const buf = await buildZip({ 'u/a.txt': 'aaaa', 'u/b.txt': 'bb' })
    await ws.importZip(buf)
    expect(await ws.getWorkspaceUsage()).toMatchObject({ files: 2, bytes: 6 })
  })
})
