<template>
  <div class="chat-area">
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

function handleSend(content) {
  chatStore.sendMessage(content)
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
}
</style>
