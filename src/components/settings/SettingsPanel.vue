<template>
  <Teleport to="body">
    <div class="settings-overlay" :class="{ open: visible }" @click.self="close">
      <div class="settings-panel" :class="{ open: visible }">
        <div class="settings-header">
          <h2>设置</h2>
          <button class="btn-close" @click="close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div class="settings-body">
          <!-- 用户信息 -->
          <section class="setting-section">
            <h3>用户信息</h3>
            <div class="field">
              <label>用户名 / 昵称</label>
              <input v-model="settings.userName" type="text" placeholder="输入你的名字，AI 会用它称呼你…" />
              <span class="range-hint">AI 将在对话中读取此名称来识别你的身份并进行称呼</span>
            </div>
            <!-- 头像上传 -->
            <div class="field">
              <label>用户头像</label>
              <div class="avatar-upload">
                <div class="avatar-preview" @click="triggerUpload">
                  <img v-if="settings.userAvatar" :src="settings.userAvatar" class="avatar-preview-img" />
                  <svg v-else width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                </div>
                <div class="avatar-actions">
                  <button class="btn-secondary" @click="triggerUpload">选择图片</button>
                  <button v-if="settings.userAvatar" class="btn-secondary" @click="settings.userAvatar = ''">移除</button>
                </div>
              </div>
              <input ref="fileInput" type="file" accept="image/*" style="display:none" @change="onFileChange" />
            </div>
          </section>

          <!-- 模型预设 -->
          <section class="setting-section">
            <h3>模型选择</h3>
            <div class="preset-grid">
              <button
                v-for="p in cloudPresets"
                :key="p.label"
                class="preset-btn"
                :class="{ active: settings.apiBase === p.base && settings.model === p.model }"
                @click="selectPreset(p)"
              >
                {{ p.label }}
              </button>
            </div>

            <!-- Ollama 本地模型（可折叠） -->
            <div class="ollama-section">
              <button class="ollama-toggle" @click="toggleOllama">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline :points="ollamaOpen ? '6 15 12 9 18 15' : '9 18 15 12 9 6'"/></svg>
                Ollama 本地模型
                <span class="ollama-count" v-if="ollamaModels.length">{{ ollamaModels.length }} 个</span>
              </button>
              <div v-if="ollamaOpen" class="ollama-list">
                <div v-if="ollamaLoading" class="ollama-loading">扫描中…</div>
                <button
                  v-for="m in ollamaModels"
                  :key="m.name"
                  class="preset-btn ollama-item"
                  :class="{ active: settings.baseUrl === '/ollama' && settings.model === m.name }"
                  @click="selectOllamaModel(m.name)"
                >
                  {{ m.name }}
                  <span class="ollama-size">{{ m.size }}</span>
                </button>
                <div v-if="!ollamaLoading && ollamaModels.length === 0" class="ollama-empty">无法连接 Ollama 服务</div>
              </div>
            </div>
          </section>

          <!-- API 配置 -->
          <section class="setting-section">
            <h3>API 配置</h3>
            <div class="field">
              <label>API Base URL</label>
              <input v-model="settings.apiBase" type="text" placeholder="https://api.deepseek.com/v1" />
            </div>
            <div class="field">
              <label>模型名称</label>
              <input v-model="settings.model" type="text" placeholder="deepseek-chat" />
            </div>
            <div class="field">
              <label>API Key</label>
              <div class="password-field">
                <input v-model="settings.apiKey" :type="showKey ? 'text' : 'password'" placeholder="sk-..." />
                <button class="btn-toggle-pw" @click="showKey = !showKey">
                  <svg v-if="!showKey" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                </button>
              </div>
            </div>
          </section>

          <!-- 参数设置 -->
          <section class="setting-section">
            <h3>参数设置</h3>
            <div class="field">
              <label>Temperature ({{ settings.temperature }})</label>
              <input v-model.number="settings.temperature" type="range" min="0" max="2" step="0.1" />
              <span class="range-hint">越高越有创意，越低越精确</span>
            </div>
            <div class="field">
              <label>Top P ({{ settings.topP }})</label>
              <input v-model.number="settings.topP" type="range" min="0" max="1" step="0.05" />
            </div>
            <div class="field">
              <label>最大 Token 数</label>
              <input v-model.number="settings.maxTokens" type="number" min="1" max="393216" step="100" />
            </div>
          </section>

          <!-- 人设提示词 -->
          <section class="setting-section">
            <div class="section-header">
              <h3>人设提示词</h3>
              <label class="switch-label">
                <input type="checkbox" v-model="settings.personaEnabled" class="switch-input" />
                <span class="switch-track">
                  <span class="switch-thumb"></span>
                </span>
                <span class="switch-text">{{ settings.personaEnabled ? '已启用' : '已关闭' }}</span>
              </label>
            </div>
            <p class="hint" v-if="settings.personaEnabled">当前优先遵守人设提示词，系统提示词作为补充。</p>
            <p class="hint" v-else>关闭状态，仅遵守系统提示词。</p>
            <textarea
              v-model="settings.personaPrompt"
              class="persona-input"
              rows="4"
              placeholder="例如：你是一个专业的中文助手..."
            ></textarea>
          </section>

          <!-- 安装应用 -->
          <section class="setting-section">
            <h3>安装到桌面</h3>
            <p class="hint">将 XIYUE AI 安装为独立应用，支持离线使用。</p>
            <button class="btn-primary" @click="installApp" style="width:100%">📲 安装应用</button>
          </section>

          <!-- 数据管理 -->
          <section class="setting-section">
            <h3>数据管理</h3>
            <button class="btn-danger" @click="clearAllData">清除所有数据</button>
          </section>
        </div>

        <div class="settings-footer">
          <button class="btn-primary" @click="saveAndClose">保存并关闭</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useSettingsStore } from '../../stores/settings'

