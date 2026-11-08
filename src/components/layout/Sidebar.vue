<template>
  <div class="sidebar-wrapper" :class="{ collapsed: !open, 'mobile-overlay': isMobile }">
    <div v-if="isMobile && open" class="sidebar-backdrop" @click="open = false"></div>

    <aside class="sidebar" @touchstart="onSidebarTouchStart" @touchend="onSidebarTouchEnd">
      <!-- 快捷入口 -->
      <div class="sidebar-nav">
        <button class="nav-btn" @click="assetPanel?.open()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          <span>我的文档</span>
        </button>
        <button class="nav-btn" @click="skillPanel?.open()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
          <span>技能管理</span>
        </button>
        <button class="nav-btn" @click="memoryPanel?.open()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V18h8v-3.3A7 7 0 0 0 12 2z"/></svg>
          <span>记忆管理</span>
        </button>
        <button class="nav-btn" @click="openStarry">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.2l5.9-.9L12 3z"/></svg>
          <span>探索星空</span>
        </button>
        <button class="nav-btn" @click="openDream">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
          <span>梦境推演</span>
        </button>
      </div>

      <!-- 历史对话：顶置 / 最近 分组 -->
      <div class="topic-list" ref="topicListRef">
        <div v-if="topicGroups.length === 0" class="empty-hint">暂无对话记录</div>
        <div v-for="(group, gi) in topicGroups" :key="group.key" class="topic-group">
          <div class="group-title">{{ group.label }}</div>
          <div
            v-for="topic in group.topics"
            :key="topic.id"
            :ref="el => setTopicRef(topic.id, el)"
            class="topic-item"
            :class="{ active: topic.id === topics.currentTopicId, selected: selectMode && selectedIds.has(topic.id) }"
            @click="onTopicClick(topic.id)"
            @contextmenu.prevent="onTopicCtx(topic.id, $event)"
            @touchstart="onTopicTouchStart(topic.id, $event)"
            @touchend="onTopicTouchEnd"
            @touchmove="onTopicTouchMove"
          >
            <span v-if="selectMode" class="topic-check" :class="{ on: selectedIds.has(topic.id) }">
              <svg v-if="selectedIds.has(topic.id)" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
            </span>
            <template v-else>
              <svg v-if="topic.pinned" class="topic-icon pin" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/></svg>
              <svg v-else class="topic-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </template>
            <div class="topic-info">
              <span class="topic-title" :title="topic.title">{{ topic.title }}</span>
              <span class="topic-time">{{ fmtTime(topic.updatedAt) }}</span>
            </div>
          </div>
          <div v-if="gi < topicGroups.length - 1" class="group-divider"></div>
        </div>
      </div>

      <!-- 多选操作栏 -->
      <div v-if="selectMode" class="select-bar">
        <button class="select-btn" @click="toggleSelectAll">{{ allSelected ? '取消全选' : '全选' }}</button>
        <span class="select-count">已选 {{ selectedIds.size }} 项</span>
        <button class="select-btn danger" :disabled="!selectedIds.size" @click="deleteSelected">删除</button>
        <button class="select-btn" @click="exitSelectMode">取消</button>
      </div>

      <!-- 底部：用户信息 + 设置 -->
      <div class="sidebar-footer">
        <button class="user-btn" @click="emit('open-settings', 'user')" title="用户信息设置">
          <span class="user-avatar">
            <img v-if="settings.userAvatar" :src="settings.userAvatar" />
            <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          </span>
          <span class="user-name">{{ settings.userName || '未设置昵称' }}</span>
        </button>
        <button class="btn-theme" @click="settings.darkMode = !settings.darkMode" :title="settings.darkMode ? '切换到浅色模式' : '切换到深色模式'">
          <svg v-if="settings.darkMode" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
          <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
        </button>
        <button class="btn-settings" @click="emit('open-settings')" title="设置">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>
      </div>
    </aside>
  </div>

  <button v-if="!isMobile || !open" class="btn-toggle" @click="open = !open" :title="open ? '收起侧边栏' : '展开侧边栏'">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
      <line x1="5" y1="7" x2="19" y2="7"/>
      <line x1="5" y1="17" x2="19" y2="17"/>
    </svg>
  </button>

  <!-- 对话条目右键 / 长按菜单 -->
  <Teleport to="body">
    <div v-if="ctx.show" class="ctx-overlay" @click.self="closeCtx" @contextmenu.prevent>
      <div class="ctx-menu" :style="{ top: ctx.y + 'px', left: ctx.x + 'px' }">
        <button class="ctx-item" @click="ctxRename">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
          <span>重命名</span>
        </button>
        <button class="ctx-item" @click="ctxTogglePin">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/></svg>
          <span>{{ ctxPinned ? '取消顶置' : '顶置' }}</span>
        </button>
        <button class="ctx-item" @click="ctxMulti">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M8 12l3 3 5-6"/></svg>
          <span>多选</span>
        </button>
        <button class="ctx-item danger" @click="ctxDelete">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          <span>删除</span>
        </button>
      </div>
    </div>

    <!-- 重命名对话框 -->
    <div v-if="rename.show" class="rename-overlay" @click.self="cancelRename">
      <div class="rename-box">
        <div class="rename-title">重命名对话</div>
        <input ref="renameInput" v-model="rename.value" class="rename-input" maxlength="80"
          @keydown.enter.prevent="confirmRename" @keydown.esc="cancelRename" />
        <div class="rename-actions">
          <button class="rename-btn cancel" @click="cancelRename">取消</button>
          <button class="rename-btn confirm" @click="confirmRename">确定</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, inject, nextTick, onMounted, onUnmounted } from 'vue'
