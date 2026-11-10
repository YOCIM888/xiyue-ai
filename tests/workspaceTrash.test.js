import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { installOpfs, controllableClock } from './helpers/opfsShim'

let opfs
let ws
let clock

beforeEach(async () => {
  opfs = installOpfs()
  clock = controllableClock()
  vi.resetModules()
  ws = await import('../src/services/workspace.js')
})

afterEach(() => {
  clock.restore()
  delete globalThis.navigator
  delete globalThis.window
})

/** 旧版回收站把文件扁平地放在 .xiyue-trash 根下，用桩直接造出来 */
async function seedLegacyTrash(name, content) {
  await opfs.writeText(`.xiyue-trash/${name}`, content)
}

describe('deletePath 移入回收站', () => {
  it('删除文件后工作区里没有了，回收站条目带 meta 与原文', async () => {
    await ws.writeFile('docs/a.md', 'AAA')
    const res = await ws.deletePath('docs/a.md')
    expect(res.trashedAs).toBe(`.xiyue-trash/${res.trashName}`)
    expect(res.path).toBe('docs/a.md')
    expect(await opfs.exists('docs/a.md')).toBe(false)
    expect(await opfs.readText(`.xiyue-trash/${res.trashName}/content`)).toBe('AAA')
    const meta = JSON.parse(await opfs.readText(`.xiyue-trash/${res.trashName}/meta.json`))
    expect(meta).toMatchObject({ version: 1, path: 'docs/a.md', name: 'a.md', kind: 'file' })
    expect(typeof meta.at).toBe('number')
  })

  it('删除目录时递归保存整棵树，体积按文件字节统计', async () => {
    await ws.writeFile('proj/src/x.js', 'xxx')
    await ws.writeFile('proj/notes.txt', 'yy')
    await ws.makeDir('proj/empty')
    const res = await ws.deletePath('proj')
    expect(await opfs.exists('proj')).toBe(false)
    expect(await opfs.exists(`.xiyue-trash/${res.trashName}/content/src/x.js`)).toBe(true)
    expect(await opfs.exists(`.xiyue-trash/${res.trashName}/content/notes.txt`)).toBe(true)
    expect(await opfs.exists(`.xiyue-trash/${res.trashName}/content/empty`)).toBe(true)
    expect(await ws.listTrash()).toEqual([
      expect.objectContaining({ kind: 'dir', path: 'proj', originalName: 'proj', size: 5, legacy: false }),
    ])
  })

  it('删除后清掉快照，重建同名文件不会被判成外部修改', async () => {
    await ws.writeFile('dup.txt', 'one')
    await ws.readFile('dup.txt')
    await ws.deletePath('dup.txt')
    await opfs.writeText('dup.txt', '外部新建的内容')
    expect((await ws.writeFile('dup.txt', '改写')).created).toBe(false)
    expect((await ws.readFile('dup.txt')).text).toBe('改写')
  })

  it('拒绝删除工作区根目录与不存在的路径', async () => {
    await expect(ws.deletePath('')).rejects.toThrow(/不能删除工作区根目录/)
    await expect(ws.deletePath('nope.txt')).rejects.toThrow(/文件不存在：nope\.txt/)
  })

  it('同一毫秒内重复删除同名文件时条目名自动加序号', async () => {
    const stamp = vi.spyOn(Date.prototype, 'toISOString').mockReturnValue('2026-01-02T03:04:05.600Z')
    try {
      await ws.writeFile('same.txt', 'first')
      const a = await ws.deletePath('same.txt')
      await ws.writeFile('same.txt', 'second')
      const b = await ws.deletePath('same.txt')
      expect(a.trashName).toBe('2026-01-02T03-04-05-600Z_same.txt')
      expect(b.trashName).toBe('2026-01-02T03-04-05-600Z_2_same.txt')
      expect(await opfs.readText(`.xiyue-trash/${b.trashName}/content`)).toBe('second')
    } finally {
      stamp.mockRestore()
    }
  })
})

