// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { kvMock, kvStore, resetKv } from './helpers/kvMemory.js'

vi.mock('../src/utils/kv', async () => (await import('./helpers/kvMemory.js')).kvMock)

const { useStarryStore, DEFAULT_FRIENDS, DEFAULT_GROUP } = await import('../src/stores/starry.js')

const FRIENDS_KEY = 'xiyue_starry_friends'
const GROUPS_KEY = 'xiyue_starry_groups'
const ACTIVE_KEY = 'xiyue_starry_active'
const AVATAR_MIGRATION_KEY = 'xiyue_starry_default_avatars'
const RECENT_LIMIT = 80
const CHUNK = 100

const msgKey = chatId => `xiyue_starry_msgs_${chatId}`
const metaKey = chatId => `${msgKey(chatId)}__meta`
const chunkKey = (chatId, i) => `${msgKey(chatId)}__archive_${i}`
const readJSON = key => JSON.parse(kvStore.get(key) || 'null')
const readMeta = chatId => readJSON(metaKey(chatId))
const readChunk = (chatId, i) => readJSON(chunkKey(chatId, i)) || []

const XIYUE = 'star-friend-xiyue'
const YUNXI = 'star-friend-yunxi'
const CLUB = 'star-group-club'

let toasts

/** 建 store 并跑一次 init，默认数据已播种 */
function boot() {
  const store = useStarryStore()
  store.init()
  return store
}

/** 造一条消息，id 用序号保证可断言 */
function msg(n, extra = {}) {
  return { id: `m-${n}`, role: n % 2 ? 'user' : 'assistant', content: `第 ${n} 条`, ts: n, ...extra }
}

function appendMany(store, chatId, count, from = 1) {
  for (let i = 0; i < count; i += 1) store.appendMessage(msg(from + i), chatId)
}

beforeEach(() => {
  resetKv()
  toasts = []
  window.__ui = { showToast: (...args) => toasts.push(args) }
  setActivePinia(createPinia())
})

