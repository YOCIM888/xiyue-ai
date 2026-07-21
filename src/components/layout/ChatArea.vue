<template>
  <div class="chat-area"
    :style="{ backgroundImage: bgImage ? `url(${bgImage})` : undefined }"
    @contextmenu.prevent="onBgContextMenu"
    @touchstart="onBgTouchStart"
    @touchend="onBgTouchEnd"
    @touchmove="onBgTouchMove"
  >
    <WelcomeScreen v-if="messages.length === 0 && !chatStore.streamingContent && !chatStore.isLoading" @send="handleSend" />
    <MessageList
      v-else
      :messages="messages"
      :streamingContent="chatStore.streamingContent"
      :streamingThinking="chatStore.streamingThinking"
      :isLoading="chatStore.isLoading"
    />
    <ChatInput
      :isLoading="chatStore.isLoading"
      @send="handleSend"
      @stop="chatStore.stopGeneration()"
    />
  </div>
</template>

<script setup>
import { watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useChatStore } from '../../stores/chat'
import { useTopicsStore } from '../../stores/topics'
import { useSettingsStore } from '../../stores/settings'
import MessageList from '../chat/MessageList.vue'
import ChatInput from '../chat/ChatInput.vue'
import WelcomeScreen from '../chat/WelcomeScreen.vue'
import { computed } from 'vue'

const route = useRoute()
const chatStore = useChatStore()
const topicsStore = useTopicsStore()
const settings = useSettingsStore()

const props = defineProps({ id: { type: String, default: null } })
const topicId = computed(() => props.id || route.params.id)
const messages = computed(() => chatStore.messages)
const bgImage = computed(() => settings.backgroundImage)

function handleSend(content) {
  chatStore.sendMessage(content)
}

// 背景图片设置
let bgLongPressTimer = null
let bgTriggered = false
function onBgTouchStart(e) {
  bgTriggered = false
  if (e.target.closest('.message-item, .chat-input-container, .btn-tool, button')) return
  bgLongPressTimer = setTimeout(async () => {
    bgTriggered = true
    const items = [
      { label: '设置背景图片', action: () => triggerBgUpload() },
    ]
    if (settings.backgroundImage) {
      items.push({ label: '清除背景图片', action: () => settings.backgroundImage = '' })
    }
    await window.__ui?.showMenu(e.touches[0].clientX, e.touches[0].clientY, items)
  }, 600)
}
function onBgTouchEnd() { clearTimeout(bgLongPressTimer) }
function onBgTouchMove() { clearTimeout(bgLongPressTimer) }
function onBgContextMenu(e) {
  if (e.target.closest('.message-item, .chat-input-container, button')) return
  const items = [
    { label: '设置背景图片', action: () => triggerBgUpload() },
  ]
  if (settings.backgroundImage) {
    items.push({ label: '清除背景图片', action: () => settings.backgroundImage = '' })
  }
  window.__ui?.showMenu(e.clientX, e.clientY, items)
}

function triggerBgUpload() {
  const inp = document.createElement('input')
  inp.type = 'file'
  inp.accept = 'image/*'
  inp.onchange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = Math.min(img.width, 1920)
        canvas.height = Math.min(img.height, 1080)
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        settings.backgroundImage = canvas.toDataURL('image/jpeg', 0.7)
        window.__ui?.showToast('背景图片已设置', 'success')
      }
      img.src = ev.target.result
    }
    reader.readAsDataURL(file)
  }
  inp.click()
}

onMounted(() => {
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
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
}
</style>
