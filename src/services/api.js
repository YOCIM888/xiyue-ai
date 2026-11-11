/**
 * 发送聊天请求 — 支持 OpenAI 兼容 + Ollama 原生格式
 */
export async function sendChatRequest({
  apiBase,
  apiKey,
  model,
  temperature,
  maxTokens,
  contextLength,
  topP,
  messages,
  signal,
  onChunk,
  thinkingEnabled,
  reasoningEffort,
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
    return ollamaChat({ apiBase, model, temperature, maxTokens, contextLength, topP, messages: apiMessages, signal, onChunk, thinkingEnabled })
  }
  return openaiChat({ apiBase, apiKey, model, temperature, maxTokens, topP, messages: apiMessages, signal, onChunk, thinkingEnabled, reasoningEffort })
}

/** OpenAI 兼容格式 (SSE) */
async function openaiChat({ apiBase, apiKey, model, temperature, maxTokens, topP, messages, signal, onChunk, thinkingEnabled, reasoningEffort }) {
  const url = chatCompletionsUrl(apiBase)
  const isBigModel = /open\.bigmodel\.cn|api\.z\.ai/i.test(String(apiBase || ''))
  // 智谱参数范围与 OpenAI 不同：temperature 0~1，max_tokens 上限 128K
  const safeTemperature = isBigModel ? Math.max(0, Math.min(temperature ?? 1, 1)) : temperature
  const safeMaxTokens = isBigModel
    ? Math.max(1, Math.min(maxTokens || 4096, 131072))
    : Math.max(1, Math.min(maxTokens || 4096, 393216))
  const safeTopP = isBigModel ? Math.max(0.01, Math.min(topP ?? 0.95, 1)) : topP

  const body = {
    model,
    messages,
    temperature: safeTemperature,
    max_tokens: safeMaxTokens,
    top_p: safeTopP,
    stream: true,
    stream_options: { include_usage: true },
  }
  if (model.startsWith('deepseek') || apiBase.includes('deepseek')) {
    body.thinking = { type: thinkingEnabled ? 'enabled' : 'disabled' }
  } else if (thinkingEnabled && reasoningEffort && reasoningEffort !== 'default') {
    body.reasoning_effort = reasoningEffort
  }
  const headers = { 'Content-Type': 'application/json' }
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`

  const send = () => fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal })
  let resp = await send()
  // 少数中转服务不认识 stream_options / reasoning_effort，去掉后重试一次，避免整个请求失败
  if (!resp.ok && resp.status === 400) {
    const detail = await resp.clone().text().catch(() => '')
    let retried = false
    if (/stream_options/i.test(detail) && 'stream_options' in body) {
      delete body.stream_options
      retried = true
    }
    if (/reasoning_effort/i.test(detail) && 'reasoning_effort' in body) {
      delete body.reasoning_effort
      retried = true
    }
    if (retried) resp = await send()
  }
  if (!resp.ok) throw new Error(await errFromResp(resp))

  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let usage = null
  let finishReason = null
  // finish_reason=length 说明被 max_tokens 截断；挂在 usage 上带回去，不能新造 chunk 类型
  //（其它调用方只取 chunk.text，多发一个 chunk 会把 undefined 拼进正文）
  const doneUsage = () => (finishReason ? { ...(usage || {}), finishReason } : usage)

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
      if (data === '[DONE]') return doneUsage()
      try {
        const j = JSON.parse(data)
        if (j.usage) {
          const prompt = Number(j.usage.prompt_tokens) || 0
          const completion = Number(j.usage.completion_tokens) || 0
          usage = { prompt, completion, total: Number(j.usage.total_tokens) || prompt + completion }
        }
        const choice = j.choices?.[0]
        if (choice?.finish_reason) finishReason = choice.finish_reason
        const delta = choice?.delta
        if (delta?.reasoning_content) {
          onChunk({ type: 'thinking', text: delta.reasoning_content })
        }
        const c = delta?.content || choice?.message?.content
        if (c) onChunk({ type: 'content', text: c })
      } catch { /* skip */ }
    }
  }
  return doneUsage()
}

/** Ollama 原生格式 (NDJSON) */
async function ollamaChat({ model, temperature, maxTokens, contextLength, topP, messages, signal, onChunk, thinkingEnabled }) {
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
    options: { temperature, num_predict: maxTokens, num_ctx: contextLength || 131072, top_p: topP },
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
  let usage = null
  let inThink = false
  const TAG_OPEN = '<think>'
  const TAG_CLOSE = '</think>'
  const TAG_OPEN2 = '<thinking>'
  const TAG_CLOSE2 = '</thinking>'
  const TAG_OPEN3 = '<｜end▁of▁thinking｜>'
  const TAG_CLOSE3 = '<｜end▁of▁thinking｜>'
  const TAG_OPEN4 = '<thought>'
  const TAG_CLOSE4 = '</thought>'

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
        if (j.done) {
          const prompt = Number(j.prompt_eval_count) || 0
          const completion = Number(j.eval_count) || 0
          if (prompt || completion) usage = { prompt, completion, total: prompt + completion }
          const reason = j.done_reason === 'length' || j.done_reason === 'max_tokens' ? 'length' : null
          return reason ? { ...(usage || {}), finishReason: reason } : usage
        }

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

        // 解析思考标签（4 种变体）
        let text = c
        const openTags = [TAG_OPEN, TAG_OPEN2, TAG_OPEN3, TAG_OPEN4]
        const closeTags = [TAG_CLOSE, TAG_CLOSE2, TAG_CLOSE3, TAG_CLOSE4]
        while (text) {
          if (!inThink) {
            let idx = -1, tagLen = 0
            for (const tag of openTags) {
              idx = text.indexOf(tag)
              if (idx !== -1) { tagLen = tag.length; break }
            }
            if (idx === -1) { onChunk({ type: 'content', text }); break }
            if (idx > 0) onChunk({ type: 'content', text: text.slice(0, idx) })
            text = text.slice(idx + tagLen)
            inThink = true
          } else {
            let idx = -1, tagLen = 0
            for (const tag of closeTags) {
              idx = text.indexOf(tag)
              if (idx !== -1) { tagLen = tag.length; break }
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
  return usage
}

/**
 * 对话补全地址。
 * 智谱 open.bigmodel.cn 的 /chat/completions 在浏览器预检时缺少 CORS 头，
 * 加尾斜杠会走另一条网关路由，可正常跨域；其余服务保持标准路径。
 */
function chatCompletionsUrl(apiBase) {
  const base = String(apiBase || '').replace(/\/+$/, '')
  if (/open\.bigmodel\.cn/i.test(base)) return `${base}/chat/completions/`
  return `${base}/chat/completions`
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
