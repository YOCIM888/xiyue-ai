// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { kvStore, resetKv } from './helpers/kvMemory.js'

vi.mock('../src/utils/kv', async () => (await import('./helpers/kvMemory.js')).kvMock)

const { useMemoryStore, DEFAULT_MEMORY_ACCESS, DEFAULT_MEMORY_AUTO } = await import('../src/stores/memory.js')

const KEY = 'xiyue_memories'
const ENABLED_KEY = 'xiyue_memory_enabled'
const ACCESS_KEY = 'xiyue_memory_access'
const AUTO_KEY = 'xiyue_memory_auto'

const savedMemories = () => JSON.parse(kvStore.get(KEY) || '[]')
const savedAuto = () => JSON.parse(kvStore.get(AUTO_KEY) || 'null')

beforeEach(() => {
  resetKv()
  setActivePinia(createPinia())
})

describe('装载默认值', () => {
  it('没有存档时：记忆开着、自动沉淀每 10 轮', () => {
    const store = useMemoryStore()
    expect(store.memories).toEqual([])
    expect(store.enabled).toBe(true)
    expect(store.autoEnabled).toBe(DEFAULT_MEMORY_AUTO.enabled)
    expect(store.autoTurns).toBe(10)
  })

  it('跨模块读取权限默认全关：老用户升级后保持原有的模块隔离', () => {
    const store = useMemoryStore()
    expect(store.access).toEqual(DEFAULT_MEMORY_ACCESS)
    expect(Object.values(DEFAULT_MEMORY_ACCESS).every(value => value === false)).toBe(true)
  })

  it('记忆存档不是数组时退化成空列表', () => {
    kvStore.set(KEY, '{"a":1}')
    expect(useMemoryStore().memories).toEqual([])
  })

  it('记忆存档是坏 JSON 时不抛异常', () => {
    kvStore.set(KEY, '[{')
    expect(useMemoryStore().memories).toEqual([])
  })

  it('enabled 只有明确写了 0 才算关', () => {
    kvStore.set(ENABLED_KEY, '0')
    expect(useMemoryStore().enabled).toBe(false)
    kvStore.set(ENABLED_KEY, '1')
    setActivePinia(createPinia())
    expect(useMemoryStore().enabled).toBe(true)
  })

  it('权限存档里非布尔的字段被忽略，其余照收', () => {
    kvStore.set(ACCESS_KEY, JSON.stringify({ circleReadMain: true, friendReadMain: 'yes', groupReadPrivate: 1 }))
    const store = useMemoryStore()
    expect(store.access.circleReadMain).toBe(true)
    expect(store.access.friendReadMain).toBe(false)
    expect(store.access.groupReadPrivate).toBe(false)
    expect(store.access.privateReadGroup).toBe(false)
  })

  it('自动沉淀的轮数会被夹到 2~50，坏值回默认', () => {
    kvStore.set(AUTO_KEY, JSON.stringify({ enabled: false, turns: 999 }))
    let store = useMemoryStore()
    expect(store.autoEnabled).toBe(false)
    expect(store.autoTurns).toBe(50)

    kvStore.set(AUTO_KEY, JSON.stringify({ turns: 0 }))
    setActivePinia(createPinia())
    expect(useMemoryStore().autoTurns).toBe(2)

    kvStore.set(AUTO_KEY, JSON.stringify({ turns: 'abc' }))
    setActivePinia(createPinia())
    store = useMemoryStore()
    expect(store.autoTurns).toBe(10)
  })

  it('自动沉淀存档是坏 JSON 时用默认值', () => {
    kvStore.set(AUTO_KEY, '不是 JSON')
    const store = useMemoryStore()
    expect(store.autoEnabled).toBe(true)
    expect(store.autoTurns).toBe(10)
  })

  it('sorted 按更新时间倒序，且不改动原数组', () => {
    kvStore.set(KEY, JSON.stringify([
      { id: 'a', title: '早', content: '', source: 'manual', createdAt: 1, updatedAt: 10 },
      { id: 'b', title: '晚', content: '', source: 'chat', createdAt: 2, updatedAt: 99 },
    ]))
    const store = useMemoryStore()
    expect(store.sorted.map(m => m.title)).toEqual(['晚', '早'])
    expect(store.memories.map(m => m.title)).toEqual(['早', '晚'])
  })
})

