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

    <!-- 文档选择器 -->
    <div v-if="showDocPicker" class="doc-picker">
      <div class="doc-picker-head">
        <span>选择「我的文档」</span>
        <button class="doc-picker-close" title="收起" @click="showDocPicker = false">×</button>
      </div>
      <div v-if="!availableDocs.length" class="doc-picker-empty">
        「我的文档」里还没有可用文档，请先导入 PDF、DOCX、TXT 或 Markdown。
      </div>
      <button
        v-for="doc in availableDocs"
        :key="doc.id"
        class="doc-picker-item"
        @click="pickDoc(doc)"
      >
        <span class="doc-picker-title">{{ doc.title }}</span>
        <span class="doc-picker-meta">{{ (doc.content || '').trim().length }} 字<span v-if="doc.truncated"> · 已截断</span></span>
        <span v-if="isDocSelected(doc.id)" class="doc-picker-picked">已选</span>
      </button>
    </div>

    <!-- 输入卡片 -->
    <div class="input-card">
      <!-- 斜杠指令面板 -->
      <div v-if="slashOpen && slashMatches.length" ref="slashPanelRef" class="slash-panel" @mousedown.prevent>
        <div class="slash-head">
          <span>快捷指令</span>
          <span class="slash-keys">↑↓ 选择 · Enter 使用 · Esc 关闭</span>
        </div>
        <div class="slash-list">
          <button
            v-for="(cmd, i) in slashMatches"
            :key="cmd.id"
            class="slash-item"
            :class="{ active: i === slashIndex }"
            @click="applySlash(cmd)"
            @mouseenter="slashIndex = i"
          >
            <span class="slash-cmd">{{ cmd.command }}</span>
            <span class="slash-desc">{{ cmd.desc }}</span>
            <span v-if="cmd.needsArg" class="slash-tag">需描述</span>
          </button>
        </div>
        <div v-if="activeSlash" class="slash-foot">示例：{{ activeSlash.command }} {{ activeSlash.example }}</div>
      </div>

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
          <button class="tool-btn" :class="{ active: settings.forceSearch }"
            @click="toggleForceSearch" title="联网搜索：开启后每条消息先搜索资料再回答">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <span>搜索</span>
          </button>
          <button class="tool-btn" @click="triggerFileUpload" title="上传图片或文件">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
            <span>文件</span>
          </button>
          <button ref="slashBtnRef" class="tool-btn" :class="{ active: slashOpen }"
            @click="toggleSlashPanel" title="快捷指令：总结、翻译、润色、画图等">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
            <span>指令</span>
          </button>
          <input ref="fileInputRef" type="file" :accept="FILE_ACCEPT" style="display:none" @change="handleFilePicked" />
        </div>
        <ContextRing class="input-ctx" :used="contextUsed" :limit="contextLimit" align="right" pop-direction="up" :size="22" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useSettingsStore } from '../../stores/settings'
import { useAssetsStore } from '../../stores/assets'
import { useChatStore } from '../../stores/chat'
import { compressImageDataUrl, OCR_IMAGE_OPTIONS } from '../../utils/image'
import { estimateMessagesTokens } from '../../utils/contextUsage'
import ContextRing from '../common/ContextRing.vue'
import { matchSlashCommands, parseSlashInput, SLASH_COMMANDS } from '../../services/slashCommands'
import mammoth from 'mammoth'

const DOC_MAX_SELECTION = 3
const OCR_MAX_UPLOAD = 6

const settings = useSettingsStore()
const assetsStore = useAssetsStore()
const chat = useChatStore()
const props = defineProps({ isLoading: { type: Boolean, default: false } })
const emit = defineEmits(['send', 'stop'])

// 与 TopBar 原逻辑一致：系统提示词 + 当前分支消息
const contextUsed = computed(() => {
  const system = chat.buildSystemPrompt()
  return estimateMessagesTokens([
    ...(system ? [{ role: 'system', content: system }] : []),
    ...chat.messages,
  ])
})
const contextLimit = computed(() => settings.contextLength || 131072)

const input = ref('')
const textareaRef = ref(null)
const fileInputRef = ref(null)
const attachments = ref([])
const showDocPicker = ref(false)
const availableDocs = computed(() => assetsStore.sorted.filter(a => (a.content || '').trim()))

const canSend = computed(() => (input.value.trim() || attachments.value.some(a => a.status === 'ok')) && !props.isLoading)
const MOBILE_UA = /Android|iPhone|iPad|iPod|webOS/i.test(navigator.userAgent)
const isLoading = computed(() => props.isLoading)
const placeholder = computed(() => {
  if (isLoading.value) return 'AI 正在回复中…'
  return '输入消息… '
})

