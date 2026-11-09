<template>
  <Teleport to="body">
    <div class="memory-overlay" :class="{ open: visible }" @click.self="close">
      <div class="memory-panel" :class="{ open: visible }">
        <div class="memory-header">
          <h2>
            {{ editing ? '编辑记忆' : '记忆管理' }}
            <span v-if="!editing && store.sorted.length" class="count">{{ store.sorted.length }}</span>
          </h2>
          <div class="header-actions">
            <template v-if="!editing">
              <button class="icon-btn" title="新建记忆" @click="createNew">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              </button>
              <button v-if="selectMode" class="icon-btn danger" :disabled="selected.length === 0" :title="`删除选中的 ${selected.length} 条记忆`" @click="deleteSelected">
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
        </div>

        <div v-if="editing" class="memory-editor">
          <input v-model="editing.title" class="me-title" placeholder="记忆标题" />
          <textarea v-model="editing.content" class="me-content" placeholder="记忆内容…"></textarea>
          <div class="me-actions">
            <button class="btn-sm primary" @click="saveMemory">保存</button>
            <button class="btn-sm" @click="cancelEdit">取消</button>
          </div>
        </div>

        <div v-else class="memory-body">
          <div class="memory-access-card">
            <div class="mac-head">记忆沉淀</div>

            <div class="access-row">
              <div class="msc-info">
                <div class="msc-title">自动沉淀</div>
                <div class="msc-desc">每隔若干轮对话自动提炼长期记忆；关闭后只保留手动「记住…」</div>
              </div>
              <label class="switch" :title="store.autoEnabled ? '关闭自动沉淀' : '开启自动沉淀'">
                <input v-model="store.autoEnabled" type="checkbox" />
                <span class="switch-track"><span class="switch-thumb"></span></span>
              </label>
            </div>

            <div class="access-row" :class="{ disabled: !store.autoEnabled }">
              <div class="msc-info">
                <div class="msc-title">触发轮数</div>
                <div class="msc-desc">每 {{ store.autoTurns }} 轮用户消息后自动沉淀一次</div>
              </div>
              <div class="turns-control">
                <input
                  v-model.number="store.autoTurns"
                  type="number"
                  min="2"
                  max="50"
                  step="1"
                  :disabled="!store.autoEnabled"
                  @change="normalizeAutoTurns"
                />
                <span>轮</span>
              </div>
            </div>
          </div>

          <div class="memory-access-card">
            <div class="mac-head">记忆读取权限</div>

            <div class="access-row">
              <div class="msc-info">
                <div class="msc-title">主记忆</div>
                <div class="msc-desc">总开关，关闭后任何模块都不会读取长期记忆</div>
              </div>
              <label class="switch" :title="store.enabled ? '关闭主记忆' : '开启主记忆'">
                <input v-model="store.enabled" type="checkbox" />
                <span class="switch-track"><span class="switch-thumb"></span></span>
              </label>
            </div>

            <div class="access-row" :class="{ disabled: !store.enabled }">
              <div class="msc-info">
                <div class="msc-title">圈子读取主记忆</div>
                <div class="msc-desc">允许圈子动态参考你的长期记忆</div>
              </div>
              <label class="switch" :title="!store.enabled ? '请先开启主记忆' : '切换圈子读取主记忆'">
                <input v-model="store.access.circleReadMain" type="checkbox" :disabled="!store.enabled" />
                <span class="switch-track"><span class="switch-thumb"></span></span>
              </label>
            </div>

            <div class="access-row" :class="{ disabled: !store.enabled }">
              <div class="msc-info">
                <div class="msc-title">好友读取主记忆</div>
                <div class="msc-desc">允许星空好友在私聊和群聊中参考你的长期记忆</div>
              </div>
              <label class="switch" :title="!store.enabled ? '请先开启主记忆' : '切换好友读取主记忆'">
                <input v-model="store.access.friendReadMain" type="checkbox" :disabled="!store.enabled" />
                <span class="switch-track"><span class="switch-thumb"></span></span>
              </label>
            </div>

            <div class="access-row">
              <div class="msc-info">
                <div class="msc-title">群聊好友读取私聊记忆</div>
                <div class="msc-desc">允许好友在群聊中记得你们私聊里聊过的事</div>
              </div>
              <label class="switch" title="切换群聊读取私聊记忆">
                <input v-model="store.access.groupReadPrivate" type="checkbox" />
                <span class="switch-track"><span class="switch-thumb"></span></span>
              </label>
            </div>

            <div class="access-row">
              <div class="msc-info">
                <div class="msc-title">私聊好友读取群聊记忆</div>
                <div class="msc-desc">允许好友在私聊中提起你们在群聊里经历的事</div>
              </div>
              <label class="switch" title="切换私聊读取群聊记忆">
                <input v-model="store.access.privateReadGroup" type="checkbox" />
                <span class="switch-track"><span class="switch-thumb"></span></span>
              </label>
            </div>
          </div>

          <div v-if="selectMode" class="select-bar">
            <span>已选 {{ selected.length }} 项</span>
            <button class="link-btn" @click="toggleSelectAll">{{ allSelected ? '取消全选' : '全选' }}</button>
          </div>

          <div v-if="store.sorted.length === 0" class="empty">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V18h8v-3.3A7 7 0 0 0 12 2z"/></svg>
            <p>暂无记忆</p>
            <span>点击右上角 + 新建，或在对话中发送「记住…」</span>
          </div>

          <div
            v-for="m in store.sorted"
            :key="m.id"
            class="memory-item"
            :class="{ selected: isSelected(m.id) }"
            @click="onItemClick(m)"
          >
            <span v-if="selectMode" class="item-check" :class="{ checked: isSelected(m.id) }">
              <svg v-if="isSelected(m.id)" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
            </span>
            <div class="memory-info">
              <div class="memory-title-row">
                <span class="memory-title">{{ m.title }}</span>
                <span v-if="m.source === 'chat'" class="source-tag">AI</span>
              </div>
              <div class="memory-preview">{{ m.content }}</div>
              <div class="memory-time">{{ fmtTime(m.updatedAt) }}</div>
            </div>
            <button v-if="!selectMode" class="item-del" title="删除" @click.stop="delMemory(m.id)">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>

          <p class="memory-hint">
            在对话中发送「记住……」或「保存记忆」，AI 会自动提炼关键点保存到这里。主记忆开启后，才会按上面的读取权限提供给对应模块。
          </p>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useMemoryStore } from '../../stores/memory'

