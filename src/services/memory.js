import { sendChatRequest } from './api'

/**
 * 判断用户消息是否是“保存记忆”类指令
 */
export function detectMemoryCommand(text) {
  if (!text) return false
  return /(保存(?:一下)?记忆|存储记忆|存入记忆|写入记忆|添加(?:到)?记忆|记录到记忆|(?:请|帮我|帮忙)?记住(?!了吗|了么|没)|记下来|记一下|帮我记忆)/.test(text)
}

/**
 * 从对话中提炼记忆条目
 * 返回 [{ title, content }]
 */
export async function extractMemoryEntries({
  apiBase,
  apiKey,
  model,
  messages,
  userText,
}) {
  const transcript = (messages || [])
    .slice(-12)
    .map(m => `${m.role === 'user' ? '用户' : 'AI'}：${(m.content || '').slice(0, 500)}`)
    .join('\n')

  const prompt = `你是一个记忆提炼助手。请阅读下面的对话，提炼用户在最后一条指令中要求记住的内容，以及对话中值得长期保留的关键信息（如用户的偏好、事实、目标、约定等）。
要求：
1. 只提炼确实值得长期记住的信息，不要臆造或复述无关内容。
2. 最多输出 3 条，每条单独一行，格式严格为「标题：内容」。
3. 标题不超过 12 个字，内容简洁具体。
4. 如果没有值得保存的信息，只输出：无。
5. 不要输出任何解释、编号或 Markdown 格式。

用户的最新指令：${(userText || '').slice(0, 500)}

对话记录：
${transcript}`

  const controller = new AbortController()
  let output = ''
  await sendChatRequest({
    apiBase,
    apiKey,
    model,
    temperature: 0.2,
    maxTokens: 800,
    topP: 0.9,
    thinkingEnabled: false,
    messages: [{ role: 'user', content: prompt }],
    signal: controller.signal,
    onChunk: ({ text }) => { output += text },
  })

  return parseMemoryOutput(output)
}

/**
 * 解析模型输出为记忆条目
 */
export function parseMemoryOutput(text) {
  const items = []
  const lines = (text || '').split('\n').map(l => l.trim()).filter(Boolean)

  for (const line of lines) {
    if (/^(无|没有|未发现)/.test(line)) continue
    const clean = line
      .replace(/^[-*•]\s*/, '')
      .replace(/^\d+[.、)]\s*/, '')
      .trim()
    if (!clean) continue
    const m = clean.match(/^(.{1,40}?)[：:]\s*(.+)$/)
    if (m) items.push({ title: m[1].trim(), content: m[2].trim() })
  }

  // 模型未按格式输出时，整体作为一条记忆
  if (!items.length) {
    const clean = (text || '').trim()
    if (clean && !/^(无|没有|未发现)/.test(clean)) {
      items.push({ title: '对话记忆', content: clean.slice(0, 1000) })
    }
  }

  return items.slice(0, 3)
}
