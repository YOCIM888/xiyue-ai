/**
 * 项目起手模板：写进工作区就能直接在预览抽屉里跑，不需要 npm install、不需要构建。
 * 第三方库一律走 CDN + importmap —— 预览运行时会把页面自带的 importmap 合并进它注入的那张，
 * 所以这里写死的地址优先于「裸模块名默认转 esm.sh」的兜底规则。
 *
 * 三套模板都刻意留了 #inc 按钮与 #out 文本：AI 自测回路可以照着点一遍再改。
 */
import { sanitizeFileName, statFile, writeFile } from './workspace'

const PAGE_CSS = `:root {
  color-scheme: light dark;
  --bg: #0f1115;
  --card: #171a21;
  --text: #e6e8ee;
  --muted: #9aa3b2;
  --accent: #4f8cff;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
  background: var(--bg);
  color: var(--text);
  font: 15px/1.6 system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
}
.card {
  width: min(520px, 100%);
  padding: 28px;
  background: var(--card);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
}
h1 { margin: 0 0 8px; font-size: 20px; }
p { margin: 0 0 16px; color: var(--muted); }
button {
  padding: 9px 18px;
  font: inherit;
  color: #fff;
  background: var(--accent);
  border: none;
  border-radius: 9px;
  cursor: pointer;
}
button:hover { filter: brightness(1.1); }
#out { margin: 16px 0 0; color: var(--text); }
`

