/**
 * 把 TypeScript / TSX / JSX 源码转译成浏览器可直接加载的 ESM。
 * 只做转译，不做类型检查：报错来自 esbuild 的语法解析，不能对模型宣称「类型通过」。
 * 本文件保持纯函数、不引用 esbuild 运行时，宿主才能只在需要时才动态加载 wasm。
 */
import { compileKind } from './modulePaths'

const LOADER_BY_KIND = { ts: 'ts', tsx: 'tsx', jsx: 'jsx' }

export function isTranspilable(path) {
  return Boolean(LOADER_BY_KIND[compileKind(path)])
}

export function transpileOptions(path) {
  return {
    loader: LOADER_BY_KIND[compileKind(path)] || 'js',
    format: 'esm',
    target: 'es2022',
    jsx: 'automatic',
    jsxImportSource: 'vue',
    sourcemap: 'external',
    sourcefile: path,
    legalComments: 'none',
    keepNames: true,
  }
}

/** esbuild 的 errors[].location 已经指到源文件行列，摊平成一句人能读的话 */
export function formatTranspileError(error, path) {
  const items = Array.isArray(error?.errors) && error.errors.length ? error.errors : null
  if (!items) return `${path} 转译失败：${error?.message || String(error)}`
  const lines = items.slice(0, 6).map(item => {
    const at = item.location ? `${item.location.line}:${item.location.column}` : ''
    const snippet = item.location?.lineText ? `\n  ${item.location.lineText.trim().slice(0, 200)}` : ''
    return `${path}${at ? `:${at}` : ''}: ${item.text}${snippet}`
  })
  const more = items.length > lines.length ? `\n…另有 ${items.length - lines.length} 处语法错误` : ''
  return `转译失败：\n${lines.join('\n')}${more}`
}

/** esbuild 实例由调用方注入：这样本模块不必依赖 wasm 运行时的加载时机 */
export async function transformWith(esbuildLike, path, text) {
  const result = await esbuildLike.transform(String(text ?? ''), transpileOptions(path))
  return { text: result.code, map: result.map || null }
}
