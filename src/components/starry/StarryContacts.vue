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

    <div class="contacts-search">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input v-model="query" type="text" placeholder="搜索好友、群聊或聊天记录" />
      <button v-if="query" class="search-clear" title="清空" @click="query = ''">×</button>
    </div>

    <button
      v-if="showCircleEntry"
      class="circle-entry"
      :class="{ active: circleActive }"
      @click="$emit('open-circle')"
    >
      <span class="circle-entry-icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 3l2 6.2 6.5.3-5.2 3.9 1.9 6.3-5.2-3.7-5.2 3.7 1.9-6.3-5.2-3.9 6.5-.3L12 3z"/></svg>
      </span>
      <span class="circle-entry-title">圈子</span>
      <span class="circle-entry-desc">好友动态</span>
    </button>

    <div v-if="hasAny" class="contacts-list">
      <template v-if="messageResults.length">
        <div class="section-label">聊天记录</div>
        <button
          v-for="result in messageResults"
          :key="result.messageId"
          class="message-result"
          @click="$emit('select', result.type, result.chatId)"
        >
          <div class="message-result-head">
            <span>{{ result.chatName }}</span>
            <span>{{ fmtListTime(result.ts) }}</span>
          </div>
          <div class="message-result-text">
            <b>{{ result.senderName }}</b>：{{ result.content }}
          </div>
        </button>
      </template>

      <template v-if="sortedGroups.length">
        <div class="section-label">群聊</div>
        <div
          v-for="g in sortedGroups"
          :key="g.id"
          class="contact-item"
          role="button"
          tabindex="0"
          :class="{ active: activeType === 'group' && activeId === g.id }"
          @click="$emit('select', 'group', g.id)"
          @keydown.enter="$emit('select', 'group', g.id)"
        >
          <StarryAvatar group :name="g.name" :size="44" />
          <div class="contact-info">
            <div class="contact-line">
              <span class="contact-name">{{ g.name }}</span>
              <span class="contact-time">{{ fmtListTime(g.lastTs) }}</span>
              <span v-if="g.unread" class="unread-badge">{{ g.unread > 99 ? '99+' : g.unread }}</span>
            </div>
            <div class="contact-preview">{{ g.lastMessage || `${g.members.length + 1} 人` }}</div>
          </div>
          <button
            class="pin-btn"
            :class="{ active: g.pinned }"
            :title="g.pinned ? '取消置顶' : '置顶'"
            @click.stop="$emit('toggle-pin', 'group', g.id)"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 17v5"/><path d="M9 10.8V4h6v6.8l3 3.2H6l3-3.2z"/></svg>
          </button>
        </div>
      </template>

      <template v-if="sortedFriends.length">
        <div class="section-label">好友</div>
        <div
          v-for="f in sortedFriends"
          :key="f.id"
          class="contact-item"
          role="button"
          tabindex="0"
          :class="{ active: activeType === 'friend' && activeId === f.id }"
          @click="$emit('select', 'friend', f.id)"
          @keydown.enter="$emit('select', 'friend', f.id)"
        >
          <StarryAvatar :name="f.name" :src="f.avatar" :size="44" />
          <div class="contact-info">
            <div class="contact-line">
              <span class="contact-name">{{ f.name }}</span>
              <span class="contact-time">{{ fmtListTime(f.lastTs) }}</span>
              <span v-if="f.unread" class="unread-badge">{{ f.unread > 99 ? '99+' : f.unread }}</span>
            </div>
            <div class="contact-preview">{{ f.lastMessage || '开始聊天吧' }}</div>
          </div>
          <button
            class="pin-btn"
            :class="{ active: f.pinned }"
            :title="f.pinned ? '取消置顶' : '置顶'"
            @click.stop="$emit('toggle-pin', 'friend', f.id)"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 17v5"/><path d="M9 10.8V4h6v6.8l3 3.2H6l3-3.2z"/></svg>
          </button>
        </div>
      </template>

      <div
        v-if="query && !sortedGroups.length && !sortedFriends.length && !messageResults.length"
        class="search-empty"
      >
        未找到相关好友、群聊或聊天记录
      </div>
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
import { computed, ref } from 'vue'
import StarryAvatar from './StarryAvatar.vue'
import { useStarryStore } from '../../stores/starry'

const props = defineProps({
  friends: { type: Array, default: () => [] },
  groups: { type: Array, default: () => [] },
  activeType: { type: String, default: '' },
  activeId: { type: String, default: '' },
  showCircleEntry: { type: Boolean, default: false },
  circleActive: { type: Boolean, default: false },
})

defineEmits(['select', 'add', 'open-circle', 'toggle-pin'])

const store = useStarryStore()
const query = ref('')

const hasAny = computed(() => props.friends.length > 0 || props.groups.length > 0)
const totalCount = computed(() => props.friends.length + props.groups.length)

function matches(item) {
  const needle = query.value.trim().toLowerCase()
  if (!needle) return true
  return String(item.name || '').toLowerCase().includes(needle) ||
    String(item.lastMessage || '').toLowerCase().includes(needle)
}

function sortChats(list) {
  return [...list].sort((a, b) => {
    const pinDiff = (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)
    if (pinDiff) return pinDiff
    const unreadDiff = (b.unread ? 1 : 0) - (a.unread ? 1 : 0)
    if (unreadDiff) return unreadDiff
    return (b.lastTs || 0) - (a.lastTs || 0)
  })
}

const sortedGroups = computed(() => sortChats(props.groups.filter(matches)))
const sortedFriends = computed(() => sortChats(props.friends.filter(matches)))
const messageResults = computed(() => {
  const needle = query.value.trim()
  return needle.length >= 2 ? store.searchMessages(needle, 12) : []
})

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
.contacts-search {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 0 12px 8px;
  padding: 7px 10px;
  border: 1px solid var(--border-color);
  border-radius: 9px;
  background: var(--bg-input);
  color: var(--text-muted);
  flex-shrink: 0;
}
.contacts-search input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  color: var(--text-primary);
  font-size: 12px;
  font-family: inherit;
  outline: none;
}
.search-clear {
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 14px;
  padding: 0 2px;
}
.message-result {
  display: block;
  width: 100%;
  text-align: left;
  padding: 8px 12px;
  border: none;
  border-top: 1px solid var(--border-color);
  background: transparent;
  cursor: pointer;
  font-family: inherit;
}
.message-result:hover { background: var(--bg-hover); }
.message-result-head {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--text-muted);
  margin-bottom: 3px;
}
.message-result-text {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.message-result-text b { color: var(--text-primary); font-weight: 600; }
.unread-badge {
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  background: var(--danger);
  color: #fff;
  font-size: 10px;
  line-height: 16px;
  text-align: center;
  box-sizing: border-box;
  flex-shrink: 0;
}
.pin-btn {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.15s, background 0.15s, color 0.15s;
}
.contact-item:hover .pin-btn { opacity: 1; }
.pin-btn.active { opacity: 1; color: var(--accent); }
.pin-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
.search-empty {
  padding: 16px 12px;
  text-align: center;
  font-size: 12px;
  color: var(--text-muted);
}
@media (max-width: 768px) {
  .pin-btn { opacity: 0.6; }
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

.circle-entry {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 8px 10px 2px;
  padding: 9px 10px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-primary);
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  transition: all 0.15s;
}
.circle-entry:hover {
  background: var(--bg-hover);
}
.circle-entry.active {
  border-color: var(--accent);
  background: var(--accent-light);
}
.circle-entry-icon {
  display: flex;
  align-items: center;
  color: var(--accent);
}
.circle-entry-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}
.circle-entry-desc {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-muted);
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
