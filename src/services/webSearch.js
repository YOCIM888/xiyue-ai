/**
 * 联网搜索：Tavily Search API 直连
 * 只在明确搜索意图时调用，失败时返回可读错误，不抛出异常。
 */

const ENDPOINT = 'https://api.tavily.com/search'
const TIMEOUT_MS = 8000
const MAX_CHARS = 6000
const MAX_RESULT_LIMIT = 10
const MAX_ITEM_CHARS = 1200

// 明确搜索动作
const STRONG_SEARCH = /(搜一下|搜一搜|搜搜|搜索|帮我查|查一下|查查|查询|联网搜|上网搜|百度一下|google\s*一下)/i
// 强时效词：出现即视为明确搜索意图
const STRONG_FRESH = /(最新|实时|新闻|股价|汇率|天气|比分|赛况|发布会|上市|上线)/i
// 弱时效词：需要结合问句/请求才触发，避免闲聊误判
const FRESH_WORD = /(现在|目前|今天|今日|刚刚|最近|动态|进展|更新|价格|多少钱|哪一天|什么时候)/i
// 事实类主题：没有明确搜索词时，先问用户要不要搜
const FACTUAL_TOPIC = /(新闻|消息|动态|版本|价格|多少钱|政策|规定|发布|上市|赛事|比赛|天气|股价|汇率|教程|文档|官网|几点|时间|日期|几号|星期|礼拜|是谁|做什么|怎么回事|发生了什么|有什么|有没有)/i
const QUESTION = /[?？]|吗|呢|多少|什么|怎么|如何|哪|谁|几点|什么时候|是不是|有没有/i
const REQUEST = /(帮我|请|给我|想|要|能不能|可以|告诉)/i
const CHITCHAT = /^(你好|嗨|哈喽|早上好|晚上好|晚安|谢谢|再见|在吗|最近怎么样|最近好吗|你最近|今天心情|我好累|我难过|我爱你|想你)/i
const PERSONAL_STATE = /(我(很|好|有点|最近)?(难过|开心|累|烦|焦虑|孤独|无聊)|心情|情绪|喜欢|爱你|想你)/i

const AFFIRMATIVE = /^(搜|要|要搜|好|可以|嗯|对|查|搜索|搜一下|帮我搜|联网搜|麻烦搜|yes|ok)[吧啊呀。！!，,]*$/i
const NEGATIVE = /^(不|不用|不搜|别搜|算了|不需要|no)[吧啊呀。！!，,]*$/i

/** 判断搜索意图：search 直接搜，confirm 先问一句，none 不搜 */
export function detectSearchIntent(text) {
  const t = String(text ?? '').trim()
  if (!t || t.length > 500) return 'none'
  if (CHITCHAT.test(t)) return 'none'
  if (STRONG_SEARCH.test(t) || STRONG_FRESH.test(t)) return 'search'

  const fresh = FRESH_WORD.test(t)
  const question = QUESTION.test(t)
  if (fresh && (question || REQUEST.test(t)) && FACTUAL_TOPIC.test(t)) return 'search'

  if (question && FACTUAL_TOPIC.test(t) && !PERSONAL_STATE.test(t)) return 'confirm'
  return 'none'
}

/** 用户对上一条“要不要搜”的回复 */
export function detectSearchReply(text) {
  const t = String(text ?? '').trim()
  if (AFFIRMATIVE.test(t)) return 'yes'
  if (NEGATIVE.test(t)) return 'no'
  return 'other'
}

function clampResults(n) {
  const value = Number(n)
  if (!Number.isFinite(value)) return 5
  return Math.min(MAX_RESULT_LIMIT, Math.max(1, Math.round(value)))
}

function truncate(text, max) {
  const s = String(text ?? '')
  return s.length > max ? s.slice(0, max) + '…' : s
}

function fail(code, message) {
  return { ok: false, code, message, answer: '', results: [] }
}

/** 调用 Tavily，返回 {ok, answer, results} 或 {ok:false, message} */
export async function searchWeb(query, { apiKey, depth = 'basic', maxResults = 5, signal } = {}) {
  const key = String(apiKey ?? '').trim()
  if (!key) {
    return fail('no-key', '未配置 Tavily API Key，请在 设置 → 搜索服务 中填写')
  }
  const q = String(query ?? '').trim()
  if (!q) return fail('empty-query', '搜索内容为空')

  const count = clampResults(maxResults)
  const body = {
    query: q,
    search_depth: depth === 'advanced' ? 'advanced' : 'basic',
    max_results: count,
    include_answer: true,
    include_raw_content: false,
    chunks_per_source: 2,
  }

  let resp
  try {
    resp = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
      signal: signal || AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (err) {
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      return fail('timeout', `联网搜索超时（${TIMEOUT_MS / 1000} 秒），本次回答未使用搜索结果`)
    }
    return fail('network', '联网搜索失败：无法连接 Tavily（网络或跨域限制），本次回答未使用搜索结果')
  }

  if (!resp.ok) {
    if (resp.status === 401 || resp.status === 403) {
      return fail('auth', `Tavily API Key 无效或已失效（HTTP ${resp.status}），请检查设置`)
    }
    if (resp.status === 429) {
      return fail('rate-limit', 'Tavily 请求过于频繁或本月额度已用完（429），请稍后再试')
    }
    if (resp.status >= 500) {
      return fail('server', `Tavily 服务暂时不可用（HTTP ${resp.status}）`)
    }
    return fail('http', `联网搜索失败（HTTP ${resp.status}）`)
  }

  let data
  try {
    data = await resp.json()
  } catch {
    return fail('parse', '联网搜索返回内容无法解析')
  }

  const answer = typeof data?.answer === 'string' ? data.answer.trim() : ''
  const results = (Array.isArray(data?.results) ? data.results : [])
    .filter(r => r && (r.url || r.title))
    .slice(0, count)
    .map(r => ({
      title: String(r.title || '').trim(),
      url: String(r.url || '').trim(),
      content: truncate(String(r.content || '').replace(/\s+/g, ' ').trim(), MAX_ITEM_CHARS),
    }))

  if (!results.length && !answer) {
    return fail('no-results', '联网搜索没有返回结果，本次回答未使用搜索结果')
  }

  return { ok: true, answer, results, count: results.length }
}

/** 把搜索结果拼成注入块，并做总字数截断 */
export function buildSearchContext(query, data) {
  const lines = [`【联网搜索结果｜原问题：${String(query ?? '').trim()}】`]
  if (data.answer) lines.push(`摘要：${truncate(data.answer, 1500)}`)

  data.results.forEach((r, i) => {
    const title = r.title || '（无标题）'
    lines.push(`[${i + 1}] ${title}\n链接：${r.url || '（无链接）'}\n内容：${r.content || '（无正文摘要）'}`)
  })

  lines.push('以上为实时搜索结果。请优先结合这些信息回答，并用 [1]、[2] 标注来源；若结果不足或相互矛盾，请明确说明。')

  let text = lines.join('\n\n')
  const truncated = text.length > MAX_CHARS
  if (truncated) {
    const note = '\n\n…（搜索结果过长已截断）'
    text = text.slice(0, MAX_CHARS - note.length) + note
  }
  return { text, truncated, count: data.results.length }
}
