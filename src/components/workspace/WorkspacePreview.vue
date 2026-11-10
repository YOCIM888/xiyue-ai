<template>
  <Teleport to="body">
    <div class="wvp-overlay" @click.self="$emit('close')">
      <div class="wvp-window" role="dialog" aria-label="网页预览">
        <header class="wvp-header">
          <div class="wvp-title">
            <span class="wvp-dot" :class="{ live: autoRefresh && !error }"></span>
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
          class="wvp-frame"
          :srcdoc="srcdoc"
          sandbox="allow-scripts allow-forms allow-modals allow-popups allow-downloads"
          title="工作区网页实时预览"
        ></iframe>

        <footer class="wvp-footer">
          <span v-if="info">最后变化 {{ changedAt }} · {{ sizeText }}</span>
          <span v-else>静态预览 · 本地资源已内联</span>
          <span v-if="info?.missing?.length" class="wvp-warn">未找到 {{ info.missing.length }} 个资源</span>
          <span v-if="info?.modules?.length" class="wvp-warn">含 ES Module，跨文件 import 可能无法运行</span>
          <span class="wvp-tip">脚本在隔离沙箱中运行，无法访问应用数据</span>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { buildPreviewHtml, formatBytes } from '../../services/workspace'

const props = defineProps({
  path: { type: String, required: true },
  name: { type: String, default: '' },
})
defineEmits(['close'])

const srcdoc = ref('')
const info = ref(null)
const error = ref('')
const loading = ref(false)
const autoRefresh = ref(true)
const changedAt = ref('')
let timer = null
let building = false

const sizeText = computed(() => (info.value ? `${formatBytes(info.value.bytes)} 源文件` : ''))

function clock() {
  return new Date().toLocaleTimeString('zh-CN', { hour12: false })
}

async function refresh(force = false) {
  if (building) return
  building = true
  loading.value = true
  try {
    const result = await buildPreviewHtml(props.path)
    info.value = result
    if (force || result.html !== srcdoc.value) {
      srcdoc.value = result.html
      changedAt.value = clock()
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
  refresh(true)
  poll()
  window.addEventListener('xiyue:workspace-changed', onWorkspaceChanged)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
  window.removeEventListener('xiyue:workspace-changed', onWorkspaceChanged)
})

function downloadHtml() {
  if (!srcdoc.value) return
  const blob = new Blob([srcdoc.value], { type: 'text/html;charset=utf-8' })
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
.wvp-window {
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
.wvp-warn {
  color: #f59e0b;
}
.wvp-tip {
  margin-left: auto;
}
</style>
