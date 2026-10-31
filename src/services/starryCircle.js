import { sendChatRequest } from './api'

const CATEGORIES = [
  '日常', '生活', '艺术', '哲学', '科技', '生物学', '电子',
  '旅行', '音乐', '电影', '读书', '美食', '运动', '摄影', '天文', '心理学',
]

const FALLBACK_COMMENTS = [
  '好喜欢这条动态。',
  '看到这里心情都变好了。',
  '有点被戳到了。',
  '这种日常真好。',
  '我也想去试试。',
]

function shuffle(list) {
  const arr = [...list]
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function pick(list, count) {
  return shuffle(list).slice(0, count)
}

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function extractJSON(text) {
  const clean = String(text || '').replace(/```json/g, '').replace(/```/g, '').trim()
  const start = clean.indexOf('[')
  const end = clean.lastIndexOf(']')
  if (start < 0 || end <= start) throw new Error('无法解析生成内容')
  return JSON.parse(clean.slice(start, end + 1))
}

function resolveFriend(friends, name, excludeId = '') {
  const target = String(name || '').trim()
  const matched = friends.find(f => f.name === target && f.id !== excludeId)
  if (matched) return matched
  const pool = friends.filter(f => f.id !== excludeId)
  const list = pool.length ? pool : friends
  return list[Math.floor(Math.random() * list.length)]
}

function normalizeComment(raw, friends, authorId) {
  const friend = resolveFriend(friends, raw?.author, authorId)
  return {
    id: makeId('comment'),
    authorId: friend.id,
    authorName: friend.name,
    content: String(raw?.content || '').trim().slice(0, 300),
    isUser: false,
    ts: Date.now(),
  }
}

function normalizePost(raw, friends, index) {
  const content = String(raw?.content || '').trim()
  if (!content) return null

  const author = resolveFriend(friends, raw?.author)
  const others = friends.filter(f => f.id !== author.id)
  const rawComments = Array.isArray(raw?.comments) ? raw.comments : []
  const comments = rawComments
    .map(c => normalizeComment(c, friends, author.id))
    .filter(c => c.content)
    .slice(0, 4)

  // 保证每篇帖子至少有 2 条好友评论
  const fillerPool = others.length ? others : friends
  while (comments.length < 2 && fillerPool.length) {
    const friend = fillerPool[comments.length % fillerPool.length]
    comments.push({
      id: makeId('comment'),
      authorId: friend.id,
      authorName: friend.name,
      content: FALLBACK_COMMENTS[Math.floor(Math.random() * FALLBACK_COMMENTS.length)],
      isUser: false,
      ts: Date.now(),
    })
  }

  return {
    id: makeId('post'),
    authorId: author.id,
    authorName: author.name,
    category: String(raw?.category || CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)]),
    content: content.slice(0, 1500),
    comments,
    likes: 2 + Math.floor(Math.random() * 26),
    liked: false,
    ts: Date.now() - index * 60_000,
  }
}

/**
 * 生成圈子动态（好友口吻，含自动评论）
 */
export async function generateCirclePosts({ friends = [], settings, count = 3 }) {
  if (!friends.length) throw new Error('还没有好友，无法生成动态')

  const profiles = friends
    .map(f => `- ${f.name}：${String(f.persona || '').slice(0, 200)}`)
    .join('\n')
  const categoryHint = pick(CATEGORIES, 6).join('、')

  const systemPrompt = `你是「探索星空」社交圈子的内容引擎。请以好友们的第一人称视角，生成 ${count} 条自然、真实、有生活气息的动态。

好友资料：
${profiles}

要求：
1. 每条动态由一位不同好友发布，作者只能是上面列出的好友之一。
2. 话题从这些类别中挑选：${categoryHint}。内容 30-90 字，像真实社交动态，不要像作文或营销文案。
3. 每条动态附带 2-3 条其他好友的评论，评论 10-40 字，符合评论者性格，不要复读原文。
4. 可以用少量表情，但不要堆砌。
5. 严格输出 JSON 数组，不要输出解释、markdown 代码块或多余文字。

JSON 结构：
[{"author":"好友姓名","category":"类别","content":"动态正文","comments":[{"author":"评论好友姓名","content":"评论内容"}]}]`

  let output = ''
  await sendChatRequest({
    apiBase: settings.apiBase,
    apiKey: settings.apiKey,
    model: settings.model,
    temperature: Math.min(Math.max(settings.temperature ?? 0.8, 0.5), 1.1),
    maxTokens: 1200,
    topP: 0.95,
    thinkingEnabled: false,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `现在生成 ${count} 条动态。` },
    ],
    onChunk: (chunk) => {
      if (chunk.type === 'content' && chunk.text) output += chunk.text
    },
  })

  const parsed = extractJSON(output)
  const posts = parsed
    .map((item, index) => normalizePost(item, friends, index))
    .filter(Boolean)
    .slice(0, count)

  if (!posts.length) throw new Error('生成结果为空，请重试')
  return posts
}

/**
 * 用户留言后，由帖子作者回复
 */
export async function generateAuthorReply({ post, friend, userComment, userName, settings }) {
  const systemPrompt = `你是${friend.name}。${String(friend.persona || '').slice(0, 300)}

你刚刚在「探索星空」圈子里发布了动态：
${post.content}

现在好友「${userName}」在这条动态下给你留言了。请以你的身份回复这条留言。
要求：口语化、简短（不超过 80 字）、符合你的性格；只输出回复内容，不要加姓名前缀、引号或解释。`

  let output = ''
  await sendChatRequest({
    apiBase: settings.apiBase,
    apiKey: settings.apiKey,
    model: settings.model,
    temperature: settings.temperature,
    maxTokens: 300,
    topP: 0.9,
    thinkingEnabled: false,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `${userName}的留言：${userComment}` },
    ],
    onChunk: (chunk) => {
      if (chunk.type === 'content' && chunk.text) output += chunk.text
    },
  })

  return output.trim()
}
