/**
 * Vue 单文件组件 → 单个 ESM 模块。
 * compileScript 的 inlineTemplate 模式把 <template> 编译进 setup 返回值，产物只依赖裸
 * 'vue'（由沙箱垫片提供），<style> 与 custom block 一律丢弃：沙箱里没有样式管线，
 * 让模型知道「跑通的是渲染结果，不是外观」。
 */
import { parse, compileScript } from '@vue/compiler-sfc'

function sfcId(path) {
  let hash = 2166136261
  for (const char of String(path)) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, 16777619) >>> 0
  }
  return hash.toString(36)
}

/**
 * compileScript 会把 import 提到产物顶部、再把语句包进 setup()，两类行的偏移并不相同。
 * 栈里绝大多数帧落在脚本主体，所以锚点取首个非 import 行；整段只有 import 时退回首行。
 * 锚点在产物里匹配不到就返回 0，宁可少换算也不要给出算错行号的结果。
 */
export function scriptLineShift(compiled, scriptContent, startLine = 1) {
  const contentLines = String(scriptContent || '').split('\n')
  const findLine = test => contentLines.findIndex(line => test(String(line)))
  let skip = findLine(line => line.trim() && !/^\s*import\b/.test(line))
  if (skip < 0) skip = findLine(line => line.trim())
  if (skip < 0) return 0
  const anchor = contentLines[skip].trim()
  const index = String(compiled || '').split('\n').findIndex(line => line.trim() === anchor)
  if (index < 0) return 0
  return startLine + skip - (index + 1)
}

function describeErrors(errors, path) {
  const lines = errors.slice(0, 6).map(err => {
    const at = err.loc?.start ? `${err.loc.start.line}:${err.loc.start.column}` : ''
    const text = String(err.message || err).split('\n')[0]
    return `${path}${at ? `:${at}` : ''}: ${text}`
  })
  return lines.join('\n')
}

/** @returns {{ text: string, shift: number, lang: string, ignored: string[] }} */
export function compileSfc(path, source) {
  let text = String(source ?? '')
  let { descriptor, errors } = parse(text, { filename: path })
  // 只有 <template> 的组件同样值得冒烟渲染，但 compileScript 拒绝无脚本的 SFC：
  // 末尾补一个只含注释的脚本块（空内容会被 parse 丢掉，前缀注释既保留块又不产生语句）
  const scriptless = !errors.length && !descriptor.script && !descriptor.scriptSetup && Boolean(descriptor.template)
  if (scriptless) {
    ;({ descriptor, errors } = parse(`${text}\n<script setup>//</script>\n`, { filename: path }))
  }
  if (errors.length) throw new Error(`SFC 解析失败：\n${describeErrors(errors, path)}`)
  const block = descriptor.scriptSetup || descriptor.script
  let content
  try {
    content = compileScript(descriptor, { id: sfcId(path), inlineTemplate: true }).content
  } catch (err) {
    const detail = String(err?.message || err).split('\n')[0]
    const at = err?.loc?.start ? `（模板 ${err.loc.start.line}:${err.loc.start.column}）` : ''
    throw new Error(`${path} 编译失败：${detail}${at}`, { cause: err })
  }
  const ignored = []
  if (descriptor.styles.length) ignored.push(`<style> ×${descriptor.styles.length}（沙箱不渲染样式）`)
  if (descriptor.customBlocks.length) ignored.push(`自定义块 ×${descriptor.customBlocks.length}`)
  const lang = String(block?.lang || '').toLowerCase()
  // compileScript 原样保留 <script lang="ts"> 的类型标注，后面还得按 TS 再转译一次
  return {
    text: content,
    shift: scriptless ? 0 : scriptLineShift(content, block?.content, block?.loc.start.line || 1),
    lang: ['ts', 'tsx', 'jsx'].includes(lang) ? lang : '',
    ignored,
  }
}