// ---- 斜杠快捷指令 ----
const slashBtnRef = ref(null)
const slashPanelRef = ref(null)
const slashOpen = ref(false)
const slashIndex = ref(0)
const slashMatches = computed(() => {
  if (!slashOpen.value) return []
  const text = input.value
  // 按钮打开时（输入为空或已是完整指令）展示全部，便于手机端点选
  if (!text.startsWith('/') || /\s/.test(text)) return SLASH_COMMANDS
  return matchSlashCommands(text)
})
const activeSlash = computed(() => slashMatches.value[slashIndex.value] || slashMatches.value[0] || null)

watch(input, () => {
  const text = input.value
  if (text.startsWith('/')) {
    slashOpen.value = matchSlashCommands(text).length > 0
  } else if (text.trim()) {
    // 只有真正输入普通内容时才关闭，避免按钮打开后被输入框清空动作误关
    slashOpen.value = false
  }
  if (slashIndex.value > slashMatches.value.length - 1) slashIndex.value = 0
})

function toggleSlashPanel() {
  slashOpen.value = !slashOpen.value
  slashIndex.value = 0
  if (slashOpen.value) nextTick(() => textareaRef.value?.focus())
}

function applySlash(cmd) {
  if (!cmd) return
  // /文档 直接打开文档选择器，不填充输入框
  if (cmd.id === 'document') {
    slashOpen.value = false
    slashIndex.value = 0
    openDocPicker()
    return
  }
  // 已有普通文字时作为指令参数保留；已有指令则直接替换
  const existing = input.value.trim()
  const rest = existing.startsWith('/') ? '' : existing
  input.value = rest ? `${cmd.command} ${rest}` : `${cmd.command} `
  slashOpen.value = false
  slashIndex.value = 0
  nextTick(() => {
    const el = textareaRef.value
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
    autoResize()
  })
}

function onDocumentMousedown(e) {
  if (!slashOpen.value) return
  if (slashPanelRef.value?.contains(e.target) || slashBtnRef.value?.contains(e.target)) return
  slashOpen.value = false
}

onMounted(() => document.addEventListener('mousedown', onDocumentMousedown))
onUnmounted(() => document.removeEventListener('mousedown', onDocumentMousedown))

function autoResize() {
  nextTick(() => {
    const el = textareaRef.value
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 150) + 'px'
  })
}

function handleKeydown(e) {
  // 指令面板打开时优先处理选择操作
  if (slashOpen.value && slashMatches.value.length) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      slashIndex.value = (slashIndex.value + 1) % slashMatches.value.length
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      slashIndex.value = (slashIndex.value - 1 + slashMatches.value.length) % slashMatches.value.length
      return
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      if (e.isComposing || e.keyCode === 229) return
      e.preventDefault()
      applySlash(activeSlash.value)
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      slashOpen.value = false
      return
    }
  }

  if (e.key !== 'Enter') return
  // 中文输入法候选确认时的 Enter 不当作发送
  if (e.isComposing || e.keyCode === 229) return
  // 手机端：Enter 只换行
  if (isMobileInput()) return
  // 桌面端：Enter 发送，Shift+Enter 换行
  if (!e.shiftKey) {
    e.preventDefault()
    send()
  }
}

function isMobileInput() {
  return MOBILE_UA || window.innerWidth <= 768
}

function send() {
  if (!canSend.value) return
  let text = input.value.trim() || ''
  let forceImage = false
  let displayText = ''

  // 斜杠指令：转换为实际提示词；/画图 强制走生图分支
  const parsed = parseSlashInput(text)
  if (parsed) {
    displayText = parsed.display
    if (parsed.command.id === 'document') {
      openDocPicker()
      input.value = ''
      return
    }
    if (parsed.forceImage) {
      if (!parsed.arg) {
        window.__ui?.showToast('请在 /画图 后描述你想生成的画面', 'info', 3200)
        return
      }
      forceImage = true
      text = parsed.arg
    } else {
      text = parsed.payload
    }
  }

  // 文件附件（生图指令不拼接附件正文）
  if (!forceImage) {
    const okFiles = attachments.value.filter(a => a.type === 'file' && a.status === 'ok' && a.text)
    if (okFiles.length) {
      const texts = okFiles.map(f => `[📎 ${f.name}]\n${f.text.slice(0, 20000)}`).join('\n\n')
      text = text ? texts + '\n\n' + text : texts
    }
  }

  // 文档解析附件：正文由 chat store 在注入阶段读取，这里只传文档 id
  const okDocs = attachments.value.filter(a => a.type === 'doc' && a.status === 'ok')
  if (!forceImage && okDocs.length && !text) text = '请阅读我选择的文档。'

  // 图片附件
  const okImages = attachments.value.filter(a => a.type === 'image' && a.status === 'ok' && a.dataUrl)
  // 不在文本中拼图片标记

  emit('send', {
    text,
    images: forceImage ? [] : okImages.map(i => i.dataUrl),
    documentIds: okDocs.map(a => a.assetId),
    forceImage,
    displayText,
  })
  input.value = ''
  attachments.value = []
  nextTick(autoResize)
}

