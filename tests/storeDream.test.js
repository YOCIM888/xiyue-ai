// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { kvMock, kvStore, resetKv } from './helpers/kvMemory.js'

vi.mock('../src/utils/kv', async () => (await import('./helpers/kvMemory.js')).kvMock)
// 内置作品正文很长，这里只关心「内置在前、自定义在后」的拼接顺序
vi.mock('../src/services/dream', () => ({
  DREAM_WORKS: [
    { id: 'built-in-1', title: '内置作品一' },
    { id: 'built-in-2', title: '内置作品二' },
  ],
}))

const { useDreamStore } = await import('../src/stores/dream.js')

const SESSIONS_KEY = 'xiyue_dream_sessions'
const CUSTOM_WORKS_KEY = 'xiyue_dream_custom_works'
const FALLBACK = ['先观察周围的情况', '寻找安全的出路', '冷静下来再决定']

const sessions = () => JSON.parse(kvStore.get(SESSIONS_KEY) || 'null')
const customWorks = () => JSON.parse(kvStore.get(CUSTOM_WORKS_KEY) || 'null')
const seedSessions = data => kvStore.set(SESSIONS_KEY, JSON.stringify(data))
const turn = (narrative, extra = {}) => ({ narrative, ts: 1, ...extra })

let toasts

beforeEach(() => {
  resetKv()
  toasts = []
  window.__ui = { showToast: (...args) => toasts.push(args) }
  setActivePinia(createPinia())
})

