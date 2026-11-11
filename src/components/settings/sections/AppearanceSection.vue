<template>
          <div class="section-page">
            <h3 class="sub-title">自定义背景</h3>
            <div class="field">
              <div class="bg-upload">
                <div class="bg-preview" :style="bgPreviewStyle" @click="triggerBgUpload">
                  <span v-if="!settings.backgroundImage">点击选择图片</span>
                </div>
                <div class="avatar-actions">
                  <button class="btn-secondary" @click="triggerBgUpload">选择图片</button>
                  <button v-if="settings.backgroundImage" class="btn-secondary" @click="settings.backgroundImage = ''">移除</button>
                </div>
              </div>
              <input ref="bgInput" type="file" accept="image/*" style="display:none" @change="onBgChange" />
              <span class="range-hint">图片仅保存在本地，不会上传服务器</span>
            </div>

            <div class="divider"></div>

            <h3 class="sub-title">符号内文字</h3>
            <p class="hint">为 AI 回复中成对符号内的文字设置颜色、倾斜与加粗。</p>
            <div class="symbol-list">
              <div v-for="rule in settings.symbolRules" :key="rule.id" class="symbol-rule">
                <div class="symbol-row">
                  <span class="symbol-pair">{{ rule.open }}…{{ rule.close }}</span>
                  <div class="symbol-controls">
                    <button class="color-dot" :style="{ background: rule.color }" title="文字颜色" @click="toggleColorPicker(rule.id)"></button>
                    <button class="fmt-btn" :class="{ active: rule.italic }" title="倾斜" @click="rule.italic = !rule.italic">I</button>
                    <button class="fmt-btn bold" :class="{ active: rule.bold }" title="加粗" @click="rule.bold = !rule.bold">B</button>
                    <button v-if="rule.custom" class="fmt-btn danger" title="删除符号" @click="removeRule(rule.id)">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                  </div>
                </div>
                <div v-if="colorPickerId === rule.id" class="color-palette">
                  <button
                    v-for="c in basicColors"
                    :key="c.value"
                    class="color-swatch"
                    :class="{ active: rule.color.toLowerCase() === c.value }"
                    :style="{ background: c.value }"
                    :title="c.name"
                    @click="setRuleColor(rule, c.value)"
                  ></button>
                </div>
              </div>
            </div>

            <div class="custom-symbol">
              <input v-model="newSymbol.open" maxlength="4" placeholder="起始符号，如 （" />
              <input v-model="newSymbol.close" maxlength="4" placeholder="结束符号，如 ）" />
              <button class="btn-secondary" @click="addCustomSymbol">添加</button>
            </div>
            <span class="range-hint">支持冒号、书名号等成对符号，例如 ：…： 或 《…》</span>

            <div class="divider"></div>

            <h3 class="sub-title">头像显示</h3>
            <div class="switch-row">
              <span>隐藏用户头像</span>
              <label class="switch-label">
                <input type="checkbox" v-model="settings.hideUserAvatar" class="switch-input" />
                <span class="switch-track"><span class="switch-thumb"></span></span>
              </label>
            </div>
            <div class="switch-row">
              <span>隐藏 AI 头像</span>
              <label class="switch-label">
                <input type="checkbox" v-model="settings.hideAiAvatar" class="switch-input" />
                <span class="switch-track"><span class="switch-thumb"></span></span>
              </label>
            </div>
            <p class="hint">开启后对话页面仅显示消息气泡，不显示对应头像。</p>
          </div>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import { useSettingsStore } from '../../../stores/settings'

const settings = useSettingsStore()
const bgInput = ref(null)
const colorPickerId = ref('')
const newSymbol = reactive({ open: '', close: '' })
const basicColors = [
  { name: '黑色', value: '#000000' },
  { name: '白色', value: '#ffffff' },
  { name: '灰色', value: '#808080' },
  { name: '红色', value: '#ef4444' },
  { name: '橙色', value: '#f97316' },
  { name: '黄色', value: '#eab308' },
  { name: '绿色', value: '#22c55e' },
  { name: '青色', value: '#06b6d4' },
  { name: '蓝色', value: '#3b82f6' },
  { name: '紫色', value: '#8b5cf6' },
  { name: '粉色', value: '#ec4899' },
  { name: '棕色', value: '#92400e' },
]

const bgPreviewStyle = computed(() => {
  if (!settings.backgroundImage) return {}
  return {
    backgroundImage: `url("${settings.backgroundImage}")`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  }
})

function triggerBgUpload() {
  bgInput.value?.click()
}

function onBgChange(e) {
  const file = e.target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (ev) => {
    const img = new Image()
    img.onload = () => {
      // 等比缩放，最长边不超过 1920px，避免 localStorage 超限
      const max = 1920
      const scale = Math.min(1, max / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      settings.backgroundImage = canvas.toDataURL('image/jpeg', 0.85)
      window.__ui?.showToast('背景已应用', 'success')
    }
    img.src = ev.target.result
  }
  reader.readAsDataURL(file)
  e.target.value = ''
}

function toggleColorPicker(id) {
  colorPickerId.value = colorPickerId.value === id ? '' : id
}

function setRuleColor(rule, value) {
  rule.color = value
  colorPickerId.value = ''
}

function addCustomSymbol() {
  const open = newSymbol.open.trim()
  const close = newSymbol.close.trim()
  if (!open || !close) {
    window.__ui?.showToast('请填写起始和结束符号', 'error')
    return
  }
  if (open.length > 4 || close.length > 4) {
    window.__ui?.showToast('符号长度不能超过 4 个字符', 'error')
    return
  }
  if (settings.symbolRules.some(r => r.open === open && r.close === close)) {
    window.__ui?.showToast('该符号已存在', 'error')
    return
  }
  settings.symbolRules.push({
    id: 'sym-' + Date.now(),
    open,
    close,
    color: '#000000',
    italic: false,
    bold: false,
    custom: true,
  })
  newSymbol.open = ''
  newSymbol.close = ''
  window.__ui?.showToast('已添加自定义符号', 'success')
}

function removeRule(id) {
  settings.symbolRules = settings.symbolRules.filter(r => r.id !== id)
  if (colorPickerId.value === id) colorPickerId.value = ''
}
</script>
