<template>
  <Teleport to="body">
    <div class="skill-overlay" :class="{ open: visible }" @click.self="close">
      <div class="skill-panel" :class="{ open: visible }">
        <div class="skill-header">
          <h2>技能管理</h2>
          <button class="btn-close" @click="close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div class="skill-body">
          <div class="skill-card">
            <div class="skill-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
            </div>
            <div class="skill-info">
              <div class="skill-name">
                链接识别
                <span class="skill-tag">默认</span>
              </div>
              <div class="skill-desc">读取你发送的链接内容，作为上下文提供给 AI</div>
            </div>
            <label class="switch" :title="settings.linkSkillEnabled ? '点击关闭' : '点击开启'">
              <input v-model="settings.linkSkillEnabled" type="checkbox" />
              <span class="switch-track"><span class="switch-thumb"></span></span>
            </label>
          </div>
          

          <div class="skill-card">
            <div class="skill-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>
            </div>
            <div class="skill-info">
              <div class="skill-name">
                文档解析
                <span class="skill-tag muted">默认</span>
              </div>
              <div class="skill-desc">从「我的文档」选择文件，读取正文后作为上下文提供给 AI</div>
            </div>
            <label class="switch" :title="settings.documentSkillEnabled ? '点击关闭' : '点击开启'">
              <input v-model="settings.documentSkillEnabled" type="checkbox" />
              <span class="switch-track"><span class="switch-thumb"></span></span>
            </label>
          </div>

          <div class="skill-card">
            <div class="skill-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            </div>
            <div class="skill-info">
              <div class="skill-name">
                图片理解 / OCR
                <span class="skill-tag muted">默认</span>
              </div>
              <div class="skill-desc">把图片交给视觉模型读字并概括关键内容，不是本地 OCR</div>
            </div>
            <label class="switch" :title="settings.ocrSkillEnabled ? '点击关闭' : '点击开启'">
              <input v-model="settings.ocrSkillEnabled" type="checkbox" />
              <span class="switch-track"><span class="switch-thumb"></span></span>
            </label>
          </div>

          <div class="skill-card">
            <div class="skill-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 3l1.2 3.4 3.4 1.2-3.4 1.2L10 12.2l-1.2-3.4L5.4 7.6l3.4-1.2L10 3z"/><path d="M17.5 12l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9.9-2.6z"/></svg>
            </div>
            <div class="skill-info">
              <div class="skill-name">
                AI 生图
                <span class="skill-tag muted">默认</span>
              </div>
              <div class="skill-desc">根据你的描述调用副模型生成图片</div>
            </div>
            <label class="switch" :title="settings.imageGenSkillEnabled ? '点击关闭' : '点击开启'">
              <input v-model="settings.imageGenSkillEnabled" type="checkbox" />
              <span class="switch-track"><span class="switch-thumb"></span></span>
            </label>
          </div>

          <div class="skill-card">
            <div class="skill-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </div>
            <div class="skill-info">
              <div class="skill-name">
                联网搜索
                <span class="skill-tag muted">默认</span>
              </div>
              <div class="skill-desc">识别明确搜索意图，用 Tavily 检索最新信息并附带来源链接</div>
            </div>
            <label class="switch" :title="settings.searchSkillEnabled ? '点击关闭' : '点击开启'">
              <input v-model="settings.searchSkillEnabled" type="checkbox" />
              <span class="switch-track"><span class="switch-thumb"></span></span>
            </label>
          </div>

          <div class="skill-option">
            <div class="skill-option-head">
              <span>结果条数上限</span>
              <span class="skill-option-value">{{ settings.searchMaxResults }} 条</span>
            </div>
            <input v-model.number="settings.searchMaxResults" type="range" min="1" max="10" step="1" />
            <div class="skill-option-hint">1–10 条，默认 5 条；条数越多占用上下文越多。</div>
          </div>

          <p v-if="settings.ocrSkillEnabled" class="skill-hint" :class="{ warn: !settings.secondaryReady && visionStatus === 'text' }">
            <template v-if="settings.secondaryReady">
              图片理解将使用副模型「{{ settings.secondaryModel }}」，由视觉模型读取图片中的文字与关键内容。
            </template>
            <template v-else>
              未配置副模型，将使用主模型「{{ settings.model }}」（{{ visionStatusText }}）。可在 设置 → 模型设置 → 副模型 API 配置视觉模型。
            </template>
          </p>

          <p v-if="settings.imageGenSkillEnabled" class="skill-hint" :class="{ warn: !settings.secondaryReady }">
            <template v-if="settings.secondaryReady">
              使用副模型的生图模型「{{ settings.secondaryImageModel }}」生成图片。
            </template>
            <template v-else>
              尚未配置副模型 API，发送生图描述时会提示去配置；主对话不受影响。
            </template>
          </p>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useSettingsStore } from '../../stores/settings'
