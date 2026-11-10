import { describe, expect, it } from 'vitest'
import { parseSourceMap, remapPosition, remapStack } from '../src/services/sandbox/sourceMap'

// mappings 'AAAA;IAIE' = 生成第 1 行第 0 列 → 源 1:0；生成第 2 行第 4 列 → 源 5:2
const LINES = parseSourceMap({ version: 3, mappings: 'AAAA;IAIE' })

describe('parseSourceMap', () => {
  it('按行拆段并累计行/列增量', () => {
    expect(LINES[0]).toEqual([{ genCol: 0, line: 1, column: 0 }])
    expect(LINES[1]).toEqual([{ genCol: 4, line: 5, column: 2 }])
  })

  it('接受 JSON 字符串，坏输入返回 null', () => {
    expect(parseSourceMap('{"version":3,"mappings":"AAAA"}')[0]).toHaveLength(1)
    expect(parseSourceMap('{oops')).toBeNull()
    expect(parseSourceMap('{"version":3}')).toBeNull()
    expect(parseSourceMap(null)).toBeNull()
  })

  it('多字节 VLQ 与负增量解析正确', () => {
    // 生成列 32 需要两个 base64 位；第三行的源行增量是 -1
    const lines = parseSourceMap({ mappings: 'gCACA;AACA;AADA' })
    expect(lines[0]).toEqual([{ genCol: 32, line: 2, column: 0 }])
    expect(lines[1]).toEqual([{ genCol: 0, line: 3, column: 0 }])
    expect(lines[2]).toEqual([{ genCol: 0, line: 2, column: 0 }])
  })
})

describe('remapPosition', () => {
  it('取最后一个起点不超过目标列的段', () => {
    expect(remapPosition(LINES, 2, 9)).toEqual({ line: 5, column: 2 })
    expect(remapPosition(LINES, 2, 1)).toBeNull()
    expect(remapPosition(LINES, 9, 0)).toBeNull()
    expect(remapPosition(null, 1, 0)).toBeNull()
  })
})

describe('remapStack', () => {
  it('把栈里的转译后坐标换算回源文件', () => {
    const maps = { 'src/a.ts': { lines: LINES, shift: 0 } }
    expect(remapStack('at run (src/a.ts:2:6)', maps)).toBe('at run (src/a.ts:5:3)')
  })

  it('没有映射的行号只叠加偏移（.vue 脚本挪位）', () => {
    const maps = { 'App.vue': { lines: null, shift: 3 } }
    expect(remapStack('at setup (App.vue:10:1)', maps)).toBe('at setup (App.vue:13:1)')
  })

  it('无关路径与越界结果原样保留', () => {
    const maps = { 'src/a.ts': { lines: LINES, shift: 0 } }
    expect(remapStack('at other.js:2:6', maps)).toBe('at other.js:2:6')
    expect(remapStack('at App.vue:1:1', { 'App.vue': { lines: null, shift: -9 } })).toBe('at App.vue:1:1')
    expect(remapStack('anything:1:1', {})).toBe('anything:1:1')
  })
})
