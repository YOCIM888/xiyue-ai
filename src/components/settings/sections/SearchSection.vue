<template>
          <div class="section-page">
            <h3 class="sub-title">Tavily 搜索</h3>
            <div class="field">
              <label>Tavily API Key</label>
              <div class="password-field">
                <input v-model="settings.tavilyApiKey" :type="showSearchKey ? 'text' : 'password'" placeholder="tvly-..." />
                <button class="btn-toggle-pw" @click="showSearchKey = !showSearchKey">
                  <svg v-if="!showSearchKey" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                </button>
              </div>
              <span class="range-hint">仅保存在本地；导出数据时会自动脱敏，不会写入备份文件。</span>
            </div>
            <div class="field">
              <label>搜索深度</label>
              <div class="tier-grid">
                <button
                  class="tier-btn"
                  :class="{ active: settings.searchDepth === 'basic' }"
                  @click="settings.searchDepth = 'basic'"
                >
                  Basic
                </button>
                <button
                  class="tier-btn"
                  :class="{ active: settings.searchDepth === 'advanced' }"
                  @click="settings.searchDepth = 'advanced'"
                >
                  Advanced
                </button>
              </div>
            </div>

            <div class="divider"></div>

            <h3 class="sub-title">搜索结果注入</h3>
            <div class="field">
              <label>结果条数上限（{{ settings.searchMaxResults }} 条）</label>
              <input v-model.number="settings.searchMaxResults" type="range" min="1" max="10" step="1" />
              <span class="range-hint">1–10 条，默认 5 条；条数越多占用的上下文越多。</span>
            </div>
            <div class="field">
              <label>注入总字符上限（{{ settings.searchMaxChars.toLocaleString() }} 字）</label>
              <input v-model.number="settings.searchMaxChars" type="range" min="2000" max="30000" step="1000" />
              <span class="range-hint">所有搜索结果拼成上下文后的总长度上限，超出部分会被截断。</span>
            </div>
            <div class="field">
              <label>单条结果字符上限（{{ settings.searchItemMaxChars }} 字）</label>
              <input v-model.number="settings.searchItemMaxChars" type="range" min="300" max="3000" step="100" />
              <span class="range-hint">每条结果保留的正文长度；越长信息越全，也越占上下文。</span>
            </div>
          </div>
</template>

<script setup>
import { ref } from 'vue'
import { useSettingsStore } from '../../../stores/settings'

const settings = useSettingsStore()
const showSearchKey = ref(false)
</script>