describe('首次装载与默认数据', () => {
  it('从未初始化过时播种默认好友与默认群组', () => {
    const store = boot()
    expect(store.friends.map(f => f.id)).toEqual(DEFAULT_FRIENDS.map(f => f.id))
    expect(store.groups).toHaveLength(1)
    expect(store.groups[0]).toMatchObject({ id: CLUB, name: '星空俱乐部', members: DEFAULT_GROUP.members })
    // 播种出来的好友没有 unread / pinned 字段，归一只在读存档时发生
    expect(store.friends[0]).toMatchObject({ lastMessage: '', lastTs: 0 })
    expect(readJSON(FRIENDS_KEY)).toHaveLength(3)
    expect(readJSON(GROUPS_KEY)).toHaveLength(1)
  })

  it('用户把好友删空后刷新不会复活默认数据', () => {
    kvStore.set(FRIENDS_KEY, JSON.stringify([]))
    kvStore.set(GROUPS_KEY, JSON.stringify([]))
    const store = boot()
    expect(store.friends).toEqual([])
    expect(store.groups).toEqual([])
    expect(store.hasData).toBe(false)
    expect(store.activeType).toBe('')
    expect(store.activeId).toBe('')
  })

  it('好友存档损坏时当作从未初始化，重新播种', () => {
    kvStore.set(FRIENDS_KEY, '{坏的')
    const store = boot()
    expect(store.friends.map(f => f.id)).toEqual(DEFAULT_FRIENDS.map(f => f.id))
  })

  it('丢掉没有名字的好友，补齐缺失 id，重复 id 重新分配', () => {
    kvStore.set(FRIENDS_KEY, JSON.stringify([
      { id: 'f1', name: '正常的' },
      { name: '没有 id' },
      { id: 'f1', name: '撞了 id' },
      { id: 'f2', name: '   ' },
      '不是对象',
    ]))
    const store = boot()
    expect(store.friends.map(f => f.name)).toEqual(['正常的', '没有 id', '撞了 id'])
    expect(new Set(store.friends.map(f => f.id)).size).toBe(3)
    expect(store.friends[1].id.startsWith('star-friend-recovered-')).toBe(true)
    expect(store.friends[2].id).not.toBe('f1')
  })

  it('好友字段归一：unread 取非负整数，pinned/fixed 只认真正的 true', () => {
    kvStore.set(FRIENDS_KEY, JSON.stringify([
      { id: 'f1', name: '甲', unread: -3, pinned: 'yes', fixed: 1, persona: 42, avatar: null, lastTs: 'abc' },
    ]))
    const store = boot()
    expect(store.friends[0]).toMatchObject({
      unread: 0, pinned: false, fixed: false, persona: '', avatar: '', lastTs: 0, lastMessage: '',
    })
  })

  it('群组成员只保留还存在的好友并去重，空名群组被丢掉', () => {
    kvStore.set(FRIENDS_KEY, JSON.stringify([{ id: 'f1', name: '甲' }, { id: 'f2', name: '乙' }]))
    kvStore.set(GROUPS_KEY, JSON.stringify([
      { id: 'g1', name: '有效的', members: ['f1', 'f1', 'f2', '查无此人', 42] },
      { id: 'g2', name: '  ', members: ['f1'] },
      { name: '没有 id 的群', members: ['f2'] },
    ]))
    const store = boot()
    expect(store.groups.map(g => g.name)).toEqual(['有效的', '没有 id 的群'])
    expect(store.groups[0].members).toEqual(['f1', 'f2'])
    expect(store.groups[1].id.startsWith('star-group-recovered-')).toBe(true)
  })

  it('默认头像只补一次，补过的存档不再被覆盖', () => {
    kvStore.set(FRIENDS_KEY, JSON.stringify([{ id: XIYUE, name: '曦月', avatar: '' }]))
    const store = boot()
    expect(store.friends[0].avatar).toBe(DEFAULT_FRIENDS[0].avatar)
    expect(kvStore.get(AVATAR_MIGRATION_KEY)).toBe('1')

    store.updateFriend(XIYUE, { avatar: '自己换的' })
    setActivePinia(createPinia())
    const again = boot()
    expect(again.friends[0].avatar).toBe('自己换的')
  })

  it('init 只生效一次，第二次调用不会重载存档', () => {
    const store = boot()
    store.addFriend({ name: '新加的', persona: '' })
    kvStore.set(FRIENDS_KEY, JSON.stringify([]))
    store.init()
    expect(store.friends.map(f => f.name)).toContain('新加的')
  })

  it('存档里的活动会话已经不存在时重选，优先群组', () => {
    kvStore.set(ACTIVE_KEY, JSON.stringify({ type: 'friend', id: '早就删了' }))
    const store = boot()
    expect(store.activeType).toBe('group')
    expect(store.activeId).toBe(CLUB)
    expect(readJSON(ACTIVE_KEY)).toEqual({ type: 'group', id: CLUB })
  })

  it('没有群组时退到第一个好友', () => {
    kvStore.set(FRIENDS_KEY, JSON.stringify([{ id: 'f1', name: '甲' }]))
    kvStore.set(GROUPS_KEY, JSON.stringify([]))
    kvStore.set(ACTIVE_KEY, JSON.stringify({ type: 'group', id: CLUB }))
    const store = boot()
    expect(store.activeType).toBe('friend')
    expect(store.activeId).toBe('f1')
  })

  it('活动会话类型非法时清空再重选', () => {
    kvStore.set(ACTIVE_KEY, JSON.stringify({ type: '别的', id: CLUB }))
    const store = boot()
    expect(store.activeType).toBe('group')
    expect(store.activeId).toBe(CLUB)
  })
})

