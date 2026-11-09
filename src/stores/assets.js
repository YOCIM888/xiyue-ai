import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getItem, setItem } from '../utils/kv'

const KEY = 'xiyue_assets'
let idSeq = 0

function makeId() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  } catch { /* 回退到时间戳 + 序号 */ }
  idSeq += 1
  return `a-${Date.now().toString(36)}-${idSeq.toString(36)}`
}

function deriveContentType(input) {
  if (input.contentType === 'markdown' || input.contentType === 'text') return input.contentType
  const fileType = String(input.fileType || '').toLowerCase()
  if (!fileType || fileType === 'md' || fileType === 'markdown') return 'markdown'
  return 'text'
}

/** 兼容旧数据：补齐 id、类型、来源等字段，避免脏数据让列表或预览报错 */
function normalizeAsset(input) {
  if (!input || typeof input !== 'object') return null
  const fileType = typeof input.fileType === 'string' ? input.fileType.toLowerCase() : ''
  const createdAt = Number(input.createdAt) || Date.now()
  return {
    ...input,
    id: input.id ?? makeId(),
    title: typeof input.title === 'string' && input.title.trim() ? input.title.trim() : '未命名文档',
    content: typeof input.content === 'string' ? input.content : String(input.content ?? ''),
    contentType: deriveContentType({ ...input, fileType }),
    source: input.source === 'manual' || input.source === 'import'
      ? input.source
      : (fileType ? 'import' : 'manual'),
    fileType,
    createdAt,
    updatedAt: Number(input.updatedAt) || createdAt,
  }
}

export const useAssetsStore = defineStore('assets', () => {
  const assets = ref(load())

  function load() {
    try {
      const data = JSON.parse(getItem(KEY))
      if (!Array.isArray(data)) return []
      const seen = new Set()
      return data.map(normalizeAsset).filter(Boolean).map(a => {
        if (seen.has(a.id)) a.id = makeId()
        seen.add(a.id)
        return a
      })
    } catch { return [] }
  }
  function save() { setItem(KEY, JSON.stringify(assets.value)) }

  const sorted = computed(() =>
    [...assets.value].sort((a, b) => b.updatedAt - a.updatedAt)
  )

  function create(title = '新文档', content = '', meta = {}) {
    const now = Date.now()
    const a = normalizeAsset({
      id: makeId(),
      title,
      content,
      createdAt: now,
      updatedAt: now,
      ...meta,
    })
    assets.value.push(a)
    save()
    return a
  }

  function update(id, { title, content }) {
    const a = assets.value.find(x => x.id === id)
    if (!a) return
    if (title !== undefined) a.title = title
    if (content !== undefined) a.content = content
    a.updatedAt = Date.now()
    save()
  }

  function remove(id) {
    assets.value = assets.value.filter(x => x.id !== id)
    save()
  }

  // 从 AI 回复保存为资产
  function saveFromMessage(content, defaultTitle) {
    const title = defaultTitle || ('AI 回复 ' + new Date().toLocaleString())
    return create(title, content)
  }

  // 导出为 JSON
  function exportData() {
    return JSON.stringify(assets.value, null, 2)
  }

  // 导入 JSON
  function importData(json) {
    const data = JSON.parse(json)
    if (!Array.isArray(data)) throw new Error('格式错误')
    const existingIds = new Set(assets.value.map(a => a.id))
    let added = 0
    for (const item of data) {
      const asset = normalizeAsset(item)
      if (!asset) continue
      if (existingIds.has(asset.id)) asset.id = makeId()
      existingIds.add(asset.id)
      assets.value.push(asset)
      added += 1
    }
    save()
    return added
  }

  // 清空
  function clearAll() {
    assets.value = []
    save()
  }

  return { assets, sorted, create, update, remove, saveFromMessage, exportData, importData, clearAll }
})
