<template>
  <div class="tool-trace" :class="{ running: isRunning }">
    <div v-for="round in trace" :key="round.round" class="trace-round">
      <div v-if="trace.length > 1" class="round-head">第 {{ round.round }} 轮</div>
      <ThinkingRow v-if="round.thinking" :content="round.thinking" />
      <div v-if="round.content" class="round-text">
        <MarkdownRenderer :content="round.content" />
      </div>

      <div
        v-for="(step, i) in round.steps"
        :key="i"
        class="trace-step"
        :class="{ fail: step.ok === false && !step.running && !step.pending && !step.aborted, running: step.running, pending: step.pending, aborted: step.aborted }"
      >
        <button class="step-row" type="button" @click="toggleStep(round.round, i)">
          <span class="step-icon">
            <span v-if="step.running" class="step-spinner"></span>
            <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" v-html="iconPath(step)"></svg>
          </span>
          <span class="step-label">{{ stepLabel(step) }}</span>
          <span v-if="stepTarget(step)" class="step-target">{{ stepTarget(step) }}</span>
          <span v-if="step.stats" class="step-stats">
            <em class="stat-add">+{{ step.stats.added }}</em>
            <em class="stat-del">-{{ step.stats.removed }}</em>
          </span>
          <span v-if="step.aborted" class="step-aborted">已中止</span>
          <svg v-if="step.output" class="step-chevron" :class="{ open: openStep === stepKey(round.round, i) }" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
        <div v-if="openStep === stepKey(round.round, i) && (step.output || step.summary)" class="step-detail">
          <p v-if="step.summary" class="step-summary">{{ step.summary }}</p>
          <pre v-if="step.output && step.output !== step.summary" class="step-output">{{ step.output }}</pre>
        </div>
      </div>

      <div v-if="round.running && round.status" class="trace-status">
        <span class="step-spinner"></span>
        <span class="status-shimmer">{{ round.status }}</span>
      </div>
      <p v-for="(note, i) in round.notes" :key="'note-' + i" class="trace-note">{{ note }}</p>
      <p v-if="round.error" class="trace-note fail">{{ round.error }}</p>
      <p v-if="showBudget && round.used && round === lastUsedRound" class="trace-budget">{{ budgetLine }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import MarkdownRenderer from '../common/MarkdownRenderer.vue'
import ThinkingRow from './ThinkingRow.vue'
import { formatBytes } from '../../services/workspace'

const props = defineProps({
  trace: { type: Array, default: () => [] },
  live: { type: Boolean, default: false },
  // 分段渲染时每轮是独立实例，额度行只应由最后一个 trace 分段展示
  showBudget: { type: Boolean, default: true },
})

const TOOL_LABELS = {
  search_web: '联网搜索',
  read_document: '读取文档',
  browser: '浏览器',
  files: '文件操作',
  preview: '预览验收',
  calculate: '本地计算',
  draw_chart: '绘制图表',
  generate_image: '生成图片',
  export_conversation: '导出对话',
  __invalid__: '无效调用',
}

const TOOL_ICONS = {
  search_web: 'globe',
  read_document: 'doc',
  browser: 'globe',
  files: 'folder',
  preview: 'preview',
  calculate: 'calc',
  draw_chart: 'chart',
  generate_image: 'image',
  export_conversation: 'export',
  __invalid__: 'warning',
}

const ICON_PATHS = {
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>',
  read: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
  globe: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
  run: '<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>',
  calc: '<rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="12" x2="8.01" y2="12"/><line x1="12" y1="12" x2="12.01" y2="12"/><line x1="16" y1="12" x2="16.01" y2="12"/><line x1="8" y1="16" x2="8.01" y2="16"/><line x1="12" y1="16" x2="12.01" y2="16"/><line x1="16" y1="16" x2="16.01" y2="16"/>',
  chart: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
  export: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  preview: '<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  archive: '<polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/>',
  move: '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  warning: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  minus: '<line x1="5" y1="12" x2="19" y2="12"/>',
  tool: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
}

const isRunning = computed(() => props.live || props.trace.some(round => round.running))
const lastUsedRound = computed(() => [...props.trace].reverse().find(round => round.used) || null)
const budgetLine = computed(() => {
  const info = lastUsedRound.value?.used
  if (!info) return ''
  const leftBytes = Math.max(0, info.bytesTotal - info.bytes)
  return [
    `已用 ${info.rounds}/${info.roundsTotal} 轮`,
    `写入 ${info.files}/${info.filesTotal} 个文件`,
    `额度剩 ${formatBytes(leftBytes)}`,
  ].join(' · ')
})

// 同一时刻只展开一条步骤的输出，避免时间线被大段结果撑开
const openStep = ref('')
const stepKey = (round, index) => `${round}:${index}`
function toggleStep(round, index) {
  const key = stepKey(round, index)
  openStep.value = openStep.value === key ? '' : key
}

function stepLabel(step) {
  return step.label || TOOL_LABELS[step.tool] || step.tool || '工具'
}

// 旧消息的步骤没有结构化目标，退回展示摘要，信息不丢
function stepTarget(step) {
  if (step.target !== undefined) return step.target
  return step.label ? '' : (step.summary || '')
}

function iconPath(step) {
  if (step.aborted) return ICON_PATHS.minus
  if (step.ok === false && !step.running && !step.pending) return ICON_PATHS.x
  return ICON_PATHS[step.icon] || ICON_PATHS[TOOL_ICONS[step.tool]] || ICON_PATHS.tool
}
</script>

<style scoped>
.tool-trace { margin: 4px 0; min-width: 0; }
.trace-round + .trace-round { margin-top: 6px; }
.round-head {
  font-size: 11px; color: var(--text-muted);
  padding: 2px 0; letter-spacing: 0.02em;
}
.round-text { font-size: 13px; color: var(--text-secondary); margin: 2px 0; }

.trace-step { min-width: 0; }
.step-row {
  display: flex; align-items: center; gap: 7px;
  width: 100%; max-width: 100%;
  padding: 3px 6px 3px 2px; border: none; border-radius: 6px;
  background: transparent; font-family: inherit; font-size: 12px;
  color: var(--text-subtle); cursor: pointer; text-align: left;
  transition: background 0.15s;
}
.step-row:hover { background: var(--bg-hover); }
.step-icon {
  flex-shrink: 0; width: 16px; height: 16px;
  display: inline-flex; align-items: center; justify-content: center;
  color: var(--text-subtle);
}
.trace-step.running .step-icon { color: var(--accent); }
.trace-step.fail .step-icon { color: var(--danger); }
.trace-step.pending { opacity: 0.55; }
.trace-step.aborted .step-icon { color: var(--text-muted); }
.step-label { flex-shrink: 0; color: var(--text-secondary); }
.trace-step.running .step-label { color: var(--text-primary); }
.trace-step.fail .step-label { color: var(--danger); }
.step-target {
  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
  font-size: 11.5px; color: var(--text-secondary);
}
.step-stats { flex-shrink: 0; display: inline-flex; gap: 5px; font-style: normal; font-variant-numeric: tabular-nums; }
.step-stats em { font-style: normal; font-size: 11.5px; font-weight: 600; }
.stat-add { color: #16a34a; }
.stat-del { color: var(--danger); }
:root[data-theme="dark"] .stat-add { color: #4ade80; }
.step-aborted { flex-shrink: 0; font-size: 11px; color: var(--text-muted); }
.step-chevron { flex-shrink: 0; margin-left: auto; opacity: 0; transition: transform 0.15s, opacity 0.15s; }
.step-row:hover .step-chevron, .step-chevron.open { opacity: 0.7; }
.step-chevron.open { transform: rotate(90deg); }

.step-detail {
  margin: 2px 0 6px 9px; padding: 2px 0 2px 12px;
  border-left: 2px solid var(--border-color);
}
.step-summary { font-size: 11.5px; color: var(--text-subtle); word-break: break-word; margin: 0 0 4px; }
.step-output {
  margin: 0; padding: 6px 8px; border-radius: 6px;
  background: var(--bg-sidebar); color: var(--text-subtle);
  font-family: 'SF Mono', 'Fira Code', monospace; font-size: 11px;
  white-space: pre-wrap; word-break: break-all;
  max-height: 160px; overflow-y: auto;
  scrollbar-width: thin; scrollbar-color: var(--border-color) transparent;
}
.step-output::-webkit-scrollbar { width: 5px; }
.step-output::-webkit-scrollbar-thumb { background: var(--border-color); border-radius: 3px; }
.step-output::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }

.trace-status {
  display: flex; align-items: center; gap: 7px;
  padding: 3px 6px 3px 2px; font-size: 12px;
}
.step-spinner {
  width: 12px; height: 12px; flex-shrink: 0;
  border: 2px solid color-mix(in srgb, var(--accent) 25%, transparent);
  border-top-color: var(--accent); border-radius: 50%;
  animation: trace-spin 0.8s linear infinite;
}
@keyframes trace-spin { to { transform: rotate(360deg); } }
.status-shimmer {
  background: linear-gradient(90deg, var(--text-subtle) 20%, var(--text-primary) 50%, var(--text-subtle) 80%);
  background-size: 200% 100%;
  -webkit-background-clip: text; background-clip: text;
  color: transparent;
  animation: trace-shimmer 1.8s linear infinite;
}
@keyframes trace-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

.trace-note { font-size: 11.5px; color: var(--text-subtle); padding: 2px 0 2px 2px; }
.trace-note.fail { color: var(--danger); }
.trace-budget {
  font-size: 11px; color: var(--text-muted);
  padding: 3px 0 0 2px; font-variant-numeric: tabular-nums;
}
</style>