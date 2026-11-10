<template>
  <Teleport to="body">
    <div v-if="visible" class="dialog-overlay" @click.self="close">
      <div class="dialog-box">
        <div class="dialog-head">
          <h3>{{ isEditing ? '群成员管理' : '新建群聊' }}</h3>
          <button class="close-btn" @click="close" title="关闭">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div class="dialog-body">
          <label class="field">
            <span class="field-label">群聊名称</span>
            <input
              v-model="groupName"
              class="field-input"
              :disabled="isEditing"
              placeholder="给群聊起个名字"
              maxlength="24"
            />
          </label>

          <div class="members-head">
            <span class="field-label">群成员</span>
            <span class="members-count">已选 {{ selected.length }} 人 · 用户自动在场</span>
          </div>

          <div v-if="friends.length" class="member-list">
            <button
              v-for="f in friends"
              :key="f.id"
              class="member-item"
              :class="{ selected: selected.includes(f.id) }"
              @click="toggle(f.id)"
            >
              <span class="check" :class="{ on: selected.includes(f.id) }">
                <svg v-if="selected.includes(f.id)" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              </span>
              <StarryAvatar :name="f.name" :src="f.avatar" :size="32" />
              <span class="member-name">{{ f.name }}</span>
            </button>
          </div>
          <p v-else class="empty-hint">还没有好友，先去添加好友再来建群吧。</p>

          <p v-if="isEditing" class="field-hint">可以随时拉人进群或踢出成员；成员为空时群聊仍会保留。</p>
          <p v-if="error" class="field-error">{{ error }}</p>
        </div>

        <div class="dialog-foot">
          <button class="ghost-btn" @click="close">取消</button>
          <button class="primary-btn" :disabled="!canSave" @click="save">
            {{ isEditing ? '保存成员' : '创建群聊' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, ref } from 'vue'
import StarryAvatar from './StarryAvatar.vue'
import { useStarryStore } from '../../stores/starry'

defineProps({
  friends: { type: Array, default: () => [] },
})
const emit = defineEmits(['created', 'saved'])

const store = useStarryStore()

const visible = ref(false)
const isEditing = ref(false)
const editingId = ref('')
const groupName = ref('')
const selected = ref([])
const error = ref('')

const canSave = computed(() => {
  if (isEditing.value) return true
  return selected.value.length >= 1
})

function open(group = null) {
  error.value = ''
  if (group) {
    isEditing.value = true
    editingId.value = group.id
    groupName.value = group.name
    selected.value = [...group.members]
  } else {
    isEditing.value = false
    editingId.value = ''
    groupName.value = '星空俱乐部'
    selected.value = []
  }
  visible.value = true
}

function close() {
  visible.value = false
}

function toggle(id) {
  const idx = selected.value.indexOf(id)
  if (idx >= 0) selected.value.splice(idx, 1)
  else selected.value.push(id)
}

function save() {
  error.value = ''
  if (isEditing.value) {
    store.updateGroupMembers(editingId.value, selected.value)
    window.__ui?.showToast('群成员已更新', 'success')
    emit('saved')
    close()
    return
  }
  if (!selected.value.length) {
    error.value = '至少选择 1 位好友'
    return
  }
  const group = store.createGroup({ name: groupName.value, members: selected.value })
  if (!group) {
    error.value = '创建失败，请检查群成员'
    return
  }
  window.__ui?.showToast('群聊已创建', 'success')
  emit('created', group)
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
  gap: 12px;
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
.field-input {
  width: 100%;
  padding: 9px 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: 13px;
  font-family: inherit;
  outline: none;
}
.field-input:focus {
  border-color: var(--accent);
}
.field-input:disabled {
  background: var(--bg-sidebar);
  color: var(--text-secondary);
  cursor: default;
}
.members-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 2px;
}
.members-count {
  font-size: 11px;
  color: var(--text-muted);
}
.member-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 6px;
  max-height: 260px;
  overflow-y: auto;
}
.member-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 8px;
  border: none;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  font-family: inherit;
  text-align: left;
}
.member-item:hover {
  background: var(--bg-hover);
}
.member-item.selected {
  background: var(--accent-light);
}
.check {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  border: 1.5px solid var(--border-color);
  border-radius: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  background: var(--bg-input);
}
.check.on {
  background: var(--accent);
  border-color: var(--accent);
}
.member-name {
  font-size: 13px;
  color: var(--text-primary);
}
.empty-hint {
  font-size: 12px;
  color: var(--text-muted);
  padding: 16px;
  text-align: center;
  border: 1px dashed var(--border-color);
  border-radius: 10px;
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
.primary-btn:hover:not(:disabled) {
  background: var(--accent-hover);
}
.primary-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