describe('活动会话与未读', () => {
  it('activeChat 与群组成员跟着活动会话走', () => {
    const store = boot()
    expect(store.activeChat).toMatchObject({ id: CLUB })
    expect(store.groupMembers.map(f => f.id)).toEqual(DEFAULT_GROUP.members)
    store.loadChat('friend', XIYUE)
    expect(store.activeChat).toMatchObject({ id: XIYUE, name: '曦月' })
    expect(store.groupMembers).toEqual([])
  })

  it('loadChat 落盘活动会话并装载它的消息', () => {
    const store = boot()
    store.appendMessage(msg(1), XIYUE)
    store.loadChat('friend', XIYUE)
    expect(readJSON(ACTIVE_KEY)).toEqual({ type: 'friend', id: XIYUE })
    expect(store.messages.map(m => m.id)).toEqual(['m-1'])
    expect(store.activeType).toBe('friend')
  })

  it('loadChat 会把目标会话的未读清零', () => {
    const store = boot()
    store.appendMessage(msg(1), XIYUE)
    store.appendMessage(msg(2), XIYUE)
    expect(store.friends.find(f => f.id === XIYUE).unread).toBe(2)
    store.loadChat('friend', XIYUE)
    expect(store.friends.find(f => f.id === XIYUE).unread).toBe(0)
    expect(readJSON(FRIENDS_KEY).find(f => f.id === XIYUE).unread).toBe(0)
  })

  it('未读认得好友也认得群组，查无此人时不加', () => {
    const store = boot()
    store.appendMessage(msg(1), CLUB)
    store.appendMessage(msg(2), '没有这个人')
    expect(store.groups[0].unread).toBe(1)
    expect(store.friends.every(f => !f.unread)).toBe(true)
  })

  it('markRead 与 togglePin 对不存在的会话不动手', () => {
    const store = boot()
    store.markRead('friend', '没有')
    store.togglePin('group', '没有')
    expect(store.groups[0].pinned).toBeFalsy()
    store.togglePin('group', CLUB)
    expect(store.groups[0].pinned).toBe(true)
    expect(readJSON(GROUPS_KEY)[0].pinned).toBe(true)
    store.togglePin('group', CLUB)
    expect(store.groups[0].pinned).toBe(false)
  })

  it('视图打开时才清未读，关掉时不清', () => {
    const store = boot()
    store.appendMessage(msg(1), CLUB)
    store.setViewActive(false)
    expect(store.groups[0].unread).toBe(1)
    store.setViewActive(true)
    expect(store.viewActive).toBe(true)
    expect(store.groups[0].unread).toBe(0)
  })

  it('getMessages 对活动会话给内存里的，对别的会话直接读存档', () => {
    const store = boot()
    store.appendMessage(msg(1), XIYUE)
    store.appendMessage(msg(2), YUNXI)
    store.loadChat('friend', XIYUE)
    expect(store.getMessages().map(m => m.id)).toEqual(['m-1'])
    expect(store.getMessages(YUNXI).map(m => m.id)).toEqual(['m-2'])
  })
})

describe('消息落盘与预览', () => {
  it('appendMessage 补 id、写进最近窗口，活动会话同步内存', () => {
    const store = boot()
    store.loadChat('friend', XIYUE)
    const saved = store.appendMessage({ role: 'user', content: '没有 id 的一条' })
    expect(saved.id.startsWith('star-msg-')).toBe(true)
    expect(store.messages).toHaveLength(1)
    expect(readJSON(msgKey(XIYUE))).toHaveLength(1)
  })

  it('给了 id 就沿用，不重新生成', () => {
    const store = boot()
    const saved = store.appendMessage(msg(7), XIYUE)
    expect(saved.id).toBe('m-7')
  })

  it('没有活动会话时 appendMessage 返回 null', () => {
    kvStore.set(FRIENDS_KEY, JSON.stringify([]))
    kvStore.set(GROUPS_KEY, JSON.stringify([]))
    const store = boot()
    expect(store.appendMessage(msg(1))).toBeNull()
    expect(store.appendMessage(msg(1), '')).toBeNull()
  })

  it('视图没打开时，连当前会话的消息也累加未读', () => {
    const store = boot()
    store.loadChat('friend', XIYUE)
    store.appendMessage(msg(1), XIYUE)
    expect(store.friends.find(f => f.id === XIYUE).unread).toBe(1)
    store.setViewActive(true)
    store.appendMessage(msg(2), XIYUE)
    expect(store.friends.find(f => f.id === XIYUE).unread).toBe(0)
  })

  it('好友预览用正文，压掉空白并截到 60 字', () => {
    const store = boot()
    store.appendMessage({ role: 'assistant', content: `换行\n和   空格${'长'.repeat(80)}`, ts: 99 }, XIYUE)
    const friend = store.friends.find(f => f.id === XIYUE)
    expect(friend.lastMessage).toHaveLength(60)
    expect(friend.lastMessage.startsWith('换行 和 空格')).toBe(true)
    expect(friend.lastTs).toBe(99)
    expect(readJSON(FRIENDS_KEY).find(f => f.id === XIYUE).lastMessage).toBe(friend.lastMessage)
  })

  it('群组预览给非自己发的消息带上发送者名字', () => {
    const store = boot()
    store.appendMessage({ role: 'assistant', senderName: '茉芸', content: '在的' }, CLUB)
    expect(store.groups[0].lastMessage).toBe('茉芸：在的')
    store.appendMessage({ role: 'user', content: '我自己说的' }, CLUB)
    expect(store.groups[0].lastMessage).toBe('我自己说的')
  })

  it('只有图片没有正文时预览是 [图片]', () => {
    const store = boot()
    store.appendMessage({ role: 'user', images: ['data:1'] }, XIYUE)
    expect(store.friends.find(f => f.id === XIYUE).lastMessage).toBe('[图片]')
  })

  it('消息没带时间戳时用当前时间', () => {
    const store = boot()
    const before = Date.now()
    store.appendMessage({ role: 'user', content: '现在' }, XIYUE)
    expect(store.friends.find(f => f.id === XIYUE).lastTs).toBeGreaterThanOrEqual(before)
  })
})

