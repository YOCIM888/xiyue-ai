<template>
  <section class="starry-circle">
    <header class="circle-head">
      <div class="circle-title-wrap">
        <span class="circle-title">圈子</span>
        <span class="circle-sub">好友动态</span>
      </div>
      <div class="circle-actions">
        <ContextRing :used="contextUsed" :limit="contextLimit" />
        <button class="action-btn" :disabled="store.refreshing" title="刷新动态" @click="refresh">
          <svg :class="{ spinning: store.refreshing }" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
          <span>{{ store.refreshing ? '刷新中' : '刷新' }}</span>
        </button>
        <button class="action-btn danger" :disabled="!store.posts.length" title="清空圈子" @click="resetCircle">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          <span>重置</span>
        </button>
      </div>
    </header>

    <div ref="feedEl" class="circle-feed">
      <div v-if="store.refreshing" class="refreshing-card">
        <span class="dot"></span>
        <span class="dot"></span>
        <span class="dot"></span>
        <p>正在刷新好友动态…</p>
      </div>

      <div v-if="!store.posts.length && !store.refreshing" class="circle-empty">
        <div class="empty-icon">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 3l2 6.2 6.5.3-5.2 3.9 1.9 6.3-5.2-3.7-5.2 3.7 1.9-6.3-5.2-3.9 6.5-.3L12 3z"/></svg>
        </div>
        <p class="empty-title">圈子里还没有动态</p>
        <p class="empty-desc">点击「刷新」，看看好友们最近在想什么</p>
        <button class="empty-btn" @click="refresh">刷新动态</button>
      </div>

      <article v-for="post in store.posts" :key="post.id" class="post-card">
        <div class="post-head">
          <StarryAvatar :name="post.authorName" :src="avatarOf(post.authorId)" :size="38" />
          <div class="post-meta">
            <div class="post-author">{{ post.authorName }}</div>
            <div class="post-time">
              <span class="category">{{ post.category }}</span>
              <span>{{ fmtTime(post.ts) }}</span>
            </div>
          </div>
          <button class="delete-btn" title="删除这条动态" @click="deletePost(post)">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <p class="post-content">{{ post.content }}</p>

        <div v-if="post.tags?.length" class="post-tags">
          <span v-for="tag in post.tags" :key="tag" class="post-tag">#{{ tag }}</span>
        </div>

        <div class="post-actions">
          <button class="like-btn" :class="{ active: post.liked }" @click="store.toggleLike(post.id)">
            <svg width="16" height="16" viewBox="0 0 24 24" :fill="post.liked ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            <span>{{ post.likes || 0 }}</span>
          </button>
          <span class="comment-count">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
            {{ post.comments?.length || 0 }}
          </span>
        </div>

        <div class="comments">
          <div v-for="c in post.comments" :key="c.id" class="comment-item" :class="{ mine: c.isUser }">
            <StarryAvatar
              v-if="!c.isUser"
              :name="c.authorName"
              :src="avatarOf(c.authorId)"
              :size="24"
            />
            <div class="comment-body">
              <span class="comment-name">{{ c.isUser ? userName : c.authorName }}</span>
              <span class="comment-text">{{ c.content }}</span>
            </div>
          </div>

          <div v-if="store.replyingPostId === post.id" class="comment-replying">
            {{ post.authorName }} 正在回复…
          </div>

          <div class="comment-input">
            <input
              v-model="commentDraft[post.id]"
              type="text"
              :placeholder="`给 ${post.authorName} 留言…`"
              @keydown.enter.prevent="submitComment(post)"
            />
            <button
              class="comment-send"
              :disabled="!commentDraft[post.id]?.trim() || store.replyingPostId === post.id"
              @click="submitComment(post)"
            >发送</button>
          </div>
        </div>
      </article>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import StarryAvatar from './StarryAvatar.vue'
import { useStarryStore } from '../../stores/starry'
import { useStarryCircleStore } from '../../stores/starryCircle'
import { useSettingsStore } from '../../stores/settings'
import { useMemoryStore } from '../../stores/memory'
import { buildCircleMemoryContext } from '../../utils/memoryContext'
import { isApiConfigured } from '../../services/starry'
import { generateCirclePosts, generateAuthorReply } from '../../services/starryCircle'
import ContextRing from '../common/ContextRing.vue'
import { estimateTokens } from '../../utils/contextUsage'
import { collectRecentChatSeeds } from '../../utils/circleSeeds'

