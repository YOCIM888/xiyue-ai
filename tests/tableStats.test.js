import { describe, it, expect } from 'vitest'
import { analyzeTableText, detectDelimiter, parseDelimited, toNumber } from '../src/services/sandbox/tableStats.js'

describe('detectDelimiter', () => {
  it('识别逗号', () => {
    expect(detectDelimiter(['a,b,c', '1,2,3'])).toBe(',')
  })
  it('识别制表符', () => {
    expect(detectDelimiter(['a\tb\tc', '1\t2\t3'])).toBe('\t')
  })
  it('识别分号与竖线', () => {
    expect(detectDelimiter(['a;b;c', '1;2;3'])).toBe(';')
    expect(detectDelimiter(['a|b|c', '1|2|3'])).toBe('|')
  })
  it('引号内的分隔符不计数', () => {
    expect(detectDelimiter(['"a,b",c', '"d,e",f'])).toBe(',')
  })
  it('空输入回退逗号', () => {
    expect(detectDelimiter([])).toBe(',')
    expect(detectDelimiter(['', '  '])).toBe(',')
  })
})

describe('parseDelimited', () => {
  it('基础解析', () => {
    expect(parseDelimited('a,b\n1,2', ',')).toEqual([['a', 'b'], ['1', '2']])
  })
  it('引号包裹的分隔符保留为字段内容', () => {
    expect(parseDelimited('"a,b",c', ',')).toEqual([['a,b', 'c']])
  })
  it('双引号转义', () => {
    expect(parseDelimited('"a""b",c', ',')).toEqual([['a"b', 'c']])
  })
  it('引号内换行保留', () => {
    expect(parseDelimited('"a\nb",c', ',')).toEqual([['a\nb', 'c']])
  })
  it('CRLF 归一化', () => {
    expect(parseDelimited('a,b\r\n1,2\r\n', ',')).toEqual([['a', 'b'], ['1', '2']])
  })
  it('保留末尾空字段', () => {
    expect(parseDelimited('a,', ',')).toEqual([['a', '']])
  })
})

describe('toNumber', () => {
  it.each([
    ['123', 123],
    ['1,234.5', 1234.5],
    ['¥99', 99],
    ['$1,000', 1000],
    ['50%', 50],
    ['-3.5', -3.5],
    ['1e3', 1000],
    [' 42 ', 42],
  ])('解析 %s', (input, expected) => {
    expect(toNumber(input)).toBe(expected)
  })
  it.each([['abc'], [''], ['12abc'], [null], ['NaN']])('拒绝 %s', (input) => {
    expect(toNumber(input)).toBeNull()
  })
})

describe('analyzeTableText', () => {
  it('带表头的数值列统计', () => {
    const summary = analyzeTableText('name,score\nalice,10\nbob,20\n')
    expect(summary).toContain('2 行 × 2 列')
    expect(summary).toContain('score（数值）')
    expect(summary).toContain('合计 30')
    expect(summary).toContain('均值 15')
    expect(summary).toContain('中位数 15')
    expect(summary).toContain('name（文本）')
  })
  it('纯数字首行不当作表头', () => {
    const summary = analyzeTableText('1,2\n3,4')
    expect(summary).toContain('列1')
    expect(summary).toContain('2 行 × 2 列')
    expect(summary).toContain('合计 4')
  })
  it('缺失值统计', () => {
    const summary = analyzeTableText('a,b\n1,\n2,NA')
    expect(summary).toContain('缺失值：b 2')
  })
  it('重复行统计', () => {
    const summary = analyzeTableText('a,b\n1,2\n1,2')
    expect(summary).toContain('重复行：1 行')
  })
  it('文本列 Top 频次', () => {
    const summary = analyzeTableText('item\n苹果\n苹果\n香蕉')
    expect(summary).toContain('苹果(2)')
    expect(summary).toContain('唯一值 2')
  })
  it('多工作表分段', () => {
    const summary = analyzeTableText('### Sheet: 销售\na,b\n1,2\n### Sheet: 库存\nx,y\n3,4')
    expect(summary).toContain('【工作表：销售】')
    expect(summary).toContain('【工作表：库存】')
  })
  it('BOM 不污染表头', () => {
    const summary = analyzeTableText('\uFEFFa,b\n1,2')
    expect(summary).toContain('- a（数值）')
  })
  it('空输入返回空串', () => {
    expect(analyzeTableText('')).toBe('')
    expect(analyzeTableText('  \n  ')).toBe('')
  })
})