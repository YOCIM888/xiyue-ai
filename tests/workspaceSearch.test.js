import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { installOpfs } from './helpers/opfsShim'

let opfs
let ws

beforeEach(async () => {
  opfs = installOpfs()
  vi.resetModules()
  ws = await import('../src/services/workspace.js')
  await ws.writeFile('src/app.js', "import { fmt } from './fmt'\nexport default function main() {\n  return fmt('hello')\n}\n")
  await ws.writeFile('src/fmt.js', 'export function fmt(s) {\n  return `fmt: ${s}`\n}\n')
  await ws.writeFile('src/fmt.test.js', "test('fmt', () => {})\n")
  await ws.writeFile('docs/README.md', '# 使用说明\n\n调用 fmt() 即可。\n')
  await ws.writeFile('upper.txt', 'FMT appears here\n')
  await ws.writeFile('node_modules/left-pad/index.js', 'fmt from dependency\n')
})

afterEach(() => {
  delete globalThis.navigator
  delete globalThis.window
})

describe('searchWorkspace 按文件名', () => {
  it('空关键词不报错也不返回结果', async () => {
    expect(await ws.searchWorkspace('')).toEqual({ results: [], truncated: false })
    expect(await ws.searchWorkspace('   ')).toEqual({ results: [], truncated: false })
  })

  it('命中文件名即可，忽略大小写并带上体积', async () => {
    const { results, truncated } = await ws.searchWorkspace('FMT')
    expect(truncated).toBe(false)
    expect(results.map(item => item.path)).toEqual(['src/fmt.js', 'src/fmt.test.js'])
    expect(results[0]).toMatchObject({ name: 'fmt.js', kind: 'file', size: expect.any(Number) })
    expect(typeof results[0].modified).toBe('number')
  })

  it('目录名命中时只返回目录本身，不连带子文件', async () => {
    expect(await ws.searchWorkspace('src')).toEqual({
      results: [{ name: 'src', kind: 'dir', path: 'src' }],
      truncated: false,
    })
  })

  it('结果目录在前、同类按路径排序', async () => {
    await ws.makeDir('fmt-pack')
    const { results } = await ws.searchWorkspace('fmt')
    expect(results.map(item => `${item.kind}:${item.path}`)).toEqual([
      'dir:fmt-pack', 'file:src/fmt.js', 'file:src/fmt.test.js',
    ])
  })

  it('不搜索回收站与历史目录里的副本', async () => {
    await ws.deletePath('src/fmt.js')
    const { results } = await ws.searchWorkspace('fmt')
    expect(results.map(item => item.path)).toEqual(['src/fmt.test.js'])
  })

  it('超出 limit 或 maxVisited 时标记 truncated', async () => {
    expect(await ws.searchWorkspace('fmt', { limit: 1 })).toMatchObject({ truncated: true })
    expect((await ws.searchWorkspace('fmt', { limit: 1 })).results).toHaveLength(1)
    expect(await ws.searchWorkspace('js', { maxVisited: 2 })).toMatchObject({ truncated: true })
  })
})

