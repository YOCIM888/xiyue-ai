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

      <ContextRing :used="contextUsed" :limit="contextLimit" />

      <button class="head-icon-btn" title="更多" @click="openMenu">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="19" cy="12" r="1.7" /></svg>
      </button>
    </header>

    <div ref="messagesEl" class="messages">
      <div v-if="messages.length === 0 && !typingVisible" class="chat-empty">
        <div class="empty-star">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.2l5.9-.9L12 3z" /></svg>
        </div>
        <p class="empty-title">{{ emptyTitle }}</p>
        <p class="empty-desc">{{ emptyDesc }}</p>
      </div>

      <template v-for="(m, i) in messages" :key="m.id">
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
      <div v-if="pendingImages.length" class="pending-images">
        <div v-for="(img, i) in pendingImages" :key="i" class="pending-img">
          <img :src="img" alt="待发送图片" />
          <button class="pending-remove" title="移除图片" @click="pendingImages.splice(i, 1)">×</button>
        </div>
      </div>

      <div class="composer-card" :class="{ listening }">
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
          <button
            class="tool-btn voice-btn"
            :class="{ recording: listening }"
            :disabled="store.sending"
            :title="listening ? '停止语音输入' : '语音输入'"
            @click="toggleVoice"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
            <span>{{ listening ? '聆听中' : '语音' }}</span>
            <span v-if="listening" class="voice-wave"><i></i><i></i><i></i></span>
          </button>
        </div>
      </div>
    </footer>
  </section>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import StarryAvatar from './StarryAvatar.vue'
import { useStarryStore } from '../../stores/starry'
import { useSettingsStore } from '../../stores/settings'
import { useMemoryStore } from '../../stores/memory'
import { buildCharacterMemoryContext } from '../../utils/memoryContext'
import { useVoiceInput } from '../../composables/useVoiceInput'
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
  return buildCharacterMemoryContext({ friend, group, memoryStore: memory, starryStore: store })
}

const messagesEl = ref(null)
const inputEl = ref(null)
const imageInput = ref(null)
const input = ref('')
const pendingImages = ref([])

const { listening, toggle: toggleVoiceInput } = useVoiceInput({
  getBaseText: () => input.value,
  onUpdate: (text) => { input.value = text; autoResize() },
  onFinish: () => send(),
})

function toggleVoice() {
  if (store.sending) return
  toggleVoiceInput()
}

const messages = computed(() => store.messages)
const userName = computed(() => settings.userName || '我')

// 当前窗口实际会发送的上下文（角色设定 + 最近聊天记录）
const contextUsed = computed(() => {
  if (props.type === 'group') {
    const memberId = (props.chat.members || [])[0]
    const member =
      store.friends.find(f => f.id === memberId) ||
      { id: memberId || 'member', name: props.chat.name, persona: '' }
    return estimateMessagesTokens([
      { role: 'system', content: buildSystemPrompt(member, props.chat, memoryContextFor(member, props.chat)) },
      ...buildHistory(member.id, messages.value),
    ])
  }
  const memoryContext = memoryContextFor(props.chat)
  return estimateMessagesTokens([
    { role: 'system', content: buildSystemPrompt(props.chat, null, memoryContext) },
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
  return listening.value ? '正在聆听，说完会自动发送…' : '发消息…'
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

const isMobile = /Android|iPhone|iPad|iPod|webOS/i.test(navigator.userAgent) || window.innerWidth <= 768

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
  const prev = messages.value[i - 1]
  const cur = messages.value[i]
  return (cur.ts || 0) - (prev.ts || 0) > GAP
}

function scrollToBottom() {
  nextTick(() => {
    const el = messagesEl.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

watch(messages, () => scrollToBottom(), { deep: true })
watch(() => store.typingName, () => scrollToBottom())
watch(() => props.chat.id, () => {
  input.value = ''
  pendingImages.value = []
  scrollToBottom()
})

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
  if (isMobile) return
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

  const reader = new FileReader()
  reader.onload = (ev) => {
    const img = new Image()
    img.onload = () => {
      const maxSide = 1024
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
      if (scale === 1) {
        pendingImages.value.push(ev.target.result)
        return
      }
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      pendingImages.value.push(canvas.toDataURL('image/jpeg', 0.82))
    }
    img.onerror = () => window.__ui?.showToast('图片读取失败，请换一张试试', 'error', 3000)
    img.src = ev.target.result
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
  const images = pendingImages.value.slice()
  const targetId = props.chat.id
  const targetType = props.type
  const targetChat = { ...props.chat }
  const senderName = settings.userName || '我'

  input.value = ''
  pendingImages.value = []
  nextTick(autoResize)

  store.appendMessage({
    role: 'user',
    senderId: 'me',
    senderName,
    content: text,
    ...(images.length ? { images } : {}),
    ts: Date.now(),
  }, targetId)

  store.sending = true
  store.generatingChatId = targetId

  try {
    if (targetType === 'friend') {
      store.typingName = targetChat.name
      await delay(300 + Math.random() * 300)
      const reply = await generateCharacterReply({
        friend: targetChat,
        messages: store.getMessages(targetId),
        settings,
        memoryContext: memoryContextFor(targetChat),
      })
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

    const repliers = selectRepliers(members)
    for (const friend of repliers) {
      if (!store.friends.some(f => f.id === friend.id)) continue
      store.typingName = friend.name
      await delay(300 + Math.random() * 300)
      try {
        const reply = await generateCharacterReply({
          friend,
          group: targetChat,
          messages: store.getMessages(targetId),
          settings,
          memoryContext: memoryContextFor(friend, targetChat),
        })
        store.appendMessage({
          role: 'character',
          senderId: friend.id,
          senderName: friend.name,
          content: reply,
          ts: Date.now(),
        }, targetId)
      } catch (err) {
        window.__ui?.showToast(`${friend.name} 回复失败：${err.message}`, 'error', 3500)
      }
      await delay(200 + Math.random() * 200)
    }
  } catch (err) {
    window.__ui?.showToast(`回复失败：${err.message}`, 'error', 3500)
  } finally {
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
      { label: '清空聊天记录', action: clearChat },
      { label: '删除好友', action: deleteFriend },
    ])
  } else {
    window.__ui?.showMenu(x, y, [
      { label: '群成员管理', action: () => emit('open-group', props.chat) },
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
.composer-card:focus-within,
.composer-card.listening {
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
.voice-btn.recording {
  color: var(--accent);
  background: var(--accent-light);
}
.voice-wave {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin-left: 1px;
}
.voice-wave i {
  width: 2px;
  height: 5px;
  border-radius: 1px;
  background: currentColor;
  animation: voice-wave 0.9s ease-in-out infinite;
}
.voice-wave i:nth-child(2) { animation-delay: 0.15s; }
.voice-wave i:nth-child(3) { animation-delay: 0.3s; }
@keyframes voice-wave {
  0%, 100% { height: 4px; opacity: 0.4; }
  50% { height: 10px; opacity: 1; }
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
