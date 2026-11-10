<template>
  <div class="app-container">
    <Sidebar @open-settings="openSettings" />
    <div class="main-area">
      <TopBar v-if="!isImmersive" />
      <router-view />
    </div>
    <SettingsPanel ref="settingsPanel" />
    <AssetPanel ref="assetPanel" />
    <SkillPanel ref="skillPanel" />
    <WorkspacePanel ref="workspacePanel" />
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
import WorkspacePanel from './components/workspace/WorkspacePanel.vue'
import MemoryPanel from './components/memory/MemoryPanel.vue'
import UIModal from './components/common/UIModal.vue'
import { useSettingsStore } from './stores/settings'

const settings = useSettingsStore()
const route = useRoute()

// 探索星空 / 梦境推演使用独立页头，隐藏主聊天顶栏
const isImmersive = computed(() => route.path.startsWith('/starry') || route.path.startsWith('/dream'))

// 全局深浅色主题
watchEffect(() => {
  document.documentElement.dataset.theme = settings.darkMode ? 'dark' : 'light'
})

const settingsPanel = ref(null)
const assetPanel = ref(null)
const skillPanel = ref(null)
const workspacePanel = ref(null)
const memoryPanel = ref(null)
provide('assetPanel', assetPanel)
provide('skillPanel', skillPanel)
provide('workspacePanel', workspacePanel)
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
  --topbar-h: 60px;
  display: flex;
  height: 100dvh;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  background: var(--bg-primary);
}
@media (max-width: 768px) {
  .app-container {
    --topbar-h: 56px;
  }
}
.main-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
</style>
