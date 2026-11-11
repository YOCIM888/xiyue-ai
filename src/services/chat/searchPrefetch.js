import { useSettingsStore } from '../../stores/settings'
import { searchWeb, buildSearchContext, buildSearchFallbackText } from '../webSearch'
import { buildSearchQuery, detectTimeRange } from '../searchQuery'

/**
 * 联网搜索预取：返回注入模型的结果块与展示给用户的提示，任何失败都不抛异常。
 * searching 是主聊天 store 的 ref，用于在搜索期间显示进度。
 */
export async function runSearchPrefetch(rawQuery, searching) {
  const settings = useSettingsStore()
  // 去掉口语前缀与时间短语，保留 site: / filetype: 等操作符
  const query = buildSearchQuery(rawQuery) || rawQuery
  const timeRange = detectTimeRange(rawQuery)
  const fallbackText = buildSearchFallbackText(rawQuery)
  const apiKey = String(settings.tavilyApiKey || '').trim()

  if (!apiKey) {
    const msg = '未配置 Tavily API Key，已跳过联网搜索。请在 设置 → 搜索服务 中填写。'
    window.__ui?.showToast(msg, 'error', 4500)
    return { notice: fallbackText ? `${msg}\n${fallbackText}` : msg, block: '' }
  }

  // 搜索期间用 AI 气泡提示，搜索完成后直接进入生成
  searching.value = true
  let result
  try {
    result = await searchWeb(query, {
      apiKey,
      depth: settings.searchDepth,
      maxResults: settings.searchMaxResults,
      timeRange,
    })
  } finally {
    searching.value = false
  }

  if (!result.ok) {
    window.__ui?.showToast(result.message, 'error', 4500)
    return { notice: fallbackText ? `${result.message}\n${fallbackText}` : result.message, block: '' }
  }

  const built = buildSearchContext(query, result, {
    maxChars: settings.searchMaxChars,
    itemMaxChars: settings.searchItemMaxChars,
  })
  if (built.truncated) {
    window.__ui?.showToast(`搜索结果较长，已截断至 ${built.maxChars} 字后注入`, 'info', 3200)
  }
  return { notice: '', block: built.text }
}
