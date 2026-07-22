<template>
  <Teleport to="body">
    <div class="asset-overlay" :class="{ open: visible }" @click.self="close">
      <div class="asset-panel" :class="{ open: visible }">
        <div class="asset-header">
          <h2>📁 资产</h2>
          <button class="btn-close" @click="close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div class="asset-toolbar">
          <button class="btn-sm primary" @click="createNew">+ 新建</button>
        </div>

        <div class="asset-list">
          <div v-if="store.sorted.length === 0" class="empty">暂无资产</div>
          <div v-for="a in store.sorted" :key="a.id" class="asset-item" :class="{ active: editing?.id === a.id }" @click="openAsset(a)">
            <span class="asset-item-title">{{ a.title }}</span>
            <span class="asset-item-time">{{ fmtTime(a.updatedAt) }}</span>
            <button class="btn-sm-del" @click.stop="delAsset(a.id)">🗑</button>
          </div>
        </div>

        <!-- 编辑器 -->
        <div v-if="editing" class="asset-editor">
          <input v-model="editing.title" class="ae-title" placeholder="标题" />
          <textarea v-model="editing.content" class="ae-content" placeholder="内容…"></textarea>
          <div class="ae-actions">
            <button class="btn-sm primary" @click="saveAsset">保存</button>
            <button class="btn-sm" @click="editing = null">取消</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useAssetsStore } from '../../stores/assets'

const store = useAssetsStore()
const visible = ref(false)
const editing = ref(null)

function open() { visible.value = true }
function close() { visible.value = false; editing.value = null }
defineExpose({ open, close })

function fmtTime(ts) {
  const d = new Date(ts)
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function createNew() {
  const a = store.create()
  editing.value = { ...a }
}

function openAsset(a) {
  editing.value = { ...a }
}

function saveAsset() {
  if (!editing.value) return
  store.update(editing.value.id, { title: editing.value.title, content: editing.value.content })
  editing.value = null
}

async function delAsset(id) {
  const ok = await window.__ui?.showConfirm('确定删除？')
  if (ok) store.remove(id)
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

.asset-header { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px; border-bottom: 1px solid var(--border-color); flex-shrink: 0; }
.asset-header h2 { font-size: 18px; margin: 0; }
.btn-close { width: 34px; height: 34px; border: none; border-radius: 8px; background: transparent; color: var(--text-secondary); cursor: pointer; display: flex; align-items: center; justify-content: center; }
.btn-close:hover { background: var(--bg-hover); }

.asset-toolbar { padding: 12px 24px; border-bottom: 1px solid var(--border-color); flex-shrink: 0; }

.asset-list { flex: 1; overflow-y: auto; padding: 12px 24px; }
.empty { text-align: center; padding: 32px; color: var(--text-muted); font-size: 13px; }

.asset-item { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-radius: 8px; cursor: pointer; margin-bottom: 2px; }
.asset-item:hover { background: var(--bg-hover); }
.asset-item.active { background: var(--bg-active); }
.asset-item-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
.asset-item-time { font-size: 11px; color: var(--text-muted); flex-shrink: 0; }
.btn-sm-del { width: 26px; height: 26px; border: none; border-radius: 4px; background: transparent; cursor: pointer; font-size: 12px; display: flex; align-items: center; justify-content: center; }
.btn-sm-del:hover { background: var(--danger-bg); }

.asset-editor { border-top: 1px solid var(--border-color); padding: 16px 24px; flex-shrink: 0; }
.ae-title { width: 100%; padding: 8px 12px; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-input); color: var(--text-primary); font-size: 14px; outline: none; margin-bottom: 8px; box-sizing: border-box; font-family: inherit; }
.ae-title:focus { border-color: var(--accent); }
.ae-content { width: 100%; height: 180px; padding: 10px 12px; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-input); color: var(--text-primary); font-size: 13px; outline: none; resize: vertical; font-family: 'SF Mono', 'Fira Code', monospace; line-height: 1.6; box-sizing: border-box; }
.ae-content:focus { border-color: var(--accent); }
.ae-actions { display: flex; gap: 8px; margin-top: 8px; }

.btn-sm { padding: 6px 14px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-card); color: var(--text-primary); font-size: 12px; cursor: pointer; font-family: inherit; }
.btn-sm:hover { background: var(--bg-hover); }
.btn-sm.primary { background: var(--accent); color: #fff; border-color: var(--accent); }
.btn-sm.primary:hover { background: var(--accent-hover); }
</style>
