/**
 * 工具调用协议与执行器（对外入口）。
 * 模型通过 ```tool JSON 代码块显式选择工具，前端执行后把真实结果回传。
 * 具体实现按领域拆在 ./tools/ 下，这里只保留公共导出与分发。
 */
import { failure, refused, truncate } from './tools/protocol'
import {
  toolUsageHint,
  shouldShowUsageHint,
  callSignature,
  describeCall,
  callDisplay,
  buildToolPrompt,
  extractToolCalls,
  stripToolBlocks,
  stripStreamingToolBlocks,
  createWriteBudget,
  isParallelSafe,
  planCallBatches,
  toolResultBrief,
  archiveToolResults,
} from './tools/protocol'
import {
  runSearch,
  runReadDocument,
  runCalculate,
  runDrawChart,
  runGenerateImage,
  runExport,
} from './tools/basicTools'
import { runBrowser } from './tools/browserTool'
import { runPreview } from './tools/previewTool'
import { runFiles } from './tools/filesTool'

export {
  toolUsageHint,
  shouldShowUsageHint,
  callSignature,
  describeCall,
  callDisplay,
  buildToolPrompt,
  extractToolCalls,
  stripToolBlocks,
  stripStreamingToolBlocks,
  createWriteBudget,
  isParallelSafe,
  planCallBatches,
  toolResultBrief,
  archiveToolResults,
}

/**
 * 执行单个工具调用。
 * 返回 { ok, text, record, chartOption?, images?, exportFormat? }
 */
export async function executeToolCall(call, { settings, signal, documentIds, onStatus, budget } = {}) {
  if (!call || !call.tool) return failure('工具调用为空')
  if (call.tool === '__invalid__') {
    return failure(`${call.error || '工具调用无效'}：${truncate(call.raw, 300)}`)
  }
  // 技能开关是硬约束：模型即使输出了未开启的工具，也不执行
  if (call.tool === 'search_web' && (!settings.searchSkillEnabled || !String(settings.tavilyApiKey || '').trim())) {
    return refused('联网搜索未开启或未配置 Tavily API Key')
  }
  if (call.tool === 'read_document' && !settings.documentSkillEnabled) {
    return refused('文档解析技能未开启')
  }
  if (call.tool === 'calculate' && !settings.calcSandboxEnabled) {
    return refused('计算沙箱未开启')
  }
  if (call.tool === 'generate_image' && (!settings.imageGenSkillEnabled || !settings.secondaryReady)) {
    return refused('AI 生图未开启或未配置副模型 API')
  }
  if (call.tool === 'browser' && !settings.browserSkillEnabled) {
    return refused('浏览器控制技能未开启')
  }
  if (call.tool === 'files' && !settings.workModeEnabled) {
    return refused('工作模式未开启')
  }
  if (call.tool === 'preview' && !settings.workModeEnabled) {
    return refused('工作模式未开启')
  }
  try {
    switch (call.tool) {
      case 'search_web':
        return await runSearch(call.args, settings)
      case 'read_document':
        return await runReadDocument(call.args, documentIds)
      case 'calculate':
        return await runCalculate(call.args, { signal, onStatus })
      case 'browser':
        return await runBrowser(call.args, settings, { signal, onStatus })
      case 'files':
        return await runFiles(call.args, { settings, signal, onStatus, budget })
      case 'preview':
        return await runPreview(call.args, { signal, onStatus })
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