describe('最近窗口与归档分片', () => {
  it('超过 80 条时最老的溢出到归档，最近窗口只留 80 条', () => {
    const store = boot()
    store.loadChat('friend', XIYUE)
    appendMany(store, XIYUE, RECENT_LIMIT + 5)
    const recent = readJSON(msgKey(XIYUE))
    expect(recent).toHaveLength(RECENT_LIMIT)
    expect(recent[0].id).toBe('m-6')
    expect(recent.at(-1).id).toBe(`m-${RECENT_LIMIT + 5}`)
    expect(readMeta(XIYUE)).toMatchObject({ version: 2, chunks: 1, archived: 5 })
    expect(readChunk(XIYUE, 0).map(m => m.id)).toEqual(['m-1', 'm-2', 'm-3', 'm-4', 'm-5'])
    expect(store.hasOlder).toBe(true)
  })

  it('归档满 100 条就开新的一片，接着往新片里写', () => {
    const store = boot()
    const total = RECENT_LIMIT + CHUNK + 20
    appendMany(store, XIYUE, total)
    const meta = readMeta(XIYUE)
    expect(meta).toMatchObject({ chunks: 2, archived: CHUNK + 20 })
    expect(readChunk(XIYUE, 0)).toHaveLength(CHUNK)
    expect(readChunk(XIYUE, 1)).toHaveLength(20)
    expect(readChunk(XIYUE, 0)[0].id).toBe('m-1')
    expect(readChunk(XIYUE, 1).at(-1).id).toBe(`m-${CHUNK + 20}`)
    expect(readJSON(msgKey(XIYUE))).toHaveLength(RECENT_LIMIT)
  })

  it('旧版整段数组首次读取时拆成最近窗口加归档', () => {
    const legacy = Array.from({ length: 250 }, (_, i) => msg(i + 1))
    kvStore.set(msgKey(XIYUE), JSON.stringify(legacy))
    const store = boot()
    store.loadChat('friend', XIYUE)
    expect(store.messages).toHaveLength(RECENT_LIMIT)
    expect(store.messages[0].id).toBe('m-171')
    const meta = readMeta(XIYUE)
    expect(meta).toMatchObject({ chunks: 2, archived: 170 })
    expect(readChunk(XIYUE, 0)).toHaveLength(CHUNK)
    expect(readChunk(XIYUE, 1)).toHaveLength(70)
    expect(readChunk(XIYUE, 0)[0].id).toBe('m-1')
  })

  it('旧数组不足 80 条时全部留在最近窗口，不开归档', () => {
    kvStore.set(msgKey(XIYUE), JSON.stringify([msg(1), msg(2)]))
    const store = boot()
    store.loadChat('friend', XIYUE)
    expect(store.messages.map(m => m.id)).toEqual(['m-1', 'm-2'])
    expect(readMeta(XIYUE)).toMatchObject({ chunks: 0, archived: 0 })
    expect(store.hasOlder).toBe(false)
  })

  it('已经有 v2 元数据时不再动旧数组', () => {
    kvStore.set(msgKey(XIYUE), JSON.stringify([msg(1)]))
    kvStore.set(metaKey(XIYUE), JSON.stringify({ version: 2, chunks: 0, archived: 0, updatedAt: 1 }))
    const store = boot()
    store.loadChat('friend', XIYUE)
    expect(store.messages.map(m => m.id)).toEqual(['m-1'])
    // 有 v2 元数据就直接返回，不重写 updatedAt，旧数组也不再拆
    expect(readMeta(XIYUE).updatedAt).toBe(1)
  })

  it('元数据版本不对时按旧数组重新迁移', () => {
    kvStore.set(msgKey(XIYUE), JSON.stringify([msg(1), msg(2)]))
    kvStore.set(metaKey(XIYUE), JSON.stringify({ version: 1, chunks: 9 }))
    const store = boot()
    store.loadChat('friend', XIYUE)
    expect(readMeta(XIYUE)).toMatchObject({ version: 2, chunks: 0 })
    expect(store.messages).toHaveLength(2)
  })

  it('getAllMessages 按归档在前、最近在后的顺序拼回全部', () => {
    const store = boot()
    appendMany(store, XIYUE, RECENT_LIMIT + 5)
    const all = store.getAllMessages(XIYUE)
    expect(all).toHaveLength(RECENT_LIMIT + 5)
    expect(all[0].id).toBe('m-1')
    expect(all.at(-1).id).toBe(`m-${RECENT_LIMIT + 5}`)
    expect(all.map(m => m.id)).toEqual(Array.from({ length: RECENT_LIMIT + 5 }, (_, i) => `m-${i + 1}`))
  })

  it('loadOlderMessages 从最新的一片往回读，重复的不再插一遍', () => {
    const store = boot()
    appendMany(store, XIYUE, RECENT_LIMIT + CHUNK + 20)
    store.loadChat('friend', XIYUE)
    expect(store.messages).toHaveLength(RECENT_LIMIT)
    expect(store.hasOlder).toBe(true)

    expect(store.loadOlderMessages()).toBe(20)
    expect(store.messages).toHaveLength(RECENT_LIMIT + 20)
    // 最后一片只装了溢出的 20 条，从它往回读，头部是第 101 条
    expect(store.messages[0].id).toBe(`m-${CHUNK + 1}`)
    expect(store.hasOlder).toBe(true)

    expect(store.loadOlderMessages()).toBe(CHUNK)
    expect(store.messages).toHaveLength(RECENT_LIMIT + CHUNK + 20)
    expect(store.messages[0].id).toBe('m-1')
    expect(store.hasOlder).toBe(false)
    // 读完了再读返回 0，不会重复插
    expect(store.loadOlderMessages()).toBe(0)
    expect(store.messages).toHaveLength(RECENT_LIMIT + CHUNK + 20)
  })

  it('loadOlderMessages 只认当前活动会话', () => {
    const store = boot()
    appendMany(store, XIYUE, RECENT_LIMIT + 5)
    store.loadChat('group', CLUB)
    expect(store.loadOlderMessages(XIYUE)).toBe(0)
    expect(store.loadOlderMessages()).toBe(0)
    expect(store.loadOlderMessages('')).toBe(0)
  })

  it('clearChat 清掉最近窗口、元数据与所有归档片', () => {
    const store = boot()
    store.loadChat('friend', XIYUE)
    appendMany(store, XIYUE, RECENT_LIMIT + CHUNK + 20)
    expect(readChunk(XIYUE, 1)).toHaveLength(20)
    store.clearChat('friend', XIYUE)
    expect(store.messages).toEqual([])
    expect(store.hasOlder).toBe(false)
    expect(kvStore.has(msgKey(XIYUE))).toBe(false)
    expect(kvStore.has(metaKey(XIYUE))).toBe(false)
    expect(kvStore.has(chunkKey(XIYUE, 0))).toBe(false)
    expect(kvStore.has(chunkKey(XIYUE, 1))).toBe(false)
    expect(store.friends.find(f => f.id === XIYUE)).toMatchObject({ lastMessage: '', lastTs: 0 })
  })

  it('清空别的会话时不动当前内存里的消息', () => {
    const store = boot()
    store.loadChat('friend', XIYUE)
    store.appendMessage(msg(1), XIYUE)
    store.clearChat('group', CLUB)
    expect(store.messages).toHaveLength(1)
    expect(store.groups[0]).toMatchObject({ lastMessage: '', lastTs: 0 })
  })
})

