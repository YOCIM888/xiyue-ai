/**
 * CSV/TSV 表格解析与统计（纯函数，无浏览器依赖，可单测）。
 * 由 tableWorker 在 Worker 中调用，为主线程提供可信的本地统计结果。
 */

const MAX_TABLE_ROWS = 20000
const MAX_TABLE_CHARS = 300000
const MAX_OUTPUT_CHARS = 20000

const EMPTY_VALUES = new Set(['', '-', '--', '—', 'NA', 'N/A', 'NULL', 'null', 'NaN', 'nan'])

function truncate(text, max = MAX_OUTPUT_CHARS) {
  const value = String(text ?? '')
  return value.length > max ? `${value.slice(0, max)}\n…（输出过长已截断）` : value
}

function shortText(value, max = 40) {
  const text = String(value ?? '')
  return text.length > max ? `${text.slice(0, max)}…` : text
}

function countDelimiter(line, delimiter) {
  let count = 0
  let inQuotes = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') i += 1
      else inQuotes = !inQuotes
    } else if (!inQuotes && ch === delimiter) {
      count += 1
    }
  }
  return count
}

export function detectDelimiter(lines) {
  const sample = lines.filter(line => line.trim()).slice(0, 5)
  if (!sample.length) return ','
  let best = ','
  let bestScore = 0
  for (const delimiter of [',', '\t', ';', '|']) {
    const counts = sample.map(line => countDelimiter(line, delimiter))
    const score = Math.min(...counts)
    if (score > bestScore) {
      bestScore = score
      best = delimiter
    }
  }
  return best
}

export function parseDelimited(text, delimiter) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === delimiter) {
      row.push(field)
      field = ''
    } else if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (ch !== '\r') {
      field += ch
    }
  }
  if (field !== '' || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

export function toNumber(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  const cleaned = raw.replace(/[,，\s]/g, '').replace(/^[¥$€£]/, '').replace(/%$/, '')
  if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(cleaned)) return null
  const num = Number(cleaned)
  return Number.isFinite(num) ? num : null
}

function fmtNumber(value) {
  if (!Number.isFinite(value)) return '—'
  const abs = Math.abs(value)
  if (abs >= 1e12 || (abs > 0 && abs < 1e-6)) return value.toExponential(3)
  return Number(value.toFixed(4)).toLocaleString('zh-CN', { maximumFractionDigits: 4 })
}

function summarizeNumbers(values) {
  const count = values.length
  const sum = values.reduce((acc, v) => acc + v, 0)
  const mean = sum / count
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
  const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / count
  return {
    count,
    sum,
    mean,
    median,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    stdev: Math.sqrt(variance),
  }
}

function makeUniqueHeaders(headers) {
  const used = new Map()
  return headers.map((name, index) => {
    let base = String(name || '').trim() || `列${index + 1}`
    const seen = used.get(base) || 0
    used.set(base, seen + 1)
    return seen ? `${base}_${seen + 1}` : base
  })
}

