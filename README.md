# XIYUE AI

**English** | [简体中文](README.zh-CN.md)

A fully client-side personal AI assistant with streaming chat, tool calling, a file workspace with sandboxed previews, and two standalone sections: Starry Sky and Dream Inference. All data stays in your browser. The app can be deployed as a static site or installed as a PWA.

## Features

- **Chat**: streaming output, thinking process, image messages, regenerate and edit-then-regenerate, conversation branches, full-text history search, and multi-select Markdown export.
- **Tool calling**: web search (Tavily), document parsing, calculation sandbox (JS / Python), chart rendering (mermaid / ECharts), AI image generation, browser control, and conversation export.
- **Workspace**: create, edit, and search files; trash, file history, and ZIP import/export. The built-in preview sandbox supports JS / TS / Vue single-file and multi-page projects, with automated self-test and diagnostics.
- **Memory and skills**: capture and manage long-term memory, control cross-module read access, and toggle skills in Settings.
- **Starry Sky**: an isolated social page with friends, group chats, and randomized multi-character sequential replies.
- **Dream Inference**: a standalone interactive narrative section.
- **Data and appearance**: light/dark themes, custom background, symbol styling, usage stats, storage usage stats, and full backup import/export.
- **PWA and extension**: Service Worker shell, automatic GitHub Pages deployment, and a Chrome browser-control extension.

## Tech Stack

Vue 3 + Vite + Pinia + Vue Router, IndexedDB local storage, marked + DOMPurify rendering, highlight.js, mermaid / ECharts, esbuild-wasm and @vue/compiler-sfc for in-browser transpilation, and Vitest for unit tests.

## Quick Start

Requires Node.js 22 or later.

```bash
npm install
npm run dev
```

The dev server runs at `http://localhost:5174/` by default.

On first use, open **Settings → Model Settings** and fill in the API Base, API Key, and model name:

- **OpenAI-compatible API**: enter your provider's Base URL (for example `https://api.deepseek.com`) and key.
- **Ollama local models**: the dev server proxies `/ollama-api` to `http://127.0.0.1:11434`.
- **Secondary model API** (optional): used for image understanding and AI image generation. Any OpenAI-compatible service works.
- **Tavily API Key** (optional): used for web search.

API keys are encrypted at rest with a non-extractable browser key (IndexedDB + AES-GCM) and are sent only to the provider you configure. This reduces plaintext exposure in local storage and disk dumps; it does not protect against XSS. For a public multi-user deployment, use a backend proxy instead.

## Scripts

```bash
npm run dev      # Start the dev server
npm run build    # Production build to dist/
npm run preview  # Preview the production build
npm run lint     # Run ESLint
npm test         # Run Vitest unit tests
npm run test:e2e # Run Playwright smoke tests (install Chromium first: npx playwright install chromium)
```

## Data Storage

- Conversations, messages, and workspace files live in **IndexedDB**. Legacy localStorage data is migrated automatically on startup.
- Small settings live in **localStorage** (`ai_chat_settings`). API key fields are AES-GCM encrypted before writing; the in-memory copy stays plaintext so request code can read it synchronously.
- The app warns when storage is low and creates a daily automatic backup (the latest 3 are kept).
- Use **Settings → Data** to inspect storage usage, export a backup, or restore one.

## Project Structure

```text
ai-chat/
├─ src/
│  ├─ components/
│  │  ├─ chat/          # Message list, composer, branch bar, history search
│  │  ├─ layout/        # Sidebar, top bar, main chat page
│  │  ├─ workspace/     # File workspace, preview, diff, file viewer
│  │  ├─ starry/        # Starry Sky
│  │  ├─ dream/         # Dream Inference
│  │  ├─ settings/      # Settings panel
│  │  ├─ memory/        # Memory management
│  │  ├─ skills/        # Skill management
│  │  ├─ assets/        # My Documents
│  │  └─ common/        # Shared components (Markdown, modals, context ring, etc.)
│  ├─ services/         # API, tool calling, sandbox, workspace, search, document parsing
│  ├─ stores/           # Pinia: chat / topics / settings / memory / starry / dream / assets
│  ├─ utils/            # Storage, backup, text, image helpers
│  └─ router/           # Routes
├─ tests/               # Vitest unit tests
├─ extension/           # Chrome browser-control extension
├─ public/              # Icons, PWA manifest, Service Worker
└─ .github/workflows/   # Automatic GitHub Pages deployment
```

## Deployment

Pushing to `master` / `main` triggers GitHub Actions to run `lint`, `test`, and `build`, then publish to GitHub Pages. See `.github/workflows/deploy.yml`.

The build uses relative asset paths (`base: './'`), so it works with both a custom domain (`public/CNAME`) and a GitHub Pages project path. For manual deployment, serve the `dist/` directory from any static host.

## Browser Extension

`extension/` contains the **XIYUE Browser Control** Chrome extension (Manifest V3). Enable developer mode on Chrome's Extensions page, choose **Load unpacked**, and select that directory.

The dev/preview server and build output both expose `/browser-extension.zip`. You can also zip the directory manually for distribution.

## Testing and Quality

- Unit tests: `tests/` covers stores, services, and utility functions, using `happy-dom` for the browser environment.
- E2E smoke tests: `e2e/smoke.spec.js` covers sending a message, creating and switching topics, writing a workspace file and opening its preview, a Starry Sky private chat, and settings persistence.
- Linting: ESLint with separate browser / Node / Service Worker configurations.
- CI: every push runs lint, tests, and the production build.

## Known Limitations

- Reading linked pages depends on the `/api/read-link` middleware provided by the dev/preview server. On a purely static deployment it falls back to a direct fetch, which is subject to the target site's CORS policy.
- Scanned PDFs do not support text extraction; legacy `.doc` / `.xls` files must be saved as `.docx` / `.xlsx` first.
- The UI is Chinese-only, since the project is intended for personal use.
