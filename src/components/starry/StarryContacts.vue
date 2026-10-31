<template>
  <aside class="starry-contacts">
    <div class="contacts-head">
      <div class="contacts-title-wrap">
        <span class="contacts-title">聊天</span>
        <span v-if="hasAny" class="contacts-count">{{ totalCount }}</span>
      </div>
      <button class="add-btn" title="添加好友或新建群聊" @click="$emit('add', $event)">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
      </button>
    </div>

    <div v-if="hasAny" class="contacts-list">
      <template v-if="sortedGroups.length">
        <div class="section-label">群聊</div>
        <button
          v-for="g in sortedGroups"
          :key="g.id"
          class="contact-item"
          :class="{ active: activeType === 'group' && activeId === g.id }"
          @click="$emit('select', 'group', g.id)"
        >
          <StarryAvatar group :name="g.name" :size="44" />
          <div class="contact-info">
            <div class="contact-line">
              <span class="contact-name">{{ g.name }}</span>
              <span class="contact-time">{{ fmtListTime(g.lastTs) }}</span>
            </div>
            <div class="contact-preview">{{ g.lastMessage || `${g.members.length + 1} 人` }}</div>
          </div>
        </button>
      </template>

      <template v-if="sortedFriends.length">
        <div class="section-label">好友</div>
        <button
          v-for="f in sortedFriends"
          :key="f.id"
          class="contact-item"
          :class="{ active: activeType === 'friend' && activeId === f.id }"
          @click="$emit('select', 'friend', f.id)"
        >
          <StarryAvatar :name="f.name" :src="f.avatar" :size="44" />
          <div class="contact-info">
            <div class="contact-line">
              <span class="contact-name">{{ f.name }}</span>
              <span class="contact-time">{{ fmtListTime(f.lastTs) }}</span>
            </div>
            <div class="contact-preview">{{ f.lastMessage || '开始聊天吧' }}</div>
          </div>
        </button>
      </template>
    </div>

    <div v-else class="contacts-empty">
      <div class="empty-icon">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.2l5.9-.9L12 3z" /></svg>
      </div>
      <p class="empty-title">星空中还没有好友</p>
      <p class="empty-desc">点亮第一位朋友，或恢复默认好友</p>
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
  activeType: { type: String, default: '' },
  activeId: { type: String, default: '' },
})

defineEmits(['select', 'add'])

const hasAny = computed(() => props.friends.length > 0 || props.groups.length > 0)
const totalCount = computed(() => props.friends.length + props.groups.length)

const sortedGroups = computed(() =>
  [...props.groups].sort((a, b) => (b.lastTs || 0) - (a.lastTs || 0))
)
const sortedFriends = computed(() =>
  [...props.friends].sort((a, b) => (b.lastTs || 0) - (a.lastTs || 0))
)

function pad(n) {
  return String(n).padStart(2, '0')
}

function fmtListTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return '昨天'
  if (d.getFullYear() === now.getFullYear()) {
    return `${d.getMonth() + 1}月${d.getDate()}日`
  }
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
}
</script>

<style scoped>
.starry-contacts {
  width: 300px;
  min-width: 300px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-right: 1px solid var(--border-color);
  background: var(--bg-sidebar);
}

.contacts-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px 10px;
  flex-shrink: 0;
}
.contacts-title-wrap {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding-left: 4px;
}
.contacts-title {
  font-size: 17px;
  font-weight: 600;
  color: var(--text-primary);
}
.contacts-count {
  font-size: 11px;
  color: var(--text-muted);
}
.add-btn {
  width: 30px;
  height: 30px;
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

.contacts-list {
  flex: 1;
  overflow-y: auto;
  overscroll-behavior: none;
  padding: 0 8px 12px;
}
.section-label {
  padding: 10px 8px 6px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  letter-spacing: 0.5px;
}
.contact-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 8px;
  border: none;
  border-radius: 10px;
  background: transparent;
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  transition: background 0.15s;
}
.contact-item:hover {
  background: var(--bg-hover);
}
.contact-item.active {
  background: var(--bg-active);
}
.contact-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.contact-line {
  display: flex;
  align-items: center;
  gap: 8px;
}
.contact-name {
  flex: 1;
  min-width: 0;
  font-size: 13.5px;
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.contact-time {
  flex-shrink: 0;
  font-size: 10px;
  color: var(--text-muted);
}
.contact-preview {
  font-size: 11.5px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.contacts-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  text-align: center;
  color: var(--text-muted);
}
.empty-icon {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: var(--accent-light);
  color: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 14px;
}
.empty-title {
  font-size: 14px;
  color: var(--text-primary);
  margin-bottom: 6px;
}
.empty-desc {
  font-size: 12px;
  line-height: 1.6;
  margin-bottom: 16px;
}
.empty-btn {
  padding: 8px 20px;
  border: none;
  border-radius: 8px;
  background: var(--accent);
  color: #fff;
  font-size: 13px;
  cursor: pointer;
  font-family: inherit;
}
.empty-btn:hover {
  background: var(--accent-hover);
}

@media (max-width: 768px) {
  .starry-contacts {
    width: 100%;
    min-width: 0;
    border-right: none;
  }
}
</style>