const store = useMemoryStore()
const visible = ref(false)
const editing = ref(null)
const selectMode = ref(false)
const selected = ref([])

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

function normalizeAutoTurns() {
  const turns = Math.round(Number(store.autoTurns) || 10)
  store.autoTurns = Math.min(50, Math.max(2, turns))
}

function createNew() {
  selectMode.value = false
  selected.value = []
  editing.value = { id: null, title: '', content: '' }
}

function openMemory(m) {
  editing.value = { id: m.id, title: m.title, content: m.content }
}

function saveMemory() {
  if (!editing.value) return
  if (!editing.value.content.trim()) {
    window.__ui?.showToast('记忆内容不能为空', 'error')
    return
  }
  if (editing.value.id) {
    store.update(editing.value.id, { title: editing.value.title, content: editing.value.content })
  } else {
    store.create(editing.value.title, editing.value.content, 'manual')
  }
  editing.value = null
}

function cancelEdit() {
  editing.value = null
}

function isSelected(id) {
  return selected.value.includes(id)
}

function onItemClick(m) {
  if (!selectMode.value) {
    openMemory(m)
    return
  }
  selected.value = isSelected(m.id)
    ? selected.value.filter(id => id !== m.id)
    : [...selected.value, m.id]
}

function toggleSelectMode() {
  selectMode.value = !selectMode.value
  selected.value = []
}

