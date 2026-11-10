<template>
  <Teleport to="body">
    <div class="settings-overlay" :class="{ open: visible }" @click.self="close">
      <div class="settings-panel" :class="{ open: visible }">
        <div class="settings-header">
          <button v-if="activeSection" class="btn-back" @click="goMenu" title="返回设置">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <h2>{{ activeSection ? currentSection.title : '设置' }}</h2>
        </div>

        <div class="settings-body">
          <!-- 设置菜单 -->
          <div v-if="!activeSection" class="settings-menu">
              <button
              v-for="sec in sections"
              :key="sec.key"
              class="menu-item"
              @click="openSection(sec.key)"
            >
              <span class="menu-icon">
                <svg v-if="sec.key === 'user'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                <svg v-else-if="sec.key === 'model'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2"/></svg>
                <svg v-else-if="sec.key === 'search'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <svg v-else-if="sec.key === 'params'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>
                <svg v-else-if="sec.key === 'appearance'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="13.5" cy="6.5" r="1.5"/><circle cx="17.5" cy="10.5" r="1.5"/><circle cx="8.5" cy="7.5" r="1.5"/><circle cx="6.5" cy="12.5" r="1.5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>
                <svg v-else-if="sec.key === 'usage'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><polyline points="7 14 11 10 14 13 20 6"/></svg>
                <i v-else class="fa-solid fa-database"></i>
              </span>
              <span class="menu-text">
                <span class="menu-title">{{ sec.title }}</span>
                <span class="menu-desc">{{ sec.desc }}</span>
              </span>
              <svg class="menu-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>

          <!-- 用户信息 -->
          <div v-else-if="activeSection === 'user'" class="section-page">
            <div class="field">
              <label>用户名 / 昵称</label>
              <input v-model="settings.userName" type="text" placeholder="输入你的名字，AI 会用它称呼你…" />
            </div>
            <!-- 头像上传 -->
            <div class="field">
              <label>用户头像</label>
              <div class="avatar-upload">
                <div class="avatar-preview" @click="triggerUpload">
                  <img v-if="settings.userAvatar" :src="settings.userAvatar" class="avatar-preview-img" />
                  <svg v-else width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                </div>
                <div class="avatar-actions">
                  <button class="btn-secondary" @click="triggerUpload">选择图片</button>
                  <button v-if="settings.userAvatar" class="btn-secondary" @click="settings.userAvatar = ''">移除</button>
                </div>
              </div>
              <input ref="fileInput" type="file" accept="image/*" style="display:none" @change="onFileChange" />
            </div>

            <div class="divider"></div>

            <div class="field">
              <label>用户人设</label>
              <textarea
                v-model="settings.userPersona"
                class="persona-input"
                rows="3"
                placeholder="例如：我是一名前端开发者，喜欢简洁直接的回答…"
              ></textarea>
              <span class="range-hint">会附加到每次对话，帮助 AI 了解你的背景与偏好；留空则不附加。</span>
            </div>

            <div class="divider"></div>

            <div class="section-header">
              <h3 class="sub-title">AI 人设提示</h3>
              <label class="switch-label">
                <input type="checkbox" v-model="settings.personaEnabled" class="switch-input" />
                <span class="switch-track">
                  <span class="switch-thumb"></span>
                </span>
                <span class="switch-text">{{ settings.personaEnabled ? '已启用' : '已关闭' }}</span>
              </label>
            </div>
            <p class="hint" v-if="settings.personaEnabled">开启时优先遵守下方人设提示词。</p>
            <p class="hint" v-else>关闭后使用白曦月默认人设。</p>
            <textarea
              v-model="settings.personaPrompt"
              class="persona-input"
              rows="5"
              placeholder="例如：你是一个专业的中文助手..."
            ></textarea>

            <div class="divider"></div>

            <div class="section-header">
              <h3 class="sub-title">AI 回复规则</h3>
              <label class="switch-label">
                <input type="checkbox" v-model="settings.replyRulesEnabled" class="switch-input" />
                <span class="switch-track">
                  <span class="switch-thumb"></span>
                </span>
                <span class="switch-text">{{ settings.replyRulesEnabled ? '已启用' : '已关闭' }}</span>
              </label>
            </div>
            <textarea
              v-model="settings.replyRules"
              class="persona-input"
              rows="4"
              placeholder="例如：1. 不得过度说教、批评，保持专业性。"
            ></textarea>
            <p class="hint">规则会追加在系统提示词末尾，关闭后不生效。</p>
          </div>

          <!-- 用量查询 -->
          <div v-else-if="activeSection === 'usage'" class="section-page">
            <h3 class="sub-title"><i class="fa-solid fa-wallet"></i> 主模型余额</h3>
            <div class="usage-balance-card">
              <div class="balance-main">
                <template v-if="mainBalance.loading">
                  <span class="balance-message">正在查询余额…</span>
                </template>
                <template v-else-if="mainBalance.ok">
                  <span class="balance-amount">{{ mainBalance.currency === 'USD' ? '$' : '¥' }}{{ mainBalance.total.toFixed(2) }}</span>
                  <span class="balance-meta">
                    赠金 {{ mainBalance.granted.toFixed(2) }} · 充值 {{ mainBalance.toppedUp.toFixed(2) }}
                    <template v-if="balanceTime !== '—'"> · {{ balanceTime }} 更新</template>
                  </span>
                  <span v-if="!mainBalance.isAvailable" class="balance-warn">余额不足，模型调用可能失败</span>
                </template>
                <template v-else>
                  <span class="balance-message">{{ mainBalance.message }}</span>
                </template>
              </div>
              <button class="btn-secondary" :disabled="mainBalance.loading" @click="refreshBalance">刷新</button>
            </div>

            <div class="divider"></div>

            <h3 class="sub-title"><i class="fa-solid fa-chart-line"></i> 本应用用量</h3>
            <div class="usage-grid">
              <div class="usage-stat">
                <span class="usage-label">本月调用</span>
                <span class="usage-value">{{ usageSummary.current.calls }}</span>
              </div>
              <div class="usage-stat">
                <span class="usage-label">本月输入</span>
                <span class="usage-value">{{ formatTokenCount(usageSummary.current.prompt) }}</span>
              </div>
              <div class="usage-stat">
                <span class="usage-label">本月输出</span>
                <span class="usage-value">{{ formatTokenCount(usageSummary.current.completion) }}</span>
              </div>
              <div class="usage-stat">
                <span class="usage-label">本月估算</span>
                <span class="usage-value">{{ hasPrice ? '¥' + formatCost(currentCost) : '未设单价' }}</span>
              </div>
            </div>
            <p class="usage-total">
              累计 {{ formatTokenCount(usageSummary.total.prompt) }} 输入 · {{ formatTokenCount(usageSummary.total.completion) }} 输出 · {{ usageSummary.total.calls }} 次调用
              <template v-if="usageSummary.total.estimated">（其中 {{ usageSummary.total.estimated }} 次为估算值）</template>
            </p>

            <h3 class="sub-title">费用单价</h3>
            <div class="field">
              <label>输入单价（元 / 百万 token）</label>
              <input v-model.number="settings.usageInputPrice" type="number" min="0" step="0.01" placeholder="例如 2" />
            </div>
            <div class="field">
              <label>输出单价（元 / 百万 token）</label>
              <input v-model.number="settings.usageOutputPrice" type="number" min="0" step="0.01" placeholder="例如 8" />
            </div>
            <p class="hint">单价由你填写，应用不内置可能过期的价目表；保持 0 表示不估算费用。</p>

            <template v-if="monthModels.length">
              <h3 class="sub-title">本月按模型</h3>
              <div class="usage-table">
                <div class="usage-tr head"><span>模型</span><span>调用</span><span>输入</span><span>输出</span></div>
                <div v-for="m in monthModels" :key="m.model" class="usage-tr">
                  <span class="usage-model" :title="m.model">{{ m.model }}</span>
                  <span>{{ m.calls }}</span>
                  <span>{{ formatTokenCount(m.prompt) }}</span>
                  <span>{{ formatTokenCount(m.completion) }}</span>
                </div>
              </div>
            </template>
            <p v-else class="hint">还没有用量记录。发送消息后会自动统计主模型与副模型的 token 消耗。</p>
          </div>

          <!-- 模型设置 -->
          <div v-else-if="activeSection === 'model'" class="section-page">
            <h3 class="sub-title">模型选择</h3>
            <div class="preset-grid">
              <button
                v-for="p in cloudPresets"
                :key="p.label"
                class="preset-btn"
                :class="{ active: settings.apiBase === p.base && settings.model === p.model }"
                @click="selectPreset(p)"
              >
                {{ p.label }}
              </button>
            </div>

            <!-- Ollama 本地模型（可折叠） -->
            <div class="ollama-section">
              <button class="ollama-toggle" @click="toggleOllama">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline :points="ollamaOpen ? '6 15 12 9 18 15' : '9 18 15 12 9 6'"/></svg>
                Ollama 本地模型
                <span class="ollama-count" v-if="ollamaModels.length">{{ ollamaModels.length }} 个</span>
              </button>
              <div v-if="ollamaOpen" class="ollama-list">
                <div v-if="ollamaLoading" class="ollama-loading">扫描中…</div>
                <button
                  v-for="m in ollamaModels"
                  :key="m.name"
                  class="preset-btn ollama-item"
                  :class="{ active: settings.baseUrl === '/ollama' && settings.model === m.name }"
                  @click="selectOllamaModel(m.name)"
                >
                  <span class="ollama-name">{{ m.name }}</span>
                  <span class="ollama-tags">
                    <span v-for="t in m.tags" :key="t.label" class="ollama-tag" :style="{ background: t.color }">{{ t.label }}</span>
                  </span>
                  <span class="ollama-size">{{ m.size }}</span>
                </button>
                <div v-if="!ollamaLoading && ollamaModels.length === 0" class="ollama-empty">无法连接 Ollama 服务</div>
              </div>
            </div>

            <div class="divider"></div>

            <h3 class="sub-title">API 配置</h3>
            <div class="field">
              <label>API Base URL</label>
              <input v-model="settings.apiBase" type="text" placeholder="https://api.deepseek.com/v1" />
            </div>
            <div class="field">
              <label>模型名称</label>
              <input v-model="settings.model" type="text" placeholder="deepseek-chat" />
            </div>
            <div class="field">
              <label>API Key</label>
              <div class="password-field">
                <input v-model="settings.apiKey" :type="showKey ? 'text' : 'password'" placeholder="sk-..." />
                <button class="btn-toggle-pw" @click="showKey = !showKey">
                  <svg v-if="!showKey" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                </button>
              </div>
            </div>
            <div class="field">
              <label>模型图片能力</label>
              <div class="tier-grid">
                <button class="tier-btn" :class="{ active: settings.modelVisionMode === 'auto' }" @click="settings.modelVisionMode = 'auto'">自动</button>
                <button class="tier-btn" :class="{ active: settings.modelVisionMode === 'vision' }" @click="settings.modelVisionMode = 'vision'">支持图片</button>
                <button class="tier-btn" :class="{ active: settings.modelVisionMode === 'text' }" @click="settings.modelVisionMode = 'text'">纯文本</button>
              </div>
            </div>

            <div class="divider"></div>

            <div class="secondary-head">
              <h3 class="sub-title">副模型 API（多模态）</h3>
              <span class="state-badge" :class="{ on: settings.secondaryReady }">
                {{ settings.secondaryReady ? '已配置' : '未配置' }}
              </span>
            </div>
            <p class="hint">主模型不支持视觉或失败时，图片理解自动交给副模型；AI 生图也由副模型负责。支持任意兼容 OpenAI 格式的服务（智谱、OpenAI、DeepSeek、硅基流动、OpenRouter 等），Base URL 填接口根地址。</p>

            <div class="preset-grid">
              <button
                v-for="p in settings.secondaryPresets"
                :key="p.label"
                class="preset-btn"
                :class="{ active: p.custom ? settings.isCustomSecondary : settings.secondaryApiBase === p.base && settings.secondaryModel === p.model }"
                @click="applySecondaryPreset(p)"
              >
                {{ p.label }}
              </button>
            </div>

            <div class="field secondary-first">
              <label>Base URL</label>
              <input ref="secondaryBaseInput" v-model="settings.secondaryApiBase" type="text" placeholder="https://api.openai.com/v1" />
            </div>
            <div class="field">
              <label>视觉模型名称</label>
              <input v-model="settings.secondaryModel" type="text" placeholder="如 gpt-4o-mini / glm-4.6v-flash" />
            </div>
            <div class="field">
              <label>API Key</label>
              <div class="password-field">
                <input v-model="settings.secondaryApiKey" :type="showSecondaryKey ? 'text' : 'password'" placeholder="副模型 API Key" />
                <button class="btn-toggle-pw" @click="showSecondaryKey = !showSecondaryKey">
                  <svg v-if="!showSecondaryKey" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                </button>
              </div>
            </div>
            <div class="field">
              <label>生图模型</label>
              <input v-model="settings.secondaryImageModel" type="text" list="secondary-image-models" placeholder="glm-image" />
              <datalist id="secondary-image-models">
                <option value="glm-image"></option>
                <option value="cogview-4"></option>
                <option value="cogview-3-flash"></option>
                <option value="dall-e-3"></option>
                <option value="flux.1-schnell"></option>
              </datalist>
              <span class="range-hint">可填任意生图模型名，接口按 {Base URL}/images/generations 调用；留空默认 glm-image。</span>
            </div>
          </div>

          <!-- 搜索服务 -->
          <div v-else-if="activeSection === 'search'" class="section-page">
            <h3 class="sub-title">Tavily 搜索</h3>
            <div class="field">
              <label>Tavily API Key</label>
              <div class="password-field">
                <input v-model="settings.tavilyApiKey" :type="showSearchKey ? 'text' : 'password'" placeholder="tvly-..." />
                <button class="btn-toggle-pw" @click="showSearchKey = !showSearchKey">
                  <svg v-if="!showSearchKey" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                </button>
              </div>
              <span class="range-hint">仅保存在本地；导出数据时会自动脱敏，不会写入备份文件。</span>
            </div>
            <div class="field">
              <label>搜索深度</label>
              <div class="tier-grid">
                <button
                  class="tier-btn"
                  :class="{ active: settings.searchDepth === 'basic' }"
                  @click="settings.searchDepth = 'basic'"
                >
                  Basic
                </button>
                <button
                  class="tier-btn"
                  :class="{ active: settings.searchDepth === 'advanced' }"
                  @click="settings.searchDepth = 'advanced'"
                >
                  Advanced
                </button>
              </div>
            </div>

            <div class="divider"></div>

            <h3 class="sub-title">搜索结果注入</h3>
            <div class="field">
              <label>结果条数上限（{{ settings.searchMaxResults }} 条）</label>
              <input v-model.number="settings.searchMaxResults" type="range" min="1" max="10" step="1" />
              <span class="range-hint">1–10 条，默认 5 条；条数越多占用的上下文越多。</span>
            </div>
            <div class="field">
              <label>注入总字符上限（{{ settings.searchMaxChars.toLocaleString() }} 字）</label>
              <input v-model.number="settings.searchMaxChars" type="range" min="2000" max="30000" step="1000" />
              <span class="range-hint">所有搜索结果拼成上下文后的总长度上限，超出部分会被截断。</span>
            </div>
            <div class="field">
              <label>单条结果字符上限（{{ settings.searchItemMaxChars }} 字）</label>
              <input v-model.number="settings.searchItemMaxChars" type="range" min="300" max="3000" step="100" />
              <span class="range-hint">每条结果保留的正文长度；越长信息越全，也越占上下文。</span>
            </div>
          </div>

          <!-- 参数设置 -->
          <div v-else-if="activeSection === 'params'" class="section-page">
            <div class="field">
              <label>Temperature ({{ settings.temperature }})</label>
              <input v-model.number="settings.temperature" type="range" min="0" max="2" step="0.1" />
              <span class="range-hint">越高越有创意，越低越精确</span>
            </div>
            <div class="field">
              <label>Top P ({{ settings.topP }})</label>
              <input v-model.number="settings.topP" type="range" min="0" max="1" step="0.05" />
            </div>
            <div class="field">
              <label>思考强度</label>
              <div class="tier-grid four">
                <button
                  v-for="opt in reasoningOptions"
                  :key="opt.value"
                  class="tier-btn"
                  :class="{ active: settings.reasoningEffort === opt.value }"
                  @click="settings.reasoningEffort = opt.value"
                >
                  {{ opt.label }}
                </button>
              </div>
              <span class="range-hint">仅对支持推理强度的模型生效（如 GPT-5 系列）；开启思考后传递 reasoning_effort，默认跟随服务商。</span>
            </div>
            <div class="field">
              <label>每轮工具调用上限（{{ settings.maxToolCallsPerRound }} 次）</label>
              <input
                v-model.number="settings.maxToolCallsPerRound"
                type="number"
                min="1"
                max="200"
                step="1"
                @change="clampToolCalls"
              />
              <span class="range-hint">单轮回复中最多执行的工具调用数，默认 10，可调 1–200；调高后模型一次可并行完成更多步骤。</span>
            </div>
            <div class="field">
              <label>上下文长度</label>
              <div class="tier-grid">
                <button
                  v-for="opt in contextOptions"
                  :key="opt.value"
                  class="tier-btn"
                  :class="{ active: settings.contextLength === opt.value }"
                  @click="settings.contextLength = opt.value"
                >
                  {{ opt.label }}
                </button>
              </div>
              <span class="range-hint">模型单次可接收的最大上下文窗口</span>
            </div>
            <div class="field">
              <label>输出长度</label>
              <div class="tier-grid">
                <button
                  v-for="opt in outputOptions"
                  :key="opt.value"
                  class="tier-btn"
                  :class="{ active: settings.maxTokens === opt.value }"
                  @click="settings.maxTokens = opt.value"
                >
                  {{ opt.label }}
                </button>
              </div>
              <span class="range-hint">单次回复可生成的最大 token 数</span>
            </div>
          </div>

          <!-- 外观设置 -->
          <div v-else-if="activeSection === 'appearance'" class="section-page">
            <h3 class="sub-title">自定义背景</h3>
            <div class="field">
              <div class="bg-upload">
                <div class="bg-preview" :style="bgPreviewStyle" @click="triggerBgUpload">
                  <span v-if="!settings.backgroundImage">点击选择图片</span>
                </div>
                <div class="avatar-actions">
                  <button class="btn-secondary" @click="triggerBgUpload">选择图片</button>
                  <button v-if="settings.backgroundImage" class="btn-secondary" @click="settings.backgroundImage = ''">移除</button>
                </div>
              </div>
              <input ref="bgInput" type="file" accept="image/*" style="display:none" @change="onBgChange" />
              <span class="range-hint">图片仅保存在本地，不会上传服务器</span>
            </div>

            <div class="divider"></div>

            <h3 class="sub-title">符号内文字</h3>
            <p class="hint">为 AI 回复中成对符号内的文字设置颜色、倾斜与加粗。</p>
            <div class="symbol-list">
              <div v-for="rule in settings.symbolRules" :key="rule.id" class="symbol-rule">
                <div class="symbol-row">
                  <span class="symbol-pair">{{ rule.open }}…{{ rule.close }}</span>
                  <div class="symbol-controls">
                    <button class="color-dot" :style="{ background: rule.color }" title="文字颜色" @click="toggleColorPicker(rule.id)"></button>
                    <button class="fmt-btn" :class="{ active: rule.italic }" title="倾斜" @click="rule.italic = !rule.italic">I</button>
                    <button class="fmt-btn bold" :class="{ active: rule.bold }" title="加粗" @click="rule.bold = !rule.bold">B</button>
                    <button v-if="rule.custom" class="fmt-btn danger" title="删除符号" @click="removeRule(rule.id)">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                  </div>
                </div>
                <div v-if="colorPickerId === rule.id" class="color-palette">
                  <button
                    v-for="c in basicColors"
                    :key="c.value"
                    class="color-swatch"
                    :class="{ active: rule.color.toLowerCase() === c.value }"
                    :style="{ background: c.value }"
                    :title="c.name"
                    @click="setRuleColor(rule, c.value)"
                  ></button>
                </div>
              </div>
            </div>

            <div class="custom-symbol">
              <input v-model="newSymbol.open" maxlength="4" placeholder="起始符号，如 （" />
              <input v-model="newSymbol.close" maxlength="4" placeholder="结束符号，如 ）" />
              <button class="btn-secondary" @click="addCustomSymbol">添加</button>
            </div>
            <span class="range-hint">支持冒号、书名号等成对符号，例如 ：…： 或 《…》</span>

            <div class="divider"></div>

            <h3 class="sub-title">头像显示</h3>
            <div class="switch-row">
              <span>隐藏用户头像</span>
              <label class="switch-label">
                <input type="checkbox" v-model="settings.hideUserAvatar" class="switch-input" />
                <span class="switch-track"><span class="switch-thumb"></span></span>
              </label>
            </div>
            <div class="switch-row">
              <span>隐藏 AI 头像</span>
              <label class="switch-label">
                <input type="checkbox" v-model="settings.hideAiAvatar" class="switch-input" />
                <span class="switch-track"><span class="switch-thumb"></span></span>
              </label>
            </div>
            <p class="hint">开启后对话页面仅显示消息气泡，不显示对应头像。</p>
          </div>

          <!-- 数据设置 -->
          <div v-else-if="activeSection === 'data'" class="section-page">
            <div class="usage-card">
              <div class="usage-top">
                <div>
                  <div class="usage-total">{{ formatBytes(usage.totalBytes) }}</div>
                  <div class="usage-sub">本地存储占用 · 共 {{ usage.keyCount }} 项数据</div>
                </div>
                <button class="btn-refresh" title="刷新统计" @click="refreshUsage">
                  <i class="fa-solid fa-rotate-right"></i>
                </button>
              </div>
              <div class="usage-bar">
                <span
                  v-for="m in usage.modules"
                  :key="m.key"
                  class="usage-seg"
                  :style="{ width: m.percent + '%', background: m.color }"
                  :title="`${m.label} ${formatBytes(m.bytes)}`"
                ></span>
              </div>
              <div class="engine-row">
                <span class="engine-name">
                  <i class="fa-solid fa-database"></i>
                  {{ quota.engine === 'idb' ? 'IndexedDB 主存储' : 'localStorage 降级模式' }}
                </span>
                <span class="engine-size">
                  {{ formatBytes(quota.usage) }}<template v-if="quota.quota"> / {{ formatBytes(quota.quota) }}</template>
                  <template v-if="quota.percent"> · {{ Math.round(quota.percent) }}%</template>
                </span>
              </div>
              <div v-if="quota.percent" class="engine-bar">
                <span :class="{ warn: quota.percent >= 85 }" :style="{ width: Math.min(100, quota.percent) + '%' }"></span>
              </div>
            </div>

            <div class="module-list">
              <div v-for="m in usage.modules" :key="m.key" class="module-item">
                <button class="module-head" @click="toggleModule(m.key)">
                  <span class="module-icon" :style="{ color: m.color }"><i :class="m.icon"></i></span>
                  <span class="module-name">{{ m.label }}</span>
                  <span class="module-size">{{ formatBytes(m.bytes) }}</span>
                  <span class="module-pct">{{ m.bytes > 0 && m.percent < 1 ? '<1' : Math.round(m.percent) }}%</span>
                  <i class="fa-solid fa-chevron-down module-chevron" :class="{ open: expandedModule === m.key }"></i>
                </button>
                <div class="module-bar">
                  <span :style="{ width: m.percent + '%', background: m.color }"></span>
                </div>
                <div v-if="expandedModule === m.key" class="key-list">
                  <div v-for="e in m.entries" :key="e.key" class="key-row">
                    <span class="key-name">{{ e.label }}</span>
                    <span class="key-size">{{ formatBytes(e.bytes) }}</span>
                  </div>
                </div>
              </div>
              <div v-if="!usage.modules.length" class="usage-empty">暂无本地数据</div>
            </div>

            <div class="divider"></div>

            <h3 class="sub-title"><i class="fa-solid fa-file-export"></i> 备份与恢复</h3>
            <div class="data-actions">
              <button class="btn-secondary" @click="exportAllData">
                <i class="fa-solid fa-download"></i> 导出数据
              </button>
              <button class="btn-secondary" @click="triggerImportData">
                <i class="fa-solid fa-upload"></i> 导入数据
              </button>
              <input ref="importDataInput" type="file" accept=".json,application/json" style="display:none" @change="importAllData" />
            </div>
            <p class="hint protect-hint">
              <i class="fa-solid fa-shield-halved"></i>
              主/副模型API Key与搜索Key等敏感配置不会写入导出文件；导入时也会保留本机当前的Key.
            </p>

            <div class="divider"></div>

            <h3 class="sub-title"><i class="fa-solid fa-clock-rotate-left"></i> 自动备份</h3>
            <div class="backup-list">
              <div v-for="b in autoBackups" :key="b.key" class="backup-row">
                <span class="backup-date">{{ b.date }}</span>
                <span class="backup-size">{{ formatBytes(b.bytes) }}</span>
                <button class="btn-link" @click="restoreBackup(b)">恢复</button>
              </div>
              <p v-if="!autoBackups.length" class="hint">
                暂无自动备份。每天首次打开应用会自动生成一份快照，最多保留 3 份，可在数据异常时一键恢复。
              </p>
            </div>

            <div class="divider"></div>

            <h3 class="sub-title"><i class="fa-solid fa-triangle-exclamation"></i> 危险操作</h3>
            <button class="btn-danger" @click="clearAllData">清除所有数据</button>
          </div>
        </div>

        <div class="settings-footer">
          <button class="btn-primary" @click="saveAndClose">保存并关闭</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, reactive, nextTick } from 'vue'
