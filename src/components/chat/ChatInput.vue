<template>
  <div class="chat-input-container">
    <!-- 附件栏 -->
    <div v-if="attachments.length" class="attachments-bar">
      <div v-for="(a, i) in attachments" :key="i" class="attachment-chip">
        <span class="att-icon">{{ a.type === 'image' ? '🖼' : '📄' }}</span>
        <span class="att-name">{{ a.name }}</span>
        <span class="att-status" :class="a.status">{{ a.status === 'ok' ? '✓' : a.status === 'fail' ? '✗' : '…' }}</span>
        <button class="att-remove" @click="attachments.splice(i, 1)">×</button>
      </div>
    </div>

    <!-- 输入卡片 -->
    <div class="input-card" :class="{ listening }">
      <div class="input-top">
        <textarea ref="textareaRef" v-model="input" class="chat-input"
          :placeholder="placeholder"
          :disabled="isLoading" rows="1"
          @keydown="handleKeydown" @input="autoResize"></textarea>
        <button v-if="!isLoading" class="action-btn send" :class="{ disabled: !canSend }"
          :disabled="!canSend" @click="send" title="发送">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
        <button v-else class="action-btn stop" @click="$emit('stop')" title="停止生成">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
        </button>
      </div>

      <!-- 底部功能栏 -->
      <div class="input-tools">
        <div class="tools-left">
          <button class="tool-btn" :class="{ active: settings.thinkingEnabled }"
            @click="settings.thinkingEnabled = !settings.thinkingEnabled" title="思考模式">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 1 1 7.072 0l-.548.547A3.374 3.374 0 0 0 14 18.469V19a2 2 0 1 1-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>
            <span>思考</span>
          </button>
          <button class="tool-btn" @click="triggerImageUpload" title="上传图片">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            <span>图片</span>
          </button>
          <input ref="imgInputRef" type="file" accept="image/*" style="display:none" @change="handleImageUpload" />
          <button class="tool-btn voice-btn" :class="{ recording: listening }" @click="toggleVoice"
            :disabled="isLoading" :title="listening ? '停止语音输入' : '语音输入'">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
            <span>{{ listening ? '聆听中' : '语音' }}</span>
            <span v-if="listening" class="voice-wave">
              <i></i><i></i><i></i>
            </span>
          </button>
          <button class="tool-btn" @click="triggerFileUpload" title="上传文件">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
            <span>文件</span>
          </button>
          <input ref="fileInputRef" type="file" accept=".txt,.md,.json,.docx,.csv,.log" style="display:none" @change="handleFileUpload" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'
import { useSettingsStore } from '../../stores/settings'
import { useVoiceInput } from '../../composables/useVoiceInput'
import mammoth from 'mammoth'

const settings = useSettingsStore()
const props = defineProps({ isLoading: { type: Boolean, default: false } })
const emit = defineEmits(['send', 'stop'])

const input = ref('')
const textareaRef = ref(null)
const fileInputRef = ref(null)
const imgInputRef = ref(null)
const attachments = ref([])

const canSend = computed(() => (input.value.trim() || attachments.value.some(a => a.status === 'ok')) && !props.isLoading)
const isMobile = /Android|iPhone|iPad|iPod|webOS/i.test(navigator.userAgent) || window.innerWidth <= 768
const isLoading = computed(() => props.isLoading)
const placeholder = computed(() => {
  if (isLoading.value) return 'AI 正在回复中…'
  return listening.value ? '正在聆听，说完会自动发送…' : '输入消息…'
})

function autoResize() {
  nextTick(() => {
    const el = textareaRef.value
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 150) + 'px'
  })
}

function handleKeydown(e) {
  if (e.key === 'Enter') {
    // 手机端：Enter = 换行（不发送）
    if (isMobile) return
    // 桌面端：Enter 发送，Shift+Enter 换行
    if (!e.shiftKey) {
      e.preventDefault()
      send()
    }
  }
}

function send() {
  if (!canSend.value) return
  let full = input.value.trim() || ''

  // 文件附件
  const okFiles = attachments.value.filter(a => a.type === 'file' && a.status === 'ok' && a.text)
  if (okFiles.length) {
    const texts = okFiles.map(f => `[📎 ${f.name}]\n${f.text.slice(0, 20000)}`).join('\n\n')
    full = full ? texts + '\n\n' + full : texts
  }

  // 图片附件
  const okImages = attachments.value.filter(a => a.type === 'image' && a.status === 'ok' && a.dataUrl)
  // 不在文本中拼图片标记

  emit('send', { text: full, images: okImages.map(i => i.dataUrl) })
  input.value = ''
  attachments.value = []
  nextTick(autoResize)
}

// ---- 语音输入 ----
const { listening, toggle: toggleVoiceInput } = useVoiceInput({
  getBaseText: () => input.value,
  onUpdate: (text) => { input.value = text; autoResize() },
  onFinish: () => send(),
})

function toggleVoice() {
  if (isLoading.value) return
  toggleVoiceInput()
}

