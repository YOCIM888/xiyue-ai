<template>
  <Teleport to="body">
    <div v-if="visible" class="dialog-overlay" @click.self="close">
      <div class="dialog-box">
        <div class="dialog-head">
          <h3>{{ isEditing ? (isFixed ? '好友资料' : '编辑好友') : '添加好友' }}</h3>
          <button class="close-btn" @click="close" title="关闭">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div class="dialog-body">
          <div class="avatar-row">
            <StarryAvatar :name="form.name || '?'" :src="form.avatar" :size="56" />
            <div class="avatar-actions">
              <button class="ghost-btn" @click="triggerAvatar">更换头像</button>
              <button v-if="form.avatar" class="ghost-btn danger" @click="form.avatar = ''">移除</button>
            </div>
            <input ref="avatarInput" type="file" accept="image/*" style="display: none" @change="onAvatarChange" />
          </div>

          <label class="field">
            <span class="field-label">名称</span>
            <input v-model="form.name" class="field-input" :disabled="isFixed" placeholder="好友名称" maxlength="20" />
          </label>

          <label class="field">
            <span class="field-label">人设</span>
            <textarea
              v-model="form.persona"
              class="field-textarea"
              :disabled="isFixed"
              rows="5"
              placeholder="描述这位好友的性格、说话方式与背景…"
            ></textarea>
          </label>

          <p v-if="isFixed" class="field-hint">默认好友的人设固定，不可修改；头像仍可更换。</p>
          <p v-if="error" class="field-error">{{ error }}</p>
        </div>

        <div class="dialog-foot">
          <button class="ghost-btn" @click="close">取消</button>
          <button class="primary-btn" @click="save">保存</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { reactive, ref } from 'vue'
import StarryAvatar from './StarryAvatar.vue'
import { useStarryStore } from '../../stores/starry'

const store = useStarryStore()
const emit = defineEmits(['saved'])

const visible = ref(false)
const editingId = ref('')
const isFixed = ref(false)
const error = ref('')
const avatarInput = ref(null)

const form = reactive({ name: '', persona: '', avatar: '' })

const isEditing = ref(false)

function open(friend = null) {
  error.value = ''
  if (friend) {
    isEditing.value = true
    editingId.value = friend.id
    isFixed.value = !!friend.fixed
    form.name = friend.name
    form.persona = friend.persona
    form.avatar = friend.avatar || ''
  } else {
    isEditing.value = false
    editingId.value = ''
    isFixed.value = false
    form.name = ''
    form.persona = ''
    form.avatar = ''
  }
  visible.value = true
}

function close() {
  visible.value = false
}

function triggerAvatar() {
  avatarInput.value?.click()
}

function onAvatarChange(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return
  const reader = new FileReader()
  reader.onload = (ev) => {
    const img = new Image()
    img.onload = () => {
      const side = Math.min(img.width, img.height)
      const canvas = document.createElement('canvas')
      canvas.width = 200
      canvas.height = 200
      const ctx = canvas.getContext('2d')
      ctx.drawImage(
        img,
        (img.width - side) / 2,
        (img.height - side) / 2,
        side,
        side,
        0,
        0,
        200,
        200,
      )
      form.avatar = canvas.toDataURL('image/jpeg', 0.85)
    }
    img.onerror = () => { error.value = '图片读取失败，请换一张试试' }
    img.src = ev.target.result
  }
  reader.onerror = () => { error.value = '图片读取失败，请换一张试试' }
  reader.readAsDataURL(file)
}

function save() {
  error.value = ''
  const name = form.name.trim()
  if (!name) {
    error.value = '请填写好友名称'
    return
  }
  if (!isFixed.value && !form.persona.trim()) {
    error.value = '请填写好友人设'
    return
  }

  if (isEditing.value) {
    const patch = isFixed.value
      ? { avatar: form.avatar }
      : { name, persona: form.persona.trim(), avatar: form.avatar }
    store.updateFriend(editingId.value, patch)
    window.__ui?.showToast('好友资料已更新', 'success')
  } else {
    store.addFriend({ name, persona: form.persona.trim(), avatar: form.avatar })
    window.__ui?.showToast('好友已添加', 'success')
  }

  emit('saved')
  close()
}

defineExpose({ open, close })
</script>

<style scoped>
.dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.dialog-box {
  width: 420px;
  max-width: 100%;
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}
.dialog-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}
.dialog-head h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}
.close-btn {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.close-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.dialog-body {
  padding: 18px 20px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.avatar-row {
  display: flex;
  align-items: center;
  gap: 14px;
}
.avatar-actions {
  display: flex;
  gap: 8px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.field-label {
  font-size: 12px;
  color: var(--text-secondary);
}
.field-input,
.field-textarea {
  width: 100%;
  padding: 9px 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: 13px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s;
}
.field-textarea {
  resize: vertical;
  line-height: 1.6;
}
.field-input:focus,
.field-textarea:focus {
  border-color: var(--accent);
}
.field-input:disabled,
.field-textarea:disabled {
  background: var(--bg-sidebar);
  color: var(--text-secondary);
  cursor: default;
}
.field-hint {
  font-size: 11.5px;
  color: var(--text-muted);
  line-height: 1.6;
  margin: 0;
}
.field-error {
  font-size: 12px;
  color: var(--danger);
  margin: 0;
}
.dialog-foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid var(--border-color);
  flex-shrink: 0;
}
.ghost-btn {
  padding: 8px 16px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
}
.ghost-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.ghost-btn.danger {
  color: var(--danger);
  border-color: var(--danger-bg);
}
.primary-btn {
  padding: 8px 20px;
  border: none;
  border-radius: 8px;
  background: var(--accent);
  color: #fff;
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
}
.primary-btn:hover {
  background: var(--accent-hover);
}
</style>