describe('searchFiles 按内容', () => {
  it('逐行返回命中位置与高亮区间', async () => {
    const out = await ws.searchFiles({ query: 'fmt' })
    expect(out.filesMatched).toBe(4)
    expect(out.results.every(item => !item.path.startsWith('node_modules/'))).toBe(true)
    const line3 = out.results.find(item => item.path === 'src/app.js' && item.line === 3)
    expect(line3).toMatchObject({ text: "  return fmt('hello')", matched: true, range: { start: 9, end: 12 } })
    expect(out.truncated).toBe(false)
    expect(out.scannedBytes).toBeGreaterThan(0)
  })

  it('默认区分大小写，ignoreCase 才忽略', async () => {
    expect((await ws.searchFiles({ query: 'FMT' })).results.map(item => item.path)).toEqual(['upper.txt'])
    const both = await ws.searchFiles({ query: 'FMT', ignoreCase: true })
    expect(both.filesMatched).toBe(5)
    expect(both.results.some(item => item.path === 'src/fmt.js')).toBe(true)
  })

  it('同一文件的命中数记在 hitCount 上', async () => {
    const out = await ws.searchFiles({ query: 'fmt', path: 'src' })
    const appHits = out.results.filter(item => item.path === 'src/fmt.js')
    expect(appHits).toHaveLength(2)
    expect(appHits.every(item => item.hitCount === 2)).toBe(true)
  })

  it('path 限定子目录，目录不存在或传成文件时报错', async () => {
    expect((await ws.searchFiles({ query: 'fmt', path: 'docs' })).results.map(i => i.path)).toEqual(['docs/README.md'])
    await expect(ws.searchFiles({ query: 'fmt', path: 'nope' })).rejects.toThrow(/目录不存在：nope/)
    await expect(ws.searchFiles({ query: 'fmt', path: 'src/app.js' })).rejects.toThrow(/路径不是目录/)
    await expect(ws.listDir('src/app.js')).rejects.toThrow(/路径不是目录/)
  })

  it('glob 按整路径过滤，** 可以跨目录', async () => {
    const js = await ws.searchFiles({ query: 'fmt', glob: '*.js' })
    expect(js.filesMatched).toBe(3)
    expect(js.results.every(item => item.path.endsWith('.js'))).toBe(true)
    const nested = await ws.searchFiles({ query: 'fmt', glob: '**/fmt*.js' })
    expect([...new Set(nested.results.map(item => item.path))].sort()).toEqual(['src/fmt.js', 'src/fmt.test.js'])
    await ws.writeFile('src/app.ts', 'fmt in typescript\n')
    expect((await ws.searchFiles({ query: 'fmt', glob: 'src/*.ts' })).results.map(i => i.path)).toEqual(['src/app.ts'])
  })

  it('regex 模式按正则匹配，非法正则报错', async () => {
    const out = await ws.searchFiles({ query: '^import', regex: true })
    expect(out.results).toHaveLength(1)
    expect(out.results[0]).toMatchObject({ path: 'src/app.js', line: 1, matched: true })
    await expect(ws.searchFiles({ query: 'fmt(s', regex: true })).rejects.toThrow(/正则表达式无效/)
  })

  it('context 带出上下文行并标记 matched:false', async () => {
    const out = await ws.searchFiles({ query: 'main', path: 'src', context: 1 })
    expect(out.results.map(item => [item.line, item.matched])).toEqual([[1, false], [2, true], [3, false]])
    expect(out.results[0].hitCount).toBe(1)
  })

  it('空搜索词直接报错', async () => {
    await expect(ws.searchFiles({ query: '  ' })).rejects.toThrow(/搜索词不能为空/)
  })

  it('跳过二进制与超过 1 MB 的大文件', async () => {
    await opfs.writeText('raw/data.bin', 'fmt\u0000and more')
    await opfs.writeText('raw/big.js', `fmt\n${'x'.repeat(1024 * 1024 + 10)}`)
    const out = await ws.searchFiles({ query: 'fmt', path: 'raw' })
    expect(out.oversizedSkipped).toBe(1)
    expect(out.results).toEqual([])
    expect(out.visited).toBe(2)
  })

  it('依赖目录整棵跳过', async () => {
    expect((await ws.searchFiles({ query: 'dependency' })).results).toEqual([])
    await opfs.writeText('dist/bundle.js', 'fmt in bundle\n')
    expect((await ws.searchFiles({ query: 'bundle' })).results).toEqual([])
  })

  it('limit 与 maxBytes 触发截断标记', async () => {
    const limited = await ws.searchFiles({ query: 'fmt', limit: 2 })
    expect(limited.results).toHaveLength(2)
    expect(limited.truncated).toBe(true)
    const tiny = await ws.searchFiles({ query: 'fmt', maxBytes: 1 })
    expect(tiny.truncated).toBe(true)
  })

  it('超长行截断到 600 字符，命中内容被截掉时不给区间', async () => {
    await ws.writeFile('long/line.txt', `${'y'.repeat(650)}fmt\n`)
    const [hit] = (await ws.searchFiles({ query: 'fmt', path: 'long' })).results
    expect(hit.text).toHaveLength(601)
    expect(hit.text.endsWith('…')).toBe(true)
    expect(hit.matched).toBe(true)
    expect(hit.range).toBeNull()
  })

  it('CRLF 与无命中文件不干扰结果', async () => {
    await ws.writeFile('crlf/x.txt', 'first\r\nfmt here\r\nlast\r\n')
    const out = await ws.searchFiles({ query: 'fmt', path: 'crlf' })
    expect(out.results[0]).toMatchObject({ line: 2, text: 'fmt here', matched: true })
    expect((await ws.searchFiles({ query: 'zzz-nothing' })).results).toEqual([])
  })
})
