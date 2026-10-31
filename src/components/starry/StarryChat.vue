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
            <div class="bubble">{{ m.content }}</div>
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
    </footer>
  </section>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import StarryAvatar from './StarryAvatar.vue'
import { useStarryStore } from '../../stores/starry'
import { useSettingsStore } from '../../stores/settings'
import { generateCharacterReply, isApiConfigured, selectRepliers } from '../../services/starry'

const props = defineProps({
  type: { type: String, required: true },
  chat: { type: Object, required: true },
})

const emit = defineEmits(['back', 'open-friend', 'open-group', 'deleted'])

const store = useStarryStore()
const settings = useSettingsStore()

const messagesEl = ref(null)
const inputEl = ref(null)
const input = ref('')

const messages = computed(() => store.messages)
const userName = computed(() => settings.userName || '我')

const typingVisible = computed(() =>
  store.sending && store.typingName && store.generatingChatId === props.chat.id
)

const subtitle = computed(() => {
  if (typingVisible.value) return `${store.typingName} 正在输入…`
  if (props.type === 'group') return `${props.chat.members.length + 1} 人`
  return '在线'
})

const placeholder = computed(() =>
  typingVisible.value ? '对方正在输入…' : '发消息…'
)

const canSend = computed(() => input.value.trim().length > 0 && !store.sending)

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

async function send() {
  if (!canSend.value) return
  if (!isApiConfigured(settings)) {
    window.__ui?.showToast('请先在设置中配置模型 API', 'info', 3000)
    return
  }

  const text = input.value.trim()
  const targetId = props.chat.id
  const targetType = props.type
  const targetChat = { ...props.chat }
  const senderName = settings.userName || '我'

  input.value = ''
  nextTick(autoResize)

  store.appendMessage({
    role: 'user',
    senderId: 'me',
    senderName,
    content: text,
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

/* 输入区 */
.composer {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  padding: 10px 16px 14px;
  border-top: 1px solid var(--border-color);
  flex-shrink: 0;
  background: var(--bg-primary);
}
.composer-input {
  flex: 1;
  min-height: 40px;
  max-height: 120px;
  padding: 9px 12px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: 14px;
  line-height: 1.6;
  font-family: inherit;
  resize: none;
  outline: none;
  transition: border-color 0.15s;
}
.composer-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-shadow);
}
.composer-input::placeholder {
  color: var(--text-muted);
}
.send-btn {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border: none;
  border-radius: 10px;
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

@media (max-width: 768px) {
  .back-btn {
    display: flex;
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
