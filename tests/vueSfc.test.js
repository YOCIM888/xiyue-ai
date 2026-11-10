import { describe, expect, it } from 'vitest'
import { compileSfc, scriptLineShift } from '../src/services/sandbox/vueSfc'

const SFC = [
  '<script setup lang="ts">',
  "import { ref } from 'vue'",
  'const count = ref(0)',
  '</script>',
  '<template><p>{{ count }}</p></template>',
  '<style scoped>p { color: red }</style>',
  '',
].join('\n')

describe('compileSfc', () => {
  it('产出只依赖裸 vue 的单个 ESM 模块', () => {
    const out = compileSfc('src/Counter.vue', SFC)
    expect(out.text).toMatch(/^import .* from ['"]vue['"]/m)
    expect(out.text).toContain('export default')
    // 内联模板：不再需要 runtime 编译，也不该出现第二个外部依赖
    expect(out.text).not.toContain('template')
    expect([...new Set([...out.text.matchAll(/from ['"]([^'"]+)['"]/g)].map(m => m[1]))]).toEqual(['vue'])
  })

  it('保留 TS 标注，交给后续 esbuild 转译', () => {
    const out = compileSfc('src/Counter.vue', '<script setup lang="ts">\nconst n: number = 1\n</script>\n<template><p>{{ n }}</p></template>')
    expect(out.text).toContain(': number')
    expect(out.lang).toBe('ts')
  })

  it('行号偏移能把产物行换算回 .vue 行', () => {
    const out = compileSfc('src/Counter.vue', SFC)
    const at = out.text.split('\n').findIndex(line => line.includes('const count =')) + 1
    expect(at).toBeGreaterThan(0)
    expect(at + out.shift).toBe(3)
  })

  it('丢弃样式与自定义块，但要说出来', () => {
    const out = compileSfc('src/Counter.vue', SFC + '<docs>说明</docs>\n')
    expect(out.text).not.toContain('color: red')
    expect(out.ignored.join(' ')).toContain('<style> ×1')
    expect(out.ignored.join(' ')).toContain('自定义块 ×1')
  })

  it('只在需要转译时上报 lang', () => {
    expect(compileSfc('src/A.vue', '<script setup>\nconst n = 1\n</script>\n<template><p>{{ n }}</p></template>').lang).toBe('')
    expect(compileSfc('src/J.vue', '<script setup lang="jsx">\nconst el = () => <p>x</p>\n</script>').lang).toBe('jsx')
  })

  it('模板语法错误带上文件与行列', () => {
    expect(() => compileSfc('src/Bad.vue', '<template><div><span></template>')).toThrow(/Bad\.vue/)
  })

  it('只有 <template> 的组件也能编译成可挂载的模块', () => {
    const out = compileSfc('src/Plain.vue', '<template><p>hi</p></template>')
    expect(out.text).toContain('export default')
    expect(out.shift).toBe(0)
  })

  it('既没有脚本也没有模板时报错带上文件', () => {
    expect(() => compileSfc('src/Empty.vue', '<style>p{}</style>')).toThrow(/Empty\.vue/)
  })
})

describe('scriptLineShift', () => {
  it('锚点找不到时返回 0，不给出算错的行号', () => {
    expect(scriptLineShift('export default {}', 'const a = 1')).toBe(0)
    expect(scriptLineShift('', '')).toBe(0)
  })

  it('产物在原位置时偏移为 0', () => {
    expect(scriptLineShift('const a = 1\nexport default {}', 'const a = 1\nexport default {}')).toBe(0)
  })

  it('锚点跳过被提升的 import，主体行号才对得上', () => {
    const compiled = [
      "import { ref } from 'vue'", '', 'export default {', '  setup() {', 'const n = 1', '  }', '}',
    ].join('\n')
    // <script setup> 在第 1 行 → const n 是 .vue 第 3 行，产物里是第 5 行
    expect(scriptLineShift(compiled, "\nimport { ref } from 'vue'\nconst n = 1\n", 1)).toBe(3 - 5)
  })
})
