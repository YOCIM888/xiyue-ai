import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { loadTopics, saveTopics } from '../utils/storage'

let nextId = Date.now()

export const useTopicsStore = defineStore('topics', () => {
  const topics = ref(loadTopics() || [])
  const currentTopicId = ref(topics.value[0]?.id ?? null)

  const currentTopic = computed(() =>
    topics.value.find(t => t.id === currentTopicId.value) ?? null
  )

  const sortedTopics = computed(() =>
    [...topics.value].sort((a, b) => b.updatedAt - a.updatedAt)
  )

  function createTopic(title = '新对话') {
    const topic = {
      id: nextId++,
      title,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    topics.value.push(topic)
    currentTopicId.value = topic.id
    persist()
    return topic
  }

  function deleteTopic(id) {
    const idx = topics.value.findIndex(t => t.id === id)
    if (idx === -1) return
    topics.value.splice(idx, 1)
    // 清理该话题的消息
    localStorage.removeItem(`chat_messages_${id}`)
    if (currentTopicId.value === id) {
      currentTopicId.value = topics.value[0]?.id ?? null
    }
    persist()
  }

  function renameTopic(id, title) {
    const topic = topics.value.find(t => t.id === id)
    if (!topic) return
    topic.title = title
    persist()
  }

  function switchTopic(id) {
    currentTopicId.value = id
  }

  function touchTopic(id) {
    const topic = topics.value.find(t => t.id === id)
    if (!topic) return
    topic.updatedAt = Date.now()
    persist()
  }

  function ensureTopic() {
    if (!currentTopicId.value) {
      createTopic()
    }
  }

  function persist() {
    saveTopics(topics.value.map(t => ({
      id: t.id, title: t.title, createdAt: t.createdAt, updatedAt: t.updatedAt,
    })))
  }

  return {
    topics, currentTopicId, currentTopic, sortedTopics,
    createTopic, deleteTopic, renameTopic, switchTopic, touchTopic, ensureTopic,
  }
})