function isDocSelected(id) {
  return attachments.value.some(a => a.type === 'doc' && a.assetId === id)
}

function openDocPicker() {
  if (!settings.documentSkillEnabled) {
    window.__ui?.showToast('文档功能未开启，请到 技能管理 打开「文档解析」', 'info', 3600)
    return
  }
  showDocPicker.value = true
}

function pickDoc(doc) {
  if (isDocSelected(doc.id)) return
  if (attachments.value.filter(a => a.type === 'doc').length >= DOC_MAX_SELECTION) {
    window.__ui?.showToast(`单次最多选择 ${DOC_MAX_SELECTION} 篇文档`, 'info')
    return
  }
  attachments.value.push({ type: 'doc', name: doc.title, assetId: doc.id, status: 'ok' })
  showDocPicker.value = false
}

watch(() => settings.documentSkillEnabled, (enabled) => {
  if (!enabled) {
    showDocPicker.value = false
    attachments.value = attachments.value.filter(a => a.type !== 'doc')
  }
})

// ---- 强制联网搜索 ----
function toggleForceSearch() {
  if (!settings.forceSearch && !String(settings.tavilyApiKey || '').trim()) {
    window.__ui?.showToast('未配置 Tavily API Key，搜索会失败。请到 设置 → 搜索服务 填写。', 'error', 4200)
  }
  settings.forceSearch = !settings.forceSearch
}

// ---- 图片 / 文件上传（统一入口，按文件类型分派） ----
function triggerFileUpload() { fileInputRef.value?.click() }

async function handleFilePicked(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return
  if (isImageFile(file)) {
    await addImageFile(file)
    return
  }
  await addTextFile(file)
}

const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp']

function isImageFile(file) {
  if (file.type.startsWith('image/')) return true
  // 少数系统不提供 MIME，按扩展名兜底
  return IMAGE_EXT.includes(file.name.split('.').pop()?.toLowerCase())
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = ev => resolve(ev.target.result)
    reader.onerror = () => reject(new Error('读取图片失败'))
    reader.readAsDataURL(file)
  })
}

async function addImageFile(file) {
  if (settings.ocrSkillEnabled && attachments.value.filter(a => a.type === 'image').length >= OCR_MAX_UPLOAD) {
    window.__ui?.showToast(`开启图片理解时单次最多 ${OCR_MAX_UPLOAD} 张图片`, 'info', 3000)
    return
  }
  const idx = attachments.value.length
  attachments.value.push({ type: 'image', name: file.name, status: 'loading', dataUrl: '' })
  try {
    const dataUrl = await readFileAsDataUrl(file)
    // 图片理解开启时用更高清晰度参数；关闭时沿用原有压缩参数
    const compressed = await compressImageDataUrl(
      dataUrl,
      settings.ocrSkillEnabled ? OCR_IMAGE_OPTIONS : undefined
    )
    attachments.value[idx] = compressed
      ? { type: 'image', name: file.name, status: 'ok', dataUrl: compressed }
      : { type: 'image', name: file.name, status: 'fail', dataUrl: '' }
  } catch {
    attachments.value[idx] = { type: 'image', name: file.name, status: 'fail', dataUrl: '' }
  }
}

// 可作为纯文本读取的代码/文档后缀
const TEXT_FILE_EXT = [
  // 文本与数据
  'txt', 'md', 'markdown', 'json', 'jsonc', 'csv', 'tsv', 'log', 'xml', 'svg', 'yml', 'yaml', 'toml', 'ini', 'env', 'sql',
  // 网页前端
  'html', 'htm', 'css', 'scss', 'sass', 'less', 'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'vue', 'svelte',
  // 脚本与后端
  'sh', 'bash', 'bat', 'ps1', 'py', 'java', 'c', 'h', 'cpp', 'hpp', 'cc', 'cs', 'go', 'rs', 'php', 'rb', 'kt', 'swift',
]

