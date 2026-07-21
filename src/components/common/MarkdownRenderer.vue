<template>
  <div class="markdown-body" v-html="renderedHtml"></div>
</template>

<script setup>
import { computed } from 'vue'
import { marked } from 'marked'
import hljs from 'highlight.js'
import 'highlight.js/styles/github-dark.css'

// 配置 marked
marked.setOptions({
  breaks: true,
  gfm: true,
})

// 自定义代码块渲染
const renderer = new marked.Renderer()
renderer.code = function({ text, lang }) {
  let highlighted = ''
  if (lang && hljs.getLanguage(lang)) {
    try {
      highlighted = hljs.highlight(text, { language: lang }).value
    } catch {
      highlighted = hljs.highlightAuto(text).value
    }
  } else {
    highlighted = hljs.highlightAuto(text).value
  }
  return `<pre><code class="hljs language-${lang || ''}">${highlighted}</code></pre>`
}

marked.use({ renderer })

const props = defineProps({
  content: { type: String, default: '' },
})

const renderedHtml = computed(() => {
  try {
    return marked.parse(props.content)
  } catch {
    return props.content.replace(/</g, '&lt;').replace(/\n/g, '<br>')
  }
})
</script>

<style>
/* Markdown 样式 */
.markdown-body {
  word-break: break-word;
}
.markdown-body p {
  margin: 0 0 8px;
}
.markdown-body p:last-child {
  margin-bottom: 0;
}
.markdown-body code {
  background: var(--bg-code);
  color: var(--accent);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 13px;
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
}
.markdown-body pre {
  background: #1e1e2e;
  border-radius: 10px;
  padding: 16px;
  overflow-x: auto;
  margin: 10px 0;
  border: 1px solid var(--border-color);
}
.markdown-body pre code {
  background: transparent;
  color: #cdd6f4;
  padding: 0;
  font-size: 13px;
  line-height: 1.6;
}
.markdown-body ul, .markdown-body ol {
  padding-left: 20px;
  margin: 6px 0;
}
.markdown-body li {
  margin: 2px 0;
}
.markdown-body blockquote {
  border-left: 3px solid var(--accent);
  margin: 8px 0;
  padding: 4px 14px;
  color: var(--text-secondary);
  background: var(--bg-sidebar);
  border-radius: 0 6px 6px 0;
}
.markdown-body a {
  color: var(--accent);
  text-decoration: none;
}
.markdown-body a:hover {
  text-decoration: underline;
}
.markdown-body table {
  border-collapse: collapse;
  width: 100%;
  margin: 10px 0;
}
.markdown-body th, .markdown-body td {
  border: 1px solid var(--border-color);
  padding: 8px 12px;
  text-align: left;
}
.markdown-body th {
  background: var(--bg-sidebar);
  font-weight: 600;
}
.markdown-body h1, .markdown-body h2, .markdown-body h3,
.markdown-body h4, .markdown-body h5, .markdown-body h6 {
  margin: 14px 0 6px;
  font-weight: 600;
  line-height: 1.4;
}
.markdown-body h1 { font-size: 1.4em; }
.markdown-body h2 { font-size: 1.25em; }
.markdown-body h3 { font-size: 1.1em; }
.markdown-body hr {
  border: none;
  border-top: 1px solid var(--border-color);
  margin: 14px 0;
}
.markdown-body img {
  max-width: 100%;
  border-radius: 8px;
}
</style>
