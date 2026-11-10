<template>
  <Teleport to="body">
    <div class="skill-overlay" :class="{ open: visible }" @click.self="close">
      <div class="skill-panel" :class="{ open: visible }">
        <div class="skill-header">
          <h2>技能管理</h2>
          <button class="btn-close" @click="close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div class="skill-body">
          <div class="skill-card">
            <div class="skill-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
            </div>
            <div class="skill-info">
              <div class="skill-name">
                链接识别
                <span class="skill-tag">默认</span>
              </div>
              <div class="skill-desc">读取你发送的链接内容，作为上下文提供给 AI</div>
            </div>
            <label class="switch" :title="settings.linkSkillEnabled ? '点击关闭' : '点击开启'">
              <input v-model="settings.linkSkillEnabled" type="checkbox" />
              <span class="switch-track"><span class="switch-thumb"></span></span>
            </label>
          </div>

          <div class="skill-card">
            <div class="skill-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>
            </div>
            <div class="skill-info">
              <div class="skill-name">
                工作模式
                <span class="skill-tag">默认</span>
              </div>
              <div class="skill-desc">让 AI 读写工作区文件，帮你写代码、做项目、保存文档</div>
            </div>
            <label class="switch" :title="settings.workModeEnabled ? '点击关闭' : '点击开启'">
              <input v-model="settings.workModeEnabled" type="checkbox" />
              <span class="switch-track"><span class="switch-thumb"></span></span>
            </label>
          </div>

          <div class="skill-card">
            <div class="skill-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>
            </div>
            <div class="skill-info">
              <div class="skill-name">
                文档解析
                <span class="skill-tag">默认</span>
              </div>
              <div class="skill-desc">从「我的文档」选择文件，读取正文后作为上下文提供给 AI</div>
            </div>
            <label class="switch" :title="settings.documentSkillEnabled ? '点击关闭' : '点击开启'">
              <input v-model="settings.documentSkillEnabled" type="checkbox" />
              <span class="switch-track"><span class="switch-thumb"></span></span>
            </label>
          </div>

          <div class="skill-card">
            <div class="skill-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            </div>
            <div class="skill-info">
              <div class="skill-name">
                图片理解
                <span class="skill-tag">默认</span>
              </div>
              <div class="skill-desc">把图片交给视觉模型读字并概括关键内容，不是本地 OCR</div>
            </div>
            <label class="switch" :title="settings.ocrSkillEnabled ? '点击关闭' : '点击开启'">
              <input v-model="settings.ocrSkillEnabled" type="checkbox" />
              <span class="switch-track"><span class="switch-thumb"></span></span>
            </label>
          </div>

          <div class="skill-card">
            <div class="skill-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 3l1.2 3.4 3.4 1.2-3.4 1.2L10 12.2l-1.2-3.4L5.4 7.6l3.4-1.2L10 3z"/><path d="M17.5 12l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9.9-2.6z"/></svg>
            </div>
            <div class="skill-info">
              <div class="skill-name">
                AI 生图
                <span class="skill-tag">默认</span>
              </div>
              <div class="skill-desc">根据你的描述调用副模型生成图片</div>
            </div>
            <label class="switch" :title="settings.imageGenSkillEnabled ? '点击关闭' : '点击开启'">
              <input v-model="settings.imageGenSkillEnabled" type="checkbox" />
              <span class="switch-track"><span class="switch-thumb"></span></span>
            </label>
          </div>

          <div class="skill-card">
            <div class="skill-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </div>
            <div class="skill-info">
              <div class="skill-name">
                联网搜索
                <span class="skill-tag">默认</span>
              </div>
              <div class="skill-desc">由模型按需显式调用 Tavily，检索最新信息并附来源</div>
            </div>
            <label class="switch" :title="settings.searchSkillEnabled ? '点击关闭' : '点击开启'">
              <input v-model="settings.searchSkillEnabled" type="checkbox" />
              <span class="switch-track"><span class="switch-thumb"></span></span>
            </label>
          </div>

          <div class="skill-card">
            <div class="skill-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="8" y2="10"/><line x1="12" y1="10" x2="12" y2="10"/><line x1="16" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="8" y2="14"/><line x1="12" y1="14" x2="12" y2="14"/><line x1="16" y1="14" x2="16" y2="14"/><line x1="8" y1="18" x2="16" y2="18"/></svg>
            </div>
            <div class="skill-info">
              <div class="skill-name">
                计算沙箱
                <span class="skill-tag">默认</span>
              </div>
              <div class="skill-desc">表格用 JS Worker 统计校验，复杂计算按需执行 JS / Python</div>
            </div>
            <label class="switch" :title="settings.calcSandboxEnabled ? '点击关闭' : '点击开启'">
              <input v-model="settings.calcSandboxEnabled" type="checkbox" />
              <span class="switch-track"><span class="switch-thumb"></span></span>
            </label>
          </div>

          <div class="skill-card">
            <div class="skill-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></svg>
            </div>
            <div class="skill-info">
              <div class="skill-name">
                浏览器控制
                <span class="skill-tag">扩展</span>
              </div>
              <div class="skill-desc">打开网页、点击、填写并截图，截图可交给视觉模型查看</div>
            </div>
            <label class="switch" :title="settings.browserSkillEnabled ? '点击关闭' : '点击开启'">
              <input v-model="settings.browserSkillEnabled" type="checkbox" />
              <span class="switch-track"><span class="switch-thumb"></span></span>
            </label>
          </div>

          <div v-if="hasNotes" class="skill-notes">
            <div v-if="settings.browserSkillEnabled" class="skill-actions">
              <a class="browser-btn" href="./browser-extension.zip" download>下载扩展</a>
              <button class="browser-btn" type="button" @click="checkBrowserConnection">检测连接</button>
              <div ref="domainPopRef" class="domain-pop-wrap">
                <button class="browser-btn" type="button" :class="{ active: domainPopOpen }" @click="domainPopOpen = !domainPopOpen">网站名单</button>
                <div v-if="domainPopOpen" ref="domainPopBoxRef" class="domain-pop">
                  <div class="domain-pop-head">
                    <span>允许的网站</span>
                    <button class="domain-pop-close" type="button" title="关闭" @click="domainPopOpen = false">×</button>
                  </div>
                  <input v-model="settings.browserAllowedDomains" type="text" placeholder="例如：example.com, bilibili.com" />
                  <p class="domain-pop-hint">留空 = 所有 http/https 网站；多个域名用逗号分隔。</p>
                </div>
              </div>
            </div>

            <div v-if="settings.browserSkillEnabled" class="skill-note" :class="{ warn: browserStatus === 'missing' }">
              <span>
                <template v-if="browserStatus === 'connected'">扩展已连接{{ browserVersion ? `（v${browserVersion}）` : '' }}，可以让 AI 打开链接并操作。</template>
                <template v-else-if="browserStatus === 'checking'">正在检测扩展连接…</template>
                <template v-else>未检测到扩展：下载并解压 zip，在 chrome://extensions 打开「开发者模式」→「加载已解压的扩展程序」，选择解压目录后刷新本页。</template>
              </span>
            </div>
            <div v-if="settings.browserSkillEnabled" class="skill-note">
              <span>截图需要视觉模型才能被 AI 看懂（主模型{{ visionStatusText }}，可在副模型 API 配置 glm-4.6v）；纯文本模型会改用页面正文。</span>
            </div>
            <div v-if="settings.browserSkillEnabled" class="skill-note warn">
              <span>截图会发送给模型服务商；登录、支付、提交表单等敏感操作请人工确认。仅支持 Chrome / Edge。</span>
            </div>

            <div v-if="settings.workModeEnabled" class="skill-note">
              <span>
                <template v-if="wsStatus.mode === 'folder'">当前工作区：本机文件夹「{{ wsStatus.folderName }}」，AI 的读写都限定在这个文件夹内；到「工作区」面板的「文件」菜单可更换或改回内置工作区。</template>
                <template v-else>当前使用浏览器内置工作区：文件保存在浏览器中，可在「工作区」面板查看、下载、导入，或用「文件」菜单挂载本机文件夹。</template>
              </span>
            </div>
            <div v-if="settings.workModeEnabled && wsStatus.mode === 'folder' && wsStatus.permission === 'prompt'" class="skill-note warn">
              <span>文件夹授权在本会话已失效，<button class="inline-link" type="button" @click="reauthorizeFolder">点击重新授权</button>后即可继续读写。</span>
            </div>
            <div v-if="settings.workModeEnabled && !wsStatus.folderSupported" class="skill-note">
              <span>当前浏览器不支持挂载本机文件夹（需 Chrome / Edge），将使用内置工作区。</span>
            </div>
            <div v-if="settings.workModeEnabled" class="skill-note warn">
              <span>AI 可直接修改工作区内的文件；删除会移入 .xiyue-trash 回收目录。挂载重要项目文件夹前请先备份。</span>
            </div>

            <div v-if="settings.ocrSkillEnabled" class="skill-note" :class="{ warn: !settings.secondaryReady && visionStatus === 'text' }">
              <span>
                <template v-if="visionStatus === 'vision'">
                  图片将优先交给主模型「{{ settings.model }}」读取。<template v-if="settings.secondaryReady">主模型无法识别或请求失败时，自动切换到副模型「{{ settings.secondaryModel }}」。</template>
                </template>
                <template v-else-if="settings.secondaryReady">
                  主模型「{{ settings.model }}」{{ visionStatusText }}，图片将由副模型「{{ settings.secondaryModel }}」读取。<template v-if="visionStatus === 'unknown'">若主模型能处理图片，会优先使用主模型。</template>
                </template>
                <template v-else>
                  未配置副模型，将使用主模型「{{ settings.model }}」（{{ visionStatusText }}）。可在 设置 → 模型设置 → 副模型 API 配置视觉模型。
                </template>
              </span>
            </div>
            <div v-if="settings.imageGenSkillEnabled" class="skill-note" :class="{ warn: !settings.secondaryReady }">
              <span>
                <template v-if="settings.secondaryReady">
                  使用副模型的生图模型「{{ settings.secondaryImageModel }}」生成图片。
                </template>
                <template v-else>
                  尚未配置副模型 API，发送生图描述时会提示去配置；主对话不受影响。
                </template>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useSettingsStore } from '../../stores/settings'