import { useTopicsStore } from '../../stores/topics'
import { useChatStore } from '../../stores/chat'
import { useSettingsStore } from '../../stores/settings'
import { useRouter } from 'vue-router'

const topics = useTopicsStore()
const chat = useChatStore()
const settings = useSettingsStore()
const router = useRouter()
const emit = defineEmits(['open-settings'])

const open = ref(true)
const isMobile = ref(false)
const topicListRef = ref(null)
const topicRefs = {}

function setTopicRef(id, el) { if (el) topicRefs[id] = el }

// 顶置 / 最近 两个分组：没有顶置时不显示顶置区
const topicGroups = computed(() => {
  const pinned = topics.topics.filter(t => t.pinned).sort((a, b) => b.updatedAt - a.updatedAt)
  const recent = topics.topics.filter(t => !t.pinned).sort((a, b) => b.updatedAt - a.updatedAt)
  const groups = []
  if (pinned.length) groups.push({ key: 'pinned', label: '顶置', topics: pinned })
  if (recent.length) groups.push({ key: 'recent', label: '最近', topics: recent })
  return groups
})

// 右键 / 长按菜单
const ctx = ref({ show: false, x: 0, y: 0, id: null })
const ctxTopic = computed(() => topics.topics.find(t => t.id === ctx.value.id) ?? null)
const ctxPinned = computed(() => !!ctxTopic.value?.pinned)

function closeCtx() { ctx.value.show = false }

function openCtx(id, x, y) {
  if (selectMode.value) return
  ctx.value = {
    show: true,
    id,
    x: Math.max(8, Math.min(x, window.innerWidth - 176)),
    y: Math.max(8, Math.min(y, window.innerHeight - 190)),
  }
}

function onTopicCtx(id, e) {
  openCtx(id, e.clientX, e.clientY)
}

function ctxRename() {
  const id = ctx.value.id
  closeCtx()
  startRename(id)
}

function ctxTogglePin() {
  const id = ctx.value.id
  closeCtx()
  topics.togglePin(id)
}

function ctxMulti() {
  const id = ctx.value.id
  closeCtx()
  selectMode.value = true
  selectedIds.value = new Set([id])
}

function ctxDelete() {
  const id = ctx.value.id
  closeCtx()
  handleDelete(id)
}

// 重命名
const rename = ref({ show: false, id: null, value: '' })
const renameInput = ref(null)

function startRename(id) {
  const topic = topics.topics.find(t => t.id === id)
  if (!topic) return
  rename.value = { show: true, id, value: topic.title }
  nextTick(() => {
    renameInput.value?.focus()
    renameInput.value?.select()
  })
}

function cancelRename() { rename.value.show = false }

function confirmRename() {
  const value = rename.value.value.trim()
  if (value) topics.renameTopic(rename.value.id, value)
  rename.value.show = false
}

// 多选
const selectMode = ref(false)
const selectedIds = ref(new Set())
const allSelected = computed(() =>
  topics.topics.length > 0 && selectedIds.value.size === topics.topics.length
)

function onTopicClick(id) {
  if (longPressed) { longPressed = false; return }
  if (selectMode.value) {
    const next = new Set(selectedIds.value)
    next.has(id) ? next.delete(id) : next.add(id)
    selectedIds.value = next
    return
  }
  handleSwitch(id)
}

function toggleSelectAll() {
  selectedIds.value = allSelected.value ? new Set() : new Set(topics.topics.map(t => t.id))
}

function exitSelectMode() {
  selectMode.value = false
  selectedIds.value = new Set()
}

async function deleteSelected() {
  const ids = [...selectedIds.value]
  if (!ids.length) return
  const ok = await window.__ui?.showConfirm(`确定删除选中的 ${ids.length} 个对话吗？`) || false
  if (!ok) return
  ids.forEach(id => topics.deleteTopic(id))
  const cur = topics.currentTopicId
  chat.loadMessages(cur || '')
  router.push(cur ? `/chat/${cur}` : '/chat')
  exitSelectMode()
}

