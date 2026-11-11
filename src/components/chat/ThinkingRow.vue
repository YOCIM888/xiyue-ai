<template>
  <div class="thinking-row" :class="{ live }">
    <button class="thinking-row-toggle" type="button" @click="toggle">
      <svg class="thinking-chevron" :class="{ open }" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      <span :class="live ? 'status-shimmer' : 'thinking-label'">{{ live ? '深度思考中' : '深度思考' }}</span>
      <span v-if="live" class="cursor-blink">▍</span>
    </button>
    <div v-if="open" ref="bodyRef" class="thinking-row-body">
      <MarkdownRenderer :content="content" symbol-style />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import MarkdownRenderer from '../common/MarkdownRenderer.vue'

const props = defineProps({
  content: { type: String, default: '' },
  live: { type: Boolean, default: false },
})

// 流式思考时自动展开跟随，结束后自动收起；手动点过则尊重手动选择
const manualOpen = ref(null)
const open = computed(() => (manualOpen.value === null ? props.live : manualOpen.value))
const bodyRef = ref(null)

function toggle() {
  manualOpen.value = !open.value
}

watch(() => props.content, () => {
  if (!props.live || !open.value) return
  nextTick(() => {
    if (bodyRef.value) bodyRef.value.scrollTop = bodyRef.value.scrollHeight
  })
})
</script>

<style scoped>
.thinking-row { margin: 2px 0; }
.thinking-row-toggle {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 3px 6px 3px 2px; border: none; border-radius: 6px;
  background: transparent; color: var(--text-subtle);
  font-size: 12px; font-family: inherit; cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.thinking-row-toggle:hover { background: var(--bg-hover); color: var(--text-secondary); }
.thinking-chevron { transition: transform 0.15s; flex-shrink: 0; }
.thinking-chevron.open { transform: rotate(90deg); }
.thinking-label { color: inherit; }
.thinking-row-body {
  margin: 2px 0 6px 7px; padding: 2px 0 2px 12px;
  border-left: 2px solid var(--border-color);
  font-size: 12.5px; color: var(--text-muted); line-height: 1.7;
  max-height: 320px; overflow-y: auto;
  scrollbar-width: thin; scrollbar-color: var(--border-color) transparent;
}
.thinking-row-body::-webkit-scrollbar { width: 5px; }
.thinking-row-body::-webkit-scrollbar-thumb { background: var(--border-color); border-radius: 3px; }
.thinking-row-body::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }
.thinking-row-body :deep(.markdown-body) { font-size: 12.5px; color: var(--text-muted); }
.cursor-blink { animation: think-blink 1s step-end infinite; color: var(--accent); font-weight: bold; }
@keyframes think-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
.status-shimmer {
  background: linear-gradient(90deg, var(--text-subtle) 20%, var(--text-primary) 50%, var(--text-subtle) 80%);
  background-size: 200% 100%;
  -webkit-background-clip: text; background-clip: text;
  color: transparent;
  animation: think-shimmer 1.8s linear infinite;
}
@keyframes think-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
</style>