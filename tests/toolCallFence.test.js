import { describe, it, expect } from 'vitest'
import {
  extractToolCalls,
  executeToolCall,
  stripToolBlocks,
  stripStreamingToolBlocks,
  stripIncompleteToolCalls,
  toolUsageHint,
  shouldShowUsageHint,
  callSignature,
  describeCall,
  createWriteBudget,
} from '../src/services/tools.js'

describe('json 围栏里的工具调用', () => {
  it('没有 tool 围栏时执行 json 调用，并从展示文本里剥掉', () => {
    const content = '先查一下。\n```json\n{"tool":"search_web","args":{"query":"天气"}}\n```\n然后继续。'
    expect(extractToolCalls(content)).toEqual([{ tool: 'search_web', args: { query: '天气' } }])
    expect(stripToolBlocks(content)).toBe('先查一下。\n\n然后继续。')
  })

  it('普通 JSON 数据既不执行也不删除', () => {
    const content = '配置示例：\n```json\n{"host":"127.0.0.1","port":8080}\n```'
    expect(extractToolCalls(content)).toEqual([])
    expect(stripToolBlocks(content)).toBe(content)
  })

  it('已经有 tool 围栏时不再猜 json，讲解调用格式的示例保留给用户', () => {
    const json = '```json\n{"tool":"search_web","args":{"query":"a"}}\n```'
    const tool = '```tool\n{"tool":"calculate","args":{"lang":"js","code":"return 1"}}\n```'
    const content = `${json}\n${tool}`
    const calls = extractToolCalls(content)
    expect(calls).toHaveLength(1)
    expect(calls[0].tool).toBe('calculate')
    expect(stripToolBlocks(content)).toBe(json)
  })

  it('别名与大小写照样识别', () => {
    expect(extractToolCalls('```JSON\n{"name":"files","arguments":{"action":"list"}}\n```')).toEqual([
      { tool: 'files', args: { action: 'list' } },
    ])
  })

  it('残缺或非法的 json 内容当普通文本处理', () => {
    const broken = '```json\n{"tool":"search_web","args":\n```'
    expect(extractToolCalls(broken)).toEqual([])
    expect(stripToolBlocks(broken)).toBe(broken)
  })

  it('超出上限的 json 调用不执行但依然剥离', () => {
    const block = index => `\`\`\`json\n{"tool":"calculate","args":{"lang":"js","code":"return ${index}"}}\n\`\`\``
    const content = [0, 1, 2, 3].map(block).join('\n')
    expect(extractToolCalls(content, 2)).toHaveLength(2)
    expect(stripToolBlocks(content)).toBe('')
  })
})

// 回归：模型（尤其长上下文/工作模式多轮之后）会漏写 ```tool，直接把 JSON 吐在正文里。
// 以前这类回答 extractToolCalls 返回空数组 → 工具循环 break → 回答原地结束，JSON 被当正文渲染。
describe('裸 JSON 工具调用兜底', () => {
  it('单个裸调用照样执行并从展示里剥掉', () => {
    const content = '我看看文件。\n{"tool":"files","args":{"action":"read","path":"js/core.js"}}'
    expect(extractToolCalls(content)).toEqual([
      { tool: 'files', args: { action: 'read', path: 'js/core.js' } },
    ])
    expect(stripToolBlocks(content)).toBe('我看看文件。')
  })

  it('多个裸 JSON 挤在一行、甚至跨行断裂也能全部识别', () => {
    // 复刻 BUG 截图里的输出：同行多个对象 + "args": 之后的换行 + 重复键
    const content = [
      '{"tool":"files","args":{"action":"read","path":"js/core.js"}} {"tool":"files","args":{"action":"read","path":"js/input.js"}}',
      '{"tool":"files","args":{"action":"read","action":"read","path":"tests/logic.test.js"}} {"tool":"files","args":',
      '{"action":"read","path":"css/style.css"}}',
    ].join('\n')
    expect(extractToolCalls(content)).toEqual([
      { tool: 'files', args: { action: 'read', path: 'js/core.js' } },
      { tool: 'files', args: { action: 'read', path: 'js/input.js' } },
      { tool: 'files', args: { action: 'read', path: 'tests/logic.test.js' } },
      { tool: 'files', args: { action: 'read', path: 'css/style.css' } },
    ])
    expect(stripToolBlocks(content)).toBe('')
  })

  it('工具别名、name/arguments 写法同样兜底', () => {
    expect(extractToolCalls('{"name":"FS","arguments":{"action":"list"}}')).toEqual([
      { tool: 'files', args: { action: 'list' } },
    ])
  })

  it('普通 JSON 数据与讲解示例不被误执行', () => {
    const data = '配置：{"host":"127.0.0.1","port":8080}'
    const example = '例如 {"tool":"files","args":{"action":"read","path":"a.js"}} 这样写'
    const inline = '写法是 `{"tool":"files","args":{"action":"list"}}`。'
    for (const content of [data, example, inline]) {
      expect(extractToolCalls(content)).toEqual([])
      expect(stripToolBlocks(content)).toBe(content)
    }
  })

  it('代码块里的 JSON 不被裸扫描重复识别', () => {
    const jsFence = '示例：\n```js\nconst call = {"tool":"files","args":{"action":"list"}}\n```'
    expect(extractToolCalls(jsFence)).toEqual([])
    expect(stripToolBlocks(jsFence)).toBe(jsFence)
    const jsonFence = '```json\n{"tool":"files","args":{"action":"list"}}\n```'
    expect(extractToolCalls(jsonFence)).toEqual([
      { tool: 'files', args: { action: 'list' } },
    ])
  })

  it('未闭合 tool 围栏里的完整 JSON 也能回收', () => {
    const content = '读一下\n```tool\n{"tool":"files","args":{"action":"read","path":"a.js"}}'
    expect(extractToolCalls(content)).toEqual([
      { tool: 'files', args: { action: 'read', path: 'a.js' } },
    ])
    expect(stripToolBlocks(content)).toBe('读一下')
  })

  it('写坏但闭合的裸调用给模型一次格式反馈，而不是静默结束', () => {
    const content = '{"tool":"files","args":{"action":"read",}}'
    const calls = extractToolCalls(content)
    expect(calls).toHaveLength(1)
    expect(calls[0].tool).toBe('__invalid__')
    expect(stripToolBlocks(content)).toBe('')
  })

  it('没写完的裸调用只隐藏、不执行', () => {
    const partial = '查一下\n{"tool":"search_web","args":{"query":"天气'
    expect(extractToolCalls(partial)).toEqual([])
    expect(stripToolBlocks(partial)).toBe('查一下')
    expect(stripStreamingToolBlocks(partial)).toBe('查一下')
    expect(stripIncompleteToolCalls(partial)).toBe('查一下')
  })

  it('收尾清理不动正常正文', () => {
    const content = '读完了，一共两个文件。\n\n- a.js\n- b.js\n'
    expect(stripIncompleteToolCalls(content)).toBe(content)
  })
})

