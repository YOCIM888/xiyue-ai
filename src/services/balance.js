/**
 * 服务商余额查询。
 * 目前仅 DeepSeek 提供公开余额 API（GET /user/balance），且已实测允许浏览器跨域；
 * 智谱等未开放余额接口，返回 supported: false，由设置页展示说明。
 */
const TIMEOUT_MS = 12000

export function getBalanceSupport(apiBase) {
  const base = String(apiBase || '')
  if (/api\.deepseek\.com/i.test(base)) {
    return { provider: 'deepseek', supported: true, label: 'DeepSeek' }
  }
  return { provider: '', supported: false, label: '' }
}

export async function fetchBalance({ apiBase, apiKey, signal } = {}) {
  const support = getBalanceSupport(apiBase)
  if (!support.supported) {
    return { ok: false, supported: false, message: '该服务商暂未开放余额查询接口' }
  }
  const key = String(apiKey || '').trim()
  if (!key) {
    return { ok: false, supported: true, message: '未填写主模型 API Key' }
  }

  let resp
  try {
    resp = await fetch('https://api.deepseek.com/user/balance', {
      method: 'GET',
      headers: { Accept: 'application/json', Authorization: `Bearer ${key}` },
      signal: signal || AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (err) {
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      return { ok: false, supported: true, message: '查询超时，请检查网络后重试' }
    }
    return { ok: false, supported: true, message: '查询失败：无法连接服务商（网络或跨域限制）' }
  }

  if (!resp.ok) {
    if (resp.status === 401 || resp.status === 403) {
      return { ok: false, supported: true, message: 'API Key 无效或没有余额查询权限' }
    }
    if (resp.status === 429) {
      return { ok: false, supported: true, message: '查询过于频繁，请稍后再试' }
    }
    return { ok: false, supported: true, message: `查询失败（HTTP ${resp.status}）` }
  }

  let data
  try {
    data = await resp.json()
  } catch {
    return { ok: false, supported: true, message: '余额接口返回内容无法解析' }
  }

  const infos = Array.isArray(data?.balance_infos) ? data.balance_infos : []
  const info = infos.find(item => item?.currency === 'CNY') || infos[0]
  if (!info) {
    return { ok: false, supported: true, message: '余额接口未返回有效数据' }
  }

  return {
    ok: true,
    supported: true,
    provider: 'deepseek',
    currency: info.currency || 'CNY',
    total: Number(info.total_balance) || 0,
    granted: Number(info.granted_balance) || 0,
    toppedUp: Number(info.topped_up_balance) || 0,
    isAvailable: data?.is_available !== false,
    fetchedAt: Date.now(),
  }
}
