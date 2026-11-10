<template>
  <div class="wsv" ref="rootEl">
    <div class="wsv-head">
      <button class="wsv-back" title="返回文件树" @click="$emit('close')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
        <span>文件</span>
      </button>
      <div class="wsv-title" :title="path">
        <span class="wsv-name">{{ name }}</span>
        <span class="wsv-meta">{{ metaText }}</span>
      </div>
      <button v-if="aiChanged" class="wsv-ai" title="查看 AI 本次修改的 diff" @click="$emit('diff', path)">AI 已改</button>
      <span v-if="!modes.length" class="wsv-actions">
        <button v-if="kind !== 'image' && kind !== 'pdf'" class="wsv-btn" :disabled="!text" @click="copyContent">复制</button>
        <button class="wsv-btn" :disabled="loading" @click="download">下载</button>
        <button class="wsv-btn" :disabled="readOnly" @click="$emit('delete', path, name)">删除</button>
      </span>
    </div>

    <div v-if="modes.length" class="wsv-modes">
      <button
        v-for="item in modes"
        :key="item.key"
        class="wsv-mode"
        :class="{ active: mode === item.key }"
        @click="mode = item.key"
      >{{ item.label }}</button>
      <span class="wsv-actions">
        <button v-if="isHtml && mode !== 'preview'" class="wsv-btn" title="在独立窗口中预览" @click="$emit('web-preview', path, name)">窗口</button>
        <button class="wsv-btn" :disabled="!text" @click="copyContent">复制</button>
        <button class="wsv-btn" :disabled="loading" @click="download">下载</button>
        <button class="wsv-btn" :disabled="readOnly" @click="$emit('delete', path, name)">删除</button>
      </span>
    </div>

    <div v-if="loading" class="wsv-body">
      <div class="wsv-skeleton">
        <span v-for="i in 8" :key="i" :style="{ width: `${40 + ((i * 17) % 55)}%` }"></span>
      </div>
    </div>
    <div v-else-if="error" class="wsv-body wsv-state">
      <p>{{ error }}</p>
      <button class="wsv-btn" @click="load(false)">重试</button>
    </div>

    <div v-else class="wsv-body" :class="{ 'is-split': mode === 'split' }">
      <img v-if="kind === 'image'" class="wsv-image" :src="blobUrl" :alt="name" />
      <iframe v-else-if="kind === 'pdf'" class="wsv-pdf" :src="blobUrl" :title="name"></iframe>

      <div v-else-if="mode === 'split'" class="wsv-split">
        <div class="wsv-code-scroll">
          <span v-if="band" class="wsv-band" :style="band"></span>
          <pre class="wsv-gutter">{{ lineNumbers }}</pre>
          <pre class="wsv-code hljs" v-html="highlightedHtml"></pre>
        </div>
        <div class="wsv-render">
          <div v-if="previewError" class="wsv-state">
            <p>{{ previewError }}</p>
            <button class="wsv-btn" @click="ensurePreview">重试</button>
          </div>
          <div v-else-if="!srcdoc" class="wsv-state">
            <p>{{ previewLoading ? '正在内联本地资源…' : '暂无内容' }}</p>
          </div>
          <iframe
            v-else
            ref="previewFrame"
            class="wsv-frame"
            :srcdoc="srcdoc"
            sandbox="allow-scripts allow-forms allow-modals allow-popups allow-downloads"
            :title="`${name} 预览`"
          ></iframe>
        </div>
      </div>

      <div v-else-if="mode === 'preview' && kind === 'html'" class="wsv-render">
        <div v-if="previewError" class="wsv-state">
          <p>{{ previewError }}</p>
          <button class="wsv-btn" @click="ensurePreview">重试</button>
        </div>
        <div v-else-if="!srcdoc" class="wsv-state">
          <p>{{ previewLoading ? '正在内联本地资源…' : '暂无内容' }}</p>
        </div>
        <iframe
          v-else
          ref="previewFrame"
          class="wsv-frame"
          :srcdoc="srcdoc"
          sandbox="allow-scripts allow-forms allow-modals allow-popups allow-downloads"
          :title="`${name} 预览`"
        ></iframe>
      </div>

      <div v-else-if="mode === 'preview' && kind === 'markdown'" class="wsv-markdown">
        <MarkdownRenderer :content="text" preview />
      </div>

      <div v-else-if="mode === 'preview' && kind === 'csv'" class="wsv-table-wrap">
        <table v-if="table?.rows.length" class="wsv-table">
          <thead>
            <tr>
              <th v-for="(cell, i) in table.rows[0]" :key="i">{{ cell }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, ri) in table.rows.slice(1)" :key="ri">
              <td v-for="(cell, ci) in row" :key="ci">{{ cell }}</td>
            </tr>
          </tbody>
        </table>
        <p v-if="table?.truncated" class="wsv-note">表格过大，仅展示前 400 行 / 40 列</p>
      </div>

      <div v-else class="wsv-code-scroll">
        <span v-if="band" class="wsv-band" :style="band"></span>
        <p v-if="binary" class="wsv-note">该文件疑似二进制内容，建议下载后查看。</p>
        <p v-if="jsonInvalid && mode === 'formatted'" class="wsv-note">JSON 解析失败，已显示原文。</p>
        <pre class="wsv-gutter">{{ lineNumbers }}</pre>
        <pre class="wsv-code hljs" v-html="highlightedHtml"></pre>
      </div>
    </div>

    <div class="wsv-foot">
      <span class="wsv-path" :title="path">{{ path }}</span>
      <span v-if="focusLine > 0">定位第 {{ focusLine }} 行</span>
      <span v-if="text">{{ lineCount }} 行</span>
      <span v-if="truncated" class="wsv-warn">预览已截断，下载可看全文</span>
      <span v-if="modified" class="wsv-time">修改于 {{ formatTime(modified) }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import hljs from 'highlight.js'
import MarkdownRenderer from '../common/MarkdownRenderer.vue'
import {
  readFile, getFileBlob, buildPreviewBundle, formatBytes, sanitizeFileName,
} from '../../services/workspace'
import { createPreviewBridge } from '../../services/previewRuntime'
import { runtimeConfigFor } from '../../services/previewPaths'
import { parseDelimited, detectDelimiter } from '../../utils/csvParse'

const props = defineProps({
  path: { type: String, required: true },
  name: { type: String, default: '' },
  entry: { type: Object, default: null },
  focusLine: { type: Number, default: 0 },
  aiChanged: { type: Boolean, default: false },
  readOnly: { type: Boolean, default: false },
})
defineEmits(['close', 'diff', 'delete', 'web-preview'])

const EXT_LANG = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript',
  ts: 'typescript', tsx: 'typescript', json: 'json', jsonc: 'json',
  html: 'xml', htm: 'xml', xml: 'xml', vue: 'xml',
  css: 'css', scss: 'scss', less: 'less',
  md: 'markdown', markdown: 'markdown',
  py: 'python', sh: 'bash', bash: 'bash', zsh: 'bash',
  yml: 'yaml', yaml: 'yaml', sql: 'sql',
  java: 'java', c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', hpp: 'cpp',
  cs: 'csharp', go: 'go', rs: 'rust', php: 'php', rb: 'ruby',
  toml: 'ini', ini: 'ini', conf: 'ini', env: 'ini',
}
const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'avif', 'svg'])
const MAX_HIGHLIGHT_CHARS = 200000