describe('删除单条消息', () => {
  it('删最近窗口里的一条，内存与存档同步', () => {
    const store = boot()
    store.loadChat('friend', XIYUE)
    appendMany(store, XIYUE, 3)
    expect(store.deleteMessage('m-2')).toBe(true)
    expect(store.messages.map(m => m.id)).toEqual(['m-1', 'm-3'])
    expect(readJSON(msgKey(XIYUE)).map(m => m.id)).toEqual(['m-1', 'm-3'])
  })

  it('删归档里的一条，archived 计数跟着减', () => {
    const store = boot()
    appendMany(store, XIYUE, RECENT_LIMIT + 5)
    expect(readMeta(XIYUE).archived).toBe(5)
    expect(store.deleteMessage('m-3', XIYUE)).toBe(true)
    expect(readMeta(XIYUE).archived).toBe(4)
    expect(readChunk(XIYUE, 0).map(m => m.id)).toEqual(['m-1', 'm-2', 'm-4', 'm-5'])
    expect(store.getAllMessages(XIYUE).some(m => m.id === 'm-3')).toBe(false)
  })

  it('第二片里的也能删掉', () => {
    const store = boot()
    appendMany(store, XIYUE, RECENT_LIMIT + CHUNK + 20)
    const target = `m-${CHUNK + 5}`
    expect(store.deleteMessage(target, XIYUE)).toBe(true)
    expect(readChunk(XIYUE, 1).some(m => m.id === target)).toBe(false)
    expect(readMeta(XIYUE).archived).toBe(CHUNK + 19)
  })

  it('找不到、缺 id 或缺会话时返回 false', () => {
    const store = boot()
    appendMany(store, XIYUE, 2)
    expect(store.deleteMessage('没有这条', XIYUE)).toBe(false)
    expect(store.deleteMessage('', XIYUE)).toBe(false)
    expect(store.deleteMessage('m-1', '')).toBe(false)
    expect(readJSON(msgKey(XIYUE))).toHaveLength(2)
  })

  it('删的是别的会话时不动当前内存里的消息', () => {
    const store = boot()
    store.loadChat('friend', XIYUE)
    appendMany(store, XIYUE, 2)
    appendMany(store, YUNXI, 2)
    expect(store.deleteMessage('m-1', YUNXI)).toBe(true)
    expect(store.messages.map(m => m.id)).toEqual(['m-1', 'm-2'])
    expect(readJSON(msgKey(YUNXI)).map(m => m.id)).toEqual(['m-2'])
  })
})

