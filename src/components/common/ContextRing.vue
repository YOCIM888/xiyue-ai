<template>
  <span ref="rootEl" class="ctx-ring-wrap" :class="`align-${align}`">
    <button
      class="ctx-ring-btn"
      :class="{ open }"
      :title="`上下文用量 ${usedText} / ${limitText} tokens`"
      @click="toggle"
    >
      <svg :width="size" :height="size" :viewBox="`0 0 ${size} ${size}`">
        <circle
          :cx="center"
          :cy="center"
          :r="radius"
          fill="none"
          stroke-width="2.4"
          class="ring-bg"
        />
        <circle
          :cx="center"
          :cy="center"
          :r="radius"
          fill="none"
          stroke-width="2.4"
          :stroke="color"
          :stroke-dasharray="circumference"
          :stroke-dashoffset="dashOffset"
          :transform="`rotate(-90 ${center} ${center})`"
          stroke-linecap="round"
          class="ring-fg"
        />
      </svg>
      <span class="ctx-pct" :style="{ color }">{{ pctLabel }}</span>
    </button>

    <div v-if="open" class="ctx-pop" @click.stop>
      <div class="ctx-pop-head">
        <span class="ctx-dot" :style="{ background: color }"></span>
        上下文用量
      </div>
      <div class="ctx-pop-value">
        {{ usedText }}<span class="ctx-pop-sep">/</span>{{ limitText }}
      </div>
      <div class="ctx-pop-sub">tokens · 已占用 {{ pctText }}%</div>
    </div>
  </span>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { formatTokens } from '../../utils/contextUsage'

const props = defineProps({
  used: { type: Number, default: 0 },
  limit: { type: Number, default: 131072 },
  size: { type: Number, default: 24 },
  align: { type: String, default: 'right' },
})

const rootEl = ref(null)
const open = ref(false)

const center = computed(() => props.size / 2)
const radius = computed(() => props.size / 2 - 2.2)
const circumference = computed(() => 2 * Math.PI * radius.value)

const usedText = computed(() => formatTokens(props.used))
const limitText = computed(() => formatTokens(props.limit))
const pctValue = computed(() => {
  if (!props.limit) return 0
  return Math.max(0, (props.used / props.limit) * 100)
})
const pctText = computed(() => pctValue.value.toFixed(1))
const pctLabel = computed(() => {
  if (pctValue.value > 999) return '999+%'
  if (pctValue.value < 1) return props.used > 0 ? '<1%' : '0%'
  return `${Math.round(pctValue.value)}%`
})

const dashOffset = computed(() => {
  const ratio = Math.min(pctValue.value, 100) / 100
  return circumference.value * (1 - ratio)
})

const color = computed(() => {
  if (pctValue.value >= 85) return '#ef4444'
  if (pctValue.value >= 60) return '#f59e0b'
  return '#6366f1'
})

function toggle() {
  open.value = !open.value
}

function onDocClick(e) {
  if (!open.value) return
  if (rootEl.value && rootEl.value.contains(e.target)) return
  open.value = false
}

onMounted(() => document.addEventListener('click', onDocClick))
onUnmounted(() => document.removeEventListener('click', onDocClick))
</script>

<style scoped>
.ctx-ring-wrap {
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
  vertical-align: middle;
}
.ctx-ring-btn {
  position: relative;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
}
.ctx-ring-btn:hover,
.ctx-ring-btn.open {
  background: var(--bg-hover);
}
.ring-bg {
  stroke: var(--border-color);
}
.ring-fg {
  transition: stroke-dashoffset 0.3s ease, stroke 0.2s ease;
}
.ctx-pct {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 7.5px;
  font-weight: 600;
  letter-spacing: -0.3px;
  line-height: 1;
  pointer-events: none;
}

.ctx-pop {
  position: absolute;
  top: calc(100% + 6px);
  z-index: 80;
  min-width: 132px;
  padding: 7px 9px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-primary);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.14);
  text-align: left;
  white-space: nowrap;
}
.align-right .ctx-pop {
  right: 0;
}
.align-left .ctx-pop {
  left: 0;
}
.ctx-pop-head {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 10px;
  color: var(--text-muted);
  margin-bottom: 3px;
}
.ctx-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
}
.ctx-pop-value {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.4;
}
.ctx-pop-sep {
  margin: 0 3px;
  color: var(--text-muted);
  font-weight: 400;
}
.ctx-pop-sub {
  font-size: 10px;
  color: var(--text-muted);
  line-height: 1.4;
}
</style>
