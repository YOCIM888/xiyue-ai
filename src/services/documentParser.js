import mammoth from 'mammoth'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url'
import { appendContextToLastUser } from './linkReader'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

/** 单篇文档最多注入的字数 */
export const DOC_MAX_CHARS = 8000
/** 一次最多叠加的文档总字数 */
export const DOC_TOTAL_CHARS = 12000
/** 一次最多选择的文档数 */
export const DOC_MAX_SELECTION = 3

const MAX_PDF_DOCX_BYTES = 20 * 1024 * 1024
const MAX_TEXT_BYTES = 5 * 1024 * 1024

export class DocumentParseError extends Error {
  constructor(message, code = 'PARSE_FAILED') {
    super(message)
    this.name = 'DocumentParseError'
    this.code = code
  }
}

function getExtension(name = '') {
  const match = String(name).toLowerCase().match(/\.([a-z0-9]+)$/)
  return match ? match[1] : ''
}

function formatSize(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${Math.ceil(bytes / 1024)} KB`
}

function cleanText(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

async function parsePdf(file) {
  let pdf
  try {
    const data = new Uint8Array(await file.arrayBuffer())
    pdf = await pdfjsLib.getDocument({ data, isEvalSupported: false }).promise
  } catch (err) {
    if (err?.name === 'PasswordException') {
      throw new DocumentParseError('PDF 已加密，请先解除密码后再导入', 'PDF_ENCRYPTED')
    }
    throw new DocumentParseError(`PDF 解析失败：${err?.message || '文件可能已损坏'}`, 'PDF_FAILED')
  }

  try {
    const pages = []
    for (let i = 1; i <= pdf.numPages; i += 1) {
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()
      const lines = []
      let line = ''
      for (const item of content.items) {
        line += item.str || ''
        if (item.hasEOL) {
          lines.push(line)
          line = ''
        }
      }
      if (line) lines.push(line)
      const pageText = cleanText(lines.join('\n'))
      if (pageText) pages.push(pageText)
      page.cleanup()
    }
    const text = cleanText(pages.join('\n\n'))
    if (!text) {
      throw new DocumentParseError('该 PDF 没有可提取的文本层，可能是扫描件，暂不支持 OCR', 'PDF_NO_TEXT')
    }
    return text
  } catch (err) {
    if (err instanceof DocumentParseError) throw err
    throw new DocumentParseError(`PDF 解析失败：${err?.message || '文件可能已损坏'}`, 'PDF_FAILED')
  } finally {
    try { await pdf.destroy() } catch { /* 忽略释放失败 */ }
  }
}

async function parseDocx(file) {
  try {
    const arrayBuffer = await file.arrayBuffer()
    const result = await mammoth.extractRawText({ arrayBuffer })
    const text = cleanText(result.value)
    if (!text) throw new DocumentParseError('Word 文档中没有可提取的正文', 'DOCX_EMPTY')
    return text
  } catch (err) {
    if (err instanceof DocumentParseError) throw err
    throw new DocumentParseError(`Word 文档解析失败：${err?.message || '文件可能已损坏'}`, 'DOCX_FAILED')
  }
}

/**
 * 解析「我的文档」导入的文件
 * 返回 { text, truncated, originalLength, fileName, fileType, fileSize }
 */
export async function parseDocumentFile(file) {
  if (!file) throw new DocumentParseError('没有选择文件', 'NO_FILE')

  const ext = getExtension(file.name)
  if (ext === 'doc') {
    throw new DocumentParseError('暂不支持旧版 .doc 二进制格式，请在 Word 中另存为 .docx 后重试', 'DOC_UNSUPPORTED')
  }
  if (!['pdf', 'docx', 'txt', 'md', 'markdown'].includes(ext)) {
    throw new DocumentParseError('仅支持 PDF、Word（.docx）、TXT、Markdown 文件', 'UNSUPPORTED')
  }

  const limit = ext === 'pdf' || ext === 'docx' ? MAX_PDF_DOCX_BYTES : MAX_TEXT_BYTES
  if (file.size > limit) {
    throw new DocumentParseError(`文件过大（${formatSize(file.size)}），单个文件最大 ${formatSize(limit)}`, 'TOO_LARGE')
  }

  let text
  if (ext === 'pdf') text = await parsePdf(file)
  else if (ext === 'docx') text = await parseDocx(file)
  else {
    text = cleanText(await file.text())
    if (!text) throw new DocumentParseError('文件内容为空', 'EMPTY')
  }

  const originalLength = text.length
  const truncated = originalLength > DOC_MAX_CHARS
  if (truncated) text = text.slice(0, DOC_MAX_CHARS)

  return {
    text,
    truncated,
    originalLength,
    fileName: file.name,
    fileType: ext,
    fileSize: file.size,
  }
}

/**
 * 把所选文档正文附加到最后一条用户消息上
 * 与 attachLinkContext 使用同一套追加逻辑。
 */
export function attachDocumentContext(chatMessages, documents = []) {
  const picked = (documents || [])
    .filter(doc => doc && typeof doc.content === 'string' && doc.content.trim())
    .slice(0, DOC_MAX_SELECTION)

  if (!picked.length) return chatMessages

  const chunks = []
  let used = 0

  for (const doc of picked) {
    const remaining = DOC_TOTAL_CHARS - used
    if (remaining <= 0) break

    const cap = Math.min(DOC_MAX_CHARS, remaining)
    let body = doc.content.trim()
    const cut = body.length > cap
    if (cut) body = body.slice(0, cap)

    const title = doc.title || doc.fileName || '未命名文档'
    const note = cut || doc.truncated ? '\n（该文档内容较长，已截断）' : ''
    chunks.push(`【文档内容：${title}】${note}\n${body}`)
    used += body.length
  }

  if (!chunks.length) return chatMessages

  return appendContextToLastUser(
    chatMessages,
    `以下是用户选择的文档正文，请结合这些内容回答：\n\n${chunks.join('\n\n')}`
  )
}