import { detectVisionSupport } from '../../services/ocr'
import { pingBrowserExtension } from '../../services/browserAgent'
import { getWorkspaceStatus, ensureWorkspacePermission } from '../../services/workspace'

const settings = useSettingsStore()
const visible = ref(false)
const browserStatus = ref('unknown')
const browserVersion = ref('')
const wsStatus = ref({ mode: 'opfs', folderName: '', permission: null, folderSupported: false, opfsSupported: true })
const domainPopOpen = ref(false)
const domainPopRef = ref(null)
const domainPopBoxRef = ref(null)

const hasNotes = computed(() =>
  settings.browserSkillEnabled || settings.workModeEnabled || settings.ocrSkillEnabled || settings.imageGenSkillEnabled
)

function onDocumentMousedown(e) {
  if (!domainPopOpen.value) return
  if (domainPopRef.value?.contains(e.target) || domainPopBoxRef.value?.contains(e.target)) return
  domainPopOpen.value = false
}

onMounted(() => document.addEventListener('mousedown', onDocumentMousedown))
onUnmounted(() => document.removeEventListener('mousedown', onDocumentMousedown))

async function refreshWsStatus() {
  wsStatus.value = await getWorkspaceStatus()
}

async function reauthorizeFolder() {
  const result = await ensureWorkspacePermission()
  if (result.ok) window.__ui?.showToast('文件夹已重新授权', 'success')
  else window.__ui?.showToast(result.message || '授权失败', 'error', 4200)
  await refreshWsStatus()
}

