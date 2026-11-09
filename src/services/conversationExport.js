/**
 * 对话导出：Markdown、独立 HTML / Word、以及通过打印生成 PDF。
 * 仅导出当前分支的可见消息，不包含思考过程与分支历史。
 */
import { marked } from 'marked'

marked.setOptions({ breaks: true, gfm: true })

const AI_NAME = '白曦月'

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/\n/g, '')
}

function formatTime(ts) {
  if (!ts) return ''
  try {
    return new Date(ts).toLocaleString('zh-CN', { hour12: false })
  } catch {
    return ''
  }
}

function roleName(message, userName) {
  return message.role === 'assistant' ? AI_NAME : (userName || '我')
}

function safeFileName(title) {
  const base = String(title || '对话导出')
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim()
    .slice(0, 60) || '对话导出'
  const now = new Date()
  const pad = n => String(n).padStart(2, '0')
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
  return `${base}-${stamp}`
}

function imageLines(images = []) {
  return images.map(src =>
    String(src || '').startsWith('data:') ? '> [图片]' : `> ![图片](${src})`
  ).join('\n')
}

function buildMarkdown({ title, messages, userName }) {
  const parts = [
    `# ${title}`,
    '',
    `> 导出于 ${formatTime(Date.now())} · XIYUE AI`,
    '',
  ]
  for (const msg of messages) {
    const time = formatTime(msg.ts)
    parts.push(`## ${roleName(msg, userName)}${time ? ` · ${time}` : ''}`)
    parts.push('')
    parts.push(String(msg.content || '').trim() || '（空消息）')
    const images = imageLines(msg.images)
    if (images) {
      parts.push('')
      parts.push(images)
    }
    parts.push('')
  }
  return parts.join('\n')
}

function renderMarkdown(text) {
  try {
    return marked.parse(String(text || ''))
  } catch {
    return `<p>${escapeHtml(text)}</p>`
  }
}

