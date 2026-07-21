<template>
  <div class="welcome-screen">
    <div class="welcome-content">
      <div class="logo">
        <img src="/xiyue.png" alt="XIYUE AI" class="logo-img" />
      </div>
      <h2>欢迎使用 XIYUE AI</h2>
      <p class="subtitle">给你最好的AI对话体验！</p>
      <div class="quick-prompts">
        <button v-for="(prompt, idx) in quickPrompts" :key="idx" class="prompt-card" @click="$emit('send', prompt)">
          {{ prompt }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
defineEmits(['send'])

const quickPrompts = [
  '用简单的语言解释一下人工智能',
  '帮我写一段 Python 代码来读取 CSV 文件',
  '给我推荐几本值得阅读的书籍',
  '今天心情不太好，和我聊聊吧',
]
</script>

<style scoped>
.welcome-screen {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
}
.welcome-content {
  text-align: center;
  max-width: 520px;
}
.logo {
  margin-bottom: 16px;
}
.logo-img {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid var(--border-color);
}
h2 {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 8px;
}
.subtitle {
  font-size: 14px;
  color: var(--text-muted);
  margin: 0 0 32px;
}
.quick-prompts {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.prompt-card {
  padding: 14px 16px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition: all 0.2s;
  line-height: 1.5;
}
.prompt-card:hover {
  border-color: var(--accent);
  background: var(--bg-hover);
}

/* 移动端 */
@media (max-width: 768px) {
  .welcome-screen {
    padding: 24px 16px;
  }
  .quick-prompts {
    grid-template-columns: 1fr;
  }
}
</style>
