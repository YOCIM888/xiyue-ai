/**
 * 工具调用协议与执行器。
 * 模型通过 ```tool JSON 代码块显式选择工具，前端执行后把真实结果回传。
 * 兼容旧的 sandbox-js / sandbox-python 计算代码块。
 */
import { searchWeb, buildSearchContext } from './webSearch'
import { useAssetsStore } from '../stores/assets'
import { runJavaScript, runPython } from './sandbox'
import { generateImage } from './imageGen'

const MAX_CALLS_PER_ROUND = 2
const MAX_DOC_CHARS = 6000
const MAX_DOC_CHUNKS = 6
const MAX_DOC_SCAN = 60000

const TOOL_ALIASES = {
  search: 'search_web',
  search_web: 'search_web',
  document: 'read_document',
  read_document: 'read_document',
  read_docs: 'read_document',
  calc: 'calculate',
  calculate: 'calculate',
  chart: 'draw_chart',
  draw_chart: 'draw_chart',
  image: 'generate_image',
  generate_image: 'generate_image',
  export: 'export_conversation',
  export_conversation: 'export_conversation',
}

const EXPORT_FORMATS = {
  md: 'md', markdown: 'md',
  html: 'html', htm: 'html', 网页: 'html',
  pdf: 'pdf', 打印: 'pdf',
  doc: 'doc', word: 'doc', docx: 'doc',
}

function success(text, record) {
  return { ok: true, text, record }
}

function failure(text, record) {
  return { ok: false, text, record: record || `失败：${text}` }
}

function truncate(text, max) {
  const value = String(text ?? '')
  return value.length > max ? `${value.slice(0, max)}\n…（已截断）` : value
}

/** 生成系统提示里的工具说明；没有可用工具时返回空字符串 */
export function buildToolPrompt(settings) {
  const tools = []

  if (settings.searchSkillEnabled && String(settings.tavilyApiKey || '').trim()) {
    tools.push({
      name: 'search_web',
      desc: '联网搜索最新或外部信息，返回带来源的摘要。需要实时信息时优先使用，不要凭记忆猜测。',
      example: '{"tool":"search_web","args":{"query":"2026 年 11 月 AI 行业新闻"}}',
    })
  }
  if (settings.documentSkillEnabled) {
    tools.push({
      name: 'read_document',
      desc: '从「我的文档」检索相关内容。args.query 是检索词，args.title 可选用于限定文档标题。',
      example: '{"tool":"read_document","args":{"query":"季度营收","title":"财报"}}',
    })
  }
  if (settings.calcSandboxEnabled) {
    tools.push({
      name: 'calculate',
      desc: '在本地沙箱精确计算。lang 为 js 或 python；JavaScript 用 return 返回结果，Python 用 print 或最后一行表达式输出。不要心算。',
      example: '{"tool":"calculate","args":{"lang":"js","code":"return 123456789*987654321"}}',
    })
  }
  tools.push({
    name: 'draw_chart',
    desc: '生成 ECharts 图表。可传 type/title/labels/values，或直接传 option（ECharts 配置对象）。图表类型仅支持 bar、line、pie、scatter。',
    example: '{"tool":"draw_chart","args":{"type":"bar","title":"月度销售","labels":["1月","2月"],"values":[120,180]}}',
  })
  if (settings.imageGenSkillEnabled && settings.secondaryReady) {
    tools.push({
      name: 'generate_image',
      desc: '调用副模型生成图片。仅在用户明确要求画图/生图时使用。',
      example: '{"tool":"generate_image","args":{"prompt":"一只在月球上晒太阳的橘猫"}}',
    })
  }
  tools.push({
    name: 'export_conversation',
    desc: '导出当前对话。格式支持 md、html、pdf、doc。仅在用户明确要求导出时使用。',
    example: '{"tool":"export_conversation","args":{"format":"md"}}',
  })

  if (!tools.length) return ''

  const lines = [
    '\n\n【工具调用】',
    '需要外部能力时，不要猜测或心算。先输出一个 tool 代码块（内容是 JSON），一次最多 2 个：',
    '```tool',
    '{"tool":"search_web","args":{"query":"关键词"}}',
    '```',
    '可用工具：',
  ]
  tools.forEach((tool, index) => {
    lines.push(`${index + 1}. ${tool.name}：${tool.desc}`)
    lines.push(`   示例：${tool.example}`)
  })
  lines.push(
    '规则：拿到工具结果后再继续回答；不要编造工具结果；不要重复调用同一个工具；简单问题不要调用工具。',
    '用户明确要求搜索、生成图片或导出时，仍然优先使用对应工具。'
  )
  return lines.join('\n')
}

