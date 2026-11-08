<template>
  <header class="topbar">
    <h1 class="title" @click="scrollToTop" title="回到顶部">XIYUE AI</h1>
    <div class="actions">
      <button class="btn-icon" @click="searchOpen = true" title="历史全文搜索">
        <i class="fa-solid fa-magnifying-glass"></i>
      </button>
      <button class="btn-icon new-chat-btn" @click="newChat" title="新建对话">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <circle cx="12" cy="12" r="9"/>
          <line x1="12" y1="7.5" x2="12" y2="16.5"/><line x1="7.5" y1="12" x2="16.5" y2="12"/>
        </svg>
      </button>
    </div>

    <HistorySearch v-if="searchOpen" @close="searchOpen = false" />
  </header>
</template>

<script setup>
import { ref } from 'vue'
import { useTopicsStore } from '../../stores/topics'
import { useChatStore } from '../../stores/chat'
import { useRouter } from 'vue-router'
import HistorySearch from '../chat/HistorySearch.vue'

const topics = useTopicsStore()
const chat = useChatStore()
const router = useRouter()
const searchOpen = ref(false)

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
  padding: 12px 24px 12px 50px;
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
  gap: 8px;
}
.btn-icon {
  width: 38px;
  height: 38px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}
.btn-icon:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.new-chat-btn {
  border-radius: 50%;
}

/* 移动端 */
@media (max-width: 768px) {
  .topbar {
    padding: 10px 16px 10px 50px;
  }
  .title {
    font-size: 16px;
  }
}
</style>
