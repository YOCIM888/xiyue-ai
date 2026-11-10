<template>
  <div
    class="message-item"
    :class="[message.role, { highlighted: highlight }]"
    :id="'msg-' + message.id"
  >
    <!-- AI 头像 -->
    <div v-if="message.role === 'assistant' && !settings.hideAiAvatar" class="message-avatar">
      <img src="/xiyue.png" class="avatar-img" alt="AI" />
    </div>

    <!-- 用户消息：删除按钮（气泡左边） -->
    <div v-if="message.role === 'user'" class="user-actions">
      <button class="btn-action" @click="startEdit" title="编辑并重新生成">
        <i class="fa-solid fa-pen"></i>
      </button>
      <button class="btn-action" @click="branchHere" title="从此处创建分支">
        <i class="fa-solid fa-code-branch"></i>
      </button>
      <button class="btn-action user-del" @click="confirmDelete(index)" title="删除">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
      </button>
    </div>

    <!-- 消息气泡（AI 和用户共用） -->
    <div class="message-bubble">
      <div v-if="hasVersions && !isStreaming" class="version-nav">
        <button class="ver-btn" :disabled="activeVersion <= 0" title="上一版本" @click="chatStore.setVersion(message.id, activeVersion - 1)">
          <i class="fa-solid fa-chevron-left"></i>
        </button>
        <span class="ver-count">{{ activeVersion + 1 }} / {{ message.versions.length }}</span>
        <button class="ver-btn" :disabled="activeVersion >= message.versions.length - 1" title="下一版本" @click="chatStore.setVersion(message.id, activeVersion + 1)">
          <i class="fa-solid fa-chevron-right"></i>
        </button>
      </div>

      <div v-if="liveThinking" class="thinking-block">
        <button class="thinking-toggle" @click="thinkOpen = !thinkOpen">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline :points="thinkOpen ? '6 15 12 9 18 15' : '9 18 15 12 9 6'"/></svg>
          思考过程
        </button>
        <div v-if="thinkOpen" class="thinking-content">
          <MarkdownRenderer :content="liveThinking" symbol-style />
          <span v-if="isStreaming && !liveContent" class="cursor-blink">▍</span>
        </div>
      </div>

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

      <div v-if="editing" class="edit-box">
        <textarea ref="editTextarea" v-model="editText" class="edit-textarea" rows="4"></textarea>
        <p class="edit-hint">保存后将创建新分支并重新生成 AI 回复，原消息仍保留在原分支。</p>
        <div class="edit-actions">
          <button class="edit-btn cancel" @click="editing = false">取消</button>
          <button class="edit-btn save" :disabled="!editText.trim() || chatStore.isLoading" @click="saveEdit">保存并重新生成</button>
        </div>
      </div>

      <template v-else-if="isStreaming">
        <MessageParts v-if="liveParts.length" class="message-content" :parts="liveParts" />
        <div v-if="liveContent" class="message-content streaming-text">
          <MarkdownRenderer :content="liveContent" symbol-style />
          <span class="cursor-blink">▍</span>
        </div>
        <div v-else-if="!liveThinking && !liveParts.length" class="typing-indicator">
          <span></span><span></span><span></span>
        </div>
      </template>

      <MessageParts
        v-else-if="message.role === 'assistant' && message.parts?.length"
        class="message-content"
        :parts="message.parts"
      />

      <template v-else>
        <!-- 旧消息回退：没有分段数据时沿用聚合执行链 -->
        <ToolTrace v-if="message.role === 'assistant' && message.toolTrace?.length" :trace="message.toolTrace" />
        <div class="message-content">
          <MarkdownRenderer :content="displayContent" :symbol-style="message.role === 'assistant'" />
        </div>
      </template>

      <!-- AI 生成的图片 -->
      <div v-if="message.role === 'assistant' && message.images?.length && !isStreaming" class="ai-images">
        <div v-for="(img, i) in message.images" :key="i" class="ai-img-wrap">
          <img :src="img" class="ai-img" alt="AI 生成图片"
            loading="lazy" title="点击查看原图" @click="previewImage(img)" />
        </div>
      </div>

      <div class="message-actions" v-if="message.role === 'assistant' && !isStreaming">
        <button class="btn-action" @click="copyContent" title="复制">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        </button>
        <button class="btn-action" @click="saveToAssets" title="保存到文档">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
        </button>
        <button
          class="btn-action"
          :title="isLastAi ? '重新生成（保留旧版本）' : '重新生成（后续内容保留在原分支）'"
          @click="chatStore.regenerate(message.id)"
        >
          <i class="fa-solid fa-rotate-right"></i>
        </button>
        <button
          class="btn-action"
          title="用副模型回答（保留主模型版本）"
          @click="chatStore.regenerateWithSecondary(message.id)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
        </button>
        <button class="btn-action" @click="branchHere" title="从此处创建分支">
          <i class="fa-solid fa-code-branch"></i>
        </button>
        <button v-if="isLastAi" class="btn-action" @click="chatStore.continueResponse()" title="继续生成">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linejoin="round"><polygon points="8 5 19 12 8 19"/></svg>
        </button>
        <button v-if="message.images?.length" class="btn-action save-image" @click="downloadMessageImages" title="保存图片">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        </button>
        <button class="btn-action danger" @click="confirmDelete(index)" title="删除">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
    </div>

    <!-- 用户头像 -->
    <div v-if="message.role === 'user' && !settings.hideUserAvatar" class="message-avatar user-avatar">
      <img :src="userAvatar || '/yocim.png'" class="avatar-img" alt="我" />
    </div>

    <!-- 用户消息图片 -->
    <div v-if="message.role === 'user' && message.images?.length" class="user-images">
      <img v-for="(img, i) in message.images" :key="i" :src="img" class="user-img" />
    </div>
  </div>

  <!-- AI 图片原图预览 -->
  <Teleport to="body">
    <div v-if="previewUrl" class="img-preview-overlay" @click="previewUrl = ''">
      <img :src="previewUrl" class="img-preview" alt="AI 生成图片预览" />
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'
import MarkdownRenderer from '../common/MarkdownRenderer.vue'
import MessageParts from './MessageParts.vue'
import ToolTrace from './ToolTrace.vue'
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
  highlight: { type: Boolean, default: false },
})

