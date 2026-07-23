/**
 * 发送聊天请求 — 支持 OpenAI 兼容 + Ollama 原生格式
 */
export async function sendChatRequest({
  apiBase,
  apiKey,
  model,
  temperature,
  maxTokens,
  topP,
  messages,
  signal,
  onChunk,
  thinkingEnabled,
}) {
  const isOllama = apiBase.includes('/ollama')

  // 转换消息格式：支持图片
  const apiMessages = messages.map(m => {
    if (m.role === 'user' && m.images?.length) {
      // 图片消息
      if (isOllama) {
        return { role: 'user', content: m.content, images: m.images.map(i => i.split(',')[1] || i) }
      } else {
        // OpenAI 视觉格式
        const parts = m.images.map(i => ({ type: 'image_url', image_url: { url: i } }))
        parts.push({ type: 'text', text: m.content })
        return { role: 'user', content: parts }
      }
    }
    return { role: m.role, content: m.content }
  })

  if (isOllama) {
    return ollamaChat({ apiBase, model, temperature, maxTokens, topP, messages: apiMessages, signal, onChunk, thinkingEnabled })
  }
  return openaiChat({ apiBase, apiKey, model, temperature, maxTokens, topP, messages: apiMessages, signal, onChunk, thinkingEnabled })
}

/** OpenAI 兼容格式 (SSE) */
async function openaiChat({ apiBase, apiKey, model, temperature, maxTokens, topP, messages, signal, onChunk, thinkingEnabled }) {
  const url = `${apiBase.replace(/\/+$/, '')}/chat/completions`

  const body = { model, messages, temperature, max_tokens: Math.max(1, Math.min(maxTokens || 4096, 393216)), top_p: topP, stream: true }
  if (model.startsWith('deepseek') || apiBase.includes('deepseek')) {
    body.thinking = { type: thinkingEnabled ? 'enabled' : 'disabled' }
  }
  const headers = { 'Content-Type': 'application/json' }
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`

  const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal })
  if (!resp.ok) throw new Error(await errFromResp(resp))

  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      const t = line.trim()
      if (!t || !t.startsWith('data:')) continue
      const data = t.slice(5).trim()
      if (data === '[DONE]') return
      try {
        const j = JSON.parse(data)
        const delta = j.choices?.[0]?.delta
        if (delta?.reasoning_content) {
          onChunk({ type: 'thinking', text: delta.reasoning_content })
        }
        const c = delta?.content || j.choices?.[0]?.message?.content
        if (c) onChunk({ type: 'content', text: c })
      } catch { /* skip */ }
    }
  }
}

/** Ollama 原生格式 (NDJSON) */
async function ollamaChat({ apiBase, model, temperature, maxTokens, topP, messages, signal, onChunk, thinkingEnabled }) {
  if (location.protocol === 'https:' && location.hostname !== 'localhost') {
    throw new Error('当前为 HTTPS 远程部署，无法访问本地 Ollama。请使用云端 API 模型。')
  }
  // localhost / 127.0.0.1 直连，局域网走 Vite 代理
  const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
  const url = isLocal ? 'http://127.0.0.1:11434/api/chat' : '/ollama-api/chat'

  const body = {
    model,
    messages: messages.map(m => {
      const msg = { role: m.role, content: m.content }
      if (m.images?.length) msg.images = m.images
      return msg
    }),
    stream: true,
    options: { temperature, num_predict: maxTokens, top_p: topP },
  }

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!resp.ok) throw new Error(await errFromResp(resp))

  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let inThink = false
  const TAG_OPEN = '<think>'
  const TAG_CLOSE = '</think>'
  const TAG_OPEN2 = '<thinking>'
  const TAG_CLOSE2 = '</thinking>'

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      const t = line.trim()
      if (!t) continue
      try {
        const j = JSON.parse(t)
        if (j.done) return

        // 新版 Ollama 可能将思考内容放在独立字段
        const think = j.message?.thinking || j.message?.thinking_content
        if (think) onChunk({ type: 'thinking', text: think })

        const c = j.message?.content
        if (!c) continue

        if (!thinkingEnabled) {
          // 思考关闭：全部作为 content
          onChunk({ type: 'content', text: c })
          continue
        }

        // 解析 <think> / <thinking> 标签
        let text = c
        while (text) {
          if (!inThink) {
            let idx = text.indexOf(TAG_OPEN)
            let tagLen = TAG_OPEN.length
            if (idx === -1) {
              idx = text.indexOf(TAG_OPEN2)
              tagLen = TAG_OPEN2.length
            }
            if (idx === -1) { onChunk({ type: 'content', text }); break }
            if (idx > 0) onChunk({ type: 'content', text: text.slice(0, idx) })
            text = text.slice(idx + tagLen)
            inThink = true
          } else {
            let idx = text.indexOf(TAG_CLOSE)
            let tagLen = TAG_CLOSE.length
            if (idx === -1) {
              idx = text.indexOf(TAG_CLOSE2)
              tagLen = TAG_CLOSE2.length
            }
            if (idx === -1) { onChunk({ type: 'thinking', text }); break }
            if (idx > 0) onChunk({ type: 'thinking', text: text.slice(0, idx) })
            text = text.slice(idx + tagLen)
            inThink = false
          }
        }
      } catch { /* skip */ }
    }
  }
}

async function errFromResp(resp) {
  try {
    const t = await resp.text()
    const j = JSON.parse(t)
    return j.error?.message || j.message || `HTTP ${resp.status}`
  } catch {
    return `HTTP ${resp.status}`
  }
}
