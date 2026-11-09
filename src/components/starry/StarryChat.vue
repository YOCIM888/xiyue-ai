<template>
  <section class="starry-chat">
    <header class="chat-head">
      <button class="head-icon-btn back-btn" title="返回列表" @click="$emit('back')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
      </button>

      <StarryAvatar
        :group="type === 'group'"
        :name="chat.name"
        :src="type === 'friend' ? chat.avatar : ''"
        :size="38"
      />

      <div class="head-info">
        <div class="head-name">{{ chat.name }}</div>
        <div class="head-sub" :class="{ typing: typingVisible }">{{ subtitle }}</div>
      </div>

      <button class="head-icon-btn" title="搜索当前聊天" @click="toggleSearch">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      </button>

      <button v-if="type === 'group'" class="head-icon-btn" title="群成员" @click="$emit('open-group', chat)">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
      </button>

      <button class="head-icon-btn" title="更多" @click="openMenu">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="19" cy="12" r="1.7" /></svg>
      </button>
    </header>

    <div v-if="searchOpen" class="chat-search">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input v-model="searchQuery" type="text" placeholder="搜索当前聊天…" />
      <span v-if="searchQuery" class="chat-search-count">{{ displayedMessages.length }} 条</span>
      <button class="chat-search-close" title="关闭搜索" @click="closeSearch">×</button>
    </div>

    <div ref="messagesEl" class="messages">
      <div v-if="store.hasOlder" class="load-older">
        <button :disabled="store.olderLoading" @click="loadOlder">
          {{ store.olderLoading ? '加载中…' : '加载更早的消息' }}
        </button>
      </div>

      <div v-if="!searchQuery && displayedMessages.length === 0 && !typingVisible" class="chat-empty">
        <div class="empty-star">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.2l5.9-.9L12 3z" /></svg>
        </div>
        <p class="empty-title">{{ emptyTitle }}</p>
        <p class="empty-desc">{{ emptyDesc }}</p>
      </div>

      <div v-if="searchQuery && displayedMessages.length === 0" class="chat-empty">
        <p class="empty-title">没有找到相关消息</p>
        <p class="empty-desc">换个关键词试试</p>
      </div>

      <template v-for="(m, i) in displayedMessages" :key="m.id">
        <div v-if="showDivider(i)" class="time-divider">
          <span>{{ fmtDivider(m.ts) }}</span>
        </div>

        <div class="message-row" :class="{ mine: m.role === 'user' }">
          <StarryAvatar
            v-if="m.role === 'user'"
            :name="userName"
            :src="settings.userAvatar"
            :size="36"
          />
          <StarryAvatar
            v-else
            :name="m.senderName"
            :src="senderAvatar(m)"
            :size="36"
          />

          <div class="bubble-wrap">
            <div v-if="type === 'group' && m.role !== 'user'" class="sender-name">
              {{ m.senderName }}
            </div>
            <div v-if="m.quote" class="bubble-quote">
              <span class="bq-name">{{ m.quote.senderName }}</span>
              <span class="bq-text">{{ m.quote.content }}</span>
            </div>
            <div v-if="m.images?.length" class="bubble-images">
              <img
                v-for="(img, idx) in m.images"
                :key="idx"
                :src="img"
                class="bubble-img"
                alt="图片"
              />
            </div>
            <div v-if="m.content" class="bubble">{{ m.content }}</div>
            <div class="bubble-time">{{ fmtClock(m.ts) }}</div>
            <div class="msg-actions">
              <button title="复制" @click.stop="copyMessage(m)">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              </button>
              <button title="引用" @click.stop="quoteMessage(m)">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
              </button>
              <button title="删除" @click.stop="removeMessage(m)">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
            </div>
          </div>
        </div>
      </template>

      <div v-if="typingVisible" class="message-row typing-row">
        <StarryAvatar :name="store.typingName" :src="typingAvatar" :size="36" />
        <div class="bubble-wrap">
          <div v-if="type === 'group'" class="sender-name">{{ store.typingName }} 正在输入…</div>
          <div class="bubble typing-bubble">
            <span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>
          </div>
        </div>
      </div>
    </div>

    <footer class="composer">
      <div v-if="quotedMessage" class="quote-preview">
        <div class="quote-preview-body">
          <b>引用 {{ quotedMessage.senderName }}</b>
          <span>{{ quotedMessage.content }}</span>
        </div>
        <button title="取消引用" @click="quotedMessage = null">×</button>
      </div>

      <div v-if="pendingImages.length" class="pending-images">
        <div v-for="(img, i) in pendingImages" :key="i" class="pending-img">
          <img :src="img" alt="待发送图片" />
          <button class="pending-remove" title="移除图片" @click="pendingImages.splice(i, 1)">×</button>
        </div>
      </div>

      <div class="composer-card">
        <div class="composer-top">
          <textarea
            ref="inputEl"
            v-model="input"
            class="composer-input"
            :placeholder="placeholder"
            :disabled="store.sending"
            rows="1"
            @keydown="onKeydown"
            @input="autoResize"
          ></textarea>
          <button
            v-if="store.sending"
            class="send-btn stop"
            title="停止生成"
            @click="stopGenerating()"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2" /></svg>
          </button>
          <button
            v-else
            class="send-btn"
            :class="{ disabled: !canSend }"
            :disabled="!canSend"
            title="发送"
            @click="send"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
          </button>
        </div>

        <div class="composer-tools">
          <button class="tool-btn" :disabled="store.sending" title="发送图片" @click="triggerImageUpload">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            <span>图片</span>
          </button>
          <input ref="imageInput" type="file" accept="image/*" style="display: none" @change="onImagePicked" />
          <button v-if="type === 'group'" class="tool-btn mention-btn" :disabled="store.sending" title="点名群成员" @click="openMentionMenu">
            <span>@</span>
            <span>点名</span>
          </button>
          <ContextRing class="composer-ctx" :used="contextUsed" :limit="contextLimit" align="right" pop-direction="up" :size="22" />
        </div>
      </div>
    </footer>
  </section>
