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

    <div v-if="prompt.show" class="modal-overlay" @click.self="cancelPrompt">
      <div class="modal-box">
        <p class="modal-msg">{{ prompt.message }}</p>
        <input
          ref="promptInput"
          v-model="prompt.value"
          class="modal-input"
          :placeholder="prompt.placeholder"
          @keydown.enter.prevent="confirmPrompt"
          @keydown.esc.prevent="cancelPrompt"
        />
        <div class="modal-actions">
          <button class="modal-btn cancel" @click="cancelPrompt">取消</button>
          <button class="modal-btn confirm" @click="confirmPrompt">{{ prompt.confirmText || '确定' }}</button>
        </div>
      </div>
    </div>

    <!-- Toast 提示 -->
    <div v-if="toast.show" class="toast" :class="toast.type" :style="{ bottom: toast.bottom + 'px' }">
      <span>{{ toast.message }}</span>
      <button v-if="toast.actionText" class="toast-action" @click="runToastAction">{{ toast.actionText }}</button>
    </div>

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
import { nextTick, reactive, ref } from 'vue'

const modal = reactive({ show: false, message: '', confirmText: '', cancelText: '', onConfirm: null, onCancel: null })
const prompt = reactive({ show: false, message: '', placeholder: '', value: '', confirmText: '', resolve: null })
const promptInput = ref(null)
const toast = reactive({ show: false, message: '', type: 'info', actionText: '', onAction: null, bottom: 60 })
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

async function showPrompt(message, { placeholder = '', value = '', confirmText = '确定' } = {}) {
  prompt.message = message
  prompt.placeholder = placeholder
  prompt.value = value
  prompt.confirmText = confirmText
  prompt.show = true
  const result = new Promise((resolve) => { prompt.resolve = resolve })
  await nextTick()
  promptInput.value?.focus()
  promptInput.value?.select()
  return result
}

function finishPrompt(value) {
  prompt.show = false
  prompt.resolve?.(value)
  prompt.resolve = null
}

function confirmPrompt() {
  const value = String(prompt.value || '').trim()
  if (!value) return
  finishPrompt(value)
}

function cancelPrompt() {
  finishPrompt(null)
}

let toastTimer = null

/** 聊天页输入框高度不固定（附件、自动增高），气泡要贴着它上沿才不会盖住输入区 */
function toastBottom() {
  const min = 60
  const max = Math.round(window.innerHeight * 0.45)
  const composer = document.querySelector('.chat-input-container')
  if (!composer) return min
  const gap = window.innerHeight - composer.getBoundingClientRect().top + 12
  return Math.max(min, Math.min(max, Math.round(gap)))
}

function showToast(message, type = 'info', duration = 2500, { actionText = '', onAction = null } = {}) {
  clearTimeout(toastTimer)
  toast.message = message
  toast.type = type
  toast.actionText = actionText
  toast.onAction = onAction
  toast.bottom = toastBottom()
  toast.show = true
  if (duration > 0) {
    toastTimer = setTimeout(() => { toast.show = false }, duration)
  }
}

function runToastAction() {
  clearTimeout(toastTimer)
  toast.show = false
  toast.onAction?.()
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
window.__ui = { showConfirm, showPrompt, showToast, showMenu }
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
.modal-input {
  width: 100%;
  box-sizing: border-box;
  margin: 0 0 18px;
  padding: 9px 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: 13px;
  font-family: inherit;
  outline: none;
}
.modal-input:focus {
  border-color: var(--accent);
}
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
  display: flex; align-items: center; gap: 12px; max-width: min(92vw, 520px);
}
.toast-action {
  border: none; border-radius: 14px; padding: 4px 12px;
  background: rgba(255,255,255,0.22); color: #fff;
  font-size: 12px; font-family: inherit; cursor: pointer; flex-shrink: 0;
}
.toast-action:hover { background: rgba(255,255,255,0.34); }
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