// ---- 图片上传 ----
function triggerImageUpload() { imgInputRef.value?.click() }
function handleImageUpload(e) {
  const file = e.target.files?.[0]
  if (!file) return
  const idx = attachments.value.length
  attachments.value.push({ type: 'image', name: file.name, status: 'loading', dataUrl: '' })
  const reader = new FileReader()
  reader.onload = (ev) => {
    const dataUrl = ev.target.result
    // 压缩大图
    const img = new Image()
    img.onload = () => {
      const maxW = 1024
      if (img.width > maxW) {
        const canvas = document.createElement('canvas')
        const ratio = maxW / img.width
        canvas.width = maxW
        canvas.height = img.height * ratio
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        attachments.value[idx] = { type: 'image', name: file.name, status: 'ok', dataUrl: canvas.toDataURL('image/jpeg', 0.8) }
      } else {
        attachments.value[idx] = { type: 'image', name: file.name, status: 'ok', dataUrl }
      }
    }
    img.src = dataUrl
  }
  reader.onerror = () => { attachments.value[idx] = { type: 'image', name: file.name, status: 'fail', dataUrl: '' } }
  reader.readAsDataURL(file)
  e.target.value = ''
}

// ---- 文件上传 ----
function triggerFileUpload() { fileInputRef.value?.click() }
async function handleFileUpload(e) {
  const file = e.target.files?.[0]
  if (!file) return
  const idx = attachments.value.length
  attachments.value.push({ type: 'file', name: file.name, status: 'loading', text: '' })
  try {
    const ext = file.name.split('.').pop()?.toLowerCase()
    let text = ''
    if (ext === 'docx') {
      const buf = await file.arrayBuffer()
      text = (await mammoth.extractRawText({ arrayBuffer: buf })).value
    } else {
      text = await file.text()
    }
    attachments.value[idx] = { type: 'file', name: file.name, status: 'ok', text }
  } catch {
    attachments.value[idx] = { type: 'file', name: file.name, status: 'fail', text: '' }
  }
  e.target.value = ''
}

defineExpose({ focus: () => textareaRef.value?.focus() })
</script>

<style scoped>
.chat-input-container {
  padding: 10px 24px 16px; flex-shrink: 0; max-width: 800px; margin: 0 auto; width: 100%;
}

/* 附件栏 */
.attachments-bar {
  display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px;
}
.attachment-chip {
  display: flex; align-items: center; gap: 5px;
  padding: 4px 10px; border-radius: 8px;
  background: var(--bg-sidebar); border: 1px solid var(--border-color); font-size: 12px;
}
.att-icon { font-size: 14px; }
.att-name { color: var(--text-primary); max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.att-status { font-weight: 700; font-size: 11px; }
.att-status.ok { color: #10b981; }
.att-status.loading { color: var(--text-muted); }
.att-status.fail { color: var(--danger); }
.att-remove { width: 18px; height: 18px; border: none; border-radius: 4px; background: transparent; color: var(--text-muted); cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center; }
.att-remove:hover { background: var(--bg-hover); color: var(--danger); }

/* 输入卡片 */
.input-card {
  background: var(--bg-input);
  border: 1px solid var(--border-color);
  border-radius: 20px;
  padding: 10px 12px 8px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
  transition: border-color 0.2s, box-shadow 0.2s;
}
.input-card:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-shadow);
}
.input-card.listening {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-shadow);
}

/* 上部：文字 + 发送 */
.input-top { display: flex; align-items: flex-end; gap: 8px; }
.chat-input {
  flex: 1; min-width: 0;
  border: none; background: transparent; color: var(--text-primary);
  font-size: 14px; line-height: 1.6; resize: none; outline: none;
  min-height: 28px; max-height: 150px; padding: 4px 2px;
  font-family: inherit;
}
.chat-input::placeholder { color: var(--text-muted); }
.chat-input:disabled { opacity: 0.7; }

.action-btn {
  flex-shrink: 0;
  width: 34px; height: 34px;
  display: flex; align-items: center; justify-content: center;
  border: none; border-radius: 50%;
  background: var(--accent); color: #fff;
  cursor: pointer; transition: all 0.15s;
}
.action-btn:hover:not(:disabled) { background: var(--accent-hover); transform: translateY(-1px); }
.action-btn.disabled { background: var(--bg-hover); color: var(--text-muted); cursor: not-allowed; }
.action-btn.stop { background: var(--danger); }
.action-btn.stop:hover { background: #e55; }

/* 下部：功能按钮 */
.input-tools {
  display: flex; align-items: center; justify-content: space-between;
  margin-top: 6px; padding-top: 6px;
  border-top: 1px solid var(--border-color);
}
.tools-left { display: flex; align-items: center; gap: 2px; flex-wrap: wrap; }
.tool-btn {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 5px 9px; border: none; border-radius: 8px;
  background: transparent; color: var(--text-muted); cursor: pointer;
  font-size: 12px; font-family: inherit; transition: all 0.15s;
}
.tool-btn:hover:not(:disabled) { background: var(--bg-hover); color: var(--text-primary); }
.tool-btn.active { color: var(--accent); background: var(--accent-light); }
.tool-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.voice-btn.recording {
  color: var(--accent);
  background: var(--accent-light);
}
.voice-wave { display: inline-flex; align-items: center; gap: 2px; margin-left: 1px; }
.voice-wave i {
  width: 2px; height: 5px; border-radius: 1px; background: currentColor;
  animation: voiceWave 0.9s ease-in-out infinite;
}
.voice-wave i:nth-child(2) { animation-delay: 0.15s; }
.voice-wave i:nth-child(3) { animation-delay: 0.3s; }
@keyframes voiceWave {
  0%, 100% { height: 4px; opacity: 0.4; }
  50% { height: 10px; opacity: 1; }
}

@media (max-width: 768px) {
  .chat-input-container { padding: 8px 10px 12px; }
  .tool-btn { padding: 5px 7px; }
}
</style>