</template>

<script setup>
import { computed, nextTick, ref, watch, onUnmounted } from 'vue'
import StarryAvatar from './StarryAvatar.vue'
import { useStarryStore } from '../../stores/starry'
import { useSettingsStore } from '../../stores/settings'
import { useMemoryStore } from '../../stores/memory'
import { buildCharacterMemoryContext } from '../../utils/memoryContext'
import { compressImageDataUrl } from '../../utils/image'
import { generateCharacterReply, isApiConfigured, selectRepliers, buildSystemPrompt, buildHistory } from '../../services/starry'
import ContextRing from '../common/ContextRing.vue'
import { estimateMessagesTokens } from '../../utils/contextUsage'

const props = defineProps({
  type: { type: String, required: true },
  chat: { type: Object, required: true },
})

const emit = defineEmits(['back', 'open-friend', 'open-group', 'deleted'])

const store = useStarryStore()
const settings = useSettingsStore()
const memory = useMemoryStore()

function memoryContextFor(friend, group = null) {
  const chatId = group ? group.id : friend.id
  const list = store.getMessages(chatId)
  const userMessages = list.filter(m => m.role === 'user' && m.content)
  let relation = ''
  if (userMessages.length) {
    const count = userMessages.length
    const level = count >= 60 ? '很熟悉' : count >= 20 ? '比较熟悉' : count >= 5 ? '逐渐熟悉' : '刚刚认识'
    const topics = userMessages
      .slice(-5)
      .map(m => String(m.content).replace(/\s+/g, ' ').slice(0, 30))
      .join('；')
    relation = `【关系状态】\n你与用户已经进行了约 ${count} 轮对话，关系${level}。最近聊到：${topics}。请自然延续，不要生硬复述。`
  }
  return [relation, buildCharacterMemoryContext({ friend, group, memoryStore: memory, starryStore: store })]
    .filter(Boolean)
    .join('\n\n')
}

const messagesEl = ref(null)
const inputEl = ref(null)
const imageInput = ref(null)
const input = ref('')
const pendingImages = ref([])

const messages = computed(() => store.messages)
const userName = computed(() => settings.userName || '我')
const searchOpen = ref(false)
const searchQuery = ref('')
const quotedMessage = ref(null)

const displayedMessages = computed(() => {
  const needle = searchQuery.value.trim().toLowerCase()
  if (!needle) return messages.value
  return messages.value.filter(message =>
    String(message.content || '').toLowerCase().includes(needle) ||
    String(message.senderName || '').toLowerCase().includes(needle)
  )
})