const thinkOpen = ref(true)
const editing = ref(false)
const editText = ref('')
const editTextarea = ref(null)
const previewUrl = ref('')
// 源站 CDN 未开 CORS 时，通过图片代理取字节
const PROXY_PREFIX = 'https://images.weserv.nl/?url='

const hasVersions = computed(() =>
  Array.isArray(props.message.versions) && props.message.versions.length > 1
)
const activeVersion = computed(() => Number(props.message.activeVersion) || 0)
// 流式回复直接复用这条消息本身渲染，收尾时只更新字段，避免整块 DOM 重建
const isStreaming = computed(() =>
  !!props.message.streaming && chatStore.streamingMessageId === props.message.id
)
const liveThinking = computed(() =>
  isStreaming.value ? chatStore.streamingThinking : props.message.thinking
)
const liveContent = computed(() =>
  isStreaming.value ? chatStore.streamingContent : props.message.content
)
const liveParts = computed(() =>
  isStreaming.value ? chatStore.streamingParts : (props.message.parts || [])
)

function startEdit() {
  editText.value = props.message.content || ''
  editing.value = true
  nextTick(() => editTextarea.value?.focus())
}

function saveEdit() {
  const text = editText.value.trim()
  if (!text || chatStore.isLoading) return
  chatStore.editAndRegenerate(props.message.id, text)
  editing.value = false
}

function branchHere() {
  chatStore.branchFromMessage(props.message.id)
}

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
  if (props.message.displayContent) return props.message.displayContent
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

function previewImage(url) {
  previewUrl.value = url || ''
}

// 依次保存这条消息里的所有生成图片
async function downloadMessageImages() {
  const images = props.message.images || []
  for (let i = 0; i < images.length; i += 1) {
    await downloadImage(images[i], i)
    if (i < images.length - 1) await new Promise(r => setTimeout(r, 400))
  }
}

