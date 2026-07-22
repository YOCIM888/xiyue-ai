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

  if (isOllama) {
    return ollamaChat({ apiBase, model, temperature, maxTokens, topP, messages, signal, onChunk })
  }
  return openaiChat({ apiBase, apiKey, model, temperature, maxTokens, topP, messages, signal, onChunk, thinkingEnabled })
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
async function ollamaChat({ apiBase, model, temperature, maxTokens, topP, messages, signal, onChunk }) {
  if (location.protocol === 'https:' && location.hostname !== 'localhost') {
    throw new Error('当前为 HTTPS 远程部署，无法访问本地 Ollama。请使用云端 API 模型。')
  }
  const url = '/ollama-api/chat'

  const body = {
    model,
    messages: messages.map(m => ({ role: m.role, content: m.content })),
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
        const c = j.message?.content
        if (!c) continue

        // 解析 DeepSeek R1 的 <think>...</think> 标签
        let text = c
        while (text) {
          if (!inThink) {
            const idx = text.indexOf(TAG_OPEN)
            if (idx === -1) { onChunk({ type: 'content', text }); break }
            if (idx > 0) onChunk({ type: 'content', text: text.slice(0, idx) })
            text = text.slice(idx + TAG_OPEN.length)
            inThink = true
          } else {
            const idx = text.indexOf(TAG_CLOSE)
            if (idx === -1) { onChunk({ type: 'thinking', text }); break }
            if (idx > 0) onChunk({ type: 'thinking', text: text.slice(0, idx) })
            text = text.slice(idx + TAG_CLOSE.length)
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
