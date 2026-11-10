import { describe, expect, it } from 'vitest'
import {
  blockedAlternatives, blockedExtension, candidatePaths, compileKind, dirnameOf,
  extractImportSpecs, isBareSpecifier, isVendorSpecifier,
  normalizePath, resolveRelative, rewriteSpecifiers,
} from '../src/services/sandbox/modulePaths'

const specs = src => extractImportSpecs(src).map(item => item.specifier)

describe('路径解析', () => {
  it('normalizePath 折叠 . 与 ..，去掉首尾斜杠', () => {
    expect(normalizePath('./src//a/./b.js')).toBe('src/a/b.js')
    expect(normalizePath('/src/../x.js')).toBe('x.js')
  })

  it('dirnameOf 取所在目录', () => {
    expect(dirnameOf('src/a/b.js')).toBe('src/a')
    expect(dirnameOf('b.js')).toBe('')
  })

  it('resolveRelative 处理相对、根相对与越界', () => {
    expect(resolveRelative('src/a/b.js', './c.js')).toEqual({ path: 'src/a/c.js' })
    expect(resolveRelative('src/a/b.js', '../c.js')).toEqual({ path: 'src/c.js' })
    expect(resolveRelative('src/a/b.js', '../../c.js')).toEqual({ path: 'c.js' })
    expect(resolveRelative('src/a/b.js', '/root/c.js')).toEqual({ path: 'root/c.js' })
    expect(resolveRelative('a/b.js', '../../../c.js')).toBeNull()
    expect(resolveRelative('a/b.js', 'lodash')).toBeNull()
    expect(resolveRelative('a/b.js', 'https://cdn/x.js')).toBeNull()
  })

  it('candidatePaths 无扩展名时按 TS 优先顺序补候选', () => {
    expect(candidatePaths('src/a/b.js', './util')).toEqual([
      'src/a/util',
      'src/a/util.ts', 'src/a/util.mts', 'src/a/util.cts', 'src/a/util.tsx', 'src/a/util.jsx',
      'src/a/util.vue', 'src/a/util.js', 'src/a/util.mjs', 'src/a/util.cjs', 'src/a/util.json',
      'src/a/util/index.ts', 'src/a/util/index.tsx', 'src/a/util/index.js', 'src/a/util/index.mjs', 'src/a/util/index.vue',
    ])
  })

  it('TS importer 写的 .js 先回指同名源文件', () => {
    expect(candidatePaths('src/a/b.ts', './util.js')).toEqual(['src/a/util.ts', 'src/a/util.tsx', 'src/a/util.js'])
    expect(candidatePaths('src/a/b.vue', './util.js')).toEqual(['src/a/util.ts', 'src/a/util.tsx', 'src/a/util.js'])
    // .js 与 .json 的 importer 按产物路径找，不做回指
    expect(candidatePaths('src/a/b.js', './util.js')).toEqual(['src/a/util.js'])
    expect(candidatePaths('src/a/b.json', './util.js')).toEqual(['src/a/util.js'])
  })

  it('需要宿主转译的类型由 compileKind 标出', () => {
    expect(compileKind('a/b.ts')).toBe('ts')
    expect(compileKind('a/b.mts')).toBe('ts')
    expect(compileKind('a/b.tsx')).toBe('tsx')
    expect(compileKind('a/b.jsx')).toBe('jsx')
    expect(compileKind('a/App.vue')).toBe('vue')
    expect(compileKind('a/data.json')).toBe('json')
    expect(compileKind('a/b.js')).toBe('none')
    expect(compileKind('a/b.svelte')).toBe('none')
  })

  it('识别沙箱彻底加载不了的模块类型', () => {
    expect(blockedExtension('./chart.svelte')).toBe('.svelte')
    expect(blockedExtension('./theme.css')).toBe('.css')
    expect(blockedExtension('./logo.png')).toBe('.png')
    // 这些以前被当成不可运行，现在宿主会先编译
    expect(blockedExtension('./types.ts')).toBe('')
    expect(blockedExtension('./data.json')).toBe('')
    expect(blockedExtension('./App.vue')).toBe('')
    expect(blockedExtension('./mod.js')).toBe('')
  })

  it('不可运行候选列表不含现在能转译的类型', () => {
    const options = blockedAlternatives('src/a/b.js', './chart')
    expect(options).toContain('src/a/chart.svelte')
    expect(options).toContain('src/a/chart.css')
    expect(options.some(item => /\.(?:ts|tsx|jsx|vue|mjs|js|json)$/.test(item))).toBe(false)
    expect(blockedAlternatives('src/a/b.js', './types.ts')).toEqual([])
    expect(blockedAlternatives('src/a/b.js', 'lodash')).toEqual([])
  })

  it('区分裸模块名与相对路径', () => {
    expect(isBareSpecifier('vue')).toBe(true)
    expect(isBareSpecifier('./vue')).toBe(false)
    expect(isBareSpecifier('/vue')).toBe(false)
  })

  it('只有内置垫片名算可用裸名', () => {
    expect(isVendorSpecifier('vue')).toBe(true)
    expect(isVendorSpecifier('vue/jsx-runtime')).toBe(true)
    expect(isVendorSpecifier('xiyue:vue-mount')).toBe(true)
    expect(isVendorSpecifier('lodash')).toBe(false)
    expect(isVendorSpecifier('./vue')).toBe(false)
  })
})