import { useSettingsStore } from '../../stores/settings'
import {
  computeStorageUsage,
  formatBytes,
  buildBackupPayload,
  backupFileName,
  parseBackup,
  applyBackup,
  listAutoBackups,
  restoreAutoBackup,
} from '../../utils/dataBackup'
import { clearAppData, storageEstimate } from '../../utils/kv'
import { fetchBalance } from '../../services/balance'
import {
  estimateUsageCost,
  formatCost,
  formatTokenCount,
  getUsageSummary,
} from '../../services/usageStats'

const settings = useSettingsStore()
const visible = ref(false)
const showKey = ref(false)
const showSecondaryKey = ref(false)
const secondaryBaseInput = ref(null)

function applySecondaryPreset(preset) {
  settings.applySecondaryPreset(preset)
  if (preset.custom) nextTick(() => secondaryBaseInput.value?.focus())
}
const showSearchKey = ref(false)
const fileInput = ref(null)
const importDataInput = ref(null)
// 设置栏目
const sections = [
  { key: 'user', title: '用户信息', desc: '昵称、头像与人设' },
  { key: 'usage', title: '用量查询', desc: '服务商余额与本应用消耗' },
  { key: 'model', title: '模型设置', desc: '模型选择与 API 配置' },
  { key: 'search', title: '搜索服务', desc: 'Tavily API Key 与搜索深度' },
  { key: 'params', title: '参数设置', desc: '思考强度、工具调用上限与上下文/输出长度' },
  { key: 'appearance', title: '外观设置', desc: '自定义背景、符号文字样式与头像显示' },
  { key: 'data', title: '数据设置', desc: '存储占用、备份导出与导入恢复' },
]
const activeSection = ref('')
const currentSection = computed(() => sections.find(s => s.key === activeSection.value) || { title: '设置' })

