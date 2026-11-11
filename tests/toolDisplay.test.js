import { describe, expect, it } from 'vitest'
import { callDisplay } from '../src/services/tools/protocol'

describe('callDisplay', () => {
  it('files 动作映射成中文标签与图标', () => {
    expect(callDisplay({ tool: 'files', args: { action: 'list' } }))
      .toEqual({ label: '列出目录', icon: 'folder', target: '' })
    expect(callDisplay({ tool: 'files', args: { action: 'read', path: 'src/a.js' } }))
      .toEqual({ label: '读取', icon: 'read', target: 'src/a.js' })
    expect(callDisplay({ tool: 'files', args: { action: 'write', path: 'a.js', content: 'x' } }))
      .toEqual({ label: '写入', icon: 'edit', target: 'a.js' })
    expect(callDisplay({ tool: 'files', args: { action: 'search', query: 'todo' } }).target).toBe('todo')
  })

  it('rename/move/copy 展示源 → 目标', () => {
    expect(callDisplay({ tool: 'files', args: { action: 'rename', path: 'a.js', new_name: 'b.js' } }).target)
      .toBe('a.js → b.js')
    expect(callDisplay({ tool: 'files', args: { action: 'move', path: 'a.js', to: 'dir/b.js' } }).target)
      .toBe('a.js → dir/b.js')
    expect(callDisplay({ tool: 'files', args: { action: 'copy', path: 'a.js', to: 'dir/a.js' } }).target)
      .toBe('a.js → dir/a.js')
  })

  it('run 无路径有代码时目标是内联代码', () => {
    expect(callDisplay({ tool: 'files', args: { action: 'run', code: 'console.log(1)' } }).target).toBe('内联代码')
    expect(callDisplay({ tool: 'files', args: { action: 'run', path: 'main.js' } }).target).toBe('main.js')
  })

  it('browser 按动作细化标签', () => {
    expect(callDisplay({ tool: 'browser', args: { action: 'open', url: 'https://x.com' } }))
      .toEqual({ label: '打开网页', icon: 'globe', target: 'https://x.com' })
    expect(callDisplay({ tool: 'browser', args: { action: 'click', ref: 3 } }).label).toBe('点击')
    expect(callDisplay({ tool: 'browser', args: { action: 'click', ref: 3 } }).target).toBe('ref 3')
  })

  it('其它工具取各自的目标字段', () => {
    expect(callDisplay({ tool: 'search_web', args: { query: '天气' } }).target).toBe('天气')
    expect(callDisplay({ tool: 'read_document', args: { title: '笔记' } }).target).toBe('笔记')
    expect(callDisplay({ tool: 'calculate', args: { lang: 'python' } }).target).toBe('Python')
    expect(callDisplay({ tool: 'calculate', args: {} }).target).toBe('JavaScript')
    expect(callDisplay({ tool: 'draw_chart', args: { type: 'pie' } }).target).toBe('pie')
    expect(callDisplay({ tool: 'export_conversation', args: { format: 'md' } }).target).toBe('md')
  })

  it('超长目标截断，未知工具兜底', () => {
    const long = 'x'.repeat(200)
    expect(callDisplay({ tool: 'search_web', args: { query: long } }).target).toBe(`${'x'.repeat(80)}…`)
    expect(callDisplay({ tool: 'mystery', args: {} })).toEqual({ label: 'mystery', icon: 'tool', target: '' })
    expect(callDisplay(null)).toEqual({ label: '工具', icon: 'tool', target: '' })
  })
})
