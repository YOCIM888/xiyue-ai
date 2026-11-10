import { describe, expect, it } from 'vitest'
import previewAutomateRaw from '../src/services/previewAutomate.js?raw'
import previewBootRaw from '../src/services/previewBoot.js?raw'
import previewModulesRaw from '../src/services/previewModules.js?raw'
import previewPathsRaw from '../src/services/previewPaths.js?raw'
import { buildFixRequest, buildRuntimeScript, normalizeAutomateResult, resolveNavPath } from '../src/services/previewRuntime'
import {
  buildImportMap, cdnModuleUrl, formatPreviewArg, inlineLangExtension, isExternalUrl,
  mapModuleUrls, mergeImportMaps, normalizePreviewEntry, parseImportMap, PREVIEW_CDN_BASE,
  readyEntry, runtimeConfigFor, virtualInlinePath,
} from '../src/services/previewPaths'

// 拼出来而不是直接写字面量：本文件的断言就是「注入文本里不能出现这个序列」
const SCRIPT_CLOSE = ['</', 'script'].join('')

/** 带模块图的注入脚本，多份用例共用同一组入参 */
function bundleOptions() {
  return {
    modules: [{ path: 'sub/a.ts', text: 'export const a = 1' }],
    bare: ['lodash'],
    pageImports: { imports: { vue: 'https://cdn.example.com/vue.js' }, scopes: {} },
  }
}

