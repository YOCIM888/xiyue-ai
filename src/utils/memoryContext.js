// 记忆读取范围与提示词上下文组装
// 所有读取都经过条数与长度截断，避免把上下文撑爆。

export const MEMORY_LIMITS = {
  mainItems: 8,
  mainItemChars: 180,
  mainTotalChars: 900,
  privateMessages: 12,
  privateMessageChars: 120,
  privateTotalChars: 700,
  groupCount: 2,
  groupMessages: 8,
  groupMessageChars: 120,
  groupTotalChars: 800,
}

function cleanText(value, max) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

/** 主记忆条目 → 带截断的列表文本 */
function buildMemoryBullets(memories) {
  if (!Array.isArray(memories) || !memories.length) return ''
  const items = [...memories]
    .sort((a, b) => (b?.updatedAt || 0) - (a?.updatedAt || 0))
    .slice(0, MEMORY_LIMITS.mainItems)

  const lines = []
  let used = 0
  for (const item of items) {
    const content = cleanText(item?.content, MEMORY_LIMITS.mainItemChars)
    if (!content) continue
    const title = cleanText(item?.title, 24) || '记忆'
    const line = `- ${title}：${content}`
    if (used + line.length + 1 > MEMORY_LIMITS.mainTotalChars) {
      // 至少保留一条，避免开关打开却完全读不到
      if (!lines.length) lines.push(line.slice(0, MEMORY_LIMITS.mainTotalChars))
      break
    }
    lines.push(line)
    used += line.length + 1
  }
  return lines.join('\n')
}

export function buildMainMemorySection(memories) {
  const bullets = buildMemoryBullets(memories)
  if (!bullets) return ''
  return `【长期记忆】\n以下是用户要求你在所有对话中长期记住的信息，请结合这些内容回答，不要遗漏：\n${bullets}`
}

export function buildFriendMemorySection(memories) {
  const bullets = buildMemoryBullets(memories)
  if (!bullets) return ''
  return `【关于用户的长期记忆】\n以下是你已经知道的关于用户的信息。可以自然地参考，不要生硬复述，也不要说明自己在读取记忆：\n${bullets}`
}

export function buildCircleMemorySection(memories) {
  const bullets = buildMemoryBullets(memories)
  if (!bullets) return ''
  return `【用户的长期关注】\n以下是用户长期在意或记录的事情，可作为话题背景自然融入，不要逐条罗列：\n${bullets}`
}

function readChatMessages(starryStore, chatId) {
  if (!starryStore || !chatId) return []
  try {
    const list = starryStore.getMessages(chatId)
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

/** 群聊中看到与该角色的私聊摘要（群聊好友读取私聊记忆） */
function buildPrivateDigestSection(friend, messages) {
  const picked = []
  let used = 0

  for (let i = messages.length - 1; i >= 0 && picked.length < MEMORY_LIMITS.privateMessages; i -= 1) {
    const msg = messages[i]
    if (!msg || msg.role === 'system') continue
    const content = cleanText(msg.content, MEMORY_LIMITS.privateMessageChars)
    if (!content) continue

    let speaker
    if (msg.role === 'user') speaker = '用户'
    else if (msg.senderId === friend.id) speaker = '你'
    else continue

    const line = `${speaker}：${content}`
    if (used + line.length + 1 > MEMORY_LIMITS.privateTotalChars) break
    picked.push(line)
    used += line.length + 1
  }

  if (!picked.length) return ''
  return [
    '【你与用户的私聊记忆】',
    '以下是你在私聊中和用户聊过的内容，可自然参考以保持连贯；不要逐句复述，也不要声称自己查看了聊天记录：',
    ...picked.reverse(),
  ].join('\n')
}

/** 私聊中看到该角色参与过的群聊片段（私聊好友读取群聊记忆） */
function buildGroupDigestSection(friend, starryStore) {
  const groups = Array.isArray(starryStore?.groups) ? starryStore.groups : []
  const joined = groups
    .filter(g => Array.isArray(g?.members) && g.members.includes(friend.id))
    .filter(g => readChatMessages(starryStore, g.id).length > 0)
    .sort((a, b) => (b.lastTs || 0) - (a.lastTs || 0))
    .slice(0, MEMORY_LIMITS.groupCount)

  const blocks = []
  let used = 0

  for (const group of joined) {
    const messages = readChatMessages(starryStore, group.id)
    const lines = []
    for (let i = messages.length - 1; i >= 0 && lines.length < MEMORY_LIMITS.groupMessages; i -= 1) {
      const msg = messages[i]
      if (!msg || msg.role === 'system') continue
      const content = cleanText(msg.content, MEMORY_LIMITS.groupMessageChars)
      if (!content) continue
      const speaker = msg.role === 'user' ? '用户' : (msg.senderName || '群友')
      lines.push(`${speaker}：${content}`)
    }
    if (!lines.length) continue

    const block = [`【${cleanText(group.name, 20) || '群聊'}】`, ...lines.reverse()].join('\n')
    if (used + block.length + 2 > MEMORY_LIMITS.groupTotalChars) break
    blocks.push(block)
    used += block.length + 2
  }

  if (!blocks.length) return ''
  return [
    '【你在群聊中的记忆】',
    '以下是你在群聊里经历过的事情，可在私聊中自然提及；不要逐句复述，也不要声称自己查看了聊天记录：',
    ...blocks,
  ].join('\n')
}

/** 主聊天：仅受主记忆总闸控制 */
export function buildMainChatMemoryContext(memoryStore) {
  if (!memoryStore?.enabled) return ''
  return buildMainMemorySection(memoryStore.memories)
}

/** 圈子：需要主记忆开启且「圈子读取主记忆」开启 */
export function buildCircleMemoryContext(memoryStore) {
  if (!memoryStore?.enabled || !memoryStore.access?.circleReadMain) return ''
  return buildCircleMemorySection(memoryStore.memories)
}

/**
 * 星空角色（私聊 / 群聊）的记忆上下文
 * - friendReadMain：读取主记忆
 * - 群聊中 groupReadPrivate：读取与该角色的私聊摘要
 * - 私聊中 privateReadGroup：读取该角色参与过的群聊摘要
 */
export function buildCharacterMemoryContext({ friend, group = null, memoryStore, starryStore }) {
  if (!friend || !memoryStore) return ''
  const parts = []

  if (memoryStore.enabled && memoryStore.access?.friendReadMain) {
    const section = buildFriendMemorySection(memoryStore.memories)
    if (section) parts.push(section)
  }

  if (group) {
    if (memoryStore.access?.groupReadPrivate) {
      const section = buildPrivateDigestSection(friend, readChatMessages(starryStore, friend.id))
      if (section) parts.push(section)
    }
  } else if (memoryStore.access?.privateReadGroup) {
    const section = buildGroupDigestSection(friend, starryStore)
    if (section) parts.push(section)
  }

  return parts.join('\n\n')
}
