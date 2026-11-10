import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { kvStore, resetKv } from './helpers/kvMemory.js'

vi.mock('../src/utils/kv', async () => (await import('./helpers/kvMemory.js')).kvMock)

const { useStarryCircleStore } = await import('../src/stores/starryCircle.js')

const KEY = 'xiyue_starry_circle_posts'
const stored = () => JSON.parse(kvStore.get(KEY) || 'null')
const seed = posts => kvStore.set(KEY, JSON.stringify(posts))
const post = (id, extra = {}) => ({ id, content: `内容 ${id}`, likes: 0, liked: false, comments: [], ...extra })

beforeEach(() => {
  resetKv()
  setActivePinia(createPinia())
})

describe('装载', () => {
  it('init 之前列表是空的，init 之后才读存档', () => {
    seed([post('p1')])
    const store = useStarryCircleStore()
    expect(store.posts).toEqual([])
    store.init()
    expect(store.posts.map(p => p.id)).toEqual(['p1'])
  })

  it('存档损坏或不是数组时退回空列表', () => {
    kvStore.set(KEY, '{坏的')
    const store = useStarryCircleStore()
    store.init()
    expect(store.posts).toEqual([])
  })

  it('没有存档时 init 不写任何东西', () => {
    const store = useStarryCircleStore()
    store.init()
    expect(store.posts).toEqual([])
    expect(kvStore.has(KEY)).toBe(false)
  })
})

describe('addPosts', () => {
  it('新帖子排在前面，空数组不动也不落盘', () => {
    const store = useStarryCircleStore()
    store.init()
    store.addPosts([post('a'), post('b')])
    expect(store.posts.map(p => p.id)).toEqual(['a', 'b'])
    store.addPosts([])
    expect(store.posts).toHaveLength(2)
    expect(stored()).toHaveLength(2)
  })

  it('最多留 60 条，超出的旧帖被挤掉', () => {
    const store = useStarryCircleStore()
    store.init()
    store.addPosts(Array.from({ length: 60 }, (_, i) => post(`old-${i}`)))
    store.addPosts([post('new')])
    expect(store.posts).toHaveLength(60)
    expect(store.posts[0].id).toBe('new')
    expect(store.posts.some(p => p.id === 'old-59')).toBe(false)
    expect(stored()).toHaveLength(60)
  })
})

describe('addUserPost', () => {
  it('空白内容返回 null，不落盘', () => {
    const store = useStarryCircleStore()
    expect(store.addUserPost({ content: '   ' })).toBeNull()
    expect(store.posts).toEqual([])
    expect(kvStore.has(KEY)).toBe(false)
  })

  it('补齐默认字段并标记成自己发的', () => {
    const store = useStarryCircleStore()
    const created = store.addUserPost({ content: '  今天天气不错  ' })
    expect(created).toMatchObject({
      authorId: 'me',
      authorName: '我',
      category: '日常',
      content: '今天天气不错',
      tags: [],
      comments: [],
      likes: 0,
      liked: false,
      isUser: true,
    })
    expect(created.id.startsWith('post-')).toBe(true)
    // store 暴露的是响应式代理，只比 id
    expect(store.posts[0].id).toBe(created.id)
  })

  it('正文截到 1500 字、标签最多 4 个、点赞数取非负整数', () => {
    const store = useStarryCircleStore()
    const created = store.addUserPost({
      authorName: '曦月',
      category: '音乐',
      content: '字'.repeat(2000),
      tags: ['a', 'b', 'c', 'd', 'e'],
      likes: 3.7,
    })
    expect(created.content).toHaveLength(1500)
    expect(created.tags).toEqual(['a', 'b', 'c', 'd'])
    expect(created.likes).toBe(3)
    expect(created.authorName).toBe('曦月')
    expect(created.category).toBe('音乐')
  })

  it('点赞数非法时归零，负数也归零', () => {
    const store = useStarryCircleStore()
    expect(store.addUserPost({ content: '一', likes: 'abc' }).likes).toBe(0)
    expect(store.addUserPost({ content: '二', likes: -5 }).likes).toBe(0)
  })

  it('标签不是数组时当空处理', () => {
    const store = useStarryCircleStore()
    expect(store.addUserPost({ content: '三', tags: '不是数组' }).tags).toEqual([])
  })

  it('写进存档，另一个实例 init 后能读到', () => {
    const store = useStarryCircleStore()
    store.addUserPost({ content: '存下来的' })
    setActivePinia(createPinia())
    const other = useStarryCircleStore()
    other.init()
    expect(other.posts.map(p => p.content)).toEqual(['存下来的'])
  })
})

