<template>
  <aside class="starry-directory">
    <div class="dir-head">
      <div class="dir-title-wrap">
        <span class="dir-title">通讯录</span>
        <span v-if="total" class="dir-count">{{ total }}</span>
      </div>
      <button class="add-btn" title="添加好友或新建群聊" @click="$emit('add', $event)">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
      </button>
    </div>

    <div v-if="total" class="dir-list">
      <template v-if="groups.length">
        <div class="section-label">群聊</div>
        <button
          v-for="g in groups"
          :key="g.id"
          class="dir-item"
          @click="$emit('select', 'group', g.id)"
        >
          <StarryAvatar group :name="g.name" :size="44" />
          <div class="dir-info">
            <div class="dir-name">{{ g.name }}</div>
            <div class="dir-desc">{{ g.members.length + 1 }} 人</div>
          </div>
        </button>
      </template>

      <template v-if="friends.length">
        <div class="section-label">好友</div>
        <button
          v-for="f in friends"
          :key="f.id"
          class="dir-item"
          @click="$emit('select', 'friend', f.id)"
        >
          <StarryAvatar :name="f.name" :src="f.avatar" :size="44" />
          <div class="dir-info">
            <div class="dir-name">{{ f.name }}</div>
            <div class="dir-desc">{{ excerpt(f.persona) || '星空中的好友' }}</div>
          </div>
        </button>
      </template>
    </div>

    <div v-else class="dir-empty">
      <p class="empty-title">通讯录还是空的</p>
      <p class="empty-desc">添加好友或恢复默认好友吧</p>
      <button class="empty-btn" @click="$emit('add', $event)">开始添加</button>
    </div>
  </aside>
</template>

<script setup>
import { computed } from 'vue'
import StarryAvatar from './StarryAvatar.vue'

const props = defineProps({
  friends: { type: Array, default: () => [] },
  groups: { type: Array, default: () => [] },
})

defineEmits(['select', 'add'])

const total = computed(() => props.friends.length + props.groups.length)

function excerpt(text) {
  const value = String(text || '').replace(/\s+/g, ' ').trim()
  return value.length > 36 ? `${value.slice(0, 36)}…` : value
}
</script>

<style scoped>
.starry-directory {
  width: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--bg-sidebar);
}
.dir-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}
.dir-title-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
}
.dir-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}
.dir-count {
  font-size: 11px;
  color: var(--text-muted);
  background: var(--bg-hover);
  padding: 1px 6px;
  border-radius: 8px;
}
.add-btn {
  margin-left: auto;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}
.add-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.dir-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 8px 16px;
}
.section-label {
  padding: 10px 8px 6px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
}
.dir-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 8px;
  border: none;
  border-radius: 10px;
  background: transparent;
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  transition: background 0.15s;
}
.dir-item:hover {
  background: var(--bg-hover);
}
.dir-info {
  flex: 1;
  min-width: 0;
}
.dir-name {
  font-size: 14px;
  color: var(--text-primary);
  margin-bottom: 2px;
}
.dir-desc {
  font-size: 12px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dir-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  text-align: center;
}
.empty-title {
  font-size: 14px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}
.empty-desc {
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 14px;
}
.empty-btn {
  padding: 6px 14px;
  border: none;
  border-radius: 8px;
  background: var(--accent);
  color: #fff;
  font-size: 12px;
  cursor: pointer;
}
</style>