const assetPanel = inject('assetPanel', null)
const skillPanel = inject('skillPanel', null)
const memoryPanel = inject('memoryPanel', null)

function checkMobile() {
  isMobile.value = window.innerWidth <= 768
  if (isMobile.value) open.value = false
}

onMounted(() => {
  checkMobile()
  window.addEventListener('resize', checkMobile)
})
onUnmounted(() => {
  window.removeEventListener('resize', checkMobile)
})

function fmtTime(ts) {
  const d = new Date(ts)
  const now = new Date()
  const diff = now - d
  if (diff < 86400000) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (diff < 604800000) return Math.floor(diff / 86400000) + '天前'
  return d.toLocaleDateString()
}

function handleSwitch(id) {
  topics.switchTopic(id)
  chat.loadMessages(id)
  router.push(`/chat/${id}`)
  if (isMobile.value) open.value = false
}

function openStarry() {
  router.push('/starry')
  if (isMobile.value) open.value = false
}

function openDream() {
  router.push('/dream')
  if (isMobile.value) open.value = false
}

async function handleDelete(id) {
  const ok = await window.__ui?.showConfirm('确定删除这个对话吗？') || false
  if (ok) {
    topics.deleteTopic(id)
    const cur = topics.currentTopicId
    chat.loadMessages(cur || '')
    router.push(cur ? `/chat/${cur}` : '/chat')
  }
}

// 长按菜单（移动端）
let topicLongTimer = null
let longPressed = false
function onTopicTouchStart(id, e) {
  if (selectMode.value) return
  topicLongTimer = setTimeout(() => {
    longPressed = true
    openCtx(id, e.touches[0].clientX, e.touches[0].clientY)
  }, 600)
}
function onTopicTouchEnd() { clearTimeout(topicLongTimer) }
function onTopicTouchMove() { clearTimeout(topicLongTimer) }

// 移动端左滑关闭侧边栏
let swipeStartX = 0
let swipeStartY = 0
function onSidebarTouchStart(e) {
  if (!isMobile.value) return
  swipeStartX = e.touches[0].clientX
  swipeStartY = e.touches[0].clientY
}
function onSidebarTouchEnd(e) {
  if (!isMobile.value) return
  const dx = e.changedTouches[0].clientX - swipeStartX
  const dy = e.changedTouches[0].clientY - swipeStartY
  if (dx < -60 && Math.abs(dx) > Math.abs(dy)) open.value = false
}
</script>

<style scoped>
.sidebar-wrapper { position: relative; width: 260px; min-width: 260px; transition: width 0.25s ease, min-width 0.25s ease; z-index: 10; overflow: hidden; }
.sidebar-wrapper.collapsed { width: 0; min-width: 0; }

.sidebar { width: 260px; min-width: 260px; height: 100%; background: var(--bg-sidebar); display: flex; flex-direction: column; border-right: 1px solid var(--border-color); }

/* 快捷入口 */
.sidebar-nav { display: flex; flex-direction: column; gap: 2px; padding: 12px 12px 8px; }
.nav-btn { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border: none; border-radius: 8px; background: transparent; color: var(--text-primary); cursor: pointer; font-size: 13px; font-family: inherit; transition: background 0.15s; }
.nav-btn span { flex: 1; text-align: left; }
.nav-btn:hover { background: var(--bg-hover); }
.nav-btn:active { background: var(--bg-active); }

/* 历史对话分组 */
.topic-list { flex: 1; overflow-y: auto; overscroll-behavior: none; padding: 4px 8px 8px; }
.empty-hint { text-align: center; padding: 24px; color: var(--text-muted); font-size: 12px; }
.group-title { padding: 6px 8px 4px; font-size: 11px; font-weight: 600; color: var(--text-muted); letter-spacing: 0.5px; }
.group-divider { height: 1px; margin: 6px 4px; background: var(--border-color); }

.topic-item { display: flex; align-items: center; gap: 6px; padding: 8px 10px; border-radius: 8px; cursor: pointer; transition: all 0.15s; margin-bottom: 1px; }
.topic-item:hover { background: var(--bg-hover); }
.topic-item.active { background: var(--bg-active); }
.topic-item.selected { background: var(--bg-hover); }

.topic-icon { flex-shrink: 0; color: var(--text-muted); }
.topic-icon.pin { color: var(--accent); }
.topic-info { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.topic-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; color: var(--text-primary); line-height: 1.4; }
.topic-time { font-size: 10px; color: var(--text-muted); line-height: 1.2; }

