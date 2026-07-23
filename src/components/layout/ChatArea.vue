<template>
  <div class="chat-area">
    <WelcomeScreen v-if="messages.length === 0 && !chatStore.streamingContent && !chatStore.isLoading" @send="handleSend" />
    <MessageList
      v-else
      ref="msgListRef"
      :messages="messages"
      :streamingContent="chatStore.streamingContent"
      :streamingThinking="chatStore.streamingThinking"
      :isLoading="chatStore.isLoading"
      @away-from-bottom="showScrollBtn = $event"
    />
    <ChatInput
      :isLoading="chatStore.isLoading"
      @send="handleSend"
      @stop="chatStore.stopGeneration()"
    />

    <!-- 回到底部按钮 -->
    <button v-if="showScrollBtn" class="scroll-bottom-btn" @click="msgListRef?.scrollToBottom()" title="回到底部">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
    </button>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useChatStore } from '../../stores/chat'
import { useTopicsStore } from '../../stores/topics'
import MessageList from '../chat/MessageList.vue'
import ChatInput from '../chat/ChatInput.vue'
import WelcomeScreen from '../chat/WelcomeScreen.vue'
import { computed } from 'vue'

const route = useRoute()
const chatStore = useChatStore()
const topicsStore = useTopicsStore()

const props = defineProps({ id: { type: String, default: null } })
const topicId = computed(() => props.id || route.params.id)
const messages = computed(() => chatStore.messages)
const msgListRef = ref(null)
const showScrollBtn = ref(false)

function handleSend(data) {
  const text = typeof data === 'string' ? data : data.text
  const images = typeof data === 'string' ? [] : (data.images || [])
  chatStore.sendMessage(text, images)
}

// 暴露给 TopBar：点击 LOGO 滚到顶部
function scrollToTop() {
  msgListRef.value?.scrollToTop()
}
defineExpose({ scrollToTop })

onMounted(() => {
  window.__scrollToTop = () => {
    const el = document.querySelector('.message-list')
    if (el) el.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (topicId.value) {
    chatStore.loadMessages(topicId.value)
    topicsStore.switchTopic(Number(topicId.value))
  } else {
    chatStore.loadMessages(topicsStore.currentTopicId || '')
  }
})

watch(topicId, (newId) => {
  if (newId) {
    chatStore.loadMessages(newId)
    topicsStore.switchTopic(Number(newId))
  }
})
</script>

<style scoped>
.chat-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  position: relative;
}

.scroll-bottom-btn {
  position: absolute;
  bottom: 90px;
  right: 32px;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  border: 1px solid var(--border-color);
  background: var(--bg-primary);
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  z-index: 5;
  transition: all 0.2s;
}
.scroll-bottom-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
</style>