// 数据设置：本地存储统计
const usage = ref({ totalBytes: 0, keyCount: 0, modules: [] })
const quota = ref({ usage: 0, quota: 0, percent: 0, engine: 'idb' })
const autoBackups = ref([])
const expandedModule = ref('')

async function refreshUsage() {
  usage.value = computeStorageUsage()
  autoBackups.value = listAutoBackups()
  quota.value = await storageEstimate()
}

function toggleModule(key) {
  expandedModule.value = expandedModule.value === key ? '' : key
}

function openSection(key) {
  activeSection.value = key
  if (key === 'data') refreshUsage()
  if (key === 'usage') refreshUsagePage()
}

// 用量查询：余额 + 本应用 token 统计
const mainBalance = ref({
  loading: false,
  ok: false,
  message: '',
  currency: 'CNY',
  total: 0,
  granted: 0,
  toppedUp: 0,
  isAvailable: true,
  fetchedAt: 0,
})
const usageSummary = ref(getUsageSummary())

const hasPrice = computed(() => Number(settings.usageInputPrice) > 0 || Number(settings.usageOutputPrice) > 0)
const currentCost = computed(() => estimateUsageCost({
  prompt: usageSummary.value.current.prompt,
  completion: usageSummary.value.current.completion,
  inputPrice: settings.usageInputPrice,
  outputPrice: settings.usageOutputPrice,
}))
const monthModels = computed(() => {
  const models = usageSummary.value.current.models || {}
  return Object.entries(models)
    .map(([model, v]) => ({ model, prompt: v.prompt || 0, completion: v.completion || 0, calls: v.calls || 0 }))
    .sort((a, b) => (b.prompt + b.completion) - (a.prompt + a.completion))
})
const balanceTime = computed(() =>
  mainBalance.value.fetchedAt ? new Date(mainBalance.value.fetchedAt).toLocaleTimeString() : '—'
)