// 保存 AI 生成图片到本地：data URL 直接下载；远程地址依次尝试 fetch / canvas，
// 都不行时打开新标签页并提示手动另存（外链图片受跨域限制无法直接取字节）
async function downloadImage(url, index = 0) {
  if (!url) return
  try {
    let blob = null
    if (!url.startsWith('data:')) {
      try {
        blob = await fetchImageBlob(url)
      } catch {
        try { blob = await canvasImageBlob(url) } catch { /* 继续走兜底 */ }
      }
      if (!blob) {
        try { blob = await fetchImageBlob(PROXY_PREFIX + encodeURIComponent(url)) } catch { /* 继续走兜底 */ }
      }
      if (!blob) {
        window.open(url, '_blank', 'noopener')
        window.__ui?.showToast('该图片为外部链接，无法直接下载，已在新标签页打开，请右键另存为', 'info', 4200)
        return
      }
    }

    const ext = blob ? blobExt(blob) : imageExt(url)
    const name = `xiyue-image-${imageStamp()}-${index + 1}.${ext}`
    const href = blob ? URL.createObjectURL(blob) : url
    const a = document.createElement('a')
    a.href = href
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    if (blob) setTimeout(() => URL.revokeObjectURL(href), 2000)
    window.__ui?.showToast('图片已保存', 'success', 2000)
  } catch (err) {
    window.__ui?.showToast(`保存失败：${err?.message || '无法下载图片'}`, 'error', 3200)
  }
}

async function fetchImageBlob(url) {
  const resp = await fetch(url, { mode: 'cors', signal: AbortSignal.timeout(30000) })
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  const blob = await resp.blob()
  if (!blob.type.startsWith('image/')) throw new Error('返回内容不是图片')
  return blob
}

// 外链图片若允许跨域读取，可通过 canvas 导出字节
function canvasImageBlob(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth || img.width
        canvas.height = img.naturalHeight || img.height
        canvas.getContext('2d').drawImage(img, 0, 0)
        canvas.toBlob(b => (b ? resolve(b) : reject(new Error('导出失败'))), 'image/png')
      } catch (err) {
        reject(err)
      }
    }
    img.onerror = () => reject(new Error('图片加载失败'))
    img.src = url
  })
}

function blobExt(blob) {
  const sub = String(blob.type || '').split('/')[1] || ''
  if (!sub) return 'png'
  return sub === 'jpeg' ? 'jpg' : sub.replace(/\+.*$/, '')
}

function imageExt(url) {
  const dataMatch = /^data:image\/([a-z0-9.+-]+)/i.exec(url)
  if (dataMatch) {
    const ext = dataMatch[1].toLowerCase()
    return ext === 'jpeg' ? 'jpg' : ext
  }
  const pathMatch = /\.(png|jpe?g|webp|gif|bmp)$/i.exec(String(url).split('?')[0])
  if (!pathMatch) return 'png'
  const ext = pathMatch[1].toLowerCase()
  return ext === 'jpeg' ? 'jpg' : ext
}

function imageStamp() {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

function saveToAssets() {
  const assetsStore = useAssetsStore()
  const title = 'AI 回复 ' + new Date().toLocaleString()
  assetsStore.saveFromMessage(props.message.content, title)
  window.__ui?.showToast('已保存到文档', 'success')
}
</script>

<style scoped>
.message-item {
  display: flex; gap: 10px; padding: 10px 0;
}
.message-item.assistant { flex-direction: row; }
.message-item.user { flex-direction: row; justify-content: flex-end; flex-wrap: wrap; }

.message-avatar {
  flex-shrink: 0; width: 36px; height: 36px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: var(--bg-sidebar); overflow: hidden; margin-top: 4px;
}
.user-avatar { background: var(--accent-light); color: var(--accent); }
.avatar-img { width: 100%; height: 100%; object-fit: cover; }

.message-bubble { flex: 1; max-width: 100%; min-width: 0; }
.user .message-bubble {
  flex: 0 1 auto; max-width: 75%;
  background: #dbeafe; color: #1e3a8a;
  border: 1px solid #bfdbfe;
  border-radius: 16px 4px 16px 16px; padding: 10px 15px;
}
.user .message-bubble .message-content { color: #1e3a8a; }

.message-content { line-height: 1.7; font-size: 14px; color: var(--text-primary); }
.part-text + .part-text { margin-top: 10px; }

/* 流式光标与等待指示 */
.cursor-blink {
  animation: blink 1s step-end infinite;
  color: var(--accent);
  font-weight: bold;
}
@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}
.typing-indicator { display: flex; gap: 5px; padding: 8px 0; }
.typing-indicator span {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--text-muted);
  animation: typing-bounce 1.4s infinite ease-in-out both;
}
.typing-indicator span:nth-child(1) { animation-delay: -0.32s; }
.typing-indicator span:nth-child(2) { animation-delay: -0.16s; }
@keyframes typing-bounce {
  0%, 80%, 100% { transform: scale(0); }
  40% { transform: scale(1); }
}