const settings = useSettingsStore()
const visible = ref(false)
const showKey = ref(false)
const fileInput = ref(null)

// Ollama 本地模型
const ollamaOpen = ref(false)
const ollamaLoading = ref(false)
const ollamaModels = ref([])

const cloudPresets = computed(() =>
  settings.modelPresets.filter(p => p.base !== '/ollama')
)

function toggleOllama() {
  ollamaOpen.value = !ollamaOpen.value
  if (ollamaOpen.value && ollamaModels.value.length === 0) {
    fetchOllamaModels()
  }
}

async function fetchOllamaModels() {
  ollamaLoading.value = true
  try {
    const resp = await fetch('/ollama-api/tags')
    const data = await resp.json()
    ollamaModels.value = (data.models || []).map(m => {
      const sizeGb = m.size / (1024 * 1024 * 1024)
      return {
        name: m.name,
        size: sizeGb >= 1 ? sizeGb.toFixed(1) + ' GB' : (m.size / (1024 * 1024)).toFixed(0) + ' MB',
      }
    }).sort((a, b) => a.name.localeCompare(b.name))
  } catch {
    ollamaModels.value = []
  } finally {
    ollamaLoading.value = false
  }
}

function selectOllamaModel(name) {
  settings.model = name
  settings.apiBase = '/ollama'
}

function open() { visible.value = true }
function close() { visible.value = false }

function triggerUpload() {
  fileInput.value?.click()
}

function onFileChange(e) {
  const file = e.target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (ev) => {
    // 裁剪为正方形圆形头像
    const img = new Image()
    img.onload = () => {
      const size = Math.min(img.width, img.height)
      const canvas = document.createElement('canvas')
      canvas.width = 200
      canvas.height = 200
      const ctx = canvas.getContext('2d')
      // 圆形裁剪
      ctx.beginPath()
      ctx.arc(100, 100, 100, 0, Math.PI * 2)
      ctx.clip()
      const sx = (img.width - size) / 2
      const sy = (img.height - size) / 2
      ctx.drawImage(img, sx, sy, size, size, 0, 0, 200, 200)
      settings.userAvatar = canvas.toDataURL('image/jpeg', 0.85)
    }
    img.src = ev.target.result
  }
  reader.readAsDataURL(file)
  // 清空以便重复选同一文件
  e.target.value = ''
}

defineExpose({ open, close })

function selectPreset(preset) {
  settings.applyPreset(preset)
}

function saveAndClose() {
  settings.persist()
  close()
}

async function installApp() {
  // 优先使用原生安装提示
  if (window.__deferredPrompt) {
    window.__deferredPrompt.prompt()
    const result = await window.__deferredPrompt.userChoice
    window.__deferredPrompt = null
    if (result.outcome === 'accepted') {
      window.__ui?.showToast('安装成功！', 'success')
    }
    return
  }

  // 备用：显示手动安装引导
  const ua = navigator.userAgent
  const isAndroid = /Android/i.test(ua)
  const isIPhone = /iPhone|iPad|iPod/i.test(ua)

  let guide = ''
  if (isAndroid) {
    guide = 'Chrome 右上角 ⋮ → 添加到主屏幕'
  } else if (isIPhone) {
    guide = 'Safari 底部 ↑ 分享 → 添加到主屏幕'
  } else {
    guide = 'Edge/Chrome 右上角 ⋯ → 应用 → 安装此站点'
  }

  const protocol = window.location.protocol
  if (protocol === 'http:') {
    guide += '\n\n⚠ 当前为 HTTP 连接，部分浏览器限制安装。\n建议用局域网 IP 进行访问'
  }

  window.__ui?.showConfirm(guide, { confirmText: '知道了', cancelText: '关闭' })
}

async function clearAllData() {
  const ok = await window.__ui?.showConfirm('确定要清除所有数据吗？这将删除所有对话记录和设置，此操作不可撤销！')
  if (ok) {
    localStorage.clear()
    location.reload()
  }
}
</script>

<style scoped>
/* 遮罩层 */
.settings-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1000;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.3s;
}
.settings-overlay.open {
  opacity: 1;
  pointer-events: auto;
}

