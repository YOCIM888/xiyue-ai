import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getItem, removeItem, setItem } from '../utils/kv'

const POSTS_KEY = 'xiyue_starry_circle_posts'
const MAX_POSTS = 60

function loadJSON(key, fallback) {
  try {
    const raw = getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

export const useStarryCircleStore = defineStore('starryCircle', () => {
  const posts = ref([])
  const refreshing = ref(false)
  const replyingPostId = ref('')

  function init() {
    posts.value = loadJSON(POSTS_KEY, [])
  }

  function persist() {
    try {
      setItem(POSTS_KEY, JSON.stringify(posts.value.slice(0, MAX_POSTS)))
    } catch {
      // 存储空间不足时忽略，页面内数据仍然可用
    }
  }

  function addPosts(items = []) {
    if (!items.length) return
    posts.value = [...items, ...posts.value].slice(0, MAX_POSTS)
    persist()
  }

  function removePost(id) {
    posts.value = posts.value.filter(p => p.id !== id)
    persist()
  }

  function clear() {
    posts.value = []
    try {
      removeItem(POSTS_KEY)
    } catch {
      // ignore
    }
  }

  function toggleLike(id) {
    const post = posts.value.find(p => p.id === id)
    if (!post) return
    post.liked = !post.liked
    post.likes = Math.max(0, (post.likes || 0) + (post.liked ? 1 : -1))
    persist()
  }

  function addComment(postId, comment) {
    const post = posts.value.find(p => p.id === postId)
    if (!post) return
    if (!post.comments) post.comments = []
    post.comments.push(comment)
    persist()
  }

  function setRefreshing(value) {
    refreshing.value = value
  }

  function setReplying(postId = '') {
    replyingPostId.value = postId
  }

  return {
    posts,
    refreshing,
    replyingPostId,
    init,
    addPosts,
    removePost,
    clear,
    toggleLike,
    addComment,
    setRefreshing,
    setReplying,
  }
})
