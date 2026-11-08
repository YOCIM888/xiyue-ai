<template>
  <div v-if="store.branches.length > 1" class="branch-bar">
    <span class="branch-label"><i class="fa-solid fa-code-branch"></i> 分支</span>
    <div class="branch-scroll">
      <button
        v-for="b in store.branches"
        :key="b.id"
        class="branch-chip"
        :class="{ active: b.id === store.activeBranchId }"
        :title="b.parentId ? `派生自「${parentName(b)}」` : '原始对话线'"
        @click="store.switchBranch(b.id)"
      >
        {{ b.name }}
        <span class="branch-count">{{ b.messages.length }}</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { useChatStore } from '../../stores/chat'

const store = useChatStore()

function parentName(branch) {
  const parent = store.branches.find(b => b.id === branch.parentId)
  return parent?.name || '主线'
}
</script>

<style scoped>
.branch-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 24px 0;
  flex-shrink: 0;
}
.branch-label {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--text-muted);
}
.branch-label i { margin-right: 3px; font-size: 10px; }
.branch-scroll {
  display: flex;
  gap: 6px;
  min-width: 0;
  overflow-x: auto;
  padding-bottom: 2px;
  scrollbar-width: none;
}
.branch-scroll::-webkit-scrollbar { display: none; }
.branch-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  padding: 3px 9px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--bg-primary);
  color: var(--text-secondary);
  font-size: 11px;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.15s;
}
.branch-chip:hover { background: var(--bg-hover); color: var(--text-primary); }
.branch-chip.active {
  border-color: var(--accent);
  background: var(--accent-light);
  color: var(--accent);
}
.branch-count {
  font-size: 9px;
  opacity: 0.7;
  font-variant-numeric: tabular-nums;
}
@media (max-width: 768px) {
  .branch-bar { padding: 8px 12px 0; }
}
</style>
