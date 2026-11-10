import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { installOpfs, controllableClock } from './helpers/opfsShim'

const HISTORY_KEEP = 5
const HISTORY_TOTAL_MAX = 200

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

/** 覆盖写之前推进时钟，保证历史版本的 at 严格递增 */
async function overwrite(path, text) {
  clock.advance(1000)
  await ws.writeFile(path, text)
}

async function historyFiles() {
  try {
    return (await opfs.names('.xiyue-history')).filter(name => name !== 'index.json')
  } catch {
    return []
  }
}

async function versionCount() {
  return (await ws.listHistory()).reduce((sum, item) => sum + item.versions.length, 0)
}

describe('覆盖写备份', () => {
  it('还没有历史目录时列表为空', async () => {
    expect(await ws.listHistory()).toEqual([])
    expect(await historyFiles()).toEqual([])
  })

  it('第一次写入不备份，覆盖后才产生版本', async () => {
    await ws.writeFile('a.txt', 'v0')
    expect(await ws.listHistory()).toEqual([])
    await overwrite('a.txt', 'v1')
    const [item] = await ws.listHistory()
    expect(item.path).toBe('a.txt')
    expect(item.versions).toHaveLength(1)
    expect(item.versions[0]).toEqual({
      file: item.versions[0].file,
      at: expect.any(Number),
      size: 2,
    })
    expect(await ws.getHistoryText(item.versions[0].file)).toEqual({
      path: 'a.txt',
      at: item.versions[0].at,
      size: 2,
      text: 'v0',
    })
  })

  it('单一路径最多 5 版，多出的旧版本连文件一起删掉', async () => {
    await ws.writeFile('h.txt', 'v0')
    for (let i = 1; i <= 6; i += 1) await overwrite('h.txt', `v${i}`)
    const [item] = await ws.listHistory()
    expect(item.versions).toHaveLength(HISTORY_KEEP)
    expect(await historyFiles()).toHaveLength(HISTORY_KEEP)
    const texts = []
    for (const version of item.versions) texts.push((await ws.getHistoryText(version.file)).text)
    // 最新在前：v5 是最后一次覆盖前的内容
    expect(texts).toEqual(['v5', 'v4', 'v3', 'v2', 'v1'])
    expect(item.versions[0].at).toBeGreaterThan(item.versions[1].at)
  })

  it('全局最多 200 版，超出后丢最旧的版本', async () => {
    for (let p = 0; p < 44; p += 1) {
      const path = `many/f${p}.txt`
      await ws.writeFile(path, 'v0')
      for (let i = 1; i <= 5; i += 1) await overwrite(path, `v${i}`)
    }
    const list = await ws.listHistory()
    expect(await versionCount()).toBe(HISTORY_TOTAL_MAX)
    expect(await historyFiles()).toHaveLength(HISTORY_TOTAL_MAX)
    // 每个路径 5 版，保留的是最后 40 个路径
    expect(list).toHaveLength(40)
    expect(list.map(item => item.path)).not.toContain('many/f0.txt')
    expect(list.map(item => item.path)).toContain('many/f43.txt')
  })

  it('空文件、内容没变、二进制、超过 2 MB 都不备份', async () => {
    await ws.writeFile('empty.txt', '')
    await overwrite('empty.txt', 'v1')
    await ws.writeFile('same.txt', 'same')
    await overwrite('same.txt', 'same')
    await ws.writeFile('bin.dat', 'a\u0000b')
    await overwrite('bin.dat', 'text now')
    await opfs.writeText('huge.txt', 'x'.repeat(2 * 1024 * 1024 + 1))
    await overwrite('huge.txt', 'shrunk')
    expect(await ws.listHistory()).toEqual([])
  })

  it('备份不影响写入结果，历史索引损坏时自动重建', async () => {
    await ws.writeFile('c.txt', 'v0')
    await overwrite('c.txt', 'v1')
    await opfs.writeText('.xiyue-history/index.json', '{ this is not json')
    expect(await ws.listHistory()).toEqual([])
    await overwrite('c.txt', 'v2')
    expect((await ws.readFile('c.txt')).text).toBe('v2')
    expect((await ws.listHistory()).flatMap(item => item.versions)).toHaveLength(1)
  })
})