describe('装载与旧数据迁移', () => {
  it('没有存档时是空会话表，作品列表只有内置的', () => {
    const store = useDreamStore()
    expect(store.sessions).toEqual({})
    expect(store.customWorks).toEqual([])
    expect(store.allWorks.map(w => w.id)).toEqual(['built-in-1', 'built-in-2'])
  })

  it('旧版整段 turns 会被迁成一条 b-main 主线', () => {
    seedSessions({ xingshi: { turns: [turn('第一幕'), turn('第二幕')] } })
    const store = useDreamStore()
    const session = store.sessions.xingshi
    expect(session.version).toBe(2)
    expect(session.branches).toHaveLength(1)
    expect(session.branches[0]).toMatchObject({ id: 'b-main', name: '主线' })
    expect(session.branches[0].turns.map(t => t.narrative)).toEqual(['第一幕', '第二幕'])
    expect(session.activeBranchId).toBe('b-main')
  })

  it('分支缺 id 与名字时按序号补，第一个叫主线', () => {
    seedSessions({ w: { branches: [{ turns: [] }, { turns: [] }] } })
    const store = useDreamStore()
    const [first, second] = store.sessions.w.branches
    expect(first).toMatchObject({ id: 'b-main', name: '主线' })
    expect(second.name).toBe('分支 2')
    expect(second.id.startsWith('branch-')).toBe(true)
  })

  it('存档里的 activeBranchId 已经不存在时退回第一个分支', () => {
    seedSessions({ w: { activeBranchId: 'b-gone', branches: [{ id: 'b-a', turns: [] }, { id: 'b-b', turns: [] }] } })
    const store = useDreamStore()
    expect(store.sessions.w.activeBranchId).toBe('b-a')
  })

  it('没有正文的幕会被丢掉，选项不足三个时用兜底选项补齐', () => {
    seedSessions({
      w: { turns: [{ narrative: '   ' }, turn('留下来的', { options: ['只有一个'] }), '不是对象'] },
    })
    const store = useDreamStore()
    const turns = store.sessions.w.branches[0].turns
    expect(turns).toHaveLength(1)
    expect(turns[0].options).toEqual(['只有一个', FALLBACK[1], FALLBACK[2]])
  })

  it('选项超过三个只留前三个，空白项被丢掉', () => {
    seedSessions({ w: { turns: [turn('一幕', { options: ['a', '  ', 'b', 'c', 'd'] })] } })
    const store = useDreamStore()
    expect(store.sessions.w.branches[0].turns[0].options).toEqual(['a', 'b', 'c'])
  })

  it('分支没有 state 与 summary 时继承最后一幕的', () => {
    seedSessions({
      w: { turns: [turn('早的', { state: { hp: 10 }, summary: '旧摘要' }), turn('晚的', { state: { hp: 3 }, summary: '新摘要' })] },
    })
    const store = useDreamStore()
    expect(store.sessions.w.branches[0].state).toEqual({ hp: 3 })
    expect(store.sessions.w.branches[0].summary).toBe('新摘要')
  })

  it('分支自带 state 时不被最后一幕覆盖', () => {
    seedSessions({
      w: { branches: [{ id: 'b-main', name: '主线', state: { hp: 99 }, summary: '分支自己的', turns: [turn('一幕', { state: { hp: 1 } })] }] },
    })
    const store = useDreamStore()
    expect(store.sessions.w.branches[0].state).toEqual({ hp: 99 })
    expect(store.sessions.w.branches[0].summary).toBe('分支自己的')
  })

  it('旧版会话级的 state 与 summary 迁移时让位给最后一幕', () => {
    seedSessions({ w: { state: { hp: 99 }, summary: '会话级的', turns: [turn('一幕', { state: { hp: 1 }, summary: '幕级的' })] } })
    const store = useDreamStore()
    expect(store.sessions.w.branches[0].state).toEqual({ hp: 1 })
    expect(store.sessions.w.branches[0].summary).toBe('幕级的')
  })

  it('nextBranchNo 至少是分支数加一，存档里更大的值保留', () => {
    seedSessions({ a: { turns: [] }, b: { nextBranchNo: 7, turns: [] } })
    const store = useDreamStore()
    expect(store.sessions.a.nextBranchNo).toBe(2)
    expect(store.sessions.b.nextBranchNo).toBe(7)
  })

  it('存档损坏时退回空表，不抛异常', () => {
    kvStore.set(SESSIONS_KEY, '{坏的')
    expect(useDreamStore().sessions).toEqual({})
    kvStore.set(SESSIONS_KEY, JSON.stringify(['数组也不行']))
    setActivePinia(createPinia())
    expect(useDreamStore().sessions).toEqual({})
  })

  it('自定义作品缺标题、设定或开场的被过滤掉', () => {
    kvStore.set(CUSTOM_WORKS_KEY, JSON.stringify([
      { title: '完整的', setting: '设定', opening: '开场' },
      { title: '缺设定', opening: '开场' },
      { setting: '设定', opening: '开场' },
      '不是对象',
    ]))
    const store = useDreamStore()
    expect(store.customWorks).toHaveLength(1)
    expect(store.customWorks[0]).toMatchObject({
      custom: true,
      title: '完整的',
      mark: '完',
      tag: '自定义 · 抉择叙事',
      description: '设定',
      voice: '紧贴主角视角，克制、写实',
      openingOptions: FALLBACK,
    })
    expect(store.allWorks.map(w => w.title)).toEqual(['内置作品一', '内置作品二', '完整的'])
  })
})

