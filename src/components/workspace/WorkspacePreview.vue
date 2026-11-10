<template>
  <Teleport to="body">
    <div class="wvp-overlay" @click.self="$emit('close')">
      <div class="wvp-window" role="dialog" aria-label="网页预览">
        <header class="wvp-header">
          <div class="wvp-title">
            <span class="wvp-dot" :class="{ live: autoRefresh && !error && !errorCount, bad: errorCount > 0 }"></span>
            <span class="wvp-name">{{ name }}</span>
            <span class="wvp-path">{{ path }}</span>
          </div>
          <div class="wvp-actions">
            <label class="wvp-auto" title="每 2 秒检查文件变化并刷新预览">
              <input v-model="autoRefresh" type="checkbox" />
              <span>实时刷新</span>
            </label>
            <button class="wvp-btn" :disabled="loading" @click="refresh(true)">刷新</button>
            <button class="wvp-btn" :disabled="!srcdoc" @click="downloadHtml">导出 HTML</button>
            <button class="wvp-btn primary" @click="$emit('close')">关闭</button>
          </div>
        </header>

        <div v-if="error" class="wvp-state error">
          <p>{{ error }}</p>
          <button class="wvp-btn" @click="refresh(true)">重试</button>
        </div>
        <div v-else-if="!srcdoc" class="wvp-state">
          <p>{{ loading ? '正在内联本地 CSS / JS / 图片…' : '暂无内容' }}</p>
        </div>
        <iframe
          v-else
          ref="frameEl"
          class="wvp-frame"
          :srcdoc="srcdoc"
          sandbox="allow-scripts allow-forms allow-modals allow-popups allow-downloads"
          title="工作区网页实时预览"
        ></iframe>

        <section v-if="entries.length" class="wvp-console">
          <div class="wvp-console-head">
            <button class="wvp-console-toggle" type="button" @click="consoleOpen = !consoleOpen">
              <span class="wvp-caret" :class="{ open: consoleOpen }"></span>
              <span>控制台</span>
              <span class="wvp-console-count">{{ entries.length }}</span>
              <span v-if="errorCount" class="wvp-console-errors">{{ errorCount }} 个错误</span>
            </button>
            <button class="wvp-btn" type="button" @click="clearConsole">清空</button>
          </div>
          <ol v-show="consoleOpen" ref="listEl" class="wvp-console-log">
            <li v-for="item in entries" :key="item.id" :class="item.level">
              <span class="wvp-log-at">{{ item.at }}</span>
              <span v-if="item.source" class="wvp-log-src" :title="item.source">{{ item.source }}</span>
              <span class="wvp-log-text">{{ item.text }}</span>
            </li>
          </ol>
        </section>

        <footer class="wvp-footer">
          <span v-if="info">最后变化 {{ changedAt }} · {{ sizeText }}</span>
          <span v-else>静态预览 · 本地资源已内联</span>
          <span v-if="info?.moduleCount" class="wvp-modules">
            已加载 {{ info.moduleCount }} 个模块 · 入口 {{ info.moduleEntries.length }} 个
          </span>
          <span v-if="info?.bare?.length" class="wvp-warn" :title="`需要联网从 CDN 取：${info.bare.join('、')}`">
            裸模块名走 CDN：{{ info.bare.join('、') }}
          </span>
          <span class="wvp-tip">隔离沙箱 · 无法访问应用数据 · 存储为内存实现，刷新即清空</span>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { buildPreviewBundle, formatBytes, getFileBlob } from '../../services/workspace'
import { createPreviewBridge, stripPreviewRuntime } from '../../services/previewRuntime'
import { runtimeConfigFor } from '../../services/previewPaths'
import { remapStack } from '../../services/sandbox/sourceMap'

const props = defineProps({
  path: { type: String, required: true },
  name: { type: String, default: '' },
})
defineEmits(['close'])

const MAX_ENTRIES = 300
const MAX_ISSUES = 20

const srcdoc = ref('')
const info = ref(null)
const error = ref('')
const loading = ref(false)
const autoRefresh = ref(true)
const changedAt = ref('')
const frameEl = ref(null)
const listEl = ref(null)
const entries = ref([])
const consoleOpen = ref(false)
/** 路径 → sourcemap：模块跑的是转译产物，行号要换回源文件才有意义 */
const moduleMaps = ref({})
let timer = null
let building = false
let bridge = null
let entrySeq = 0