describe('读取与恢复历史版本', () => {
  it('getLatestHistoryFor 返回最新版本，未知路径与无历史时返回 null', async () => {
    await ws.writeFile('d/f.txt', 'v0')
    expect(await ws.getLatestHistoryFor('d/f.txt')).toBeNull()
    await ws.writeFile('other.txt', 'v0')
    await overwrite('other.txt', 'v1')
    await overwrite('d/f.txt', 'v1')
    await overwrite('d/f.txt', 'v2')
    const latest = await ws.getLatestHistoryFor('d/f.txt')
    expect(latest).toMatchObject({ size: 2 })
    expect((await ws.getHistoryText(latest.file)).text).toBe('v1')
    expect(await ws.getLatestHistoryFor('missing.txt')).toBeNull()
    expect(await ws.getLatestHistoryFor('')).toBeNull()
  })

  it('restoreHistory 写回原路径，并把当时的内容记成新版本', async () => {
    await ws.writeFile('r.txt', '旧内容')
    await overwrite('r.txt', '新内容')
    const [item] = await ws.listHistory()
    expect(await ws.restoreHistory(item.versions[0].file)).toMatchObject({ path: 'r.txt', at: item.versions[0].at, backedUp: true })
    expect((await ws.readFile('r.txt')).text).toBe('旧内容')
    // 恢复本身是一次覆盖写，所以「新内容」又成了最新版本
    expect((await ws.listHistory())[0].versions).toHaveLength(2)
  })

  it('历史文件缺失或损坏时报错', async () => {
    await ws.writeFile('g.txt', 'v0')
    await overwrite('g.txt', 'v1')
    const [item] = await ws.listHistory()
    const lost = item.versions[0].file
    await opfs.remove(`.xiyue-history/${lost}`)
    await expect(ws.getHistoryText(lost)).rejects.toThrow(/历史版本不存在或已损坏/)
    await expect(ws.restoreHistory(lost)).rejects.toThrow(/历史版本不存在或已损坏/)
    await opfs.writeText('.xiyue-history/broken.json', 'not json')
    await expect(ws.getHistoryText('broken.json')).rejects.toThrow(/损坏/)
  })

  it('还没有历史目录时读取历史报「还没有历史版本」', async () => {
    await expect(ws.getHistoryText('whatever')).rejects.toThrow(/还没有历史版本/)
  })
})