watch(() => settings.workModeEnabled, enabled => {
  if (enabled) refreshWsStatus()
})

async function checkBrowserConnection() {
  if (!settings.browserSkillEnabled) return
  browserStatus.value = 'checking'
  const result = await pingBrowserExtension(settings)
  if (result.ok) {
    browserStatus.value = 'connected'
    browserVersion.value = result.version || ''
  } else {
    browserStatus.value = 'missing'
    window.__ui?.showToast(result.message || '未检测到浏览器扩展', 'info', 4200)
  }
}

watch(() => settings.browserSkillEnabled, enabled => {
  if (enabled) checkBrowserConnection()
  else browserStatus.value = 'unknown'
})

const visionStatus = computed(() =>
  detectVisionSupport(settings.model, settings.apiBase, settings.modelVisionMode)
)
const visionStatusText = computed(() => {
  if (visionStatus.value === 'vision') return '已判定支持图片'
  if (visionStatus.value === 'text') return '被判定为纯文本模型，发图会直接提示'
  return '视觉能力未确认，将根据接口返回判断'
})

function open() {
  visible.value = true
  if (settings.browserSkillEnabled) checkBrowserConnection()
  if (settings.workModeEnabled) refreshWsStatus()
}
function close() { visible.value = false }
defineExpose({ open, close })
</script>

