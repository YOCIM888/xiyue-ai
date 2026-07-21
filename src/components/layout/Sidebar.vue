<template>
  <div class="sidebar-wrapper" :class="{ collapsed: !open, 'mobile-overlay': isMobile }">
    <!-- 移动端遮罩 -->
    <div v-if="isMobile && open" class="sidebar-backdrop" @click="open = false"></div>

    <aside class="sidebar">
      <div class="sidebar-header">
        <button class="btn-new-chat" @click="handleNewChat" title="新建对话">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          <span class="btn-text">新建对话</span>
        </button>
        <!-- 移动端关闭按钮 -->
        <button v-if="isMobile" class="btn-close-mobile" @click="open = false">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <div class="topic-list">
        <div v-if="sortedTopics.length === 0" class="empty-hint">暂无对话记录</div>
        <div
          v-for="topic in sortedTopics"
          :key="topic.id"
          class="topic-item"
          :class="{ active: topic.id === topics.currentTopicId }"
          @click="handleSwitch(topic.id)"
        >
          <svg class="topic-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <span class="topic-title" :title="topic.title">{{ topic.title }}</span>
          <button class="btn-delete" @click.stop="handleDelete(topic.id)" title="删除">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </div>

      <div class="sidebar-footer">
        <span class="version">XIYUE AI v1.0</span>
      </div>
    </aside>
  </div>

  <!-- 折叠按钮 — wrapper 外部，固定定位，始终可见 -->
  <button
    v-if="!isMobile || !open"
    class="btn-toggle"
    @click="open = !open"
    :title="open ? '收起侧边栏' : '展开侧边栏'"
  >
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline v-if="open" points="15 18 9 12 15 6"/>
      <polyline v-else points="9 18 15 12 9 6"/>
    </svg>
  </button>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useTopicsStore } from '../../stores/topics'
import { useChatStore } from '../../stores/chat'
import { useRouter } from 'vue-router'

const topics = useTopicsStore()
const chat = useChatStore()
const router = useRouter()

const open = ref(true)
const isMobile = ref(false)

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

const sortedTopics = computed(() => topics.sortedTopics)

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
</script>

<style scoped>
.sidebar-wrapper {
  position: relative;
  width: 260px;
  min-width: 260px;
  transition: width 0.25s ease, min-width 0.25s ease;
  z-index: 10;
  overflow: hidden;
}
.sidebar-wrapper.collapsed {
  width: 0;
  min-width: 0;
}

.sidebar {
  width: 260px;
  min-width: 260px;
  height: 100%;
  background: var(--bg-sidebar);
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border-color);
}

.sidebar-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  border-bottom: 1px solid var(--border-color);
}

.btn-new-chat {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-primary);
  color: var(--text-primary);
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
  white-space: nowrap;
}
.btn-new-chat:hover {
  background: var(--bg-hover);
  border-color: var(--accent);
}
.btn-text {
  overflow: hidden;
}

.btn-close-mobile {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  display: none;
}
.btn-close-mobile:hover {
  background: var(--bg-hover);
}

/* 折叠按钮 — 固定定位，始终在 wrapper 左边缘外侧可见 */
.btn-toggle {
  position: fixed;
  top: 14px;
  left: 246px;
  width: 32px;
  height: 32px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-primary);
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: left 0.25s ease, background 0.2s, color 0.2s;
  z-index: 20;
  box-shadow: 0 1px 4px rgba(0,0,0,0.08);
}
/* 折叠后按钮移到屏幕左边缘 */
.sidebar-wrapper.collapsed ~ .btn-toggle {
  left: 8px;
}
.btn-toggle:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.topic-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.empty-hint {
  text-align: center;
  padding: 32px 16px;
  color: var(--text-muted);
  font-size: 13px;
}

.topic-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s;
  margin-bottom: 2px;
}
.topic-item:hover {
  background: var(--bg-hover);
}
.topic-item.active {
  background: var(--bg-active);
}
.topic-icon {
  flex-shrink: 0;
  color: var(--text-muted);
}
.topic-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  color: var(--text-primary);
}
.btn-delete {
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}
.btn-delete:hover {
  background: var(--danger-bg);
  color: var(--danger);
}

.sidebar-footer {
  padding: 12px;
  border-top: 1px solid var(--border-color);
}
.version {
  font-size: 11px;
  color: var(--text-muted);
}

/* ===== 移动端：overlay 模式 ===== */
@media (max-width: 768px) {
  .sidebar-wrapper {
    position: fixed;
    inset: 0;
    width: 100%;
    min-width: 0;
    z-index: 100;
    pointer-events: none;
  }
  .sidebar-wrapper.collapsed {
    width: 100%;
    min-width: 0;
  }
  .sidebar-wrapper:not(.collapsed) {
    pointer-events: auto;
  }

  .sidebar-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
  }

  .sidebar {
    position: relative;
    width: 280px;
    min-width: 280px;
    height: 100%;
    z-index: 2;
    transform: translateX(-100%);
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 4px 0 24px rgba(0, 0, 0, 0.15);
  }
  .sidebar-wrapper:not(.collapsed) .sidebar {
    transform: translateX(0);
  }

  .btn-close-mobile {
    display: flex;
  }

  .btn-toggle {
    position: fixed;
    top: 14px;
    left: 12px;
    right: auto;
    z-index: 90;
  }
  .sidebar-wrapper:not(.collapsed) ~ .btn-toggle {
    display: none;
  }
}
</style>