async function refreshBalance() {
  mainBalance.value = { ...mainBalance.value, loading: true }
  const res = await fetchBalance({ apiBase: settings.apiBase, apiKey: settings.apiKey })
  mainBalance.value = {
    loading: false,
    ok: !!res.ok,
    message: res.message || '',
    currency: res.currency || 'CNY',
    total: res.total || 0,
    granted: res.granted || 0,
    toppedUp: res.toppedUp || 0,
    isAvailable: res.isAvailable !== false,
    fetchedAt: res.fetchedAt || 0,
  }
}

function refreshUsagePage() {
  usageSummary.value = getUsageSummary()
  // 余额缓存 10 分钟，避免频繁请求服务商
  const cached = mainBalance.value.fetchedAt && Date.now() - mainBalance.value.fetchedAt < 10 * 60 * 1000
  if (!cached) refreshBalance()
}

// Token 档位
const contextOptions = [
  { label: '32K', value: 32768 },
  { label: '64K', value: 65536 },
  { label: '128K', value: 131072 },
  { label: '256K', value: 262144 },
  { label: '512K', value: 524288 },
  { label: '1M', value: 1048576 },
]
const outputOptions = [
  { label: '4K', value: 4096 },
  { label: '16K', value: 16384 },
  { label: '32K', value: 32768 },
  { label: '64K', value: 65536 },
  { label: '128K', value: 131072 },
  { label: '384K', value: 393216 },
]
const reasoningOptions = [
  { label: '默认', value: 'default' },
  { label: '低', value: 'low' },
  { label: '中', value: 'medium' },
  { label: '高', value: 'high' },
]

