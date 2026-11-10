import { describe, expect, it } from 'vitest'
import { createCompiler, jsonModuleText } from '../src/services/sandbox/compile'
import {
  VENDOR_MODULES, vendorByPath, vendorBySpecifier, vueEntryHostCode,
} from '../src/services/sandbox/vendorModules'

describe('jsonModuleText', () => {
  it('把 JSON 变成默认导出的模块', () => {
    expect(jsonModuleText('{"a":1}', 'd.json')).toBe('export default {"a":1}')
  })

  it('坏 JSON 指名道姓，而不是让模型猜哪个文件炸了', () => {
    expect(() => jsonModuleText('{oops}', 'src/d.json')).toThrow(/src\/d\.json 不是合法 JSON/)
  })
})

describe('createCompiler', () => {
  it('.js 原样透传，不进缓存', async () => {
    const cache = new Map()
    const compile = createCompiler({ cache })
    const out = await compile('a/b.js', 'export const n = 1\n')
    expect(out).toEqual({ text: 'export const n = 1\n', lines: null, shift: 0, notes: [] })
    expect(cache.size).toBe(0)
  })

  it('内容没变复用同一次编译结果', async () => {
    const cache = new Map()
    const compile = createCompiler({ cache })
    const first = await compile('d.json', '{"a":1}')
    const again = await compile('d.json', '{"a":1}')
    expect(again).toBe(first)
    const changed = await compile('d.json', '{"a":2}')
    expect(changed).not.toBe(first)
    expect(changed.text).toContain('"a":2')
  })

  it('缓存有条数上限，超了丢最久没用的', async () => {
    const cache = new Map()
    const compile = createCompiler({ cache })
    for (let i = 0; i < 45; i += 1) await compile(`m${i}.json`, '{}')
    expect(cache.size).toBeLessThanOrEqual(40)
  })
})

describe('内置垫片', () => {
  it('垫片文本只引用 canonical vue 路径', () => {
    for (const name of ['vue/jsx-runtime', 'xiyue:vue-mount']) {
      const text = VENDOR_MODULES[name].text()
      expect(text).toContain('"vendor/vue.js"')
      expect(text).not.toMatch(/from ['"]vue['"]/)
      expect(VENDOR_MODULES[name].requires).toEqual(['vendor/vue.js'])
    }
  })

  it('specifier 与图内路径互查一致，未内置的仍然查不到', () => {
    expect(vendorBySpecifier('vue').path).toBe('vendor/vue.js')
    expect(vendorByPath('vendor/vue-mount.js')).toBe(VENDOR_MODULES['xiyue:vue-mount'])
    expect(vendorBySpecifier('lodash')).toBeNull()
    expect(vendorByPath('src/App.vue')).toBeNull()
  })

  it('run 一个 .vue 时合成挂载入口，组件路径按工作区根解析', () => {
    const code = vueEntryHostCode('src/App.vue')
    expect(code).toContain('import Component from "./src/App.vue"')
    expect(code).toContain('import { mountForTest } from "xiyue:vue-mount"')
    expect(code).toMatch(/^export default \(\) => mountForTest\(Component\)$/m)
  })
})