const mode = ref('source')
const rootEl = ref(null)
const band = ref(null)
const text = ref('')
const size = ref(Number(props.entry?.size) || 0)
const modified = ref(Number(props.entry?.modified) || 0)
const truncated = ref(false)
const binary = ref(false)
const loading = ref(false)
const error = ref('')
const blobUrl = ref('')
const srcdoc = ref('')
const previewError = ref('')
const previewLoading = ref(false)
const previewFrame = ref(null)
let loadSeq = 0
let previewSeq = 0
let changeTimer = null
let previewBridge = null

const ext = computed(() => String(props.name || props.path).split('.').pop().toLowerCase())
const kind = computed(() => {
  if (IMAGE_EXT.has(ext.value)) return 'image'
  if (ext.value === 'pdf') return 'pdf'
  if (/^html?$/.test(ext.value)) return 'html'
  if (/^md|markdown$/.test(ext.value)) return 'markdown'
  if (/^jsonc?$/.test(ext.value)) return 'json'
  if (/^(csv|tsv|tab)$/.test(ext.value)) return 'csv'
  return 'text'
})
const isHtml = computed(() => kind.value === 'html')
const language = computed(() => EXT_LANG[ext.value] || '')

const modes = computed(() => {
  if (kind.value === 'html') {
    return [
      { key: 'source', label: '源码' },
      { key: 'split', label: '分栏' },
      { key: 'preview', label: '预览' },
    ]
  }
  if (kind.value === 'markdown' || kind.value === 'csv') {
    return [
      { key: 'source', label: '源码' },
      { key: 'preview', label: kind.value === 'csv' ? '表格' : '预览' },
    ]
  }
  if (kind.value === 'json') {
    return [
      { key: 'source', label: '源码' },
      { key: 'formatted', label: '格式化' },
    ]
  }
  return []
})