<style scoped>
.skill-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.5);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.3s;
}
.skill-overlay.open {
  opacity: 1;
  pointer-events: auto;
}

.skill-panel {
  position: fixed;
  top: 0;
  right: 0;
  width: 420px;
  max-width: 100vw;
  height: 100vh;
  height: 100dvh;
  background: var(--bg-primary);
  display: flex;
  flex-direction: column;
  transform: translateX(100%);
  transition: transform 0.3s ease;
  z-index: 1001;
}
.skill-panel.open {
  transform: translateX(0);
}

.skill-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}
.skill-header h2 {
  font-size: 18px;
  margin: 0;
}
.btn-close {
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, color 0.15s;
}
.btn-close:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.skill-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
}

.skill-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
}
.skill-card + .skill-card {
  margin-top: 12px;
}
.skill-icon {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border-radius: 10px;
  background: var(--accent-light);
  color: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
}
.skill-info {
  flex: 1;
  min-width: 0;
}
.skill-name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}
.skill-tag {
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--accent-light);
  color: var(--accent);
  font-size: 10px;
  font-weight: 500;
}
.skill-tag.muted {
  background: var(--bg-hover);
  color: var(--text-muted);
}
.skill-desc {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-muted);
}

.switch {
  flex-shrink: 0;
  cursor: pointer;
  display: inline-flex;
}
.switch input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}
.switch-track {
  position: relative;
  width: 38px;
  height: 22px;
  border-radius: 11px;
  background: var(--bg-active);
  transition: background 0.2s;
  display: inline-block;
}
.switch-track::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--text-muted);
  transition: transform 0.2s, background 0.2s;
}
.switch input:checked + .switch-track {
  background: var(--accent);
}
.switch input:checked + .switch-track::after {
  transform: translateX(16px);
  background: #fff;
}

.skill-option {
  margin-top: 12px;
  padding: 12px 16px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
}
.skill-option-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 12px;
  color: var(--text-secondary);
}
.skill-option-value {
  color: var(--accent);
  font-weight: 600;
  flex-shrink: 0;
}
.skill-option input[type="range"] {
  width: 100%;
  margin: 10px 0 4px;
  accent-color: var(--accent);
}
.skill-option-hint {
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.5;
}

.skill-notes {
  margin-top: 16px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
}
.skill-notes > * + * {
  border-top: 1px solid var(--border-color);
}
.skill-actions {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px;
}
.skill-note {
  display: flex;
  gap: 9px;
  padding: 11px 14px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-secondary);
}
.skill-note::before {
  content: '';
  flex-shrink: 0;
  width: 6px;
  height: 6px;
  margin-top: 8px;
  border-radius: 50%;
  background: var(--accent);
}
.skill-note.warn::before {
  background: var(--danger);
}
.browser-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 7px 14px;
  border-radius: 9px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: 12px;
  cursor: pointer;
  text-decoration: none;
  transition: border-color 0.2s, color 0.2s;
}
.browser-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.browser-btn.active {
  border-color: var(--accent);
  color: var(--accent);
}
.domain-pop {
  position: absolute;
  top: calc(100% + 8px);
  right: 12px;
  z-index: 60;
  width: min(300px, calc(100vw - 60px));
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-card);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
}
.domain-pop-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 12px;
  color: var(--text-secondary);
}
.domain-pop-close {
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
}
.domain-pop-close:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.domain-pop input {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  border-radius: 9px;
  border: 1px solid var(--border-color);
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: 12px;
  outline: none;
}
.domain-pop input:focus {
  border-color: var(--accent);
}
.domain-pop-hint {
  margin: 8px 0 0;
  font-size: 11px;
  line-height: 1.6;
  color: var(--text-muted);
}
.inline-link {
  border: none;
  background: none;
  padding: 0;
  color: var(--accent);
  cursor: pointer;
  font-size: inherit;
  font-family: inherit;
  text-decoration: underline;
}
</style>
