import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const FRIENDS_KEY = 'xiyue_starry_friends'
const GROUPS_KEY = 'xiyue_starry_groups'
const ACTIVE_KEY = 'xiyue_starry_active'
const MSG_PREFIX = 'xiyue_starry_msgs_'
const AVATAR_MIGRATION_KEY = 'xiyue_starry_default_avatars'

export const DEFAULT_FRIENDS = [
  {
    id: 'star-friend-xiyue',
    name: '曦月',
    avatar: './image/STAR-XIYUE.jpg',
    persona: '女，25岁音乐家，气质清浅疏离，安静内敛，自带柔和的留白感。共情敏锐，擅长倾听安抚，语调平缓克制，极少流露激烈情绪。外表淡然安静，内心细腻通透，待人有分寸，清冷而非冷漠，温和自持，是安静可靠、能让人放下心绪的治愈型角色。',
    fixed: true,
  },
  {
    id: 'star-friend-yunxi',
    name: '云汐',
    avatar: './image/STAR-YUNXI.jpg',
    persona: '女，29岁白领，从容沉稳，知性通透，自带成熟舒展的御姐气场。学识广博，逻辑清晰，处事冷静理性，谈吐得体克制。情绪稳定松弛，兼具包容力与独立主见，温柔里藏着距离感，清醒有底蕴，优雅不媚俗，擅长客观剖析、理性解惑。',
    fixed: true,
  },
  {
    id: 'star-friend-chuhan',
    name: '初涵',
    avatar: './image/STAE-CHUHAN.jpg',
    persona: '女，19岁学妹，元气灵动，古灵精怪，典型嘴硬心软。爱打趣捉弄人，爱耍小别扭、不服输，表面爱逞强嘴贫，实则心思单纯，很容易心软。鲜活直率，俏皮有度，带着少女的鲜活感，别扭的温柔是她标志性反差。',
    fixed: true,
  },
]

export const DEFAULT_GROUP = {
  id: 'star-group-club',
  name: '星空俱乐部',
  members: ['star-friend-xiyue', 'star-friend-yunxi', 'star-friend-chuhan'],
}

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return fallback
    const data = JSON.parse(raw)
    return data ?? fallback
  } catch {
    return fallback
  }
}

function readMessages(chatId) {
  if (!chatId) return []
  const data = loadJSON(MSG_PREFIX + chatId, [])
  return Array.isArray(data) ? data : []
}

function writeMessages(chatId, list) {
  if (!chatId) return
  try {
    localStorage.setItem(MSG_PREFIX + chatId, JSON.stringify(list))
  } catch {
    /* 存储空间不足时忽略 */
  }
}

function makePreview(content) {
  return (content || '').replace(/\s+/g, ' ').trim().slice(0, 60)
}

let msgSeed = 0
function makeMessageId() {
  msgSeed += 1
  return `star-msg-${Date.now()}-${msgSeed}-${Math.random().toString(36).slice(2, 6)}`
}

