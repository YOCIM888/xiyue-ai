<template>
  <div class="app-container">
    <Sidebar />
    <div class="main-area">
      <TopBar @open-settings="settingsPanel?.open()" @scroll-top="window.__scrollToTop?.()" />
      <router-view />
    </div>
    <SettingsPanel ref="settingsPanel" />
    <AssetPanel ref="assetPanel" />
    <UIModal />
  </div>
</template>

<script setup>
import { ref, onMounted, provide } from 'vue'
import Sidebar from './components/layout/Sidebar.vue'
import TopBar from './components/layout/TopBar.vue'
import SettingsPanel from './components/settings/SettingsPanel.vue'
import AssetPanel from './components/assets/AssetPanel.vue'
import UIModal from './components/common/UIModal.vue'
import { loadSystemPrompt } from './utils/storage'

const settingsPanel = ref(null)
const assetPanel = ref(null)
provide('assetPanel', assetPanel)

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

  // 禁用 Android WebView 下拉刷新（更激进）
  const isWebView = /wv|WebView/i.test(navigator.userAgent) || /Android/i.test(navigator.userAgent)
  if (isWebView) {
    let startY = 0
    document.addEventListener('touchstart', (e) => {
      startY = e.touches[0]?.clientY || 0
    }, { passive: true })
    document.addEventListener('touchmove', (e) => {
      // 只要下拉就阻止，除非在明确的滚动容器内
      if (!e.target.closest('.topic-list, .message-list, .asset-list, .settings-body, .ae-content')) {
        e.preventDefault()
        return
      }
      // 在滚动容器内：仅在顶部继续下拉时阻止（防止 overscroll 触发 WebView 刷新）
      const container = e.target.closest('.topic-list, .message-list, .asset-list, .settings-body, .ae-content')
      if (container && container.scrollTop <= 0 && e.touches[0]?.clientY > startY) {
        e.preventDefault()
      }
    }, { passive: false })
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