.topic-check { width: 16px; height: 16px; flex-shrink: 0; border: 1px solid var(--border-color); border-radius: 4px; display: flex; align-items: center; justify-content: center; color: #fff; transition: all 0.15s; }
.topic-check.on { background: var(--accent); border-color: var(--accent); }

/* 多选操作栏 */
.select-bar { display: flex; align-items: center; gap: 6px; padding: 8px 12px; border-top: 1px solid var(--border-color); flex-shrink: 0; }
.select-count { flex: 1; font-size: 11px; color: var(--text-muted); white-space: nowrap; }
.select-btn { padding: 5px 10px; border: none; border-radius: 6px; background: var(--bg-hover); color: var(--text-secondary); font-size: 12px; font-family: inherit; cursor: pointer; }
.select-btn:hover { color: var(--text-primary); }
.select-btn.danger { color: var(--danger); background: var(--danger-bg); }
.select-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* 底部用户栏 */
.sidebar-footer { display: flex; align-items: center; gap: 6px; padding: 8px 12px; border-top: 1px solid var(--border-color); flex-shrink: 0; }
.user-btn { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; padding: 5px 6px; border: none; border-radius: 8px; background: transparent; cursor: pointer; font-family: inherit; transition: background 0.15s; }
.user-btn:hover { background: var(--bg-hover); }
.user-avatar { width: 30px; height: 30px; flex-shrink: 0; border-radius: 50%; overflow: hidden; background: var(--bg-primary); border: 1px solid var(--border-color); display: flex; align-items: center; justify-content: center; color: var(--text-muted); }
.user-avatar img { width: 100%; height: 100%; object-fit: cover; }
.user-name { font-size: 12px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.btn-settings, .btn-theme { width: 32px; height: 32px; flex-shrink: 0; border: none; border-radius: 8px; background: transparent; color: var(--text-secondary); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.15s; }
.btn-settings:hover, .btn-theme:hover { background: var(--bg-hover); color: var(--text-primary); }

.btn-toggle {
  position: fixed; top: 14px; left: 246px;
  width: 32px; height: 32px; border: 1px solid var(--border-color); border-radius: 8px;
  background: var(--bg-primary); color: var(--text-secondary); cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: left 0.25s ease; z-index: 20; box-shadow: 0 1px 4px rgba(0,0,0,0.08);
}
.sidebar-wrapper.collapsed ~ .btn-toggle { left: 8px; }
.btn-toggle:hover { background: var(--bg-hover); color: var(--text-primary); }

/* 对话条目右键 / 长按菜单 */
.ctx-overlay { position: fixed; inset: 0; z-index: 2000; }
.ctx-menu { position: fixed; z-index: 2001; min-width: 168px; padding: 6px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.15); }
.ctx-item { display: flex; align-items: center; gap: 10px; width: 100%; padding: 9px 12px; border: none; border-radius: 8px; background: transparent; color: var(--text-primary); font-size: 13px; font-family: inherit; text-align: left; cursor: pointer; }
.ctx-item span { flex: 1; }
.ctx-item:hover { background: var(--bg-hover); }
.ctx-item.danger { color: var(--danger); }
.ctx-item.danger:hover { background: var(--danger-bg); }

/* 重命名对话框 */
.rename-overlay { position: fixed; inset: 0; z-index: 2000; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; }
.rename-box { width: 90%; max-width: 320px; padding: 20px; border-radius: 14px; background: var(--bg-primary); box-shadow: 0 8px 32px rgba(0,0,0,0.18); }
.rename-title { font-size: 14px; font-weight: 600; color: var(--text-primary); margin-bottom: 12px; }
.rename-input { width: 100%; box-sizing: border-box; padding: 8px 10px; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-card); color: var(--text-primary); font-size: 13px; font-family: inherit; outline: none; }
.rename-input:focus { border-color: var(--accent); }
.rename-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 14px; }
.rename-btn { padding: 7px 18px; border: none; border-radius: 8px; font-size: 13px; font-family: inherit; cursor: pointer; }
.rename-btn.cancel { background: var(--bg-hover); color: var(--text-secondary); }
.rename-btn.confirm { background: var(--accent); color: #fff; }

@media (max-width: 768px) {
  .sidebar-wrapper { position: fixed; inset: 0; width: 100%; min-width: 0; z-index: 100; pointer-events: none; }
  .sidebar-wrapper.collapsed { width: 100%; }
  .sidebar-wrapper:not(.collapsed) { pointer-events: auto; }
  .sidebar-backdrop { position: absolute; inset: 0; background: rgba(0,0,0,0.4); }
  .sidebar { position: relative; width: 280px; min-width: 280px; height: 100%; z-index: 2; transform: translateX(-100%); transition: transform 0.3s ease; box-shadow: 4px 0 24px rgba(0,0,0,0.15); }
  .sidebar-wrapper:not(.collapsed) .sidebar { transform: translateX(0); }
  .btn-toggle { position: fixed; top: 14px; left: 12px; right: auto; z-index: 90; }
  .sidebar-wrapper:not(.collapsed) ~ .btn-toggle { display: none; }
}
</style>
