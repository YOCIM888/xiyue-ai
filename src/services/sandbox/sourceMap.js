/**
 * 最小 sourcemap 读取：只把报错栈里的 路径:行:列 换算回源文件，不需要原文件内容。
 * 转译会让行号整体错位，不回映射的话模型会按一个不存在的行号去改代码。
 */

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const POSITION_RE = /([^\s'"()[\],{}]+):(\d+):(\d+)/g

function decodeVlq(segment) {
  const out = []
  let value = 0
  let shift = 0
  for (const char of segment) {
    const digit = B64.indexOf(char)
    if (digit < 0) break
    const continues = (digit & 32) !== 0
    value += (digit & 31) << shift
    if (continues) {
      shift += 5
      continue
    }
    const negative = (value & 1) === 1
    value >>= 1
    out.push(negative ? -value : value)
    value = 0
    shift = 0
  }
  return out
}

/**
 * @returns {Array<Array<{genCol: number, line: number, column: number}>>|null}
 *          下标 = 生成代码行号 - 1，每项是该行的映射段（按 genCol 递增）
 */
export function parseSourceMap(json) {
  let raw
  try {
    raw = typeof json === 'string' ? JSON.parse(json) : json
  } catch {
    return null
  }
  if (!raw || typeof raw.mappings !== 'string' || !raw.mappings) return null
  let originLine = 0
  let originColumn = 0
  return raw.mappings.split(';').map(line => {
    const entries = []
    let generatedColumn = 0
    for (const segment of line.split(',')) {
      if (!segment) continue
      const fields = decodeVlq(segment)
      if (!fields.length) continue
      generatedColumn += fields[0]
      if (fields.length < 4) continue
      originLine += fields[2]
      originColumn += fields[3]
      entries.push({ genCol: generatedColumn, line: originLine + 1, column: originColumn })
    }
    return entries
  })
}

/** 取该行最后一个起点不超过目标列的映射段 */
export function remapPosition(lines, line, column) {
  const entries = Array.isArray(lines) ? lines[line - 1] : null
  if (!entries?.length) return null
  let best = null
  for (const entry of entries) {
    if (entry.genCol > column) break
    best = entry
  }
  return best ? { line: best.line, column: best.column } : null
}

/**
 * 把栈里的转译后坐标换回源文件坐标。
 * @param {string} text        含 路径:行:列 的报错文本
 * @param {Object} maps        路径 → { lines: parseSourceMap 结果|null, shift: 额外行偏移 }
 */
export function remapStack(text, maps = {}) {
  const paths = Object.keys(maps)
  if (!paths.length) return String(text ?? '')
  const longestFirst = paths.sort((a, b) => b.length - a.length)
  return String(text ?? '').replace(POSITION_RE, (whole, path, line, column) => {
    if (!longestFirst.includes(path)) return whole
    const entry = maps[path]
    const mapped = remapPosition(entry.lines, Number(line), Number(column) - 1)
    const base = mapped ? mapped.line : Number(line)
    const shifted = base + (entry.shift || 0)
    if (!Number.isFinite(shifted) || shifted < 1) return whole
    const nextColumn = mapped ? mapped.column + 1 : Number(column)
    return `${path}:${shifted}:${nextColumn}`
  })
}
