<template>
  <Teleport to="body">
    <div class="settings-overlay" :class="{ open: visible }" @click.self="close">
      <div class="settings-panel" :class="{ open: visible }">
        <div class="settings-header">
          <button v-if="activeSection" class="btn-back" @click="goMenu" title="返回设置">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <h2>{{ activeSection ? currentSection.title : '设置' }}</h2>
        </div>

        <div class="settings-body">
          <!-- 设置菜单 -->
          <div v-if="!activeSection" class="settings-menu">
              <button
              v-for="sec in sections"
              :key="sec.key"
              class="menu-item"
              @click="openSection(sec.key)"
            >
              <span class="menu-icon">
                <svg v-if="sec.key === 'user'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                <svg v-else-if="sec.key === 'model'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2"/></svg>
                <svg v-else-if="sec.key === 'search'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <svg v-else-if="sec.key === 'params'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>
                <svg v-else-if="sec.key === 'appearance'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="13.5" cy="6.5" r="1.5"/><circle cx="17.5" cy="10.5" r="1.5"/><circle cx="8.5" cy="7.5" r="1.5"/><circle cx="6.5" cy="12.5" r="1.5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>
                <svg v-else-if="sec.key === 'usage'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><polyline points="7 14 11 10 14 13 20 6"/></svg>
                <i v-else class="fa-solid fa-database"></i>
              </span>
              <span class="menu-text">
                <span class="menu-title">{{ sec.title }}</span>
                <span class="menu-desc">{{ sec.desc }}</span>
              </span>
              <svg class="menu-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>

          <UserSection v-else-if="activeSection === 'user'" />
          <UsageSection v-else-if="activeSection === 'usage'" />
          <ModelSection v-else-if="activeSection === 'model'" />
          <SearchSection v-else-if="activeSection === 'search'" />
          <ParamsSection v-else-if="activeSection === 'params'" />
          <AppearanceSection v-else-if="activeSection === 'appearance'" />
          <DataSection v-else-if="activeSection === 'data'" />
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
import UserSection from './sections/UserSection.vue'
import UsageSection from './sections/UsageSection.vue'
import ModelSection from './sections/ModelSection.vue'
import SearchSection from './sections/SearchSection.vue'
import ParamsSection from './sections/ParamsSection.vue'
import AppearanceSection from './sections/AppearanceSection.vue'
import DataSection from './sections/DataSection.vue'

const settings = useSettingsStore()
const visible = ref(false)

const sections = [
  { key: 'user', title: '用户信息', desc: '昵称、头像与人设' },
  { key: 'usage', title: '用量查询', desc: '服务商余额与本应用消耗' },
  { key: 'model', title: '模型设置', desc: '模型选择与 API 配置' },
  { key: 'search', title: '搜索服务', desc: 'Tavily API Key 与搜索深度' },
  { key: 'params', title: '参数设置', desc: '思考强度、工具调用上限与上下文/输出长度' },
  { key: 'appearance', title: '外观设置', desc: '自定义背景、符号文字样式与头像显示' },
  { key: 'data', title: '数据设置', desc: '存储占用、备份导出与导入恢复' },
]
const activeSection = ref('')
const currentSection = computed(() => sections.find(s => s.key === activeSection.value) || { title: '设置' })

function openSection(key) {
  activeSection.value = key
}

function goMenu() { activeSection.value = '' }

function open(section = '') {
  openSection(section)
  visible.value = true
}

function close() { visible.value = false }

function saveAndClose() {
  settings.persist()
  close()
}

defineExpose({ open, close })
</script>

<style src="./SettingsPanel.css"></style>
