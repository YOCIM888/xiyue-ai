import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const KEY = 'xiyue_assets'
let nextId = Date.now()

export const useAssetsStore = defineStore('assets', () => {
  const assets = ref(load())

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || [] } catch { return [] }
  }
  function save() { localStorage.setItem(KEY, JSON.stringify(assets.value)) }

  const sorted = computed(() =>
    [...assets.value].sort((a, b) => b.updatedAt - a.updatedAt)
  )

  function create(title = '新文档', content = '') {
    const a = { id: nextId++, title, content, createdAt: Date.now(), updatedAt: Date.now() }
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
    // 合并而非覆盖
    const existingIds = new Set(assets.value.map(a => a.id))
    for (const item of data) {
      if (existingIds.has(item.id)) continue
      assets.value.push(item)
    }
    save()
  }

  // 清空
  function clearAll() {
    assets.value = []
    save()
  }

  return { assets, sorted, create, update, remove, saveFromMessage, exportData, importData, clearAll }
})
