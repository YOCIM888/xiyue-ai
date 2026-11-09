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
              <p v-if="store.progressSummary(work.id)" class="work-last">
                上次：{{ store.progressSummary(work.id) }}
              </p>
              <div class="work-foot">
                <span class="work-meta">{{ work.meta }}</span>
                <span class="work-cta">{{ progressText(work.id) === '未开始' ? '开始推演' : '继续推演' }} →</span>
              </div>
            </div>
            <span
              v-if="work.custom"
              class="work-delete"
              title="删除这个自定义作品"
              @click.stop="deleteCustomWork(work)"
            >×</span>
          </button>

          <button class="work-card create-card" @click="openCreate">
            <div class="work-cover create-cover">
              <span class="create-plus">＋</span>
            </div>
            <div class="work-info">
              <div class="work-title-row">
                <span class="work-title">新建作品</span>
              </div>
              <p class="work-desc">自定义世界观、主角、开场与初始选项。</p>
              <div class="work-foot">
                <span class="work-meta">本地创建 · 多线走向</span>
                <span class="work-cta">开始创作 →</span>
              </div>
            </div>
          </button>
        </div>

        <p class="coming-hint">更多作品正在推演中，敬请期待。</p>
      </div>
    </div>

    <div v-if="createOpen" class="dream-modal-overlay" @click.self="createOpen = false">
      <div class="dream-modal">
        <div class="dm-head">
          <h3>新建作品</h3>
          <button @click="createOpen = false">×</button>
        </div>
        <div class="dm-body">
          <div class="dm-field">
            <label>作品标题</label>
            <input v-model="form.title" type="text" maxlength="20" placeholder="例如：雾港来信" />
          </div>
          <div class="dm-field">
            <label>一句话简介</label>
            <input v-model="form.description" type="text" maxlength="120" placeholder="留空则从世界设定中截取" />
          </div>
          <div class="dm-field">
            <label>世界设定与主角</label>
            <textarea v-model="form.setting" rows="5" placeholder="世界背景、主角身份、重要人物、当前处境、基调…"></textarea>
          </div>
          <div class="dm-field">
            <label>开场剧情</label>
            <textarea v-model="form.opening" rows="5" placeholder="故事从哪一刻开始？"></textarea>
          </div>
          <div class="dm-field">
            <label>初始三个选项（每行一个）</label>
            <textarea v-model="form.optionsText" rows="3" placeholder="观察四周\n寻找可以交谈的人\n立刻离开这里"></textarea>
          </div>
          <div class="dm-field">
            <label>叙事风格</label>
            <input v-model="form.voice" type="text" maxlength="80" placeholder="例如：冷峻克制的悬疑笔调" />
          </div>
        </div>
        <div class="dm-actions">
          <button class="btn-secondary" @click="createOpen = false">取消</button>
          <button class="btn-primary" @click="saveWork">创建并进入</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import DreamStage from './DreamStage.vue'
import { useDreamStore } from '../../stores/dream'

const router = useRouter()
const store = useDreamStore()

const works = computed(() => store.allWorks)
const playing = ref(false)
const activeWork = ref(null)
const createOpen = ref(false)
const form = reactive({
  title: '',
  description: '',
  setting: '',
  opening: '',
  optionsText: '',
  voice: '',
})

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

function openCreate() {
  createOpen.value = true
}

function saveWork() {
  const options = form.optionsText
    .split('\n')
    .map(item => item.trim())
    .filter(Boolean)
  const work = store.createWork({
    title: form.title,
    description: form.description,
    setting: form.setting,
    opening: form.opening,
    openingOptions: options,
    voice: form.voice,
  })
  if (!work) return
  createOpen.value = false
  form.title = ''
  form.description = ''
  form.setting = ''
  form.opening = ''
  form.optionsText = ''
  form.voice = ''
  window.__ui?.showToast('作品已创建', 'success', 2000)
  enterWork(work)
}

async function deleteCustomWork(work) {
  const ok = await window.__ui?.showConfirm(`删除自定义作品《${work.title}》？它的推演进度也会一并删除。`, {
    confirmText: '删除',
    cancelText: '取消',
  })
  if (!ok) return
  store.removeCustomWork(work.id)
  window.__ui?.showToast('自定义作品已删除', 'success', 2000)
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
  position: relative;
}
.work-card:hover {
  border-color: var(--accent);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.08);
  transform: translateY(-1px);
}
.work-last {
  margin: 5px 0 0;
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.work-delete {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--bg-hover);
  color: var(--text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  opacity: 0;
  transition: opacity 0.15s, background 0.15s, color 0.15s;
}
.work-card:hover .work-delete { opacity: 1; }
.work-delete:hover { background: var(--danger-bg); color: var(--danger); }
.create-card { border-style: dashed; }
.create-cover {
  background: var(--bg-sidebar);
  color: var(--accent);
}
.create-plus { font-size: 34px; font-weight: 300; line-height: 1; }

.dream-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.dream-modal {
  width: 620px;
  max-width: 100%;
  max-height: 90dvh;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-color);
  border-radius: 16px;
  background: var(--bg-primary);
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.22);
  overflow: hidden;
}
.dm-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border-color);
}
.dm-head h3 { margin: 0; font-size: 15px; color: var(--text-primary); }
.dm-head button {
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 18px;
  cursor: pointer;
}
.dm-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px 18px;
}
.dm-field { margin-bottom: 12px; }
.dm-field label {
  display: block;
  margin-bottom: 5px;
  font-size: 12px;
  color: var(--text-secondary);
}
.dm-field input,
.dm-field textarea {
  width: 100%;
  padding: 9px 11px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: 13px;
  font-family: inherit;
  line-height: 1.6;
  outline: none;
  box-sizing: border-box;
  resize: vertical;
}
.dm-field input:focus,
.dm-field textarea:focus { border-color: var(--accent); }
.dm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 18px;
  border-top: 1px solid var(--border-color);
}
.btn-primary {
  padding: 9px 16px;
  border: none;
  border-radius: 8px;
  background: var(--accent);
  color: #fff;
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
}
.btn-secondary {
  padding: 9px 16px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
}
@media (max-width: 768px) {
  .work-delete { opacity: 0.7; }
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
.cover-xingshi .work-cover::after {
  content: '';
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(115deg, transparent 0 12px, rgba(255, 255, 255, 0.04) 12px 13px);
}
.cover-fanchen .work-cover {
  background:
    radial-gradient(circle at 30% 20%, rgba(255, 255, 255, 0.2), transparent 55%),
    linear-gradient(160deg, #0b1512, #17453a 55%, #7d6a24);
}
.cover-qishi .work-cover {
  background:
    radial-gradient(circle at 30% 20%, rgba(255, 255, 255, 0.2), transparent 55%),
    linear-gradient(160deg, #0d1520, #24405a 55%, #4d7195);
}
.cover-fanchen .work-cover::after,
.cover-qishi .work-cover::after {
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
