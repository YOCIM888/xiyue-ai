import { describe, expect, it } from 'vitest'
import {
  estimateMessageTokens, estimateMessagesTokens, estimatePartsTokens, estimateTokens,
} from '../src/utils/contextUsage'

describe('estimateTokens', () => {
  it('中文与英文按不同比例折算', () => {
    expect(estimateTokens('')).toBe(0)
    expect(estimateTokens('abcd')).toBe(1)
    expect(estimateTokens('中文')).toBe(2)
  })
})

describe('estimateMessageTokens', () => {
  it('普通消息只统计正文与基础开销', () => {
    expect(estimateMessageTokens({ content: 'abcd' })).toBe(5)
  })

  it('计入思考内容', () => {
    expect(estimateMessageTokens({ content: 'abcd', thinking: 'efgh' })).toBe(6)
  })

  it('正文与文字分段不重复计算', () => {
    const message = {
      content: 'Hello world',
      parts: [
        { type: 'text', content: 'Hello ' },
        { type: 'text', content: 'world' },
      ],
    }
    expect(estimateMessageTokens(message)).toBe(4 + estimateTokens('Hello world'))
  })

  it('计入工具执行链的步骤与备注', () => {
    const message = {
      content: 'Hello world',
      parts: [
        { type: 'text', content: 'Hello ' },
        { type: 'text', content: 'world' },
        {
          type: 'trace',
          round: 1,
          steps: [{ tool: 'files', summary: 'ok', output: '12345678' }],
          notes: ['note'],
        },
      ],
    }
    // 4 基础 + 3 正文 + 6 轮次开销 + 1 summary + 2 output + 1 note
    expect(estimateMessageTokens(message)).toBe(17)
  })

  it('同源思考不重复累计：顶层/思考分段与执行链思考同文时去重', () => {
    const same = 'x'.repeat(400)
    const trace = { type: 'trace', thinking: same, steps: [] }
    const dupTop = { content: 'a', thinking: same, parts: [trace] }
    const dupPart = { content: 'a', parts: [trace, { type: 'thinking', content: same }] }
    const distinct = { content: 'a', thinking: 'b', parts: [trace] }
    expect(estimateMessageTokens(dupTop)).toBe(4 + 1 + 100 + 6)
    expect(estimateMessageTokens(dupPart)).toBe(4 + 1 + 100 + 6)
    expect(estimateMessageTokens(distinct)).toBe(4 + 1 + 1 + 6 + 100)
  })

  it('多轮执行链的思考逐轮累计', () => {
    const message = {
      content: 'ok',
      parts: [
        { type: 'trace', thinking: 'aaaa', steps: [] },
        { type: 'trace', thinking: 'bbbb', steps: [] },
        { type: 'thinking', content: 'cccc' },
      ],
    }
    // 4 基础 + 1 正文 + 1 思考分段 + 6*2 轮次开销 + 1+1 历史轮思考
    expect(estimateMessageTokens(message)).toBe(4 + 1 + 1 + 12 + 2)
  })

  it('兼容旧版 toolTrace', () => {
    const message = {
      content: 'abcd',
      toolTrace: [{ steps: [{ summary: 'done', output: 'x'.repeat(40) }] }],
    }
    // 5 + 6 轮次开销 + 1 summary + 10 output
    expect(estimateMessageTokens(message)).toBe(22)
  })

  it('图片按固定开销估算', () => {
    expect(estimateMessageTokens({ content: '', images: ['a', 'b'] })).toBe(4 + 1600)
  })
})

describe('estimatePartsTokens', () => {
  const parts = [
    { type: 'text', content: 'abcd' },
    { type: 'trace', thinking: 'x'.repeat(8), steps: [], notes: [] },
  ]

  it('默认为流式内容计入思考', () => {
    expect(estimatePartsTokens(parts)).toBe(1 + 6 + 2)
  })

  it('可排除与顶层思考重复的分段思考', () => {
    expect(estimatePartsTokens(parts, { includeThinking: false })).toBe(1 + 6)
  })
})

describe('estimateMessagesTokens', () => {
  it('累加所有消息', () => {
    expect(estimateMessagesTokens([
      { content: 'abcd' },
      { content: 'efgh', thinking: 'ijkl' },
      null,
    ])).toBe(5 + 6)
  })
})