// 当前窗口实际会发送的上下文（角色设定 + 最近聊天记录）
const contextUsed = computed(() => {
  if (props.type === 'group') {
    const memberId = (props.chat.members || [])[0]
    const member =
      store.friends.find(f => f.id === memberId) ||
      { id: memberId || 'member', name: props.chat.name, persona: '' }
    return estimateMessagesTokens([
      { role: 'system', content: buildSystemPrompt(member, props.chat, memoryContextFor(member, props.chat), settings.starryReplyLength) },
      ...buildHistory(member.id, messages.value),
    ])
  }
  const memoryContext = memoryContextFor(props.chat)
  return estimateMessagesTokens([
    { role: 'system', content: buildSystemPrompt(props.chat, null, memoryContext, settings.starryReplyLength) },
    ...buildHistory(props.chat.id, messages.value),
  ])
})
const contextLimit = computed(() => settings.contextLength || 131072)

const typingVisible = computed(() =>
  store.sending && store.typingName && store.generatingChatId === props.chat.id
)

const subtitle = computed(() => {
  if (typingVisible.value) return `${store.typingName} 正在输入…`
  if (props.type === 'group') return `${props.chat.members.length + 1} 人`
  return '在线'
})

const placeholder = computed(() => {
  if (typingVisible.value) return '对方正在输入…'
  return props.type === 'group' ? '发消息…（输入 @ 可点名）' : '发消息…'
})

const canSend = computed(() =>
  (input.value.trim().length > 0 || pendingImages.value.length > 0) && !store.sending
)

const emptyTitle = computed(() =>
  props.type === 'group' ? `在「${props.chat.name}」聊聊吧` : `和${props.chat.name}聊聊吧`
)
const emptyDesc = computed(() =>
  props.type === 'group' && props.chat.members.length === 0
    ? '群聊暂无其他成员，可在右上角管理群成员'
    : '说点什么，让星光有回应'
)

const typingAvatar = computed(() =>
  store.friends.find(f => f.name === store.typingName)?.avatar || ''
)

const MOBILE_UA = /Android|iPhone|iPad|iPod|webOS/i.test(navigator.userAgent)
const MAX_PENDING_IMAGES = 3

function senderAvatar(m) {
  if (m.role !== 'character') return ''
  return store.friends.find(f => f.id === m.senderId)?.avatar || ''
}

function pad(n) { return String(n).padStart(2, '0') }

