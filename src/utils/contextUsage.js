/**
 * 上下文用量估算
 * 说明：不依赖具体模型的分词器，按中文字符与英文/符号分别折算，
 * 仅用于界面上的用量监控，不会影响实际请求内容。
 */

export function estimateTokens(value) {
  const text = String(value ?? '')
  if (!text) return 0

  let cjk = 0
  let other = 0
  for (const ch of text) {
    const code = ch.codePointAt(0)
    if (
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0x3400 && code <= 0x4dbf) ||
      (code >= 0x3000 && code <= 0x303f) ||
      (code >= 0xff00 && code <= 0xffef)
    ) {
      cjk += 1
    } else {
      other += 1
    }
  }
  return Math.ceil(cjk * 0.75 + other / 4)
}

/** 一轮工具执行链的 tokens（思考、步骤摘要与输出、备注） */
export function estimateTraceTokens(trace = [], { includeThinking = true } = {}) {
  return trace.reduce((sum, round) => {
    if (!round) return sum
    let tokens = 6
    if (includeThinking) tokens += estimateTokens(round.thinking)
    tokens += estimateTokens(round.content)
    for (const step of round.steps || []) {
      tokens += estimateTokens(step?.summary) + estimateTokens(step?.output)
    }
    tokens += estimateTokens((round.notes || []).join('\n'))
    tokens += estimateTokens(round.error)
    return sum + tokens
  }, 0)
}

/** 内联分段（正文段落 + 执行链路）的 tokens */
export function estimatePartsTokens(parts = [], options = {}) {
  return parts.reduce((sum, part) => {
    if (!part) return sum
    if (part.type === 'trace') return sum + estimateTraceTokens([part], options)
    return sum + estimateTokens(part.content)
  }, 0)
}

/** 单条消息的 tokens：正文 + 思考 + 工具执行链 + 图片 */
export function estimateMessageTokens(message) {
  if (!message) return 0
  const parts = Array.isArray(message.parts) ? message.parts : []
  const traces = parts.filter(part => part?.type === 'trace')
  const partText = parts
    .filter(part => part && part.type !== 'trace')
    .map(part => part.content || '')
    .join('\n')
  // 最终正文通常已包含各文字段落，二者取较大值避免重复计算
  let tokens = 4 + Math.max(estimateTokens(message.content), estimateTokens(partText))
  tokens += estimateTokens(message.thinking)
  if (parts.length) {
    // 分段里的每轮 thinking 是累计快照，已有 message.thinking 时不再重复计
    tokens += estimateTraceTokens(traces, { includeThinking: !message.thinking })
  } else if (Array.isArray(message.toolTrace) && message.toolTrace.length) {
    tokens += estimateTraceTokens(message.toolTrace, { includeThinking: !message.thinking })
  }
  if (Array.isArray(message.images) && message.images.length) {
    tokens += message.images.length * 800
  }
  return tokens
}

/** 消息列表的总 tokens（含每条消息的基础开销） */
export function estimateMessagesTokens(messages = []) {
  return messages.reduce((sum, message) => sum + estimateMessageTokens(message), 0)
}

export function formatTokens(value) {
  return Math.max(0, Math.round(value)).toLocaleString('en-US')
}
