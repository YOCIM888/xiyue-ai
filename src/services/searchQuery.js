/**
 * 把用户口语整理成适合搜索引擎的查询，并识别时效范围。
 * 查询中保留 site: / filetype: / 引号 / 排除词等操作符，只清理口语前缀与时间短语。
 */

// 口语化搜索前缀：帮我搜一下 / 请查一下 / 百度一下 …
const PREFIX_RE = /^(帮我|请|麻烦|给我|能不能|可以|帮忙)?\s*(联网)?\s*(搜索一下|搜一下|搜一搜|搜搜|搜索|查一下|查查|查询|百度一下|google\s*一下|上网搜|联网搜)\s*(一下|下)?\s*[:：,，]?\s*/i

// 时间短语：识别到后交给搜索接口做时间过滤，并从查询词中移除
const RANGE_PHRASE_RE = /((最近|过去|近)\s*(一周|7\s*天|一个月|30\s*天|一年)|这周|本周|这个月|本月|今年|今年以来)\s*(的)?\s*/g

const TRAILING_PUNCT_RE = /[，。！!？?~～\s]+$/
const MAX_QUERY_LENGTH = 400

/** 识别时间范围，返回 Tavily 支持的 day / week / month / year */
export function detectTimeRange(text) {
  const t = String(text ?? '')
  if (/(今天|今日|刚刚|刚才|此刻)/.test(t)) return 'day'
  if (/(最近|过去|近)\s*(一周|7\s*天)|这周|本周|一周内/.test(t)) return 'week'
  if (/(最近|过去|近)\s*(一个月|30\s*天)|这个月|本月/.test(t)) return 'month'
  if (/(今年|今年以来|(最近|过去|近)\s*一年)/.test(t)) return 'year'
  return ''
}

export function buildSearchQuery(text) {
  let q = String(text ?? '').trim()
  if (!q) return ''
  q = q.replace(PREFIX_RE, '').trim()
  if (detectTimeRange(q)) q = q.replace(RANGE_PHRASE_RE, ' ').trim()
  // 保留用户输入的引号与操作符，只收敛空白和结尾标点
  q = q.replace(/\s+/g, ' ').replace(TRAILING_PUNCT_RE, '').trim()
  return q.slice(0, MAX_QUERY_LENGTH)
}
