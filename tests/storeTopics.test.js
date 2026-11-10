// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { emitRemote, kvStore, resetKv } from './helpers/kvMemory.js'

vi.mock('../src/utils/kv', async () => (await import('./helpers/kvMemory.js')).kvMock)

const { useTopicsStore } = await import('../src/stores/topics.js')
const { KEYS } = await import('../src/utils/storage.js')

/** 直接往存档里塞一份话题列表，模拟「上次退出时的状态」或「另一个标签页写的」 */
function seedTopics(list) {
  kvStore.set(KEYS.TOPICS, JSON.stringify(list))
}

const saved = () => JSON.parse(kvStore.get(KEYS.TOPICS) || '[]')

let toasts

beforeEach(() => {
  resetKv()
  toasts = []
  window.__ui = { showToast: (...args) => toasts.push(args) }
  setActivePinia(createPinia())
})

afterEach(() => {
  delete window.__ui
})

describe('装载与初始化', () => {
  it('存档是空的：没有话题，也没有当前话题', () => {
    const store = useTopicsStore()
    expect(store.topics).toEqual([])
    expect(store.currentTopicId).toBe(null)
    expect(store.currentTopic).toBe(null)
  })

  it('有存档时默认进入最近更新的那个话题', () => {
    seedTopics([
      { id: 1, title: '旧的', pinned: false, createdAt: 1, updatedAt: 10 },
      { id: 2, title: '新的', pinned: false, createdAt: 2, updatedAt: 99 },
    ])
    const store = useTopicsStore()
    expect(store.currentTopicId).toBe(2)
    expect(store.currentTopic.title).toBe('新的')
  })

  it('存档损坏时退化成空列表，不抛异常', () => {
    kvStore.set(KEYS.TOPICS, '{不是 JSON')
    const store = useTopicsStore()
    expect(store.topics).toEqual([])
  })

  it('ensureTopic 只在没有当前话题时补一个', () => {
    const store = useTopicsStore()
    store.ensureTopic()
    expect(store.topics).toHaveLength(1)
    expect(store.currentTopicId).toBe(store.topics[0].id)
    const first = store.topics[0].id
    store.ensureTopic()
    expect(store.topics).toHaveLength(1)
    expect(store.currentTopicId).toBe(first)
  })
})

describe('增删改', () => {
  it('新建话题会选中它并落盘', () => {
    const store = useTopicsStore()
    const topic = store.createTopic('第一个')
    expect(store.currentTopicId).toBe(topic.id)
    expect(saved()).toEqual([expect.objectContaining({ title: '第一个', pinned: false })])
  })

  it('改名、置顶、touch 都写回存档', () => {
    const store = useTopicsStore()
    const topic = store.createTopic()
    store.renameTopic(topic.id, '改过的名字')
    store.togglePin(topic.id)
    expect(saved()[0].title).toBe('改过的名字')
    expect(saved()[0].pinned).toBe(true)
    const before = saved()[0].updatedAt
    store.touchTopic(topic.id)
    expect(saved()[0].updatedAt).toBeGreaterThanOrEqual(before)
  })

  it('对不存在的话题操作不会写坏存档', () => {
    const store = useTopicsStore()
    store.createTopic('保留')
    store.renameTopic(999, '不该出现')
    store.togglePin(999)
    store.touchTopic(999)
    store.deleteTopic(999)
    expect(saved()).toHaveLength(1)
    expect(saved()[0].title).toBe('保留')
  })

  it('置顶的排在前面，其余按更新时间倒序', () => {
    seedTopics([
      { id: 1, title: 'a', pinned: false, createdAt: 1, updatedAt: 30 },
      { id: 2, title: 'b', pinned: true, createdAt: 1, updatedAt: 10 },
      { id: 3, title: 'c', pinned: false, createdAt: 1, updatedAt: 20 },
    ])
    const store = useTopicsStore()
    expect(store.sortedTopics.map(t => t.title)).toEqual(['b', 'a', 'c'])
  })

  it('删掉当前话题后落到列表里剩下的第一个', () => {
    seedTopics([
      { id: 1, title: 'a', pinned: false, createdAt: 1, updatedAt: 30 },
      { id: 2, title: 'b', pinned: false, createdAt: 1, updatedAt: 10 },
    ])
    const store = useTopicsStore()
    expect(store.currentTopicId).toBe(1)
    store.deleteTopic(1)
    expect(store.currentTopicId).toBe(2)
    expect(store.topics.map(t => t.title)).toEqual(['b'])
  })

  it('删掉最后一个话题时当前话题变成 null', () => {
    const store = useTopicsStore()
    const topic = store.createTopic()
    store.deleteTopic(topic.id)
    expect(store.topics).toEqual([])
    expect(store.currentTopicId).toBe(null)
  })

  it('删除话题时连带清掉它的会话数据，新旧两种键都清', () => {
    const store = useTopicsStore()
    const topic = store.createTopic()
    kvStore.set(`chat_conv_v2_${topic.id}`, '{"version":2}')
    kvStore.set(`chat_messages_${topic.id}`, '[]')
    kvStore.set(`chat_conv_v2_999`, '别人的')
    store.deleteTopic(topic.id)
    expect(kvStore.has(`chat_conv_v2_${topic.id}`)).toBe(false)
    expect(kvStore.has(`chat_messages_${topic.id}`)).toBe(false)
    expect(kvStore.get('chat_conv_v2_999')).toBe('别人的')
  })

  it('switchTopic 只换当前话题，不动存档', () => {
    const store = useTopicsStore()
    const a = store.createTopic('a')
    const b = store.createTopic('b')
    store.switchTopic(a.id)
    expect(store.currentTopicId).toBe(a.id)
    expect(saved().map(t => t.title)).toEqual(['a', 'b'])
    expect(b.id).not.toBe(a.id)
  })
})

