<template>
          <div class="section-page">
            <div class="usage-card">
              <div class="usage-top">
                <div>
                  <div class="usage-total">{{ formatBytes(usage.totalBytes) }}</div>
                  <div class="usage-sub">本地存储占用 · 共 {{ usage.keyCount }} 项数据</div>
                </div>
                <button class="btn-refresh" title="刷新统计" @click="refreshUsage">
                  <i class="fa-solid fa-rotate-right"></i>
                </button>
              </div>
              <div class="usage-bar">
                <span
                  v-for="m in usage.modules"
                  :key="m.key"
                  class="usage-seg"
                  :style="{ width: m.percent + '%', background: m.color }"
                  :title="`${m.label} ${formatBytes(m.bytes)}`"
                ></span>
              </div>
              <div class="engine-row">
                <span class="engine-name">
                  <i class="fa-solid fa-database"></i>
                  {{ quota.engine === 'idb' ? 'IndexedDB 主存储' : 'localStorage 降级模式' }}
                </span>
                <span class="engine-size">
                  {{ formatBytes(quota.usage) }}<template v-if="quota.quota"> / {{ formatBytes(quota.quota) }}</template>
                  <template v-if="quota.percent"> · {{ Math.round(quota.percent) }}%</template>
                </span>
              </div>
              <div v-if="quota.percent" class="engine-bar">
                <span :class="{ warn: quota.percent >= 85 }" :style="{ width: Math.min(100, quota.percent) + '%' }"></span>
              </div>
            </div>

            <div class="module-list">
              <div v-for="m in usage.modules" :key="m.key" class="module-item">
                <button class="module-head" @click="toggleModule(m.key)">
                  <span class="module-icon" :style="{ color: m.color }"><i :class="m.icon"></i></span>
                  <span class="module-name">{{ m.label }}</span>
                  <span class="module-size">{{ formatBytes(m.bytes) }}</span>
                  <span class="module-pct">{{ m.bytes > 0 && m.percent < 1 ? '<1' : Math.round(m.percent) }}%</span>
                  <i class="fa-solid fa-chevron-down module-chevron" :class="{ open: expandedModule === m.key }"></i>
                </button>
                <div class="module-bar">
                  <span :style="{ width: m.percent + '%', background: m.color }"></span>
                </div>
                <div v-if="expandedModule === m.key" class="key-list">
                  <div v-for="e in m.entries" :key="e.key" class="key-row">
                    <span class="key-name">{{ e.label }}</span>
                    <span class="key-size">{{ formatBytes(e.bytes) }}</span>
                  </div>
                </div>
              </div>
              <div v-if="!usage.modules.length" class="usage-empty">暂无本地数据</div>
            </div>

            <div class="divider"></div>

            <h3 class="sub-title"><i class="fa-solid fa-file-export"></i> 备份与恢复</h3>
            <div class="data-actions">
              <button class="btn-secondary" @click="exportAllData">
                <i class="fa-solid fa-download"></i> 导出数据
              </button>
              <button class="btn-secondary" @click="triggerImportData">
                <i class="fa-solid fa-upload"></i> 导入数据
              </button>
              <input ref="importDataInput" type="file" accept=".json,application/json" style="display:none" @change="importAllData" />
            </div>
            <p class="hint protect-hint">
              <i class="fa-solid fa-shield-halved"></i>
              主/副模型API Key与搜索Key等敏感配置不会写入导出文件；导入时也会保留本机当前的Key.
            </p>

            <div class="divider"></div>

            <h3 class="sub-title"><i class="fa-solid fa-clock-rotate-left"></i> 自动备份</h3>
            <div class="backup-list">
              <div v-for="b in autoBackups" :key="b.key" class="backup-row">
                <span class="backup-date">{{ b.date }}</span>
                <span class="backup-size">{{ formatBytes(b.bytes) }}</span>
                <button class="btn-link" @click="restoreBackup(b)">恢复</button>
              </div>
              <p v-if="!autoBackups.length" class="hint">
                暂无自动备份。每天首次打开应用会自动生成一份快照，最多保留 3 份，可在数据异常时一键恢复。
              </p>
            </div>

            <div class="divider"></div>

            <h3 class="sub-title"><i class="fa-solid fa-triangle-exclamation"></i> 危险操作</h3>
            <button class="btn-danger" @click="clearAllData">清除所有数据</button>
          </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import {
  computeStorageUsage,
  formatBytes,
  buildBackupPayload,
  backupFileName,
  parseBackup,
  applyBackup,
  listAutoBackups,
  restoreAutoBackup,
} from '../../../utils/dataBackup'
import { clearAppData, storageEstimate } from '../../../utils/kv'

// 数据设置：本地存储统计
const usage = ref({ totalBytes: 0, keyCount: 0, modules: [] })
const quota = ref({ usage: 0, quota: 0, percent: 0, engine: 'idb' })
const autoBackups = ref([])
const expandedModule = ref('')
const importDataInput = ref(null)

async function refreshUsage() {
  usage.value = computeStorageUsage()
  autoBackups.value = listAutoBackups()
  quota.value = await storageEstimate()
}

function toggleModule(key) {
  expandedModule.value = expandedModule.value === key ? '' : key
}

onMounted(refreshUsage)

async function clearAllData() {
  const ok = await window.__ui?.showConfirm('确定要清除所有数据吗？这将删除所有对话记录和设置，此操作不可撤销！')
  if (ok) {
    await clearAppData()
    location.reload()
  }
}

async function restoreBackup(item) {
  const ok = await window.__ui?.showConfirm(
    `恢复到 ${item.date} 的自动备份？当前数据会被覆盖，导入完成后页面将自动刷新。`
  )
  if (!ok) return
  try {
    const count = await restoreAutoBackup(item.key)
    window.__ui?.showToast(`已恢复 ${count} 项数据，正在刷新…`, 'success')
    setTimeout(() => location.reload(), 600)
  } catch (err) {
    window.__ui?.showToast(`恢复失败：${err?.message || '备份文件不可用'}`, 'error')
  }
}

function exportAllData() {
  const payload = buildBackupPayload()
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = backupFileName()
  a.click()
  URL.revokeObjectURL(url)
  window.__ui?.showToast('数据已导出', 'success')
}

function triggerImportData() { importDataInput.value?.click() }

async function importAllData(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return

  let parsed
  try {
    parsed = parseBackup(await file.text())
  } catch (err) {
    window.__ui?.showToast(`导入失败：${err?.message || '文件格式错误'}`, 'error')
    return
  }

  const summary = parsed.summary.length ? parsed.summary.join('、') : '空备份（将清空本地数据）'
  const ok = await window.__ui?.showConfirm(
    `导入将覆盖本地数据：${summary}。本机 API Key 会保留，导入完成后页面将自动刷新。是否继续？`
  )
  if (!ok) return

  try {
    const count = await applyBackup(parsed.entries)
    window.__ui?.showToast(`已恢复 ${count} 项数据，正在刷新…`, 'success')
    setTimeout(() => location.reload(), 600)
  } catch {
    window.__ui?.showToast('导入失败：写入数据时出错', 'error')
  }
}
</script>