function clampToolCalls() {
  const value = Math.round(Number(settings.maxToolCallsPerRound) || 10)
  settings.maxToolCallsPerRound = Math.max(1, Math.min(200, value))
}

function goMenu() { activeSection.value = '' }

// 外观设置
const bgInput = ref(null)
const colorPickerId = ref('')
const newSymbol = reactive({ open: '', close: '' })
const basicColors = [
  { name: '黑色', value: '#000000' },
  { name: '白色', value: '#ffffff' },
  { name: '灰色', value: '#808080' },
  { name: '红色', value: '#ef4444' },
  { name: '橙色', value: '#f97316' },
  { name: '黄色', value: '#eab308' },
  { name: '绿色', value: '#22c55e' },
  { name: '青色', value: '#06b6d4' },
  { name: '蓝色', value: '#3b82f6' },
  { name: '紫色', value: '#8b5cf6' },
  { name: '粉色', value: '#ec4899' },
  { name: '棕色', value: '#92400e' },
]

const bgPreviewStyle = computed(() => {
  if (!settings.backgroundImage) return {}
  return {
    backgroundImage: `url("${settings.backgroundImage}")`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  }
})

function triggerBgUpload() {
  bgInput.value?.click()
}

function onBgChange(e) {
  const file = e.target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (ev) => {
    const img = new Image()
    img.onload = () => {
      // 等比缩放，最长边不超过 1920px，避免 localStorage 超限
      const max = 1920
      const scale = Math.min(1, max / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      settings.backgroundImage = canvas.toDataURL('image/jpeg', 0.85)
      window.__ui?.showToast('背景已应用', 'success')
    }
    img.src = ev.target.result
  }
  reader.readAsDataURL(file)
  e.target.value = ''
}

function toggleColorPicker(id) {
  colorPickerId.value = colorPickerId.value === id ? '' : id
}

function setRuleColor(rule, value) {
  rule.color = value
  colorPickerId.value = ''
}

function addCustomSymbol() {
  const open = newSymbol.open.trim()
  const close = newSymbol.close.trim()
  if (!open || !close) {
    window.__ui?.showToast('请填写起始和结束符号', 'error')
    return
  }
  if (open.length > 4 || close.length > 4) {
    window.__ui?.showToast('符号长度不能超过 4 个字符', 'error')
    return
  }
  if (settings.symbolRules.some(r => r.open === open && r.close === close)) {
    window.__ui?.showToast('该符号已存在', 'error')
    return
  }
  settings.symbolRules.push({
    id: 'sym-' + Date.now(),
    open,
    close,
    color: '#000000',
    italic: false,
    bold: false,
    custom: true,
  })
  newSymbol.open = ''
  newSymbol.close = ''
  window.__ui?.showToast('已添加自定义符号', 'success')
}

function removeRule(id) {
  settings.symbolRules = settings.symbolRules.filter(r => r.id !== id)
  if (colorPickerId.value === id) colorPickerId.value = ''
}

// Ollama 本地模型
const ollamaOpen = ref(false)
const ollamaLoading = ref(false)
const ollamaModels = ref([])

// 模型能力标签映射
const modelCapabilities = [
  { match: /qwen3\.5/i, tags: [{ label: 'vision', color: '#8b5cf6' }, { label: 'tools', color: '#f59e0b' }, { label: 'thinking', color: '#6366f1' }, { label: '256K', color: '#6b7280' }] },
  { match: /deepseek-r1/i, tags: [{ label: 'tools', color: '#f59e0b' }, { label: 'thinking', color: '#6366f1' }, { label: '128K', color: '#6b7280' }] },
  { match: /deepseek-coder/i, tags: [{ label: 'thinking', color: '#6366f1' }, { label: '16K', color: '#6b7280' }] },
  { match: /ornith/i, tags: [{ label: 'thinking', color: '#6366f1' }, { label: '256K', color: '#6b7280' }] },
  { match: /minicpm-v/i, tags: [{ label: 'vision', color: '#8b5cf6' }, { label: 'thinking', color: '#6366f1' }, { label: '256K', color: '#6b7280' }] },
  { match: /minicpm5/i, tags: [{ label: 'thinking', color: '#6366f1' }, { label: '128K', color: '#6b7280' }] },
  { match: /deepseek-janus-pro/i, tags: [{ label: 'vision', color: '#8b5cf6' }, { label: 'thinking', color: '#6366f1' }, { label: '16K', color: '#6b7280' }] },
]

function getModelTags(name) {
  for (const c of modelCapabilities) {
    if (c.match.test(name)) return c.tags
  }
  return []
}

const cloudPresets = computed(() =>
  settings.modelPresets.filter(p => p.base !== '/ollama')
)

function toggleOllama() {
  ollamaOpen.value = !ollamaOpen.value
  if (ollamaOpen.value && ollamaModels.value.length === 0) {
    fetchOllamaModels()
  }
}

async function fetchOllamaModels() {
  ollamaLoading.value = true
  try {
    const resp = await fetch('/ollama-api/tags')
    const data = await resp.json()
    ollamaModels.value = (data.models || []).map(m => {
      const sizeGb = m.size / (1024 * 1024 * 1024)
      return {
        name: m.name,
        size: sizeGb >= 1 ? sizeGb.toFixed(1) + ' GB' : (m.size / (1024 * 1024)).toFixed(0) + ' MB',
        tags: getModelTags(m.name),
      }
    }).sort((a, b) => a.name.localeCompare(b.name))
  } catch {
    ollamaModels.value = []
  } finally {
    ollamaLoading.value = false
  }
}

function selectOllamaModel(name) {
  settings.model = name
  settings.apiBase = '/ollama'
  // 本地模型不按 token 计费，输出拉满
  const tags = getModelTags(name)
  const ctxTag = tags.find(t => t.label.endsWith('K'))
  if (ctxTag) {
    const ctxK = parseInt(ctxTag.label) * 1024
    settings.maxTokens = Math.min(ctxK, 131072)
  } else {
    settings.maxTokens = 65536
  }
}

function open(section = '') {
  openSection(section)
  visible.value = true
}

function close() { visible.value = false }

function triggerUpload() {
  fileInput.value?.click()
}

function onFileChange(e) {
  const file = e.target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (ev) => {
    // 裁剪为正方形圆形头像
    const img = new Image()
    img.onload = () => {
      const size = Math.min(img.width, img.height)
      const canvas = document.createElement('canvas')
      canvas.width = 200
      canvas.height = 200
      const ctx = canvas.getContext('2d')
      // 圆形裁剪
      ctx.beginPath()
      ctx.arc(100, 100, 100, 0, Math.PI * 2)
      ctx.clip()
      const sx = (img.width - size) / 2
      const sy = (img.height - size) / 2
      ctx.drawImage(img, sx, sy, size, size, 0, 0, 200, 200)
      settings.userAvatar = canvas.toDataURL('image/jpeg', 0.85)
    }
    img.src = ev.target.result
  }
  reader.readAsDataURL(file)
  // 清空以便重复选同一文件
  e.target.value = ''
}

defineExpose({ open, close })

function selectPreset(preset) {
  settings.applyPreset(preset)
}

function saveAndClose() {
  settings.persist()
  close()
}

async function clearAllData() {
  const ok = await window.__ui?.showConfirm('确定要清除所有数据吗？这将删除所有对话记录和设置，此操作不可撤销！')
  if (ok) {
    await clearAppData()
    location.reload()
  }
}

async function restoreBackup(item) {
  const ok = await window.__ui?.showConfirm(
    `恢复到 ${item.date} 的自动备份？当前数据会被覆盖，导入完成后页面将自动刷新。`
  )
  if (!ok) return
  try {
    const count = await restoreAutoBackup(item.key)
    window.__ui?.showToast(`已恢复 ${count} 项数据，正在刷新…`, 'success')
    setTimeout(() => location.reload(), 600)
  } catch (err) {
    window.__ui?.showToast(`恢复失败：${err?.message || '备份文件不可用'}`, 'error')
  }
}

function exportAllData() {
  const payload = buildBackupPayload()
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = backupFileName()
  a.click()
  URL.revokeObjectURL(url)
  window.__ui?.showToast('数据已导出', 'success')
}

function triggerImportData() { importDataInput.value?.click() }

async function importAllData(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return

  let parsed
  try {
    parsed = parseBackup(await file.text())
  } catch (err) {
    window.__ui?.showToast(`导入失败：${err?.message || '文件格式错误'}`, 'error')
    return
  }

  const summary = parsed.summary.length ? parsed.summary.join('、') : '空备份（将清空本地数据）'
  const ok = await window.__ui?.showConfirm(
    `导入将覆盖本地数据：${summary}。本机 API Key 会保留，导入完成后页面将自动刷新。是否继续？`
  )
  if (!ok) return

  try {
    const count = await applyBackup(parsed.entries)
    window.__ui?.showToast(`已恢复 ${count} 项数据，正在刷新…`, 'success')
    setTimeout(() => location.reload(), 600)
  } catch {
    window.__ui?.showToast('导入失败：写入数据时出错', 'error')
  }
}
</script>

<style scoped>
/* 遮罩层 */
.settings-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1000;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.3s;
}
.settings-overlay.open {
  opacity: 1;
  pointer-events: auto;
}

