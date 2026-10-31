<template>
  <div class="sidebar-wrapper" :class="{ collapsed: !open, 'mobile-overlay': isMobile }">
    <div v-if="isMobile && open" class="sidebar-backdrop" @click="open = false"></div>

    <aside class="sidebar" @touchstart="onSidebarTouchStart" @touchend="onSidebarTouchEnd">
      <!-- 搜索 -->
      <div class="sidebar-search">
        <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input v-model="searchQuery" class="search-input" placeholder="搜索历史对话…" @input="onSearch" />
      </div>

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
      </div>

      <!-- 历史对话 -->
      <div class="topic-list-header">
        <span>历史对话</span>
      </div>
      <div class="topic-list" ref="topicListRef">
        <div v-if="filteredTopics.length === 0 && !searchQuery" class="empty-hint">暂无对话记录</div>
        <div v-if="filteredTopics.length === 0 && searchQuery" class="empty-hint">未找到匹配的对话</div>
        <div
          v-for="topic in filteredTopics"
          :key="topic.id"
          :ref="el => setTopicRef(topic.id, el)"
          class="topic-item"
          :class="{ active: topic.id === topics.currentTopicId, highlight: highlightId === topic.id }"
          @click="handleSwitch(topic.id)"
          @contextmenu.prevent="onTopicCtx(topic.id, $event)"
          @touchstart="onTopicTouchStart(topic.id, $event)"
          @touchend="onTopicTouchEnd"
          @touchmove="onTopicTouchMove"
        >
          <svg v-if="topic.pinned" class="topic-icon pin" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/></svg>
          <svg v-else class="topic-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <div class="topic-info">
            <span class="topic-title" :title="topic.title">{{ topic.title }}</span>
            <span class="topic-time">{{ fmtTime(topic.updatedAt) }}</span>
          </div>
          <button class="btn-delete" @click.stop="handleDelete(topic.id)" title="删除">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
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
</template>

<script setup>
import { ref, computed, inject, onMounted, onUnmounted, nextTick } from 'vue'
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
const searchQuery = ref('')
const highlightId = ref(null)
const topicListRef = ref(null)
const topicRefs = {}

function setTopicRef(id, el) { if (el) topicRefs[id] = el }

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

const filteredTopics = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return topics.sortedTopics
  return topics.sortedTopics.filter(t => t.title.toLowerCase().includes(q))
})

function onSearch() {
  highlightId.value = null
}

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

async function handleDelete(id) {
  const ok = await window.__ui?.showConfirm('确定删除这个对话吗？') || false
  if (ok) {
    topics.deleteTopic(id)
    const cur = topics.currentTopicId
    chat.loadMessages(cur || '')
    router.push(cur ? `/chat/${cur}` : '/chat')
  }
}

// 长按/右键置顶
let topicLongTimer = null
function onTopicCtx(id, e) {
  const topic = topics.topics.find(t => t.id === id)
  if (!topic) return
  window.__ui?.showMenu(e.clientX, e.clientY, [
    { label: topic.pinned ? '取消置顶' : '置顶', action: () => topics.togglePin(id) },
  ])
}
function onTopicTouchStart(id, e) {
  topicLongTimer = setTimeout(() => {
    const topic = topics.topics.find(t => t.id === id)
    if (!topic) return
    window.__ui?.showMenu(e.touches[0].clientX, e.touches[0].clientY, [
      { label: topic.pinned ? '取消置顶' : '置顶', action: () => topics.togglePin(id) },
    ])
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

/* 搜索 */
.sidebar-search { display: flex; align-items: center; gap: 6px; margin: 10px 12px 8px; padding: 8px 10px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 8px; }
.search-icon { flex-shrink: 0; color: var(--text-muted); }
.search-input { flex: 1; border: none; background: transparent; color: var(--text-primary); font-size: 12px; outline: none; font-family: inherit; }
.search-input::placeholder { color: var(--text-muted); }

/* 快捷入口 */
.sidebar-nav { display: flex; flex-direction: column; gap: 2px; padding: 0 12px 8px; }
.nav-btn { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border: none; border-radius: 8px; background: transparent; color: var(--text-primary); cursor: pointer; font-size: 13px; font-family: inherit; transition: background 0.15s; }
.nav-btn span { flex: 1; text-align: left; }
.nav-btn:hover { background: var(--bg-hover); }
.nav-btn:active { background: var(--bg-active); }

/* 历史对话标题 */
.topic-list-header { padding: 8px 16px 4px; font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }

.topic-list { flex: 1; overflow-y: auto; overscroll-behavior: none; padding: 4px 8px 8px; }
.empty-hint { text-align: center; padding: 24px; color: var(--text-muted); font-size: 12px; }

.topic-item { display: flex; align-items: center; gap: 6px; padding: 8px 10px; border-radius: 8px; cursor: pointer; transition: all 0.15s; margin-bottom: 1px; }
.topic-item:hover { background: var(--bg-hover); }
.topic-item.active { background: var(--bg-active); }
.topic-item.highlight { background: var(--accent-light); }

.topic-icon { flex-shrink: 0; color: var(--text-muted); }
.topic-icon.pin { color: var(--accent); }
.topic-info { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.topic-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; color: var(--text-primary); line-height: 1.4; }
.topic-time { font-size: 10px; color: var(--text-muted); line-height: 1.2; }
.btn-delete { flex-shrink: 0; width: 24px; height: 24px; border: none; border-radius: 4px; background: transparent; color: var(--text-muted); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.15s; }
.topic-item:hover .btn-delete { opacity: 1; }
.btn-delete:hover { background: var(--danger-bg); color: var(--danger); }

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
