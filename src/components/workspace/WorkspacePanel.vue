<template>
  <div class="ws-dock" :class="{ open: isOpen, resizing }" :style="{ '--ws-width': `${panelWidth}px` }">
    <div class="ws-backdrop" @click="close"></div>
    <aside class="ws-panel">
        <div class="ws-resize" title="拖拽调整宽度" @pointerdown.prevent="startResize"></div>
        <div class="ws-header">
          <div class="ws-title">
            <h2>工作区</h2>
            <button
              v-if="status.folderSupported"
              class="view-btn"
              title="挂载或更换本机文件夹，也可改回内置工作区"
              @click="openMountMenu"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
              <span>文件</span>
            </button>
            <button
              class="view-btn"
              :class="{ active: view === 'artifacts' }"
              title="本次任务产物（AI 写入过的文件）"
              @click="switchView(view === 'artifacts' ? 'files' : 'artifacts')"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
              <span>产物</span>
            </button>
            <button
              class="view-btn"
              :class="{ active: view === 'trash' }"
              :title="`回收站（${TRASH_RETENTION_DAYS} 天自动清理）`"
              @click="switchView(view === 'trash' ? 'files' : 'trash')"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              <span>回收站</span>
            </button>
          </div>
          <div class="header-actions">
            <button class="icon-btn" :disabled="zipping" title="把整个工作区打包成 zip 下载" @click="downloadCurrentZip">
              <svg v-if="!zipping" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><line x1="10" y1="12" x2="14" y2="12"/></svg>
              <svg v-else class="spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.22-8.56"/></svg>
            </button>
            <button class="icon-btn" :disabled="readOnly" title="导入文件或 zip 备份到工作区根目录" @click="importInput?.click()">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            </button>
            <button class="icon-btn" title="刷新" @click="refreshAll">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
            </button>
          </div>
          <input ref="importInput" type="file" multiple style="display:none" @change="handleImport" />
        </div>

        <div class="ws-body">
          <div v-if="readOnly" class="ws-banner">
            <span><i class="fa-solid fa-lock"></i> 文件夹授权已失效，当前为只读模式。</span>
            <button class="btn-sm" @click="reauthorize">重新授权</button>
          </div>

          <template v-if="view === 'files'">
            <div v-if="!preview && !diffTarget" class="ws-toolbar">
              <div class="ws-filter">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input
                  v-model="filter"
                  type="text"
                  :placeholder="searchScope === 'content' ? '搜索文件内容…' : '过滤文件…（全工作区）'"
                  spellcheck="false"
                  @input="onFilterInput"
                  @keydown.esc.prevent="clearFilter"
                />
                <button v-if="filter" class="ws-filter-clear" title="清空过滤" @click="clearFilter">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              <div class="ws-scope" title="搜索范围：文件名或文件内容">
                <button
                  v-for="item in SCOPE_OPTIONS"
                  :key="item.key"
                  class="ws-scope-btn"
                  :class="{ on: searchScope === item.key }"
                  @click="setScope(item.key)"
                >{{ item.label }}</button>
              </div>
              <button v-if="!readOnly" class="icon-btn sm" title="用模板新建项目（静态站 / Vue / React）" @click="openTemplateMenu">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>
              </button>
              <button class="icon-btn sm" :disabled="!expanded.size" title="全部折叠" @click="collapseAll">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 11 12 6 7 11"/><polyline points="17 18 12 13 7 18"/></svg>
              </button>
            </div>

            <div class="ws-scroll" :class="{ 'is-surface': preview || diffTarget }" @contextmenu.prevent="openRootMenu">
              <WorkspaceDiff
                v-if="diffTarget"
                class="ws-surface"
                :path="diffTarget.path"
                :name="diffTarget.name"
                :read-only="readOnly"
                @close="closeDiff"
                @restored="onDiffRestored"
              />
              <WorkspaceFileViewer
                v-else-if="preview"
                :key="`${preview.path}:${preview.focusLine || 0}`"
                class="ws-surface"
                :path="preview.path"
                :name="preview.name"
                :entry="preview.entry"
                :focus-line="preview.focusLine"
                :ai-changed="isAiChanged(preview.path)"
                :read-only="readOnly"
                @close="preview = null"
                @diff="openDiffFromViewer"
                @delete="deleteFromViewer"
                @web-preview="openWebPreviewPath"
              />

              <template v-else>
                <template v-if="searchMode">
                  <div v-if="searchError" class="ws-error">
                    <span>{{ searchError }}</span>
                    <button class="btn-sm" @click="runSearch">重试</button>
                  </div>
                  <div v-else-if="searchPending && !searchResults.length" class="ws-skeleton">
                    <span v-for="i in 5" :key="i" :style="{ width: `${45 + ((i * 13) % 45)}%` }"></span>
                  </div>
                  <template v-else-if="!searchResults.length">
                    <div class="ws-empty">
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                      <p>没有匹配「{{ filter }}」的{{ contentMode ? '内容' : '文件' }}</p>
                      <span>{{ contentMode ? '内容搜索只读文本文件，试试更短或更独特的关键词' : '换个关键词试试，只匹配文件名' }}</span>
                    </div>
                  </template>
                  <template v-else>
                    <p class="ws-search-meta">
                      <template v-if="contentMode">命中 {{ hitRows.length }} 行 · {{ searchStats.filesMatched }} 个文件 · 扫描 {{ formatBytes(searchStats.scannedBytes) }}</template>
                      <template v-else>找到 {{ searchResults.length }} 项</template>
                      <template v-if="searchTruncated">（结果过多，仅显示前 {{ contentMode ? hitRows.length : searchResults.length }} 项）</template>
                      <template v-if="contentMode && searchStats.oversizedSkipped">，跳过 {{ searchStats.oversizedSkipped }} 个超大文件</template>
                    </p>
                    <div v-if="contentMode" class="ws-hits">
                      <div
                        v-for="hit in hitRows"
                        :key="hit.key"
                        class="ws-hit"
                        :title="`${hit.path}:${hit.line}`"
                        @click="openHit(hit)"
                      >
                        <div class="ws-hit-head">
                          <span class="ws-hit-name">{{ hit.name }}</span>
                          <span class="ws-hit-dir" :title="hit.path">{{ hit.dir }}</span>
                          <span class="ws-hit-line">:{{ hit.line }}</span>
                        </div>
                        <p class="ws-hit-text">
                          <template v-for="(part, index) in hit.parts" :key="index">
                            <mark v-if="part.hit">{{ part.text }}</mark>
                            <span v-else>{{ part.text }}</span>
                          </template>
                        </p>
                      </div>
                    </div>
                  </template>
                </template>

                <div v-if="!searchMode && treeLoading" class="ws-skeleton">
                  <span v-for="i in 8" :key="i" :style="{ width: `${40 + ((i * 17) % 55)}%` }"></span>
                </div>
                <div v-else-if="!searchMode && treeError" class="ws-error">
                  <span>{{ treeError }}</span>
                  <button class="btn-sm" @click="loadTree">重试</button>
                </div>
                <div v-else-if="!searchMode && !displayRows.length" class="ws-empty">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                  <p>这个工作区是空的</p>
                  <span>右键空白处新建文件，或点右上角导入</span>
                  <div v-if="!readOnly" class="ws-empty-actions">
                    <button class="btn-sm" @click="createFileIn('')">新建文件</button>
                    <button class="btn-sm" @click="createFolderIn('')">新建文件夹</button>
                  </div>
                </div>

                <template v-for="row in displayRows" :key="row.key">
                  <div
                    v-if="row.pseudo"
                    class="ws-pseudo"
                    :style="{ paddingLeft: `${18 + row.depth * 14}px` }"
                  >
                    <span v-if="row.kind === 'loading'">加载中…</span>
                    <span v-else-if="row.kind === 'empty'" class="ws-pseudo-muted">（空目录）</span>
                    <template v-else>
                      <span class="ws-pseudo-error">{{ row.error }}</span>
                      <button class="btn-sm" @click.stop="retryDir(row.path)">重试</button>
                    </template>
                  </div>
                  <div
                    v-else
                    class="ws-node"
                    :class="{ changed: entryChanged(row.path), 'is-ai': isAiChanged(row.path) }"
                    :style="{ paddingLeft: `${5 + row.depth * 14}px` }"
                    @click="onRowClick(row)"
                    @contextmenu.prevent.stop="openRowMenu($event, row)"
                  >
                    <button
                      v-if="row.kind === 'dir'"
                      class="ws-chevron"
                      :class="{ open: expanded.has(row.path) }"
                      :title="expanded.has(row.path) ? '折叠' : '展开'"
                      @click.stop="toggleDir(row.path)"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
                    </button>
                    <span v-else class="ws-chevron placeholder"></span>
                    <svg v-if="row.kind === 'dir'" class="ws-node-icon" :style="{ color: iconColor(row) }" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                    <svg v-else class="ws-node-icon" :style="{ color: iconColor(row) }" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    <span class="ws-node-label">
                      <span class="ws-node-name" :title="row.path">{{ row.name }}{{ row.kind === 'dir' ? '/' : '' }}</span>
                      <span v-if="row.showPath" class="ws-node-path">{{ parentDir(row.path) }}</span>
                    </span>
                    <button
                      v-if="row.kind === 'file' && isAiChanged(row.path)"
                      class="ai-badge"
                      title="查看 AI 刚做的修改"
                      @click.stop="openDiff(row)"
                    >AI 刚改</button>
                    <span v-else-if="isAiChanged(row.path)" class="ai-badge" title="AI 刚修改过这个目录">AI 刚改</span>
                    <span v-if="row.kind === 'file' && row.size != null" class="ws-node-size">{{ formatBytes(row.size) }}</span>
                    <span v-if="row.modified" class="ws-node-time">{{ shortTime(row.modified) }}</span>
                    <button class="ws-node-act" title="更多操作" @click.stop="openRowMenuFromButton($event, row)">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>
                    </button>
                  </div>
                </template>

                <p v-if="!searchMode && rootNode?.truncated" class="ws-truncated">根目录条目过多，仅显示前 {{ rootNode.entries.length }} 项</p>
              </template>
            </div>
          </template>

          <div v-else-if="view === 'trash'" class="ws-scroll">
            <div class="view-intro">
              <button class="btn-sm" @click="switchView('files')">← 文件</button>
              <span class="view-intro-text">删除的文件保留 {{ TRASH_RETENTION_DAYS }} 天，过期自动清理。</span>
              <button v-if="trash.length && !readOnly" class="btn-sm danger" @click="clearTrash">清空</button>
            </div>
            <div v-if="viewLoading" class="ws-empty"><p>加载中…</p></div>
            <div v-else-if="viewError" class="ws-error">
              <span>{{ viewError }}</span>
              <button class="btn-sm" @click="loadTrash">重试</button>
            </div>
            <div v-else-if="!trash.length" class="ws-empty">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              <p>回收站是空的</p>
              <span>删除的文件会出现在这里，可随时恢复</span>
            </div>
            <template v-else>
              <div v-for="item in trash" :key="item.name" class="ws-item static">
                <svg v-if="item.kind === 'dir'" class="ws-item-icon dir" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                <svg v-else class="ws-item-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                <div class="ws-item-main">
                  <span class="ws-item-name">{{ item.originalName }}</span>
                  <span class="ws-item-sub" :title="item.path">{{ item.path }} · {{ formatTime(item.at) }}</span>
                </div>
                <span v-if="item.size != null" class="ws-item-size">{{ formatBytes(item.size) }}</span>
                <button class="btn-sm" :disabled="readOnly" @click="restoreEntry(item)">恢复</button>
                <button class="ws-item-del always" :disabled="readOnly" title="永久删除" @click="purgeEntry(item)">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            </template>
          </div>

          <div v-else-if="view === 'artifacts'" class="ws-scroll">
            <div class="view-intro">
              <button class="btn-sm" @click="switchView('files')">← 文件</button>
              <span class="view-intro-text">本次任务中 AI 写入或修改过的文件，删除过的自动剔除。</span>
              <button v-if="artifacts.length" class="btn-sm" :disabled="zippingArtifacts" @click="downloadArtifacts">
                {{ zippingArtifacts ? '打包中…' : '一键打包' }}
              </button>
            </div>
            <div v-if="!artifacts.length" class="ws-empty">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
              <p>本次任务还没有产物</p>
              <span>让 AI 在工作模式下写文件后，这里会汇总它产出的文件</span>
            </div>
            <template v-else>
              <div
                v-for="item in artifacts"
                :key="item.path"
                class="artifact-row"
                @click="openArtifact(item)"
              >
                <svg class="ws-node-icon" :style="{ color: iconColor({ kind: 'file', name: item.path }) }" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                <div class="artifact-main">
                  <span class="ws-node-name">{{ artifactName(item.path) }}</span>
                  <span class="ws-node-path" :title="item.path">{{ item.path }}</span>
                </div>
                <span class="artifact-action">{{ actionLabel(item.action) }}</span>
                <span class="ws-node-time">{{ shortTime(item.at) }}</span>
              </div>
            </template>
          </div>

          <div v-else class="ws-scroll">
            <div class="view-intro">
              <button class="btn-sm" @click="switchView('files')">← 文件</button>
              <span class="view-intro-text">覆盖写前自动备份，每个文件保留最近 5 版。</span>
              <button v-if="historyFilter" class="btn-sm" title="显示全部文件的版本" @click="historyFilter = ''">清除筛选</button>
            </div>
            <div v-if="historyFilter" class="history-filter" :title="historyFilter">仅看：{{ historyFilter }}</div>
            <div v-if="viewLoading" class="ws-empty"><p>加载中…</p></div>
            <div v-else-if="viewError" class="ws-error">
              <span>{{ viewError }}</span>
              <button class="btn-sm" @click="loadHistory">重试</button>
            </div>
            <div v-else-if="!historyGroups.length" class="ws-empty">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg>
              <p>还没有历史版本</p>
              <span>AI 覆盖或修改已有文件后，旧版本会自动出现在这里</span>
            </div>
            <template v-else>
              <div v-for="group in historyGroups" :key="group.path" class="history-group">
                <button class="history-path" :title="group.path" @click="openPreviewFromPath(group.path)">{{ group.path }}</button>
                <div v-for="version in group.versions" :key="version.file" class="history-version">
                  <span class="history-time">{{ formatTime(version.at) }}</span>
                  <span class="ws-item-size">{{ formatBytes(version.size) }}</span>
                  <button class="btn-sm" :disabled="readOnly" @click="restoreVersion(version)">恢复</button>
                  <button class="btn-sm" @click="downloadVersion(version)">下载</button>
                </div>
              </div>
            </template>
          </div>
        </div>

        <div class="ws-status">
          <span class="status-mode" :class="{ warn: readOnly }">
            <i class="status-dot"></i>
            {{ statusText }}
          </span>
          <span v-if="aiWriteText" class="status-ai" :title="aiWriteTitle">AI 写入 {{ aiWriteText }}</span>
          <span class="status-usage" :title="usageTitle">{{ usageText }}</span>
          <span v-if="usageWarn" class="status-warn" title="浏览器存储接近上限，建议打包导出后清理工作区">占用 {{ usagePercent }}%，建议导出 zip 备份</span>
        </div>
    </aside>
  </div>

  <!-- :key 让换页时整份重建：currentPath 只在挂载时从 props 取一次，复用实例会停在上一个页面 -->
  <WorkspacePreview
    v-if="webPreview"
    :key="webPreview.path"
    :path="webPreview.path"
    :name="webPreview.name"
    @close="webPreview = null"
  />
