<template>
  <nav class="starry-tabbar">
    <button
      v-for="tab in tabs"
      :key="tab.key"
      class="tab-btn"
      :class="{ active: active === tab.key }"
      @click="$emit('select', tab.key)"
    >
      <span class="tab-icon" v-html="tab.icon"></span>
      <span class="tab-label">{{ tab.label }}</span>
    </button>
  </nav>
</template>

<script setup>
defineProps({
  active: { type: String, default: 'chat' },
})
defineEmits(['select'])

const tabs = [
  {
    key: 'chat',
    label: '聊天',
    icon: '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>',
  },
  {
    key: 'directory',
    label: '通讯录',
    icon: '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  },
  {
    key: 'circle',
    label: '圈子',
    icon: '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 3l2 6.2 6.5.3-5.2 3.9 1.9 6.3-5.2-3.7-5.2 3.7 1.9-6.3-5.2-3.9 6.5-.3L12 3z"/></svg>',
  },
]
</script>

<style scoped>
.starry-tabbar {
  display: flex;
  flex-shrink: 0;
  border-top: 1px solid var(--border-color);
  background: var(--bg-primary);
  padding-bottom: env(safe-area-inset-bottom, 0px);
}
.tab-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  padding: 8px 0 6px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-family: inherit;
  font-size: 10px;
  cursor: pointer;
  transition: color 0.15s;
}
.tab-btn.active {
  color: var(--accent);
}
.tab-icon {
  display: flex;
  align-items: center;
  justify-content: center;
}
.tab-label {
  line-height: 1.2;
}
</style>