.settings-panel {
  position: fixed;
  top: 0;
  right: 0;
  width: 440px;
  max-width: 100vw;
  height: 100vh;
  height: 100dvh;
  background: var(--bg-primary);
  display: flex;
  flex-direction: column;
  transform: translateX(100%);
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.15);
  z-index: 1001;
}
.settings-panel.open {
  transform: translateX(0);
}

.settings-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}
.settings-header h2 {
  flex: 1;
  min-width: 0;
  font-size: 18px;
  font-weight: 700;
  margin: 0;
  color: var(--text-primary);
}
.btn-back {
  width: 34px;
  height: 34px;
  flex-shrink: 0;
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
.btn-back:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.settings-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
}

/* 设置菜单 */
.settings-menu {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.menu-item {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  padding: 14px 16px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  transition: background 0.15s, border-color 0.15s;
}
.menu-item:hover {
  background: var(--bg-hover);
  border-color: var(--accent);
}
.menu-icon {
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
.menu-text {
  flex: 1;
  min-width: 0;
}
.menu-title {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}
.menu-desc {
  display: block;
  margin-top: 2px;
  font-size: 12px;
  color: var(--text-muted);
}
.menu-chevron {
  flex-shrink: 0;
  color: var(--text-muted);
}

/* 子页面 */
.section-page {
  animation: page-in 0.18s ease;
}
@keyframes page-in {
  from { opacity: 0; transform: translateX(8px); }
  to { opacity: 1; transform: translateX(0); }
}
.sub-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.secondary-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 6px;
}
.secondary-head .sub-title { margin: 0; }
.state-badge {
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--bg-hover);
  color: var(--text-muted);
  font-size: 11px;
}
.state-badge.on {
  background: var(--accent-light);
  color: var(--accent);
  font-weight: 600;
}
.secondary-first { margin-top: 12px; }
.divider {
  height: 1px;
  background: var(--border-color);
  margin: 22px 0;
}

