<template>
  <div
    class="starry-avatar"
    :class="{ group }"
    :style="avatarStyle"
  >
    <img v-if="src && !group" :src="src" alt="" />
    <svg
      v-else-if="group"
      class="group-star"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.2l5.9-.9L12 3z" />
    </svg>
    <span v-else class="initial">{{ initial }}</span>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  name: { type: String, default: '' },
  src: { type: String, default: '' },
  size: { type: Number, default: 40 },
  group: { type: Boolean, default: false },
})

const palettes = [
  ['#8ea2f6', '#b4a4f2'],
  ['#7dd3fc', '#38bdf8'],
  ['#f9a8d4', '#f472b6'],
  ['#86efac', '#34d399'],
  ['#fcd34d', '#fb923c'],
  ['#c4b5fd', '#a78bfa'],
  ['#fca5a5', '#f87171'],
  ['#93c5fd', '#60a5fa'],
]

function hashCode(str) {
  let h = 0
  for (let i = 0; i < str.length; i += 1) {
    h = (h * 31 + str.charCodeAt(i)) % 997
  }
  return h
}

const palette = computed(() => {
  const key = props.group ? 'group' : (props.name || '?')
  return palettes[hashCode(key) % palettes.length]
})

const initial = computed(() => {
  const n = props.name.trim()
  return n ? Array.from(n)[0] : '?'
})

const avatarStyle = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
  borderRadius: props.group ? '12px' : '10px',
  fontSize: `${Math.round(props.size * 0.4)}px`,
  background: `linear-gradient(135deg, ${palette.value[0]}, ${palette.value[1]})`,
}))
</script>

<style scoped>
.starry-avatar {
  flex-shrink: 0;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: 600;
  user-select: none;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.25);
}
.starry-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.starry-avatar.group {
  background: linear-gradient(135deg, #6366f1, #a78bfa 55%, #38bdf8);
}
.group-star {
  width: 56%;
  height: 56%;
}
.initial {
  line-height: 1;
  transform: translateY(-1px);
}
</style>