describe('stripStreamingToolBlocks 对 json 调用', () => {
  it('未闭合但已能认出工具名时先藏起来', () => {
    expect(stripStreamingToolBlocks('查一下：\n```json\n{"tool":"search_web","args":{"que')).toBe('查一下：')
  })
  it('未闭合的普通 JSON 数据照常展示', () => {
    expect(stripStreamingToolBlocks('配置：\n```json\n{"host":"127.0.0.1","po')).toBe('配置：\n```json\n{"host":"127.0.0.1","po')
  })
  it('未闭合 json 之后的正文不受影响', () => {
    const content = '配置：\n```json\n{"host":"127.0.0.1"}\n```\n下面继续说明。'
    expect(stripStreamingToolBlocks(content)).toBe(content)
  })
})

describe('失败反馈', () => {
  it('已知工具回灌自己的标准写法', () => {
    expect(toolUsageHint('files')).toContain('"tool":"files"')
  })
  it('无法识别时给出可用工具清单', () => {
    const hint = toolUsageHint('__invalid__')
    expect(hint).toContain('search_web')
    expect(hint).toContain('没被识别')
  })
  it('未知工具名不编造示例', () => {
    expect(toolUsageHint('do_something_odd')).toContain('可用工具')
  })
  it('技能未开启属于拒绝，不带 refused 以外的格式提示', async () => {
    const result = await executeToolCall(
      { tool: 'files', args: { action: 'list' } },
      { settings: { workModeEnabled: false } }
    )
    expect(result).toMatchObject({ ok: false, refused: true })
  })
  it('无效调用仍然报错', async () => {
    const result = await executeToolCall({ tool: '__invalid__', args: {}, raw: '{', error: '工具调用 JSON 解析失败' }, {})
    expect(result.ok).toBe(false)
    expect(result.text).toContain('解析失败')
  })
  it('只在调用写错时附示例', () => {
    expect(shouldShowUsageHint({ tool: '__invalid__' }, { ok: false, text: '工具调用 JSON 解析失败' })).toBe(true)
    expect(shouldShowUsageHint({ tool: 'files' }, { ok: false, text: 'files write 需要 content 参数' })).toBe(true)
    expect(shouldShowUsageHint({ tool: 'files' }, { ok: false, refused: true, text: '工作模式未开启' })).toBe(false)
    expect(shouldShowUsageHint({ tool: 'search_web' }, { ok: false, text: '搜索请求失败：网络超时' })).toBe(false)
    expect(shouldShowUsageHint({ tool: 'search_web' }, { ok: true, text: '结果' })).toBe(false)
  })
})

describe('重复调用指纹', () => {
  it('参数顺序不影响指纹，内容不同则不同', () => {
    const a = callSignature({ tool: 'files', args: { action: 'edit', path: 'a.js' } })
    const b = callSignature({ tool: 'files', args: { path: 'a.js', action: 'edit' } })
    expect(a).toBe(b)
    expect(callSignature({ tool: 'files', args: { action: 'edit', path: 'b.js' } })).not.toBe(a)
  })
  it('格式错误的调用按原始文本比较', () => {
    const bad = { tool: '__invalid__', args: {}, raw: '{"tool":"sear' }
    expect(callSignature(bad)).toBe(callSignature({ ...bad }))
    expect(describeCall(bad)).toContain('格式错误的调用')
  })
  it('描述优先给出最能辨认的参数', () => {
    expect(describeCall({ tool: 'files', args: { action: 'run', path: 'tests/x.js' } })).toBe('files run')
    expect(describeCall({ tool: 'search_web', args: { query: 'AI 新闻' } })).toBe('search_web AI 新闻')
  })
})

describe('写入额度回显', () => {
  it('按已用量递减剩余文件数', () => {
    const budget = createWriteBudget({ maxFiles: 3, maxBytes: 1024 })
    expect(budget.remainingText()).toContain('剩余 3 个文件')
    budget.charge(10)
    expect(budget.remainingText()).toContain('剩余 2 个文件')
  })
  it('超额时报错信息说明是整条回答累计', () => {
    const budget = createWriteBudget({ maxFiles: 1, maxBytes: 10 })
    budget.charge(1)
    expect(() => budget.charge(1)).toThrow(/整条回答/)
  })
})