import { detectVisionSupport } from '../../services/ocr'

const settings = useSettingsStore()
const visible = ref(false)

const visionStatus = computed(() =>
  detectVisionSupport(settings.model, settings.apiBase, settings.modelVisionMode)
)
const visionStatusText = computed(() => {
  if (visionStatus.value === 'vision') return '已判定支持图片'
  if (visionStatus.value === 'text') return '被判定为纯文本模型，发图会直接提示'
  return '视觉能力未确认，将根据接口返回判断'
})

function open() { visible.value = true }
function close() { visible.value = false }
defineExpose({ open, close })
</script>

<style scoped>
.skill-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.5);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.3s;
}
.skill-overlay.open {
  opacity: 1;
  pointer-events: auto;
}

.skill-panel {
  position: fixed;
  top: 0;
  right: 0;
  width: 420px;
  max-width: 100vw;
  height: 100vh;
  height: 100dvh;
  background: var(--bg-primary);
  display: flex;
  flex-direction: column;
  transform: translateX(100%);
  transition: transform 0.3s ease;
  z-index: 1001;
}
.skill-panel.open {
  transform: translateX(0);
}

.skill-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}
.skill-header h2 {
  font-size: 18px;
  margin: 0;
}
.btn-close {
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, color 0.15s;
}
.btn-close:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.skill-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
}

.skill-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
}
.skill-card + .skill-card {
  margin-top: 12px;
}
.skill-icon {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border-radius: 10px;
  background: var(--accent-light);
  color: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
}
.skill-info {
  flex: 1;
  min-width: 0;
}
.skill-name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}
.skill-tag {
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--accent-light);
  color: var(--accent);
  font-size: 10px;
  font-weight: 500;
}
.skill-tag.muted {
  background: var(--bg-hover);
  color: var(--text-muted);
}
.skill-desc {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-muted);
}

.switch {
  flex-shrink: 0;
  cursor: pointer;
  display: inline-flex;
}
.switch input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}
.switch-track {
  position: relative;
  width: 38px;
  height: 22px;
  border-radius: 11px;
  background: var(--bg-active);
  transition: background 0.2s;
  display: inline-block;
}
.switch-track::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--text-muted);
  transition: transform 0.2s, background 0.2s;
}
.switch input:checked + .switch-track {
  background: var(--accent);
}
.switch input:checked + .switch-track::after {
  transform: translateX(16px);
  background: #fff;
}

.skill-option {
  margin-top: 12px;
  padding: 12px 16px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
}
.skill-option-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 12px;
  color: var(--text-secondary);
}
.skill-option-value {
  color: var(--accent);
  font-weight: 600;
  flex-shrink: 0;
}
.skill-option input[type="range"] {
  width: 100%;
  margin: 10px 0 4px;
  accent-color: var(--accent);
}
.skill-option-hint {
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.5;
}

.skill-hint {
  margin: 16px 4px 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-muted);
}
.skill-hint.warn {
  color: var(--danger);
}
</style>
