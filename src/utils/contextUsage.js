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

/** 内联分段（正文段落 + 思考分段 + 执行链路）的 tokens */
export function estimatePartsTokens(parts = [], options = {}) {
  return parts.reduce((sum, part) => {
    if (!part) return sum
    if (part.type === 'trace') return sum + estimateTraceTokens([part], options)
    if (part.type === 'thinking') {
      return sum + (options.includeThinking === false ? 0 : estimateTokens(part.content))
    }
    return sum + estimateTokens(part.content)
  }, 0)
}

/** 单条消息的 tokens：正文 + 思考 + 工具执行链 + 图片 */
export function estimateMessageTokens(message) {
  if (!message) return 0
  const parts = Array.isArray(message.parts) ? message.parts : []
  const traces = parts.filter(part => part?.type === 'trace')
  const thinkingParts = parts.filter(part => part?.type === 'thinking')
  const partText = parts
    .filter(part => part && part.type !== 'trace' && part.type !== 'thinking')
    .map(part => part.content || '')
    .join('\n')
  const thinkingPartTokens = thinkingParts.reduce((sum, part) => sum + estimateTokens(part.content), 0)
  // 最终正文通常已包含各文字段落，二者取较大值避免重复计算
  let tokens = 4 + Math.max(estimateTokens(message.content), estimateTokens(partText))
  // 顶层 thinking 与最后一个思考分段同源，取较大值避免重复计算
  tokens += Math.max(estimateTokens(message.thinking), thinkingPartTokens)
  // 每轮 trace 的思考是独立历史，逐轮累计；仅与顶层/思考分段完全同源时才去重
  // （最终回答失败回退时，最后一轮 trace 的思考会与顶层 thinking 同文）
  const countedThinking = new Set()
  if (message.thinking) countedThinking.add(message.thinking)
  for (const part of thinkingParts) countedThinking.add(part.content)
  const rounds = parts.length ? traces : (Array.isArray(message.toolTrace) ? message.toolTrace : [])
  tokens += estimateTraceTokens(rounds, { includeThinking: false })
  for (const round of rounds) {
    if (round?.thinking && !countedThinking.has(round.thinking)) tokens += estimateTokens(round.thinking)
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
