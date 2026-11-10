import { describe, expect, it } from 'vitest'
import { diffLines, diffStats } from '../src/utils/lineDiff'

function join(ops, type) {
  return ops.filter(op => op.type === type).map(op => op.text)
}

describe('diffLines', () => {
  it('相同文本全部标记为 same', () => {
    const { ops, truncated } = diffLines('a\nb\nc', 'a\nb\nc')
    expect(truncated).toBe(false)
    expect(ops.every(op => op.type === 'same')).toBe(true)
    expect(diffStats(ops)).toEqual({ added: 0, removed: 0 })
  })

  it('识别新增与删除行', () => {
    const { ops } = diffLines('a\nb\nc', 'a\nx\nc\nd')
    expect(join(ops, 'del')).toEqual(['b'])
    expect(join(ops, 'add')).toEqual(['x', 'd'])
    expect(diffStats(ops)).toEqual({ added: 2, removed: 1 })
  })

  it('空旧文本视为全部新增', () => {
    const { ops } = diffLines('', 'hello\nworld')
    expect(join(ops, 'add')).toEqual(['hello', 'world'])
    expect(diffStats(ops)).toEqual({ added: 2, removed: 0 })
  })

  it('行号保持正确', () => {
    const { ops } = diffLines('a\nb', 'a\nb\nc')
    const add = ops.find(op => op.type === 'add')
    expect(add).toMatchObject({ text: 'c', newLine: 3 })
    expect(ops[0]).toMatchObject({ type: 'same', oldLine: 1, newLine: 1 })
  })

  it('超大文本退化为全删全增并标记 truncated', () => {
    const oldText = Array.from({ length: 1600 }, (_, i) => `old-${i}`).join('\n')
    const newText = Array.from({ length: 1600 }, (_, i) => `new-${i}`).join('\n')
    const { ops, truncated } = diffLines(oldText, newText)
    expect(truncated).toBe(true)
    expect(ops.filter(op => op.type === 'del')).toHaveLength(1600)
    expect(ops.filter(op => op.type === 'add')).toHaveLength(1600)
  })
})
