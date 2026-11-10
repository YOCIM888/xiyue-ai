const MAX_ROWS = 400
const MAX_COLS = 40

/** 解析 CSV/TSV 文本为二维数组，支持引号转义与字段内换行 */
export function parseDelimited(text, { delimiter = ',' } = {}) {
  const source = String(text ?? '')
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  let cellLimitHit = false
  let rowLimitHit = false

  const pushField = () => {
    if (row.length < MAX_COLS) row.push(field)
    else cellLimitHit = true
    field = ''
  }
  const pushRow = () => {
    pushField()
    if (rows.length < MAX_ROWS) rows.push(row)
    else rowLimitHit = true
    row = []
  }

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i]
    if (quoted) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          quoted = false
        }
      } else {
        field += ch
      }
      continue
    }
    if (ch === '"') {
      quoted = true
    } else if (ch === delimiter) {
      pushField()
    } else if (ch === '\n') {
      pushRow()
    } else if (ch === '\r') {
      if (source[i + 1] === '\n') i += 1
      pushRow()
    } else {
      field += ch
    }
  }
  if (field || row.length) pushRow()

  return { rows, truncated: cellLimitHit || rowLimitHit }
}

export function detectDelimiter(name, text) {
  const ext = String(name || '').split('.').pop()?.toLowerCase()
  if (ext === 'tsv' || ext === 'tab') return '\t'
  const firstLine = String(text || '').split(/\r?\n/, 1)[0] || ''
  if (firstLine.includes('\t') && !firstLine.includes(',')) return '\t'
  if (firstLine.includes(';') && !firstLine.includes(',')) return ';'
  return ','
}