describe('打开作品与推进剧情', () => {
  it('openWork 建一份空会话并选中主线，落盘', () => {
    const store = useDreamStore()
    store.openWork('xingshi')
    expect(store.activeId).toBe('xingshi')
    expect(store.activeBranchId).toBe('b-main')
    expect(store.branches).toHaveLength(1)
    expect(store.turns).toEqual([])
    expect(sessions().xingshi.branches[0].id).toBe('b-main')
  })

  it('再次打开同一个作品不会清掉已有进度', () => {
    seedSessions({ w: { turns: [turn('已经走过的一幕')] } })
    const store = useDreamStore()
    store.openWork('w')
    store.openWork('w')
    expect(store.turns).toHaveLength(1)
  })

  it('addTurn 追加一幕，同时更新分支状态与会话时间', () => {
    const store = useDreamStore()
    store.openWork('w')
    store.addTurn({ narrative: '  新的一幕  ', options: ['a', 'b'], fromChoice: ' 选了 a ', state: { hp: 5 }, summary: '摘要' })
    expect(store.turns).toHaveLength(1)
    expect(store.turns[0]).toMatchObject({ narrative: '新的一幕', options: ['a', 'b'], fromChoice: '选了 a', state: { hp: 5 }, summary: '摘要' })
    expect(store.turns[0].id.startsWith('turn-')).toBe(true)
    expect(store.state).toEqual({ hp: 5 })
    expect(store.summary).toBe('摘要')
    expect(store.lastPlayed('w')).toBeGreaterThan(0)
    expect(sessions().w.branches[0].turns).toHaveLength(1)
  })

  it('addTurn 的选项超过三个只留前三个，且不补兜底选项', () => {
    const store = useDreamStore()
    store.openWork('w')
    store.addTurn({ narrative: '一幕', options: ['a', 'b', 'c', 'd'] })
    expect(store.turns[0].options).toEqual(['a', 'b', 'c'])
    store.addTurn({ narrative: '两幕' })
    expect(store.turns[1].options).toEqual([])
  })

  it('没给 state 与 summary 时保留分支原有的', () => {
    const store = useDreamStore()
    store.openWork('w')
    store.addTurn({ narrative: '一', state: { hp: 1 }, summary: '旧' })
    store.addTurn({ narrative: '二' })
    expect(store.state).toEqual({ hp: 1 })
    expect(store.summary).toBe('旧')
  })

  it('没有打开作品时 addTurn 不动任何数据', () => {
    const store = useDreamStore()
    store.addTurn({ narrative: '写不进去' })
    expect(store.sessions).toEqual({})
    expect(kvStore.has(SESSIONS_KEY)).toBe(false)
  })

  it('计算属性跟着活动分支走', () => {
    seedSessions({
      w: {
        activeBranchId: 'b-two',
        branches: [
          { id: 'b-one', name: '主线', turns: [turn('主线的一幕')], state: { line: 1 }, summary: '主线摘要' },
          { id: 'b-two', name: '分支 2', turns: [turn('分支的一幕')], state: { line: 2 }, summary: '分支摘要' },
        ],
      },
    })
    const store = useDreamStore()
    store.openWork('w')
    expect(store.activeBranch.name).toBe('分支 2')
    expect(store.turns.map(t => t.narrative)).toEqual(['分支的一幕'])
    expect(store.state).toEqual({ line: 2 })
    expect(store.summary).toBe('分支摘要')
  })
})

describe('进度概览', () => {
  it('progressOf 取所有分支里最长的那条', () => {
    seedSessions({
      w: {
        branches: [
          { id: 'b-a', turns: [turn('一')] },
          { id: 'b-b', turns: [turn('一'), turn('二'), turn('三')] },
        ],
      },
    })
    const store = useDreamStore()
    expect(store.progressOf('w')).toBe(3)
  })

  it('progressSummary 取最长那条分支的最后一幕，压掉换行并截到 60 字', () => {
    seedSessions({
      w: {
        branches: [
          { id: 'b-a', turns: [turn('短')] },
          { id: 'b-b', turns: [turn('早的一幕'), turn(`${'长'.repeat(80)}\n还有换行   和空格`)] },
        ],
      },
    })
    const store = useDreamStore()
    const summary = store.progressSummary('w')
    expect(summary).toHaveLength(60)
    expect(summary).not.toContain('\n')
    expect(summary.startsWith('长长长')).toBe(true)
  })

  it('没有会话时进度为 0、摘要为空、lastPlayed 为 0', () => {
    const store = useDreamStore()
    expect(store.progressOf('没有')).toBe(0)
    expect(store.progressSummary('没有')).toBe('')
    expect(store.lastPlayed('没有')).toBe(0)
  })

  it('会话有分支但一幕都没走时摘要是空的', () => {
    const store = useDreamStore()
    store.openWork('w')
    expect(store.progressOf('w')).toBe(0)
    expect(store.progressSummary('w')).toBe('')
  })
})

