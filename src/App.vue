<template>
  <div class="app-container">
    <Sidebar @open-settings="openSettings" />
    <div class="main-area">
      <TopBar v-if="!isStarry" />
      <router-view />
    </div>
    <SettingsPanel ref="settingsPanel" />
    <AssetPanel ref="assetPanel" />
    <SkillPanel ref="skillPanel" />
    <MemoryPanel ref="memoryPanel" />
    <UIModal />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, provide, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import Sidebar from './components/layout/Sidebar.vue'
import TopBar from './components/layout/TopBar.vue'
import SettingsPanel from './components/settings/SettingsPanel.vue'
import AssetPanel from './components/assets/AssetPanel.vue'
import SkillPanel from './components/skills/SkillPanel.vue'
import MemoryPanel from './components/memory/MemoryPanel.vue'
import UIModal from './components/common/UIModal.vue'
import { loadSystemPrompt } from './utils/storage'
import { useSettingsStore } from './stores/settings'

const settings = useSettingsStore()
const route = useRoute()

// 探索星空使用独立页头，隐藏主聊天顶栏
const isStarry = computed(() => route.path.startsWith('/starry'))

// 全局深浅色主题
watchEffect(() => {
  document.documentElement.dataset.theme = settings.darkMode ? 'dark' : 'light'
})

const settingsPanel = ref(null)
const assetPanel = ref(null)
const skillPanel = ref(null)
const memoryPanel = ref(null)
provide('assetPanel', assetPanel)
provide('skillPanel', skillPanel)
provide('memoryPanel', memoryPanel)

function openSettings(section) {
  settingsPanel.value?.open(section)
}

onMounted(async () => {
  // 移动端键盘弹出时调整高度（兼容不支持 dvh 的浏览器）
  if (window.visualViewport) {
    const adjustHeight = () => {
      document.documentElement.style.height = window.visualViewport.height + 'px'
    }
    window.visualViewport.addEventListener('resize', adjustHeight)
    window.visualViewport.addEventListener('scroll', adjustHeight)
  }
})
</script>

<style scoped>
.app-container {
  display: flex;
  height: 100dvh;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  background: var(--bg-primary);
}
.main-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
</style>