describe('注入前提', () => {
  it('previewPaths.js 只用 export const / export function，去掉关键字即可当经典脚本', () => {
    const exportLines = previewPathsRaw.split('\n').filter(line => /^export\b/.test(line))
    expect(exportLines.length).toBeGreaterThan(0)
    for (const line of exportLines) {
      expect(line).toMatch(/^export (?:const [A-Za-z0-9_]+ =|function [A-Za-z0-9_]+\()/)
    }
    const classic = previewPathsRaw.replace(/^export\s+/gm, '')
    expect(classic).not.toMatch(/^export\b/m)
    expect(classic).toContain('function formatPreviewArg(')
    expect(classic).toContain('const PREVIEW_MESSAGE =')
  })

  it('引导脚本没有 import / export，也没有字面量的 script 结束标签', () => {
    expect(previewBootRaw).not.toMatch(/^\s*(?:import|export)\s/m)
    expect(previewBootRaw.toLowerCase()).not.toContain(SCRIPT_CLOSE)
  })

  it('模块加载层同样没有 import / export，也没有字面量的 script 结束标签', () => {
    expect(previewModulesRaw).not.toMatch(/^\s*(?:import|export)\s/m)
    expect(previewModulesRaw.toLowerCase()).not.toContain(SCRIPT_CLOSE)
    expect(previewModulesRaw).toContain('function loadPreviewModules(')
  })

  it('自测层只用 export const / export function，去掉关键字即可当经典脚本', () => {
    const exportLines = previewAutomateRaw.split('\n').filter(line => /^export\b/.test(line))
    expect(exportLines.length).toBeGreaterThan(0)
    for (const line of exportLines) {
      expect(line).toMatch(/^export (?:const [A-Za-z0-9_]+ =|function [A-Za-z0-9_]+\()/)
    }
    const classic = previewAutomateRaw.replace(/^export\s+/gm, '')
    expect(classic).not.toMatch(/^export\b/m)
    expect(classic).not.toMatch(/^\s*import\s/m)
    expect(classic.toLowerCase()).not.toContain(SCRIPT_CLOSE)
    expect(classic).toContain('function installAutomation(')
    expect(classic).toContain('function collectSnapshot(')
  })

  /**
   * 四段源码在同一个 IIFE 作用域里，顶层同名就是 SyntaxError，整个预览当场死掉。
   * 除了 new Function 编译，这里再直接把名字列出来对一遍：编译只在拼完之后才报错，
   * 名字对不上时看不出是谁撞了谁。
   */
  it('四段源码拼进同一个 IIFE 后仍能编译：顶层声明没有互相撞车', async () => {
    const script = await buildRuntimeScript('sub/page.html', bundleOptions())
    // new Function 只编译不执行，重复的顶层 const / function 会在这里变成 SyntaxError
    expect(() => new Function(script)).not.toThrow()

    const topLevelNames = raw => [...raw.matchAll(/^(?:export\s+)?(?:const|let|var|function|async function|class)\s+([A-Za-z_$][\w$]*)/gm)]
      .map(hit => hit[1])
    const automate = new Set(topLevelNames(previewAutomateRaw))
    expect(automate.size).toBeGreaterThan(10)
    for (const name of [...topLevelNames(previewPathsRaw), ...topLevelNames(previewModulesRaw)]) {
      expect(automate.has(name), `${name} 和别的注入文件重名了`).toBe(false)
    }
  })

  it('自测层排在引导脚本前面：installAutomation 要在 boot 的内层 IIFE 里被调用', async () => {
    const script = await buildRuntimeScript('sub/page.html')
    const declareAt = script.indexOf('function installAutomation(')
    const callAt = script.indexOf("install('自测通道'")
    expect(declareAt).toBeGreaterThan(-1)
    expect(callAt).toBeGreaterThan(declareAt)
    expect(previewBootRaw).toContain('installAutomation({ report })')
    // 必须在 ready 之前：宿主收到 ready 就会开始 ping，装晚了它以为页面没起来
    expect(previewBootRaw.indexOf("install('自测通道'")).toBeLessThan(previewBootRaw.indexOf("send({ kind: 'ready'"))
  })

  it('合成事件不算用户交互：AI 自测点过之后文件一变还得能自动重载', () => {
    expect(previewBootRaw).toContain('function reportTouched(event)')
    expect(previewBootRaw).toContain('if (event && event.isTrusted === false) return')
    expect(previewBootRaw).toContain("send({ kind: 'touched' })")
    expect(previewBootRaw).toMatch(/reportTouched\(event\)/)
  })
})

describe('buildRuntimeScript', () => {
  it('把预览文档的位置作为配置带进去', async () => {
    const script = await buildRuntimeScript('sub/page.html')
    expect(script).toContain('"path":"sub/page.html"')
    expect(script).toContain('"base":["sub"]')
  })

  it('整体包在 IIFE 里，不往页面全局作用域挂任何声明', async () => {
    const script = await buildRuntimeScript('index.html')
    expect(script.startsWith('(function () {')).toBe(true)
    expect(script.trimEnd().endsWith('})()')).toBe(true)
    // 配置常量必须在包装之后出现，否则它就是页面全局里的一个声明
    expect(script.indexOf('const __XIYUE_PREVIEW__')).toBeGreaterThan(0)
  })

  it('纯逻辑层与引导脚本都在同一段脚本文本里', async () => {
    const script = await buildRuntimeScript('index.html')
    expect(script).toContain('function formatPreviewArg(')
    expect(script).toContain('function createMemoryStorage(')
    expect(script).toContain('__XIYUE_PREVIEW__')
  })

  it('转义路径里的 script 结束标签，避免提前截断文档', async () => {
    const script = await buildRuntimeScript(`we${SCRIPT_CLOSE}rd/index.html`)
    expect(script.toLowerCase()).not.toContain(SCRIPT_CLOSE)
    expect(script).toContain('<\\/script')
  })

  it('模块图、裸模块名与页面自带映射一起进配置，加载层随脚本注入', async () => {
    const script = await buildRuntimeScript('sub/page.html', bundleOptions())
    expect(script).toContain('"modules":[{"path":"sub/a.ts","text":"export const a = 1"}]')
    expect(script).toContain('"bare":["lodash"]')
    expect(script).toContain('"pageImports":{"imports":{"vue":"https://cdn.example.com/vue.js"},"scopes":{}}')
    expect(script).toContain('function loadPreviewModules(')
    expect(script).toContain('function buildImportMap(')
  })

  it('没有模块图时配置里不多带任何键，注入文本与只跑静态页面时一致', async () => {
    const script = await buildRuntimeScript('index.html')
    expect(script).not.toContain('"modules"')
    expect(script).not.toContain('"bare"')
    expect(script).not.toContain('"pageImports"')
  })

  it('模块源码里的 script 结束标签被转义，路径含结束标签也不截断文档', async () => {
    const script = await buildRuntimeScript('index.html', {
      modules: [{ path: `we${SCRIPT_CLOSE}rd/a.js`, text: `document.write("<${SCRIPT_CLOSE}>")` }],
    })
    expect(script.toLowerCase()).not.toContain(SCRIPT_CLOSE)
  })
})

describe('isExternalUrl', () => {
  it('只有工作区相对地址才交给桥', () => {
    for (const url of ['./data.json', '../shared/a.css', 'assets/logo.svg', 'index.html', '/api/list']) {
      expect(isExternalUrl(url)).toBe(false)
    }
    for (const url of ['https://cdn.example.com/x.js', 'http://a/b', 'data:image/png;base64,AA', 'blob:https://a/1', 'about:blank', '//cdn.example.com/x.js']) {
      expect(isExternalUrl(url)).toBe(true)
    }
  })
})

describe('runtimeConfigFor', () => {
  it('按文档所在目录给出 base', () => {
    expect(runtimeConfigFor('index.html')).toEqual({ path: 'index.html', base: [] })
    expect(runtimeConfigFor('a/b/c.html')).toEqual({ path: 'a/b/c.html', base: ['a', 'b'] })
  })

  it('多余斜杠与空段被清掉，空路径不炸', () => {
    expect(runtimeConfigFor('/a//b/')).toEqual({ path: 'a/b', base: ['a'] })
    expect(runtimeConfigFor('')).toEqual({ path: '', base: [] })
    expect(runtimeConfigFor(null)).toEqual({ path: '', base: [] })
  })
})

describe('formatPreviewArg', () => {
  it('基础类型原样输出，超长字符串截断', () => {
    expect(formatPreviewArg('hi')).toBe('hi')
    expect(formatPreviewArg(1.5)).toBe('1.5')
    expect(formatPreviewArg(true)).toBe('true')
    expect(formatPreviewArg(null)).toBe('null')
    expect(formatPreviewArg(undefined)).toBe('undefined')
    expect(formatPreviewArg(10n)).toBe('10n')
    expect(formatPreviewArg(Symbol('s'))).toBe('Symbol(s)')
    expect(formatPreviewArg(function named() {})).toBe('[Function named]')
    expect(formatPreviewArg('x'.repeat(3000))).toContain('…（已截断）')
  })

  it('Error 输出名称、消息与前几帧栈', () => {
    const err = new TypeError('坏了')
    err.stack = 'TypeError: 坏了\n    at a.js:1:1\n    at b.js:2:2\n    at c.js:3:3\n    at d.js:4:4\n    at e.js:5:5'
    const text = formatPreviewArg(err)
    expect(text).toContain('TypeError: 坏了')
    expect(text).toContain('a.js:1:1')
    expect(text).not.toContain('e.js:5:5')
  })

  it('丢掉 about:srcdoc 的栈帧：那是注入运行时之后的行号，指不到源文件', () => {
    const err = new Error('炸了')
    err.stack = 'Error: 炸了\n    at about:srcdoc:422:28\n    at about:srcdoc:430:3'
    expect(formatPreviewArg(err)).toBe('Error: 炸了')
    const mixed = new Error('半炸')
    mixed.stack = 'Error: 半炸\n    at about:srcdoc:422:28\n    at blob:https://a/1:12:3'
    expect(formatPreviewArg(mixed)).toBe('Error: 半炸\n    at blob:https://a/1:12:3')
  })

  it('数组与对象超量折叠，深度封顶', () => {
    expect(formatPreviewArg(Array.from({ length: 30 }, (_, i) => i))).toContain('…(+10)')
    const wide = {}
    for (let i = 0; i < 30; i += 1) wide[`k${i}`] = i
    expect(formatPreviewArg(wide)).toContain('…(+10)')
    expect(formatPreviewArg({ a: { b: { c: { d: 1 } } } })).toBe('{a: {b: {c: …}}}')
  })

  it('循环引用与兄弟重复引用区分开', () => {
    const node = { name: 'n' }
    node.self = node
    expect(formatPreviewArg(node)).toContain('[循环引用]')
    const shared = { v: 1 }
    expect(formatPreviewArg({ a: shared, b: shared })).toBe('{a: {v: 1}, b: {v: 1}}')
  })

  it('DOM 节点、Map、Set 给可读标签而不是抛异常', () => {
    expect(formatPreviewArg({ nodeType: 1, nodeName: 'DIV', id: 'app', className: 'a b c d' })).toBe('<div#app.a.b.c>')
    expect(formatPreviewArg({ nodeType: 3, nodeName: '#text', textContent: 'hi' })).toBe('"hi"')
    expect(formatPreviewArg({ nodeType: 9, nodeName: '#document' })).toBe('#document')
    expect(formatPreviewArg(new Map([['a', 1]]))).toBe('[a => 1]')
    expect(formatPreviewArg(new Set([1, 2]))).toBe('[1, 2]')
  })

  it('属性读取抛错时降级成占位符', () => {
    const nasty = {}
    Object.defineProperty(nasty, 'boom', { enumerable: true, get() { throw new Error('nope') } })
    expect(formatPreviewArg(nasty)).toBe('{boom: [无法读取]}')
  })
})

describe('normalizePreviewEntry', () => {
  it('只接受 log / error 两类上报', () => {
    expect(normalizePreviewEntry({ kind: 'log', level: 'warn', text: 'x' })).toEqual({ level: 'warn', text: 'x', source: '' })
    expect(normalizePreviewEntry({ kind: 'error', text: 'x' })).toEqual({ level: 'error', text: 'x', source: '' })
    expect(normalizePreviewEntry({ kind: 'ready' })).toBeNull()
    expect(normalizePreviewEntry({ kind: 'fetch', url: './a.json' })).toBeNull()
    expect(normalizePreviewEntry(null)).toBeNull()
  })

  it('未知等级回落到该类型的默认值，空文本丢弃', () => {
    expect(normalizePreviewEntry({ kind: 'log', level: 'trace', text: 'x' }).level).toBe('log')
    expect(normalizePreviewEntry({ kind: 'error', level: 'log', text: 'x' }).level).toBe('log')
    expect(normalizePreviewEntry({ kind: 'log', text: '   ' })).toBeNull()
  })

  it('文本截断到预算内，来源折叠空白并限长', () => {
    const entry = normalizePreviewEntry({ kind: 'log', text: 'y'.repeat(3000), source: '  a.js:1:1  \n  x  ' })
    expect(entry.text.length).toBeLessThan(2100)
    expect(entry.text).toContain('…（已截断）')
    expect(entry.source).toBe('a.js:1:1 x')
  })

  it('等级白名单就是抽屉能渲染的全部等级', () => {
    expect(normalizePreviewEntry({ kind: 'log', level: 'debug', text: 'x' }).level).toBe('debug')
    expect(normalizePreviewEntry({ kind: 'log', level: '__proto__', text: 'x' }).level).toBe('log')
  })
})

describe('readyEntry', () => {
  it('列出已接管的 shim，并说明存储是内存实现', () => {
    const entry = readyEntry({ shims: ['console', 'localStorage', 'fetch'] })
    expect(entry.level).toBe('info')
    expect(entry.text).toContain('console / localStorage / fetch')
    expect(entry.text).toContain('内存实现')
  })

  it('没有 shim 清单或清单里混入非字符串时降级成一句话', () => {
    expect(readyEntry({}).text).toBe('预览运行时就绪')
    expect(readyEntry({ shims: 'localStorage' }).text).toBe('预览运行时就绪')
    expect(readyEntry({ shims: [null, 'fetch', 1] }).text).toContain('fetch')
  })
})

describe('内联模块的虚拟路径', () => {
  it('挂在 HTML 所在目录，扩展名跟着 lang 走', () => {
    expect(virtualInlinePath('index.html', 1)).toBe('__inline_1__.js')
    expect(virtualInlinePath('sub/page.html', 2, 'ts')).toBe('sub/__inline_2__.ts')
    expect(virtualInlinePath('a/b/page.html', 3, 'JSX')).toBe('a/b/__inline_3__.jsx')
  })

  it('认不出的 lang 回落成 .js，也就是不需要转译', () => {
    expect(inlineLangExtension('TypeScript')).toBe('.ts')
    expect(inlineLangExtension('module')).toBe('.js')
    expect(inlineLangExtension('wat')).toBe('.js')
    expect(inlineLangExtension(null)).toBe('.js')
  })
})

describe('importmap 合成', () => {
  it('裸模块名指到 CDN，绝对地址与空值不生成映射', () => {
    expect(cdnModuleUrl('vue')).toBe(`${PREVIEW_CDN_BASE}vue`)
    expect(cdnModuleUrl('lodash/debounce')).toBe(`${PREVIEW_CDN_BASE}lodash/debounce`)
    expect(cdnModuleUrl('/vue')).toBe(`${PREVIEW_CDN_BASE}vue`)
    expect(cdnModuleUrl('https://cdn.example.com/vue.js')).toBe('')
    expect(cdnModuleUrl('  ')).toBe('')
  })

  it('页面自带的 importmap 只接受串到串，坏 JSON 整张丢掉', () => {
    expect(parseImportMap('{"imports":{"a":"./a.js"}}')).toEqual({ imports: { a: './a.js' }, scopes: {} })
    expect(parseImportMap('不是 JSON')).toBeNull()
    expect(parseImportMap('[]')).toBeNull()
    expect(parseImportMap('')).toBeNull()
    expect(parseImportMap(null)).toBeNull()
  })

  it('数组值、空串与危险键都进不了注入的映射', () => {
    const parsed = parseImportMap('{"imports":{"a":["./a.js"],"b":"","__proto__":"x","c":"./c.js"},"scopes":{"s/":{"d":"./d.js"}}}')
    expect(parsed).toEqual({ imports: { c: './c.js' }, scopes: { 's/': { d: './d.js' } } })
  })

  it('多张 importmap 合成一张，后来的覆盖先来的', () => {
    const merged = mergeImportMaps([
      { imports: { a: './a1.js', b: './b.js' }, scopes: { 's/': { x: './x1.js' } } },
      { imports: { a: './a2.js' }, scopes: { 's/': { y: './y.js' }, 't/': { z: './z.js' } } },
      null,
    ])
    expect(merged).toEqual({
      imports: { a: './a2.js', b: './b.js' },
      scopes: { 's/': { x: './x1.js', y: './y.js' }, 't/': { z: './z.js' } },
    })
    expect(mergeImportMaps(null)).toEqual({ imports: {}, scopes: {} })
  })

  it('模块图优先于裸名，页面自带的映射最后覆盖', () => {
    expect(buildImportMap({
      modules: { 'a.js': 'blob:1', vue: 'blob:2' },
      bare: ['vue', 'lodash', '__proto__', ''],
      page: null,
    })).toEqual({ imports: { 'a.js': 'blob:1', vue: 'blob:2', lodash: `${PREVIEW_CDN_BASE}lodash` } })

    expect(buildImportMap({
      modules: { 'a.js': 'blob:1' },
      bare: ['lodash'],
      page: { imports: { 'a.js': './author-override.js' }, scopes: { 's/': { q: './q.js' } } },
    })).toEqual({
      imports: { 'a.js': './author-override.js', lodash: `${PREVIEW_CDN_BASE}lodash` },
      scopes: { 's/': { q: './q.js' } },
    })
  })

  it('scopes 为空时不出现在映射里：浏览器对空 scopes 的容忍度并不一致', () => {
    expect(buildImportMap({ modules: { 'a.js': 'blob:1' }, page: { imports: {}, scopes: {} } }))
      .toEqual({ imports: { 'a.js': 'blob:1' } })
    expect(buildImportMap()).toEqual({ imports: {} })
  })

  it('页面映射指向 canonical 路径时换成 blob URL：映射值必须是绝对地址', () => {
    expect(buildImportMap({
      modules: { 'sub/config.js': 'blob:cfg' },
      bare: ['@demo/config'],
      page: { imports: { '@demo/config': 'sub/config.js' }, scopes: { 'vendor/': { lib: 'sub/config.js' } } },
    })).toEqual({
      imports: { 'sub/config.js': 'blob:cfg', '@demo/config': 'blob:cfg' },
      scopes: { 'vendor/': { lib: 'blob:cfg' } },
    })
  })

  it('页面映射里的危险键与非字符串值进不了注入结果，空 scope 直接丢掉', () => {
    const map = buildImportMap({
      page: {
        imports: { ['__proto__']: './x.js', ok: 1, fine: './fine.js' },
        scopes: { ['constructor']: { a: './a.js' }, 's/': { ['__proto__']: './x.js' } },
      },
    })
    expect(map.imports).toEqual({ fine: './fine.js' })
    expect(Object.hasOwn(map, 'scopes')).toBe(false)
    expect(Object.getPrototypeOf(map.imports)).toBe(Object.prototype)
  })
})

describe('mapModuleUrls', () => {
  const paths = new Map([['blob:https://a/u1', 'sub/app.ts'], ['blob:https://a/u2', 'lib.js']])

  it('blob URL 换回工作区路径，行列后缀原样保留', () => {
    expect(mapModuleUrls('at foo (blob:https://a/u1:12:5)', paths)).toBe('at foo (sub/app.ts:12:5)')
    expect(mapModuleUrls('blob:https://a/u2', paths)).toBe('lib.js')
    expect(mapModuleUrls('blob:https://a/u2:7', paths)).toBe('lib.js:7')
  })

  it('查不到表里的 blob 与非 blob 文本原样返回，空表不做替换', () => {
    expect(mapModuleUrls('blob:https://a/unknown:1:1', paths)).toBe('blob:https://a/unknown:1:1')
    expect(mapModuleUrls('at a.js:1:1', paths)).toBe('at a.js:1:1')
    expect(mapModuleUrls('blob:https://a/u1:1:1', new Map())).toBe('blob:https://a/u1:1:1')
    expect(mapModuleUrls('', paths)).toBe('')
    expect(mapModuleUrls(null, paths)).toBe('')
  })

  it('一条栈里的多个 blob 帧各自换回源文件', () => {
    const text = 'Error: x\n    at f (blob:https://a/u1:3:1)\n    at g (blob:https://a/u2:9:2)'
    expect(mapModuleUrls(text, paths)).toBe('Error: x\n    at f (sub/app.ts:3:1)\n    at g (lib.js:9:2)')
  })
})

describe('页内导航的拦截', () => {
  it('捕获阶段拦下 <a> 点击与表单提交，上报的是原始属性值', () => {
    expect(previewBootRaw).toContain("document.addEventListener('click'")
    expect(previewBootRaw).toContain("document.addEventListener('submit'")
    expect(previewBootRaw).toContain("send({ kind: 'navigate', href: raw })")
    // srcdoc 的 baseURI 是 about:srcdoc，a.href / form.action 解析出来的是废地址
    expect(previewBootRaw).toContain("link.getAttribute('href')")
    expect(previewBootRaw).toContain("event.target?.getAttribute?.('action')")
  })

  it('只有外链与带修饰键的点击放行：拦错了就是页面点不动', () => {
    expect(previewBootRaw).toContain('isExternalUrl(raw)')
    expect(previewBootRaw).toContain('event.metaKey || event.ctrlKey')
  })

  it('锚点在页内自己滚，不能让默认行为把 iframe 导航到宿主地址上', () => {
    expect(previewBootRaw).toContain("if (!raw || raw.startsWith('#')) scrollToFragment(raw.slice(1))")
    expect(previewBootRaw).toContain('document.getElementById(fragment)')
    expect(previewBootRaw).toContain('target?.scrollIntoView()')
    expect(previewBootRaw).toContain('window.scrollTo(0, 0)')
  })

  it('表单不会跳走，但页面自己的 submit 处理器仍能跑', () => {
    expect(previewBootRaw).toContain('event.preventDefault()')
    expect(previewBootRaw).not.toContain('event.stopPropagation()')
  })

  it('首次交互只上报一次，宿主据此把自动重载切成脏标记', () => {
    expect(previewBootRaw).toContain("send({ kind: 'touched' })")
    expect(previewBootRaw).toContain('if (touched) return')
    expect(previewBootRaw).toContain("['pointerdown', 'keydown', 'input', 'change']")
  })
})

describe('resolveNavPath', () => {
  it('相对地址按当前页所在目录解析成工作区路径', () => {
    expect(resolveNavPath(['sub'], 'page.html')).toBe('sub/page.html')
    expect(resolveNavPath(['sub'], '../root.html')).toBe('root.html')
    expect(resolveNavPath([], '/abs.html')).toBe('abs.html')
    expect(resolveNavPath(['sub'], 'page.html?id=3#top')).toBe('sub/page.html')
    expect(resolveNavPath(['sub'], 'PAGE.HTM')).toBe('sub/PAGE.HTM')
  })

  it('外链、锚点、非 .html 与越出根目录的地址返回 null，由调用方说明原因', () => {
    expect(resolveNavPath(['sub'], 'https://example.com/a.html')).toBeNull()
    expect(resolveNavPath(['sub'], '//cdn.example.com/a.html')).toBeNull()
    expect(resolveNavPath(['sub'], '#top')).toBeNull()
    expect(resolveNavPath(['sub'], 'style.css')).toBeNull()
    expect(resolveNavPath(['sub'], '../../escape.html')).toBeNull()
    expect(resolveNavPath(['sub'], '')).toBeNull()
  })
})

describe('buildFixRequest', () => {
  const entries = [
    { level: 'info', text: '已加载 3 个模块', source: '' },
    { level: 'warn', text: 'qa-preview/App.vue：<style> ×1（样式被丢弃）', source: '' },
    { level: 'error', text: 'Error: boom\n    at run (qa-preview/main.ts:6:1)', source: 'qa-preview/main.ts:6:1' },
    { level: 'error', text: 'Error: 读不到 config', source: 'qa-preview/store.ts:12:3' },
  ]

  it('只挑错误，带上源文件位置，多行栈压成一行', () => {
    const text = buildFixRequest({ path: 'qa-preview/index.html', entries })
    expect(text).toContain('预览工作区里的 qa-preview/index.html 时控制台报错')
    expect(text).toContain('1. qa-preview/main.ts:6:1 —— Error: boom at run (qa-preview/main.ts:6:1)')
    expect(text).toContain('2. qa-preview/store.ts:12:3 —— Error: 读不到 config')
    expect(text).not.toContain('已加载 3 个模块')
  })

  it('涉及文件去掉行列号并去重', () => {
    const text = buildFixRequest({
      path: 'a.html',
      entries: [
        { level: 'error', text: 'x', source: 'sub/a.ts:1:2' },
        { level: 'error', text: 'y', source: 'sub/a.ts:9:9' },
      ],
    })
    expect(text).toContain('涉及文件：sub/a.ts\n')
  })

  it('错误与文件都有上限，超出部分说清数量', () => {
    const many = Array.from({ length: 11 }, (_, index) => ({
      level: 'error',
      text: `err ${index}`,
      source: `f${index}.ts:1:1`,
    }))
    const text = buildFixRequest({ path: 'a.html', entries: many })
    expect(text).toContain('8. f7.ts:1:1 —— err 7')
    expect(text).not.toContain('err 8')
    expect(text).toContain('另有 3 条没有列出')
    expect(text).toContain('涉及文件：f0.ts、f1.ts、f2.ts、f3.ts、f4.ts、f5.ts\n')
  })

  it('没有错误时退回警告，什么都没有就返回空串', () => {
    const warns = buildFixRequest({ path: 'a.html', entries: [{ level: 'warn', text: '样式被丢弃', source: '' }] })
    expect(warns).toContain('1. 样式被丢弃')
    expect(buildFixRequest({ path: 'a.html', entries: [{ level: 'info', text: 'ok', source: '' }] })).toBe('')
    expect(buildFixRequest({ path: 'a.html' })).toBe('')
  })

  it('输出是给人读的中文描述，不是原始 JSON', () => {
    const text = buildFixRequest({ path: 'a.html', entries })
    expect(text).not.toContain('"level"')
    expect(text).not.toContain('[{')
    expect(text).toContain('（以上来自工作区预览控制台，行号已按 sourcemap 换回源文件）')
  })
})

describe('chatDraft', () => {
  it('草稿只投递一次：取走即清空，重复挂载不会再塞一遍', async () => {
    const { chatDraft, requestChatDraft, takeChatDraft } = await import('../src/services/chatDraft')
    expect(requestChatDraft('   ')).toBe(false)
    expect(requestChatDraft(' 请修这个错误 ')).toBe(true)
    expect(chatDraft.value).toBe('请修这个错误')
    expect(takeChatDraft()).toBe('请修这个错误')
    expect(chatDraft.value).toBe('')
    expect(takeChatDraft()).toBe('')
  })
})

describe('normalizeAutomateResult', () => {
  it('只挑认识的字段：预览页里的代码也能伪造应答，结构一律不透传', () => {
    const result = normalizeAutomateResult({
      ok: true,
      action: 'click',
      target: '[3] button "登录"',
      message: '已点击',
      title: '登录页',
      viewport: '1440x900',
      scrollY: 120,
      refCount: 8,
      evil: '<img src=x onerror=alert(1)>',
      nested: { deep: true },
      proto: '__proto__',
    })
    expect(result).toEqual({
      ok: true,
      action: 'click',
      target: '[3] button "登录"',
      message: '已点击',
      title: '登录页',
      viewport: '1440x900',
      scrollY: 120,
      refCount: 8,
    })
    expect(Object.keys(result)).not.toContain('evil')
  })

  it('ok 只认真正的 true，其余一律当失败', () => {
    expect(normalizeAutomateResult({ ok: true }).ok).toBe(true)
    expect(normalizeAutomateResult({ ok: 'true' }).ok).toBe(false)
    expect(normalizeAutomateResult({ ok: 1 }).ok).toBe(false)
    expect(normalizeAutomateResult(null).ok).toBe(false)
  })

  it('快照文本单独限字数，长消息与长 target 也要裁', () => {
    const long = normalizeAutomateResult({ ok: true, action: 'read', text: 'x'.repeat(40000) })
    expect(long.text).toHaveLength(12000)
    const chatty = normalizeAutomateResult({ ok: false, action: 'read', message: 'y'.repeat(2000), target: 'z'.repeat(900) })
    expect(chatty.message.length).toBeLessThanOrEqual(401)
    expect(chatty.target.length).toBeLessThanOrEqual(201)
  })

  it('数字字段要收敛：NaN、负数、超大 refCount 都不能带进模型上下文', () => {
    expect(normalizeAutomateResult({ ok: true, scrollY: 'abc' }).scrollY).toBeUndefined()
    expect(normalizeAutomateResult({ ok: true, scrollY: -40 }).scrollY).toBe(0)
    expect(normalizeAutomateResult({ ok: true, refCount: 1e9 }).refCount).toBe(9999)
    expect(normalizeAutomateResult({ ok: true, truncated: 'yes' }).truncated).toBeUndefined()
  })
})
