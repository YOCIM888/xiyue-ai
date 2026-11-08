// 圈子话题种子与本地查重工具
import { conversationKey } from './conversation'
import { loadTopics } from './storage'

const STOPWORDS = new Set([
  '我们', '你们', '他们', '她们', '这个', '那个', '这些', '那些', '这里', '那里',
  '什么', '怎么', '如何', '为什么', '因为', '所以', '然后', '但是', '而且', '以及',
  '还有', '如果', '应该', '需要', '可以', '可能', '已经', '就是', '还是', '自己',
  '知道', '这样', '时候', '一个', '一些', '一下', '有点', '一点', '没有', '不是',
  '其实', '觉得', '感觉', '现在', '今天', '明天', '昨天', '最近', '比较', '非常',
  '特别', '真的', '一直', '一起', '希望', '想要', '帮我', '告诉', '请问', '谢谢',
  '你好', '能否', '能不能', '是不是', '有没有', '问题', '内容', '东西', '事情',
  '关于', '对于', '以及', '或者', '不过', '只是', '这里', '那里', '一定', '可能',
])

/** 清理聊天正文：去掉附件块、代码、链接、错误提示与 Markdown 符号 */
function cleanChatText(text) {
  return String(text || '')
    .replace(/\[📎 .+?\]\n[\s\S]*?(?=\n\[📎|$)/g, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/❌\s*错误：[^\n]*/g, ' ')
    .replace(/[*_~#>|\[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function messageContent(message) {
  if (!message || typeof message !== 'object') return ''
  let content = typeof message.content === 'string' ? message.content : ''
  if (!content && Array.isArray(message.versions) && message.versions.length) {
    const idx = Math.min(
      Math.max(0, Number(message.activeVersion) || 0),
      message.versions.length - 1
    )
    content = String(message.versions[idx]?.content || '')
  }
  return content
}

function segmentWords(text) {
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter('zh-Hans', { granularity: 'word' })
    const words = []
    for (const part of segmenter.segment(text)) {
      if (part.isWordLike) words.push(part.segment.toLowerCase())
    }
    return words
  }
  // 兜底：中文二元组 + 英文词
  const words = []
  const cjkRuns = text.match(/[\u4e00-\u9fa5]+/g) || []
  for (const run of cjkRuns) {
    for (let i = 0; i < run.length - 1; i += 1) words.push(run.slice(i, i + 2))
  }
  const latin = text.toLowerCase().match(/[a-z][a-z0-9_-]{2,}/g) || []
  words.push(...latin)
  return words
}

function isMeaningfulWord(word) {
  if (!word) return false
  if (STOPWORDS.has(word)) return false
  if (/^[0-9]+$/.test(word)) return false
  if (!/[a-z0-9\u4e00-\u9fa5]/.test(word)) return false
  const isCjk = /[\u4e00-\u9fa5]/.test(word)
  if (!isCjk && word.length < 3) return false
  return word.length >= 2
}

/** 提取关键词（按出现频次排序） */
export function extractKeywords(text, limit = 16) {
  const counts = new Map()
  for (const word of segmentWords(String(text || ''))) {
    if (!isMeaningfulWord(word)) continue
    counts.set(word, (counts.get(word) || 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word]) => word)
}

/**
 * 从最近会话的 v2 分支数据里提取话题种子。
 * 只读 `chat_conv_v2_*`，跳过未迁移的旧键；空分支、空消息、错误消息都会被过滤。
 */
export function collectRecentChatSeeds({
  maxTopics = 6,
  maxMessages = 60,
  maxKeywords = 16,
} = {}) {
  const topics = loadTopics()
  if (!Array.isArray(topics) || !topics.length) return []

  const recentTopics = [...topics]
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, maxTopics)

  const seen = new Set()
  const picked = []

  for (const topic of recentTopics) {
    let conv = null
    try {
      const raw = localStorage.getItem(conversationKey(topic.id))
      if (!raw) continue // 没有 v2 数据就跳过，不回读旧键
      conv = JSON.parse(raw)
    } catch {
      continue
    }
    const branches = Array.isArray(conv?.branches) ? conv.branches : []
    for (const branch of branches) {
      if (!Array.isArray(branch?.messages) || !branch.messages.length) continue // 跳过空分支
      for (const message of branch.messages) {
        if (!message || message.role === 'system') continue
        const text = cleanChatText(messageContent(message))
        if (!text || text === '请继续。' || text.length < 2) continue
        if (seen.has(text)) continue // 分叉复制的相同消息只计一次，避免关键词被放大
        seen.add(text)
        picked.push({ role: message.role, text, ts: Number(message.ts) || 0 })
      }
    }
  }

  picked.sort((a, b) => b.ts - a.ts)
  const recent = picked.slice(0, maxMessages)
  const userMessages = recent.filter(m => m.role === 'user')
  const corpus = userMessages.length >= 5 ? userMessages : recent
  return extractKeywords(corpus.map(m => m.text).join('\n'), maxKeywords)
}

/** 归一化文本用于相似度比较 */
export function normalizeForCompare(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[\s\p{P}\p{S}]/gu, '')
}

function bigrams(text) {
  const normalized = normalizeForCompare(text)
  const set = new Set()
  if (normalized.length === 1) set.add(normalized)
  for (let i = 0; i < normalized.length - 1; i += 1) {
    set.add(normalized.slice(i, i + 2))
  }
  return set
}

/** 字符二元组 Jaccard 相似度（中文友好） */
export function textSimilarity(a, b) {
  const setA = bigrams(a)
  const setB = bigrams(b)
  if (!setA.size || !setB.size) return 0
  let intersection = 0
  for (const gram of setA) {
    if (setB.has(gram)) intersection += 1
  }
  return intersection / (setA.size + setB.size - intersection)
}

function postCompareText(post) {
  const tags = Array.isArray(post?.tags) ? post.tags.join(' ') : ''
  return `${tags} ${post?.content || ''}`
}

/** 判断新帖是否与已有帖子撞题（正文相似或标签高度重合且正文较像） */
export function isDuplicatePost(candidate, others, { threshold = 0.5, tagThreshold = 0.25 } = {}) {
  const base = postCompareText(candidate)
  for (const other of others || []) {
    if (!other || (candidate.id && other.id === candidate.id)) continue
    const similarity = textSimilarity(base, postCompareText(other))
    if (similarity >= threshold) return other

    const tagsA = Array.isArray(candidate?.tags) ? candidate.tags : []
    const tagsB = Array.isArray(other?.tags) ? other.tags : []
    if (tagsA.length && tagsB.length) {
      let common = 0
      for (const tag of tagsA) {
        if (tagsB.includes(tag)) common += 1
      }
      if (common >= 2 && similarity >= tagThreshold) return other
    }
  }
  return null
}

/** 生成给模型看的已有话题摘要 */
export function summarizePost(post, max = 42) {
  const content = String(post?.content || '').replace(/\s+/g, ' ').trim().slice(0, max)
  const tags = Array.isArray(post?.tags) && post.tags.length ? `｜${post.tags.slice(0, 3).join('/')}` : ''
  return `[${post?.category || '未分类'}${tags}] ${content}`
}
