<template>
  <div class="chat-input-container">
    <div class="chat-input-wrapper">
      <!-- 思考模式按钮 -->
      <button
        class="btn-tool"
        :class="{ active: settings.thinkingEnabled }"
        @click="settings.thinkingEnabled = !settings.thinkingEnabled"
        title="思考模式"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 1 1 7.072 0l-.548.547A3.374 3.374 0 0 0 14 18.469V19a2 2 0 1 1-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
        </svg>
      </button>

      <!-- 语音输入按钮 -->
      <button
        class="btn-tool"
        :class="{ active: isListening }"
        @click="toggleVoice"
        :title="isListening ? '停止录音' : '语音输入'"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
          <line x1="12" y1="19" x2="12" y2="23"/>
          <line x1="8" y1="23" x2="16" y2="23"/>
        </svg>
      </button>

      <!-- 文件上传按钮 -->
      <button class="btn-tool" @click="triggerFileUpload" title="上传文件">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
      </button>
      <input ref="fileInputRef" type="file" accept=".txt,.md,.json,.docx,.csv,.log" style="display:none" @change="handleFileUpload" />

      <textarea
        ref="textareaRef"
        v-model="input"
        class="chat-input"
        :placeholder="isLoading ? 'AI 正在回复中…' : '输入消息，Enter 发送，Shift+Enter 换行'"
        :disabled="isLoading"
        rows="1"
        @keydown="handleKeydown"
        @input="autoResize"
      ></textarea>

      <button
        v-if="!isLoading"
        class="btn-send"
        :class="{ disabled: !input.trim() }"
        @click="send"
        :disabled="!input.trim()"
        title="发送"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
      </button>
      <button
        v-else
        class="btn-stop"
        @click="$emit('stop')"
        title="停止生成"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick } from 'vue'
import { useSettingsStore } from '../../stores/settings'
import mammoth from 'mammoth'

const settings = useSettingsStore()

const props = defineProps({
  isLoading: { type: Boolean, default: false },
})
const emit = defineEmits(['send', 'stop'])

const input = ref('')
const textareaRef = ref(null)
const fileInputRef = ref(null)
const isListening = ref(false)

function autoResize() {
  nextTick(() => {
    const el = textareaRef.value
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
  })
}

function handleKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    send()
  }
}

function send() {
  const content = input.value.trim()
  if (!content || props.isLoading) return
  emit('send', content)
  input.value = ''
  nextTick(autoResize)
}

// 语音输入 (Web Speech API)
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
let recognition = null

function toggleVoice() {
  if (!SpeechRecognition) {
    alert('你的浏览器不支持语音输入')
    return
  }
  if (isListening.value) {
    recognition?.stop()
    return
  }
  recognition = new SpeechRecognition()
  recognition.lang = 'zh-CN'
  recognition.interimResults = true
  recognition.continuous = true

  recognition.onresult = (e) => {
    let transcript = ''
    for (let i = e.resultIndex; i < e.results.length; i++) {
      transcript += e.results[i][0].transcript
    }
    input.value = transcript
    autoResize()
  }
  recognition.onerror = () => { isListening.value = false }
  recognition.onend = () => { isListening.value = false }

  isListening.value = true
  recognition.start()
}

function focus() {
  textareaRef.value?.focus()
}

// 文件上传
function triggerFileUpload() { fileInputRef.value?.click() }

async function handleFileUpload(e) {
  const file = e.target.files?.[0]
  if (!file) return
  const ext = file.name.split('.').pop()?.toLowerCase()
  let text = ''
  try {
    if (ext === 'docx') {
      const buf = await file.arrayBuffer()
      const result = await mammoth.extractRawText({ arrayBuffer: buf })
      text = result.value
    } else {
      text = await file.text()
    }
    const label = `[📎 ${file.name}]\n${text.trim().slice(0, 20000)}\n`
    input.value = input.value ? input.value + '\n\n' + label : label
    nextTick(autoResize)
    window.__ui?.showToast(`已读取 ${file.name}`, 'success')
  } catch {
    window.__ui?.showToast(`无法读取 ${file.name}`, 'error')
  }
  e.target.value = ''
}

defineExpose({ focus })
</script>

<style scoped>
.chat-input-container {
  padding: 16px 24px 24px;
  flex-shrink: 0;
}
.chat-input-wrapper {
  max-width: 800px;
  margin: 0 auto;
  display: flex;
  align-items: flex-end;
  gap: 6px;
  background: var(--bg-input);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 8px 12px;
  transition: border-color 0.2s;
}
.chat-input-wrapper:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-shadow);
}

.chat-input {
  flex: 1;
  border: none;
  background: transparent;
  color: var(--text-primary);
  font-size: 14px;
  line-height: 1.6;
  resize: none;
  outline: none;
  max-height: 200px;
  font-family: inherit;
}
.chat-input::placeholder {
  color: var(--text-muted);
}

.btn-tool {
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}
.btn-tool:hover {
  background: var(--bg-hover);
  color: var(--text-secondary);
}
.btn-tool.active {
  color: var(--accent);
  background: var(--accent-light);
}

.btn-send, .btn-stop {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}
.btn-send {
  background: var(--accent);
  color: #fff;
}
.btn-send:hover:not(.disabled) {
  background: var(--accent-hover);
}
.btn-send.disabled {
  background: var(--bg-hover);
  color: var(--text-muted);
  cursor: not-allowed;
}
.btn-stop {
  background: var(--danger);
  color: #fff;
}
.btn-stop:hover {
  background: #e55;
}

/* 移动端 */
@media (max-width: 768px) {
  .chat-input-container {
    padding: 10px 12px 16px;
  }
}
</style>