.settings-panel {
  position: fixed;
  top: 0;
  right: 0;
  width: 440px;
  max-width: 100vw;
  height: 100vh;
  height: 100dvh;
  background: var(--bg-primary);
  display: flex;
  flex-direction: column;
  transform: translateX(100%);
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.15);
  z-index: 1001;
}
.settings-panel.open {
  transform: translateX(0);
}

.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}
.settings-header h2 {
  font-size: 18px;
  font-weight: 700;
  margin: 0;
  color: var(--text-primary);
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
}
.btn-close:hover {
  background: var(--bg-hover);
}

.settings-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
}

.setting-section {
  margin-bottom: 24px;
}
.setting-section h3 {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.hint {
  font-size: 12px;
  color: var(--text-muted);
  margin: 0 0 10px;
  line-height: 1.5;
}
.hint code {
  background: var(--bg-code);
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 12px;
}

.preset-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}
.preset-btn {
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.preset-btn:hover {
  background: var(--bg-hover);
}
.preset-btn.active {
  border-color: var(--accent);
  background: var(--accent-light);
  color: var(--accent);
  font-weight: 600;
}

/* Ollama 本地模型 */
.ollama-section {
  margin-top: 10px;
}
.ollama-toggle {
  display: flex; align-items: center; gap: 8px;
  width: 100%; padding: 9px 12px;
  border: 1px solid var(--border-color); border-radius: 8px;
  background: var(--bg-card); color: var(--text-primary);
  font-size: 13px; cursor: pointer; font-family: inherit;
  transition: background 0.15s;
}
.ollama-toggle:hover { background: var(--bg-hover); }
.ollama-count { font-size: 11px; color: var(--text-muted); margin-left: auto; }
.ollama-list { margin-top: 6px; display: flex; flex-direction: column; gap: 4px; }
.ollama-loading, .ollama-empty {
  padding: 10px; font-size: 12px; color: var(--text-muted); text-align: center;
}
.ollama-item {
  display: flex; justify-content: space-between; align-items: center;
  width: 100%; text-align: left;
}
.ollama-size { font-size: 10px; color: var(--text-muted); }

.field {
  margin-bottom: 14px;
}
.field label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 5px;
}
.field input[type="text"],
.field input[type="password"],
.field input[type="number"] {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
  transition: border-color 0.2s;
  box-sizing: border-box;
}
.field input:focus {
  border-color: var(--accent);
}
.password-field {
  display: flex;
  gap: 6px;
}
.password-field input {
  flex: 1;
}
.btn-toggle-pw {
  width: 38px;
  height: 38px;
  flex-shrink: 0;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-input);
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

input[type="range"] {
  width: 100%;
  accent-color: var(--accent);
  margin: 4px 0;
}
.range-hint {
  font-size: 11px;
  color: var(--text-muted);
}

.persona-input {
  width: 100%;
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
  resize: vertical;
  font-family: inherit;
  line-height: 1.6;
  box-sizing: border-box;
}
.persona-input:focus {
  border-color: var(--accent);
}

/* 开关 */
.section-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 8px;
}
.section-header h3 { margin: 0; }
.switch-label {
  display: flex; align-items: center; gap: 8px; cursor: pointer;
}
.switch-input { display: none; }
.switch-track {
  width: 42px; height: 24px; border-radius: 12px;
  background: var(--border-color); position: relative; transition: background 0.2s;
}
.switch-input:checked + .switch-track { background: var(--accent); }
.switch-thumb {
  position: absolute; top: 2px; left: 2px;
  width: 20px; height: 20px; border-radius: 50%;
  background: #fff; transition: left 0.2s;
  box-shadow: 0 1px 3px rgba(0,0,0,0.15);
}
.switch-input:checked + .switch-track .switch-thumb { left: 20px; }
.switch-text { font-size: 12px; color: var(--text-muted); }

.btn-danger {
  padding: 10px 20px;
  border: 1px solid var(--danger);
  border-radius: 8px;
  background: transparent;
  color: var(--danger);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-danger:hover {
  background: var(--danger-bg);
}

.btn-primary {
  padding: 12px 24px;
  border: none;
  border-radius: 10px;
  background: var(--accent);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-primary:hover {
  background: var(--accent-hover);
}

/* 头像上传 */
.avatar-upload {
  display: flex;
  align-items: center;
  gap: 14px;
}
.avatar-preview {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--bg-sidebar);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  overflow: hidden;
  border: 2px dashed var(--border-color);
  transition: border-color 0.2s;
  flex-shrink: 0;
  color: var(--text-muted);
}
.avatar-preview:hover {
  border-color: var(--accent);
}
.avatar-preview-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.avatar-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.avatar-actions .btn-secondary {
  font-size: 12px;
  padding: 6px 14px;
}

.settings-footer {
  padding: 16px 24px;
  border-top: 1px solid var(--border-color);
  display: flex;
  justify-content: flex-end;
  flex-shrink: 0;
}

/* 移动端 */
@media (max-width: 768px) {
  .settings-panel {
    width: 100vw;
    max-width: 100vw;
  }
}
</style>