const sizeText = computed(() => (info.value ? `${formatBytes(info.value.bytes)} 源文件` : ''))
const errorCount = computed(() => entries.value.filter(item => item.level === 'error').length)

function clock() {
  return new Date().toLocaleTimeString('zh-CN', { hour12: false })
}

/** .ts / .vue 跑的是转译产物，行号不按 sourcemap 换回去就会指到不存在的位置 */
function remap(value) {
  const text = String(value ?? '')
  if (!text) return text
  return Object.keys(moduleMaps.value).length ? remapStack(text, moduleMaps.value) : text
}

function pushEntry(entry) {
  if (!entry?.text) return
  entries.value.push({
    id: (entrySeq += 1),
    at: clock(),
    ...entry,
    text: remap(entry.text),
    source: remap(entry.source),
  })
  if (entries.value.length > MAX_ENTRIES) entries.value.splice(0, entries.value.length - MAX_ENTRIES)
  // 出错时自动摊开：白屏最需要看的就是这里
  if (entry.level === 'error') consoleOpen.value = true
  if (!consoleOpen.value) return
  nextTick(() => {
    if (listEl.value) listEl.value.scrollTop = listEl.value.scrollHeight
  })
}

function clearConsole() {
  entries.value = []
}

function noteMissing(list) {
  if (!list?.length) return
  const more = list.length > 8 ? ` 等 ${list.length} 个` : ''
  pushEntry({ level: 'warn', text: `未找到本地资源：${list.slice(0, 8).join('、')}${more}`, source: '' })
}

/** 模块图的结果要说清加载了什么、丢了什么：被额度挤掉的模块如果静默，页面就只是白屏 */
function noteModules(result) {
  if (result.moduleCount) {
    pushEntry({
      level: 'info',
      text: `已加载 ${result.moduleCount} 个模块（入口 ${result.moduleEntries.length} 个），跨文件 import 走浏览器原生 ESM`,
      source: '',
    })
  }
  if (result.bare?.length) {
    pushEntry({ level: 'info', text: `裸模块名从 CDN 加载：${result.bare.join('、')}（需要联网）`, source: '' })
  }
  const issues = result.moduleIssues || []
  for (const item of issues.slice(0, MAX_ISSUES)) pushEntry({ level: item.level, text: item.text, source: '' })
  if (issues.length > MAX_ISSUES) {
    pushEntry({ level: 'warn', text: `另有 ${issues.length - MAX_ISSUES} 条模块问题没有列出`, source: '' })
  }
}

async function refresh(force = false) {
  if (building) return
  building = true
  loading.value = true
  try {
    const result = await buildPreviewBundle(props.path)
    info.value = result
    if (force || result.html !== srcdoc.value) {
      srcdoc.value = result.html
      changedAt.value = clock()
      // 换文档等于换一次运行，上一份的日志留着只会误导
      entries.value = []
      consoleOpen.value = false
      // 必须先于 noteModules：条目里的行号要靠它换回源文件
      moduleMaps.value = result.moduleMaps || {}
      noteMissing(result.missing)
      noteModules(result)
    }
    error.value = ''
    if (force && !srcdoc.value) changedAt.value = clock()
  } catch (err) {
    error.value = err?.message || '网页预览失败'
  } finally {
    building = false
    loading.value = false
  }
}

function poll() {
  timer = setInterval(() => {
    if (autoRefresh.value) refresh(false)
  }, 2000)
}

function onWorkspaceChanged(event) {
  if (!autoRefresh.value) return
  const changed = String(event?.detail?.path || '')
  if (!changed || changed === props.path || props.path.startsWith(`${changed}/`)) refresh(false)
}

watch(autoRefresh, value => {
  if (value) refresh(false)
})

onMounted(() => {
  bridge = createPreviewBridge({
    getFrame: () => frameEl.value,
    getBase: () => runtimeConfigFor(props.path).base,
    readFile: getFileBlob,
    onEntry: pushEntry,
  })
  refresh(true)
  poll()
  window.addEventListener('xiyue:workspace-changed', onWorkspaceChanged)
})

onUnmounted(() => {
  bridge?.destroy()
  bridge = null
  if (timer) clearInterval(timer)
  window.removeEventListener('xiyue:workspace-changed', onWorkspaceChanged)
})