const metaText = computed(() => {
  const parts = [formatBytes(size.value)]
  if (modified.value) parts.push(formatTime(modified.value))
  return parts.join(' · ')
})

const table = computed(() => {
  if (kind.value !== 'csv' || !text.value) return null
  return parseDelimited(text.value, { delimiter: detectDelimiter(props.name, text.value) })
})

const jsonFormatted = computed(() => {
  if (kind.value !== 'json' || !text.value) return null
  try {
    return JSON.stringify(JSON.parse(text.value), null, 2)
  } catch {
    return null
  }
})
const jsonInvalid = computed(() => kind.value === 'json' && !!text.value && !jsonFormatted.value)

const displayText = computed(() => {
  if (mode.value === 'formatted' && jsonFormatted.value) return jsonFormatted.value
  return text.value
})
const lineCount = computed(() => displayText.value.split('\n').length)
const lineNumbers = computed(() => Array.from({ length: lineCount.value }, (_, i) => i + 1).join('\n'))

const highlightedHtml = computed(() => {
  const source = displayText.value
  if (!source) return ''
  if (source.length > MAX_HIGHLIGHT_CHARS) return escapeHtml(source)
  const lang = language.value
  let html
  try {
    html = lang && hljs.getLanguage(lang)
      ? hljs.highlight(source, { language: lang }).value
      : hljs.highlightAuto(source).value
  } catch {
    html = escapeHtml(source)
  }
  return closeSpansPerLine(html)
})

function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** 按行拆分高亮 HTML，跨行 span 在行尾闭合、下一行重新打开，保证行号对齐 */
function closeSpansPerLine(html) {
  const openTags = []
  return html.split('\n').map(raw => {
    let content = openTags.join('') + raw
    const tagRe = /<span\b[^>]*>|<\/span>/g
    let match
    while ((match = tagRe.exec(raw))) {
      if (match[0] === '</span>') openTags.pop()
      else openTags.push(match[0])
    }
    content += '</span>'.repeat(openTags.length)
    return content
  }).join('\n')
}

function defaultMode() {
  if (kind.value === 'html') return 'split'
  if (kind.value === 'markdown' || kind.value === 'csv') return 'preview'
  if (kind.value === 'json') return 'formatted'
  return 'source'
}

function revokeBlob() {
  if (blobUrl.value) {
    URL.revokeObjectURL(blobUrl.value)
    blobUrl.value = ''
  }
}

async function load(resetMode = true) {
  const seq = ++loadSeq
  loading.value = true
  error.value = ''
  previewError.value = ''
  srcdoc.value = ''
  binary.value = false
  band.value = null
  revokeBlob()
  if (resetMode) mode.value = defaultMode()
  // 从搜索结果跳转时必须看源码，否则预览视图里没有可定位的行
  if (props.focusLine > 0 && kind.value !== 'image' && kind.value !== 'pdf') mode.value = 'source'
  try {
    if (kind.value === 'image' || kind.value === 'pdf') {
      const blob = await getFileBlob(props.path)
      if (seq !== loadSeq) return
      blobUrl.value = URL.createObjectURL(blob)
      size.value = blob.size
      modified.value = Number(props.entry?.modified) || modified.value
      text.value = ''
    } else {
      const result = await readFile(props.path)
      if (seq !== loadSeq) return
      text.value = result.text
      size.value = result.size
      modified.value = result.modified
      truncated.value = !!result.truncated
      binary.value = result.text.includes('\u0000')
    }
    if (isHtml.value && mode.value !== 'source') ensurePreview()
  } catch (err) {
    if (seq === loadSeq) error.value = err?.message || '读取文件失败'
  } finally {
    if (seq === loadSeq) {
      loading.value = false
      // 代码区在 loading 结束后才挂载，定位必须等这一步之后
      if (props.focusLine > 0) await jumpToLine()
    }
  }
}