describe('备份没做成时必须出声', () => {
  let toasts

  beforeEach(() => {
    toasts = []
    globalThis.window.__ui = { showToast: (...args) => toasts.push(args) }
  })

  /** .xiyue-history 被同名文件占住，任何备份都会抛 */
  async function breakHistoryDir() {
    await opfs.resolve('.xiyue-history', { create: true })
  }

  it('历史目录不可写时覆盖仍然成功，但带回 backedUp:false 和原因', async () => {
    await ws.writeFile('x.txt', 'v0')
    await breakHistoryDir()
    clock.advance(1000)
    const res = await ws.writeFile('x.txt', 'v1')
    expect(res).toMatchObject({ created: false, backedUp: false })
    expect(res.backupWarning).toContain('历史目录不可写')
    expect(await opfs.readText('x.txt')).toBe('v1')
    expect(toasts).toHaveLength(1)
    expect(toasts[0][0]).toContain('x.txt 这次覆盖没有生成历史版本：')
    expect(toasts[0][1]).toBe('error')
  })

  it('同一路径一分钟内只提示一次，换路径立刻再提示', async () => {
    await ws.writeFile('x.txt', 'v0')
    await ws.writeFile('y.txt', 'v0')
    await breakHistoryDir()
    clock.advance(1000)
    await ws.writeFile('x.txt', 'v1')
    clock.advance(1000)
    await ws.writeFile('x.txt', 'v2')
    expect(toasts).toHaveLength(1)
    clock.advance(1000)
    await ws.writeFile('y.txt', 'v1')
    expect(toasts).toHaveLength(2)
    expect(toasts[1][0]).toContain('y.txt')
  })

  it('冷却结束后同一路径会再提示一次', async () => {
    await ws.writeFile('x.txt', 'v0')
    await breakHistoryDir()
    clock.advance(1000)
    await ws.writeFile('x.txt', 'v1')
    clock.advance(61 * 1000)
    await ws.writeFile('x.txt', 'v2')
    expect(toasts).toHaveLength(2)
  })

  it('edit 与 append 同样带回备份状态', async () => {
    await ws.writeFile('e.txt', 'aa')
    await ws.writeFile('p.txt', 'aa')
    await breakHistoryDir()
    clock.advance(1000)
    expect(await ws.editFile('e.txt', 'aa', 'bb')).toMatchObject({ replacements: 1, backedUp: false })
    expect(await ws.appendFile('p.txt', 'bb')).toMatchObject({ backedUp: false })
    expect(toasts).toHaveLength(2)
  })

  it('内容完全一样时不需要备份，也不算失败', async () => {
    await ws.writeFile('s.txt', 'same')
    clock.advance(1000)
    expect(await ws.writeFile('s.txt', 'same')).toMatchObject({ backedUp: true, backupWarning: '' })
    expect(toasts).toEqual([])
  })

  it('原内容是二进制时说明「历史版本只存文本」', async () => {
    await opfs.writeText('b.bin', `${String.fromCharCode(0)}${String.fromCharCode(1)}bin`)
    const res = await ws.writeFile('b.bin', 'text')
    expect(res.backedUp).toBe(false)
    expect(res.backupWarning).toContain('二进制')
  })

  it('原内容超过备份上限时说明原因', async () => {
    await opfs.writeText('big.txt', 'x'.repeat(2 * 1024 * 1024 + 8))
    const res = await ws.writeFile('big.txt', 'small')
    expect(res.backedUp).toBe(false)
    expect(res.backupWarning).toContain('不备份')
    expect(await opfs.readText('big.txt')).toBe('small')
  })

  it('新建文件没有旧内容可备份，不会误报', async () => {
    await breakHistoryDir()
    expect(await ws.writeFile('n.txt', 'v0')).toMatchObject({ created: true, backedUp: true, backupWarning: '' })
    expect(toasts).toEqual([])
  })

  it('历史目录正常时备份成功，backedUp 为真', async () => {
    await ws.writeFile('ok.txt', 'v0')
    clock.advance(1000)
    expect(await ws.writeFile('ok.txt', 'v1')).toMatchObject({ backedUp: true, backupWarning: '' })
    expect(toasts).toEqual([])
  })
})