function page(title, head = '', body = '') {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<link rel="stylesheet" href="./style.css" />
${head}</head>
<body>
${body}
</body>
</html>
`
}

const STATIC_FILES = [
  {
    path: 'index.html',
    text: page(
      '静态站起手模板',
      '',
      `<div class="card">
  <h1>静态站起手模板</h1>
  <p>改 index.html / style.css / app.js 三个文件就够了，保存后预览会自动重载。</p>
  <button id="inc" type="button">点我 +1</button>
  <p id="out">已点击 0 次</p>
</div>
<script type="module" src="./app.js"></script>`
    ),
  },
  { path: 'style.css', text: PAGE_CSS },
  {
    path: 'app.js',
    text: `const inc = document.getElementById('inc')
const out = document.getElementById('out')
let count = 0

inc.addEventListener('click', () => {
  count += 1
  out.textContent = \`已点击 \${count} 次\`
})
`,
  },
  {
    path: 'README.md',
    text: `# 静态站起手模板

三个文件，零依赖：

- \`index.html\` 结构
- \`style.css\` 样式（CSS 变量在 \`:root\` 里，改主题色只动一处）
- \`app.js\` 逻辑，以 ES module 方式加载

在工作区里右键 \`index.html\` → 网页预览，即可直接看到效果。
`,
  },
]

const VUE_FILES = [
  {
    path: 'index.html',
    // 钉死到带模板编译器的浏览器构建：裸 'vue' 走 esm.sh 默认拿到的是 runtime-only，
    // 那样 template 字符串会被静默忽略，页面上什么都没有
    text: page(
      'Vue 3 起手模板',
      `<script type="importmap">
{
  "imports": {
    "vue": "https://cdn.jsdelivr.net/npm/vue@3/dist/vue.esm-browser.prod.js"
  }
}
</script>
`,
      `<div id="app" class="card"></div>
<script type="module" src="./app.js"></script>`
    ),
  },
  { path: 'style.css', text: PAGE_CSS },
  {
    path: 'app.js',
    text: `import { createApp, ref } from 'vue'

createApp({
  setup() {
    const count = ref(0)
    return { count }
  },
  template: \`
    <h1>Vue 3 起手模板</h1>
    <p>用的是浏览器构建，template 字符串直接生效，不需要 .vue 单文件组件和构建步骤。</p>
    <button id="inc" type="button" @click="count++">点我 +1</button>
    <p id="out">已点击 {{ count }} 次</p>
  \`,
}).mount('#app')
`,
  },
  {
    path: 'README.md',
    text: `# Vue 3 起手模板

Vue 从 CDN 加载（地址在 \`index.html\` 的 importmap 里），所以不用装依赖就能跑。

- \`app.js\` 里是 \`createApp\` + \`setup()\`，模板写在 \`template\` 字符串里
- 要拆组件就在同目录新建 \`components/*.js\`，用 \`import\` 引相对路径即可
- 需要单文件组件（\`.vue\`）时再说：那要引入构建，预览抽屉目前靠运行时转译支持

想换成锁定版本，把 importmap 里的 \`vue@3\` 改成具体版本号。
`,
  },
]

const REACT_FILES = [
  {
    path: 'index.html',
    // ?external=react 让 react-dom 不要自己打包一份 react，改用 importmap 里那一份；
    // 少了这个参数会出现两个 React 实例，报 Invalid hook call
    text: page(
      'React 起手模板',
      `<script type="importmap">
{
  "imports": {
    "react": "https://esm.sh/react@19",
    "react/jsx-runtime": "https://esm.sh/react@19/jsx-runtime",
    "react-dom/client": "https://esm.sh/react-dom@19/client?external=react"
  }
}
</script>
`,
      `<div id="root" class="card"></div>
<script type="module" src="./app.js"></script>`
    ),
  },
  { path: 'style.css', text: PAGE_CSS },
  {
    path: 'app.js',
    // 没有 JSX 转译，所以用 createElement；h 只是它的短别名
    text: `import { createElement as h, useState } from 'react'
import { createRoot } from 'react-dom/client'

function App() {
  const [count, setCount] = useState(0)
  return h('div', null,
    h('h1', null, 'React 起手模板'),
    h('p', null, '预览里没有 JSX 转译，所以用 createElement 写；h 是它的短别名。'),
    h('button', { id: 'inc', type: 'button', onClick: () => setCount(count + 1) }, '点我 +1'),
    h('p', { id: 'out' }, \`已点击 \${count} 次\`),
  )
}

createRoot(document.getElementById('root')).render(h(App))
`,
  },
  {
    path: 'README.md',
    text: `# React 起手模板

React 19 从 esm.sh 加载（地址在 \`index.html\` 的 importmap 里）。

- \`app.js\` 用 \`createElement\`（别名 \`h\`）而不是 JSX：预览运行时不转译 JSX
- 想要 JSX，就把它换成 \`.jsx\` 并接一个构建步骤，或者引入 htm 这类免构建方案
- \`?external=react\` 这个参数不能删，否则 react-dom 会自带一份 React，报 Invalid hook call
`,
  },
]

export const PROJECT_TEMPLATES = [
  {
    id: 'static',
    label: '静态站',
    dir: 'my-site',
    description: '三个文件零依赖：HTML + CSS + 一个 ES module',
    files: STATIC_FILES,
  },
  {
    id: 'vue',
    label: 'Vue 3',
    dir: 'my-vue-app',
    description: 'CDN 加载带模板编译器的浏览器构建，免构建直接跑',
    files: VUE_FILES,
  },
  {
    id: 'react',
    label: 'React',
    dir: 'my-react-app',
    description: 'CDN 加载 React 19，用 createElement 写（预览不转译 JSX）',
    files: REACT_FILES,
  },
]

export function templateById(id) {
  return PROJECT_TEMPLATES.find(item => item.id === id) || null
}

/**
 * 按模板生成一个项目目录。
 * @param {string} id 模板 id
 * @param {string} dirName 项目目录名；非法字符与路径分隔符由 sanitizeFileName 清洗，名字为空时退回模板默认名
 * @returns {Promise<{dir: string, entry: string, paths: string[]}>} entry 是可以直接预览的首页
 */
export async function scaffoldProject(id, dirName) {
  const template = templateById(id)
  if (!template) throw new Error(`没有这个模板：${id}`)
  const dir = sanitizeFileName(String(dirName || '').trim(), template.dir)
  const entry = `${dir}/index.html`
  const existing = await statFile(entry)
  if (existing?.exists) throw new Error(`「${entry}」已存在，换个项目名，或直接打开它`)

  const paths = []
  for (const file of template.files) {
    const path = `${dir}/${file.path}`
    await writeFile(path, file.text)
    paths.push(path)
  }
  return { dir, entry, paths }
}
