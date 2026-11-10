import { describe, it, expect } from 'vitest'
import { extractSandboxTasks } from '../src/services/sandbox/index.js'

describe('extractSandboxTasks', () => {
  it('提取 JS 代码块', () => {
    expect(extractSandboxTasks('```sandbox-js\nreturn 1 + 1\n```')).toEqual([
      { lang: 'js', code: 'return 1 + 1' },
    ])
  })
  it('提取 Python 代码块', () => {
    expect(extractSandboxTasks('```sandbox-python\nprint(1)\n```')).toEqual([
      { lang: 'python', code: 'print(1)' },
    ])
  })
  it('支持 calc 别名', () => {
    const tasks = extractSandboxTasks('```calc-js\nreturn 2\n```\n```calc-python\nprint(2)\n```')
    expect(tasks.map(t => t.lang)).toEqual(['js', 'python'])
  })
  it('语言标记大小写不敏感', () => {
    expect(extractSandboxTasks('```SANDBOX-JS\nreturn 3\n```')[0].lang).toBe('js')
  })
  it('最多提取 2 个任务', () => {
    const content = '```sandbox-js\nreturn 1\n```\n```sandbox-js\nreturn 2\n```\n```sandbox-js\nreturn 3\n```'
    expect(extractSandboxTasks(content)).toHaveLength(2)
  })
  it('跳过空代码块', () => {
    expect(extractSandboxTasks('```sandbox-js\n   \n```')).toEqual([])
  })
  it('跳过超长代码块', () => {
    const code = 'x'.repeat(20001)
    expect(extractSandboxTasks(`\`\`\`sandbox-js\n${code}\n\`\`\``)).toEqual([])
  })
  it('不匹配普通代码块', () => {
    expect(extractSandboxTasks('```js\nreturn 1\n```')).toEqual([])
  })
  it('空输入安全', () => {
    expect(extractSandboxTasks('')).toEqual([])
    expect(extractSandboxTasks(null)).toEqual([])
    expect(extractSandboxTasks(undefined)).toEqual([])
  })
})