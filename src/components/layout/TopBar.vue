<template>
  <header class="topbar">
    <h1 class="title">XIYUE AI</h1>
    <div class="actions">
      <button class="btn-icon" @click="searchOpen = true" title="历史全文搜索">
        <i class="fa-solid fa-magnifying-glass"></i>
      </button>
      <ContextRing :used="contextUsed" :limit="contextLimit" align="right" />
      <button class="btn-icon" @click="scrollToTop" title="回到顶部">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg>
      </button>
      <button class="btn-icon" @click="newChat" title="新建对话">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          <line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
        </svg>
      </button>
    </div>

    <HistorySearch v-if="searchOpen" @close="searchOpen = false" />
  </header>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useTopicsStore } from '../../stores/topics'
import { useChatStore } from '../../stores/chat'
import { useSettingsStore } from '../../stores/settings'
import { useRouter } from 'vue-router'
import ContextRing from '../common/ContextRing.vue'
import HistorySearch from '../chat/HistorySearch.vue'
import { estimateMessagesTokens } from '../../utils/contextUsage'

const topics = useTopicsStore()
const chat = useChatStore()
const settings = useSettingsStore()
const router = useRouter()
const searchOpen = ref(false)

// 当前对话实际会发送的上下文（系统提示词 + 历史消息）
const contextUsed = computed(() => {
  const system = chat.buildSystemPrompt()
  return estimateMessagesTokens([
    ...(system ? [{ role: 'system', content: system }] : []),
    ...chat.messages,
  ])
})
const contextLimit = computed(() => settings.contextLength || 131072)

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
