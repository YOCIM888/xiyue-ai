<template>
  <Teleport to="body">
    <div class="asset-overlay" :class="{ open: visible }" @click.self="close">
      <div class="asset-panel" :class="{ open: visible }">
        <div class="asset-header">
          <h2>
            {{ editing ? '编辑文档' : '我的文档' }}
            <span v-if="!editing && store.sorted.length" class="count">{{ store.sorted.length }}</span>
          </h2>
          <div class="header-actions">
            <template v-if="!editing">
              <button class="icon-btn" :class="{ active: importing }" :disabled="importing" title="导入文件（PDF / DOCX / TXT / Markdown）" @click="triggerImport">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              </button>
              <button class="icon-btn" title="新建文档" @click="createNew">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              </button>
              <button v-if="selectMode" class="icon-btn danger" :disabled="selected.length === 0" :title="`删除选中的 ${selected.length} 个文档`" @click="deleteSelected">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                <span v-if="selected.length" class="badge">{{ selected.length }}</span>
              </button>
              <button class="icon-btn" :class="{ active: selectMode }" :title="selectMode ? '退出多选' : '多选'" @click="toggleSelectMode">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
              </button>
            </template>
            <button class="icon-btn" title="关闭" @click="close">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <input ref="importInput" type="file" accept=".pdf,.docx,.txt,.md,.markdown,.doc" style="display:none" @change="handleImportFile" />
        </div>

        <div v-if="editing" class="asset-editor">
          <input v-model="editing.title" class="ae-title" placeholder="标题" />
          <textarea v-model="editing.content" class="ae-content" placeholder="内容…"></textarea>
          <div class="ae-actions">
            <button class="btn-sm primary" @click="saveAsset">保存</button>
            <button class="btn-sm" @click="cancelEdit">取消</button>
          </div>
        </div>

        <div v-else class="asset-list">
          <div v-if="selectMode" class="select-bar">
            <span>已选 {{ selected.length }} 项</span>
            <button class="link-btn" @click="toggleSelectAll">{{ allSelected ? '取消全选' : '全选' }}</button>
          </div>

          <div v-if="store.sorted.length === 0" class="empty">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            <p>暂无文档</p>
            <span>点击右上角 + 新建文档</span>
          </div>

          <div
            v-for="a in store.sorted"
            :key="a.id"
            class="asset-item"
            :class="{ selected: isSelected(a.id) }"
            @click="onItemClick(a)"
          >
            <span v-if="selectMode" class="item-check" :class="{ checked: isSelected(a.id) }">
              <svg v-if="isSelected(a.id)" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
            </span>
            <svg v-else class="item-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            <span class="asset-item-title">{{ a.title }}</span>
            <span v-if="a.truncated" class="trunc-tag">已截断</span>
            <span class="asset-item-time">{{ fmtTime(a.updatedAt) }}</span>
            <button v-if="!selectMode" class="item-del" title="删除" @click.stop="delAsset(a.id)">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useAssetsStore } from '../../stores/assets'

const store = useAssetsStore()
const visible = ref(false)
const editing = ref(null)
const selectMode = ref(false)
const selected = ref([])
const importInput = ref(null)
const importing = ref(false)

const allSelected = computed(() => store.sorted.length > 0 && selected.value.length === store.sorted.length)

function open() { visible.value = true }
function close() {
  visible.value = false
  editing.value = null
  selectMode.value = false
  selected.value = []
}
defineExpose({ open, close })

function fmtTime(ts) {
  const d = new Date(ts)
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function createNew() {
  selectMode.value = false
  selected.value = []
  editing.value = { id: null, title: '', content: '' }
}

function triggerImport() {
  if (!importing.value) importInput.value?.click()
}

async function handleImportFile(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return

  importing.value = true
  window.__ui?.showToast(`正在解析「${file.name}」…`, 'info', 2000)
  try {
    const { parseDocumentFile } = await import('../../services/documentParser')
    const result = await parseDocumentFile(file)
    const title = result.fileName.replace(/\.[^.]+$/, '') || result.fileName
    store.create(title, result.text, {
      fileName: result.fileName,
      fileType: result.fileType,
      fileSize: result.fileSize,
      truncated: result.truncated,
      originalLength: result.originalLength,
    })
    if (result.truncated) {
      window.__ui?.showToast(`已导入「${title}」：正文共 ${result.originalLength} 字，已截断保留前 ${result.text.length} 字`, 'info', 4500)
    } else {
      window.__ui?.showToast(`已导入「${title}」`, 'success')
    }
  } catch (err) {
    window.__ui?.showToast(err?.message || '文档解析失败', 'error', 4500)
  } finally {
    importing.value = false
  }
}

function openAsset(a) {
  editing.value = { ...a }
}

function saveAsset() {
  if (!editing.value) return
  const title = editing.value.title.trim() || '新文档'
  if (editing.value.id) {
    store.update(editing.value.id, { title, content: editing.value.content })
  } else {
    store.create(title, editing.value.content)
  }
  editing.value = null
}

function cancelEdit() {
  editing.value = null
}

function isSelected(id) {
  return selected.value.includes(id)
}

function onItemClick(a) {
  if (!selectMode.value) {
    openAsset(a)
    return
  }
  selected.value = isSelected(a.id)
    ? selected.value.filter(id => id !== a.id)
    : [...selected.value, a.id]
}

function toggleSelectMode() {
  selectMode.value = !selectMode.value
  selected.value = []
}

function toggleSelectAll() {
  selected.value = allSelected.value ? [] : store.sorted.map(a => a.id)
}

async function delAsset(id) {
  const ok = await window.__ui?.showConfirm('确定删除？')
  if (ok) store.remove(id)
  selected.value = selected.value.filter(x => x !== id)
}

async function deleteSelected() {
  if (!selected.value.length) return
  const ok = await window.__ui?.showConfirm(`确定删除选中的 ${selected.value.length} 个文档？`)
  if (!ok) return
  selected.value.forEach(id => store.remove(id))
  selected.value = []
}
</script>

<style scoped>
.asset-overlay { position: fixed; inset: 0; z-index: 1000; background: rgba(0,0,0,0.5); opacity: 0; pointer-events: none; transition: opacity 0.3s; }
.asset-overlay.open { opacity: 1; pointer-events: auto; }

.asset-panel {
  position: fixed; top: 0; right: 0; width: 420px; max-width: 100vw; height: 100vh; height: 100dvh;
  background: var(--bg-primary); display: flex; flex-direction: column;
  transform: translateX(100%); transition: transform 0.3s ease; z-index: 1001;
}
.asset-panel.open { transform: translateX(0); }

.asset-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 18px 20px 18px 24px; border-bottom: 1px solid var(--border-color); flex-shrink: 0; }
.asset-header h2 { display: flex; align-items: center; gap: 8px; margin: 0; font-size: 18px; }
.count { padding: 1px 7px; border-radius: 10px; background: var(--bg-hover); color: var(--text-muted); font-size: 11px; font-weight: 500; }
.header-actions { display: flex; align-items: center; gap: 4px; }