.hint {
  font-size: 12px;
  color: var(--text-muted);
  margin: 0 0 10px;
  line-height: 1.5;
}
.hint code {
  background: var(--bg-code);
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 12px;
}

.preset-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}
.preset-btn {
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.preset-btn:hover {
  background: var(--bg-hover);
}
.preset-btn.active {
  border-color: var(--accent);
  background: var(--accent-light);
  color: var(--accent);
  font-weight: 600;
}

/* Token 档位 */
.tier-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}
.tier-grid.four {
  grid-template-columns: repeat(4, 1fr);
}
.tier-btn {
  padding: 8px 0;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.15s;
}
.tier-btn:hover {
  background: var(--bg-hover);
}
.tier-btn.active {
  border-color: var(--accent);
  background: var(--accent-light);
  color: var(--accent);
  font-weight: 600;
}

/* Ollama 本地模型 */
.ollama-section {
  margin-top: 10px;
}
.ollama-toggle {
  display: flex; align-items: center; gap: 8px;
  width: 100%; padding: 9px 12px;
  border: 1px solid var(--border-color); border-radius: 8px;
  background: var(--bg-card); color: var(--text-primary);
  font-size: 13px; cursor: pointer; font-family: inherit;
  transition: background 0.15s;
}
.ollama-toggle:hover { background: var(--bg-hover); }
.ollama-count { font-size: 11px; color: var(--text-muted); margin-left: auto; }
.ollama-list { margin-top: 6px; display: flex; flex-direction: column; gap: 4px; }
.ollama-loading, .ollama-empty {
  padding: 10px; font-size: 12px; color: var(--text-muted); text-align: center;
}
.ollama-item {
  display: flex; flex-wrap: wrap; align-items: center; gap: 4px;
  width: 100%; text-align: left;
}
.ollama-name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ollama-tags { display: flex; gap: 3px; flex-wrap: wrap; }
.ollama-tag {
  padding: 1px 6px; border-radius: 4px; font-size: 9px;
  font-weight: 600; color: #fff; letter-spacing: 0.3px; text-transform: uppercase;
}
.ollama-size { font-size: 10px; color: var(--text-muted); flex-shrink: 0; }

.field {
  margin-bottom: 14px;
}
.field label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 5px;
}
.field input[type="text"],
.field input[type="password"],
.field input[type="number"] {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
  transition: border-color 0.2s;
  box-sizing: border-box;
}
.field input:focus {
  border-color: var(--accent);
}
.password-field {
  display: flex;
  gap: 6px;
}
.password-field input {
  flex: 1;
}
.btn-toggle-pw {
  width: 38px;
  height: 38px;
  flex-shrink: 0;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-input);
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

input[type="range"] {
  width: 100%;
  accent-color: var(--accent);
  margin: 4px 0;
}
.range-hint {
  font-size: 11px;
  color: var(--text-muted);
}

.persona-input {
  width: 100%;
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
  resize: vertical;
  font-family: inherit;
  line-height: 1.6;
  box-sizing: border-box;
}
.persona-input:focus {
  border-color: var(--accent);
}

/* 开关 */
.section-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 8px;
}
.section-header .sub-title { margin: 0; }
.switch-label {
  display: flex; align-items: center; gap: 8px; cursor: pointer;
}
.switch-input { display: none; }
.switch-track {
  width: 42px; height: 24px; border-radius: 12px;
  background: var(--border-color); position: relative; transition: background 0.2s;
}
.switch-input:checked + .switch-track { background: var(--accent); }
.switch-thumb {
  position: absolute; top: 2px; left: 2px;
  width: 20px; height: 20px; border-radius: 50%;
  background: #fff; transition: left 0.2s;
  box-shadow: 0 1px 3px rgba(0,0,0,0.15);
}
.switch-input:checked + .switch-track .switch-thumb { left: 20px; }
.switch-text { font-size: 12px; color: var(--text-muted); }

.btn-danger {
  padding: 10px 20px;
  border: 1px solid var(--danger);
  border-radius: 8px;
  background: transparent;
  color: var(--danger);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-danger:hover {
  background: var(--danger-bg);
}

.data-actions { display: flex; gap: 8px; margin-bottom: 8px; }
.data-actions .btn-secondary { flex: 1; }
.data-actions .btn-secondary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.data-actions .btn-secondary i { font-size: 12px; }
.sub-title i { font-size: 13px; color: var(--text-secondary); }
.menu-icon i { font-size: 18px; }

/* 数据设置：存储占用 */
.usage-card {
  padding: 14px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
}
.usage-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}
.usage-total {
  font-size: 24px;
  font-weight: 700;
  line-height: 1.1;
  color: var(--text-primary);
  letter-spacing: -0.5px;
}
.usage-sub {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-muted);
}
.btn-refresh {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-input);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, color 0.15s;
}
.btn-refresh:hover { background: var(--bg-hover); color: var(--text-primary); }
.usage-bar {
  display: flex;
  height: 8px;
  margin-top: 14px;
  border-radius: 4px;
  overflow: hidden;
  background: var(--bg-input);
}
.usage-seg { height: 100%; min-width: 2px; }

