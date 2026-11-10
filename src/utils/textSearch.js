/**
 * 工作区文本搜索的纯匹配层：不碰文件系统，方便单测。
 * 默认按字面量子串匹配；regex 模式由调用方显式开启。
 */

const MAX_QUERY_CHARS = 200
const MAX_LINE_CHARS = 600
const MAX_OUTPUT_LINES = 800

function truncateLine(text) {
  const value = String(text ?? '').replace(/\r$/, '')
  return value.length > MAX_LINE_CHARS ? `${value.slice(0, MAX_LINE_CHARS)}…` : value
}

/** 把 glob（* / ** / ? / 字符类以外的写法不支持）转成锚定正则 */
export function globToRegExp(glob) {
  const pattern = String(glob ?? '').trim().replace(/\\/g, '/')
  if (!pattern) return null
  let out = ''
  for (let i = 0; i < pattern.length; i += 1) {
    const char = pattern[i]
    if (char === '*') {
      if (pattern[i + 1] === '*') {
        // `**/` 允许匹配零层目录，与 ripgrep 的行为一致
        out += pattern[i + 2] === '/' ? '(?:.*/)?' : '.*'
        i += pattern[i + 2] === '/' ? 2 : 1
      } else {
        out += '[^/]*'
      }
    } else if (char === '?') {
      out += '[^/]'
    } else {
      out += char.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    }
  }
  try {
    return new RegExp(`(?:^|/)${out}$`)
  } catch {
    return null
  }
}

/**
 * 生成行匹配器。
 * @returns {{error?: string, test?: (line: string) => boolean, find?: (line: string) => ({start: number, end: number}|null)}}
 */
export function createMatcher({ query, regex = false, ignoreCase = false } = {}) {
  const needle = String(query ?? '')
  if (!needle.trim()) return { error: '搜索词不能为空' }
  if (needle.length > MAX_QUERY_CHARS) {
    return { error: `搜索词过长（最多 ${MAX_QUERY_CHARS} 字符），请缩短或改用文件过滤` }
  }

  if (regex) {
    let re
    try {
      re = new RegExp(needle, ignoreCase ? 'i' : '')
    } catch (err) {
      return { error: `正则表达式无效：${err?.message || err}` }
    }
    // 每行新建 lastIndex 状态，避免带 g 标志时跨行串状态导致漏匹配
    return {
      test: line => { re.lastIndex = 0; return re.test(line) },
      find: line => {
        re.lastIndex = 0
        const m = re.exec(line)
        if (!m || !m[0]) return null
        return { start: m.index, end: m.index + m[0].length }
      },
    }
  }

  if (ignoreCase) {
    const lower = needle.toLowerCase()
    return {
      test: line => line.toLowerCase().includes(lower),
      find: line => {
        const start = line.toLowerCase().indexOf(lower)
        return start < 0 ? null : { start, end: start + lower.length }
      },
    }
  }
  return {
    test: line => line.includes(needle),
    find: line => {
      const start = line.indexOf(needle)
      return start < 0 ? null : { start, end: start + needle.length }
    },
  }
}

/**
 * 在一段文本里找出命中行。
 * @returns {{hits: Array<{line: number, text: string, matched: boolean, range: ({start: number, end: number}|null)}>, truncated: boolean, hitCount: number}}
 */
export function findMatches(text, matcher, { context = 0 } = {}) {
  const lines = String(text ?? '').split('\n')
  const wanted = new Set()
  let hitCount = 0

  for (let i = 0; i < lines.length; i += 1) {
    if (!matcher.test(lines[i])) continue
    hitCount += 1
    for (let j = Math.max(0, i - context); j <= Math.min(lines.length - 1, i + context); j += 1) {
      wanted.add(j)
    }
    if (hitCount >= 500) break
  }

  const hits = []
  let truncated = false
  for (const index of [...wanted].sort((a, b) => a - b)) {
    if (hits.length >= MAX_OUTPUT_LINES) {
      truncated = true
      break
    }
    const matched = matcher.test(lines[index])
    const shown = truncateLine(lines[index])
    hits.push({ line: index + 1, text: shown, matched, range: matched ? displayRange(matcher, shown) : null })
  }
  return { hits, truncated, hitCount }
}

/** 高亮区间只在展示用得着：截断后可能已不含命中内容，此时不给区间 */
function displayRange(matcher, shown) {
  const range = matcher.find?.(shown)
  if (!range || range.start >= shown.length) return null
  return { start: range.start, end: Math.min(range.end, shown.length) }
}

/** 按命中区间把整行切成片段，交组件决定怎么渲染，避免把 HTML 塞进搜索层 */
export function splitByRange(text, range) {
  const value = String(text ?? '')
  if (!range || range.start < 0 || range.start >= range.end || range.end > value.length) {
    return [{ text: value, hit: false }]
  }
  const parts = []
  if (range.start > 0) parts.push({ text: value.slice(0, range.start), hit: false })
  parts.push({ text: value.slice(range.start, range.end), hit: true })
  if (range.end < value.length) parts.push({ text: value.slice(range.end), hit: false })
  return parts
}
