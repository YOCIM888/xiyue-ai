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
      <button class="stage-restart" title="重新开始这部作品" @click="restart">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>
        <span>重新开始</span>
      </button>
    </header>

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
            <div class="scene-label">第 {{ idx + 1 }} 幕</div>
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
        </form>
      </div>
    </footer>
  </section>
</template>

<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import { generateNextScene, isDreamApiReady } from '../../services/dream'
import { useDreamStore } from '../../stores/dream'
import { useSettingsStore } from '../../stores/settings'

const props = defineProps({
  work: { type: Object, required: true },
})
defineEmits(['back'])

const store = useDreamStore()
const settings = useSettingsStore()

const feedEl = ref(null)
const customText = ref('')
const pendingChoice = ref('')

const openingParagraphs = computed(() => splitParagraphs(props.work.opening))
const currentOptions = computed(() => {
  const turns = store.turns
  return turns.length ? turns[turns.length - 1].options : props.work.openingOptions
})

onMounted(async () => {
  await nextTick()
  scrollToBottom(false)
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
  customText.value = ''
  store.setLoading(true)
  await nextTick()
  scrollToBottom(true)

  try {
    const result = await generateNextScene({
      work: props.work,
      turns: store.turns,
      choice: value,
      settings,
    })
    store.addTurn({
      narrative: result.narrative,
      options: result.options,
      fromChoice: value,
    })
    pendingChoice.value = ''
    await nextTick()
    scrollToBottom(true)
  } catch (err) {
    pendingChoice.value = ''
    toast(`推演失败：${err.message || '请稍后重试'}`, 'error')
  } finally {
    store.setLoading(false)
  }
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
.stage-restart {
  margin-left: auto;
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