.message-actions { display: flex; gap: 2px; margin-top: 6px; opacity: 0; transition: opacity 0.2s; }
.message-item:hover .message-actions { opacity: 1; }

.btn-action {
  width: 28px; height: 28px; border: none; border-radius: 5px;
  background: transparent; color: var(--text-secondary); cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}
.btn-action:hover { background: var(--bg-hover); color: var(--text-primary); }
.btn-action.danger:hover { background: var(--danger-bg); color: var(--danger); }

.user-actions { display: flex; align-items: center; margin-right: 4px; opacity: 0; transition: opacity 0.2s; }
.message-item.user:hover .user-actions { opacity: 1; }
.user-del { color: var(--text-secondary); background: rgba(0,0,0,0.06); border-radius: 6px; }
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

.user-images {
  width: 100%; display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end;
}
.user-img {
  max-width: 200px; max-height: 200px; border-radius: 10px;
  object-fit: cover; border: 1px solid var(--border-color);
}

.ai-images { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.ai-img-wrap { display: inline-flex; max-width: 100%; }
.ai-img {
  max-width: 100%; max-height: 460px; border-radius: 12px;
  border: 1px solid var(--border-color); cursor: zoom-in; background: var(--bg-sidebar);
  display: block;
}

/* AI 图片原图预览 */
.img-preview-overlay {
  position: fixed; inset: 0; z-index: 2100;
  background: rgba(0, 0, 0, 0.78);
  display: flex; align-items: center; justify-content: center;
  cursor: zoom-out; padding: 24px;
}
.img-preview {
  max-width: 92vw; max-height: 92vh; border-radius: 12px;
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.4); object-fit: contain;
}

.btn-action i { font-size: 12px; }

/* 回复版本切换 */
.version-nav {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin-bottom: 6px;
  padding: 2px 4px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--bg-sidebar);
}
.ver-btn {
  width: 20px;
  height: 18px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--text-secondary);
  font-size: 9px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.ver-btn:hover:not(:disabled) { background: var(--bg-hover); color: var(--text-primary); }
.ver-btn:disabled { opacity: 0.35; cursor: default; }
.ver-count {
  min-width: 32px;
  text-align: center;
  font-size: 11px;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

/* 编辑用户消息 */
.edit-box { min-width: 240px; }
.edit-textarea {
  width: 100%;
  min-height: 88px;
  box-sizing: border-box;
  padding: 8px 10px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: inherit;
  font-size: 13px;
  line-height: 1.6;
  resize: vertical;
  outline: none;
}
.edit-textarea:focus { border-color: var(--accent); }
.edit-hint {
  margin: 6px 0 0;
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-muted);
}
.edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 8px;
}
.edit-btn {
  padding: 5px 12px;
  border-radius: 7px;
  border: 1px solid var(--border-color);
  background: var(--bg-primary);
  color: var(--text-secondary);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
}
.edit-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
.edit-btn.save {
  border-color: var(--accent);
  background: var(--accent);
  color: #fff;
}
.edit-btn.save:hover { opacity: 0.9; }
.edit-btn.save:disabled { opacity: 0.5; cursor: default; }

/* 触屏设备没有 hover，操作按钮常显，否则保存按钮无法点到 */
@media (hover: none) {
  .message-actions { opacity: 1; }
}

@media (max-width: 768px) {
  .message-actions { opacity: 1; }
  .user-actions { display: none; }
}

/* 搜索结果定位高亮 */
.message-item.highlighted .message-bubble {
  animation: msg-highlight 2s ease-out;
}
@keyframes msg-highlight {
  0% { box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.45); }
  70% { box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.12); }
  100% { box-shadow: 0 0 0 3px rgba(99, 102, 241, 0); }
}

</style>