const store = useStarryCircleStore()
const starry = useStarryStore()
const settings = useSettingsStore()
const memory = useMemoryStore()

const feedEl = ref(null)
const commentDraft = ref({})

const userName = computed(() => settings.userName || '我')

// 圈子窗口积累的全部动态与评论（删帖 / 重置后会同步下降）
const contextUsed = computed(() => {
  const text = store.posts
    .map(p => [
      `【${p.authorName}｜${p.category}】`,
      p.content,
      ...(p.tags || []).map(t => `#${t}`),
      ...(p.comments || []).map(c => `${c.authorName}：${c.content}`),
    ].join('\n'))
    .join('\n\n')
  return estimateTokens(text)
})
const contextLimit = computed(() => settings.contextLength || 131072)

onMounted(() => {
  store.init()
})

function friendOf(id, name) {
  return starry.friends.find(f => f.id === id) || { id, name, avatar: '' }
}

function avatarOf(id) {
  return starry.friends.find(f => f.id === id)?.avatar || ''
}

function fmtTime(ts) {
  if (!ts) return ''
  const diff = Date.now() - ts
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  const d = new Date(ts)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

async function refresh() {
  if (store.refreshing) return
  if (!isApiConfigured(settings)) {
    window.__ui?.showToast('请先在设置中配置模型 API', 'info', 3000)
    return
  }
  if (!starry.friends.length) {
    window.__ui?.showToast('还没有好友，无法生成动态', 'info', 3000)
    return
  }

  store.setRefreshing(true)
  try {
    const count = 2 + Math.floor(Math.random() * 2)
    const seeds = collectRecentChatSeeds()
    const posts = await generateCirclePosts({
      friends: starry.friends,
      settings,
      count,
      seeds,
      existingPosts: store.posts,
      memoryContext: buildCircleMemoryContext(memory),
    })
    store.addPosts(posts)
    if (feedEl.value) feedEl.value.scrollTop = 0
    window.__ui?.showToast(`刷新了 ${posts.length} 条好友动态`, 'success', 2200)
  } catch (err) {
    window.__ui?.showToast(`刷新失败：${err.message || '请稍后重试'}`, 'error', 3500)
  } finally {
    store.setRefreshing(false)
  }
}

async function resetCircle() {
  if (!store.posts.length) return
  const ok = await window.__ui?.showConfirm('确定重置圈子吗？所有动态和评论都会被清空。', {
    confirmText: '重置',
    cancelText: '取消',
  })
  if (!ok) return
  store.clear()
  commentDraft.value = {}
  window.__ui?.showToast('圈子已重置', 'success')
}

async function deletePost(post) {
  const ok = await window.__ui?.showConfirm('确定删除这条动态吗？', {
    confirmText: '删除',
    cancelText: '取消',
  })
  if (!ok) return
  store.removePost(post.id)
}
async function submitComment(post) {
  const text = (commentDraft.value[post.id] || '').trim()
  if (!text || store.replyingPostId === post.id) return
  if (!isApiConfigured(settings)) {
    window.__ui?.showToast('请先在设置中配置模型 API', 'info', 3000)
    return
  }

  store.addComment(post.id, {
    id: `comment-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    authorId: 'me',
    authorName: userName.value,
    content: text.slice(0, 300),
    isUser: true,
    ts: Date.now(),
  })
  commentDraft.value[post.id] = ''

  const author = friendOf(post.authorId, post.authorName)
  store.setReplying(post.id)
  try {
    const reply = await generateAuthorReply({
      post,
      friend: author,
      userComment: text,
      userName: userName.value,
      settings,
      memoryContext: buildCircleMemoryContext(memory),
    })
    if (reply) {
      store.addComment(post.id, {
        id: `comment-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        authorId: post.authorId,
        authorName: post.authorName,
        content: reply,
        isUser: false,
        ts: Date.now(),
      })
    }
  } catch (err) {
    window.__ui?.showToast(`回复失败：${err.message || '请稍后重试'}`, 'error', 3500)
  } finally {
    store.setReplying('')
  }
}
</script>

