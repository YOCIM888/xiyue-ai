<template>
  <div class="sidebar-wrapper" :class="{ collapsed: !open, 'mobile-overlay': isMobile }">
    <div v-if="isMobile && open" class="sidebar-backdrop" @click="open = false"></div>

    <aside class="sidebar">
      <!-- 顶部操作区 -->
      <div class="sidebar-header">
        <button class="btn-new-chat" @click="handleNewChat">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          <span>新建对话</span>
        </button>
        <button v-if="isMobile" class="btn-close-mobile" @click="open = false">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <!-- 搜索 -->
      <div class="sidebar-search">
        <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input v-model="searchQuery" class="search-input" placeholder="搜索历史对话…" @input="onSearch" />
      </div>

      <!-- 快捷入口 -->
      <div class="sidebar-nav">
        <button class="nav-btn" @click="assetPanel?.open()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          <span>资产</span>
        </button>
        <button class="nav-btn disabled" title="功能开发中">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
          <span>工作模式</span>
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
    </aside>
  </div>

  <button v-if="!isMobile || !open" class="btn-toggle" @click="open = !open" :title="open ? '收起侧边栏' : '展开侧边栏'">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M4 6h16M4 12h16M4 18h16"/><path d="M8 6v12"/>
    </svg>
  </button>
</template>

<script setup>
import { ref, computed, inject, onMounted, onUnmounted, nextTick } from 'vue'
import { useTopicsStore } from '../../stores/topics'
import { useChatStore } from '../../stores/chat'
import { useRouter } from 'vue-router'

const topics = useTopicsStore()
const chat = useChatStore()
const router = useRouter()

const open = ref(true)
const isMobile = ref(false)
const searchQuery = ref('')
const highlightId = ref(null)
const topicListRef = ref(null)
const topicRefs = {}

function setTopicRef(id, el) { if (el) topicRefs[id] = el }

const assetPanel = inject('assetPanel', null)

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

function handleNewChat() {
  const topic = topics.createTopic()
  chat.loadMessages(topic.id)
  router.push(`/chat/${topic.id}`)
  if (isMobile.value) open.value = false
}

function handleSwitch(id) {
  topics.switchTopic(id)
  chat.loadMessages(id)
  router.push(`/chat/${id}`)
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
</script>

<style scoped>
.sidebar-wrapper { position: relative; width: 260px; min-width: 260px; transition: width 0.25s ease, min-width 0.25s ease; z-index: 10; overflow: hidden; }
.sidebar-wrapper.collapsed { width: 0; min-width: 0; }

.sidebar { width: 260px; min-width: 260px; height: 100%; background: var(--bg-sidebar); display: flex; flex-direction: column; border-right: 1px solid var(--border-color); }

.sidebar-header { display: flex; align-items: center; gap: 8px; padding: 10px 12px; }
.btn-new-chat { flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 10px; border: 1px solid var(--border-color); border-radius: 10px; background: var(--bg-primary); color: var(--text-primary); cursor: pointer; font-size: 13px; font-family: inherit; transition: all 0.2s; }
.btn-new-chat:hover { background: var(--bg-hover); border-color: var(--accent); }
.btn-close-mobile { display: none; }

/* 搜索 */
.sidebar-search { display: flex; align-items: center; gap: 6px; margin: 0 12px 8px; padding: 8px 10px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 8px; }
.search-icon { flex-shrink: 0; color: var(--text-muted); }
.search-input { flex: 1; border: none; background: transparent; color: var(--text-primary); font-size: 12px; outline: none; font-family: inherit; }
.search-input::placeholder { color: var(--text-muted); }

/* 快捷入口 */
.sidebar-nav { display: flex; gap: 4px; padding: 0 12px 8px; }
.nav-btn { flex: 1; display: flex; align-items: center; justify-content: center; gap: 4px; padding: 7px 4px; border: none; border-radius: 8px; background: transparent; color: var(--text-secondary); cursor: pointer; font-size: 12px; font-family: inherit; transition: all 0.15s; }
.nav-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
.nav-btn.disabled { opacity: 0.4; cursor: not-allowed; }
.nav-btn.disabled:hover { background: transparent; color: var(--text-secondary); }

/* 历史对话标题 */
.topic-list-header { padding: 8px 16px 4px; font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }

.topic-list { flex: 1; overflow-y: auto; padding: 4px 8px 8px; }
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
  .btn-close-mobile { display: flex; width: 32px; height: 32px; border: none; border-radius: 6px; background: transparent; color: var(--text-secondary); cursor: pointer; align-items: center; justify-content: center; }
  .btn-toggle { position: fixed; top: 14px; left: 12px; right: auto; z-index: 90; }
  .sidebar-wrapper:not(.collapsed) ~ .btn-toggle { display: none; }
}
</style>
