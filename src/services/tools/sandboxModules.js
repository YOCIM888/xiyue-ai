/**
 * 工作区模块依赖图与沙箱运行的公共辅助：calculate 与 files.run 共用。
 */
import { runJavaScript } from '../sandbox'
import { collectModules, VIRTUAL_ENTRY } from '../workspaceModules'
import { remapStack } from '../sandbox/sourceMap'
import { vueEntryHostCode } from '../sandbox/vendorModules'
import { failure, success, truncate } from './protocol'
import { formatBytes } from '../workspace'

export const ESM_SYNTAX = /^\s*(?:import|export)\b/m

/** 合成的内联入口路径是内部哨兵，展示时换回人话 */
export function displayPath(path) {
  if (path === VIRTUAL_ENTRY) return '内联代码'
  if (String(path).startsWith('vendor/')) return `内置模块 ${String(path).slice('vendor/'.length)}`
  return path
}

export function describeLoaded(collected) {
  return collected.modules.map(item => displayPath(item.path))
}

/** 编译时被丢弃的部分（.vue 的 style 等），不说的话模型会以为样式也验证过了 */
export function describeNotes(notes) {
  return (notes || []).map(item => `${displayPath(item.path)}：${item.notes.join('；')}`).join('\n')
}

export function describeMissing(missing) {
  const lines = missing.slice(0, 12).map(item =>
    `${item.from ? `从 ${displayPath(item.from)} ` : '入口 '}导入「${item.specifier}」：${item.reason}`)
  const more = missing.length > lines.length ? `\n…另有 ${missing.length - lines.length} 条` : ''
  return lines.join('\n') + more
}

/** 环以 "a → b → a" 形式给出，逐段还原哨兵路径 */
export function describeCycles(cycles) {
  return cycles.slice(0, 6).map(item => item.split(' → ').map(displayPath).join(' → ')).join('\n')
}

/** 浏览器原生报错对模型不够直白，补一句改法 */
export function withModuleHint(error, { inlineEntry = false } = {}) {
  const text = String(error || '')
  const hints = []
  if (/Illegal return statement|return[^\n]*(?:outside|not allowed)/i.test(text)) {
    hints.push('ES 模块顶层不能 return：用 console.log 输出，或 export default 一个函数把结果返回。')
  }
  if (/Failed to resolve module specifier|Invalid URL|Cannot use import statement outside a module/i.test(text)) {
    hints.push('沙箱只能加载工作区内的模块，import 路径要以 ./ 或 ../ 开头，并在 files 里列出被依赖的文件。')
  }
  // 内联 code 不经转译，模型很容易顺手写成 TS；语法错要指明该落成文件
  // 经典脚本路径只回传 message（没有 SyntaxError 前缀），所以把常见的类型标注报错也列进来
  if (inlineEntry && /SyntaxError|Missing initializer|Expected a semicolon|Unexpected (?:token|identifier|reserved word)/i.test(text)) {
    hints.push('若这段是 TypeScript / JSX 语法：内联 code 只接受纯 JS，请先写成 .ts / .tsx 文件再用 path 运行，沙箱会自动转译。')
  }
  return hints.length ? `\n提示：${hints.join(' ')}` : ''
}

/** run 的 .vue 入口自动套一层挂载：直接跑组件就是冒烟渲染 */
export function normalizeRunGraph({ entry = '', code = '', deps = [] } = {}) {
  const target = String(entry || '').trim()
  if (String(code || '').trim() || !target.toLowerCase().endsWith('.vue')) {
    return { entry, code, deps, label: target || '内联代码' }
  }
  return { entry: '', code: vueEntryHostCode(target), deps, label: `${target}（挂载渲染）` }
}

/** 沙箱报错里的行列是转译后坐标，先换算回源文件再给模型 */
export function describeSandboxError(error, maps, options) {
  const raw = truncate(String(error || ''), 4000)
  return `${remapStack(raw, maps || {})}${withModuleHint(raw, options)}`
}

/** 解析依赖图并汇总所有阻塞原因；有问题时调用方必须放弃执行，而不是跑半截 */
export async function prepareModuleGraph(graph, { onStatus, label } = {}) {
  const normalized = normalizeRunGraph(graph)
  const target = label || normalized.label
  onStatus?.(`正在解析 ${target} 的模块依赖…`)
  const collected = await collectModules({ ...normalized, onStatus })
  const problems = []
  if (collected.missing.length) problems.push(`依赖解析失败：\n${describeMissing(collected.missing)}`)
  if (collected.cycles.length) {
    problems.push(`存在循环依赖（沙箱按拓扑序生成模块 URL，无法加载环）：\n${describeCycles(collected.cycles)}`)
  }
  if (collected.truncated) problems.push('模块数量或总大小超过沙箱上限，请精简依赖')
  return { collected, problems, ...normalized, label: target }
}

/** 把工作区模块喂进沙箱按真实 ESM 语义运行 */
export async function runWorkspaceModules(graph, { settings, signal, onStatus } = {}) {
  const { entry, code, deps, label } = normalizeRunGraph(graph)
  if (!settings?.calcSandboxEnabled) {
    return failure(`无法运行 ${label}：本地计算沙箱未开启（可在技能管理里开启）`, `files：run ${label} → 沙箱未开启`)
  }

  const { collected, problems } = await prepareModuleGraph({ entry, code, deps }, { onStatus, label })
  if (problems.length) {
    const blocked = collected.cycles.length && !collected.missing.length
      ? '循环依赖'
      : `依赖未就绪（${collected.missing.length} 项）`
    return failure(
      `${problems.join('\n\n')}\n\n未执行任何代码。请补齐缺失文件或把依赖改成单向后再运行。`,
      `files：run ${label} → ${blocked}`
    )
  }

  const loaded = describeLoaded(collected)
  const notes = describeNotes(collected.notes)
  onStatus?.(`正在沙箱中运行 ${label}（${loaded.length} 个模块）…`)
  const result = await runJavaScript(code || '', {
    modules: collected.modules,
    order: collected.order,
    entry: collected.entry || entry,
    signal,
  })
  if (!result.ok) {
    // .vue 入口的 code 是我们合成的挂载壳，不该被当成「用户写的内联 JS」
    const error = describeSandboxError(result.error, collected.maps, { inlineEntry: Boolean(String(graph?.code || '').trim()) })
    return failure(
      `${label} 执行失败：\n${error}\n\n（这是浏览器真实抛出的错误，行号已换算回源文件，请按报错修改后重跑。）`,
      `files：run ${label} → 失败：${truncate(error, 300)}`
    )
  }
  const output = result.output || '（无输出）'
  return success(
    `已在沙箱按真实 ESM 语义运行 ${label}，加载 ${loaded.length} 个模块：\n${loaded.map(path => `- ${path}`).join('\n')}\n\n输出：\n${output}\n\n`
    + `${notes ? `${notes}\n` : ''}`
    + '（以上为真实执行结果。断言失败请用 throw，抛错即本次运行失败；未抛错才代表通过。TS/Vue 只做了转译，不代表类型检查通过。）',
    `files：run ${label} → ${loaded.length} 个模块，输出 ${formatBytes(output.length)}`
  )
}
