// 本应用用量统计：按月累计主/副模型的 token 消耗，供设置页用量查询使用
import { getItem, setItem } from '../utils/kv'

const KEY = 'xiyue_usage_stats'
const KEEP_MONTHS = 13

function monthKey(date = new Date()) {
  const pad = n => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`
}

function emptyBucket() {
  return { prompt: 0, completion: 0, calls: 0, estimated: 0, models: {} }
}

export function loadUsageStats() {
  try {
    const raw = getItem(KEY)
    const data = raw ? JSON.parse(raw) : null
    if (data && data.months && typeof data.months === 'object') return data
  } catch { /* 数据损坏时重新开始 */ }
  return { version: 1, months: {} }
}

/** 记录一次模型调用；estimated 表示用量由字符估算而非服务商返回 */
export function recordUsage({ model, prompt = 0, completion = 0, estimated = false }) {
  const p = Math.max(0, Math.round(Number(prompt) || 0))
  const c = Math.max(0, Math.round(Number(completion) || 0))
  if (!p && !c) return null

  const stats = loadUsageStats()
  const key = monthKey()
  if (!stats.months[key]) stats.months[key] = emptyBucket()
  const bucket = stats.months[key]
  bucket.prompt += p
  bucket.completion += c
  bucket.calls += 1
  if (estimated) bucket.estimated += 1

  const name = String(model || '未知模型')
  if (!bucket.models[name]) bucket.models[name] = { prompt: 0, completion: 0, calls: 0 }
  const m = bucket.models[name]
  m.prompt += p
  m.completion += c
  m.calls += 1

  const keys = Object.keys(stats.months).sort()
  while (keys.length > KEEP_MONTHS) delete stats.months[keys.shift()]

  try { setItem(KEY, JSON.stringify(stats)) } catch { /* 存储超限时忽略 */ }
  return stats
}

export function getUsageSummary() {
  const stats = loadUsageStats()
  const keys = Object.keys(stats.months).sort()
  const total = emptyBucket()

  for (const key of keys) {
    const b = stats.months[key]
    total.prompt += b.prompt || 0
    total.completion += b.completion || 0
    total.calls += b.calls || 0
    total.estimated += b.estimated || 0
    for (const [name, mb] of Object.entries(b.models || {})) {
      if (!total.models[name]) total.models[name] = { prompt: 0, completion: 0, calls: 0 }
      total.models[name].prompt += mb.prompt || 0
      total.models[name].completion += mb.completion || 0
      total.models[name].calls += mb.calls || 0
    }
  }

  const currentKey = monthKey()
  return {
    currentKey,
    current: stats.months[currentKey] ? { ...stats.months[currentKey], models: { ...stats.months[currentKey].models } } : emptyBucket(),
    total,
    months: keys.slice().reverse().map(key => ({ key, ...stats.months[key] })),
  }
}

/** 费用估算：单价单位为 元 / 百万 token */
export function estimateUsageCost({ prompt = 0, completion = 0, inputPrice = 0, outputPrice = 0 }) {
  return (Number(prompt) / 1e6) * Number(inputPrice || 0) + (Number(completion) / 1e6) * Number(outputPrice || 0)
}

export function formatTokenCount(value) {
  const v = Number(value) || 0
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`
  if (v >= 1e4) return `${(v / 1e4).toFixed(2)} 万`
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}k`
  return String(Math.round(v))
}

export function formatCost(value) {
  const v = Number(value) || 0
  if (!v) return '0.00'
  if (v < 0.01) return v.toFixed(4)
  return v.toFixed(2)
}