describe('跨标签同步', () => {
  it('别的标签改了列表就重新装载，不用本标签的旧副本盖回去', () => {
    const store = useTopicsStore()
    store.createTopic('本标签的')
    seedTopics([{ id: 77, title: '另一个标签写的', pinned: false, createdAt: 1, updatedAt: 500 }])
    emitRemote(KEYS.TOPICS)
    expect(store.topics.map(t => t.title)).toEqual(['另一个标签写的'])
    expect(store.currentTopicId).toBe(77)
    expect(toasts).toHaveLength(1)
    expect(toasts[0][0]).toContain('另一个标签页更新了会话列表')
  })

  it('当前话题被别的标签删掉时，落到剩下最新的那个', () => {
    seedTopics([
      { id: 1, title: 'a', pinned: false, createdAt: 1, updatedAt: 30 },
      { id: 2, title: 'b', pinned: false, createdAt: 1, updatedAt: 90 },
    ])
    const store = useTopicsStore()
    expect(store.currentTopicId).toBe(2)
    seedTopics([{ id: 1, title: 'a', pinned: false, createdAt: 1, updatedAt: 30 }])
    emitRemote(KEYS.TOPICS)
    expect(store.currentTopicId).toBe(1)
  })

  it('别的键变了不影响会话列表', () => {
    const store = useTopicsStore()
    store.createTopic('留着')
    emitRemote('ai_chat_settings')
    expect(store.topics.map(t => t.title)).toEqual(['留着'])
    expect(toasts).toHaveLength(0)
  })

  it('键被删掉时不重新装载：那通常是清理动作，不是新列表', () => {
    const store = useTopicsStore()
    store.createTopic('留着')
    emitRemote(KEYS.TOPICS, { removed: true })
    expect(store.topics.map(t => t.title)).toEqual(['留着'])
    expect(toasts).toHaveLength(0)
  })

  it('连续同步只提示一次，别弹一排 toast', () => {
    const store = useTopicsStore()
    store.createTopic('本标签的')
    seedTopics([{ id: 1, title: 'x', pinned: false, createdAt: 1, updatedAt: 1 }])
    emitRemote(KEYS.TOPICS)
    seedTopics([{ id: 2, title: 'y', pinned: false, createdAt: 1, updatedAt: 2 }])
    emitRemote(KEYS.TOPICS)
    expect(store.topics.map(t => t.title)).toEqual(['y'])
    expect(toasts).toHaveLength(1)
  })
})
