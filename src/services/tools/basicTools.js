/**
 * 基础工具执行器：搜索、文档、计算、图表、生图、导出。
 */
import { searchWeb, buildSearchContext } from '../webSearch'
import { useAssetsStore } from '../../stores/assets'
import { runJavaScript, runPython } from '../sandbox'
import { generateImage } from '../imageGen'
import { failure, success, truncate } from './protocol'
import {
  ESM_SYNTAX,
  prepareModuleGraph,
  describeLoaded,
  describeNotes,
  describeSandboxError,
  withModuleHint,
} from './sandboxModules'

const MAX_DOC_CHARS = 6000
const MAX_DOC_CHUNKS = 6
const MAX_DOC_SCAN = 60000

const EXPORT_FORMATS = {
  md: 'md', markdown: 'md',
  html: 'html', htm: 'html', 网页: 'html',
  pdf: 'pdf', 打印: 'pdf',
  doc: 'doc', word: 'doc', docx: 'doc',
}

export async function runSearch(args, settings) {
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

export async function runReadDocument(args, documentIds) {
  const { splitIntoChunks, scoreChunks } = await import('../docRetrieval')
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

export async function runCalculate(args, { signal, onStatus } = {}) {
  const lang = String(args.lang || args.language || 'js').toLowerCase() === 'python' ? 'python' : 'js'
  const code = String(args.code || args.script || '').trim()
  if (!code) return failure('calculate 缺少 code 参数')
  const deps = (Array.isArray(args.files) ? args.files : (args.files ? [args.files] : []))
    .map(item => String(item || '').trim())
    .filter(Boolean)

  let result
  let maps = null
  let note = ''
  if (lang === 'python') {
    if (deps.length) return failure('Python 沙箱暂不加载工作区模块，请只传 code')
    window.__ui?.showToast('首次运行 Python 需要加载运行时，请稍候…', 'info', 5000)
    result = await runPython(code, { signal, onStatus })
  } else if (deps.length || ESM_SYNTAX.test(code)) {
    const { collected, problems } = await prepareModuleGraph({ code, deps }, { onStatus })
    if (problems.length) {
      return failure(
        `${problems.join('\n\n')}\n\n未执行任何代码。请补齐缺失文件或把依赖改成单向后再运行。`,
        `calculate：依赖未就绪（${collected.missing.length} 项）`
      )
    }
    maps = collected.maps || null
    const loaded = describeLoaded(collected).filter(name => name !== '内联代码')
    note = loaded.length ? `已加载工作区模块：${loaded.join('、')}\n` : '（按 ES 模块语义运行，结果请用 console.log 或 export default 输出）\n'
    const notes = describeNotes(collected.notes)
    if (notes) note += `${notes}\n`
    result = await runJavaScript(code, {
      modules: collected.modules,
      order: collected.order,
      entry: collected.entry,
      signal,
    })
  } else {
    result = await runJavaScript(code, { signal })
  }

  const inline = { inlineEntry: lang === 'js' }
  const errorText = result.ok
    ? ''
    : (maps ? describeSandboxError(result.error, maps, inline) : `${result.error}${withModuleHint(result.error, inline)}`)
  const output = result.ok ? (result.output || '（无输出）') : `执行失败：${errorText}`
  const recordCode = code.length > 1500 ? `${code.slice(0, 1500)}…` : code
  return {
    ok: result.ok,
    text: result.ok
      ? `本地 ${lang === 'python' ? 'Python' : 'JavaScript'} 执行结果：\n${note}${output}`
      : `本地执行失败：${errorText}${note ? `\n${note}` : ''}`,
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

export function runDrawChart(args) {
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

export async function runGenerateImage(args, settings, signal) {
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

export function runExport(args) {
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
