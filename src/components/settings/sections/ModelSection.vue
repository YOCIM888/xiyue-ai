<template>
          <div class="section-page">
            <h3 class="sub-title">模型选择</h3>
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
                  <span class="ollama-name">{{ m.name }}</span>
                  <span class="ollama-tags">
                    <span v-for="t in m.tags" :key="t.label" class="ollama-tag" :style="{ background: t.color }">{{ t.label }}</span>
                  </span>
                  <span class="ollama-size">{{ m.size }}</span>
                </button>
                <div v-if="!ollamaLoading && ollamaModels.length === 0" class="ollama-empty">无法连接 Ollama 服务</div>
              </div>
            </div>

            <div class="divider"></div>

            <h3 class="sub-title">API 配置</h3>
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
            <div class="field">
              <label>模型图片能力</label>
              <div class="tier-grid">
                <button class="tier-btn" :class="{ active: settings.modelVisionMode === 'auto' }" @click="settings.modelVisionMode = 'auto'">自动</button>
                <button class="tier-btn" :class="{ active: settings.modelVisionMode === 'vision' }" @click="settings.modelVisionMode = 'vision'">支持图片</button>
                <button class="tier-btn" :class="{ active: settings.modelVisionMode === 'text' }" @click="settings.modelVisionMode = 'text'">纯文本</button>
              </div>
            </div>

            <div class="divider"></div>

            <div class="secondary-head">
              <h3 class="sub-title">副模型 API（多模态）</h3>
              <span class="state-badge" :class="{ on: settings.secondaryReady }">
                {{ settings.secondaryReady ? '已配置' : '未配置' }}
              </span>
            </div>
            <p class="hint">主模型不支持视觉或失败时，图片理解自动交给副模型；AI 生图也由副模型负责。支持任意兼容 OpenAI 格式的服务（智谱、OpenAI、DeepSeek、硅基流动、OpenRouter 等），Base URL 填接口根地址。</p>

            <div class="preset-grid">
              <button
                v-for="p in settings.secondaryPresets"
                :key="p.label"
                class="preset-btn"
                :class="{ active: p.custom ? settings.isCustomSecondary : settings.secondaryApiBase === p.base && settings.secondaryModel === p.model }"
                @click="applySecondaryPreset(p)"
              >
                {{ p.label }}
              </button>
            </div>

            <div class="field secondary-first">
              <label>Base URL</label>
              <input ref="secondaryBaseInput" v-model="settings.secondaryApiBase" type="text" placeholder="https://api.openai.com/v1" />
            </div>
            <div class="field">
              <label>视觉模型名称</label>
              <input v-model="settings.secondaryModel" type="text" placeholder="如 gpt-4o-mini / glm-4.6v-flash" />
            </div>
            <div class="field">
              <label>API Key</label>
              <div class="password-field">
                <input v-model="settings.secondaryApiKey" :type="showSecondaryKey ? 'text' : 'password'" placeholder="副模型 API Key" />
                <button class="btn-toggle-pw" @click="showSecondaryKey = !showSecondaryKey">
                  <svg v-if="!showSecondaryKey" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                </button>
              </div>
            </div>
            <div class="field">
              <label>生图模型</label>
              <input v-model="settings.secondaryImageModel" type="text" list="secondary-image-models" placeholder="glm-image" />
              <datalist id="secondary-image-models">
                <option value="glm-image"></option>
                <option value="cogview-4"></option>
                <option value="cogview-3-flash"></option>
                <option value="dall-e-3"></option>
                <option value="flux.1-schnell"></option>
              </datalist>
              <span class="range-hint">可填任意生图模型名，接口按 {Base URL}/images/generations 调用；留空默认 glm-image。</span>
            </div>
          </div>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'
import { useSettingsStore } from '../../../stores/settings'

const settings = useSettingsStore()
const showKey = ref(false)
const showSecondaryKey = ref(false)
const secondaryBaseInput = ref(null)

function applySecondaryPreset(preset) {
  settings.applySecondaryPreset(preset)
  if (preset.custom) nextTick(() => secondaryBaseInput.value?.focus())
}

function selectPreset(preset) {
  settings.applyPreset(preset)
}

const cloudPresets = computed(() =>
  settings.modelPresets.filter(p => p.base !== '/ollama')
)

// Ollama 本地模型
const ollamaOpen = ref(false)
const ollamaLoading = ref(false)
const ollamaModels = ref([])

// 模型能力标签映射
const modelCapabilities = [
  { match: /qwen3\.5/i, tags: [{ label: 'vision', color: '#8b5cf6' }, { label: 'tools', color: '#f59e0b' }, { label: 'thinking', color: '#6366f1' }, { label: '256K', color: '#6b7280' }] },
  { match: /deepseek-r1/i, tags: [{ label: 'tools', color: '#f59e0b' }, { label: 'thinking', color: '#6366f1' }, { label: '128K', color: '#6b7280' }] },
  { match: /deepseek-coder/i, tags: [{ label: 'thinking', color: '#6366f1' }, { label: '16K', color: '#6b7280' }] },
  { match: /ornith/i, tags: [{ label: 'thinking', color: '#6366f1' }, { label: '256K', color: '#6b7280' }] },
  { match: /minicpm-v/i, tags: [{ label: 'vision', color: '#8b5cf6' }, { label: 'thinking', color: '#6366f1' }, { label: '256K', color: '#6b7280' }] },
  { match: /minicpm5/i, tags: [{ label: 'thinking', color: '#6366f1' }, { label: '128K', color: '#6b7280' }] },
  { match: /deepseek-janus-pro/i, tags: [{ label: 'vision', color: '#8b5cf6' }, { label: 'thinking', color: '#6366f1' }, { label: '16K', color: '#6b7280' }] },
]

function getModelTags(name) {
  for (const c of modelCapabilities) {
    if (c.match.test(name)) return c.tags
  }
  return []
}

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
        tags: getModelTags(m.name),
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
  // 本地模型不按 token 计费，输出拉满
  const tags = getModelTags(name)
  const ctxTag = tags.find(t => t.label.endsWith('K'))
  if (ctxTag) {
    const ctxK = parseInt(ctxTag.label) * 1024
    settings.maxTokens = Math.min(ctxK, 131072)
  } else {
    settings.maxTokens = 65536
  }
}
</script>
