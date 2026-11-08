// 主聊天会话数据层 v2：分支 / 多版本消息 / 旧数据迁移
const LEGACY_PREFIX = 'chat_messages_'
const CONV_PREFIX = 'chat_conv_v2_'

let seq = 0

export function newMessageId() {
  seq += 1
  return `m-${Date.now().toString(36)}-${seq.toString(36)}`
}

export function newBranchId() {
  seq += 1
  return `b-${Date.now().toString(36)}-${seq.toString(36)}`
}

export function conversationKey(topicId) {
  return `${CONV_PREFIX}${topicId}`
}

export function legacyKey(topicId) {
  return `${LEGACY_PREFIX}${topicId}`
}

export function createConversation() {
  const main = {
    id: 'b-main',
    name: '主线',
    parentId: null,
    forkOf: null,
    createdAt: Date.now(),
    messages: [],
  }
  return { version: 2, activeBranchId: main.id, nextBranchNo: 2, branches: [main] }
}

function normalizeMessage(input, fallbackId) {
  const msg = { ...input }
  if (!msg.id) msg.id = fallbackId || newMessageId()
  if (!msg.ts) msg.ts = Date.now()
  if (typeof msg.content !== 'string') msg.content = String(msg.content ?? '')

  if (Array.isArray(msg.versions) && msg.versions.length) {
    const max = msg.versions.length - 1
    const idx = Math.min(Math.max(0, Number(msg.activeVersion) || 0), max)
    msg.activeVersion = idx
    const v = msg.versions[idx] || {}
    if (typeof v.content === 'string') msg.content = v.content
    msg.thinking = v.thinking
  } else {
    delete msg.versions
    delete msg.activeVersion
  }
  return msg
}

export function normalizeConversation(obj) {
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.branches) || !obj.branches.length) {
    return createConversation()
  }
  const branches = obj.branches.map((b, i) => {
    const bid = b.id || (i === 0 ? 'b-main' : `b-${i}`)
    return {
      id: bid,
      name: b.name || (i === 0 ? '主线' : `分支 ${i + 1}`),
      parentId: b.parentId ?? null,
      forkOf: b.forkOf ?? null,
      createdAt: b.createdAt || Date.now(),
      messages: Array.isArray(b.messages)
        ? b.messages.map((m, mi) => normalizeMessage(m, `${bid}-m${mi}`))
        : [],
    }
  })
  const activeBranchId = branches.some(b => b.id === obj.activeBranchId)
    ? obj.activeBranchId
    : branches[0].id
  return {
    version: 2,
    activeBranchId,
    nextBranchNo: Number(obj.nextBranchNo) || branches.length + 1,
    branches,
  }
}

/**
 * 读取会话：优先 v2；没有则把旧版数组迁移成 v2（旧键保持不动，可回退）。
 */
export function loadConversation(topicId) {
  if (!topicId) return createConversation()
  try {
    const raw = localStorage.getItem(conversationKey(topicId))
    if (raw) return normalizeConversation(JSON.parse(raw))
  } catch {
    // v2 数据损坏时继续尝试旧数据
  }
  try {
    const legacy = localStorage.getItem(legacyKey(topicId))
    if (legacy) {
      const list = JSON.parse(legacy)
      if (Array.isArray(list)) {
        const conv = createConversation()
        // 用确定性 id，保证搜索跳转与迁移后读到的是同一条消息
        conv.branches[0].messages = list.map((m, i) => normalizeMessage(m, `legacy-${topicId}-${i}`))
        return conv
      }
    }
  } catch {
    // 旧数据不可读时返回空会话
  }
  return createConversation()
}

export function saveConversation(topicId, conv) {
  if (!topicId || !conv) return
  localStorage.setItem(conversationKey(topicId), JSON.stringify(conv))
}

export function hasStoredConversation(topicId) {
  return localStorage.getItem(conversationKey(topicId)) !== null
}

export function hasLegacyConversation(topicId) {
  return localStorage.getItem(legacyKey(topicId)) !== null
}

/**
 * 复制分支历史（含 upToIndex），重新分配消息 id，最后一条标记来源消息 id。
 */
export function cloneMessagesForFork(messages, upToIndex, sourceMessageId) {
  return messages.slice(0, upToIndex + 1).map((m, i, arr) => {
    const copy = JSON.parse(JSON.stringify(m))
    copy.id = newMessageId()
    if (i === arr.length - 1) copy.forkedFrom = sourceMessageId || m.id
    return copy
  })
}
