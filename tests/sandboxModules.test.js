import { describe, expect, it } from 'vitest'
import { buildGraph, VIRTUAL_ENTRY } from '../src/services/sandbox/moduleGraph'
import { VENDOR_MODULES, vueEntryHostCode } from '../src/services/sandbox/vendorModules'
import modulePathsRaw from '../src/services/sandbox/modulePaths.js?raw'

const VUE_PATH = VENDOR_MODULES.vue.path

/** 假 io：编译与内置模块都由测试注入，图逻辑本身不碰真实文件系统 */
function makeIo(sources, { compiled = [], vendor = {} } = {}) {
  const paths = Object.keys(sources)
  return {
    async listFiles(dir) {
      const prefix = dir ? `${dir}/` : ''
      const files = new Set()
      const dirs = new Set()
      for (const path of paths) {
        if (!path.startsWith(prefix)) continue
        const rest = path.slice(prefix.length)
        const slash = rest.indexOf('/')
        if (slash < 0) files.add(rest)
        else dirs.add(rest.slice(0, slash))
      }
      return { files, dirs }
    },
    async readText(path) {
      if (!(path in sources)) throw new Error(`文件不存在：${path}`)
      return sources[path]
    },
    async readVendor(path) {
      if (!(path in vendor)) throw new Error(`内置模块不存在：${path}`)
      return vendor[path]
    },
    async compile(path, text) {
      compiled.push(path)
      return { text, lines: null, shift: 0, notes: [] }
    },
  }
}

const run = (sources, options, ioExtra) => buildGraph({ io: makeIo(sources, ioExtra), ...options })
const vendorIo = () => ({
  vendor: {
    [VUE_PATH]: 'export const h = () => 1',
    'vendor/vue-jsx-runtime.js': 'export { jsx } from "vendor/vue.js"',
    'vendor/vue-mount.js': 'export { mountForTest } from "vendor/vue.js"',
  },
})