describe('彻底删除时清理历史版本', () => {
  it('purgeTrash 之后该路径的版本与备份文件一起消失', async () => {
    await ws.writeFile('t/a.txt', 'v0')
    await overwrite('t/a.txt', 'v1')
    await overwrite('t/a.txt', 'v2')
    expect((await ws.listHistory())[0].versions).toHaveLength(2)
    const res = await ws.deletePath('t/a.txt')
    expect((await ws.listHistory())[0].versions).toHaveLength(2)
    await ws.purgeTrash(res.trashName)
    expect(await ws.listHistory()).toEqual([])
    expect(await historyFiles()).toEqual([])
  })

  it('删除整个目录时，目录下每个文件的历史都被清理，别的文件不受影响', async () => {
    await ws.writeFile('d/x.txt', 'x0')
    await overwrite('d/x.txt', 'x1')
    await ws.writeFile('d/y.txt', 'y0')
    await overwrite('d/y.txt', 'y1')
    await ws.writeFile('keep/z.txt', 'z0')
    await overwrite('keep/z.txt', 'z1')
    const before = await ws.listHistory()
    expect(before.map(item => item.path)).toEqual(['keep/z.txt', 'd/y.txt', 'd/x.txt'])
    const res = await ws.deletePath('d')
    await ws.purgeTrash(res.trashName)
    expect((await ws.listHistory()).map(item => item.path)).toEqual(['keep/z.txt'])
    expect(await historyFiles()).toHaveLength(1)
  })

  it('只清理删除时刻之前的版本：删除后重建的文件版本必须留下', async () => {
    await ws.writeFile('k.txt', 'v0')
    await overwrite('k.txt', 'v1')
    clock.advance(1000)
    const res = await ws.deletePath('k.txt')
    // 条目还在回收站里，它的历史版本仍可查看
    expect((await ws.listHistory())[0].versions).toHaveLength(1)
    const deletedAt = JSON.parse(await opfs.readText(`.xiyue-trash/${res.trashName}/meta.json`)).at
    await ws.writeFile('k.txt', 'rebuilt')
    await overwrite('k.txt', 'rebuilt again')
    const rebuiltAt = (await ws.listHistory())[0].versions[0].at
    expect(rebuiltAt).toBeGreaterThan(deletedAt)

    await ws.purgeTrash(res.trashName)
    const left = await ws.listHistory()
    expect(left).toHaveLength(1)
    expect(left[0].versions).toHaveLength(1)
    expect(left[0].versions[0].at).toBe(rebuiltAt)
    expect((await ws.getHistoryText(left[0].versions[0].file)).text).toBe('rebuilt')
  })

  it('从回收站恢复条目不清理历史版本', async () => {
    await ws.writeFile('rr.txt', 'v0')
    await overwrite('rr.txt', 'v1')
    const res = await ws.deletePath('rr.txt')
    await ws.restoreTrash(res.trashName)
    expect(await versionCount()).toBe(1)
    expect((await ws.readFile('rr.txt')).text).toBe('v1')
  })

  it('emptyTrash 批量清理所有条目的历史', async () => {
    await ws.writeFile('m/one.txt', 'a0')
    await overwrite('m/one.txt', 'a1')
    await ws.writeFile('two.txt', 'b0')
    await overwrite('two.txt', 'b1')
    await ws.writeFile('other.txt', 'c0')
    await overwrite('other.txt', 'c1')
    await ws.deletePath('m/one.txt')
    await ws.deletePath('two.txt')
    expect(await versionCount()).toBe(3)
    expect((await ws.emptyTrash()).removed).toBe(2)
    expect((await ws.listHistory()).map(item => item.path)).toEqual(['other.txt'])
    expect(await historyFiles()).toHaveLength(1)
  })

  it('cleanupTrash 到期清理时同样带走历史', async () => {
    await ws.writeFile('old.txt', 'v0')
    await overwrite('old.txt', 'v1')
    await ws.deletePath('old.txt')
    clock.advance(31 * 24 * 60 * 60 * 1000)
    expect((await ws.cleanupTrash()).removed).toBe(1)
    expect(await ws.listHistory()).toEqual([])
    expect(await historyFiles()).toEqual([])
  })

  it('旧版扁平条目没有 meta，清理时保留全部历史', async () => {
    await ws.writeFile('f.txt', 'v0')
    await overwrite('f.txt', 'v1')
    await opfs.writeText('.xiyue-trash/2026-01-01T02-03-04-500Z_old.txt', 'legacy')
    expect((await ws.emptyTrash()).removed).toBe(1)
    expect(await versionCount()).toBe(1)
  })

  it('恢复之后再次删除并彻底删除，历史随最后一次删除消失', async () => {
    await ws.writeFile('cycle.txt', 'v0')
    await overwrite('cycle.txt', 'v1')
    const first = await ws.deletePath('cycle.txt')
    await ws.restoreTrash(first.trashName)
    await overwrite('cycle.txt', 'v2')
    // 恢复不带备份，第二次覆盖才产生新版本；彻底删除时两版都早于本次删除时刻
    expect(await versionCount()).toBe(2)
    const second = await ws.deletePath('cycle.txt')
    await ws.purgeTrash(second.trashName)
    expect(await ws.listHistory()).toEqual([])
    expect(await historyFiles()).toEqual([])
  })
})