/** 提取模型回复中的工具调用，兼容旧 sandbox 代码块 */
export function extractToolCalls(content) {
  const text = String(content || '')
  const calls = []

  const toolRegex = /```(?:tool|tool-call|tool_call)\s*\n([\s\S]*?)```/gi
  for (const match of text.matchAll(toolRegex)) {
    if (calls.length >= MAX_CALLS_PER_ROUND) break
    const raw = match[1].trim()
    try {
      const parsed = JSON.parse(raw)
      const name = String(parsed.tool || parsed.name || '').toLowerCase()
      const tool = TOOL_ALIASES[name]
      if (!tool) {
        calls.push({ tool: '__invalid__', args: {}, raw, error: `未知工具：${name || '空'}` })
        continue
      }
      const args = parsed.args || parsed.arguments || {}
      calls.push({ tool, args: args && typeof args === 'object' ? args : {} })
    } catch {
      calls.push({ tool: '__invalid__', args: {}, raw, error: '工具调用 JSON 解析失败' })
    }
  }

  const sandboxRegex = /```(sandbox-js|sandbox-python|calc-js|calc-python)[^\n]*\n([\s\S]*?)```/gi
  for (const match of text.matchAll(sandboxRegex)) {
    if (calls.length >= MAX_CALLS_PER_ROUND) break
    calls.push({
      tool: 'calculate',
      args: { lang: /python/i.test(match[1]) ? 'python' : 'js', code: match[2].trim() },
    })
  }

  return calls
}

/** 去掉未执行的工具代码块，避免最终回答里残留 JSON */
export function stripToolBlocks(content) {
  return String(content || '')
    .replace(/```(?:tool|tool-call|tool_call)\s*\n[\s\S]*?```/gi, '')
    .replace(/```(sandbox-js|sandbox-python|calc-js|calc-python)[^\n]*\n[\s\S]*?```/gi, '')
    .trim()
}

async function runSearch(args, settings) {
  const query = String(args.query || args.q || '').trim()
  if (!query) return failure('search_web 缺少 query 参数')
  const apiKey = String(settings.tavilyApiKey || '').trim()
  if (!apiKey) return failure('未配置 Tavily API Key，无法联网搜索')
  const result = await searchWeb(query, {
    apiKey,
    depth: settings.searchDepth,
    maxResults: settings.searchMaxResults,
  })
  if (!result.ok) return failure(result.message || '联网搜索失败')
  const built = buildSearchContext(query, result, {
    maxChars: Math.min(Number(settings.searchMaxChars) || 8000, 8000),
    itemMaxChars: Number(settings.searchItemMaxChars) || 1200,
  })
  const count = Array.isArray(result.results) ? result.results.length : 0
  return success(
    `搜索结果（query: ${query}）：\n\n${built.text}`,
    `search_web："${query}" → ${count} 条结果`
  )
}

