<template>
          <div class="section-page">
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
              <label>思考强度</label>
              <div class="tier-grid four">
                <button
                  v-for="opt in reasoningOptions"
                  :key="opt.value"
                  class="tier-btn"
                  :class="{ active: settings.reasoningEffort === opt.value }"
                  @click="settings.reasoningEffort = opt.value"
                >
                  {{ opt.label }}
                </button>
              </div>
              <span class="range-hint">仅对支持推理强度的模型生效（如 GPT-5 系列）；开启思考后传递 reasoning_effort，默认跟随服务商。</span>
            </div>
            <div class="field">
              <label>每轮工具调用上限（{{ settings.maxToolCallsPerRound }} 次）</label>
              <input
                v-model.number="settings.maxToolCallsPerRound"
                type="number"
                min="1"
                max="200"
                step="1"
                @change="clampToolCalls"
              />
              <span class="range-hint">单轮回复中最多执行的工具调用数，默认 10，可调 1–200；调高后模型一次可并行完成更多步骤。</span>
            </div>
            <div class="field">
              <label>上下文长度</label>
              <div class="tier-grid">
                <button
                  v-for="opt in contextOptions"
                  :key="opt.value"
                  class="tier-btn"
                  :class="{ active: settings.contextLength === opt.value }"
                  @click="settings.contextLength = opt.value"
                >
                  {{ opt.label }}
                </button>
              </div>
              <span class="range-hint">模型单次可接收的最大上下文窗口</span>
            </div>
            <div class="field">
              <label>输出长度</label>
              <div class="tier-grid">
                <button
                  v-for="opt in outputOptions"
                  :key="opt.value"
                  class="tier-btn"
                  :class="{ active: settings.maxTokens === opt.value }"
                  @click="settings.maxTokens = opt.value"
                >
                  {{ opt.label }}
                </button>
              </div>
              <span class="range-hint">单次回复可生成的最大 token 数</span>
            </div>
          </div>
</template>

<script setup>
import { useSettingsStore } from '../../../stores/settings'

const settings = useSettingsStore()

// Token 档位
const contextOptions = [
  { label: '32K', value: 32768 },
  { label: '64K', value: 65536 },
  { label: '128K', value: 131072 },
  { label: '256K', value: 262144 },
  { label: '512K', value: 524288 },
  { label: '1M', value: 1048576 },
]
const outputOptions = [
  { label: '4K', value: 4096 },
  { label: '16K', value: 16384 },
  { label: '32K', value: 32768 },
  { label: '64K', value: 65536 },
  { label: '128K', value: 131072 },
  { label: '384K', value: 393216 },
]
const reasoningOptions = [
  { label: '默认', value: 'default' },
  { label: '低', value: 'low' },
  { label: '中', value: 'medium' },
  { label: '高', value: 'high' },
]

function clampToolCalls() {
  const value = Math.round(Number(settings.maxToolCallsPerRound) || 10)
  settings.maxToolCallsPerRound = Math.max(1, Math.min(200, value))
}
</script>
