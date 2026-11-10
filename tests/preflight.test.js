import { describe, it, expect, beforeEach, vi } from 'vitest'

const ws = vi.hoisted(() => ({
  status: { mode: 'opfs', folderName: '' },
  entries: [],
  total: 0,
  listCalls: 0,
  listFails: false,
  writeAt: 1,
  readImpl: async () => { throw new Error('不存在') },
}))

vi.mock('../src/services/workspace.js', () => ({
  getWorkspaceStatus: async () => ws.status,
  listDir: async () => {
    ws.listCalls += 1
    if (ws.listFails) throw new Error('工作区不可用')
    return { entries: ws.entries, total: ws.total || ws.entries.length, truncated: false }
  },
  readFile: path => ws.readImpl(path),
  formatBytes: size => `${size} B`,
}))

vi.mock('../src/services/workspaceActivity.js', () => ({
  latestAiWriteAt: () => ws.writeAt,
}))

const { dateLine, refreshPreflightContext, getPreflightContext } = await import('../src/services/preflight.js')

beforeEach(() => {
  ws.status = { mode: 'opfs', folderName: '' }
  ws.entries = []
  ws.total = 0
  ws.listCalls = 0
  ws.listFails = false
  ws.writeAt += 1
  ws.readImpl = async () => { throw new Error('不存在') }
})

describe('dateLine', () => {
  it('给出年月日与星期', () => {
    expect(dateLine(new Date(2026, 10, 10))).toContain('今天是 2026-11-10 周二')
  })
  it('月日补零', () => {
    expect(dateLine(new Date(2026, 0, 5))).toContain('2026-01-05 周一')
  })
})

describe('开工预取内容', () => {
  it('工作模式关闭时只有日期，不扫工作区', async () => {
    const text = await refreshPreflightContext({ workModeEnabled: false })
    expect(text).toContain('【开工前上下文】')
    expect(text).toContain('今天是')
    expect(text).not.toContain('根目录')
    expect(ws.listCalls).toBe(0)
  })

  it('开启搜索时提醒先核实实时信息', async () => {
    const text = await refreshPreflightContext({
      workModeEnabled: false,
      searchSkillEnabled: true,
      tavilyApiKey: 'tvly-x',
    })
    expect(text).toContain('search_web')
  })

  it('工作区是空的时直接说明，不列空标题', async () => {
    const text = await refreshPreflightContext({ workModeEnabled: true })
    expect(text).toContain('根目录是空的')
    expect(text).not.toContain('第一层共 0 项')
  })

  it('列出工作区第一层并提示用工具看完整结构', async () => {
    ws.entries = [
      { name: 'src', kind: 'dir' },
      { name: 'index.html', kind: 'file', size: 640 },
    ]
    ws.total = 2
    const text = await refreshPreflightContext({ workModeEnabled: true })
    expect(text).toContain('  src/（目录）')
    expect(text).toContain('  index.html（640 B）')
    expect(text).toContain('files 的 list / search / find')
  })

  it('超过上限的条目折叠成一句', async () => {
    ws.entries = Array.from({ length: 45 }, (_, i) => ({ name: `f${i}.js`, kind: 'file', size: 1 }))
    ws.total = 45
    const text = await refreshPreflightContext({ workModeEnabled: true })
    expect(text).toContain('另有 5 项未列出')
    expect(text).toContain('f39.js')
    expect(text).not.toContain('f40.js')
  })

  it('挂载本机文件夹时说明范围', async () => {
    ws.status = { mode: 'folder', folderName: 'demo-site' }
    ws.entries = [{ name: 'README.md', kind: 'file', size: 8 }]
    ws.readImpl = async () => ({ text: '只用 pnpm，不要提交 dist。' })
    const text = await refreshPreflightContext({ workModeEnabled: true })
    expect(text).toContain('已挂载本机文件夹「demo-site」')
    expect(text).toContain('项目约定（摘自 README.md')
    expect(text).toContain('只用 pnpm')
  })

  it('约定文件过长只截取开头', async () => {
    ws.entries = [{ name: 'AGENTS.md', kind: 'file', size: 99999 }]
    ws.readImpl = async () => ({ text: 'A'.repeat(2000) })
    const text = await refreshPreflightContext({ workModeEnabled: true })
    expect(text).toContain('A'.repeat(1200))
    expect(text).not.toContain('A'.repeat(1201))
  })

  it('读不到约定文件就跳过，不影响其余内容', async () => {
    ws.entries = [{ name: 'README.md', kind: 'file', size: 8 }]
    const text = await refreshPreflightContext({ workModeEnabled: true })
    expect(text).toContain('今天是')
    expect(text).not.toContain('项目约定')
  })

  it('工作区不可用时退化成只有日期', async () => {
    ws.listFails = true
    const text = await refreshPreflightContext({ workModeEnabled: true })
    expect(text).toContain('今天是')
    expect(text).not.toContain('根目录')
  })
})

describe('快照缓存', () => {
  it('没有新写入时复用快照', async () => {
    ws.entries = [{ name: 'a.js', kind: 'file', size: 1 }]
    ws.writeAt = 100
    await refreshPreflightContext({ workModeEnabled: true })
    const first = ws.listCalls
    ws.writeAt = 100
    await refreshPreflightContext({ workModeEnabled: true })
    expect(ws.listCalls).toBe(first)
  })

  it('AI 写过文件后重新扫描', async () => {
    ws.entries = [{ name: 'a.js', kind: 'file', size: 1 }]
    ws.writeAt = 200
    await refreshPreflightContext({ workModeEnabled: true })
    ws.writeAt = 201
    await refreshPreflightContext({ workModeEnabled: true })
    expect(ws.listCalls).toBe(2)
  })

  it('同步读取快照', async () => {
    ws.writeAt = 300
    await refreshPreflightContext({ workModeEnabled: false })
    expect(getPreflightContext()).toContain('今天是')
  })
})
