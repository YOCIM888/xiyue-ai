<template>
  <div class="app-container">
    <Sidebar />
    <div class="main-area">
      <TopBar @open-settings="settingsPanel?.open()" />
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
  // 每次启动从 prompt/system.md 加载系统提示词
  try {
    const resp = await fetch('/prompt/system.md')
    if (resp.ok) {
      const text = await resp.text()
      if (text.trim()) {
        localStorage.setItem('system_prompt_content', text)
      }
    }
  } catch {}

  // PWA 安装事件
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    window.__deferredPrompt = e
  })
})
</script>

<style scoped>
.app-container {
  display: flex;
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
