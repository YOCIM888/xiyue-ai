import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { KEYS, loadTopics, saveTopics } from '../utils/storage'
import { onRemoteKeyChange, removeItem } from '../utils/kv'
import { createThrottle } from '../services/tabSync'

let nextId = Date.now()

/** 挑最近改动的那个话题，初始化与跨标签同步后都要用同一套规则 */
function newestTopicId(list) {
  return list.length ? list.reduce((a, b) => (b.updatedAt > a.updatedAt ? b : a)).id : null
}

export const useTopicsStore = defineStore('topics', () => {
  const topics = ref(loadTopics() || [])
  // 默认进入最新对话
  const currentTopicId = ref(newestTopicId(topics.value))

  const currentTopic = computed(() =>
    topics.value.find(t => t.id === currentTopicId.value) ?? null
  )

  const sortedTopics = computed(() =>
    [...topics.value].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1
      if (!a.pinned && b.pinned) return 1
      return b.updatedAt - a.updatedAt
    })
  )

  function createTopic(title = '新对话') {
    const topic = {
      id: nextId++,
      title,
      pinned: false,
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
    // 清理该话题的消息（v2 会话数据；旧键一并清掉）
    removeItem(`chat_messages_${id}`)
    removeItem(`chat_conv_v2_${id}`)
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

  function togglePin(id) {
    const topic = topics.value.find(t => t.id === id)
    if (!topic) return
    topic.pinned = !topic.pinned
    persist()
  }

  function persist() {
    saveTopics(topics.value.map(t => ({
      id: t.id, title: t.title, pinned: t.pinned, createdAt: t.createdAt, updatedAt: t.updatedAt,
    })))
  }

  // 别的标签改了会话列表就重新装载：persist 写的是整份数组，
  // 不跟着更新的话，本标签下一次改名/置顶就会用旧列表把对方的改动整份盖掉
  const notifyRemote = createThrottle(4000)
  onRemoteKeyChange((key, removed) => {
    if (key !== KEYS.TOPICS || removed) return
    const fresh = loadTopics() || []
    topics.value = fresh
    if (!fresh.some(t => t.id === currentTopicId.value)) currentTopicId.value = newestTopicId(fresh)
    if (notifyRemote()) window.__ui?.showToast('另一个标签页更新了会话列表，已同步到这里', 'info', 3600)
  })

  return {
    topics, currentTopicId, currentTopic, sortedTopics,
    createTopic, deleteTopic, renameTopic, switchTopic, touchTopic, ensureTopic, togglePin,
  }
})
