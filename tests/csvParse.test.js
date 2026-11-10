import { describe, expect, it } from 'vitest'
import { detectDelimiter, parseDelimited } from '../src/utils/csvParse'

describe('parseDelimited', () => {
  it('解析普通 CSV', () => {
    const { rows, truncated } = parseDelimited('name,age\nAlice,30\nBob,25')
    expect(rows).toEqual([['name', 'age'], ['Alice', '30'], ['Bob', '25']])
    expect(truncated).toBe(false)
  })

  it('支持引号、逗号与转义引号', () => {
    const { rows } = parseDelimited('a,"b,c","say ""hi"""\n1,2,3')
    expect(rows[0]).toEqual(['a', 'b,c', 'say "hi"'])
  })

  it('支持字段内换行', () => {
    const { rows } = parseDelimited('a,"line1\nline2"\n')
    expect(rows[0]).toEqual(['a', 'line1\nline2'])
  })

  it('处理 CRLF 与空行', () => {
    const { rows } = parseDelimited('a,b\r\n1,2\r\n')
    expect(rows).toEqual([['a', 'b'], ['1', '2']])
  })

  it('识别分隔符', () => {
    expect(detectDelimiter('data.tsv', 'a\tb')).toBe('\t')
    expect(detectDelimiter('data.csv', 'a;b')).toBe(';')
    expect(detectDelimiter('data.csv', 'a,b')).toBe(',')
  })
})