describe('listTrash', () => {
  it('回收站目录还不存在时返回空数组', async () => {
    expect(await ws.listTrash()).toEqual([])
  })

  it('按删除时间倒序排列，字段齐全', async () => {
    await ws.writeFile('t1.txt', '1')
    await ws.writeFile('t2.txt', '2')
    await ws.writeFile('t3.txt', '3')
    const older = await ws.deletePath('t1.txt')
    clock.advance(60_000)
    const newer = await ws.deletePath('t2.txt')
    clock.advance(60_000)
    const newest = await ws.deletePath('t3.txt')
    const list = await ws.listTrash()
    expect(list.map(item => item.name)).toEqual([newest.trashName, newer.trashName, older.trashName])
    expect(list[0]).toEqual({
      name: newest.trashName,
      path: 't3.txt',
      originalName: 't3.txt',
      kind: 'file',
      at: expect.any(Number),
      size: 1,
      legacy: false,
    })
  })

  it('旧版扁平条目也能列出，时间从文件名解析', async () => {
    await seedLegacyTrash('2026-01-01T02:03:04.500Z_plain.txt', 'legacy')
    await seedLegacyTrash('2026-01-01T02-03-04-500Z_old.txt', 'yy')
    const list = await ws.listTrash()
    const parsed = list.find(item => item.name.endsWith('Z_old.txt'))
    expect(parsed).toMatchObject({ path: 'old.txt', originalName: 'old.txt', kind: 'file', size: 2, legacy: true })
    expect(parsed.at).toBe(Date.parse('2026-01-01T02:03:04.500Z'))
    // 时间戳里带冒号的不是旧版格式，整名当文件名用
    expect(list.find(item => item.name.includes(':'))).toMatchObject({ at: null, path: '2026-01-01T02:03:04.500Z_plain.txt' })
  })

  it('meta 存在但内容已被删掉时仍列出，体积记 0', async () => {
    await ws.writeFile('lost.txt', 'abc')
    const res = await ws.deletePath('lost.txt')
    await opfs.remove(`.xiyue-trash/${res.trashName}/content`)
    expect(await ws.listTrash()).toEqual([expect.objectContaining({ name: res.trashName, size: 0 })])
  })
})

describe('restoreTrash', () => {
  it('文件恢复到原路径并从回收站消失', async () => {
    await ws.writeFile('docs/deep/a.md', '内容A')
    const res = await ws.deletePath('docs/deep/a.md')
    expect(await ws.restoreTrash(res.trashName)).toEqual({ path: 'docs/deep/a.md', renamed: false })
    expect((await ws.readFile('docs/deep/a.md')).text).toBe('内容A')
    expect(await opfs.exists(`.xiyue-trash/${res.trashName}`)).toBe(false)
  })

  it('原路径已被新文件占用时改名恢复，不覆盖', async () => {
    await ws.writeFile('report.txt', '旧稿')
    const res = await ws.deletePath('report.txt')
    await ws.writeFile('report.txt', '新稿')
    expect(await ws.restoreTrash(res.trashName)).toEqual({ path: 'report（已恢复）.txt', renamed: true })
    expect((await ws.readFile('report.txt')).text).toBe('新稿')
    expect((await ws.readFile('report（已恢复）.txt')).text).toBe('旧稿')
  })

  it('改名恢复的候选名也被占用时序号递增', async () => {
    await ws.writeFile('r.txt', 'v1')
    const first = await ws.deletePath('r.txt')
    clock.advance(1000)
    await ws.writeFile('r.txt', 'v2')
    const second = await ws.deletePath('r.txt')
    await ws.writeFile('r.txt', 'now')
    await ws.writeFile('r（已恢复）.txt', 'now2')
    expect(await ws.restoreTrash(first.trashName)).toEqual({ path: 'r（已恢复 2）.txt', renamed: true })
    expect(await ws.restoreTrash(second.trashName)).toEqual({ path: 'r（已恢复 3）.txt', renamed: true })
    expect((await ws.readFile('r（已恢复 2）.txt')).text).toBe('v1')
    expect((await ws.readFile('r.txt')).text).toBe('now')
  })

  it('目录整棵恢复', async () => {
    await ws.writeFile('pkg/src/x.js', 'xxx')
    await ws.writeFile('pkg/README.md', 'yy')
    const res = await ws.deletePath('pkg')
    expect(await ws.restoreTrash(res.trashName)).toEqual({ path: 'pkg', renamed: false })
    expect((await ws.readFile('pkg/src/x.js')).text).toBe('xxx')
    expect((await ws.readFile('pkg/README.md')).text).toBe('yy')
  })

  it('父目录也被删掉时恢复会重建目录', async () => {
    await ws.writeFile('gone/keep.txt', 'k')
    const file = await ws.deletePath('gone/keep.txt')
    await ws.deletePath('gone')
    expect(await opfs.exists('gone')).toBe(false)
    await ws.restoreTrash(file.trashName)
    expect((await ws.readFile('gone/keep.txt')).text).toBe('k')
  })

  it('旧版扁平文件条目可以恢复', async () => {
    await seedLegacyTrash('2026-01-01T02-03-04-500Z_legacy.txt', 'old content')
    const [item] = await ws.listTrash()
    expect(await ws.restoreTrash(item.name)).toEqual({ path: 'legacy.txt', renamed: false })
    expect((await ws.readFile('legacy.txt')).text).toBe('old content')
    expect(await ws.listTrash()).toEqual([])
  })

  it('条目不存在与名称非法都拒绝', async () => {
    await ws.writeFile('x.txt', '1')
    await ws.deletePath('x.txt')
    await expect(ws.restoreTrash('not-there')).rejects.toThrow(/回收站条目不存在/)
    await expect(ws.restoreTrash('a/b')).rejects.toThrow(/无效的回收站条目/)
    await expect(ws.restoreTrash('../x')).rejects.toThrow(/路径不允许包含/)
  })

  it('内容缺失时拒绝恢复而不是写出空文件', async () => {
    await ws.writeFile('bad.txt', 'abc')
    const res = await ws.deletePath('bad.txt')
    await opfs.remove(`.xiyue-trash/${res.trashName}/content`)
    await expect(ws.restoreTrash(res.trashName)).rejects.toThrow(/内容缺失/)
    expect(await opfs.exists('bad.txt')).toBe(false)
  })
})

