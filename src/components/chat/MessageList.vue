<template>
  <div class="message-list" ref="listRef">
    <div class="messages-container">
      <MessageItem
        v-for="(msg, idx) in messages"
        :key="idx"
        :message="msg"
        :index="idx"
        :is-last-ai="msg.role === 'assistant' && idx === messages.length - 1 && !streamingContent && !streamingThinking && !isLoading"
      />
      <!-- 流式生成中的临时消息 -->
      <div v-if="streamingContent || streamingThinking" class="message assistant">
        <div class="message-avatar">
          <img src="/xiyue.png" class="avatar-img" alt="AI" />
        </div>
        <div class="message-bubble">
          <!-- 思考链 -->
          <div v-if="streamingThinking" class="thinking-block">
            <button class="thinking-toggle" @click="thinkOpen = !thinkOpen">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline :points="thinkOpen ? '6 15 12 9 18 15' : '9 18 15 12 9 6'"/></svg>
              思考过程
            </button>
            <div v-if="thinkOpen" class="thinking-content">
              <MarkdownRenderer :content="streamingThinking" />
              <span class="cursor-blink" v-if="!streamingContent">▍</span>
            </div>
          </div>
          <!-- 正式回复 -->
          <div v-if="streamingContent">
            <MarkdownRenderer :content="streamingContent" />
            <span class="cursor-blink">▍</span>
          </div>
        </div>
      </div>
      <!-- 加载中但还没内容 -->
      <div v-if="isLoading && !streamingContent && !streamingThinking" class="message assistant">
        <div class="message-avatar">
          <img src="/xiyue.png" class="avatar-img" alt="AI" />
        </div>
        <div class="message-bubble">
          <div class="typing-indicator">
            <span></span><span></span><span></span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick, onMounted, onUnmounted } from 'vue'
import MessageItem from './MessageItem.vue'
import MarkdownRenderer from '../common/MarkdownRenderer.vue'

const props = defineProps({
  messages: { type: Array, default: () => [] },
  streamingContent: { type: String, default: '' },
  streamingThinking: { type: String, default: '' },
  isLoading: { type: Boolean, default: false },
})

const emit = defineEmits(['away-from-bottom'])

const listRef = ref(null)
const thinkOpen = ref(true)

function scrollToBottom() {
  nextTick(() => {
    if (listRef.value) {
      listRef.value.scrollTop = listRef.value.scrollHeight
    }
  })
}

function scrollToTop() {
  if (listRef.value) {
    listRef.value.scrollTo({ top: 0, behavior: 'smooth' })
  }
}

function checkScroll() {
  if (!listRef.value) return
  const el = listRef.value
  const dist = el.scrollHeight - el.scrollTop - el.clientHeight
  emit('away-from-bottom', dist > 200)
}

onMounted(() => {
  listRef.value?.addEventListener('scroll', checkScroll)
})
onUnmounted(() => {
  listRef.value?.removeEventListener('scroll', checkScroll)
})

watch(() => props.messages.length, scrollToBottom)
watch(() => props.streamingContent, scrollToBottom)
watch(() => props.streamingThinking, scrollToBottom)
watch(() => props.isLoading, scrollToBottom, { immediate: true })

defineExpose({ scrollToBottom, scrollToTop })
</script>

<style scoped>
.message-list {
  flex: 1;
  overflow-y: auto;
  overscroll-behavior: none;
  padding: 16px 0;
}
.messages-container {
  max-width: 800px;
  margin: 0 auto;
  padding: 0 24px;
}

.message {
  display: flex;
  gap: 10px;
  padding: 10px 0;
}
.message.assistant {
  flex-direction: row;
}

.message-avatar {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-sidebar);
  overflow: hidden;
  margin-top: 4px;
}
.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.message-bubble {
  max-width: 75%;
  min-width: 0;
  line-height: 1.7;
  font-size: 14px;
  color: var(--text-primary);
}

.cursor-blink {
  animation: blink 1s step-end infinite;
  color: var(--accent);
  font-weight: bold;
}
@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

.typing-indicator {
  display: flex;
  gap: 5px;
  padding: 8px 0;
}
.typing-indicator span {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--text-muted);
  animation: bounce 1.4s infinite ease-in-out both;
}
.typing-indicator span:nth-child(1) { animation-delay: -0.32s; }
.typing-indicator span:nth-child(2) { animation-delay: -0.16s; }
@keyframes bounce {
  0%, 80%, 100% { transform: scale(0); }
  40% { transform: scale(1); }
}

/* 移动端 */
@media (max-width: 768px) {
  .messages-container {
    padding: 0 12px;
  }
  .message {
    padding: 12px 0;
  }
}

/* 思考链区块 */
.thinking-block {
  margin-bottom: 12px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  overflow: hidden;
}
.thinking-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 8px 14px;
  border: none;
  background: var(--bg-sidebar);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.15s;
}
.thinking-toggle:hover {
  background: var(--bg-hover);
}
.thinking-content {
  padding: 10px 14px;
  font-size: 13px;
  color: var(--text-muted);
  line-height: 1.7;
  border-top: 1px solid var(--border-color);
  max-height: 400px;
  overflow-y: auto;
}
</style>