function fmtClock(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fmtDivider(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const now = new Date()
  const clock = fmtClock(ts)
  if (d.toDateString() === now.toDateString()) return clock
  if (d.getFullYear() === now.getFullYear()) {
    return `${d.getMonth() + 1}月${d.getDate()}日 ${clock}`
  }
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${clock}`
}

const GAP = 5 * 60 * 1000
function showDivider(i) {
  if (i === 0) return true
  const prev = displayedMessages.value[i - 1]
  const cur = displayedMessages.value[i]
  return (cur.ts || 0) - (prev.ts || 0) > GAP
}

function scrollToBottom() {
  nextTick(() => {
    const el = messagesEl.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

async function loadOlder() {
  const el = messagesEl.value
  const prevHeight = el?.scrollHeight || 0
  const prevTop = el?.scrollTop || 0
  const added = store.loadOlderMessages()
  if (!added) return
  await nextTick()
  if (el) el.scrollTop = el.scrollHeight - prevHeight + prevTop
}

function toggleSearch() {
  searchOpen.value = !searchOpen.value
  if (!searchOpen.value) searchQuery.value = ''
}

function closeSearch() {
  searchOpen.value = false
  searchQuery.value = ''
}

async function copyMessage(message) {
  const text = String(message.content || '')
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    window.__ui?.showToast('已复制', 'success', 1600)
  } catch {
    window.__ui?.showToast('复制失败', 'error', 2000)
  }
}

function quoteMessage(message) {
  quotedMessage.value = {
    senderName: message.role === 'user' ? (settings.userName || '我') : (message.senderName || props.chat.name),
    content: String(message.content || '').slice(0, 120),
  }
  nextTick(() => inputEl.value?.focus())
}

async function removeMessage(message) {
  const ok = await window.__ui?.showConfirm('删除这条消息？此操作不可撤销。', {
    confirmText: '删除',
    cancelText: '取消',
  })
  if (!ok) return
  const removed = store.deleteMessage(message.id, props.chat.id)
  if (removed) window.__ui?.showToast('消息已删除', 'success', 1800)
}

function exportChat() {
  const list = store.getAllMessages(props.chat.id)
  if (!list.length) {
    window.__ui?.showToast('当前会话没有可导出的内容', 'info', 2500)
    return
  }
  const lines = [
    `# ${props.chat.name}`,
    '',
    `> 导出时间：${new Date().toLocaleString()} · 探索星空`,
    '',
  ]
  for (const message of list) {
    const name = message.role === 'user' ? (settings.userName || '我') : (message.senderName || props.chat.name)
    if (message.quote) lines.push(`> 引用 ${message.quote.senderName}：${message.quote.content}`)
    lines.push(`**${name}**：${message.content || (message.images?.length ? '[图片]' : '')}`)
    lines.push('')
  }
  const safeName = String(props.chat.name || '星空聊天').replace(/[\\/:*?"<>|]/g, '_').slice(0, 50)
  const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${safeName}-${new Date().toISOString().slice(0, 10)}.md`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  window.__ui?.showToast('聊天记录已导出', 'success', 2000)
}

function openMentionMenu(e) {
  const members = (props.chat.members || [])
    .map(id => store.friends.find(friend => friend.id === id))
    .filter(Boolean)
  if (!members.length) {
    window.__ui?.showToast('群聊暂无其他成员', 'info', 2500)
    return
  }
  const rect = e.currentTarget.getBoundingClientRect()
  window.__ui?.showMenu(
    Math.max(12, rect.left - 80),
    rect.bottom + 6,
    members.map(friend => ({
      label: friend.name,
      action: () => {
        const text = input.value
        input.value = text ? `${text.replace(/\s+$/, '')} @${friend.name} ` : `@${friend.name} `
        nextTick(() => {
          inputEl.value?.focus()
          const length = input.value.length
          inputEl.value?.setSelectionRange(length, length)
          autoResize()
        })
      },
    }))
  )
}

watch(messages, () => scrollToBottom(), { deep: true })
watch(() => store.typingName, () => scrollToBottom())
watch(() => props.chat.id, () => {
  stopGenerating(true)
  input.value = ''
  pendingImages.value = []
  quotedMessage.value = null
  closeSearch()
  scrollToBottom()
})

onUnmounted(() => stopGenerating(true))

let activeAbort = null

function stopGenerating(silent = false) {
  if (activeAbort) {
    activeAbort.abort()
    activeAbort = null
  }
  store.resetRuntime()
  if (!silent) window.__ui?.showToast('已停止生成', 'info', 2000)
}

async function generateWithRetry(options, retries = 1) {
  let lastError
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await generateCharacterReply(options)
    } catch (err) {
      if (err?.name === 'AbortError') throw err
      lastError = err
      if (attempt < retries) await delay(600 + Math.random() * 400)
    }
  }
  throw lastError
}

function autoResize() {
  nextTick(() => {
    const el = inputEl.value
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  })
}

function onKeydown(e) {
  if (e.key !== 'Enter') return
  // 中文输入法候选确认时的 Enter 不当作发送
  if (e.isComposing || e.keyCode === 229) return
  // 手机端：Enter 只换行
  if (MOBILE_UA || window.innerWidth <= 768) return
  // 桌面端：Enter 发送，Shift+Enter 换行
  if (!e.shiftKey) {
    e.preventDefault()
    send()
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ---- 图片发送 ----
function triggerImageUpload() {
  imageInput.value?.click()
}

function onImagePicked(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file || !file.type.startsWith('image/')) return
  if (pendingImages.value.length >= MAX_PENDING_IMAGES) {
    window.__ui?.showToast(`单次最多发送 ${MAX_PENDING_IMAGES} 张图片`, 'info', 2600)
    return
  }

  const reader = new FileReader()
  reader.onload = async (ev) => {
    let dataUrl = await compressImageDataUrl(ev.target.result, {
      maxWidth: 1024,
      maxHeight: 1024,
      quality: 0.78,
      maxBytes: 800000,
    })
    if (dataUrl && dataUrl.length > 1200000) {
      dataUrl = await compressImageDataUrl(dataUrl, {
        maxWidth: 720,
        maxHeight: 720,
        quality: 0.68,
        maxBytes: 600000,
      })
    }
    if (!dataUrl) {
      window.__ui?.showToast('图片读取失败或体积过大，请换一张试试', 'error', 3000)
      return
    }
    if (pendingImages.value.length >= MAX_PENDING_IMAGES) {
      window.__ui?.showToast(`单次最多发送 ${MAX_PENDING_IMAGES} 张图片`, 'info', 2600)
      return
    }
    pendingImages.value.push(dataUrl)
  }
  reader.onerror = () => window.__ui?.showToast('图片读取失败，请换一张试试', 'error', 3000)
  reader.readAsDataURL(file)
}

async function send() {
  if (!canSend.value) return
  if (!isApiConfigured(settings)) {
    window.__ui?.showToast('请先在设置中配置模型 API', 'info', 3000)
    return
  }

  const text = input.value.trim()
  const images = pendingImages.value.slice(0, MAX_PENDING_IMAGES)
  const quote = quotedMessage.value ? { ...quotedMessage.value } : null
  const targetId = props.chat.id
  const targetType = props.type
  const targetChat = { ...props.chat }
  const senderName = settings.userName || '我'

  input.value = ''
  pendingImages.value = []
  quotedMessage.value = null
  nextTick(autoResize)

  store.appendMessage({
    role: 'user',
    senderId: 'me',
    senderName,
    content: text,
    ...(images.length ? { images } : {}),
    ...(quote ? { quote } : {}),
    ts: Date.now(),
  }, targetId)

  const controller = new AbortController()
  activeAbort = controller
  store.sending = true
  store.generatingChatId = targetId

  try {
    if (targetType === 'friend') {
      store.typingName = targetChat.name
      const replyPromise = generateWithRetry({
        friend: targetChat,
        messages: store.getMessages(targetId),
        settings,
        memoryContext: memoryContextFor(targetChat),
        signal: controller.signal,
      }, 1)
        .then(reply => ({ reply }))
        .catch(error => ({ error }))
      await delay(300 + Math.random() * 300)
      const outcome = await replyPromise
      if (outcome.error) throw outcome.error
      const reply = outcome.reply
      if (controller.signal.aborted) return
      store.appendMessage({
        role: 'character',
        senderId: targetChat.id,
        senderName: targetChat.name,
        content: reply,
        ts: Date.now(),
      }, targetId)
      return
    }

    const members = targetChat.members
      .map(id => store.friends.find(f => f.id === id))
      .filter(Boolean)

    if (!members.length) {
      window.__ui?.showToast('群聊暂无其他成员，可先添加成员', 'info', 2800)
      return
    }

    // @ 点名只让被点名者回复；普通消息优先相关角色，最多随机 3 位
    const mentions = members
      .filter(friend => text.includes(`@${friend.name}`))
      .map(friend => friend.id)
    const activityMax = settings.starryActivity === 'low' ? 1 : settings.starryActivity === 'high' ? 3 : 2
    const repliers = selectRepliers(members, { mentions, text, max: activityMax })
    if (!repliers.length) return

    store.typingName = repliers.length > 1
      ? `${repliers[0].name} 等 ${repliers.length} 人`
      : repliers[0].name
    if (controller.signal.aborted) return

    // 并行发起请求，按返回顺序错峰展示，避免串行等待
    const tasks = repliers.map(friend =>
      generateWithRetry({
        friend,
        group: targetChat,
        messages: store.getMessages(targetId),
        settings,
        memoryContext: memoryContextFor(friend, targetChat),
        signal: controller.signal,
      }, 1)
        .then(reply => ({ friend, reply }))
        .catch(error => ({ friend, error }))
    )

    await delay(250 + Math.random() * 250)
    for (let i = 0; i < tasks.length; i += 1) {
      const outcome = await tasks[i]
      if (controller.signal.aborted) break
      if (outcome.error) {
        if (outcome.error.name !== 'AbortError') {
          window.__ui?.showToast(`${outcome.friend.name} 回复失败：${outcome.error.message || '请稍后重试'}`, 'error', 3500)
        }
        continue
      }

      store.typingName = outcome.friend.name
      await delay(250 + Math.random() * 300)
      if (controller.signal.aborted) break
      store.appendMessage({
        role: 'character',
        senderId: outcome.friend.id,
        senderName: outcome.friend.name,
        content: outcome.reply,
        ts: Date.now(),
      }, targetId)
    }
  } catch (err) {
    if (err?.name !== 'AbortError') {
      window.__ui?.showToast(`回复失败：${err.message}`, 'error', 3500)
    }
  } finally {
    if (activeAbort === controller) activeAbort = null
    store.resetRuntime()
  }
}

function openMenu(e) {
  const rect = e.currentTarget.getBoundingClientRect()
  const x = Math.max(12, rect.right - 180)
  const y = rect.bottom + 6
  if (props.type === 'friend') {
    window.__ui?.showMenu(x, y, [
      { label: '编辑资料', action: () => emit('open-friend', props.chat) },
      { label: '导出聊天记录', action: exportChat },
      { label: '清空聊天记录', action: clearChat },
      { label: '删除好友', action: deleteFriend },
    ])
  } else {
    window.__ui?.showMenu(x, y, [
      { label: '群成员管理', action: () => emit('open-group', props.chat) },
      { label: '导出聊天记录', action: exportChat },
      { label: '清空聊天记录', action: clearChat },
      { label: '删除群聊', action: deleteGroup },
    ])
  }
}

async function clearChat() {
  const ok = await window.__ui?.showConfirm('清空聊天记录后无法恢复，也不会再记得之前的对话，确定吗？')
  if (!ok) return
  store.clearChat(props.type, props.chat.id)
  window.__ui?.showToast('聊天记录已清空', 'success')
  scrollToBottom()
}

async function deleteFriend() {
  const ok = await window.__ui?.showConfirm('删除好友后，与她的聊天记录也会一起删除，确定吗？', { confirmText: '删除' })
  if (!ok) return
  store.removeFriend(props.chat.id)
  emit('deleted')
  window.__ui?.showToast('好友已删除', 'success')
}

async function deleteGroup() {
  const ok = await window.__ui?.showConfirm('删除群聊后，群内的聊天记录也会一起删除，确定吗？', { confirmText: '删除' })
  if (!ok) return
  store.removeGroup(props.chat.id)
  emit('deleted')
  window.__ui?.showToast('群聊已删除', 'success')
}
</script>

<style scoped>
.starry-chat {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
}

/* 头部 */
.chat-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
  background: var(--bg-primary);
}
.head-icon-btn {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
}
.head-icon-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.back-btn {
  display: none;
}
.head-info {
  flex: 1;
  min-width: 0;
}
.head-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.head-sub {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 1px;
}
.head-sub.typing {
  color: var(--accent);
}

/* 消息区 */
.messages {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: none;
  padding: 16px 20px 10px;
}

.chat-search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-primary);
  flex-shrink: 0;
  color: var(--text-muted);
}
.chat-search input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  color: var(--text-primary);
  font-size: 12px;
  font-family: inherit;
  outline: none;
}
.chat-search-count { font-size: 11px; color: var(--text-muted); white-space: nowrap; }
.chat-search-close {
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 15px;
  cursor: pointer;
}

.msg-actions {
  display: flex;
  gap: 2px;
  margin-top: 4px;
  opacity: 0;
  transition: opacity 0.15s;
}
.message-row:hover .msg-actions { opacity: 1; }
.msg-actions button {
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.msg-actions button:hover { background: var(--bg-hover); color: var(--text-primary); }

.bubble-quote {
  margin-bottom: 5px;
  padding: 5px 8px;
  border-left: 2px solid var(--accent);
  border-radius: 4px;
  background: var(--bg-hover);
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-secondary);
  max-width: 260px;
}
.bq-name { color: var(--accent); font-weight: 600; margin-right: 6px; }
.bq-text {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.quote-preview {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 6px;
  padding: 7px 10px;
  border-left: 2px solid var(--accent);
  border-radius: 6px;
  background: var(--bg-hover);
}
.quote-preview-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 11px;
  color: var(--text-secondary);
}
.quote-preview-body b { color: var(--accent); font-size: 11px; }
.quote-preview-body span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.quote-preview > button {
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 14px;
}
.mention-btn span:first-child { font-weight: 700; }

@media (max-width: 768px) {
  .msg-actions { opacity: 0.55; }
}
.load-older {
  display: flex;
  justify-content: center;
  padding: 2px 0 10px;
}
.load-older button {
  padding: 5px 14px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--bg-card);
  color: var(--text-muted);
  font-size: 11px;
  font-family: inherit;
  cursor: pointer;
}
.load-older button:hover:not(:disabled) {
  color: var(--text-primary);
  background: var(--bg-hover);
}
.load-older button:disabled {
  opacity: 0.6;
  cursor: default;
}

.chat-empty {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  text-align: center;
  padding: 24px;
}
.empty-star {
  width: 58px;
  height: 58px;
  border-radius: 50%;
  background: var(--accent-light);
  color: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
}
.empty-title {
  font-size: 14px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}
.empty-desc {
  font-size: 12px;
}

.time-divider {
  display: flex;
  justify-content: center;
  margin: 10px 0 14px;
}
.time-divider span {
  font-size: 10.5px;
  color: var(--text-muted);
  background: var(--bg-sidebar);
  border-radius: 10px;
  padding: 2px 10px;
}

.message-row {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  margin-bottom: 16px;
}
.message-row.mine {
  flex-direction: row-reverse;
}
.bubble-wrap {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  max-width: min(72%, 560px);
}
.message-row.mine .bubble-wrap {
  align-items: flex-end;
}
.sender-name {
  font-size: 11px;
  color: var(--text-muted);
  margin: 0 4px 4px;
}
.bubble {
  padding: 9px 13px;
  border-radius: 4px 14px 14px 14px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  font-size: 14px;
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-word;
}
.message-row.mine .bubble {
  background: #95ec69;
  border-color: #86d95f;
  color: #17301a;
  border-radius: 14px 4px 14px 14px;
}
.bubble-time {
  font-size: 10px;
  color: var(--text-muted);
  margin: 4px 3px 0;
}

.typing-bubble {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 12px 14px;
}
.typing-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-muted);
  animation: typing-bounce 1.2s infinite ease-in-out;
}
.typing-dot:nth-child(2) { animation-delay: 0.15s; }
.typing-dot:nth-child(3) { animation-delay: 0.3s; }
@keyframes typing-bounce {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.5; }
  30% { transform: translateY(-4px); opacity: 1; }
}

/* 图片消息 */
.bubble-images {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 6px;
}
.bubble-img {
  max-width: 200px;
  max-height: 250px;
  border-radius: 12px;
  object-fit: cover;
  border: 1px solid var(--border-color);
  display: block;
}

/* 输入区 */
.composer {
  padding: 8px 16px 14px;
  border-top: 1px solid var(--border-color);
  flex-shrink: 0;
  background: var(--bg-primary);
}
.pending-images {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}
.pending-img {
  position: relative;
  width: 64px;
  height: 64px;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid var(--border-color);
  background: var(--bg-sidebar);
}
.pending-img img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.pending-remove {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.composer-card {
  background: var(--bg-input);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 8px 10px 6px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
  transition: border-color 0.15s, box-shadow 0.15s;
}
.composer-card:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-shadow);
}
.composer-top {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}
.composer-input {
  flex: 1;
  min-width: 0;
  min-height: 32px;
  max-height: 120px;
  padding: 4px;
  border: none;
  background: transparent;
  color: var(--text-primary);
  font-size: 14px;
  line-height: 1.6;
  font-family: inherit;
  resize: none;
  outline: none;
}
.composer-input::placeholder {
  color: var(--text-muted);
}
.send-btn {
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  border: none;
  border-radius: 50%;
  background: var(--accent);
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}
.send-btn:hover:not(.disabled) {
  background: var(--accent-hover);
}
.send-btn.stop {
  background: var(--danger);
}
.send-btn.stop:hover {
  background: var(--danger);
  opacity: 0.88;
}
.send-btn.disabled {
  background: var(--bg-hover);
  color: var(--text-muted);
  cursor: not-allowed;
}
.composer-tools {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid var(--border-color);
}
.composer-ctx {
  margin-left: auto;
  flex-shrink: 0;
}
.tool-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 9px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-muted);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.15s;
}
.tool-btn:hover:not(:disabled) {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.tool-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@media (max-width: 768px) {
  .chat-head {
    padding-left: 54px;
  }
  .back-btn {
    display: flex;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 1px solid var(--border-color);
    background: var(--bg-primary);
  }
  .messages {
    padding: 12px 12px 8px;
  }
  .bubble-wrap {
    max-width: 78%;
  }
  .composer {
    padding: 8px 10px 12px;
  }
}
</style>
