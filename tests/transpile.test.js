import { describe, expect, it } from 'vitest'
import transpileRaw from '../src/services/sandbox/transpile.js?raw'
import { formatTranspileError, isTranspilable, transformWith, transpileOptions } from '../src/services/sandbox/transpile'

describe('打包边界', () => {
  it('转译模块不引用 esbuild 运行时，wasm 才能留在懒加载分片里', () => {
    expect(transpileRaw).not.toContain('esbuildRuntime')
    expect(transpileRaw).not.toContain("from 'esbuild-wasm")
  })
})

describe('转译选项', () => {
  it('按扩展名选 loader，JSX 走 vue 自动运行时', () => {
    expect(transpileOptions('a/b.ts').loader).toBe('ts')
    expect(transpileOptions('a/b.tsx').loader).toBe('tsx')
    expect(transpileOptions('a/b.jsx').loader).toBe('jsx')
    expect(transpileOptions('a/b.js').loader).toBe('js')
    expect(transpileOptions('a/b.tsx')).toMatchObject({
      jsx: 'automatic',
      jsxImportSource: 'vue',
      sourcemap: 'external',
      sourcefile: 'a/b.tsx',
    })
  })

  // .vue 的 <script lang="ts"> 编译产物仍是 TS，用合成路径把 loader 掰回 ts
  it('.vue.ts 合成路径按 TS 转译', () => {
    expect(transpileOptions('src/App.vue.ts').loader).toBe('ts')
    expect(transpileOptions('src/App.vue.tsx').loader).toBe('tsx')
    expect(transpileOptions('src/App.vue.jsx').loader).toBe('jsx')
  })

  it('标出需要转译的类型', () => {
    expect(isTranspilable('a.ts')).toBe(true)
    expect(isTranspilable('a.tsx')).toBe(true)
    expect(isTranspilable('a.jsx')).toBe(true)
    expect(isTranspilable('a.js')).toBe(false)
    expect(isTranspilable('a.vue')).toBe(false)
    expect(isTranspilable('a.json')).toBe(false)
  })
})

describe('transformWith', () => {
  it('把 esbuild 产物与外链 sourcemap 交回上层', async () => {
    const calls = []
    const fake = {
      async transform(text, options) {
        calls.push({ text, options })
        return { code: `/*${text}*/`, map: '{"version":3,"mappings":"AAAA"}' }
      },
    }
    const out = await transformWith(fake, 'src/a.ts', 'export const n: number = 1')
    expect(calls[0].options).toMatchObject({ loader: 'ts', format: 'esm' })
    expect(out.text).toBe('/*export const n: number = 1*/')
    expect(out.map).toContain('mappings')
  })
})

describe('formatTranspileError', () => {
  it('摊平 esbuild 的 errors[]，带源码行列', () => {
    const err = {
      message: 'Transform failed with 2 errors',
      errors: [
        { text: 'Expected identifier but found "="', location: { line: 1, column: 17, lineText: 'export const x: = 1' } },
        { text: 'Unexpected "}"', location: { line: 3, column: 0, lineText: '}' } },
      ],
    }
    const text = formatTranspileError(err, 'src/a.ts')
    expect(text).toContain('src/a.ts:1:17: Expected identifier but found "="')
    expect(text).toContain('export const x: = 1')
    expect(text).toContain('src/a.ts:3:0: Unexpected "}"')
  })

  it('超过 6 条时汇总剩余数量', () => {
    const err = { errors: Array.from({ length: 8 }, (_, i) => ({ text: `err${i}`, location: { line: i, column: 0 } })) }
    const text = formatTranspileError(err, 'a.ts')
    expect(text).toContain('…另有 2 处语法错误')
    expect(text).not.toContain('err7')
  })

  it('非 esbuild 错误保留原始信息', () => {
    expect(formatTranspileError({ message: 'wasm 下载失败' }, 'a.ts')).toContain('a.ts 转译失败：wasm 下载失败')
  })
})