function buildHtml({ title, messages, userName, forWord = false }) {
  const sections = messages.map(msg => {
    const isUser = msg.role === 'user'
    const time = formatTime(msg.ts)
    const images = (msg.images || [])
      .map(src => `<figure><img src="${escapeAttr(src)}" alt="图片" /></figure>`)
      .join('')
    return `<section class="message ${isUser ? 'user' : 'assistant'}">
  <header class="message-head">
    <span class="role">${escapeHtml(roleName(msg, userName))}</span>
    ${time ? `<span class="time">${escapeHtml(time)}</span>` : ''}
  </header>
  <div class="content">${renderMarkdown(msg.content)}</div>
  ${images}
</section>`
  }).join('\n')

  const csp = forWord
    ? ''
    : '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data: https: http:; style-src \'unsafe-inline\'">'
  const wordMeta = forWord
    ? '<meta name="ProgId" content="Word.Document"><meta name="Generator" content="XIYUE AI">'
    : ''

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${csp}
${wordMeta}
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0 auto;
    padding: 40px 24px 60px;
    max-width: 860px;
    color: #1f2328;
    background: #ffffff;
    font-family: "Segoe UI", "Microsoft YaHei", "PingFang SC", system-ui, sans-serif;
    font-size: 15px;
    line-height: 1.75;
  }
  .doc-header { border-bottom: 2px solid #e5e7eb; padding-bottom: 18px; margin-bottom: 28px; }
  .doc-header h1 { margin: 0 0 8px; font-size: 26px; line-height: 1.3; }
  .doc-meta { font-size: 12px; color: #8b949e; }
  .message { margin: 0 0 26px; padding: 18px 20px; border: 1px solid #e5e7eb; border-radius: 12px; }
  .message.user { background: #f6f8fa; }
  .message.assistant { background: #ffffff; }
  .message-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 10px; }
  .role { font-weight: 700; font-size: 14px; }
  .message.user .role { color: #0969da; }
  .message.assistant .role { color: #8250df; }
  .time { font-size: 11px; color: #8b949e; }
  .content > :first-child { margin-top: 0; }
  .content > :last-child { margin-bottom: 0; }
  .content h1, .content h2, .content h3, .content h4 { margin: 1.2em 0 0.6em; line-height: 1.4; }
  .content p { margin: 0.6em 0; }
  .content ul, .content ol { padding-left: 1.6em; margin: 0.6em 0; }
  .content blockquote { margin: 0.8em 0; padding: 6px 14px; border-left: 3px solid #d0d7de; color: #57606a; background: #f6f8fa; }
  .content code { padding: 2px 6px; border-radius: 4px; background: #eff1f3; font-family: "Cascadia Code", Consolas, monospace; font-size: 0.9em; }
  .content pre { padding: 14px 16px; border-radius: 8px; background: #0d1117; color: #e6edf3; overflow-x: auto; }
  .content pre code { padding: 0; background: transparent; color: inherit; }
  .content table { width: 100%; border-collapse: collapse; margin: 0.8em 0; font-size: 14px; }
  .content th, .content td { border: 1px solid #d0d7de; padding: 7px 10px; text-align: left; }
  .content th { background: #f6f8fa; }
  .content img, figure img { max-width: 100%; height: auto; border-radius: 8px; }
  figure { margin: 12px 0 0; }
  .doc-footer { margin-top: 36px; padding-top: 14px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #8b949e; text-align: center; }
  @page { margin: 18mm; }
  @media print {
    body { max-width: none; padding: 0; font-size: 12pt; }
    .message { break-inside: avoid-page; border-color: #d0d7de; }
  }
</style>
</head>
<body>
<header class="doc-header">
  <h1>${escapeHtml(title)}</h1>
  <div class="doc-meta">导出于 ${escapeHtml(formatTime(Date.now()))} · XIYUE AI</div>
</header>
${sections}
<footer class="doc-footer">由 XIYUE AI 导出</footer>
</body>
</html>`
}

function downloadFile(content, filename, mime) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * 导出对话文件。format: md | html | doc
 */
export function exportConversation({ format, title, messages, userName }) {
  if (!Array.isArray(messages) || !messages.length) return false
  const name = safeFileName(title)
  if (format === 'md') {
    downloadFile(buildMarkdown({ title, messages, userName }), `${name}.md`, 'text/markdown;charset=utf-8')
  } else if (format === 'html') {
    downloadFile(buildHtml({ title, messages, userName }), `${name}.html`, 'text/html;charset=utf-8')
  } else if (format === 'doc') {
    downloadFile(buildHtml({ title, messages, userName, forWord: true }), `${name}.doc`, 'application/msword')
  } else {
    return false
  }
  return true
}

/**
 * 用隐藏 iframe 调起浏览器打印，用户可选择「另存为 PDF」。
 */
export function printConversation({ title, messages, userName }) {
  if (!Array.isArray(messages) || !messages.length) return false
  const html = buildHtml({ title, messages, userName })
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText = 'position:fixed;left:-9999px;top:0;width:800px;height:600px;border:0;opacity:0;pointer-events:none;'
  document.body.appendChild(iframe)

  const win = iframe.contentWindow
  const doc = win?.document
  if (!win || !doc) {
    iframe.remove()
    return false
  }

  doc.open()
  doc.write(html)
  doc.close()

  let printed = false
  const run = () => {
    if (printed) return
    printed = true
    try {
      win.focus()
      win.print()
    } catch {
      // 忽略打印失败，交由调用方提示
    }
    setTimeout(() => iframe.remove(), 60000)
  }

  if (doc.readyState === 'complete') {
    setTimeout(run, 300)
  } else {
    iframe.addEventListener('load', () => setTimeout(run, 300), { once: true })
    // 兜底：图片较多时 load 可能较慢
    setTimeout(run, 1500)
  }
  return true
}