describe('回溯与分支切换', () => {
  const threeTurns = () => seedSessions({
    w: { turns: [turn('一', { state: { n: 1 } }), turn('二', { state: { n: 2 } }), turn('三', { state: { n: 3 } })] },
  })

  it('rewindTo 派生新分支：只复制到那一幕之前，原分支不动', () => {
    threeTurns()
    const store = useDreamStore()
    store.openWork('w')
    expect(store.rewindTo(2)).toBe(true)
    expect(store.branches).toHaveLength(2)
    expect(store.branches[0].turns).toHaveLength(3)
    expect(store.turns.map(t => t.narrative)).toEqual(['一', '二'])
    expect(store.activeBranch.name).toBe('分支 2')
    expect(store.activeBranchId).toBe(store.branches[1].id)
    // 新分支的状态回到那一幕，而不是原来的结尾
    expect(store.state).toEqual({ n: 2 })
    expect(sessions().w.activeBranchId).toBe(store.branches[1].id)
  })

  it('复制出来的幕是新对象，改新分支不影响原分支', () => {
    threeTurns()
    const store = useDreamStore()
    store.openWork('w')
    store.rewindTo(1)
    store.turns[0].narrative = '被改过的'
    expect(store.branches[0].turns[0].narrative).toBe('一')
  })

  it('连续回溯两次，分支编号接着往上走', () => {
    threeTurns()
    const store = useDreamStore()
    store.openWork('w')
    store.rewindTo(2)
    store.rewindTo(1)
    expect(store.branches.map(b => b.name)).toEqual(['主线', '分支 2', '分支 3'])
    expect(store.turns).toHaveLength(1)
  })

  it('回到第 0 幕会得到一条空分支', () => {
    threeTurns()
    const store = useDreamStore()
    store.openWork('w')
    expect(store.rewindTo(0)).toBe(true)
    expect(store.turns).toEqual([])
    expect(store.state).toEqual({})
  })

  it('下标越界、非法或没有活动会话时返回 false', () => {
    threeTurns()
    const store = useDreamStore()
    store.openWork('w')
    expect(store.rewindTo(3)).toBe(false)
    expect(store.rewindTo(-1)).toBe(false)
    expect(store.rewindTo('abc')).toBe(false)
    expect(store.branches).toHaveLength(1)
    setActivePinia(createPinia())
    expect(useDreamStore().rewindTo(0)).toBe(false)
  })

  it('switchBranch 只认存在的分支，切过去会落盘', () => {
    threeTurns()
    const store = useDreamStore()
    store.openWork('w')
    store.rewindTo(1)
    store.switchBranch('b-main')
    expect(store.activeBranchId).toBe('b-main')
    expect(store.turns).toHaveLength(3)
    expect(sessions().w.activeBranchId).toBe('b-main')
    store.switchBranch('不存在的分支')
    expect(store.activeBranchId).toBe('b-main')
  })
})

describe('重置作品', () => {
  it('resetWork 删掉会话并清空活动状态', () => {
    const store = useDreamStore()
    store.openWork('w')
    store.addTurn({ narrative: '一幕' })
    store.resetWork()
    expect(store.sessions).toEqual({})
    expect(store.activeId).toBe('')
    expect(store.activeBranchId).toBe('')
    expect(store.turns).toEqual([])
    expect(sessions()).toEqual({})
  })

  it('重置别的作品时不动当前活动会话', () => {
    const store = useDreamStore()
    store.openWork('w')
    store.addTurn({ narrative: '一幕' })
    store.resetWork('other')
    expect(store.activeId).toBe('w')
    expect(store.turns).toHaveLength(1)
  })

  it('没有 id 时什么都不做', () => {
    const store = useDreamStore()
    store.resetWork()
    expect(kvStore.has(SESSIONS_KEY)).toBe(false)
  })

  it('loading 只是运行时状态，不落盘', () => {
    const store = useDreamStore()
    store.setLoading(true)
    expect(store.loading).toBe(true)
    store.setLoading('')
    expect(store.loading).toBe(false)
    expect(kvStore.has(SESSIONS_KEY)).toBe(false)
  })
})

