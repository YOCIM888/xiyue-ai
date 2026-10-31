<template>
  <div class="dream-view">
    <header class="dream-header">
      <div class="brand-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
      </div>
      <div class="brand-text">
        <h1>梦境推演</h1>
        <p>用选择走进另一个人的命运</p>
      </div>
      <button class="exit-btn" title="退出梦境推演" @click="exitDream">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
      </button>
    </header>

    <div class="dream-body">
      <DreamStage
        v-if="playing && activeWork"
        :work="activeWork"
        @back="playing = false"
      />

      <div v-else class="work-list">
        <div class="list-head">
          <h2>选择一部作品</h2>
          <p>叙事者会记住你的每一步选择，并推演随之而来的后果</p>
        </div>

        <div class="works">
          <button
            v-for="work in works"
            :key="work.id"
            class="work-card"
            :class="'cover-' + work.id"
            @click="enterWork(work)"
          >
            <div class="work-cover">
              <span class="cover-mark">{{ work.mark }}</span>
              <span class="cover-tag">{{ work.tag }}</span>
            </div>
            <div class="work-info">
              <div class="work-title-row">
                <span class="work-title">{{ work.title }}</span>
                <span class="work-progress">{{ progressText(work.id) }}</span>
              </div>
              <p class="work-desc">{{ work.description }}</p>
              <div class="work-foot">
                <span class="work-meta">{{ work.meta }}</span>
                <span class="work-cta">{{ progressText(work.id) === '未开始' ? '开始推演' : '继续推演' }} →</span>
              </div>
            </div>
          </button>
        </div>

        <p class="coming-hint">更多作品正在推演中，敬请期待。</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import DreamStage from './DreamStage.vue'
import { DREAM_WORKS } from '../../services/dream'
import { useDreamStore } from '../../stores/dream'

const router = useRouter()
const store = useDreamStore()

const works = DREAM_WORKS
const playing = ref(false)
const activeWork = ref(null)

onMounted(() => {
  store.setLoading(false)
})

function progressText(id) {
  const count = store.progressOf(id)
  return count ? `第 ${count} 幕` : '未开始'
}

function enterWork(work) {
  store.openWork(work.id)
  activeWork.value = work
  playing.value = true
}

function exitDream() {
  router.push('/chat')
}
</script>

<style scoped>
.dream-view {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-primary);
}

.dream-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px 12px 56px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-primary);
  flex-shrink: 0;
  min-height: 64px;
}
.brand-icon {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  background: linear-gradient(135deg, #1e2a5a, #4c3a8f 55%, #b06ab3);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 3px 10px rgba(76, 58, 143, 0.28);
}
.brand-text h1 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.3;
}
.brand-text p {
  margin: 0;
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.5;
}
.exit-btn {
  margin-left: auto;
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  border: 1px solid var(--border-color);
  border-radius: 9px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}
.exit-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.dream-body {
  flex: 1;
  min-height: 0;
  display: flex;
}

.work-list {
  flex: 1;
  overflow-y: auto;
  padding: 28px 24px 40px;
}
.list-head {
  max-width: 880px;
  margin: 0 auto 16px;
}
.list-head h2 {
  margin: 0 0 6px;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}
.list-head p {
  margin: 0;
  font-size: 12.5px;
  color: var(--text-muted);
}
.works {
  max-width: 880px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.work-card {
  display: flex;
  align-items: stretch;
  gap: 0;
  padding: 0;
  border: 1px solid var(--border-color);
  border-radius: 16px;
  background: var(--bg-primary);
  cursor: pointer;
  overflow: hidden;
  font-family: inherit;
  text-align: left;
  transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s;
  box-shadow: 0 1px 5px rgba(0, 0, 0, 0.04);
}
.work-card:hover {
  border-color: var(--accent);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.08);
  transform: translateY(-1px);
}

.work-cover {
  position: relative;
  width: 128px;
  min-width: 128px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #fff;
  overflow: hidden;
  background:
    radial-gradient(circle at 30% 20%, rgba(255, 255, 255, 0.22), transparent 55%),
    linear-gradient(160deg, #10131c, #2b1b23 55%, #5d1f1a);
}
.cover-xingshi::after {
  content: '';
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(115deg, transparent 0 12px, rgba(255, 255, 255, 0.04) 12px 13px);
}
.cover-mark {
  position: relative;
  z-index: 1;
  font-size: 46px;
  font-weight: 700;
  letter-spacing: 2px;
  text-shadow: 0 4px 18px rgba(0, 0, 0, 0.5);
  opacity: 0.92;
}
.cover-tag {
  position: relative;
  z-index: 1;
  font-size: 10px;
  letter-spacing: 1px;
  opacity: 0.8;
  writing-mode: vertical-rl;
}

.work-info {
  flex: 1;
  min-width: 0;
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.work-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.work-title {
  font-size: 17px;
  font-weight: 600;
  color: var(--text-primary);
}
.work-progress {
  font-size: 10.5px;
  color: var(--text-muted);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 1px 7px;
}
.work-desc {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--text-secondary);
}
.work-foot {
  margin-top: auto;
  display: flex;
  align-items: center;
  gap: 10px;
}
.work-meta {
  font-size: 11px;
  color: var(--text-muted);
}
.work-cta {
  margin-left: auto;
  font-size: 12.5px;
  color: var(--accent);
  font-weight: 500;
}

.coming-hint {
  max-width: 880px;
  margin: 20px auto 0;
  font-size: 11.5px;
  color: var(--text-muted);
  text-align: center;
}

@media (max-width: 768px) {
  .dream-header {
    padding: 10px 16px 10px 56px;
    min-height: 60px;
  }
  .brand-icon {
    width: 34px;
    height: 34px;
  }
  .work-list {
    padding: 18px 14px 32px;
  }
  .work-cover {
    width: 88px;
    min-width: 88px;
  }
  .cover-mark {
    font-size: 34px;
  }
  .cover-tag {
    font-size: 9px;
  }
  .work-info {
    padding: 13px 14px;
  }
  .work-desc {
    font-size: 12px;
  }
}
</style>