describe('跨会话搜索', () => {
  it('大小写不敏感，命中好友也命中群组，按时间倒序', () => {
    const store = boot()
    store.appendMessage({ id: 'a', role: 'user', content: 'Hello World', ts: 10 }, XIYUE)
    store.appendMessage({ id: 'b', role: 'assistant', senderName: '茉芸', content: 'hello there', ts: 30 }, YUNXI)
    store.appendMessage({ id: 'c', role: 'assistant', senderName: '初涵', content: '提到 HELLO 的群消息', ts: 20 }, CLUB)
    store.appendMessage({ id: 'd', role: 'user', content: '无关内容', ts: 40 }, XIYUE)

    const results = store.searchMessages('hello')
    expect(results.map(r => r.messageId)).toEqual(['b', 'c', 'a'])
    expect(results[0]).toMatchObject({ type: 'friend', chatId: YUNXI, chatName: '茉芸', senderName: '茉芸' })
    expect(results[2]).toMatchObject({ senderName: '我', ts: 10 })
    expect(results.find(r => r.messageId === 'c')).toMatchObject({ type: 'group', chatId: CLUB, senderName: '初涵' })
  })

  it('归档里的消息也搜得到', () => {
    const store = boot()
    appendMany(store, XIYUE, RECENT_LIMIT + 5)
    const results = store.searchMessages('第 1 条')
    expect(results.map(r => r.messageId)).toEqual(['m-1'])
    expect(results[0].chatId).toBe(XIYUE)
  })

  it('限制条数，正文截到 120 字', () => {
    const store = boot()
    appendMany(store, XIYUE, 30)
    const results = store.searchMessages('第', 5)
    expect(results).toHaveLength(5)
    // 扫到够数就停，所以拿到的是最先扫到的 5 条排完序，不是全局最新的 5 条
    expect(results.map(r => r.ts)).toEqual([5, 4, 3, 2, 1])
    store.appendMessage({ id: 'long', role: 'user', content: `关键字${'长'.repeat(200)}` }, YUNXI)
    expect(store.searchMessages('关键字')[0].content).toHaveLength(120)
  })

  it('空查询、纯空白查询返回空数组', () => {
    const store = boot()
    appendMany(store, XIYUE, 3)
    expect(store.searchMessages('')).toEqual([])
    expect(store.searchMessages('   ')).toEqual([])
    expect(store.searchMessages()).toEqual([])
    expect(store.searchMessages('搜不到')).toEqual([])
  })

  it('没有正文的消息不会被搜到', () => {
    const store = boot()
    store.appendMessage({ id: 'pic', role: 'user', images: ['data:1'] }, XIYUE)
    expect(store.searchMessages('图')).toEqual([])
  })
})