/* 存储引擎与配额 */
.engine-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 12px;
  font-size: 12px;
  color: var(--text-secondary);
}
.engine-name i { margin-right: 5px; font-size: 11px; color: var(--text-muted); }
.engine-size { color: var(--text-muted); white-space: nowrap; }
.engine-bar {
  height: 4px;
  margin-top: 8px;
  border-radius: 2px;
  overflow: hidden;
  background: var(--bg-input);
}
.engine-bar span {
  display: block;
  height: 100%;
  border-radius: 2px;
  background: var(--text-secondary);
  transition: width 0.2s;
}
.engine-bar span.warn { background: #ef4444; }
.engine-hint { margin-top: 10px; }

/* 自动备份 */
.backup-list { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }
.backup-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-card);
  font-size: 13px;
}
.backup-date { flex: 1; color: var(--text-primary); }
.backup-size { font-size: 12px; color: var(--text-muted); }
.btn-link {
  border: none;
  background: none;
  color: var(--accent-color, #0ea5e9);
  font-size: 13px;
  cursor: pointer;
  padding: 2px 4px;
}
.btn-link:hover { text-decoration: underline; }

/* 用量查询 */
.usage-balance-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
}
.balance-main { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.balance-amount { font-size: 24px; font-weight: 700; color: var(--text-primary); line-height: 1.2; }
.balance-meta { font-size: 12px; color: var(--text-muted); }
.balance-warn { font-size: 12px; color: #ef4444; }
.balance-message { font-size: 13px; color: var(--text-secondary); line-height: 1.5; }

.usage-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}
.usage-stat {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-card);
}
.usage-label { font-size: 11px; color: var(--text-muted); }
.usage-value { font-size: 16px; font-weight: 600; color: var(--text-primary); }
.usage-total { margin-top: 10px; font-size: 12px; color: var(--text-secondary); line-height: 1.6; }

.usage-table {
  border: 1px solid var(--border-color);
  border-radius: 10px;
  overflow: hidden;
}
.usage-tr {
  display: grid;
  grid-template-columns: 1.6fr 0.6fr 0.7fr 0.7fr;
  gap: 8px;
  padding: 9px 12px;
  font-size: 12px;
  color: var(--text-secondary);
  border-top: 1px solid var(--border-color);
}
.usage-tr:first-child { border-top: none; }
.usage-tr.head { background: var(--bg-sidebar); color: var(--text-muted); font-size: 11px; }
.usage-model {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-primary);
}
@media (max-width: 768px) {
  .usage-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

.module-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 16px;
}
.module-item {
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-card);
  overflow: hidden;
}
.module-head {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 12px 6px;
  border: none;
  background: transparent;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}
.module-icon {
  width: 18px;
  flex-shrink: 0;
  text-align: center;
  font-size: 13px;
}
.module-name {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.module-size { flex-shrink: 0; font-size: 12px; color: var(--text-secondary); }
.module-pct {
  width: 36px;
  flex-shrink: 0;
  text-align: right;
  font-size: 11px;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}
.module-chevron {
  flex-shrink: 0;
  font-size: 10px;
  color: var(--text-muted);
  transition: transform 0.18s;
}
.module-chevron.open { transform: rotate(180deg); }
.module-bar {
  height: 4px;
  margin: 0 12px 10px;
  border-radius: 2px;
  overflow: hidden;
  background: var(--bg-input);
}
.module-bar span { display: block; height: 100%; border-radius: 2px; min-width: 2px; }
.key-list {
  padding: 6px 12px 10px;
  border-top: 1px dashed var(--border-color);
}
.key-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 5px 0;
}
.key-name {
  min-width: 0;
  font-size: 12px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.key-size {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}
.usage-empty {
  padding: 16px;
  text-align: center;
  font-size: 12px;
  color: var(--text-muted);
}
.protect-hint {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--bg-input);
}
.protect-hint i { margin-top: 2px; color: var(--accent); }

.setting-select {
  width: 100%; padding: 9px 12px; border: 1px solid var(--border-color); border-radius: 8px;
  background: var(--bg-input); color: var(--text-primary); font-size: 13px;
  outline: none; font-family: inherit; box-sizing: border-box;
}
.setting-select:focus { border-color: var(--accent); }

.btn-primary {
  padding: 12px 24px;
  border: none;
  border-radius: 10px;
  background: var(--accent);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-primary:hover {
  background: var(--accent-hover);
}

/* 次要按钮 */
.btn-secondary {
  padding: 9px 14px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.15s;
}
.btn-secondary:hover {
  background: var(--bg-hover);
}

/* 头像上传 */
.avatar-upload {
  display: flex;
  align-items: center;
  gap: 14px;
}
.avatar-preview {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--bg-sidebar);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  overflow: hidden;
  border: 2px dashed var(--border-color);
  transition: border-color 0.2s;
  flex-shrink: 0;
  color: var(--text-muted);
}
.avatar-preview:hover {
  border-color: var(--accent);
}
.avatar-preview-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.avatar-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.avatar-actions .btn-secondary {
  font-size: 12px;
  padding: 6px 14px;
}

/* 外观设置 */
.bg-upload {
  display: flex;
  align-items: center;
  gap: 14px;
}
.bg-preview {
  width: 160px;
  height: 96px;
  flex-shrink: 0;
  border-radius: 10px;
  border: 2px dashed var(--border-color);
  background: var(--bg-sidebar);
  color: var(--text-muted);
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  overflow: hidden;
  transition: border-color 0.2s;
}
.bg-preview:hover { border-color: var(--accent); }

.symbol-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.symbol-rule {
  padding: 8px 10px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-card);
}
.symbol-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.symbol-pair {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.symbol-controls {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}
.color-dot {
  width: 22px;
  height: 22px;
  padding: 0;
  border-radius: 50%;
  border: 1px solid var(--border-color);
  cursor: pointer;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.08);
}
.fmt-btn {
  width: 26px;
  height: 26px;
  padding: 0;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-card);
  color: var(--text-secondary);
  font-size: 12px;
  font-family: inherit;
  font-style: italic;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}
.fmt-btn.bold { font-style: normal; font-weight: 700; }
.fmt-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
.fmt-btn.active {
  border-color: var(--accent);
  background: var(--accent-light);
  color: var(--accent);
}
.fmt-btn.danger:hover {
  border-color: var(--danger);
  background: var(--danger-bg);
  color: var(--danger);
}
.color-palette {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
  padding: 8px;
  border-radius: 8px;
  background: var(--bg-input);
}
.color-swatch {
  width: 24px;
  height: 24px;
  padding: 0;
  border-radius: 50%;
  border: 1px solid var(--border-color);
  cursor: pointer;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.08);
}
.color-swatch.active {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.custom-symbol {
  display: flex;
  gap: 6px;
  margin-top: 14px;
}
.custom-symbol input {
  flex: 1;
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: 12px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.2s;
}
.custom-symbol input:focus { border-color: var(--accent); }
.custom-symbol .btn-secondary {
  flex-shrink: 0;
  font-size: 12px;
  padding: 8px 14px;
}

.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
}
.switch-row span {
  font-size: 13px;
  color: var(--text-primary);
}

.settings-footer {
  padding: 16px 24px;
  border-top: 1px solid var(--border-color);
  display: flex;
  justify-content: flex-end;
  flex-shrink: 0;
}

/* 移动端 */
@media (max-width: 768px) {
  .settings-panel {
    width: 100vw;
    max-width: 100vw;
  }
}
</style>