describe('删除与清空', () => {
  it('removePost 只删指定那条并落盘', () => {
    const store = useStarryCircleStore()
    store.addPosts([post('a'), post('b')])
    store.removePost('a')
    expect(store.posts.map(p => p.id)).toEqual(['b'])
    expect(stored().map(p => p.id)).toEqual(['b'])
  })

  it('removePost 对不存在的 id 不改存档内容', () => {
    const store = useStarryCircleStore()
    store.addPosts([post('a')])
    store.removePost('没有这条')
    expect(store.posts).toHaveLength(1)
  })

  it('clear 连存档键一起删掉', () => {
    const store = useStarryCircleStore()
    store.addPosts([post('a')])
    store.clear()
    expect(store.posts).toEqual([])
    expect(kvStore.has(KEY)).toBe(false)
  })
})

describe('点赞与评论', () => {
  it('toggleLike 来回切，计数不会掉到负数', () => {
    const store = useStarryCircleStore()
    store.addPosts([post('a', { likes: 2 })])
    store.toggleLike('a')
    expect(store.posts[0]).toMatchObject({ liked: true, likes: 3 })
    store.toggleLike('a')
    expect(store.posts[0]).toMatchObject({ liked: false, likes: 2 })
    expect(stored()[0].likes).toBe(2)
  })

  it('点赞数缺失时从 0 起算，取消也不会变负', () => {
    const store = useStarryCircleStore()
    store.addPosts([{ id: 'a', content: 'x' }])
    store.toggleLike('a')
    store.toggleLike('a')
    expect(store.posts[0].likes).toBe(0)
  })

  it('toggleLike 找不到帖子时什么都不做', () => {
    const store = useStarryCircleStore()
    store.addPosts([post('a')])
    store.toggleLike('b')
    expect(store.posts[0].likes).toBe(0)
  })

  it('addComment 追加评论并落盘', () => {
    const store = useStarryCircleStore()
    store.addPosts([post('a')])
    store.addComment('a', { id: 'c1', content: '第一条评论' })
    expect(store.posts[0].comments).toEqual([{ id: 'c1', content: '第一条评论' }])
    expect(stored()[0].comments).toHaveLength(1)
  })

  it('老数据没有 comments 字段时补上数组', () => {
    const store = useStarryCircleStore()
    store.addPosts([{ id: 'a', content: 'x' }])
    store.addComment('a', { content: '补上的' })
    expect(store.posts[0].comments).toEqual([{ content: '补上的' }])
  })

  it('addComment 找不到帖子时不报错', () => {
    const store = useStarryCircleStore()
    store.addComment('不存在', { content: 'x' })
    expect(store.posts).toEqual([])
  })
})

describe('界面状态', () => {
  it('refreshing 与 replyingPostId 只改内存，不落盘', () => {
    const store = useStarryCircleStore()
    store.setRefreshing(true)
    store.setReplying('p1')
    expect(store.refreshing).toBe(true)
    expect(store.replyingPostId).toBe('p1')
    store.setRefreshing(false)
    store.setReplying()
    expect(store.refreshing).toBe(false)
    expect(store.replyingPostId).toBe('')
    expect(kvStore.has(KEY)).toBe(false)
  })
})