describe('自定义作品', () => {
  it('缺标题、设定或开场时提示并返回 null', () => {
    const store = useDreamStore()
    expect(store.createWork({ title: '只有标题' })).toBeNull()
    expect(store.createWork({ title: '  ', setting: '设定', opening: '开场' })).toBeNull()
    expect(toasts.map(t => t[0])).toEqual([
      '作品标题、世界设定和开场剧情不能为空',
      '作品标题、世界设定和开场剧情不能为空',
    ])
    expect(store.customWorks).toEqual([])
  })

  it('补齐默认字段、选项不足三个用兜底补齐，并落盘', () => {
    const store = useDreamStore()
    const work = store.createWork({
      title: '  深海  ',
      setting: '  一座沉在海底的城  ',
      opening: '  舱门开了  ',
      description: '自己的简介',
      mark: '深',
      openingOptions: ['往左'],
    })
    expect(work).toMatchObject({
      custom: true,
      title: '深海',
      mark: '深',
      description: '自己的简介',
      voice: '紧贴主角视角，克制、写实',
      setting: '一座沉在海底的城',
      opening: '舱门开了',
      openingOptions: ['往左', FALLBACK[1], FALLBACK[2]],
    })
    expect(work.id.startsWith('dream-custom-')).toBe(true)
    expect(store.allWorks.map(w => w.title)).toEqual(['内置作品一', '内置作品二', '深海'])
    expect(customWorks()).toHaveLength(1)
  })

  it('没给简介时用世界设定，没给标记时取标题首字', () => {
    const store = useDreamStore()
    const work = store.createWork({ title: '雪原', setting: '一片没有尽头的雪原', opening: '开场' })
    expect(work.mark).toBe('雪')
    expect(work.description).toBe('一片没有尽头的雪原')
  })

  it('简介截到 120 字，标记只取一个字', () => {
    const store = useDreamStore()
    const work = store.createWork({
      title: '长标题',
      setting: '设定',
      opening: '开场',
      description: '字'.repeat(200),
      mark: '标记',
    })
    expect(work.description).toHaveLength(120)
    expect(work.mark).toBe('标')
  })

  it('removeCustomWork 连带删掉它的会话', () => {
    const store = useDreamStore()
    const work = store.createWork({ title: '要删的', setting: '设定', opening: '开场' })
    store.openWork(work.id)
    store.addTurn({ narrative: '一幕' })
    store.removeCustomWork(work.id)
    expect(store.customWorks).toEqual([])
    expect(store.sessions[work.id]).toBeUndefined()
    expect(store.activeId).toBe('')
    expect(customWorks()).toEqual([])
  })

  it('删除别的自定义作品时不动当前会话', () => {
    const store = useDreamStore()
    const first = store.createWork({ title: '一', setting: 's', opening: 'o' })
    const second = store.createWork({ title: '二', setting: 's', opening: 'o' })
    store.openWork(first.id)
    store.removeCustomWork(second.id)
    expect(store.customWorks.map(w => w.title)).toEqual(['一'])
    expect(store.activeId).toBe(first.id)
  })

  it('自定义作品的存档损坏时退回空列表', () => {
    kvStore.set(CUSTOM_WORKS_KEY, '{坏的')
    expect(useDreamStore().customWorks).toEqual([])
  })
})

describe('存储写不进去时', () => {
  it('提示一次本地存储不足，会话本身仍然可用', () => {
    const original = kvMock.setItem
    const store = useDreamStore()
    store.openWork('w')
    kvMock.setItem = () => { throw new Error('QuotaExceededError') }
    try {
      store.addTurn({ narrative: '写不进磁盘的一幕' })
      store.addTurn({ narrative: '再写一次' })
    } finally {
      kvMock.setItem = original
    }
    // 8 秒内只提示一次，别把界面刷满
    expect(toasts.map(t => t[0]).filter(text => text.includes('梦境进度保存失败'))).toHaveLength(1)
    expect(store.turns).toHaveLength(2)
  })
})
