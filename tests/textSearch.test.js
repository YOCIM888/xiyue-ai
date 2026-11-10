import { describe, expect, it } from 'vitest'
import { createMatcher, findMatches, globToRegExp, splitByRange } from '../src/utils/textSearch'

describe('createMatcher', () => {
  it('默认按字面量子串匹配，正则元字符不生效', () => {
    const matcher = createMatcher({ query: 'a.c' })
    expect(matcher.error).toBeUndefined()
    expect(matcher.test('axc')).toBe(false)
    expect(matcher.test('a.c')).toBe(true)
  })

  it('ignore_case 忽略大小写', () => {
    const matcher = createMatcher({ query: 'Hello', ignoreCase: true })
    expect(matcher.test('say HELLO')).toBe(true)
    expect(createMatcher({ query: 'Hello' }).test('say HELLO')).toBe(false)
  })

  it('regex 模式按正则匹配', () => {
    const matcher = createMatcher({ query: '\\bfoo\\d+', regex: true })
    expect(matcher.test('x foo123 y')).toBe(true)
    expect(matcher.test('foo')).toBe(false)
  })

  it('正则无效时返回可读错误而不是抛异常', () => {
    expect(createMatcher({ query: '([unclosed', regex: true }).error).toContain('正则表达式无效')
  })

  it('带 g 标志的正则不会跨行丢匹配', () => {
    const matcher = createMatcher({ query: 'x', regex: true })
    expect([matcher.test('x'), matcher.test('x'), matcher.test('x')]).toEqual([true, true, true])
  })

  it('空搜索词与超长搜索词都被拒绝', () => {
    expect(createMatcher({ query: '   ' }).error).toContain('不能为空')
    expect(createMatcher({ query: 'a'.repeat(300) }).error).toContain('过长')
  })
})

describe('globToRegExp', () => {
  it('* 不跨目录层级', () => {
    const re = globToRegExp('*.js')
    expect(re.test('main.js')).toBe(true)
    expect(re.test('src/main.js')).toBe(true)
    expect(re.test('src/a/b.js')).toBe(true)
    expect(re.test('main.ts')).toBe(false)
  })

  it('**/ 允许零层目录', () => {
    const re = globToRegExp('src/**/*.js')
    expect(re.test('src/a.js')).toBe(true)
    expect(re.test('src/a/b/c.js')).toBe(true)
    expect(re.test('test/a.js')).toBe(false)
  })

  it('? 只匹配单层内的单个字符', () => {
    const re = globToRegExp('a?.js')
    expect(re.test('ab.js')).toBe(true)
    expect(re.test('a.js')).toBe(false)
  })

  it('点号等元字符被转义', () => {
    expect(globToRegExp('a.js').test('xajayjs')).toBe(false)
  })

  it('空 glob 返回 null 表示不过滤', () => {
    expect(globToRegExp('')).toBeNull()
  })
})

const SAMPLE = [
  'line one',
  'const value = 1',
  'line three',
  'const other = 2',
  'line five',
].join('\n')

describe('findMatches', () => {
  it('返回命中行号与内容', () => {
    const { hits } = findMatches(SAMPLE, createMatcher({ query: 'const' }))
    expect(hits.map(hit => hit.line)).toEqual([2, 4])
    expect(hits.every(hit => hit.matched)).toBe(true)
  })

  it('context 拉入上下文行并标记 matched', () => {
    const { hits } = findMatches(SAMPLE, createMatcher({ query: 'line three' }), { context: 1 })
    expect(hits.map(hit => [hit.line, hit.matched])).toEqual([[2, false], [3, true], [4, false]])
  })

  it('相邻命中的上下文区间合并，不重复输出行', () => {
    const { hits, hitCount } = findMatches(SAMPLE, createMatcher({ query: 'const' }), { context: 1 })
    expect(hitCount).toBe(2)
    expect(hits.map(hit => hit.line)).toEqual([1, 2, 3, 4, 5])
  })

  it('行尾 \\r 被清理', () => {
    const { hits } = findMatches('a\r\nconst b\r\n', createMatcher({ query: 'const' }))
    expect(hits[0].text).toBe('const b')
  })

  it('无命中返回空数组', () => {
    expect(findMatches(SAMPLE, createMatcher({ query: 'zzz' })).hits).toEqual([])
  })

  it('命中行带高亮区间，上下文行没有', () => {
    const { hits } = findMatches(SAMPLE, createMatcher({ query: 'const' }), { context: 1 })
    expect(hits.find(hit => hit.line === 2).range).toEqual({ start: 0, end: 5 })
    expect(hits.find(hit => hit.line === 3).range).toBeNull()
  })

  it('手工构造的匹配器没有 find 时不报错', () => {
    const { hits } = findMatches(SAMPLE, { test: line => line.includes('const') })
    expect(hits).toHaveLength(2)
    expect(hits[0].range).toBeNull()
  })
})

describe('matcher.find', () => {
  it('字面量与忽略大小写都给出区间', () => {
    expect(createMatcher({ query: 'b' }).find('abc')).toEqual({ start: 1, end: 2 })
    expect(createMatcher({ query: 'B', ignoreCase: true }).find('abc')).toEqual({ start: 1, end: 2 })
  })

  it('正则给出实际命中片段区间', () => {
    expect(createMatcher({ query: '\\d+', regex: true }).find('a12b345')).toEqual({ start: 1, end: 3 })
  })

  it('零宽匹配与不匹配都返回 null', () => {
    expect(createMatcher({ query: 'x*', regex: true }).find('aaa')).toBeNull()
    expect(createMatcher({ query: 'zzz' }).find('aaa')).toBeNull()
  })

  it('多次调用同一匹配器状态不串', () => {
    const matcher = createMatcher({ query: 'a', regex: true })
    expect([matcher.find('ba'), matcher.find('ab'), matcher.find('ab')]).toEqual([
      { start: 1, end: 2 },
      { start: 0, end: 1 },
      { start: 0, end: 1 },
    ])
  })
})

describe('splitByRange', () => {
  it('按区间切成命中与未命中片段', () => {
    expect(splitByRange('const value = 1', { start: 0, end: 5 })).toEqual([
      { text: 'const', hit: true },
      { text: ' value = 1', hit: false },
    ])
    expect(splitByRange('const value', { start: 6, end: 11 })).toEqual([
      { text: 'const ', hit: false },
      { text: 'value', hit: true },
    ])
  })

  it('无区间或区间非法时整行作为普通片段', () => {
    expect(splitByRange('abc', null)).toEqual([{ text: 'abc', hit: false }])
    expect(splitByRange('abc', { start: 2, end: 2 })).toEqual([{ text: 'abc', hit: false }])
    expect(splitByRange('abc', { start: 1, end: 9 })).toEqual([{ text: 'abc', hit: false }])
  })
})
