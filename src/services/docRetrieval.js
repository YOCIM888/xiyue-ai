/**
 * 文档切片检索（RAG-lite）
 * 长文档按段落/句子切片，用轻量 BM25 依据当前问题挑选最相关片段注入上下文。
 * 不依赖向量库或额外 API，纯前端完成。
 */
import { attachDocumentContext, DOC_MAX_SELECTION } from './documentParser'
import { appendContextToLastUser } from './linkReader'

const CHUNK_SIZE = 700
const MAX_CHUNKS = 8
const MAX_TOTAL_CHARS = 6000
const SHORT_DOC_CHARS = 3000

function normalizeTitle(doc) {
  return doc?.title || doc?.fileName || '未命名文档'
}

function tokenize(text) {
  const t = String(text || '').toLowerCase()
  const tokens = []
  for (const m of t.matchAll(/[a-z0-9][a-z0-9_+.-]{1,}/g)) tokens.push(m[0])
  for (const m of t.matchAll(/[\u4e00-\u9fa5]+/g)) {
    const s = m[0]
    if (s.length === 1) tokens.push(s)
    else for (let i = 0; i < s.length - 1; i += 1) tokens.push(s.slice(i, i + 2))
  }
  return tokens
}

/** 按句子/换行聚合切片，超长句硬切 */
export function splitIntoChunks(text, size = CHUNK_SIZE) {
  const clean = String(text || '').replace(/\r\n/g, '\n').trim()
  if (!clean) return []
  if (clean.length <= size) return [clean]

  const sentences = clean.split(/(?<=[。！？!?；;\n])/)
  const chunks = []
  let buf = ''

  for (const sentence of sentences) {
    if ((buf + sentence).length <= size) {
      buf += sentence
      continue
    }
    if (buf.trim()) chunks.push(buf.trim())
    if (sentence.length > size) {
      for (let i = 0; i < sentence.length; i += size) {
        chunks.push(sentence.slice(i, i + size))
      }
      buf = ''
    } else {
      buf = sentence
    }
  }
  if (buf.trim()) chunks.push(buf.trim())
  return chunks
}

/** BM25-lite 打分 */
export function scoreChunks(chunks, query) {
  const qTokens = [...new Set(tokenize(query))]
  if (!qTokens.length) return chunks.map(c => ({ ...c, score: 0 }))

  const docs = chunks.map(chunk => {
    const tokens = tokenize(chunk.text)
    const tf = new Map()
    for (const token of tokens) tf.set(token, (tf.get(token) || 0) + 1)
    return { chunk, tf, len: tokens.length }
  })

  const totalLen = docs.reduce((sum, d) => sum + d.len, 0)
  const avgLen = totalLen / (docs.length || 1) || 1
  const df = new Map()
  for (const token of qTokens) {
    df.set(token, docs.filter(d => d.tf.has(token)).length)
  }

  const k1 = 1.2
  const b = 0.75
  const N = docs.length || 1

  return docs.map(d => {
    let score = 0
    for (const token of qTokens) {
      const f = d.tf.get(token) || 0
      if (!f) continue
      const idf = Math.log(1 + (N - df.get(token) + 0.5) / (df.get(token) + 0.5))
      score += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * (d.len / avgLen)))
    }
    return { ...d.chunk, score }
  })
}

/**
 * 生成文档检索上下文。
 * 短文档直接全文注入；长文档按相关度注入片段，并在开头说明来源。
 * @returns {{ messages: Array, mode: 'none'|'full'|'retrieval'|'fallback', chunks: number }}
 */
export function retrieveDocumentContext(chatMessages, documents = [], query = '') {
  const picked = (documents || [])
    .filter(doc => doc && typeof doc.content === 'string' && doc.content.trim())
    .slice(0, DOC_MAX_SELECTION)

  if (!picked.length) return { messages: chatMessages, mode: 'none', chunks: 0 }

  const totalChars = picked.reduce((sum, doc) => sum + doc.content.trim().length, 0)
  if (totalChars <= SHORT_DOC_CHARS) {
    return { messages: attachDocumentContext(chatMessages, picked), mode: 'full', chunks: picked.length }
  }

  const allChunks = []
  for (const doc of picked) {
    const parts = splitIntoChunks(doc.content)
    parts.forEach((text, i) => {
      allChunks.push({
        docId: doc.id,
        docTitle: normalizeTitle(doc),
        index: i + 1,
        docTotal: parts.length,
        text,
      })
    })
  }

  const scored = scoreChunks(allChunks, query)
  scored.sort((a, b) => b.score - a.score)

  let selected = scored.filter(c => c.score > 0).slice(0, MAX_CHUNKS)
  let fallback = false
  if (!selected.length) {
    fallback = true
    selected = picked
      .map(doc => {
        const first = allChunks.find(c => c.docId === doc.id)
        return first ? { ...first, score: 0 } : null
      })
      .filter(Boolean)
  }

  // 总字符上限
  const out = []
  let used = 0
  for (const chunk of selected) {
    if (used >= MAX_TOTAL_CHARS) break
    let text = chunk.text
    if (used + text.length > MAX_TOTAL_CHARS) text = text.slice(0, MAX_TOTAL_CHARS - used)
    out.push({ ...chunk, text })
    used += text.length
  }

  // 输出时按文档与片段顺序排列，便于阅读
  out.sort((a, b) => String(a.docTitle).localeCompare(String(b.docTitle)) || a.index - b.index)

  const blocks = out.map(c => `【${c.docTitle} · 片段 ${c.index}/${c.docTotal}】\n${c.text}`)
  const intro = fallback
    ? '以下文档内容较长，且未检索到与问题高度匹配的片段，先提供各文档开头内容。若不足以回答，请明确说明：'
    : '以下是从用户所选文档中检索到的相关片段，请优先依据这些片段回答，并在引用处标注文档名与片段序号；若片段不足以回答，请明确说明：'

  return {
    messages: appendContextToLastUser(chatMessages, `${intro}\n\n${blocks.join('\n\n')}`),
    mode: fallback ? 'fallback' : 'retrieval',
    chunks: out.length,
  }
}
