<template>
  <div class="message-list" ref="listRef">
    <div class="messages-container">
      <MessageItem
        v-for="(msg, idx) in messages"
        :key="msg.id || idx"
        :message="msg"
        :index="idx"
        :highlight="msg.id === highlightId"
        :is-last-ai="msg.role === 'assistant' && idx === messages.length - 1 && !streamingContent && !streamingThinking && !isLoading"
      />
      <!-- 联网搜索中的 AI 气泡 -->
      <div v-if="searching" class="message assistant">
        <div v-if="!settings.hideAiAvatar" class="message-avatar">
          <img src="/xiyue.png" class="avatar-img" alt="AI" />
        </div>
        <div class="message-bubble">
          <div class="searching-line">
            <span>正在联网搜索…</span>
            <span class="searching-dots"><i></i><i></i><i></i></span>
          </div>
        </div>
      </div>

      <!-- 生图进行中的 AI 气泡 -->
      <div v-if="imageGenerating" class="message assistant">
        <div v-if="!settings.hideAiAvatar" class="message-avatar">
          <img src="/xiyue.png" class="avatar-img" alt="AI" />
        </div>
        <div class="message-bubble">
          <div class="searching-line">
            <span>正在生成图片…</span>
            <span class="searching-dots"><i></i><i></i><i></i></span>
          </div>
        </div>
      </div>

      </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick, onMounted, onUnmounted } from 'vue'
import MessageItem from './MessageItem.vue'
import { useSettingsStore } from '../../stores/settings'

const settings = useSettingsStore()

const props = defineProps({
  messages: { type: Array, default: () => [] },
  streamingContent: { type: String, default: '' },
  streamingThinking: { type: String, default: '' },
  streamingParts: { type: Array, default: () => [] },
  isLoading: { type: Boolean, default: false },
  searching: { type: Boolean, default: false },
  imageGenerating: { type: Boolean, default: false },
  highlightId: { type: String, default: '' },
})

const emit = defineEmits(['away-from-bottom'])

const listRef = ref(null)

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

// 定位到指定消息（搜索跳转）
function scrollToMessage(messageId) {
  if (!messageId) return
  nextTick(() => {
    const list = listRef.value
    const el = list?.querySelector(`[id="msg-${messageId}"]`)
    if (!el || !list) return
    const rect = el.getBoundingClientRect()
    const listRect = list.getBoundingClientRect()
    const top = list.scrollTop + (rect.top - listRect.top) - list.clientHeight / 2 + rect.height / 2
    list.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
  })
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
watch(() => props.streamingParts, scrollToBottom, { deep: true })
watch(() => props.searching, scrollToBottom)
watch(() => props.imageGenerating, scrollToBottom)
watch(() => props.isLoading, scrollToBottom, { immediate: true })

defineExpose({ scrollToBottom, scrollToTop, scrollToMessage })
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
  flex: 1;
  max-width: 100%;
  min-width: 0;
  line-height: 1.7;
  font-size: 14px;
  color: var(--text-primary);
}

/* 联网搜索提示 */
.searching-line {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  font-size: 14px;
  color: var(--text-secondary);
}
.searching-dots { display: inline-flex; gap: 4px; }
.searching-dots i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--text-muted);
  animation: searching-bounce 1.2s infinite ease-in-out both;
}
.searching-dots i:nth-child(2) { animation-delay: 0.15s; }
.searching-dots i:nth-child(3) { animation-delay: 0.3s; }
@keyframes searching-bounce {
  0%, 80%, 100% { opacity: 0.35; transform: translateY(0); }
  40% { opacity: 1; transform: translateY(-3px); }
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

</style>