describe('好友与群组管理', () => {
  it('addFriend 落盘并补默认字段', () => {
    const store = boot()
    const friend = store.addFriend({ name: '  新朋友  ', persona: '  设定  ', avatar: 'a.png' })
    expect(friend).toMatchObject({ name: '新朋友', persona: '设定', avatar: 'a.png', fixed: false })
    expect(friend.id.startsWith('star-friend-custom-')).toBe(true)
    expect(store.friends.at(-1).id).toBe(friend.id)
    expect(readJSON(FRIENDS_KEY).at(-1).name).toBe('新朋友')
  })

  it('updateFriend 改名字与人设，固定角色只让改头像', () => {
    const store = boot()
    const custom = store.addFriend({ name: '可改的', persona: '旧设定' })
    expect(store.updateFriend(custom.id, { name: ' 新名字 ', persona: ' 新设定 ' }))
      .toMatchObject({ name: '新名字', persona: '新设定' })
    const fixed = store.updateFriend(XIYUE, { name: '想改名字', persona: '想改人设', avatar: 'new.png' })
    expect(fixed).toMatchObject({ name: '曦月', avatar: 'new.png' })
    expect(fixed.persona).toBe(DEFAULT_FRIENDS[0].persona)
    expect(store.updateFriend('没有这个人', { name: 'x' })).toBeNull()
  })

  it('removeFriend 连带清聊天记录并从群组成员里移除', () => {
    const store = boot()
    appendMany(store, XIYUE, 3)
    store.removeFriend(XIYUE)
    expect(store.friends.some(f => f.id === XIYUE)).toBe(false)
    expect(store.groups[0].members).toEqual([YUNXI, 'star-friend-chuhan'])
    expect(kvStore.has(msgKey(XIYUE))).toBe(false)
    expect(readJSON(GROUPS_KEY)[0].members).not.toContain(XIYUE)
  })

  it('删掉的是当前会话时重选活动会话并重新装载', () => {
    const store = boot()
    store.loadChat('friend', XIYUE)
    store.appendMessage(msg(1), XIYUE)
    store.removeFriend(XIYUE)
    expect(store.activeId).not.toBe(XIYUE)
    expect(store.activeType).toBe('group')
    expect(store.messages).toEqual([])
    expect(readJSON(ACTIVE_KEY).id).toBe(store.activeId)
  })

  it('删掉的是别的会话时不打断当前会话', () => {
    const store = boot()
    store.loadChat('friend', XIYUE)
    store.appendMessage(msg(1), XIYUE)
    store.removeFriend(YUNXI)
    expect(store.activeId).toBe(XIYUE)
    expect(store.messages).toHaveLength(1)
  })

  it('restoreDefaultFriends 只补缺的，返回补了几个', () => {
    const store = boot()
    store.removeFriend(XIYUE)
    expect(store.restoreDefaultFriends()).toBe(1)
    expect(store.friends.filter(f => f.id === XIYUE)).toHaveLength(1)
    expect(store.friends.find(f => f.id === XIYUE).persona).toBe(DEFAULT_FRIENDS[0].persona)
    expect(store.restoreDefaultFriends()).toBe(0)
  })

  it('createGroup 需要至少一个有效成员，名字为空时用默认名', () => {
    const store = boot()
    expect(store.createGroup({ name: '空群', members: [] })).toBeNull()
    expect(store.createGroup({ name: '空群', members: ['查无此人'] })).toBeNull()
    const group = store.createGroup({ name: '  ', members: [XIYUE, XIYUE, YUNXI, '查无此人'] })
    expect(group).toMatchObject({ name: '星空俱乐部', members: [XIYUE, YUNXI] })
    expect(group.id.startsWith('star-group-')).toBe(true)
    expect(store.groups).toHaveLength(2)
    expect(readJSON(GROUPS_KEY)).toHaveLength(2)
  })

  it('updateGroupMembers 过滤无效成员并去重', () => {
    const store = boot()
    const updated = store.updateGroupMembers(CLUB, [YUNXI, YUNXI, '查无此人'])
    expect(updated.members).toEqual([YUNXI])
    expect(store.updateGroupMembers('没有这个群', [XIYUE])).toBeNull()
  })

  it('removeGroup 清存储，删的是当前会话时重选', () => {
    const store = boot()
    store.appendMessage(msg(1), CLUB)
    store.removeGroup(CLUB)
    expect(store.groups).toEqual([])
    expect(kvStore.has(msgKey(CLUB))).toBe(false)
    expect(store.activeType).toBe('friend')
    expect(store.messages).toEqual([])
    expect(readJSON(ACTIVE_KEY).type).toBe('friend')
  })

  it('删掉不是当前会话的群组时不打断当前会话', () => {
    const store = boot()
    const group = store.createGroup({ name: '另一个群', members: [XIYUE] })
    store.loadChat('friend', XIYUE)
    store.appendMessage(msg(1), XIYUE)
    store.removeGroup(group.id)
    expect(store.activeId).toBe(XIYUE)
    expect(store.messages).toHaveLength(1)
  })

  it('resetRuntime 只清运行时状态，不动数据', () => {
    const store = boot()
    store.sending = true
    store.typingName = '曦月'
    store.generatingChatId = XIYUE
    store.resetRuntime()
    expect(store.sending).toBe(false)
    expect(store.typingName).toBe('')
    expect(store.generatingChatId).toBe('')
    expect(store.friends).toHaveLength(3)
  })
})

describe('存储写不进去时', () => {
  it('提示一次空间不足，内存里的消息仍然可用', () => {
    const original = kvMock.setItem
    const store = boot()
    store.loadChat('friend', XIYUE)
    // 只有聊天记录这条路径包了 try/catch，好友列表的落盘是裸 setItem，别让它把测试炸掉
    kvMock.setItem = (key, value) => {
      if (String(key).startsWith('xiyue_starry_msgs_')) throw new Error('QuotaExceededError')
      original(key, value)
    }
    try {
      store.appendMessage(msg(1), XIYUE)
      store.appendMessage(msg(2), XIYUE)
    } finally {
      kvMock.setItem = original
    }
    // 8 秒内只提示一次，别把界面刷满
    expect(toasts.map(t => t[0]).filter(text => text.includes('星空聊天记录保存失败'))).toHaveLength(1)
    expect(store.messages.map(m => m.id)).toEqual(['m-1', 'm-2'])
  })
})
