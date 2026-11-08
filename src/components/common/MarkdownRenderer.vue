<template>
  <div class="markdown-body" v-html="renderedHtml" @click="onClick"></div>
</template>

<script setup>
import { computed } from 'vue'
import { marked } from 'marked'
import hljs from 'highlight.js'
import 'highlight.js/styles/github-dark.css'
import { useSettingsStore } from '../../stores/settings'
import { applySymbolStyles } from '../../utils/symbolStyles'

marked.setOptions({ breaks: true, gfm: true })

const renderer = new marked.Renderer()
let codeIdx = 0
renderer.code = function({ text, lang }) {
  const id = codeIdx++
  const encoded = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  let highlighted = ''
  if (lang && hljs.getLanguage(lang)) {
    try { highlighted = hljs.highlight(text, { language: lang }).value } catch { highlighted = hljs.highlightAuto(text).value }
  } else {
    highlighted = hljs.highlightAuto(text).value
  }
  return `<div class="code-block-wrapper" data-code-id="${id}">
    <div class="code-block-header">
      <span class="code-lang">${lang || 'code'}</span>
      <button class="code-copy-btn" data-code="${encoded}" title="复制代码">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
      </button>
    </div>
    <pre><code class="hljs language-${lang || ''}">${highlighted}</code></pre>
  </div>`
}

marked.use({ renderer })

const props = defineProps({
  content: { type: String, default: '' },
  symbolStyle: { type: Boolean, default: false },
})

const settings = useSettingsStore()

const renderedHtml = computed(() => {
  let html
  try {
    html = marked.parse(props.content)
  } catch {
    html = props.content.replace(/</g, '&lt;').replace(/\n/g, '<br>')
  }
  return props.symbolStyle ? applySymbolStyles(html, settings.symbolRules) : html
})

function onClick(e) {
  const btn = e.target.closest('.code-copy-btn')
  if (!btn) return
  const raw = btn.dataset.code
  if (!raw) return
  const text = raw.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  navigator.clipboard.writeText(text).then(() => {
    btn.classList.add('copied')
    setTimeout(() => btn.classList.remove('copied'), 1500)
  }).catch(() => {})
}
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
  border-radius: 0 0 10px 10px;
  padding: 16px;
  overflow-x: auto;
  margin: 0;
  border: 1px solid var(--border-color);
  border-top: none;
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

/* 代码块容器 */
.code-block-wrapper {
  margin: 10px 0;
  border-radius: 10px;
  overflow: hidden;
}
.code-block-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 14px;
  background: #2d2d3f;
  border: 1px solid var(--border-color);
  border-bottom: none;
  border-radius: 10px 10px 0 0;
}
.code-lang {
  font-size: 11px; color: #a0a0b8; text-transform: uppercase; letter-spacing: 0.5px;
}
.code-copy-btn {
  width: 28px; height: 28px; border: none; border-radius: 4px;
  background: transparent; color: #a0a0b8; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.15s;
}
.code-copy-btn:hover { background: rgba(255,255,255,0.1); color: #fff; }
.code-copy-btn.copied { background: #10b981; color: #fff; }

/* 浅色模式：代码卡片改为浅白灰底，深色模式保持原样 */
:root:not([data-theme="dark"]) .code-block-wrapper { background: #f7f8fa; }
:root:not([data-theme="dark"]) .code-block-header {
  background: #eceef2;
  border-color: #e3e5ea;
}
:root:not([data-theme="dark"]) .code-lang { color: #6b7280; }
:root:not([data-theme="dark"]) .code-copy-btn { color: #6b7280; }
:root:not([data-theme="dark"]) .code-copy-btn:hover { background: rgba(0, 0, 0, 0.06); color: #1f2328; }
:root:not([data-theme="dark"]) .markdown-body pre {
  background: #f7f8fa;
  border-color: #e3e5ea;
}
:root:not([data-theme="dark"]) .markdown-body pre code { color: #24292e; }

/* 浅色模式下的 GitHub Light 语法配色 */
:root:not([data-theme="dark"]) .markdown-body .hljs-doctag,
:root:not([data-theme="dark"]) .markdown-body .hljs-keyword,
:root:not([data-theme="dark"]) .markdown-body .hljs-meta .hljs-keyword,
:root:not([data-theme="dark"]) .markdown-body .hljs-template-tag,
:root:not([data-theme="dark"]) .markdown-body .hljs-template-variable,
:root:not([data-theme="dark"]) .markdown-body .hljs-type,
:root:not([data-theme="dark"]) .markdown-body .hljs-variable.language_ {
  color: #d73a49;
}
:root:not([data-theme="dark"]) .markdown-body .hljs-title,
:root:not([data-theme="dark"]) .markdown-body .hljs-title.class_,
:root:not([data-theme="dark"]) .markdown-body .hljs-title.class_.inherited__,
:root:not([data-theme="dark"]) .markdown-body .hljs-title.function_ {
  color: #6f42c1;
}
:root:not([data-theme="dark"]) .markdown-body .hljs-attr,
:root:not([data-theme="dark"]) .markdown-body .hljs-attribute,
:root:not([data-theme="dark"]) .markdown-body .hljs-literal,
:root:not([data-theme="dark"]) .markdown-body .hljs-meta,
:root:not([data-theme="dark"]) .markdown-body .hljs-number,
:root:not([data-theme="dark"]) .markdown-body .hljs-operator,
:root:not([data-theme="dark"]) .markdown-body .hljs-variable,
:root:not([data-theme="dark"]) .markdown-body .hljs-selector-attr,
:root:not([data-theme="dark"]) .markdown-body .hljs-selector-class,
:root:not([data-theme="dark"]) .markdown-body .hljs-selector-id {
  color: #005cc5;
}
:root:not([data-theme="dark"]) .markdown-body .hljs-regexp,
:root:not([data-theme="dark"]) .markdown-body .hljs-string,
:root:not([data-theme="dark"]) .markdown-body .hljs-meta .hljs-string {
  color: #032f62;
}
:root:not([data-theme="dark"]) .markdown-body .hljs-built_in,
:root:not([data-theme="dark"]) .markdown-body .hljs-symbol {
  color: #e36209;
}
:root:not([data-theme="dark"]) .markdown-body .hljs-comment,
:root:not([data-theme="dark"]) .markdown-body .hljs-code,
:root:not([data-theme="dark"]) .markdown-body .hljs-formula {
  color: #6a737d;
}
:root:not([data-theme="dark"]) .markdown-body .hljs-name,
:root:not([data-theme="dark"]) .markdown-body .hljs-quote,
:root:not([data-theme="dark"]) .markdown-body .hljs-selector-tag,
:root:not([data-theme="dark"]) .markdown-body .hljs-selector-pseudo {
  color: #22863a;
}
:root:not([data-theme="dark"]) .markdown-body .hljs-subst { color: #24292e; }
:root:not([data-theme="dark"]) .markdown-body .hljs-section { color: #005cc5; font-weight: bold; }
:root:not([data-theme="dark"]) .markdown-body .hljs-bullet { color: #735c0f; }
:root:not([data-theme="dark"]) .markdown-body .hljs-emphasis { color: #24292e; font-style: italic; }
:root:not([data-theme="dark"]) .markdown-body .hljs-strong { color: #24292e; font-weight: bold; }
:root:not([data-theme="dark"]) .markdown-body .hljs-addition { color: #22863a; background-color: #f0fff4; }
:root:not([data-theme="dark"]) .markdown-body .hljs-deletion { color: #b31d28; background-color: #ffeef0; }
</style>
