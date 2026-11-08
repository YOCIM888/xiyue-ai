<template>
  <div class="search-overlay" @click.self="$emit('close')">
    <div class="search-card" role="dialog" aria-label="历史全文搜索">
      <div class="search-head">
        <i class="fa-solid fa-magnifying-glass search-icon"></i>
        <input
          ref="inputRef"
          v-model="query"
          class="search-input"
          type="search"
          placeholder="搜索全部会话的消息正文…"
        />
        <button class="head-btn" title="关闭" @click="$emit('close')">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>

      <div class="search-body">
        <div v-if="!query.trim()" class="search-tip">
          <i class="fa-solid fa-clock-rotate-left"></i>
          <span>输入关键词，将在全部会话的所有消息中搜索</span>
        </div>
        <div v-else-if="!results.length" class="search-tip">
          <i class="fa-solid fa-magnifying-glass"></i>
          <span>没有找到匹配的消息</span>
        </div>
        <template v-else>
          <div v-for="g in groups" :key="g.topicId" class="result-group">
            <div class="group-head">
              <i class="fa-solid fa-message"></i>
              <span class="group-title">{{ g.title }}</span>
              <span class="group-count">{{ g.hits.length }}</span>
            </div>
            <button
              v-for="h in g.hits"
              :key="h.branchId + '-' + h.message.id"
              class="hit-row"
              @click="openHit(h)"
            >
              <span class="hit-role" :class="h.message.role">
                {{ h.message.role === 'user' ? '我' : 'AI' }}
              </span>
              <span class="hit-body">
                <template v-for="(p, i) in h.parts" :key="i">
                  <mark v-if="p.hit">{{ p.text }}</mark>
                  <span v-else>{{ p.text }}</span>
                </template>
              </span>
              <span class="hit-meta">
                <i class="fa-solid fa-code-branch"></i>{{ h.branchName }}
              </span>
            </button>
          </div>
        </template>
      </div>

      <div v-if="results.length" class="search-foot">
        共 {{ results.length }} 条结果，来自 {{ groups.length }} 个会话
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useTopicsStore } from '../../stores/topics'
import { loadConversation } from '../../utils/conversation'

const emit = defineEmits(['close'])
const router = useRouter()
const topics = useTopicsStore()

const query = ref('')
const results = ref([])
const inputRef = ref(null)
let timer = null

const groups = computed(() => {
  const map = new Map()
  for (const r of results.value) {
    let g = map.get(r.topicId)
    if (!g) {
      g = { topicId: r.topicId, title: r.topicTitle, hits: [] }
      map.set(r.topicId, g)
    }
    g.hits.push(r)
  }
  return [...map.values()]
})

function buildSnippet(content, term) {
  const lower = content.toLowerCase()
  const first = lower.indexOf(term)
  if (first === -1) return [{ text: content.slice(0, 120), hit: false }]

  const start = Math.max(0, first - 36)
  const end = Math.min(content.length, first + term.length + 96)
  let snippet = content.slice(start, end)
  if (start > 0) snippet = '…' + snippet
  if (end < content.length) snippet += '…'

  const parts = []
  const lo = snippet.toLowerCase()
  let cursor = 0
  let pos = lo.indexOf(term, cursor)
  while (pos !== -1) {
    if (pos > cursor) parts.push({ text: snippet.slice(cursor, pos), hit: false })
    parts.push({ text: snippet.slice(pos, pos + term.length), hit: true })
    cursor = pos + term.length
    pos = lo.indexOf(term, cursor)
  }
  if (cursor < snippet.length) parts.push({ text: snippet.slice(cursor), hit: false })
  return parts
}

function runSearch(raw) {
  const term = String(raw || '').trim().toLowerCase()
  if (!term) {
    results.value = []
    return
  }
  const hits = []
  for (const topic of topics.topics) {
    const conv = loadConversation(topic.id)
    for (const branch of conv.branches) {
      for (const message of branch.messages) {
        const content = message.content || ''
        if (!content || content.toLowerCase().indexOf(term) === -1) continue
        hits.push({
          topicId: topic.id,
          topicTitle: topic.title || '未命名对话',
          branchId: branch.id,
          branchName: branch.name || '主线',
          message,
          parts: buildSnippet(content, term),
        })
      }
    }
  }
  hits.sort((a, b) => (b.message.ts || 0) - (a.message.ts || 0))
  results.value = hits
}

watch(query, (q) => {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => runSearch(q), 220)
})

function openHit(hit) {
  emit('close')
  router.push({
    path: `/chat/${hit.topicId}`,
    query: { branch: hit.branchId, msg: hit.message.id },
  })
}

function onKeydown(e) {
  if (e.key === 'Escape') emit('close')
}

onMounted(() => {
  nextTick(() => inputRef.value?.focus())
  window.addEventListener('keydown', onKeydown)
})
onUnmounted(() => {
  if (timer) clearTimeout(timer)
  window.removeEventListener('keydown', onKeydown)
})
</script>

<style scoped>
.search-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 9vh 16px 16px;
}
.search-card {
  width: 100%;
  max-width: 680px;
  max-height: 78vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.18);
  overflow: hidden;
}
.search-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}
.search-icon { color: var(--text-muted); font-size: 14px; }
.search-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--text-primary);
  font-family: inherit;
  font-size: 15px;
}
.search-input::placeholder { color: var(--text-muted); }
.search-input::-webkit-search-cancel-button { display: none; }
.head-btn {
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
}
.head-btn:hover { background: var(--bg-hover); color: var(--text-primary); }

.search-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 8px 10px 12px;
}
.search-tip {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 42px 16px;
  font-size: 13px;
  color: var(--text-muted);
}

.result-group { margin-bottom: 10px; }
.group-head {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 6px 6px;
  font-size: 12px;
  color: var(--text-secondary);
}
.group-head i { font-size: 11px; color: var(--text-muted); }
.group-title {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.group-count {
  flex-shrink: 0;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--bg-sidebar);
  color: var(--text-muted);
  font-size: 11px;
}

.hit-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  width: 100%;
  padding: 9px 10px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--text-primary);
  font-family: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s;
}
.hit-row:hover { background: var(--bg-hover); }
.hit-role {
  flex-shrink: 0;
  margin-top: 1px;
  padding: 1px 6px;
  border-radius: 6px;
  font-size: 10px;
  font-weight: 600;
  background: var(--bg-sidebar);
  color: var(--text-secondary);
}
.hit-role.user {
  background: var(--accent-light);
  color: var(--accent);
}
.hit-body {
  flex: 1;
  min-width: 0;
  line-height: 1.6;
  word-break: break-word;
}
.hit-body mark {
  padding: 0 1px;
  border-radius: 3px;
  background: rgba(250, 204, 21, 0.45);
  color: inherit;
}
.hit-meta {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 2px;
  font-size: 11px;
  color: var(--text-muted);
}
.hit-meta i { font-size: 10px; }

.search-foot {
  flex-shrink: 0;
  padding: 9px 16px;
  border-top: 1px solid var(--border-color);
  font-size: 12px;
  color: var(--text-muted);
}

@media (max-width: 768px) {
  .search-overlay {
    padding: 0;
    align-items: stretch;
  }
  .search-card {
    max-width: none;
    max-height: none;
    height: 100%;
    border-radius: 0;
    border: none;
  }
  .search-head { padding: 12px 14px; }
  .hit-row { padding: 10px 8px; }
  .hit-meta { font-size: 10px; }
}
</style>