describe('purgeTrash / emptyTrash / cleanupTrash', () => {
  it('彻底删除单个条目，其余保留', async () => {
    await ws.writeFile('p1.txt', '1')
    await ws.writeFile('p2.txt', '2')
    const a = await ws.deletePath('p1.txt')
    const b = await ws.deletePath('p2.txt')
    await ws.purgeTrash(a.trashName)
    expect(await opfs.exists(`.xiyue-trash/${a.trashName}`)).toBe(false)
    expect((await ws.listTrash()).map(item => item.name)).toEqual([b.trashName])
  })

  it('条目名非法或不存在的条目报错，其余条目不受影响', async () => {
    await ws.writeFile('keep.txt', '1')
    const res = await ws.deletePath('keep.txt')
    await expect(ws.purgeTrash('a/b')).rejects.toThrow(/无效的回收站条目/)
    await expect(ws.purgeTrash('')).rejects.toThrow(/无效的回收站条目/)
    await expect(ws.purgeTrash('../x')).rejects.toThrow(/路径不允许包含/)
    await expect(ws.purgeTrash('missing-entry')).rejects.toThrow(/不存在/)
    expect((await ws.listTrash()).map(item => item.name)).toEqual([res.trashName])
  })

  it('清空回收站统计条数，回收站不存在时返回 0', async () => {
    expect((await ws.emptyTrash()).removed).toBe(0)
    await ws.writeFile('e1.txt', '1')
    await ws.writeFile('e2.txt', '2')
    await ws.deletePath('e1.txt')
    await ws.deletePath('e2.txt')
    expect((await ws.emptyTrash()).removed).toBe(2)
    expect(await ws.listTrash()).toEqual([])
    expect(await opfs.exists('e1.txt')).toBe(false)
  })

  it('超过 30 天的条目才被自动清理', async () => {
    await ws.writeFile('c1.txt', '1')
    await ws.writeFile('c2.txt', '2')
    const older = await ws.deletePath('c1.txt')
    clock.advance(29 * 24 * 60 * 60 * 1000)
    const fresher = await ws.deletePath('c2.txt')
    expect((await ws.cleanupTrash()).removed).toBe(0)
    clock.advance(2 * 24 * 60 * 60 * 1000)
    expect((await ws.cleanupTrash()).removed).toBe(1)
    expect((await ws.listTrash()).map(item => item.name)).toEqual([fresher.trashName])
    expect(await opfs.exists(`.xiyue-trash/${older.trashName}`)).toBe(false)
  })

  it('旧版扁平条目按文件名时间清理', async () => {
    await seedLegacyTrash('2020-01-01T02-03-04-500Z_old.txt', 'x')
    await ws.writeFile('new.txt', '1')
    await ws.deletePath('new.txt')
    expect((await ws.cleanupTrash()).removed).toBe(1)
    expect((await ws.listTrash()).length).toBe(1)
  })

  it('回收站不存在时清理返回 0', async () => {
    expect((await ws.cleanupTrash()).removed).toBe(0)
  })

  it('删除后的文件不再出现在工作区列表中，但仍占回收站体积', async () => {
    await ws.writeFile('gone/big.txt', 'x'.repeat(2000))
    await ws.deletePath('gone/big.txt')
    expect(await ws.listDir('gone')).toMatchObject({ entries: [], total: 0 })
    const usage = await ws.getWorkspaceUsage()
    expect(usage.files).toBe(0)
    expect((await ws.listTrash())[0].size).toBe(2000)
  })
})
