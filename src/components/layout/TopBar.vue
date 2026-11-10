<template>
  <header class="topbar">
    <h1 class="title" @click="scrollToTop" title="回到顶部">XIYUE AI</h1>
    <div class="actions">
      <button class="bar-btn" title="新建对话" @click="newChat">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <circle cx="12" cy="12" r="9"/>
          <line x1="12" y1="7.5" x2="12" y2="16.5"/><line x1="7.5" y1="12" x2="16.5" y2="12"/>
        </svg>
        <span>新对话</span>
      </button>
      <span class="bar-divider"></span>
      <button
        class="bar-btn"
        :class="{ active: workspaceOpen }"
        :title="(workspaceOpen ? '收起工作区' : '展开工作区') + '（Alt+Shift+W）'"
        @click="toggleWorkspace"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
        <span>工作区</span>
      </button>
    </div>
  </header>
</template>

<script setup>
import { computed, inject } from 'vue'
import { useTopicsStore } from '../../stores/topics'
import { useChatStore } from '../../stores/chat'
import { useRouter } from 'vue-router'

const topics = useTopicsStore()
const chat = useChatStore()
const router = useRouter()

const workspacePanel = inject('workspacePanel', null)
const workspaceOpen = computed(() => !!workspacePanel?.value?.isPanelOpen?.())

function toggleWorkspace() {
  workspacePanel?.value?.toggle?.()
}

function scrollToTop() {
  const el = document.querySelector('.message-list')
  if (el) el.scrollTo({ top: 0, behavior: 'smooth' })
}

function newChat() {
  const topic = topics.createTopic()
  chat.loadMessages(topic.id)
  router.push(`/chat/${topic.id}`)
}
</script>

<style scoped>
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--topbar-h, 60px);
  box-sizing: border-box;
  padding: 0 24px 0 50px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-primary);
  flex-shrink: 0;
}
.title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
  letter-spacing: -0.5px;
  cursor: pointer;
  user-select: none;
}
.actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
.bar-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  border: none;
  border-radius: 9px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.18s, color 0.18s;
}
.bar-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.bar-btn.active {
  background: var(--bg-active);
  color: var(--accent);
}
.bar-divider {
  width: 1px;
  height: 18px;
  background: var(--border-color);
  margin: 0 2px;
}

/* 移动端 */
@media (max-width: 768px) {
  .topbar {
    padding: 0 12px 0 50px;
  }
  .title {
    font-size: 16px;
  }
}
@media (max-width: 480px) {
  .bar-btn {
    padding: 8px;
  }
  .bar-btn span {
    display: none;
  }
}
</style>
