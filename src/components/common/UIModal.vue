<template>
  <Teleport to="body">
    <!-- 确认对话框 -->
    <div v-if="modal.show" class="modal-overlay" @click.self="modal.onCancel?.()">
      <div class="modal-box">
        <p class="modal-msg">{{ modal.message }}</p>
        <div class="modal-actions">
          <button class="modal-btn cancel" @click="modal.onCancel?.()">{{ modal.cancelText || '取消' }}</button>
          <button class="modal-btn confirm" @click="modal.onConfirm?.()">{{ modal.confirmText || '确定' }}</button>
        </div>
      </div>
    </div>

    <!-- Toast 提示 -->
    <div v-if="toast.show" class="toast" :class="toast.type">{{ toast.message }}</div>

    <!-- 浮窗菜单（背景设置等） -->
    <div v-if="menu.show" class="menu-overlay" @click.self="menu.onClose?.()">
      <div class="menu-box" :style="{ top: menu.y + 'px', left: menu.x + 'px' }">
        <button v-for="it in menu.items" :key="it.label" class="menu-item" @click="it.action(); menu.onClose?.()">
          {{ it.label }}
        </button>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { reactive } from 'vue'

const modal = reactive({ show: false, message: '', confirmText: '', cancelText: '', onConfirm: null, onCancel: null })
const toast = reactive({ show: false, message: '', type: 'info' })
const menu = reactive({ show: false, x: 0, y: 0, items: [], onClose: null })

function showConfirm(message, { confirmText, cancelText } = {}) {
  return new Promise((resolve) => {
    modal.message = message
    modal.confirmText = confirmText
    modal.cancelText = cancelText
    modal.show = true
    modal.onConfirm = () => { modal.show = false; resolve(true) }
    modal.onCancel = () => { modal.show = false; resolve(false) }
  })
}

function showToast(message, type = 'info', duration = 2500) {
  toast.message = message
  toast.type = type
  toast.show = true
  setTimeout(() => { toast.show = false }, duration)
}

function showMenu(x, y, items) {
  return new Promise((resolve) => {
    // 调整菜单位置防溢出
    const mx = Math.min(x, window.innerWidth - 180)
    const my = Math.min(y, window.innerHeight - items.length * 44 - 20)
    menu.x = mx
    menu.y = my
    menu.items = items
    menu.show = true
    menu.onClose = () => { menu.show = false; resolve(null) }
  })
}

// 全局注册
if (!window.__ui) {
  window.__ui = { showConfirm, showToast, showMenu }
}
</script>

<style scoped>
/* Modal */
.modal-overlay {
  position: fixed; inset: 0; z-index: 2000;
  background: rgba(0,0,0,0.45);
  display: flex; align-items: center; justify-content: center;
}
.modal-box {
  background: var(--bg-primary);
  border-radius: 14px; padding: 24px;
  max-width: 360px; width: 90%;
  box-shadow: 0 8px 32px rgba(0,0,0,0.18);
}
.modal-msg { font-size: 14px; color: var(--text-primary); margin: 0 0 20px; line-height: 1.6; }
.modal-actions { display: flex; gap: 10px; justify-content: flex-end; }
.modal-btn {
  padding: 8px 20px; border-radius: 8px; font-size: 13px; cursor: pointer; border: none;
}
.modal-btn.cancel { background: var(--bg-hover); color: var(--text-secondary); }
.modal-btn.confirm { background: var(--accent); color: #fff; }
.modal-btn.confirm.danger { background: var(--danger); }

/* Toast */
.toast {
  position: fixed; bottom: 60px; left: 50%; transform: translateX(-50%);
  z-index: 2100; padding: 10px 22px; border-radius: 20px;
  font-size: 13px; color: #fff; background: #333;
  box-shadow: 0 4px 12px rgba(0,0,0,0.2);
}
.toast.success { background: #10b981; }
.toast.error { background: var(--danger); }

/* 浮窗菜单 */
.menu-overlay { position: fixed; inset: 0; z-index: 2000; }
.menu-box {
  position: fixed; z-index: 2001;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 12px; padding: 6px;
  min-width: 160px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.15);
}
.menu-item {
  display: block; width: 100%; padding: 10px 14px;
  border: none; border-radius: 8px;
  background: transparent; color: var(--text-primary);
  font-size: 13px; text-align: left; cursor: pointer;
  font-family: inherit;
}
.menu-item:hover { background: var(--bg-hover); }
</style>
