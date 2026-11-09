<template>
  <section class="dream-stage">
    <header class="stage-head">
      <button class="stage-back" title="返回作品列表" @click="$emit('back')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
        <span>作品</span>
      </button>
      <div class="stage-title">
        <span class="stage-name">{{ work.title }}</span>
        <span class="stage-progress">第 {{ store.turns.length }} 幕</span>
      </div>
      <div class="stage-actions">
        <button class="stage-btn" :class="{ active: showState }" @click="showState = !showState">状态</button>
        <button class="stage-btn" @click="exportStory">导出</button>
        <button class="stage-restart" title="重新开始这部作品" @click="restart">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>
          <span>重新开始</span>
        </button>
      </div>
    </header>

    <div v-if="store.branches.length > 1" class="dream-branch-bar">
      <span class="branch-label">分支</span>
      <button
        v-for="branch in store.branches"
        :key="branch.id"
        class="branch-chip"
        :class="{ active: branch.id === store.activeBranchId }"
        @click="switchBranch(branch.id)"
      >
        {{ branch.name }} · {{ branch.turns.length }} 幕
      </button>
    </div>

    <div v-if="showState" class="dream-state-panel">
      <div v-for="row in stateRows" :key="row.label" class="ds-row">
        <span class="ds-label">{{ row.label }}</span>
        <span class="ds-value">{{ row.value }}</span>
      </div>
      <p v-if="store.summary" class="ds-summary">摘要：{{ store.summary }}</p>
    </div>

    <div ref="feedEl" class="stage-feed">
      <div class="feed-inner">
        <article class="scene-card opening">
          <div class="scene-label">开场</div>
          <p v-for="(p, i) in openingParagraphs" :key="'o' + i" class="scene-p">{{ p }}</p>
        </article>

        <template v-for="(turn, idx) in store.turns" :key="turn.id">
          <div class="choice-chip">
            <span class="chip-key">你选择了</span>
            <span class="chip-text">{{ turn.fromChoice }}</span>
          </div>
          <article class="scene-card">
            <div class="scene-head">
              <div class="scene-label">第 {{ idx + 1 }} 幕</div>
              <button class="rewind-btn" title="回到这一幕之前重新选择" @click="rewind(idx)">重选</button>
            </div>
            <p v-for="(p, i) in splitParagraphs(turn.narrative)" :key="i" class="scene-p">{{ p }}</p>
          </article>
        </template>

        <template v-if="pendingChoice">
          <div class="choice-chip pending">
            <span class="chip-key">你选择了</span>
            <span class="chip-text">{{ pendingChoice }}</span>
          </div>
        </template>

        <div v-if="store.loading" class="narrating">
          <span class="dot"></span><span class="dot"></span><span class="dot"></span>
          <span class="narrating-text">叙事者正在推演…</span>
          <button class="stop-btn" @click="stopGenerating">停止</button>
        </div>

        <div v-if="errorMessage" class="stage-error">
          <span>{{ errorMessage }}</span>
          <button :disabled="store.loading" @click="retryLast">重试</button>
        </div>
      </div>
    </div>

    <footer class="choice-panel">
      <div class="panel-inner">
        <div class="panel-head">
          <span class="panel-title">你会怎么做？</span>
          <span v-if="store.loading" class="panel-note">推演中，请稍候</span>
          <span v-else class="panel-note">也可以自定义行动</span>
        </div>

        <div class="option-list">
          <button
            v-for="(opt, i) in currentOptions"
            :key="i + opt"
            class="option-btn"
            :disabled="store.loading"
            @click="choose(opt)"
          >
            <span class="option-key">{{ 'ABC'[i] }}</span>
            <span class="option-text">{{ opt }}</span>
          </button>
        </div>

        <form class="custom-row" @submit.prevent="submitCustom">
          <span class="option-key custom-key">D</span>
          <input
            v-model="customText"
            class="custom-input"
            type="text"
            maxlength="80"
            placeholder="自定义行动，然后提交…"
            :disabled="store.loading"
          />
          <button class="custom-send" type="submit" :disabled="!customText.trim() || store.loading">提交</button>
          <ContextRing class="custom-ctx" :used="contextUsed" :limit="contextLimit" align="right" pop-direction="up" :size="22" />
        </form>
      </div>
    </footer>
  </section>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { generateNextScene, isDreamApiReady } from '../../services/dream'