describe('buildGraph', () => {
  it('按拓扑序排列，被依赖的模块在前', async () => {
    const graph = await run({
      'tests/a.test.js': 'import { b } from "./b.js"\nexport default () => b()',
      'tests/b.js': 'import { c } from "../src/c.js"\nexport const b = () => c()',
      'src/c.js': 'export const c = () => 1',
    }, { entry: 'tests/a.test.js' })
    expect(graph.order).toEqual(['src/c.js', 'tests/b.js', 'tests/a.test.js'])
    expect(graph.missing).toEqual([])
    expect(graph.cycles).toEqual([])
  })

  it('把 specifier 改写成 canonical 工作区路径，并补全扩展名', async () => {
    const graph = await run({
      'tests/a.js': 'import { util } from "./util"\nimport { deep } from "../src/deep"\nexport default () => util() + deep()',
      'tests/util.js': 'export const util = () => 1',
      'src/deep/index.js': 'export const deep = () => 2',
    }, { entry: 'tests/a.js' })
    const entry = graph.modules.find(item => item.path === 'tests/a.js')
    expect(entry.text).toContain('from "tests/util.js"')
    expect(entry.text).toContain('from "src/deep/index.js"')
  })

  it('内联入口挂在根目录，相对路径按工作区根解析', async () => {
    const graph = await run(
      { 'src/lib.js': 'export const n = 1' },
      { code: 'import { n } from "./src/lib.js"\nconsole.log(n)', deps: [] }
    )
    expect(graph.entry).toBe(VIRTUAL_ENTRY)
    expect(graph.order).toEqual(['src/lib.js', VIRTUAL_ENTRY])
    const entry = graph.modules.find(item => item.path === VIRTUAL_ENTRY)
    expect(entry.text).toContain('from "src/lib.js"')
  })

  it('缺失文件报可读原因，并列出尝试过的候选', async () => {
    const graph = await run({ 'a.js': 'import x from "./missing.js"' }, { entry: 'a.js' })
    expect(graph.modules.map(item => item.path)).toEqual(['a.js'])
    expect(graph.missing[0].specifier).toBe('./missing.js')
    expect(graph.missing[0].reason).toContain('找不到')
  })

  it('裸模块名被拒绝而不是当成相对路径', async () => {
    const graph = await run({ 'a.js': 'import { debounce } from "lodash"' }, { entry: 'a.js' })
    expect(graph.missing[0].reason).toContain('npm')
    expect(graph.missing[0].reason).not.toContain('a/lodash')
  })

  it('.ts / .json / .vue 依赖走宿主编译而不是直接拒绝', async () => {
    const compiled = []
    const graph = await run({
      'a.js': 'import { t } from "./types.ts"\nimport data from "./data.json"\nimport App from "./App.vue"',
      'types.ts': 'export const t: number = 1',
      'data.json': '{"k":1}',
      'App.vue': '<template><p>hi</p></template>',
    }, { entry: 'a.js' }, { compiled })
    expect(graph.missing).toEqual([])
    expect(compiled.sort()).toEqual(['App.vue', 'data.json', 'types.ts'])
    expect(graph.order).toEqual(['types.ts', 'data.json', 'App.vue', 'a.js'])
  })

  it('TS importer 写的 .js 解析到同名 .ts 并登记偏移', async () => {
    const graph = await run({
      'src/a.ts': 'import { util } from "./util.js"\nexport const a: string = util()',
      'src/util.ts': 'export const util = () => "u"',
    }, { entry: 'src/a.ts' })
    expect(graph.missing).toEqual([])
    expect(graph.modules.find(item => item.path === 'src/a.ts').text).toContain('from "src/util.ts"')
  })

  it('裸 vue 命中内置垫片，且 vue 运行时排在用它的模块前面', async () => {
    const graph = await run({
      'a.jsx': 'import { h } from "vue"\nexport const a = () => h("p")',
    }, { entry: 'a.jsx' }, vendorIo())
    expect(graph.missing).toEqual([])
    expect(graph.order).toEqual([VUE_PATH, 'a.jsx'])
  })

  it('未内置的裸模块名仍然被拒绝', async () => {
    const graph = await run({ 'a.js': 'import { h } from "preact"' }, { entry: 'a.js' }, vendorIo())
    expect(graph.missing[0].reason).toContain('npm')
  })

  it('垫片自身的依赖由 requires 补齐，不重复计入体积额度', async () => {
    const graph = await run({
      'App.jsx': 'export default { render: () => null }',
    }, { code: vueEntryHostCode('App.jsx') }, vendorIo())
    expect(graph.missing).toEqual([])
    expect(graph.order.slice(0, 2)).toEqual([VUE_PATH, 'vendor/vue-mount.js'])
    expect(graph.modules.filter(item => item.path.startsWith('vendor/')).length).toBe(2)
  })

  it('只有沙箱加载不了的同类文件时说清原因', async () => {
    const graph = await run({
      'a.js': 'import chart from "./chart"',
      'chart.svelte': '<p>hi</p>',
    }, { entry: 'a.js' })
    expect(graph.missing[0].reason).toContain('只找到 chart.svelte')
    expect(graph.missing[0].reason).toContain('.svelte')
  })

  it('编译失败当作依赖问题上报，绝不半截执行', async () => {
    const io = {
      ...makeIo({ 'a.ts': 'export const x: = 1', 'b.js': 'import { x } from "./a.ts"' }),
      compile: async () => { throw new Error('转译失败：\na.ts:1:17: Expected identifier but found "="') },
    }
    const graph = await buildGraph({ io, entry: 'b.js' })
    expect(graph.modules.map(item => item.path)).toEqual(['b.js'])
    expect(graph.missing[0].reason).toContain('转译失败')
  })

  it('循环依赖单独上报，不会无限递归', async () => {
    const graph = await run({
      'a.js': 'import { b } from "./b.js"\nexport const a = 1',
      'b.js': 'import { a } from "./a.js"\nexport const b = 1',
    }, { entry: 'a.js' })
    expect(graph.cycles.length).toBeGreaterThan(0)
    expect(graph.cycles[0]).toContain('a.js → b.js → a.js')
  })

  it('入口给成目录时明确说明', async () => {
    const graph = await run({ 'pkg/index.js': 'export const x = 1' }, { entry: 'pkg' })
    expect(graph.missing[0].reason).toContain('是目录')
  })

  it('超出模块数量上限时标记 truncated 并停止展开', async () => {
    const sources = { 'a.js': 'import "./b.js"\nimport "./c.js"\nimport "./d.js"' }
    for (const name of ['b', 'c', 'd']) sources[`${name}.js`] = `// ${name}`
    const graph = await run(sources, { entry: 'a.js', maxFiles: 2 })
    expect(graph.truncated).toBe(true)
    expect(graph.modules.length).toBeLessThanOrEqual(2)
  })

  it('deps 可以预加载不被入口直接 import 的模块', async () => {
    const graph = await run(
      { 'a.js': 'console.log(1)', 'polyfill.js': 'export const ready = true' },
      { code: 'import { ready } from "./polyfill.js"\nconsole.log(ready)', deps: ['a.js'] }
    )
    expect(graph.modules.map(item => item.path).sort()).toEqual([VIRTUAL_ENTRY, 'a.js', 'polyfill.js'])
    expect(graph.missing).toEqual([])
  })

  it('动态 import 的字面量同样被解析', async () => {
    const graph = await run({
      'a.js': 'const m = await import("./lazy.js")\nexport default () => m.x',
      'lazy.js': 'export const x = 1',
    }, { entry: 'a.js' })
    expect(graph.order).toEqual(['lazy.js', 'a.js'])
    expect(graph.modules.find(item => item.path === 'a.js').text).toContain('import("lazy.js")')
  })

  it('inline 多入口各自按自己的目录解析相对依赖', async () => {
    const graph = await run(
      { 'sub/util.js': 'export const n = 2', 'root.js': 'export const r = 1' },
      {
        inline: [
          { path: 'sub/__inline_1__.js', text: 'import { n } from "./util.js"\nconsole.log(n)' },
          { path: '__inline_2__.js', text: 'import { r } from "./root.js"\nconsole.log(r)' },
        ],
      }
    )
    expect(graph.missing).toEqual([])
    expect(graph.entry).toBe('')
    expect(graph.order).toEqual(['sub/util.js', 'sub/__inline_1__.js', 'root.js', '__inline_2__.js'])
    expect(graph.modules.find(item => item.path === 'sub/__inline_1__.js').text).toContain('from "sub/util.js"')
  })

  it('inline 与 code 可以并存，扩展名决定要不要过编译', async () => {
    const compiled = []
    const graph = await run(
      { 'lib.js': 'export const v = 1' },
      {
        code: 'import { v } from "./lib.js"\nconsole.log(v)',
        inline: [{ path: 'sub/__inline_1__.ts', text: 'export const n: number = 2' }],
      },
      { compiled }
    )
    expect(compiled).toEqual(['sub/__inline_1__.ts'])
    expect(graph.missing).toEqual([])
    expect(graph.entry).toBe(VIRTUAL_ENTRY)
    expect(graph.order).toEqual(['lib.js', VIRTUAL_ENTRY, 'sub/__inline_1__.ts'])
  })

  it('allowBare：已有垫片优先，其余裸名原样留给注入的 importmap', async () => {
    const graph = await run({
      'a.js': 'import { h } from "vue"\nimport { debounce } from "lodash"\nimport "https://cdn.example.com/x.js"\nexport const a = () => [h, debounce]',
    }, { entry: 'a.js', allowBare: true }, vendorIo())
    expect(graph.missing).toEqual([])
    expect(graph.bare).toEqual(['lodash'])
    expect(graph.order).toEqual([VUE_PATH, 'a.js'])
    const text = graph.modules.find(item => item.path === 'a.js').text
    expect(text).toContain(`from "${VUE_PATH}"`)
    expect(text).toContain('from "lodash"')
    expect(text).toContain('"https://cdn.example.com/x.js"')
  })

  it('allowBare 默认关闭：裸名与绝对地址当场拒绝，不会静默丢给浏览器', async () => {
    const graph = await run({
      'a.js': 'import "https://cdn.example.com/x.js"',
    }, { entry: 'a.js' })
    expect(graph.bare).toEqual([])
    expect(graph.missing[0].specifier).toBe('https://cdn.example.com/x.js')
  })
})

describe('沙箱源码注入前提', () => {
  it('modulePaths.js 只用 export function 形式导出', () => {
    const exports = modulePathsRaw.split('\n').filter(line => /^export\b/.test(line))
    expect(exports.length).toBeGreaterThan(0)
    for (const line of exports) {
      expect(line).toMatch(/^export function [A-Za-z0-9_]+\(/)
    }
  })

  it('去掉 export 关键字后可以直接当经典脚本用', () => {
    const classic = modulePathsRaw.replace(/^export\s+function/gm, 'function')
    expect(classic).not.toMatch(/^export\b/m)
    expect(classic).toContain('function rewriteSpecifiers(')
  })
})