export const useStarryStore = defineStore('starry', () => {
  const friends = ref(loadJSON(FRIENDS_KEY, []))
  const groups = ref(loadJSON(GROUPS_KEY, []))

  const activeType = ref('') // 'friend' | 'group' | ''
  const activeId = ref('')
  const messages = ref([])

  const sending = ref(false)
  const typingName = ref('')
  const generatingChatId = ref('')

  let initialized = false

  function persistFriends() {
    localStorage.setItem(FRIENDS_KEY, JSON.stringify(friends.value))
  }
  function persistGroups() {
    localStorage.setItem(GROUPS_KEY, JSON.stringify(groups.value))
  }
  function persistActive() {
    localStorage.setItem(ACTIVE_KEY, JSON.stringify({ type: activeType.value, id: activeId.value }))
  }

  const hasData = computed(() => friends.value.length > 0 || groups.value.length > 0)

  const activeChat = computed(() => {
    if (activeType.value === 'friend') return friends.value.find(f => f.id === activeId.value) || null
    if (activeType.value === 'group') return groups.value.find(g => g.id === activeId.value) || null
    return null
  })

  const activeGroupMembers = computed(() => {
    if (activeType.value !== 'group' || !activeChat.value) return []
    return activeChat.value.members
      .map(id => friends.value.find(f => f.id === id))
      .filter(Boolean)
  })

  const groupMembers = computed(() => activeGroupMembers.value)

  function seedDefaults() {
    const now = Date.now()
    friends.value = DEFAULT_FRIENDS.map(f => ({
      ...f,
      createdAt: now,
      updatedAt: now,
      lastMessage: '',
      lastTs: 0,
    }))
    groups.value = [{
      ...DEFAULT_GROUP,
      members: [...DEFAULT_GROUP.members],
      createdAt: now,
      updatedAt: now,
      lastMessage: '',
      lastTs: 0,
    }]
    persistFriends()
    persistGroups()
  }

  function ensureActive() {
    if (activeType.value === 'friend' && friends.value.some(f => f.id === activeId.value)) return
    if (activeType.value === 'group' && groups.value.some(g => g.id === activeId.value)) return
    if (groups.value.length) {
      activeType.value = 'group'
      activeId.value = groups.value[0].id
    } else if (friends.value.length) {
      activeType.value = 'friend'
      activeId.value = friends.value[0].id
    } else {
      activeType.value = ''
      activeId.value = ''
    }
  }

  function applyDefaultAvatars() {
    if (localStorage.getItem(AVATAR_MIGRATION_KEY) === '1') return
    let changed = false
    friends.value.forEach(f => {
      const def = DEFAULT_FRIENDS.find(d => d.id === f.id)
      if (def?.avatar && !f.avatar) {
        f.avatar = def.avatar
        changed = true
      }
    })
    if (changed) persistFriends()
    localStorage.setItem(AVATAR_MIGRATION_KEY, '1')
  }

  function loadMessages(chatId = activeId.value) {
    messages.value = readMessages(chatId)
  }

  function init() {
    if (initialized) return
    initialized = true

    // 仅在从未初始化过（键不存在）时播种默认数据；删空后刷新不会复活
    if (localStorage.getItem(FRIENDS_KEY) === null) {
      seedDefaults()
    } else {
      friends.value = loadJSON(FRIENDS_KEY, [])
      groups.value = loadJSON(GROUPS_KEY, [])
    }
    applyDefaultAvatars()

    const saved = loadJSON(ACTIVE_KEY, null)
    if (saved && typeof saved === 'object') {
      activeType.value = saved.type === 'friend' || saved.type === 'group' ? saved.type : ''
      activeId.value = typeof saved.id === 'string' ? saved.id : ''
    }
    ensureActive()
    persistActive()
    loadMessages()
  }

  function loadChat(type, id) {
    activeType.value = type
    activeId.value = id
    persistActive()
    loadMessages(id)
  }

  function getMessages(chatId = activeId.value) {
    if (chatId === activeId.value) return messages.value
    return readMessages(chatId)
  }

  function saveMessages() {
    writeMessages(activeId.value, messages.value)
  }

  function touchPreview(chatId, msg) {
    const previewText = msg.content ? makePreview(msg.content) : (msg.images?.length ? '[图片]' : '')
    const friend = friends.value.find(f => f.id === chatId)
    if (friend) {
      friend.lastMessage = previewText
      friend.lastTs = msg.ts || Date.now()
      persistFriends()
      return
    }
    const group = groups.value.find(g => g.id === chatId)
    if (group) {
      const prefix = msg.role === 'user' ? '' : `${msg.senderName}：`
      group.lastMessage = makePreview(prefix + (msg.content || ''))
      group.lastTs = msg.ts || Date.now()
      persistGroups()
    }
  }

  function appendMessage(msg, chatId = activeId.value) {
    if (!chatId) return null
    const full = { ...msg, id: msg.id || makeMessageId() }
    if (chatId === activeId.value) {
      messages.value.push(full)
      saveMessages()
    } else {
      const list = readMessages(chatId)
      list.push(full)
      writeMessages(chatId, list)
    }
    touchPreview(chatId, full)
    return full
  }

  function clearChat(type, id) {
    localStorage.removeItem(MSG_PREFIX + id)
    if (id === activeId.value) messages.value = []
    if (type === 'friend') {
      const f = friends.value.find(x => x.id === id)
      if (f) {
        f.lastMessage = ''
        f.lastTs = 0
        persistFriends()
      }
    } else {
      const g = groups.value.find(x => x.id === id)
      if (g) {
        g.lastMessage = ''
        g.lastTs = 0
        persistGroups()
      }
    }
  }

  function addFriend({ name, persona, avatar = '' }) {
    const now = Date.now()
    const friend = {
      id: `star-friend-custom-${now}`,
      name: name.trim(),
      persona: persona.trim(),
      avatar,
      fixed: false,
      createdAt: now,
      updatedAt: now,
      lastMessage: '',
      lastTs: 0,
    }
    friends.value.push(friend)
    persistFriends()
    return friend
  }

  function updateFriend(id, patch = {}) {
    const f = friends.value.find(x => x.id === id)
    if (!f) return null
    if (!f.fixed) {
      if (patch.name !== undefined) f.name = patch.name.trim()
      if (patch.persona !== undefined) f.persona = patch.persona.trim()
    }
    if (patch.avatar !== undefined) f.avatar = patch.avatar
    f.updatedAt = Date.now()
    persistFriends()
    return f
  }

  function removeFriend(id) {
    friends.value = friends.value.filter(f => f.id !== id)
    persistFriends()
    localStorage.removeItem(MSG_PREFIX + id)

    let groupsChanged = false
    groups.value.forEach(g => {
      if (g.members.includes(id)) {
        g.members = g.members.filter(m => m !== id)
        g.updatedAt = Date.now()
        groupsChanged = true
      }
    })
    if (groupsChanged) persistGroups()

    if (activeType.value === 'friend' && activeId.value === id) {
      ensureActive()
      persistActive()
      loadMessages()
    }
  }

  function restoreDefaultFriends() {
    const now = Date.now()
    let added = 0
    for (const d of DEFAULT_FRIENDS) {
      if (friends.value.some(f => f.id === d.id)) continue
      friends.value.push({
        ...d,
        createdAt: now,
        updatedAt: now,
        lastMessage: '',
        lastTs: 0,
      })
      added += 1
    }
    if (added) persistFriends()
    return added
  }

  function createGroup({ name, members }) {
    const validMembers = [...new Set(members || [])]
      .filter(id => friends.value.some(f => f.id === id))
    if (!validMembers.length) return null
    const now = Date.now()
    const group = {
      id: `star-group-${now}`,
      name: (name || '').trim() || '星空俱乐部',
      members: validMembers,
      createdAt: now,
      updatedAt: now,
      lastMessage: '',
      lastTs: 0,
    }
    groups.value.push(group)
    persistGroups()
    return group
  }

  function updateGroupMembers(id, members) {
    const g = groups.value.find(x => x.id === id)
    if (!g) return null
    g.members = [...new Set(members || [])].filter(mid => friends.value.some(f => f.id === mid))
    g.updatedAt = Date.now()
    persistGroups()
    return g
  }

  function removeGroup(id) {
    groups.value = groups.value.filter(g => g.id !== id)
    persistGroups()
    localStorage.removeItem(MSG_PREFIX + id)
    if (activeType.value === 'group' && activeId.value === id) {
      ensureActive()
      persistActive()
      loadMessages()
    }
  }

  function resetRuntime() {
    sending.value = false
    typingName.value = ''
    generatingChatId.value = ''
  }

  return {
    friends,
    groups,
    activeType,
    activeId,
    messages,
    sending,
    typingName,
    generatingChatId,
    hasData,
    activeChat,
    activeGroupMembers,
    groupMembers,
    init,
    loadChat,
    loadMessages,
    getMessages,
    appendMessage,
    clearChat,
    addFriend,
    updateFriend,
    removeFriend,
    restoreDefaultFriends,
    createGroup,
    updateGroupMembers,
    removeGroup,
    resetRuntime,
  }
})