async function jumpToLine() {
  const line = Number(props.focusLine)
  if (!(line > 0) || !text.value) return
  await nextTick()
  const scroller = rootEl.value?.querySelector('.wsv-code-scroll')
  const code = scroller?.querySelector('.wsv-code')
  if (!scroller || !code) return
  const total = lineCount.value
  if (line > total) return
  const height = lineHeightOf(code, total)
  const origin = code.offsetTop + (parseFloat(getComputedStyle(code).paddingTop) || 0)
  const top = origin + (line - 1) * height
  band.value = {
    top: `${top}px`,
    height: `${height}px`,
    width: `${Math.max(scroller.clientWidth, code.scrollWidth)}px`,
  }
  scroller.scrollTop = Math.max(0, top - scroller.clientHeight / 3)
}

function lineHeightOf(el, lines) {
  const computed = parseFloat(getComputedStyle(el).lineHeight)
  if (Number.isFinite(computed) && computed > 0) return computed
  return el.scrollHeight / Math.max(1, lines)
}

async function ensurePreview() {
  const seq = ++previewSeq
  previewLoading.value = true
  previewError.value = ''
  try {
    const result = await buildPreviewBundle(props.path)
    if (seq !== previewSeq) return
    srcdoc.value = result.html
  } catch (err) {
    if (seq === previewSeq) previewError.value = err?.message || '网页预览失败'
  } finally {
    if (seq === previewSeq) previewLoading.value = false
  }
}

