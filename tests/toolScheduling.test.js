import { describe, it, expect } from 'vitest'
import {
  isParallelSafe,
  planCallBatches,
  archiveToolResults,
  toolResultBrief,
} from '../src/services/tools.js'

const files = action => ({ tool: 'files', args: { action, path: 'a.js' } })

describe('isParallelSafe', () => {
  it('只读的 files 动作可并行', () => {
    for (const action of ['list', 'search', 'find', 'read']) {
      expect(isParallelSafe(files(action))).toBe(true)
    }
  })
  it('写入、运行、浏览器、无效调用保持串行', () => {
    for (const action of ['write', 'edit', 'append', 'mkdir', 'rename', 'move', 'copy', 'delete', 'run']) {
      expect(isParallelSafe(files(action))).toBe(false)
    }
    expect(isParallelSafe({ tool: 'browser', args: { action: 'read' } })).toBe(false)
    expect(isParallelSafe({ tool: '__invalid__', args: {} })).toBe(false)
  })
  it('无状态工具可并行，计算沙箱不并行', () => {
    expect(isParallelSafe({ tool: 'search_web', args: {} })).toBe(true)
    expect(isParallelSafe({ tool: 'draw_chart', args: {} })).toBe(true)
    expect(isParallelSafe({ tool: 'read_document', args: {} })).toBe(true)
    expect(isParallelSafe({ tool: 'calculate', args: {} })).toBe(false)
  })
})

describe('planCallBatches', () => {
  it('连续只读合成一批，写操作单独成批且顺序不变', () => {
    const calls = [
      { tool: 'search_web', args: {} },
      files('read'),
      files('write'),
      { tool: 'draw_chart', args: {} },
    ]
    const batches = planCallBatches(calls)
    expect(batches.map(b => [b.parallel, b.items.length, b.start])).toEqual([
      [true, 2, 0],
      [false, 1, 2],
      [true, 1, 3],
    ])
    expect(batches.map(b => b.items.map(c => c.tool).join(','))).toEqual([
      'search_web,files',
      'files',
      'draw_chart',
    ])
  })

  it('并行批有上限', () => {
    const calls = Array.from({ length: 6 }, () => ({ tool: 'search_web', args: {} }))
    expect(planCallBatches(calls).map(b => b.items.length)).toEqual([4, 2])
    expect(planCallBatches(calls, 2).map(b => b.items.length)).toEqual([2, 2, 2])
  })

  it('空列表不产生批次', () => {
    expect(planCallBatches([])).toEqual([])
    expect(planCallBatches(undefined)).toEqual([])
  })
})

describe('toolResultBrief', () => {
  it('每步留一行记录并标注轮次', () => {
    const brief = toolResultBrief(2, [
      { call: files('read'), result: { ok: true, record: `files：read a.js\n第二行不该出现` } },
      { call: { tool: 'search_web' }, result: { ok: false, record: '失败：超时' } },
    ])
    expect(brief).toContain('第 2 轮工具结果已归档')
    expect(brief).toContain('✓ files：read a.js')
    expect(brief).toContain('✕ 失败：超时')
    expect(brief).not.toContain('第二行不该出现')
  })
  it('没有 record 时退化到工具名', () => {
    expect(toolResultBrief(1, [{ call: { tool: 'calculate' }, result: { ok: true } }])).toContain('✓ calculate：完成')
  })
})

describe('archiveToolResults', () => {
  const longText = 'x'.repeat(5000)
  const message = round => ({
    role: 'user',
    content: `【工具执行结果】\n${longText}`,
    toolResult: true,
    toolBrief: `【第 ${round} 轮工具结果已归档】\n✓ files：read a.js`,
  })

  it('更早轮次换成摘要，最近一轮保留全文', () => {
    const out = archiveToolResults([message(1), { role: 'assistant', content: '好' }, message(2)])
    expect(out[0].content).toContain('已归档')
    expect(out[1].content).toBe('好')
    expect(out[2].content).toBe(message(2).content)
  })

  it('压缩时顺手去掉历史截图', () => {
    const withShot = { ...message(1), images: ['data:image/png;base64,aa'] }
    const out = archiveToolResults([withShot, message(2)])
    expect(out[0].images).toBeUndefined()
    expect(out[0].content).toContain('已归档')
    // 最近一轮保留正文，否则上一轮 read 到的 old_text 就没了
    expect(out[1].content).toContain('x'.repeat(100))
  })

  it('省不了多少就不动，避免无意义改写', () => {
    const small = { role: 'user', content: '短结果', toolResult: true, toolBrief: '也很短的摘要' }
    expect(archiveToolResults([small])[0].content).toBe('短结果')
  })

  it('没有摘要的历史消息保持原样', () => {
    const bare = { role: 'user', content: longText, toolResult: true }
    expect(archiveToolResults([bare])[0].content).toBe(longText)
  })

  it('最近一轮没有 toolBrief 时仍按全文处理', () => {
    const bare = { role: 'user', content: longText, toolResult: true }
    const out = archiveToolResults([bare, message(2)])
    expect(out[0].content).toBe(longText)
  })
})
