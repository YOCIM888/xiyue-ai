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

          <p class="skill-hint">
            开启后，消息中包含 http/https 链接时会自动抓取网页正文，并随消息一起提供给模型。每次最多读取 3 个链接，单个链接约 8000 字。
          </p>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref } from 'vue'
import { useSettingsStore } from '../../stores/settings'

const settings = useSettingsStore()
const visible = ref(false)

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

.skill-hint {
  margin: 16px 4px 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-muted);
}
</style>
