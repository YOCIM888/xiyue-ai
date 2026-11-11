# XIYUE AI

[English](README.md) | **简体中文**

一个纯前端的个人 AI 助手：支持流式对话、工具调用、文件工作区与沙箱预览，并提供「探索星空」「梦境推演」两个独立栏目。所有数据保存在浏览器本地，可部署为静态站点或安装为 PWA。

## 功能

- **主对话**：流式输出、思考过程、图片消息、消息重生成与编辑后重生成、对话分支、历史全文搜索、多选导出（Markdown）。
- **工具调用**：联网搜索（Tavily）、文档解析、计算沙箱（JS / Python）、图表绘制（mermaid / echarts）、AI 生图、浏览器控制、会话导出。
- **文件工作区**：新建 / 编辑 / 搜索文件，回收站、历史版本、ZIP 导入导出；内置预览沙箱，支持 JS / TS / Vue 单文件与多页项目，可自动自测并给出诊断。
- **记忆与技能**：长期记忆的沉淀与管理、跨模块读取开关；技能开关统一在设置中管理。
- **探索星空**：与主聊天完全隔离的独立社交页，支持好友、群聊、随机多角色串行回复。
- **梦境推演**：独立的互动叙事栏目。
- **数据与外观**：深浅色主题、自定义背景、符号样式、用量统计、存储占用统计与全量备份导入导出。
- **PWA 与扩展**：Service Worker 离线外壳、GitHub Pages 自动部署、Chrome 浏览器控制扩展。

## 技术栈

Vue 3 + Vite + Pinia + Vue Router，IndexedDB 本地存储，marked + DOMPurify 渲染，highlight.js 高亮，mermaid / ECharts 图表，esbuild-wasm 与 @vue/compiler-sfc 支撑浏览器内转译，Vitest 单元测试。

## 快速开始

要求 Node.js 22 及以上。

```bash
npm install
npm run dev
```

开发服务器默认运行在 `http://localhost:5174/`。

首次使用请进入「设置 → 模型设置」，填写 API Base、API Key 与模型名：

- **OpenAI 兼容接口**：填写服务商的 Base URL（如 `https://api.deepseek.com`）与 Key。
- **Ollama 本地模型**：开发服务器会把 `/ollama-api` 代理到 `http://127.0.0.1:11434`。
- **副模型 API**（可选）：用于图片理解与 AI 生图，支持任意 OpenAI 兼容服务。
- **Tavily API Key**（可选）：用于联网搜索。

API Key 会先用不可导出的浏览器密钥（IndexedDB + AES-GCM）加密后再落盘，除发送给你配置的服务商外不会上传到其他位置。加密能降低 localStorage 与磁盘转储中的明文暴露，但不能防 XSS；公开多用户部署请改用后端代理。

## 常用脚本

```bash
npm run dev      # 启动开发服务器
npm run build    # 生产构建，输出到 dist/
npm run preview  # 预览构建产物
npm run lint     # ESLint 检查
npm test         # Vitest 单元测试
npm run test:e2e # Playwright 冒烟测试（首次先执行 npx playwright install chromium）
```

## 数据存储

- 会话、消息、工作区文件等主要数据存放在 **IndexedDB**，启动时会自动把旧版 localStorage 数据迁移过去。
- 设置等小体积配置保留在 **localStorage**（`ai_chat_settings`）；API Key 字段落盘前会用 AES-GCM 加密，内存中仍保留明文供请求同步读取。
- 存储空间不足时会提示，并每日自动备份（保留最近 3 份）。
- 可在「设置 → 数据设置」查看占用、导出备份或导入恢复。

## 目录结构

```text
ai-chat/
├─ src/
│  ├─ components/
│  │  ├─ chat/          # 消息列表、输入框、分支栏、历史搜索
│  │  ├─ layout/        # 侧边栏、顶栏、主聊天页
│  │  ├─ workspace/     # 文件工作区、预览、Diff、文件查看器
│  │  ├─ starry/        # 探索星空
│  │  ├─ dream/         # 梦境推演
│  │  ├─ settings/      # 设置面板
│  │  ├─ memory/        # 记忆管理
│  │  ├─ skills/        # 技能管理
│  │  ├─ assets/        # 我的文档
│  │  └─ common/        # 通用组件（Markdown、弹窗、上下文圆环等）
│  ├─ services/         # API、工具调用、沙箱、工作区、搜索、文档解析等
│  ├─ stores/           # Pinia：chat / topics / settings / memory / starry / dream / assets
│  ├─ utils/            # 存储、备份、文本、图片等工具
│  └─ router/           # 路由
├─ tests/               # Vitest 单元测试
├─ extension/           # Chrome 浏览器控制扩展
├─ public/              # 图标、PWA manifest、Service Worker
└─ .github/workflows/   # GitHub Pages 自动部署
```

## 部署

推送到 `master` / `main` 分支后，GitHub Actions 会依次执行 `lint`、`test`、`build` 并发布到 GitHub Pages，配置见 `.github/workflows/deploy.yml`。

构建使用相对资源路径（`base: './'`），同时兼容自定义域名（`public/CNAME`）与 Pages 项目路径。手动构建时把 `dist/` 部署到任意静态服务器即可。

## 浏览器扩展

`extension/` 是「XIYUE 浏览器控制」Chrome 扩展（Manifest V3）。在 Chrome 的「扩展程序」页面开启开发者模式，选择「加载已解压的扩展程序」并指向该目录即可。

开发 / 预览服务器和构建产物都提供 `/browser-extension.zip` 下载，也可直接打包该目录分发。

## 测试与质量

- 单元测试：`tests/` 下覆盖 store、服务与工具函数，使用 `happy-dom` 模拟浏览器环境。
- 冒烟测试：`e2e/smoke.spec.js` 覆盖发消息、新建与切换会话、工作区写文件并打开预览、星空私聊、设置保存后刷新仍生效。
- 代码检查：ESLint（Vue 3 + 浏览器 / Node / Service Worker 分环境配置）。
- CI：每次推送自动执行 lint、测试与构建。

## 已知限制

- 链接正文读取依赖开发 / 预览服务器的 `/api/read-link` 中间件；纯静态部署时会回退为直接抓取，受目标站点 CORS 限制。
- 扫描版 PDF 暂不支持文本提取；旧版 `.doc` / `.xls` 需先另存为 `.docx` / `.xlsx`。
- 项目为个人自用定位，界面文案仅提供中文。