function toggleSelectAll() {
  selected.value = allSelected.value ? [] : store.sorted.map(m => m.id)
}

async function delMemory(id) {
  const ok = await window.__ui?.showConfirm('确定删除这条记忆？')
  if (ok) store.remove(id)
  selected.value = selected.value.filter(x => x !== id)
}

async function deleteSelected() {
  if (!selected.value.length) return
  const ok = await window.__ui?.showConfirm(`确定删除选中的 ${selected.value.length} 条记忆？`)
  if (!ok) return
  store.removeMany(selected.value)
  selected.value = []
}
</script>

<style scoped>
.memory-overlay { position: fixed; inset: 0; z-index: 1000; background: rgba(0,0,0,0.5); opacity: 0; pointer-events: none; transition: opacity 0.3s; }
.memory-overlay.open { opacity: 1; pointer-events: auto; }

.memory-panel {
  position: fixed; top: 0; right: 0; width: 440px; max-width: 100vw; height: 100vh; height: 100dvh;
  background: var(--bg-primary); display: flex; flex-direction: column;
  transform: translateX(100%); transition: transform 0.3s ease; z-index: 1001;
}
.memory-panel.open { transform: translateX(0); }

.memory-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 18px 20px 18px 24px; border-bottom: 1px solid var(--border-color); flex-shrink: 0; }
.memory-header h2 { display: flex; align-items: center; gap: 8px; margin: 0; font-size: 18px; }
.count { padding: 1px 7px; border-radius: 10px; background: var(--bg-hover); color: var(--text-muted); font-size: 11px; font-weight: 500; }
.header-actions { display: flex; align-items: center; gap: 4px; }

.icon-btn { position: relative; width: 34px; height: 34px; flex-shrink: 0; border: none; border-radius: 8px; background: transparent; color: var(--text-secondary); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background 0.15s, color 0.15s; }
.icon-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
.icon-btn.active { background: var(--accent-light); color: var(--accent); }
.icon-btn.danger:hover { background: var(--danger-bg); color: var(--danger); }
.icon-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.icon-btn:disabled:hover { background: transparent; color: var(--text-secondary); }
.badge { position: absolute; top: 1px; right: 1px; min-width: 15px; height: 15px; padding: 0 3px; border-radius: 8px; background: var(--danger); color: #fff; font-size: 10px; line-height: 15px; text-align: center; box-sizing: border-box; }

.memory-body { flex: 1; overflow-y: auto; padding: 14px 20px 20px; }

.msc-info { flex: 1; min-width: 0; }
.msc-title { font-size: 14px; font-weight: 600; color: var(--text-primary); }
.msc-desc { margin-top: 3px; font-size: 12px; line-height: 1.5; color: var(--text-muted); }

.memory-access-card { border: 1px solid var(--border-color); border-radius: 12px; background: var(--bg-card); margin-bottom: 12px; overflow: hidden; }
.mac-head { padding: 12px 16px 4px; font-size: 13px; font-weight: 600; color: var(--text-primary); }
.access-row { display: flex; align-items: center; gap: 12px; padding: 10px 16px; border-top: 1px solid var(--border-color); }
.access-row.disabled { opacity: 0.5; }
.access-row.disabled .switch,
.access-row.disabled input { cursor: not-allowed; }
.access-hint { margin: 0 4px 14px; font-size: 12px; line-height: 1.6; color: var(--text-muted); }
.turns-control { flex-shrink: 0; display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-secondary); }
.turns-control input {
  width: 58px;
  padding: 6px 8px;
  border: 1px solid var(--border-color);
  border-radius: 7px;
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: 13px;
  font-family: inherit;
  text-align: center;
  outline: none;
}
.turns-control input:focus { border-color: var(--accent); }
.turns-control input:disabled { opacity: 0.5; cursor: not-allowed; }

