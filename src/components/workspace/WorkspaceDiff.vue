<template>
  <div class="wsd">
    <div class="wsd-head">
      <button class="wsd-back" title="返回文件" @click="$emit('close')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
        <span>文件</span>
      </button>
      <div class="wsd-title" :title="path">
        <span class="wsd-name">{{ name }}</span>
        <span class="wsd-meta">
          <template v-if="oldAt">对比 {{ formatTime(oldAt) }} 的版本</template>
          <template v-else>AI 修改对比</template>
        </span>
      </div>
      <span v-if="hasHistory" class="wsd-stats">
        <span class="add">+{{ stats.added }}</span>
        <span class="del">−{{ stats.removed }}</span>
      </span>
      <button
        v-if="hasHistory"
        class="wsd-restore"
        :disabled="readOnly || restoring"
        :title="readOnly ? '授权已失效，当前为只读模式' : '用这个历史版本覆盖当前文件（当前内容会先备份）'"
        @click="restoreOld"
      >{{ restoring ? '恢复中…' : '恢复旧版' }}</button>
    </div>

    <div v-if="loading" class="wsd-body">
      <div class="wsd-skeleton">
        <span v-for="i in 9" :key="i" :style="{ width: `${35 + ((i * 23) % 60)}%` }"></span>
      </div>
    </div>

    <div v-else-if="error" class="wsd-body wsd-state">
      <p>{{ error }}</p>
      <button class="wsd-btn" @click="load">重试</button>
    </div>

    <div v-else-if="!hasHistory" class="wsd-body wsd-state">
      <p class="wsd-empty-title">这个文件还没有历史版本</p>
      <span>只有覆盖写入已有文件时才会自动备份旧内容；新建文件暂时无法对比。</span>
      <button class="wsd-btn" @click="$emit('close')">返回文件</button>
    </div>

    <div v-else-if="!hunks.length" class="wsd-body wsd-state">
      <p class="wsd-empty-title">与上一版本内容一致</p>
      <span>AI 记录了这次操作，但文件内容没有变化。</span>
    </div>

    <div v-else class="wsd-body wsd-scroll">
      <p v-if="truncated" class="wsd-note">文件较大，差异已简化为「旧版全文 / 当前全文」对照。</p>
      <div class="wsd-diff">
        <template v-for="(hunk, hi) in hunks" :key="hi">
          <div v-if="hi > 0" class="wsd-gap">⋯</div>
          <div
            v-for="(op, i) in hunk"
            :key="`${hi}-${i}`"
            class="wsd-line"
            :class="op.type"
          >
            <span class="wsd-gutter">{{ op.oldLine ?? '' }}</span>
            <span class="wsd-gutter">{{ op.newLine ?? '' }}</span>
            <span class="wsd-sign">{{ op.type === 'add' ? '+' : op.type === 'del' ? '−' : ' ' }}</span>
            <span class="wsd-text">{{ op.text === '' ? ' ' : op.text }}</span>
          </div>
        </template>
      </div>
    </div>

    <div class="wsd-foot">
      <span class="wsd-path" :title="path">{{ path }}</span>
      <span v-if="lineCount">当前 {{ lineCount }} 行</span>
      <span class="wsd-hint">旧版来自覆盖写入前的本地历史</span>
    </div>
  </div>
</template>

<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import {
  readFile, getLatestHistoryFor, getHistoryText, restoreHistory,
} from '../../services/workspace'
import { diffLines, diffStats } from '../../utils/lineDiff'

const props = defineProps({
  path: { type: String, required: true },
  name: { type: String, default: '' },
  readOnly: { type: Boolean, default: false },
})
const emit = defineEmits(['close', 'restored'])

const CONTEXT_LINES = 3

const loading = ref(false)
const restoring = ref(false)
const error = ref('')
const ops = ref([])
const truncated = ref(false)
const hasHistory = ref(false)
const oldAt = ref(0)
const lineCount = ref(0)
let versionFile = ''
let loadSeq = 0
let changeTimer = null

const stats = computed(() => diffStats(ops.value))

const hunks = computed(() => {
  const list = ops.value
  if (!list.length) return []
  const marks = []
  list.forEach((op, index) => {
    if (op.type !== 'same') marks.push(index)
  })
  if (!marks.length) return []
  const ranges = []
  let start = Math.max(0, marks[0] - CONTEXT_LINES)
  let end = Math.min(list.length - 1, marks[0] + CONTEXT_LINES)
  for (let i = 1; i < marks.length; i += 1) {
    const nextStart = Math.max(0, marks[i] - CONTEXT_LINES)
    const nextEnd = Math.min(list.length - 1, marks[i] + CONTEXT_LINES)
    if (nextStart <= end + 1) {
      end = Math.max(end, nextEnd)
    } else {
      ranges.push([start, end])
      start = nextStart
      end = nextEnd
    }
  }
  ranges.push([start, end])
  return ranges.map(([from, to]) => list.slice(from, to + 1))
})

