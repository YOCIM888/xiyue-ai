import { describe, it, expect } from 'vitest'
import { stripToolBlocks, stripStreamingToolBlocks } from '../src/services/tools.js'

describe('stripToolBlocks', () => {
  it('移除完整的工具代码块，保留正文', () => {
    const content = '先查一下。\n```tool\n{"tool":"search_web","args":{"query":"天气"}}\n```\n然后继续。'
    expect(stripToolBlocks(content)).toBe('先查一下。\n\n然后继续。')
  })
  it('移除 sandbox 别名代码块', () => {
    expect(stripToolBlocks('计算：\n```calc-js\nreturn 1 + 1\n```')).toBe('计算：')
  })
})

describe('stripStreamingToolBlocks', () => {
  it('保留普通流式文本', () => {
    expect(stripStreamingToolBlocks('正在思考这个问题')).toBe('正在思考这个问题')
  })
  it('隐藏尚未闭合的工具代码块（代码块在开头）', () => {
    const partial = '```tool\n{"tool":"search_web","args":{"que'
    expect(stripStreamingToolBlocks(partial)).toBe('')
  })
  it('隐藏尚未闭合的工具代码块，保留前文', () => {
    const partial = '我先搜索一下。\n```tool\n{"tool":"search_web","args":{"que'
    expect(stripStreamingToolBlocks(partial)).toBe('我先搜索一下。')
  })
  it('隐藏尚未闭合的 sandbox 代码块', () => {
    const partial = '算一下：\n```calc-python\nprint(1'
    expect(stripStreamingToolBlocks(partial)).toBe('算一下：')
  })
  it('语言标记只打了一半时也不闪现', () => {
    expect(stripStreamingToolBlocks('先搜索。\n```to')).toBe('先搜索。')
    expect(stripStreamingToolBlocks('算一下：\n```calc-p')).toBe('算一下：')
  })
  it('普通代码块的语言标记不受影响', () => {
    expect(stripStreamingToolBlocks('示例：\n```js')).toBe('示例：\n```js')
  })
  it('完整工具块同样不展示', () => {
    const content = '查资料：\n```tool\n{"tool":"search_web","args":{"query":"x"}}\n```'
    expect(stripStreamingToolBlocks(content)).toBe('查资料：')
  })
  it('普通代码块不受影响', () => {
    const content = '示例：\n```js\nconst a = 1\n```'
    expect(stripStreamingToolBlocks(content)).toBe(content)
  })
})

describe('裸 JSON 工具调用的流式隐藏', () => {
  it('完整的裸调用不闪现', () => {
    expect(stripStreamingToolBlocks('读文件\n{"tool":"files","args":{"action":"read","path":"a.js"}}'))
      .toBe('读文件')
  })
  it('刚吐出半截键名就藏起来', () => {
    expect(stripStreamingToolBlocks('读文件\n{"tool')).toBe('读文件')
    expect(stripStreamingToolBlocks('读文件\n{"tool":"files","args":{"que')).toBe('读文件')
  })
  it('同行第二个裸调用照样隐藏', () => {
    const content = '{"tool":"files","args":{"action":"list"}} {"tool":"files","args":{"action":"list"}}'
    expect(stripStreamingToolBlocks(content)).toBe('')
  })
  it('普通裸 JSON 数据不被吞掉', () => {
    const content = '配置：{"host":"127.0.0.1","port":8080}'
    expect(stripStreamingToolBlocks(content)).toBe(content)
  })
})