.icon-btn { position: relative; width: 34px; height: 34px; flex-shrink: 0; border: none; border-radius: 8px; background: transparent; color: var(--text-secondary); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background 0.15s, color 0.15s; }
.icon-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
.icon-btn.active { background: var(--accent-light); color: var(--accent); }
.icon-btn.danger:hover { background: var(--danger-bg); color: var(--danger); }
.icon-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.icon-btn:disabled:hover { background: transparent; color: var(--text-secondary); }
.badge { position: absolute; top: 1px; right: 1px; min-width: 15px; height: 15px; padding: 0 3px; border-radius: 8px; background: var(--danger); color: #fff; font-size: 10px; line-height: 15px; text-align: center; box-sizing: border-box; }

.asset-list { flex: 1; overflow-y: auto; padding: 10px 16px 16px; }
.select-bar { display: flex; align-items: center; justify-content: space-between; padding: 4px 8px 10px; font-size: 12px; color: var(--text-muted); }
.link-btn { border: none; background: transparent; color: var(--accent); font-size: 12px; font-family: inherit; cursor: pointer; padding: 2px 4px; }
.link-btn:hover { color: var(--accent-hover); }

.empty { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 48px 0; color: var(--text-muted); }
.empty p { margin: 4px 0 0; font-size: 13px; }
.empty span { font-size: 12px; }

.asset-item { display: flex; align-items: center; gap: 10px; padding: 10px 10px; border-radius: 8px; cursor: pointer; margin-bottom: 2px; transition: background 0.15s; }
.asset-item:hover { background: var(--bg-hover); }
.asset-item.selected { background: var(--accent-light); }
.item-icon { flex-shrink: 0; color: var(--text-muted); }
.asset-item-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; color: var(--text-primary); }
.trunc-tag { flex-shrink: 0; padding: 1px 5px; border-radius: 4px; background: var(--bg-hover); color: var(--text-muted); font-size: 10px; }
.asset-item-time { font-size: 11px; color: var(--text-muted); flex-shrink: 0; }

.item-check { width: 18px; height: 18px; flex-shrink: 0; border: 1.5px solid var(--border-color); border-radius: 5px; display: flex; align-items: center; justify-content: center; color: #fff; box-sizing: border-box; transition: all 0.15s; }
.item-check.checked { background: var(--accent); border-color: var(--accent); }

.item-del { width: 26px; height: 26px; flex-shrink: 0; border: none; border-radius: 6px; background: transparent; color: var(--text-muted); cursor: pointer; display: flex; align-items: center; justify-content: center; opacity: 0; transition: background 0.15s, color 0.15s, opacity 0.15s; }
.asset-item:hover .item-del { opacity: 1; }
.item-del:hover { background: var(--danger-bg); color: var(--danger); }

.asset-editor { flex: 1; min-height: 0; display: flex; flex-direction: column; padding: 16px 24px 20px; }
.ae-title { width: 100%; padding: 9px 12px; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-input); color: var(--text-primary); font-size: 15px; font-weight: 500; outline: none; margin-bottom: 10px; box-sizing: border-box; font-family: inherit; }
.ae-title:focus { border-color: var(--accent); }
.ae-content { width: 100%; flex: 1; min-height: 120px; padding: 12px; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-input); color: var(--text-primary); font-size: 13px; outline: none; resize: none; font-family: 'SF Mono', 'Fira Code', monospace; line-height: 1.7; box-sizing: border-box; }
.ae-content:focus { border-color: var(--accent); }
.ae-actions { display: flex; gap: 8px; margin-top: 12px; }

.btn-sm { padding: 7px 16px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-card); color: var(--text-primary); font-size: 12px; cursor: pointer; font-family: inherit; }
.btn-sm:hover { background: var(--bg-hover); }
.btn-sm.primary { background: var(--accent); color: #fff; border-color: var(--accent); }
.btn-sm.primary:hover { background: var(--accent-hover); }
</style>