import { useDreamStore } from '../../stores/dream'
import { useSettingsStore } from '../../stores/settings'
import ContextRing from '../common/ContextRing.vue'
import { estimateTokens } from '../../utils/contextUsage'

const props = defineProps({
  work: { type: Object, required: true },
})
defineEmits(['back'])

const store = useDreamStore()
const settings = useSettingsStore()

const feedEl = ref(null)
const customText = ref('')
const pendingChoice = ref('')
const errorMessage = ref('')
const lastChoice = ref('')
const showState = ref(false)
let activeAbort = null

const stateRows = computed(() => {
  const state = store.state || {}
  return [
    { label: '时间地点', value: state.location || '—' },
    { label: '人物关系', value: (state.characters || []).join('；') || '—' },
    { label: '持有物品', value: (state.items || []).join('；') || '—' },
    { label: '未解线索', value: (state.clues || []).join('；') || '—' },
    { label: '关键事实', value: (state.facts || []).join('；') || '—' },
  ]
})

const openingParagraphs = computed(() => splitParagraphs(props.work.opening))
const currentOptions = computed(() => {
  const turns = store.turns
  return turns.length ? turns[turns.length - 1].options : props.work.openingOptions
})

// 本作品窗口积累的上下文：作品设定 + 开场 + 已推演的每一幕
const contextUsed = computed(() => {
  const base = estimateTokens(`${props.work.setting}\n${props.work.opening}`) + 160
  const story = store.turns
    .map(t => `${t.narrative}\n你选择了：${t.fromChoice}\n${(t.options || []).join('\n')}`)
    .join('\n\n')
  return base + estimateTokens(story)
})
const contextLimit = computed(() => settings.contextLength || 131072)

onMounted(async () => {
  await nextTick()
  scrollToBottom(false)
})

onUnmounted(() => {
  if (activeAbort) {
    activeAbort.abort()
    activeAbort = null
  }
})

function splitParagraphs(text) {
  return String(text || '')
    .split(/\n+/)
    .map(p => p.trim())
    .filter(Boolean)
}

function scrollToBottom(smooth = true) {
  const el = feedEl.value
  if (!el) return
  el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
}

function toast(message, type = 'info') {
  window.__ui?.showToast(message, type, 3000)
}

async function choose(text) {
  const value = String(text || '').trim()
  if (!value || store.loading) return
  if (!isDreamApiReady(settings)) {
    toast('请先在设置中配置模型 API')
    return
  }

  pendingChoice.value = value
  lastChoice.value = value
  errorMessage.value = ''
  customText.value = ''
  store.setLoading(true)
  const controller = new AbortController()
  activeAbort = controller
  await nextTick()
  scrollToBottom(true)

  try {
    const result = await generateNextScene({
      work: props.work,
      turns: store.turns,
      choice: value,
      settings,
      state: store.state,
      summary: store.summary,
      signal: controller.signal,
    })
    store.addTurn({
      narrative: result.narrative,
      options: result.options,
      fromChoice: value,
      state: result.state,
      summary: result.summary,
    })
    pendingChoice.value = ''
    await nextTick()
    scrollToBottom(true)
  } catch (err) {
    pendingChoice.value = ''
    if (err?.name === 'AbortError') {
      toast('已停止推演', 'info')
    } else {
      errorMessage.value = `推演失败：${err.message || '请稍后重试'}`
      toast(errorMessage.value, 'error')
    }
  } finally {
    if (activeAbort === controller) activeAbort = null
    store.setLoading(false)
  }
}

function stopGenerating() {
  if (activeAbort) {
    activeAbort.abort()
    activeAbort = null
  }
  store.setLoading(false)
}

function retryLast() {
  if (!lastChoice.value || store.loading) return
  choose(lastChoice.value)
}

async function rewind(turnIndex) {
  if (store.loading) return
  const ok = await window.__ui?.showConfirm(
    `回到第 ${turnIndex + 1} 幕之前重新选择？会创建一个新分支，当前分支会保留。`,
    { confirmText: '重新选择', cancelText: '取消' }
  )
  if (!ok) return
  const changed = store.rewindTo(turnIndex)
  if (!changed) return
  pendingChoice.value = ''
  errorMessage.value = ''
  customText.value = ''
  toast('已回到对应的抉择点，可以在新分支中重新选择', 'success', 2800)
  await nextTick()
  scrollToBottom(true)
}