describe('extractImportSpecs', () => {
  it('覆盖 default / 命名 / 命名空间 / 副作用 / export-from / 动态 import', () => {
    const src = [
      'import D from "./d.js"',
      'import { a, b as c } from "./ab.js"',
      'import * as ns from "./ns.js"',
      'import "./side.js"',
      'export { x } from "./x.js"',
      'export * from "./all.js"',
      'const m = await import("./dyn.js")',
    ].join('\n')
    expect(specs(src)).toEqual(['./d.js', './ab.js', './ns.js', './side.js', './x.js', './all.js', './dyn.js'])
  })

  it('标记动态 import', () => {
    const [item] = extractImportSpecs('import("./lazy.js")')
    expect(item).toEqual({ specifier: './lazy.js', kind: 'dynamic' })
  })

  it('跳过注释与普通字符串', () => {
    const src = [
      '// import fake from "./comment.js"',
      '/* import block from "./block.js" */',
      'const msg = "see import x from \'./in-string.js\'"',
      'import real from "./real.js"',
    ].join('\n')
    expect(specs(src)).toEqual(['./real.js'])
  })

  it('对象键 from: 不算 specifier', () => {
    expect(specs('const opts = { from: "./origin.js", to: "./dest.js" }')).toEqual([])
  })

  it('from 与字面量跨行也能识别', () => {
    expect(specs('import a from\n  "./multi.js"')).toEqual(['./multi.js'])
  })

  it('模板串不作为 specifier', () => {
    expect(specs('const t = `./tpl.js`')).toEqual([])
  })
})

describe('rewriteSpecifiers', () => {
  const map = { './d.js': 'src/d.js', './sub' : 'src/sub.js' }

  it('只改写 specifier，其他字符串保持原样', () => {
    const src = 'import D from "./d.js"\nconsole.log("./d.js")\n'
    const out = rewriteSpecifiers(src, spec => map[spec] || null)
    expect(out).toBe('import D from "src/d.js"\nconsole.log("./d.js")\n')
  })

  it('保持行号与引号风格', () => {
    const src = ["import a from './sub'", 'export { b } from "./d.js"', '', 'const n = 1'].join('\n')
    const out = rewriteSpecifiers(src, spec => map[spec] || null)
    expect(out.split('\n')).toHaveLength(4)
    expect(out).toContain("import a from 'src/sub.js'")
    expect(out).toContain('export { b } from "src/d.js"')
  })

  it('resolver 返回 null 时原样保留', () => {
    expect(rewriteSpecifiers('import x from "lodash"', () => null)).toBe('import x from "lodash"')
  })

  it('保留转义引号后的边界', () => {
    const src = 'import a from "./it\\\'s.js"\nconst k = 1'
    expect(rewriteSpecifiers(src, () => null)).toBe(src)
  })
})