function downloadHtml() {
  if (!srcdoc.value) return
  // 导出的是能独立打开的静态文件，桥脚本留着只会让相对请求白等 10 秒
  const blob = new Blob([stripPreviewRuntime(srcdoc.value)], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = props.name.replace(/\.html?$/i, '') + '.preview.html'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
</script>

<style scoped>
.wvp-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(2px);
}
/* 11px 级小字，--danger / #f59e0b 在这个字号上对比度不够，单独给一套达 AA 的颜色 */
.wvp-window {
  --log-error: #b91c1c;
  --log-warn: #a16207;
  display: flex;
  flex-direction: column;
  width: min(1120px, 100%);
  height: min(78vh, 900px);
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
  overflow: hidden;
}
:root[data-theme="dark"] .wvp-window {
  --log-error: #fca5a5;
  --log-warn: #fbbf24;
}
.wvp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}
.wvp-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.wvp-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-muted);
  flex-shrink: 0;
}
.wvp-dot.live {
  background: #22c55e;
  box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.16);
}
.wvp-dot.bad {
  background: var(--danger);
  box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.18);
}
.wvp-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
}
.wvp-path {
  font-size: 11px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wvp-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.wvp-auto {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
  margin-right: 4px;
  user-select: none;
}
.wvp-auto input {
  accent-color: var(--accent);
}
.wvp-btn {
  padding: 5px 11px;
  border: 1px solid var(--border-color);
  border-radius: 7px;
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s, opacity 0.15s;
}
.wvp-btn:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}
.wvp-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.wvp-btn.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}
.wvp-btn.primary:hover {
  color: #fff;
  opacity: 0.9;
}
.wvp-frame {
  flex: 1;
  width: 100%;
  border: none;
  background: #fff;
}
.wvp-console {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  max-height: 38%;
  border-top: 1px solid var(--border-color);
  background: var(--bg-card);
}
.wvp-console-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px 4px 6px;
  flex-shrink: 0;
}
.wvp-console-toggle {
  display: flex;
  align-items: center;
  gap: 7px;
  flex: 1;
  min-width: 0;
  padding: 3px 6px;
  border: none;
  background: none;
  color: var(--text-secondary);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
}
.wvp-caret {
  width: 0;
  height: 0;
  border-left: 4px solid var(--text-subtle);
  border-top: 3px solid transparent;
  border-bottom: 3px solid transparent;
  transition: transform 0.15s;
  flex-shrink: 0;
}
.wvp-caret.open {
  transform: rotate(90deg);
}
.wvp-console-count {
  padding: 0 6px;
  border-radius: 8px;
  background: var(--bg-primary);
  color: var(--text-subtle);
  font-size: 11px;
}
.wvp-console-errors {
  color: var(--log-error);
  font-size: 11px;
}
.wvp-console-log {
  margin: 0;
  padding: 0 12px 8px;
  overflow: auto;
  list-style: none;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11.5px;
  line-height: 1.65;
}
.wvp-console-log li {
  display: flex;
  gap: 8px;
  padding: 2px 0;
  color: var(--text-secondary);
}
.wvp-log-at,
.wvp-log-src {
  color: var(--text-subtle);
  flex-shrink: 0;
}
.wvp-log-src {
  max-width: 32ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wvp-log-text {
  white-space: pre-wrap;
  word-break: break-word;
}
.wvp-console-log li.error .wvp-log-text {
  color: var(--log-error);
}
.wvp-console-log li.warn .wvp-log-text {
  color: var(--log-warn);
}
.wvp-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-muted);
  font-size: 13px;
}
.wvp-state.error p {
  color: var(--danger);
  max-width: 560px;
  text-align: center;
  line-height: 1.7;
}
.wvp-footer {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 7px 14px;
  border-top: 1px solid var(--border-color);
  font-size: 11px;
  color: var(--text-muted);
  flex-shrink: 0;
  overflow: hidden;
  white-space: nowrap;
}
/* 页脚是 nowrap，长内容要能被裁掉，不能把右侧提示挤没 */
.wvp-modules,
.wvp-warn {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.wvp-modules {
  color: var(--text-subtle);
}
.wvp-warn {
  color: var(--log-warn);
}
.wvp-tip {
  margin-left: auto;
}
</style>