describe('增删改与落盘', () => {
  it('create 补齐 id 与时间戳，空标题落到「未命名记忆」，正文会 trim', async () => {
    const store = useMemoryStore()
    const item = store.create('  ', '  用户喜欢简洁回答  ', 'chat')
    expect(item.id).toMatch(/^mem-/)
    expect(item.title).toBe('未命名记忆')
    expect(item.content).toBe('用户喜欢简洁回答')
    expect(item.source).toBe('chat')
    expect(item.createdAt).toBeGreaterThan(0)
    expect(item.updatedAt).toBe(item.createdAt)
    await nextTick()
    expect(savedMemories()).toHaveLength(1)
    expect(savedMemories()[0].id).toBe(item.id)
  })

  it('source 缺省是 manual', async () => {
    const store = useMemoryStore()
    expect(store.create('标题', '内容').source).toBe('manual')
  })

  it('update 改标题与正文并刷新更新时间，空标题同样落到「未命名记忆」', async () => {
    const store = useMemoryStore()
    const item = store.create('原标题', '原内容')
    await nextTick()
    store.update(item.id, { title: '  ', content: ' 新内容 ' })
    expect(item.title).toBe('未命名记忆')
    expect(item.content).toBe('新内容')
    expect(item.updatedAt).toBeGreaterThanOrEqual(item.createdAt)
    await nextTick()
    expect(savedMemories()[0].content).toBe('新内容')
  })

  it('update 只给一部分字段时，另一部分保持原样', () => {
    const store = useMemoryStore()
    const item = store.create('标题', '内容')
    store.update(item.id, { content: '只改内容' })
    expect(item.title).toBe('标题')
    expect(item.content).toBe('只改内容')
  })

  it('update 不存在的 id 不会新增条目', async () => {
    const store = useMemoryStore()
    store.create('a', 'b')
    store.update('mem-不存在', { title: 'x' })
    await nextTick()
    expect(savedMemories()).toHaveLength(1)
  })

  it('remove 与 removeMany', async () => {
    const store = useMemoryStore()
    const a = store.create('a', '1')
    const b = store.create('b', '2')
    const c = store.create('c', '3')
    store.remove(b.id)
    expect(store.memories.map(m => m.title)).toEqual(['a', 'c'])
    store.removeMany([a.id, c.id])
    expect(store.memories).toEqual([])
    await nextTick()
    expect(savedMemories()).toEqual([])
  })

  it('关掉开关会写回 0', async () => {
    const store = useMemoryStore()
    store.enabled = false
    await nextTick()
    expect(kvStore.get(ENABLED_KEY)).toBe('0')
    store.enabled = true
    await nextTick()
    expect(kvStore.get(ENABLED_KEY)).toBe('1')
  })

  it('改权限会整份写回', async () => {
    const store = useMemoryStore()
    store.access.groupReadPrivate = true
    await nextTick()
    expect(JSON.parse(kvStore.get(ACCESS_KEY))).toEqual({ ...DEFAULT_MEMORY_ACCESS, groupReadPrivate: true })
  })

  it('改自动沉淀配置会写回，轮数照样夹在 2~50', async () => {
    const store = useMemoryStore()
    store.autoEnabled = false
    store.autoTurns = 999
    await nextTick()
    expect(savedAuto()).toEqual({ enabled: false, turns: 50 })
  })

  it('删掉的记忆会从存档里消失', async () => {
    const store = useMemoryStore()
    const item = store.create('a', '1')
    await nextTick()
    store.remove(item.id)
    await nextTick()
    expect(savedMemories()).toEqual([])
  })
})
