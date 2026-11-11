<template>
          <div class="section-page">
            <h3 class="sub-title"><i class="fa-solid fa-wallet"></i> 主模型余额</h3>
            <div class="usage-balance-card">
              <div class="balance-main">
                <template v-if="mainBalance.loading">
                  <span class="balance-message">正在查询余额…</span>
                </template>
                <template v-else-if="mainBalance.ok">
                  <span class="balance-amount">{{ mainBalance.currency === 'USD' ? '$' : '¥' }}{{ mainBalance.total.toFixed(2) }}</span>
                  <span class="balance-meta">
                    赠金 {{ mainBalance.granted.toFixed(2) }} · 充值 {{ mainBalance.toppedUp.toFixed(2) }}
                    <template v-if="balanceTime !== '—'"> · {{ balanceTime }} 更新</template>
                  </span>
                  <span v-if="!mainBalance.isAvailable" class="balance-warn">余额不足，模型调用可能失败</span>
                </template>
                <template v-else>
                  <span class="balance-message">{{ mainBalance.message }}</span>
                </template>
              </div>
              <button class="btn-secondary" :disabled="mainBalance.loading" @click="refreshBalance">刷新</button>
            </div>

            <div class="divider"></div>

            <h3 class="sub-title"><i class="fa-solid fa-chart-line"></i> 本应用用量</h3>
            <div class="usage-grid">
              <div class="usage-stat">
                <span class="usage-label">本月调用</span>
                <span class="usage-value">{{ usageSummary.current.calls }}</span>
              </div>
              <div class="usage-stat">
                <span class="usage-label">本月输入</span>
                <span class="usage-value">{{ formatTokenCount(usageSummary.current.prompt) }}</span>
              </div>
              <div class="usage-stat">
                <span class="usage-label">本月输出</span>
                <span class="usage-value">{{ formatTokenCount(usageSummary.current.completion) }}</span>
              </div>
              <div class="usage-stat">
                <span class="usage-label">本月估算</span>
                <span class="usage-value">{{ hasPrice ? '¥' + formatCost(currentCost) : '未设单价' }}</span>
              </div>
            </div>
            <p class="usage-total">
              累计 {{ formatTokenCount(usageSummary.total.prompt) }} 输入 · {{ formatTokenCount(usageSummary.total.completion) }} 输出 · {{ usageSummary.total.calls }} 次调用
              <template v-if="usageSummary.total.estimated">（其中 {{ usageSummary.total.estimated }} 次为估算值）</template>
            </p>

            <h3 class="sub-title">费用单价</h3>
            <div class="field">
              <label>输入单价（元 / 百万 token）</label>
              <input v-model.number="settings.usageInputPrice" type="number" min="0" step="0.01" placeholder="例如 2" />
            </div>
            <div class="field">
              <label>输出单价（元 / 百万 token）</label>
              <input v-model.number="settings.usageOutputPrice" type="number" min="0" step="0.01" placeholder="例如 8" />
            </div>
            <p class="hint">单价由你填写，应用不内置可能过期的价目表；保持 0 表示不估算费用。</p>

            <template v-if="monthModels.length">
              <h3 class="sub-title">本月按模型</h3>
              <div class="usage-table">
                <div class="usage-tr head"><span>模型</span><span>调用</span><span>输入</span><span>输出</span></div>
                <div v-for="m in monthModels" :key="m.model" class="usage-tr">
                  <span class="usage-model" :title="m.model">{{ m.model }}</span>
                  <span>{{ m.calls }}</span>
                  <span>{{ formatTokenCount(m.prompt) }}</span>
                  <span>{{ formatTokenCount(m.completion) }}</span>
                </div>
              </div>
            </template>
            <p v-else class="hint">还没有用量记录。发送消息后会自动统计主模型与副模型的 token 消耗。</p>
          </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useSettingsStore } from '../../../stores/settings'
import { fetchBalance } from '../../../services/balance'
import { estimateUsageCost, formatCost, formatTokenCount, getUsageSummary } from '../../../services/usageStats'

const settings = useSettingsStore()

const mainBalance = ref({
  loading: false,
  ok: false,
  message: '',
  currency: 'CNY',
  total: 0,
  granted: 0,
  toppedUp: 0,
  isAvailable: true,
  fetchedAt: 0,
})
const usageSummary = ref(getUsageSummary())

const hasPrice = computed(() => Number(settings.usageInputPrice) > 0 || Number(settings.usageOutputPrice) > 0)
const currentCost = computed(() => estimateUsageCost({
  prompt: usageSummary.value.current.prompt,
  completion: usageSummary.value.current.completion,
  inputPrice: settings.usageInputPrice,
  outputPrice: settings.usageOutputPrice,
}))
const monthModels = computed(() => {
  const models = usageSummary.value.current.models || {}
  return Object.entries(models)
    .map(([model, v]) => ({ model, prompt: v.prompt || 0, completion: v.completion || 0, calls: v.calls || 0 }))
    .sort((a, b) => (b.prompt + b.completion) - (a.prompt + a.completion))
})
const balanceTime = computed(() =>
  mainBalance.value.fetchedAt ? new Date(mainBalance.value.fetchedAt).toLocaleTimeString() : '—'
)

async function refreshBalance() {
  mainBalance.value = { ...mainBalance.value, loading: true }
  const res = await fetchBalance({ apiBase: settings.apiBase, apiKey: settings.apiKey })
  mainBalance.value = {
    loading: false,
    ok: !!res.ok,
    message: res.message || '',
    currency: res.currency || 'CNY',
    total: res.total || 0,
    granted: res.granted || 0,
    toppedUp: res.toppedUp || 0,
    isAvailable: res.isAvailable !== false,
    fetchedAt: res.fetchedAt || 0,
  }
}

function refreshUsagePage() {
  usageSummary.value = getUsageSummary()
  // 余额缓存 10 分钟，避免频繁请求服务商
  const cached = mainBalance.value.fetchedAt && Date.now() - mainBalance.value.fetchedAt < 10 * 60 * 1000
  if (!cached) refreshBalance()
}

onMounted(refreshUsagePage)
</script>