// 文件选择器允许的类型：图片 + docx + 所有文本类后缀
const FILE_ACCEPT = ['image/*', '.docx', ...TEXT_FILE_EXT.map(ext => `.${ext}`)].join(',')

async function addTextFile(file) {
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (ext !== 'docx' && !TEXT_FILE_EXT.includes(ext)) {
    window.__ui?.showToast('暂不支持该文件格式，可先导入「我的文档」再选择', 'info', 3600)
    return
  }
  const idx = attachments.value.length
  attachments.value.push({ type: 'file', name: file.name, status: 'loading', text: '' })
  try {
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

/* 文档选择器 */
.doc-picker {
  margin-bottom: 8px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  max-height: 300px;
  overflow-y: auto;
}
.doc-picker-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 9px 12px; border-bottom: 1px solid var(--border-color);
  font-size: 12px; color: var(--text-secondary);
}
.doc-picker-close {
  width: 20px; height: 20px; border: none; border-radius: 5px;
  background: transparent; color: var(--text-muted); cursor: pointer;
  font-size: 14px; line-height: 1; display: flex; align-items: center; justify-content: center;
}
.doc-picker-close:hover { background: var(--bg-hover); color: var(--text-primary); }
.doc-picker-empty {
  padding: 14px 12px; font-size: 12px; line-height: 1.6; color: var(--text-muted);
}
.doc-picker-item {
  display: flex; align-items: center; gap: 8px; width: 100%;
  padding: 9px 12px; border: none; border-top: 1px solid var(--border-color);
  background: transparent; color: var(--text-primary); cursor: pointer;
  font-family: inherit; text-align: left; transition: background 0.15s;
}
.doc-picker-item:first-of-type { border-top: none; }
.doc-picker-item:hover { background: var(--bg-hover); }
.doc-picker-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
.doc-picker-meta { flex-shrink: 0; font-size: 11px; color: var(--text-muted); }
.doc-picker-picked { flex-shrink: 0; font-size: 11px; color: var(--accent); }
.doc-picker-list { max-height: 240px; overflow-y: auto; }

/* 输入卡片 */
.input-card {
  position: relative;
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
.input-ctx { margin-left: auto; flex-shrink: 0; align-self: center; }
.tool-btn {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 5px 9px; border: none; border-radius: 8px;
  background: transparent; color: var(--text-muted); cursor: pointer;
  font-size: 12px; font-family: inherit; transition: all 0.15s;
}
.tool-btn:hover:not(:disabled) { background: var(--bg-hover); color: var(--text-primary); }
.tool-btn.active { color: var(--accent); background: var(--accent-light); }
.tool-btn:disabled { opacity: 0.5; cursor: not-allowed; }

@media (max-width: 768px) {
  .chat-input-container { padding: 8px 10px 12px; }
  .tool-btn { padding: 5px 7px; }
}

/* 斜杠指令面板 */
.slash-panel {
  position: absolute;
  left: -1px;
  right: -1px;
  bottom: calc(100% + 8px);
  z-index: 30;
  display: flex;
  flex-direction: column;
  max-height: 300px;
  border: 1px solid var(--border-color);
  border-radius: 14px;
  background: var(--bg-card);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.16);
  overflow: hidden;
}
.slash-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 9px 12px;
  border-bottom: 1px solid var(--border-color);
  font-size: 12px;
  color: var(--text-secondary);
}
.slash-keys { font-size: 11px; color: var(--text-muted); white-space: nowrap; }
.slash-list { overflow-y: auto; }
.slash-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 12px;
  border: none;
  background: transparent;
  color: var(--text-primary);
  font-family: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition: background 0.12s;
}
.slash-item:hover,
.slash-item.active { background: var(--bg-hover); }
.slash-cmd {
  flex-shrink: 0;
  min-width: 62px;
  font-weight: 600;
  color: var(--accent);
}
.slash-desc {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--text-secondary);
}
.slash-tag {
  flex-shrink: 0;
  padding: 1px 6px;
  border-radius: 5px;
  background: var(--accent-light);
  color: var(--accent);
  font-size: 10px;
}
.slash-foot {
  padding: 8px 12px;
  border-top: 1px solid var(--border-color);
  color: var(--text-muted);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
@media (max-width: 768px) {
  .slash-panel { max-height: 260px; }
  .slash-keys { display: none; }
  .slash-cmd { min-width: 54px; }
}
</style>
