/** 表格统计 Worker：只运行应用自有解析代码，不执行任何模型代码 */
import { analyzeTableText } from './tableStats.js'

self.onmessage = (event) => {
  const { id, payload } = event.data || {}
  if (!id) return
  try {
    const summary = analyzeTableText(payload?.text || '')
    if (!summary) throw new Error('没有可统计的表格数据')
    self.postMessage({ id, ok: true, summary })
  } catch (err) {
    self.postMessage({ id, ok: false, error: err?.message || String(err) })
  }
}