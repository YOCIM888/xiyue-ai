/**
 * 轻量 .xlsx 解析：读取工作簿中的工作表，转成带表头的 TSV 文本。
 * 只依赖 jszip，不引入额外解析库；忽略样式、图片与公式本身，保留公式缓存值。
 */
import JSZip from 'jszip'

/** 单个工作表最多读取的行数 */
const MAX_ROWS_PER_SHEET = 2000
/** 最多读取的工作表数量 */
const MAX_SHEETS = 10
/** 全部工作表拼成文本后的字符上限 */
const MAX_TOTAL_CHARS = 300000

// Excel 内置的日期/时间格式编号
const BUILTIN_DATE_FORMAT_IDS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47])

function decodeXml(value) {
  return String(value || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num) => String.fromCodePoint(Number(num)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function getAttr(tag, name) {
  const match = String(tag || '').match(new RegExp(`${name}="([^"]*)"`))
  return match ? decodeXml(match[1]) : ''
}

async function readText(zip, path) {
  const entry = zip.file(path)
  return entry ? entry.async('string') : ''
}

function parseSharedStrings(xml) {
  if (!xml) return []
  const list = []
  for (const si of String(xml).matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    const texts = []
    for (const t of si[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) {
      texts.push(decodeXml(t[1]))
    }
    list.push(texts.join(''))
  }
  return list
}

function isDateFormat(numFmtId, formatCode) {
  if (BUILTIN_DATE_FORMAT_IDS.has(numFmtId)) return true
  if (!formatCode) return false
  // 去掉引号文本、[颜色/条件] 和转义字符，避免把普通数字格式误判成日期
  const cleaned = String(formatCode)
    .replace(/"[^"]*"/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\\./g, '')
  return /[ymdhs]/i.test(cleaned)
}

function parseDateStyles(xml) {
  if (!xml) return []
  const customFormats = new Map()
  const numFmts = (String(xml).match(/<numFmts\b[\s\S]*?<\/numFmts>/) || [''])[0]
  for (const item of numFmts.matchAll(/<numFmt\b[^>]*\/?>/g)) {
    const id = Number(getAttr(item[0], 'numFmtId'))
    if (Number.isFinite(id)) customFormats.set(id, getAttr(item[0], 'formatCode'))
  }

  const cellXfs = (String(xml).match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/) || [])[1] || ''
  const styles = []
  for (const xf of cellXfs.matchAll(/<xf\b[^>]*\/?>/g)) {
    const id = Number(getAttr(xf[0], 'numFmtId')) || 0
    styles.push(isDateFormat(id, customFormats.get(id)))
  }
  return styles
}

function columnIndex(ref) {
  const letters = (String(ref || '').match(/^[A-Z]+/i) || [''])[0].toUpperCase()
  let index = 0
  for (const ch of letters) index = index * 26 + (ch.charCodeAt(0) - 64)
  return index - 1
}

function excelSerialToText(serial) {
  const num = Number(serial)
  if (!Number.isFinite(num)) return String(serial)
  // Excel 以 1899-12-30 为起点（兼容 1900 闰年 bug）
  const date = new Date(Date.UTC(1899, 11, 30) + Math.round(num * 86400000))
  if (Number.isNaN(date.getTime())) return String(serial)
  const pad = n => String(n).padStart(2, '0')
  const y = date.getUTCFullYear()
  const mo = pad(date.getUTCMonth() + 1)
  const d = pad(date.getUTCDate())
  if (num % 1 === 0) return `${y}-${mo}-${d}`
  const h = pad(date.getUTCHours())
  const mi = pad(date.getUTCMinutes())
  const s = pad(date.getUTCSeconds())
  return `${y}-${mo}-${d} ${h}:${mi}:${s}`
}

function sanitizeCell(value) {
  return String(value ?? '').replace(/\r?\n/g, ' / ').replace(/\t/g, ' ')
}

function readCell(attrs, inner, sharedStrings, dateStyles, date1904) {
  const type = getAttr(attrs, 't')
  const valueMatch = inner.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)
  const textMatch = inner.match(/<t\b[^>]*>([\s\S]*?)<\/t>/)
  const raw = valueMatch ? decodeXml(valueMatch[1]) : textMatch ? decodeXml(textMatch[1]) : ''

  if (type === 's') {
    const index = Number(raw)
    return sharedStrings[index] ?? ''
  }
  if (type === 'inlineStr' || type === 'str' || type === 'd' || type === 'e') return raw
  if (type === 'b') return raw === '1' ? 'TRUE' : 'FALSE'
  if (!raw) return ''

  const styleIndex = Number(getAttr(attrs, 's'))
  if (dateStyles[styleIndex]) {
    return excelSerialToText(Number(raw) + (date1904 ? 1462 : 0))
  }
  return raw
}

function parseSheet(xml, sharedStrings, dateStyles, date1904) {
  const lines = []
  for (const row of String(xml).matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = []
    for (const cell of row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cell[1] || ''
      const inner = cell[2] || ''
      const ref = getAttr(attrs, 'r')
      const index = ref ? columnIndex(ref) : cells.length
      if (index < 0 || index > 1000) continue
      cells[index] = sanitizeCell(readCell(attrs, inner, sharedStrings, dateStyles, date1904))
    }
    while (cells.length && cells[cells.length - 1] === '') cells.pop()
    if (!cells.length || !cells.some(v => v !== '')) continue
    lines.push(cells.map(v => v ?? '').join('\t'))
    if (lines.length >= MAX_ROWS_PER_SHEET) break
  }
  return lines.join('\n')
}

function parseRelationships(xml) {
  const map = new Map()
  for (const rel of String(xml || '').matchAll(/<Relationship\b[^>]*\/?>/g)) {
    const id = getAttr(rel[0], 'Id')
    const target = getAttr(rel[0], 'Target')
    if (id && target) map.set(id, target)
  }
  return map
}

function resolveSheetPath(target) {
  const path = String(target || '').replace(/\\/g, '/')
  if (path.startsWith('/')) return path.slice(1)
  if (path.startsWith('xl/')) return path
  return `xl/${path}`
}

/**
 * 解析 .xlsx 文件并返回可直接作为提示词上下文的文本。
 * 多个工作表会带 "### Sheet: 名称" 分隔；空表返回空字符串。
 */
export async function parseXlsxFile(file) {
  let zip
  try {
    zip = await JSZip.loadAsync(await file.arrayBuffer())
  } catch {
    throw new Error('Excel 文件无法解压，可能已损坏或不是 .xlsx 格式')
  }

  const workbook = await readText(zip, 'xl/workbook.xml')
  if (!workbook) throw new Error('缺少 workbook.xml，不是有效的 Excel 文件')

  const rels = parseRelationships(await readText(zip, 'xl/_rels/workbook.xml.rels'))
  const sharedStrings = parseSharedStrings(await readText(zip, 'xl/sharedStrings.xml'))
  const dateStyles = parseDateStyles(await readText(zip, 'xl/styles.xml'))
  const workbookPr = (workbook.match(/<workbookPr\b[^>]*\/?>/) || [''])[0]
  const date1904 = getAttr(workbookPr, 'date1904') === '1'

  const sheets = []
  for (const sheet of workbook.matchAll(/<sheet\b[^>]*\/?>/g)) {
    sheets.push({
      name: getAttr(sheet[0], 'name') || `Sheet${sheets.length + 1}`,
      rid: getAttr(sheet[0], 'r:id'),
    })
  }

  const blocks = []
  let totalChars = 0
  for (const sheet of sheets.slice(0, MAX_SHEETS)) {
    const target = rels.get(sheet.rid)
    if (!target) continue
    const xml = await readText(zip, resolveSheetPath(target))
    if (!xml) continue
    const body = parseSheet(xml, sharedStrings, dateStyles, date1904)
    if (!body) continue

    const block = `### Sheet: ${sheet.name}\n${body}`
    if (totalChars + block.length > MAX_TOTAL_CHARS) {
      const remain = Math.max(0, MAX_TOTAL_CHARS - totalChars)
      blocks.push(`${block.slice(0, remain)}\n…（数据过长已截断）`)
      break
    }
    blocks.push(block)
    totalChars += block.length
  }

  if (!blocks.length) throw new Error('表格中没有可读取的数据')
  return blocks.join('\n\n')
}
