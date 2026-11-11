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
import StarryAvatar from './StarryAvatar.vue'
import ContextRing from '../common/ContextRing.vue'
import { useStarryChat } from './useStarryChat'

const props = defineProps({
  type: { type: String, required: true },
  chat: { type: Object, required: true },
})

const emit = defineEmits(['back', 'open-friend', 'open-group', 'deleted'])

const {
  store, settings, messagesEl, inputEl, imageInput, input, pendingImages, userName,
  searchOpen, searchQuery, quotedMessage, displayedMessages, contextUsed, contextLimit,
  typingVisible, subtitle, placeholder, canSend, emptyTitle, emptyDesc, typingAvatar,
  senderAvatar, fmtClock, fmtDivider, showDivider, loadOlder, toggleSearch, closeSearch,
  copyMessage, quoteMessage, removeMessage, openMentionMenu, stopGenerating, autoResize,
  onKeydown, triggerImageUpload, onImagePicked, send, openMenu,
} = useStarryChat(props, emit)
</script>

<style scoped src="./StarryChat.css"></style>
