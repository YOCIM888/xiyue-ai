<template>
  <div class="message-parts">
    <template v-for="(part, index) in parts" :key="index">
      <ToolTrace
        v-if="part.type === 'trace'"
        v-show="processOpen"
        :trace="[part]"
        :live="!!part.running"
        :show-budget="part === lastTrace"
      />
      <ThinkingRow v-else-if="part.type === 'thinking'" v-show="processOpen" :content="part.content" />
      <div v-else class="part-text">
        <MarkdownRenderer :content="part.content" symbol-style />
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import MarkdownRenderer from '../common/MarkdownRenderer.vue'
import ToolTrace from './ToolTrace.vue'
import ThinkingRow from './ThinkingRow.vue'

const props = defineProps({
  parts: { type: Array, default: () => [] },
  // 折叠时只收起思考与工具过程，正文段落始终留在原位
  processOpen: { type: Boolean, default: true },
})

const lastTrace = computed(() => [...props.parts].reverse().find(part => part?.type === 'trace') || null)
</script>

<style scoped>
.message-parts { min-width: 0; }
.part-text + .part-text { margin-top: 10px; }
.part-text { margin: 2px 0; }
</style>