</template>

<script setup>
import { defineAsyncComponent } from 'vue'
import WorkspacePreview from './WorkspacePreview.vue'
import WorkspaceDiff from './WorkspaceDiff.vue'
import { formatBytes } from '../../services/workspace'
import { useWorkspacePanel } from './useWorkspacePanel'

// 查看器体积较大且只在打开文件时需要，按需加载
const WorkspaceFileViewer = defineAsyncComponent(() => import('./WorkspaceFileViewer.vue'))
const TRASH_RETENTION_DAYS = 30

const {
  isOpen, resizing, panelWidth, status, importInput, webPreview, zipping, view, trash,
  historyFilter, viewLoading, viewError, preview, diffTarget, artifacts,
  zippingArtifacts, readOnly, historyGroups, usagePercent, usageWarn,
  statusText, usageText, usageTitle, aiWriteText, aiWriteTitle, toggle, open, close, isPanelOpen,
  startResize, refreshAll, switchView, loadTrash, loadHistory,
  reauthorize, openPreviewFromPath, openArtifact, downloadArtifacts,
  openWebPreviewPath, downloadCurrentZip,
  openRowMenu, openRowMenuFromButton, openRootMenu, openMountMenu, openTemplateMenu,
  createFileIn, createFolderIn,
  restoreEntry, purgeEntry, clearTrash, restoreVersion, downloadVersion,
  handleImport, filter, searchScope, searchPending, searchResults, searchTruncated, searchError,
  searchStats, expanded, searchMode, contentMode, rootNode, treeLoading, treeError,
  hitRows, displayRows, SCOPE_OPTIONS, onFilterInput, setScope, toggleDir, retryDir, collapseAll,
  loadTree, runSearch, clearFilter, onRowClick, openHit, openDiff,
  openDiffFromViewer, closeDiff, onDiffRestored, deleteFromViewer, isAiChanged, entryChanged,
  iconColor, parentDir, artifactName, actionLabel, shortTime, formatTime,
} = useWorkspacePanel()

defineExpose({ toggle, open, close, isPanelOpen })
</script>

<style src="./WorkspacePanel.css"></style>