function analyzeSection(text, sheetName = '') {
  const source = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').slice(0, MAX_TABLE_CHARS)
  const lines = source.split('\n')
  const delimiter = detectDelimiter(lines)
  const rows = parseDelimited(source, delimiter)
    .filter(row => row.some(cell => String(cell).trim() !== ''))
  if (!rows.length) return ''

  const firstRow = rows[0]
  const firstHasText = firstRow.some(cell => String(cell).trim() && toNumber(cell) === null)
  const firstHasNumber = firstRow.some(cell => toNumber(cell) !== null)
  const useHeader = firstHasText || !firstHasNumber

  let colCount = firstRow.length
  for (const row of rows.slice(0, 20)) colCount = Math.max(colCount, row.length)
  let headers
  let data
  if (useHeader) {
    headers = makeUniqueHeaders([...firstRow, ...Array.from({ length: Math.max(0, colCount - firstRow.length) }, () => '')])
    data = rows.slice(1)
  } else {
    headers = Array.from({ length: colCount }, (_, i) => `列${i + 1}`)
    data = rows
  }

  const totalRows = data.length
  const analyzedRows = data.slice(0, MAX_TABLE_ROWS)
  const truncated = totalRows > analyzedRows.length

  const missing = headers.map(() => 0)
  const rowKeys = new Set()
  let duplicateRows = 0

  const columns = headers.map((name, index) => {
    const values = []
    for (const row of analyzedRows) {
      const raw = row[index] ?? ''
      if (EMPTY_VALUES.has(String(raw).trim())) missing[index] += 1
      else values.push(String(raw).trim())
    }
    const numbers = []
    for (const value of values) {
      const num = toNumber(value)
      if (num !== null) numbers.push(num)
    }
    const numeric = values.length > 0 && numbers.length / values.length >= 0.8
    return { name, index, values, numbers, numeric }
  })

  for (const row of analyzedRows) {
    const key = headers.map((_, i) => String(row[i] ?? '').trim()).join('\u0001')
    if (rowKeys.has(key)) {
      duplicateRows += 1
    } else {
      rowKeys.add(key)
    }
  }

  const parts = []
  if (sheetName) parts.push(`【工作表：${sheetName}】`)
  parts.push(`数据规模：${totalRows} 行 × ${colCount} 列${truncated ? `（已分析前 ${analyzedRows.length} 行）` : ''}`)
  const missingText = headers
    .map((name, i) => missing[i] ? `${name} ${missing[i]}` : '')
    .filter(Boolean)
    .join('、')
  parts.push(`缺失值：${missingText || '无'}`)
  parts.push(`重复行：${duplicateRows ? `${duplicateRows} 行` : '无'}`)
  parts.push('字段统计：')

  for (const col of columns) {
    if (!col.values.length) {
      parts.push(`- ${shortText(col.name)}：整列为空`)
      continue
    }
    if (col.numeric) {
      const s = summarizeNumbers(col.numbers)
      const outliers = s.stdev > 0
        ? col.numbers.filter(v => Math.abs(v - s.mean) > 3 * s.stdev).length
        : 0
      parts.push(
        `- ${shortText(col.name)}（数值）：非空 ${s.count}，合计 ${fmtNumber(s.sum)}，均值 ${fmtNumber(s.mean)}，` +
        `中位数 ${fmtNumber(s.median)}，最小 ${fmtNumber(s.min)}，最大 ${fmtNumber(s.max)}，标准差 ${fmtNumber(s.stdev)}，` +
        (s.stdev > 0 ? `离群值(3σ) ${outliers}` : '常量列')
      )
    } else {
      const counts = new Map()
      for (const value of col.values) counts.set(value, (counts.get(value) || 0) + 1)
      const top = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([value, count]) => `${shortText(value)}(${count})`)
        .join('、')
      parts.push(`- ${shortText(col.name)}（文本）：唯一值 ${counts.size}，Top5：${top}`)
    }
  }

  return parts.join('\n')
}

function splitSheetSections(text) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n')
  const sections = []
  let current = { name: '', lines: [] }
  for (const line of lines) {
    const match = line.match(/^###\s*Sheet:\s*(.+)$/i)
    if (match) {
      if (current.lines.some(l => l.trim())) sections.push(current)
      current = { name: match[1].trim(), lines: [] }
    } else {
      current.lines.push(line)
    }
  }
  if (current.lines.some(l => l.trim())) sections.push(current)
  return sections.length ? sections : [{ name: '', lines }]
}

export function analyzeTableText(text) {
  const sections = splitSheetSections(text)
  const summaries = []
  for (const section of sections) {
    const summary = analyzeSection(section.lines.join('\n'), section.name)
    if (summary) summaries.push(summary)
  }
  return truncate(summaries.join('\n\n'), 12000)
}