async function runReadDocument(args, documentIds) {
  const { splitIntoChunks, scoreChunks } = await import('./docRetrieval')
  const query = String(args.query || args.keyword || '').trim()
  const wantedTitle = String(args.title || '').trim()
  const store = useAssetsStore()
  let docs = store.assets.filter(asset => (asset.content || '').trim())

  if (documentIds?.length) {
    const selected = docs.filter(asset => documentIds.includes(asset.id))
    if (selected.length) docs = selected
  }
  if (wantedTitle) {
    const matched = docs.filter(asset => asset.title.toLowerCase().includes(wantedTitle.toLowerCase()))
    if (matched.length) docs = matched
  }
  if (!docs.length) return failure('本地文档库为空，请先在「我的文档」中导入文件')

  const chunks = []
  for (const doc of docs.slice(0, 5)) {
    const parts = splitIntoChunks(String(doc.content || '').slice(0, MAX_DOC_SCAN))
    parts.forEach((text, index) => {
      chunks.push({ text, docTitle: doc.title, index: index + 1, total: parts.length })
    })
  }
  if (!chunks.length) return failure('文档中没有可读取的正文')

  let picked = []
  if (query) {
    picked = scoreChunks(chunks, query)
      .filter(chunk => chunk.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_DOC_CHUNKS)
  }
  if (!picked.length) picked = chunks.slice(0, MAX_DOC_CHUNKS)

  const blocks = []
  let used = 0
  for (const chunk of picked) {
    if (used >= MAX_DOC_CHARS) break
    const text = chunk.text.slice(0, MAX_DOC_CHARS - used)
    blocks.push(`【${chunk.docTitle} · 片段 ${chunk.index}/${chunk.total}】\n${text}`)
    used += text.length
  }

  const titles = [...new Set(picked.map(chunk => chunk.docTitle))].join('、')
  return success(
    `以下是从本地文档库检索到的内容，请优先依据这些片段回答，并在引用处标注文档名与片段序号；若片段不足，请明确说明：\n\n${blocks.join('\n\n')}`,
    `read_document：${query ? `"${query}" → ` : ''}${picked.length} 个片段（${titles}）`
  )
}

async function runCalculate(args, { signal, onStatus } = {}) {
  const lang = String(args.lang || args.language || 'js').toLowerCase() === 'python' ? 'python' : 'js'
  const code = String(args.code || args.script || '').trim()
  if (!code) return failure('calculate 缺少 code 参数')

  let result
  if (lang === 'python') {
    window.__ui?.showToast('首次运行 Python 需要加载运行时，请稍候…', 'info', 5000)
    result = await runPython(code, { signal, onStatus })
  } else {
    result = await runJavaScript(code, { signal })
  }

  const output = result.ok ? (result.output || '（无输出）') : `执行失败：${result.error}`
  const recordCode = code.length > 1500 ? `${code.slice(0, 1500)}…` : code
  return {
    ok: result.ok,
    text: result.ok
      ? `本地 ${lang === 'python' ? 'Python' : 'JavaScript'} 执行结果：\n${output}`
      : `本地执行失败：${result.error}`,
    record: `calculate（${lang}）：\n${recordCode}\n→ ${truncate(output, 3000)}`,
  }
}

function normalizeChart(args) {
  let option = args.option
  if (typeof option === 'string') {
    try { option = JSON.parse(option) } catch { return null }
  }
  const allowed = ['bar', 'line', 'pie', 'scatter']
  if (option && typeof option === 'object') {
    if (!Array.isArray(option.series) || !option.series.length) return null
    if (option.series.some(series => !allowed.includes(String(series?.type || 'bar')))) return null
    return { option, type: String(option.series[0]?.type || 'chart') }
  }

  const type = allowed.includes(String(args.type || '')) ? String(args.type) : 'bar'
  const labels = Array.isArray(args.labels)
    ? args.labels
    : Array.isArray(args.categories) ? args.categories : []
  const values = Array.isArray(args.values)
    ? args.values
    : Array.isArray(args.data) ? args.data : []
  if (!labels.length || !values.length) return null

  const title = String(args.title || '').trim()
  if (type === 'pie') {
    return {
      option: {
        ...(title ? { title: { text: title } } : {}),
        tooltip: { trigger: 'item' },
        legend: { bottom: 0 },
        series: [{
          type: 'pie',
          radius: '62%',
          data: labels.map((name, index) => ({ name: String(name), value: Number(values[index]) || 0 })),
        }],
      },
      type,
    }
  }

  return {
    option: {
      ...(title ? { title: { text: title } } : {}),
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: labels.map(String) },
      yAxis: { type: 'value' },
      series: [{ type, data: values.map(value => Number(value) || 0) }],
    },
    type,
  }
}

