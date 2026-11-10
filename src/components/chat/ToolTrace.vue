<template>
  <div class="tool-trace" :class="{ running: isRunning }">
    <button class="trace-toggle" @click="toggle">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline :points="open ? '6 15 12 9 18 15' : '9 18 15 12 9 6'" />
      </svg>
      <span class="trace-title">{{ headerText }}</span>
      <span v-if="isRunning" class="trace-live" title="执行中"></span>
    </button>
    <div v-if="open" class="trace-body">
      <div v-for="round in trace" :key="round.round" class="trace-round">
        <div v-if="trace.length > 1" class="round-head">第 {{ round.round }} 轮</div>
        <div v-if="round.thinking" class="round-thinking">
          <span class="round-label">思考</span>
          <MarkdownRenderer :content="round.thinking" />
        </div>
        <div v-if="round.content" class="round-text">
          <MarkdownRenderer :content="round.content" />
        </div>
        <div v-for="(step, i) in round.steps" :key="i" class="trace-step">
          <span class="step-status" :class="{ fail: !step.ok }">{{ step.ok ? '✓' : '✕' }}</span>
          <span class="step-tool">{{ toolLabel(step.tool) }}</span>
          <span class="step-summary">{{ step.summary }}</span>
          <pre v-if="step.output && step.output !== step.summary" class="step-output">{{ step.output }}</pre>
        </div>
        <p v-for="(note, i) in round.notes" :key="'note-' + i" class="trace-note">{{ note }}</p>
        <p v-if="round.error" class="trace-note fail">{{ round.error }}</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import MarkdownRenderer from '../common/MarkdownRenderer.vue'

const props = defineProps({
  trace: { type: Array, default: () => [] },
  live: { type: Boolean, default: false },
})

const TOOL_LABELS = {
  search_web: '联网搜索',
  read_document: '读取文档',
  browser: '浏览器',
  files: '文件操作',
  calculate: '本地计算',
  draw_chart: '绘制图表',
  generate_image: '生成图片',
  export_conversation: '导出对话',
  __invalid__: '无效调用',
}

// 运行中自动展开，结束后自动折叠；用户手动点过则尊重手动选择
const manualOpen = ref(null)
const isRunning = computed(() => props.live || props.trace.some(round => round.running))
const open = computed(() => (manualOpen.value === null ? isRunning.value : manualOpen.value))
const stepCount = computed(() => props.trace.reduce((sum, round) => sum + (round.steps?.length || 0), 0))

const headerText = computed(() => {
  if (!props.trace.length) return '执行过程'
  if (props.trace.length === 1) {
    const round = props.trace[0]
    if (isRunning.value) {
      const status = round.status || '执行中…'
      return stepCount.value ? `执行过程 · ${status} · 已完成 ${stepCount.value} 步` : `执行过程 · ${status}`
    }
    return `执行过程 · ${stepCount.value} 步`
  }
  return `执行过程 · ${props.trace.length} 轮 · ${stepCount.value} 步`
})

function toggle() {
  manualOpen.value = !open.value
}

function toolLabel(tool) {
  return TOOL_LABELS[tool] || tool || '工具'
}
</script>

<style scoped>
.tool-trace {
  margin: 8px 0;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  overflow: hidden;
  background: var(--bg-primary);
}
.tool-trace.running {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border-color));
}
.trace-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 8px 14px;
  border: none;
  background: var(--bg-sidebar);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.15s;
}
.trace-toggle:hover { background: var(--bg-hover); }
.trace-title {
  flex: 1;
  min-width: 0;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.trace-live {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
  animation: trace-pulse 1s ease-in-out infinite;
}
@keyframes trace-pulse {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 1; }
}
.trace-body {
  padding: 10px 14px;
  border-top: 1px solid var(--border-color);
  max-height: 420px;
  overflow-y: auto;
}
.trace-round + .trace-round {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px dashed var(--border-color);
}
.round-head {
  font-size: 11px;
  color: var(--text-muted);
  margin-bottom: 6px;
}
.round-text {
  font-size: 13px;
  line-height: 1.65;
  color: var(--text-secondary);
  margin-bottom: 8px;
}
.round-thinking {
  font-size: 12px;
  line-height: 1.65;
  color: var(--text-muted);
  margin-bottom: 8px;
  padding: 6px 10px;
  border-left: 2px solid var(--border-color);
  background: var(--bg-sidebar);
  border-radius: 0 6px 6px 0;
}
.round-label {
  display: block;
  font-size: 11px;
  margin-bottom: 2px;
}
.trace-step {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px;
  padding: 5px 0;
  font-size: 12px;
  color: var(--text-secondary);
}
.step-status { color: #16a34a; font-weight: 700; }
.step-status.fail { color: var(--danger, #dc2626); }
.step-tool {
  flex-shrink: 0;
  padding: 1px 6px;
  border-radius: 5px;
  background: var(--accent-light);
  color: var(--accent);
  font-size: 11px;
}
.step-summary { flex: 1; min-width: 0; word-break: break-word; }
.step-output {
  flex-basis: 100%;
  margin: 4px 0 0;
  padding: 6px 8px;
  border-radius: 6px;
  background: var(--bg-sidebar);
  color: var(--text-muted);
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 11px;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 160px;
  overflow-y: auto;
}
.trace-note {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--text-muted);
}
.trace-note.fail { color: var(--danger, #dc2626); }
</style>
