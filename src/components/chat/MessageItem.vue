<template>
  <div class="message-item" :class="message.role">
    <!-- AI 头像 -->
    <div v-if="message.role === 'assistant'" class="message-avatar">
      <img src="/xiyue.png" class="avatar-img" alt="AI" />
    </div>

    <!-- 用户消息删除（气泡左边） -->
    <div class="user-actions" v-if="message.role === 'user'">
      <button class="btn-action user-del" @click="confirmDelete(index)" title="删除">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
      </button>
    </div>

    <div class="message-bubble">
      <div v-if="message.thinking" class="thinking-block">
        <button class="thinking-toggle" @click="thinkOpen = !thinkOpen">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline :points="thinkOpen ? '6 15 12 9 18 15' : '9 18 15 12 9 6'"/></svg>
          思考过程
        </button>
        <div v-if="thinkOpen" class="thinking-content">
          <MarkdownRenderer :content="message.thinking" />
        </div>
      </div>

      <!-- 用户消息：文件附件折叠 -->
      <div v-if="message.role === 'user' && fileBlocks.length" class="file-blocks">
        <div v-for="(fb, fi) in fileBlocks" :key="fi" class="thinking-block file-block">
          <button class="thinking-toggle" @click="fb.open = !fb.open">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline :points="fb.open ? '6 15 12 9 18 15' : '9 18 15 12 9 6'"/></svg>
            📎 {{ fb.name }}
          </button>
          <div v-if="fb.open" class="thinking-content file-content">
            <pre>{{ fb.text }}</pre>
          </div>
        </div>
      </div>

      <div class="message-content">
        <MarkdownRenderer :content="displayContent" />
      </div>

      <!-- AI 消息操作按钮 -->
      <div class="message-actions" v-if="message.role === 'assistant'">
        <button class="btn-action" @click="copyContent" title="复制">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        </button>
        <button class="btn-action" @click="saveToAssets" title="保存到资产">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
        </button>
        <button v-if="isLastAi" class="btn-action" @click="chatStore.regenerate()" title="重新生成">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
        </button>
        <button v-if="isLastAi" class="btn-action" @click="chatStore.continueResponse()" title="继续生成">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <button class="btn-action danger" @click="confirmDelete(index)" title="删除">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
    </div>

    <!-- 用户头像 -->
    <div v-if="message.role === 'user'" class="message-avatar user-avatar">
      <img :src="userAvatar || '/yocim.png'" class="avatar-img" alt="我" />
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import MarkdownRenderer from '../common/MarkdownRenderer.vue'
import { useSettingsStore } from '../../stores/settings'
import { useChatStore } from '../../stores/chat'
import { useAssetsStore } from '../../stores/assets'

const settings = useSettingsStore()
const chatStore = useChatStore()
const userAvatar = computed(() => settings.userAvatar)

const props = defineProps({
  message: { type: Object, required: true },
  index: { type: Number, required: true },
  isLastAi: { type: Boolean, default: false },
})

const thinkOpen = ref(true)

// 解析用户消息中的文件附件
const fileBlocks = computed(() => {
  if (props.message.role !== 'user') return []
  const blocks = []
  const content = props.message.content || ''
  const regex = /\[📎 (.+?)\]\n([\s\S]*?)(?=\n\[📎|$)/g
  let match
  while ((match = regex.exec(content)) !== null) {
    blocks.push({ name: match[1], text: match[2].trim(), open: false })
  }
  return blocks
})

const displayContent = computed(() => {
  if (props.message.role !== 'user') return props.message.content
  return (props.message.content || '').replace(/\[📎 .+?\]\n[\s\S]*?(?=\n\[📎|$)/g, '').trim()
})

async function confirmDelete(idx) {
  const ok = await window.__ui?.showConfirm('确定删除这条消息吗？')
  if (ok) chatStore.deleteMessage(idx)
}

function copyContent() {
  navigator.clipboard.writeText(props.message.content).catch(() => {})
}

function saveToAssets() {
  const assetsStore = useAssetsStore()
  const title = 'AI 回复 ' + new Date().toLocaleString()
  assetsStore.saveFromMessage(props.message.content, title)
  window.__ui?.showToast('已保存到资产', 'success')
}
</script>

<style scoped>
.message-item {
  display: flex; gap: 10px; padding: 10px 0;
}
.message-item.assistant { flex-direction: row; }
.message-item.user { flex-direction: row; justify-content: flex-end; }

.message-avatar {
  flex-shrink: 0; width: 36px; height: 36px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: var(--bg-sidebar); overflow: hidden; margin-top: 4px;
}
.user-avatar { background: var(--accent-light); color: var(--accent); }
.avatar-img { width: 100%; height: 100%; object-fit: cover; }

.message-bubble { max-width: 75%; min-width: 0; }
.user .message-bubble {
  background: var(--accent); color: #fff;
  border-radius: 16px 4px 16px 16px; padding: 10px 15px;
}
.user .message-bubble .message-content { color: #fff; }

.message-content { line-height: 1.7; font-size: 14px; color: var(--text-primary); }

.message-actions {
  display: flex; gap: 2px; margin-top: 6px;
  opacity: 0; transition: opacity 0.2s;
}
.message-item:hover .message-actions { opacity: 1; }

.btn-action {
  width: 28px; height: 28px; border: none; border-radius: 5px;
  background: transparent; color: var(--text-secondary); cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}
.btn-action:hover { background: var(--bg-hover); color: var(--text-primary); }
.btn-action.danger:hover { background: var(--danger-bg); color: var(--danger); }

/* 用户消息删除按钮（气泡左边，深一点） */
.user-actions {
  display: flex; align-items: center; margin-right: 4px;
  opacity: 0; transition: opacity 0.2s;
}
.message-item.user:hover .user-actions { opacity: 1; }
.user-del {
  color: var(--text-secondary);
  background: rgba(0,0,0,0.06);
  border-radius: 6px;
}
.user-del:hover { background: var(--danger-bg); color: var(--danger); }

.thinking-block {
  margin-bottom: 8px; border: 1px solid var(--border-color);
  border-radius: 10px; overflow: hidden; background: var(--bg-primary);
}
.thinking-toggle {
  display: flex; align-items: center; gap: 6px; width: 100%;
  padding: 8px 14px; border: none; background: var(--bg-sidebar);
  color: var(--text-secondary); font-size: 12px; cursor: pointer;
  font-family: inherit; transition: background 0.15s;
}
.thinking-toggle:hover { background: var(--bg-hover); }
.thinking-content {
  padding: 10px 14px; font-size: 13px; color: var(--text-muted);
  line-height: 1.7; border-top: 1px solid var(--border-color);
  max-height: 400px; overflow-y: auto;
}
.file-content pre {
  margin: 0; white-space: pre-wrap; word-break: break-all;
  font-family: 'SF Mono', 'Fira Code', monospace; font-size: 12px;
}
</style>