function runDrawChart(args) {
  const chart = normalizeChart(args)
  if (!chart) return failure('draw_chart 参数无效，请提供 type/title/labels/values 或合法的 option')
  if (JSON.stringify(chart.option).length > 30000) return failure('图表配置过大')
  return {
    ok: true,
    text: `图表已生成，将在最终回答中展示。请用文字说明图表表达的内容。`,
    record: `draw_chart：已生成 ${chart.type} 图表`,
    chartOption: chart.option,
  }
}

async function runGenerateImage(args, settings, signal) {
  const prompt = String(args.prompt || args.description || '').trim()
  if (!prompt) return failure('generate_image 缺少 prompt 参数')
  if (!settings.secondaryReady) return failure('未配置副模型 API，无法生成图片')

  const result = await generateImage(prompt, {
    apiBase: settings.secondaryApiBase,
    apiKey: settings.secondaryApiKey,
    model: settings.secondaryImageModel || 'glm-image',
    signal,
  })
  if (!result.ok) return failure(result.message || '图片生成失败')
  const src = result.dataUrl || result.url
  if (!src) return failure('生图接口没有返回图片')
  return {
    ok: true,
    text: '图片已生成，将随最终回答一起展示。',
    record: `generate_image："${truncate(prompt, 200)}" → 已生成`,
    images: [src],
  }
}

function runExport(args) {
  const raw = String(args.format || 'md').toLowerCase()
  const format = EXPORT_FORMATS[raw]
  if (!format) return failure(`不支持的导出格式：${raw}`)
  return {
    ok: true,
    text: `已准备导出为 ${format.toUpperCase()}，最终回答保存后会自动下载。`,
    record: `export_conversation：${format}`,
    exportFormat: format,
  }
}

/**
 * 执行单个工具调用。
 * 返回 { ok, text, record, chartOption?, images?, exportFormat? }
 */
export async function executeToolCall(call, { settings, signal, documentIds, onStatus } = {}) {
  if (!call || !call.tool) return failure('工具调用为空')
  if (call.tool === '__invalid__') {
    return failure(`${call.error || '工具调用无效'}：${truncate(call.raw, 300)}`)
  }
  // 技能开关是硬约束：模型即使输出了未开启的工具，也不执行
  if (call.tool === 'search_web' && (!settings.searchSkillEnabled || !String(settings.tavilyApiKey || '').trim())) {
    return failure('联网搜索未开启或未配置 Tavily API Key')
  }
  if (call.tool === 'read_document' && !settings.documentSkillEnabled) {
    return failure('文档解析技能未开启')
  }
  if (call.tool === 'calculate' && !settings.calcSandboxEnabled) {
    return failure('计算沙箱未开启')
  }
  if (call.tool === 'generate_image' && (!settings.imageGenSkillEnabled || !settings.secondaryReady)) {
    return failure('AI 生图未开启或未配置副模型 API')
  }
  try {
    switch (call.tool) {
      case 'search_web':
        return await runSearch(call.args, settings)
      case 'read_document':
        return await runReadDocument(call.args, documentIds)
      case 'calculate':
        return await runCalculate(call.args, { signal, onStatus })
      case 'draw_chart':
        return runDrawChart(call.args)
      case 'generate_image':
        return await runGenerateImage(call.args, settings, signal)
      case 'export_conversation':
        return runExport(call.args)
      default:
        return failure(`未知工具：${call.tool}`)
    }
  } catch (err) {
    return failure(err?.message || String(err))
  }
}
