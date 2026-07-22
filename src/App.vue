<template>
  <div class="app-container">
    <Sidebar />
    <div class="main-area">
      <TopBar @open-settings="settingsPanel?.open()" @scroll-top="window.__scrollToTop?.()" />
      <router-view />
    </div>
    <SettingsPanel ref="settingsPanel" />
    <UIModal />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import Sidebar from './components/layout/Sidebar.vue'
import TopBar from './components/layout/TopBar.vue'
import SettingsPanel from './components/settings/SettingsPanel.vue'
import UIModal from './components/common/UIModal.vue'
import { loadSystemPrompt } from './utils/storage'

const settingsPanel = ref(null)

onMounted(async () => {
  // PWA 安装事件
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    window.__deferredPrompt = e
  })

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