.switch { flex-shrink: 0; cursor: pointer; display: inline-flex; }
.switch input { position: absolute; opacity: 0; width: 0; height: 0; }
.switch-track { position: relative; width: 38px; height: 22px; border-radius: 11px; background: var(--bg-active); transition: background 0.2s; display: inline-block; }
.switch-track::after { content: ''; position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; border-radius: 50%; background: var(--text-muted); transition: transform 0.2s, background 0.2s; }
.switch input:checked + .switch-track { background: var(--accent); }
.switch input:checked + .switch-track::after { transform: translateX(16px); background: #fff; }

.select-bar { display: flex; align-items: center; justify-content: space-between; padding: 4px 8px 8px; font-size: 12px; color: var(--text-muted); }
.link-btn { border: none; background: transparent; color: var(--accent); font-size: 12px; font-family: inherit; cursor: pointer; padding: 2px 4px; }
.link-btn:hover { color: var(--accent-hover); }

.empty { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 40px 0; color: var(--text-muted); }
.empty p { margin: 4px 0 0; font-size: 13px; }
.empty span { font-size: 12px; }

.memory-item { display: flex; align-items: flex-start; gap: 10px; padding: 12px 10px; border-radius: 8px; cursor: pointer; margin-bottom: 2px; transition: background 0.15s; }
.memory-item:hover { background: var(--bg-hover); }
.memory-item.selected { background: var(--accent-light); }
.memory-info { flex: 1; min-width: 0; }
.memory-title-row { display: flex; align-items: center; gap: 6px; }
.memory-title { font-size: 13px; font-weight: 600; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.source-tag { flex-shrink: 0; padding: 0 5px; border-radius: 4px; background: var(--accent-light); color: var(--accent); font-size: 10px; font-weight: 500; line-height: 16px; }
.memory-preview { margin-top: 4px; font-size: 12px; line-height: 1.5; color: var(--text-secondary); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.memory-time { margin-top: 4px; font-size: 10px; color: var(--text-muted); }

.item-check { width: 18px; height: 18px; flex-shrink: 0; margin-top: 2px; border: 1.5px solid var(--border-color); border-radius: 5px; display: flex; align-items: center; justify-content: center; color: #fff; box-sizing: border-box; transition: all 0.15s; }
.item-check.checked { background: var(--accent); border-color: var(--accent); }

.item-del { width: 26px; height: 26px; flex-shrink: 0; border: none; border-radius: 6px; background: transparent; color: var(--text-muted); cursor: pointer; display: flex; align-items: center; justify-content: center; opacity: 0; transition: background 0.15s, color 0.15s, opacity 0.15s; }
.memory-item:hover .item-del { opacity: 1; }
.item-del:hover { background: var(--danger-bg); color: var(--danger); }

.memory-hint { margin: 16px 4px 0; font-size: 12px; line-height: 1.7; color: var(--text-muted); }

.memory-editor { flex: 1; min-height: 0; display: flex; flex-direction: column; padding: 16px 24px 20px; }
.me-title { width: 100%; padding: 9px 12px; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-input); color: var(--text-primary); font-size: 15px; font-weight: 500; outline: none; margin-bottom: 10px; box-sizing: border-box; font-family: inherit; }
.me-title:focus { border-color: var(--accent); }
.me-content { width: 100%; flex: 1; min-height: 160px; padding: 12px; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-input); color: var(--text-primary); font-size: 13px; outline: none; resize: none; font-family: inherit; line-height: 1.7; box-sizing: border-box; }
.me-content:focus { border-color: var(--accent); }
.me-actions { display: flex; gap: 8px; margin-top: 12px; }

.btn-sm { padding: 7px 16px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-card); color: var(--text-primary); font-size: 12px; cursor: pointer; font-family: inherit; }
.btn-sm:hover { background: var(--bg-hover); }
.btn-sm.primary { background: var(--accent); color: #fff; border-color: var(--accent); }
.btn-sm.primary:hover { background: var(--accent-hover); }

@media (max-width: 768px) {
  .memory-panel { width: 100vw; }
}
</style>