function formatTime(at) {
  const date = new Date(Number(at))
  if (Number.isNaN(date.getTime())) return ''
  const pad = n => String(n).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

async function load() {
  const seq = ++loadSeq
  loading.value = true
  error.value = ''
  ops.value = []
  truncated.value = false
  hasHistory.value = false
  oldAt.value = 0
  lineCount.value = 0
  versionFile = ''
  try {
    const current = await readFile(props.path)
    if (seq !== loadSeq) return
    lineCount.value = current.text.split('\n').length
    const version = await getLatestHistoryFor(props.path)
    if (seq !== loadSeq) return
    if (!version) {
      hasHistory.value = false
      return
    }
    const payload = await getHistoryText(version.file)
    if (seq !== loadSeq) return
    versionFile = version.file
    oldAt.value = payload.at
    hasHistory.value = true
    const result = diffLines(payload.text, current.text)
    ops.value = result.ops
    truncated.value = result.truncated
  } catch (err) {
    if (seq === loadSeq) error.value = err?.message || '加载差异失败'
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}

async function restoreOld() {
  if (props.readOnly) {
    window.__ui?.showToast('授权已失效，当前为只读模式', 'error', 3200)
    return
  }
  if (!versionFile) return
  const ok = await window.__ui?.showConfirm('用这个历史版本覆盖当前文件？当前内容会先备份到历史版本。')
  if (!ok) return
  restoring.value = true
  try {
    const result = await restoreHistory(versionFile)
    window.__ui?.showToast(`已恢复 ${result.path} 的旧版本`, 'success', 3600)
    emit('restored', result.path)
    await load()
  } catch (err) {
    window.__ui?.showToast(err?.message || '恢复旧版本失败', 'error', 4200)
  } finally {
    restoring.value = false
  }
}

function onWorkspaceChanged(event) {
  const changed = String(event?.detail?.path || '')
  if (changed && changed !== props.path) return
  clearTimeout(changeTimer)
  changeTimer = setTimeout(load, 350)
}

watch(() => props.path, load, { immediate: true })

window.addEventListener('xiyue:workspace-changed', onWorkspaceChanged)
onUnmounted(() => {
  clearTimeout(changeTimer)
  window.removeEventListener('xiyue:workspace-changed', onWorkspaceChanged)
})
</script>

<style scoped>
.wsd {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.wsd-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 2px 8px;
  flex-shrink: 0;
}
.wsd-back {
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
.wsd-back:hover {
  color: var(--accent);
  border-color: var(--accent);
}
.wsd-title {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.wsd-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wsd-meta {
  font-size: 11px;
  color: var(--text-muted);
}
.wsd-stats {
  display: flex;
  gap: 6px;
  font-size: 12px;
  font-family: ui-monospace, Consolas, monospace;
  flex-shrink: 0;
}
.wsd-stats .add { color: #3fb950; }
.wsd-stats .del { color: #f85149; }
.wsd-restore {
  flex-shrink: 0;
  padding: 5px 10px;
  border: 1px solid var(--border-color);
  border-radius: 7px;
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
}
.wsd-restore:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}
.wsd-restore:disabled {
  opacity: 0.5;
  cursor: default;
}
.wsd-body {
  flex: 1;
  min-height: 0;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-card);
  overflow: hidden;
}
.wsd-scroll {
  overflow: auto;
}
.wsd-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 32px 24px;
  text-align: center;
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.6;
}
.wsd-state p {
  margin: 0;
  color: var(--danger);
}
.wsd-state .wsd-empty-title {
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 600;
}
.wsd-btn {
  margin-top: 4px;
  padding: 5px 12px;
  border: 1px solid var(--border-color);
  border-radius: 7px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
}
.wsd-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.wsd-note {
  margin: 0;
  padding: 7px 12px;
  border-bottom: 1px solid var(--border-color);
  font-size: 11px;
  color: #f59e0b;
}
.wsd-diff {
  font-family: ui-monospace, SFMono-Regular, Consolas, 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.6;
  min-width: max-content;
}
.wsd-line {
  display: flex;
  align-items: flex-start;
  white-space: pre;
}
.wsd-line.add {
  background: rgba(63, 185, 80, 0.14);
}
.wsd-line.del {
  background: rgba(248, 81, 73, 0.14);
}
.wsd-gutter {
  flex-shrink: 0;
  width: 40px;
  padding: 0 6px;
  text-align: right;
  color: var(--text-muted);
  user-select: none;
  border-right: 1px solid var(--border-color);
}
.wsd-sign {
  flex-shrink: 0;
  width: 18px;
  text-align: center;
  user-select: none;
}
.wsd-line.add .wsd-sign { color: #3fb950; }
.wsd-line.del .wsd-sign { color: #f85149; }
.wsd-text {
  flex: 1;
  padding-right: 12px;
  color: var(--text-primary);
}
.wsd-gap {
  padding: 3px 0;
  text-align: center;
  color: var(--text-muted);
  letter-spacing: 4px;
  background: var(--bg-primary);
  border-top: 1px dashed var(--border-color);
  border-bottom: 1px dashed var(--border-color);
}
.wsd-skeleton {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.wsd-skeleton span {
  height: 10px;
  border-radius: 5px;
  background: linear-gradient(90deg, var(--bg-hover) 25%, var(--bg-active) 50%, var(--bg-hover) 75%);
  background-size: 200% 100%;
  animation: wsd-shimmer 1.2s linear infinite;
}
@keyframes wsd-shimmer {
  to { background-position: -200% 0; }
}
.wsd-foot {
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
.wsd-path {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.wsd-hint {
  margin-left: auto;
}
</style>
