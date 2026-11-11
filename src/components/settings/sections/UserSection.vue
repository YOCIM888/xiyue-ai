<template>
          <div class="section-page">
            <div class="field">
              <label>用户名 / 昵称</label>
              <input v-model="settings.userName" type="text" placeholder="输入你的名字，AI 会用它称呼你…" />
            </div>
            <!-- 头像上传 -->
            <div class="field">
              <label>用户头像</label>
              <div class="avatar-upload">
                <div class="avatar-preview" @click="triggerUpload">
                  <img v-if="settings.userAvatar" :src="settings.userAvatar" class="avatar-preview-img" />
                  <svg v-else width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                </div>
                <div class="avatar-actions">
                  <button class="btn-secondary" @click="triggerUpload">选择图片</button>
                  <button v-if="settings.userAvatar" class="btn-secondary" @click="settings.userAvatar = ''">移除</button>
                </div>
              </div>
              <input ref="fileInput" type="file" accept="image/*" style="display:none" @change="onFileChange" />
            </div>

            <div class="divider"></div>

            <div class="field">
              <label>用户人设</label>
              <textarea
                v-model="settings.userPersona"
                class="persona-input"
                rows="3"
                placeholder="例如：我是一名前端开发者，喜欢简洁直接的回答…"
              ></textarea>
              <span class="range-hint">会附加到每次对话，帮助 AI 了解你的背景与偏好；留空则不附加。</span>
            </div>

            <div class="divider"></div>

            <div class="section-header">
              <h3 class="sub-title">AI 人设提示</h3>
              <label class="switch-label">
                <input type="checkbox" v-model="settings.personaEnabled" class="switch-input" />
                <span class="switch-track">
                  <span class="switch-thumb"></span>
                </span>
                <span class="switch-text">{{ settings.personaEnabled ? '已启用' : '已关闭' }}</span>
              </label>
            </div>
            <p class="hint" v-if="settings.personaEnabled">开启时优先遵守下方人设提示词。</p>
            <p class="hint" v-else>关闭后使用白曦月默认人设。</p>
            <textarea
              v-model="settings.personaPrompt"
              class="persona-input"
              rows="5"
              placeholder="例如：你是一个专业的中文助手..."
            ></textarea>

            <div class="divider"></div>

            <div class="section-header">
              <h3 class="sub-title">AI 回复规则</h3>
              <label class="switch-label">
                <input type="checkbox" v-model="settings.replyRulesEnabled" class="switch-input" />
                <span class="switch-track">
                  <span class="switch-thumb"></span>
                </span>
                <span class="switch-text">{{ settings.replyRulesEnabled ? '已启用' : '已关闭' }}</span>
              </label>
            </div>
            <textarea
              v-model="settings.replyRules"
              class="persona-input"
              rows="4"
              placeholder="例如：1. 不得过度说教、批评，保持专业性。"
            ></textarea>
            <p class="hint">规则会追加在系统提示词末尾，关闭后不生效。</p>
          </div>
</template>

<script setup>
import { ref } from 'vue'
import { useSettingsStore } from '../../../stores/settings'

const settings = useSettingsStore()
const fileInput = ref(null)

function triggerUpload() {
  fileInput.value?.click()
}

function onFileChange(e) {
  const file = e.target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (ev) => {
    // 裁剪为正方形圆形头像
    const img = new Image()
    img.onload = () => {
      const size = Math.min(img.width, img.height)
      const canvas = document.createElement('canvas')
      canvas.width = 200
      canvas.height = 200
      const ctx = canvas.getContext('2d')
      // 圆形裁剪
      ctx.beginPath()
      ctx.arc(100, 100, 100, 0, Math.PI * 2)
      ctx.clip()
      const sx = (img.width - size) / 2
      const sy = (img.height - size) / 2
      ctx.drawImage(img, sx, sy, size, size, 0, 0, 200, 200)
      settings.userAvatar = canvas.toDataURL('image/jpeg', 0.85)
    }
    img.src = ev.target.result
  }
  reader.readAsDataURL(file)
  // 清空以便重复选同一文件
  e.target.value = ''
}
</script>
