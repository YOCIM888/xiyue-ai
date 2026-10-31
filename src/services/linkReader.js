/**
 * 链接识别：提取消息中的链接并读取网页正文
 * 开发/预览模式下通过 Vite 中间件 /api/read-link 抓取（可跨域）；
 * 静态部署时回退为直接抓取（仅同源或允许跨域的站点可用）
 */

const MAX_CHARS = 8000
const TIMEOUT_MS = 20000

export function extractUrls(text) {
  const matches = text.match(/https?:\/\/[^\s<>"'`]+/g) || []
  const cleaned = matches.map(u => u.replace(/[),.。，；;!?！？、]+$/g, ''))
  return [...new Set(cleaned)].slice(0, 3)
}

export async function readLink(url) {
  let html
  try {
    const resp = await fetch(`/api/read-link?url=${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!resp.ok || !resp.headers.get('x-link-reader')) throw new Error(`HTTP ${resp.status}`)
    html = await resp.text()
  } catch {
    const resp = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    html = await resp.text()
  }
  return truncate(htmlToText(html))
}

function htmlToText(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('script, style, iframe, noscript, svg').forEach(el => el.remove())
  const title = doc.title?.trim()
  const body = (doc.body?.textContent || '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
  if (!body) throw new Error('内容为空')
  return title ? `标题：${title}\n\n${body}` : body
}

function truncate(text) {
  return text.length > MAX_CHARS
    ? text.slice(0, MAX_CHARS) + '\n…（内容过长已截断）'
    : text
}

/** 把链接正文附加到最后一条用户消息上，供模型阅读 */
export async function attachLinkContext(chatMessages, userText) {
  const urls = extractUrls(userText)
  if (!urls.length) return chatMessages

  const chunks = []
  for (const url of urls) {
    try {
      const content = await readLink(url)
      chunks.push(`【链接内容：${url}】\n${content}`)
    } catch (err) {
      chunks.push(`【链接 ${url} 读取失败：${err.message}】`)
    }
  }
  if (!chunks.length) return chatMessages

  const out = chatMessages.map(m => ({ ...m }))
  const lastUser = [...out].reverse().find(m => m.role === 'user' && typeof m.content === 'string')
  if (lastUser) {
    lastUser.content += `\n\n以下是用户消息中链接的实际内容，请结合这些内容回答：\n\n${chunks.join('\n\n')}`
  }
  return out
}