function switchBranch(branchId) {
  if (store.loading || branchId === store.activeBranchId) return
  store.switchBranch(branchId)
  pendingChoice.value = ''
  errorMessage.value = ''
  nextTick(() => scrollToBottom(false))
}

function exportStory() {
  const lines = [
    `# ${props.work.title}`,
    '',
    `> ${props.work.tag || '抉择叙事'} · 导出时间：${new Date().toLocaleString()}`,
    '',
    '## 开场',
    '',
    props.work.opening,
    '',
  ]
  let lastChoice = ''
  store.turns.forEach((turn, index) => {
    lines.push(`## 第 ${index + 1} 幕`, '')
    if (turn.fromChoice) lines.push(`> 你选择了：${turn.fromChoice}`, '')
    lines.push(turn.narrative, '')
    lastChoice = turn.fromChoice
  })
  if (lastChoice) lines.push(`> 最后选择：${lastChoice}`, '')
  const safeName = String(props.work.title || '梦境推演').replace(/[\\/:*?"<>|]/g, '_').slice(0, 50)
  const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${safeName}-${new Date().toISOString().slice(0, 10)}.md`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  toast('剧情已导出', 'success', 2000)
}

function submitCustom() {
  const value = customText.value.trim()
  if (!value) return
  choose(value)
}

async function restart() {
  const ok = await window.__ui?.showConfirm('重新开始会清空这部作品的所有推演记录，确定吗？', {
    confirmText: '重新开始',
    cancelText: '取消',
  })
  if (!ok) return
  store.resetWork(props.work.id)
  // 重置会清空 activeId，重新打开以保证后续选项能正常记录
  store.openWork(props.work.id)
  pendingChoice.value = ''
  customText.value = ''
  toast('已重新开始', 'success')
}
</script>

<style scoped>
.dream-stage {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.stage-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 18px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-primary);
  flex-shrink: 0;
}
.stage-back,
.stage-restart {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 9px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.15s;
}
.stage-back:hover,
.stage-restart:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.stage-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 6px;
}
.stage-restart { margin-left: 0; }
.stage-btn {
  padding: 5px 10px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.15s;
}
.stage-btn:hover,
.stage-btn.active {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.stage-btn.active {
  border-color: var(--accent);
  color: var(--accent);
}

.dream-branch-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 18px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-primary);
  overflow-x: auto;
  flex-shrink: 0;
}
.branch-label { font-size: 11px; color: var(--text-muted); flex-shrink: 0; }
.branch-chip {
  padding: 4px 10px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--bg-card);
  color: var(--text-secondary);
  font-size: 11px;
  font-family: inherit;
  white-space: nowrap;
  cursor: pointer;
}
.branch-chip.active {
  border-color: var(--accent);
  background: var(--accent-light);
  color: var(--accent);
  font-weight: 600;
}

.dream-state-panel {
  padding: 10px 18px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-sidebar);
  flex-shrink: 0;
}
.ds-row {
  display: flex;
  gap: 10px;
  padding: 3px 0;
  font-size: 12px;
  line-height: 1.5;
}
.ds-label { width: 64px; flex-shrink: 0; color: var(--text-muted); }
.ds-value { flex: 1; min-width: 0; color: var(--text-secondary); }
.ds-summary {
  margin: 6px 0 0;
  padding-top: 6px;
  border-top: 1px dashed var(--border-color);
  font-size: 11px;
  line-height: 1.6;
  color: var(--text-muted);
}
.stage-title {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}
.stage-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}
.stage-progress {
  font-size: 11px;
  color: var(--text-muted);
}

.stage-feed {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  background: var(--bg-sidebar);
  padding: 20px 18px 28px;
}
.feed-inner {
  max-width: 760px;
  margin: 0 auto;
}

.scene-card {
  border: 1px solid var(--border-color);
  border-radius: 14px;
  background: var(--bg-primary);
  padding: 14px 18px 8px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
}
.scene-card + .scene-card {
  margin-top: 10px;
}
.scene-label {
  font-size: 10.5px;
  letter-spacing: 1px;
  color: var(--text-muted);
  margin-bottom: 6px;
}
.scene-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.scene-head .scene-label { margin-bottom: 6px; }
.rewind-btn {
  padding: 2px 8px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: transparent;
  color: var(--text-muted);
  font-size: 10px;
  font-family: inherit;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s, color 0.15s, border-color 0.15s;
}
.scene-card:hover .rewind-btn { opacity: 1; }
.rewind-btn:hover {
  color: var(--accent);
  border-color: var(--accent);
}
.narrating .stop-btn {
  margin-left: 8px;
  padding: 3px 9px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-card);
  color: var(--text-secondary);
  font-size: 11px;
  font-family: inherit;
  cursor: pointer;
}
.stage-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 10px;
  padding: 9px 12px;
  border: 1px solid var(--danger);
  border-radius: 10px;
  background: var(--danger-bg);
  color: var(--danger);
  font-size: 12px;
}
.stage-error button {
  flex-shrink: 0;
  padding: 4px 10px;
  border: 1px solid var(--danger);
  border-radius: 6px;
  background: transparent;
  color: var(--danger);
  font-size: 11px;
  font-family: inherit;
  cursor: pointer;
}
@media (max-width: 768px) {
  .rewind-btn { opacity: 0.65; }
  .stage-restart span { display: none; }
  .stage-btn { padding: 5px 8px; }
}
.scene-p {
  margin: 0 0 8px;
  font-size: 14px;
  line-height: 1.85;
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-word;
}
.opening .scene-p {
  color: var(--text-secondary);
}

.choice-chip {
  display: flex;
  align-items: baseline;
  justify-content: flex-end;
  gap: 8px;
  margin: 12px 2px;
}
.chip-key {
  font-size: 10.5px;
  color: var(--text-muted);
}
.chip-text {
  max-width: 80%;
  padding: 6px 12px;
  border-radius: 12px 12px 2px 12px;
  background: var(--accent);
  color: #fff;
  font-size: 12.5px;
  line-height: 1.5;
}
.choice-chip.pending .chip-text {
  opacity: 0.75;
}

.narrating {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 14px 0 4px;
  color: var(--text-muted);
  font-size: 11.5px;
}
.narrating .dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--accent);
  animation: blink 1s ease-in-out infinite;
}
.narrating .dot:nth-child(2) { animation-delay: 0.2s; }
.narrating .dot:nth-child(3) { animation-delay: 0.4s; }
.narrating-text {
  margin-left: 6px;
}
@keyframes blink {
  0%, 100% { opacity: 0.25; }
  50% { opacity: 1; }
}

.choice-panel {
  flex-shrink: 0;
  border-top: 1px solid var(--border-color);
  background: var(--bg-primary);
  padding: 10px 18px calc(10px + env(safe-area-inset-bottom, 0px));
}
.panel-inner {
  max-width: 760px;
  margin: 0 auto;
}
.panel-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.panel-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}
.panel-note {
  margin-left: auto;
  font-size: 10.5px;
  color: var(--text-muted);
}
.option-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.option-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 12px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: transparent;
  color: var(--text-primary);
  font-family: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition: all 0.15s;
}
.option-btn:hover:not(:disabled) {
  border-color: var(--accent);
  background: var(--accent-light);
}
.option-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.option-key {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  border-radius: 6px;
  background: var(--bg-hover);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
}
.option-btn:hover:not(:disabled) .option-key {
  background: var(--accent);
  color: #fff;
}
.option-text {
  flex: 1;
  min-width: 0;
}

.custom-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
}
.custom-ctx {
  flex-shrink: 0;
}
.custom-key {
  background: var(--accent-light);
  color: var(--accent);
}
.custom-input {
  flex: 1;
  min-width: 0;
  padding: 9px 11px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-input);
  color: var(--text-primary);
  font-family: inherit;
  font-size: 12.5px;
  outline: none;
}
.custom-input:focus {
  border-color: var(--accent);
}
.custom-send {
  flex-shrink: 0;
  padding: 9px 16px;
  border: none;
  border-radius: 10px;
  background: var(--accent);
  color: #fff;
  font-family: inherit;
  font-size: 12.5px;
  cursor: pointer;
}
.custom-send:disabled {
  background: var(--bg-hover);
  color: var(--text-muted);
  cursor: not-allowed;
}

@media (max-width: 768px) {
  .stage-head {
    padding: 8px 12px;
  }
  .stage-feed {
    padding: 14px 12px 20px;
  }
  .scene-card {
    padding: 12px 14px 6px;
  }
  .scene-p {
    font-size: 13.5px;
    line-height: 1.8;
  }
  .choice-panel {
    padding: 8px 12px calc(8px + env(safe-area-inset-bottom, 0px));
  }
  .stage-restart span {
    display: none;
  }
}
</style>
