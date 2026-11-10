<template>
  <div class="message-parts">
    <template v-for="(part, index) in parts" :key="index">
      <ToolTrace v-if="part.type === 'trace'" :trace="[part]" :live="!!part.running" />
      <div v-else class="part-text">
        <MarkdownRenderer :content="part.content" symbol-style />
      </div>
    </template>
  </div>
</template>

<script setup>
import MarkdownRenderer from '../common/MarkdownRenderer.vue'
import ToolTrace from './ToolTrace.vue'

defineProps({
  parts: { type: Array, default: () => [] },
})
</script>

<style scoped>
.message-parts { min-width: 0; }
.part-text + .part-text { margin-top: 10px; }
</style>