<style scoped>
.starry-circle {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
}
.circle-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 18px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}
.circle-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}
.circle-sub {
  font-size: 11px;
  color: var(--text-muted);
  margin-left: 8px;
}
.circle-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 4px;
}
.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 9px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.15s;
}
.action-btn:hover:not(:disabled) {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.action-btn.danger:hover:not(:disabled) {
  color: var(--danger);
  border-color: var(--danger);
}
.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.action-btn svg.spinning {
  animation: spin 0.9s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
.circle-feed {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px 18px 24px;
}
.refreshing-card {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 14px;
  margin-bottom: 12px;
  border: 1px solid var(--border-color);
  border-radius: 14px;
  background: var(--bg-sidebar);
  color: var(--text-muted);
  font-size: 12px;
}
.refreshing-card p {
  margin: 0 0 0 6px;
}
.refreshing-card .dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--accent);
  animation: blink 1s ease-in-out infinite;
}
.refreshing-card .dot:nth-child(2) { animation-delay: 0.2s; }
.refreshing-card .dot:nth-child(3) { animation-delay: 0.4s; }
@keyframes blink {
  0%, 100% { opacity: 0.25; }
  50% { opacity: 1; }
}
.circle-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 24px;
  text-align: center;
}
.empty-icon {
  width: 62px;
  height: 62px;
  border-radius: 50%;
  background: var(--accent-light);
  color: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 14px;
}
.empty-title {
  font-size: 14px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}
.empty-desc {
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 14px;
}
.empty-btn {
  padding: 7px 16px;
  border: none;
  border-radius: 9px;
  background: var(--accent);
  color: #fff;
  font-size: 12px;
  cursor: pointer;
}
.post-card {
  border: 1px solid var(--border-color);
  border-radius: 14px;
  background: var(--bg-primary);
  padding: 12px 14px 10px;
  margin-bottom: 12px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.03);
}
.post-head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.post-meta {
  flex: 1;
  min-width: 0;
}
.post-author {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.4;
}
.post-time {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.4;
}
.category {
  color: var(--accent);
  background: var(--accent-light);
  padding: 0 6px;
  border-radius: 6px;
  font-size: 10px;
}
.delete-btn {
  width: 26px;
  height: 26px;
  flex-shrink: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.delete-btn:hover {
  background: var(--bg-hover);
  color: var(--danger);
}
.post-content {
  margin: 10px 0 8px;
  font-size: 14px;
  line-height: 1.7;
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-word;
}
.post-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}
.post-tag {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--bg-sidebar);
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.5;
}
.post-actions {
  display: flex;
  align-items: center;
  gap: 14px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color);
}
.like-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 12px;
  cursor: pointer;
  padding: 3px 6px;
  border-radius: 7px;
}
.like-btn:hover {
  background: var(--bg-hover);
}
.like-btn.active {
  color: #ef4444;
}
.comment-count {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--text-muted);
  font-size: 12px;
}
.comments {
  margin-top: 8px;
}
.comment-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 4px 0;
}
.comment-item.mine .comment-body {
  background: var(--accent-light);
  border-radius: 8px;
  padding: 4px 8px;
}
.comment-body {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  line-height: 1.6;
}
.comment-name {
  color: var(--accent);
  margin-right: 6px;
  font-weight: 500;
}
.comment-item.mine .comment-name {
  color: var(--text-primary);
}
.comment-text {
  color: var(--text-secondary);
  word-break: break-word;
}
.comment-replying {
  font-size: 11px;
  color: var(--text-muted);
  padding: 2px 0 4px 32px;
}
.comment-input {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px dashed var(--border-color);
}
.comment-input input {
  flex: 1;
  min-width: 0;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: 12px;
  font-family: inherit;
  padding: 6px 9px;
  outline: none;
}
.comment-input input:focus {
  border-color: var(--accent);
}
.comment-send {
  flex-shrink: 0;
  border: none;
  border-radius: 7px;
  background: var(--accent);
  color: #fff;
  font-size: 11px;
  padding: 6px 10px;
  cursor: pointer;
}
.comment-send:disabled {
  background: var(--bg-hover);
  color: var(--text-muted);
  cursor: not-allowed;
}

@media (max-width: 768px) {
  .circle-feed {
    padding: 10px 12px 20px;
  }
  .circle-head {
    padding: 10px 12px;
  }
}
</style>
