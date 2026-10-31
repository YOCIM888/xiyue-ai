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

/** 消息列表的总 tokens（含每条消息的基础开销） */
export function estimateMessagesTokens(messages = []) {
  return messages.reduce((sum, m) => {
    if (!m) return sum
    let tokens = 4 + estimateTokens(m.content)
    if (Array.isArray(m.images) && m.images.length) {
      tokens += m.images.length * 800
    }
    return sum + tokens
  }, 0)
}

export function formatTokens(value) {
  return Math.max(0, Math.round(value)).toLocaleString('en-US')
}