async function copyContent() {
  try {
    await navigator.clipboard.writeText(displayText.value)
    window.__ui?.showToast('已复制文件内容', 'success')
  } catch {
    window.__ui?.showToast('复制失败，请手动选择内容', 'error', 3200)
  }
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = sanitizeFileName(filename)
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

async function download() {
  try {
    if (kind.value === 'image' || kind.value === 'pdf') {
      saveBlob(await getFileBlob(props.path), props.name)
    } else {
      saveBlob(new Blob([text.value], { type: 'text/plain;charset=utf-8' }), props.name)
    }
  } catch (err) {
    window.__ui?.showToast(err?.message || '下载失败', 'error', 4200)
  }
}

function formatTime(at) {
  const date = new Date(Number(at))
  if (Number.isNaN(date.getTime())) return ''
  const pad = n => String(n).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function onWorkspaceChanged(event) {
  const changed = String(event?.detail?.path || '')
  if (changed && changed !== props.path && !props.path.startsWith(`${changed}/`)) return
  clearTimeout(changeTimer)
  changeTimer = setTimeout(() => load(false), 350)
}

watch(() => props.path, () => load(true), { immediate: true })
watch(mode, value => {
  if (isHtml.value && value !== 'source' && !srcdoc.value) ensurePreview()
})
window.addEventListener('xiyue:workspace-changed', onWorkspaceChanged)

// 这里的预览只是侧栏小窗，只替页面应答工作区内的相对 fetch；
// 日志与错误的控制台在放大后的 WorkspacePreview 里，不重复做一份 UI
onMounted(() => {
  previewBridge = createPreviewBridge({
    getFrame: () => previewFrame.value,
    getBase: () => runtimeConfigFor(props.path).base,
    readFile: getFileBlob,
  })
})

onUnmounted(() => {
  previewBridge?.destroy()
  previewBridge = null
  revokeBlob()
  clearTimeout(changeTimer)
  window.removeEventListener('xiyue:workspace-changed', onWorkspaceChanged)
})
</script>

<style scoped>
.wsv {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.wsv-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 2px 8px;
  flex-shrink: 0;
}
.wsv-back {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 5px 9px;
  border: 1px solid var(--border-color);
  border-radius: 7px;
  background: var(--bg-card);
  color: var(--text-secondary);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  flex-shrink: 0;
}
.wsv-back:hover {
  color: var(--accent);
  border-color: var(--accent);
}
.wsv-title {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.wsv-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wsv-meta {
  font-size: 11px;
  color: var(--text-muted);
}
.wsv-ai {
  flex-shrink: 0;
  padding: 4px 8px;
  border: 1px solid var(--accent);
  border-radius: 999px;
  background: var(--bg-active);
  color: var(--accent);
  font-size: 11px;
  font-family: inherit;
  cursor: pointer;
}
.wsv-modes {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 2px 8px;
  flex-wrap: wrap;
  flex-shrink: 0;
}
.wsv-mode {
  padding: 4px 10px;
  border: 1px solid var(--border-color);
  border-radius: 7px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
}
.wsv-mode.active {
  border-color: var(--accent);
  background: var(--bg-active);
  color: var(--accent);
}
.wsv-actions {
  margin-left: auto;
  display: flex;
  gap: 4px;
}
.wsv-btn {
  padding: 4px 9px;
  border: 1px solid var(--border-color);
  border-radius: 7px;
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
}
.wsv-btn:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}
.wsv-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.wsv-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-card);
  overflow: hidden;
  container-type: inline-size;
}
.wsv-body.is-split > .wsv-split {
  flex: 1;
}
.wsv-state {
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--text-muted);
  font-size: 12px;
  padding: 24px;
  text-align: center;
}
.wsv-state p {
  margin: 0;
  color: var(--danger);
  line-height: 1.6;
}
.wsv-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: repeating-conic-gradient(var(--bg-hover) 0 25%, transparent 0 50%) 0 0 / 16px 16px;
}
.wsv-pdf {
  flex: 1;
  width: 100%;
  border: none;
  background: #fff;
}
.wsv-code-scroll {
  flex: 1;
  min-height: 0;
  position: relative;
  display: flex;
  align-items: flex-start;
  overflow: auto;
  font-family: ui-monospace, SFMono-Regular, Consolas, 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.65;
}
.wsv-band {
  position: absolute;
  left: 0;
  z-index: 0;
  background: rgba(250, 204, 21, 0.16);
  border-left: 2px solid var(--accent);
  pointer-events: none;
}
.wsv-gutter {
  position: sticky;
  left: 0;
  z-index: 1;
  flex-shrink: 0;
  margin: 0;
  padding: 10px 8px 10px 10px;
  text-align: right;
  color: var(--text-muted);
  background: var(--bg-card);
  border-right: 1px solid var(--border-color);
  user-select: none;
  font: inherit;
}
.wsv-code {
  flex: 1 0 auto;
  margin: 0;
  padding: 10px 14px;
  background: transparent;
  white-space: pre;
  font: inherit;
}
.wsv-split {
  display: grid;
  grid-template-rows: minmax(0, 1fr) minmax(0, 1fr);
  min-height: 0;
}
@container (min-width: 620px) {
  .wsv-split {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);
  }
}
.wsv-split > .wsv-code-scroll {
  border-bottom: 1px solid var(--border-color);
  min-height: 0;
}
@container (min-width: 620px) {
  .wsv-split > .wsv-code-scroll {
    border-bottom: none;
    border-right: 1px solid var(--border-color);
  }
}
.wsv-render {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: #fff;
}
.wsv-frame {
  flex: 1;
  width: 100%;
  border: none;
  background: #fff;
}
.wsv-markdown {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 12px 16px;
  background: var(--bg-primary);
}
.wsv-table-wrap {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 8px;
}
.wsv-table {
  border-collapse: collapse;
  font-size: 12px;
  min-width: 100%;
}
.wsv-table th,
.wsv-table td {
  border: 1px solid var(--border-color);
  padding: 5px 9px;
  text-align: left;
  white-space: nowrap;
  color: var(--text-primary);
}
.wsv-table th {
  position: sticky;
  top: 0;
  background: var(--bg-hover);
  font-weight: 600;
}
.wsv-table tbody tr:nth-child(even) {
  background: var(--bg-hover);
}
.wsv-note {
  margin: 8px 10px;
  font-size: 11px;
  color: #f59e0b;
  flex-shrink: 0;
}
.wsv-skeleton {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.wsv-skeleton span {
  height: 10px;
  border-radius: 5px;
  background: linear-gradient(90deg, var(--bg-hover) 25%, var(--bg-active) 50%, var(--bg-hover) 75%);
  background-size: 200% 100%;
  animation: wsv-shimmer 1.2s linear infinite;
}
@keyframes wsv-shimmer {
  to { background-position: -200% 0; }
}
.wsv-foot {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 4px 0;
  font-size: 11px;
  color: var(--text-muted);
  flex-shrink: 0;
  overflow: hidden;
  white-space: nowrap;
}
.wsv-path {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.wsv-time {
  margin-left: auto;
}
.wsv-warn {
  color: #f59e0b;
}
</style>
