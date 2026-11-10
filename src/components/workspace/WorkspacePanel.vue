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

  <WorkspacePreview
    v-if="webPreview"
    :path="webPreview.path"
    :name="webPreview.name"
    @close="webPreview = null"
  />
</template>

<script setup>
import { computed, defineAsyncComponent, onMounted, onUnmounted, reactive, ref } from 'vue'
import WorkspacePreview from './WorkspacePreview.vue'
import WorkspaceDiff from './WorkspaceDiff.vue'
// 查看器体积较大且只在打开文件时需要，按需加载
const WorkspaceFileViewer = defineAsyncComponent(() => import('./WorkspaceFileViewer.vue'))
import {
  getWorkspaceStatus, pickWorkspaceFolder, clearWorkspaceFolder, ensureWorkspacePermission,
  listDir, searchWorkspace, searchFiles, deletePath, getFileBlob, writeBlob, writeFile, statFile, makeDir,
  renamePath, zipDirectory, zipFiles, importZip, formatBytes, sanitizeFileName,
  listTrash, restoreTrash, purgeTrash, emptyTrash, cleanupTrash,
  listHistory, getHistoryText, restoreHistory, getWorkspaceUsage,
} from '../../services/workspace'
import { splitByRange } from '../../utils/textSearch'
import { getTaskArtifacts, isAiTouched, latestAiWriteAt } from '../../services/workspaceActivity'

const TRASH_RETENTION_DAYS = 30
const PANEL_WIDTH_KEY = 'xiyue_workspace_width'
const EXPANDED_KEY = 'xiyue_workspace_expanded_v1'
const MAX_EXPANDED = 60
const SCOPE_OPTIONS = [
  { key: 'name', label: '名称' },
  { key: 'content', label: '内容' },
]
const ACTION_LABEL = {
  write: '写入', edit: '修改', append: '追加', mkdir: '新建目录',
  rename: '重命名', move: '移动', copy: '复制', delete: '删除',
}
const EXT_COLORS = {
  js: '#e8c547', mjs: '#e8c547', cjs: '#e8c547', jsx: '#61dafb',
  ts: '#4f9fe0', tsx: '#4f9fe0', json: '#c9b458', jsonc: '#c9b458',
  html: '#e34c26', htm: '#e34c26', vue: '#41b883',
  css: '#9b7fd4', scss: '#cd6799', less: '#6f8fd8',
  md: '#519aba', markdown: '#519aba',
  py: '#4f9fe0', go: '#00add8', rs: '#dea584', java: '#d07a5e',
  c: '#8a8a8a', h: '#8a8a8a', cpp: '#f34b7d', cs: '#7bc596',
  php: '#8a8fd0', rb: '#d05d6a', sh: '#89e051', bash: '#89e051',
  yml: '#cb6b71', yaml: '#cb6b71', sql: '#e38c00',
  svg: '#ffb13b', png: '#a074c4', jpg: '#a074c4', jpeg: '#a074c4',
  gif: '#a074c4', webp: '#a074c4', avif: '#a074c4', ico: '#a074c4',
  pdf: '#e5252a', csv: '#89e051', tsv: '#89e051', zip: '#b8a15e',
}

function loadPanelWidth() {
  const saved = Number(localStorage.getItem(PANEL_WIDTH_KEY))
  return Number.isFinite(saved) && saved >= 340 && saved <= 760 ? saved : 420
}

function loadExpanded() {
  try {
    const saved = JSON.parse(localStorage.getItem(EXPANDED_KEY) || '[]')
    return Array.isArray(saved)
      ? saved.filter(item => typeof item === 'string' && item).slice(0, MAX_EXPANDED)
      : []
  } catch {
    return []
  }
}

const isOpen = ref(false)
const resizing = ref(false)
const panelWidth = ref(loadPanelWidth())
const status = ref({ mode: 'opfs', folderName: '', permission: null, folderSupported: false, opfsSupported: true })
const importInput = ref(null)
const webPreview = ref(null)
const zipping = ref(false)
const view = ref('files')
const trash = ref([])
const historyAll = ref([])
const historyFilter = ref('')
const viewLoading = ref(false)
const viewError = ref('')
const usage = ref(null)
const changedPath = ref('')

const preview = ref(null)
const diffTarget = ref(null)

const filter = ref('')
const searchScope = ref('name')
const searchPending = ref(false)
const searchResults = ref([])
const searchTruncated = ref(false)
const searchError = ref('')
const searchStats = ref({ filesMatched: 0, scannedBytes: 0, oversizedSkipped: 0 })

const treeNodes = reactive(new Map())
const expanded = reactive(new Set(loadExpanded()))

const artifacts = ref([])
const lastAiWriteAt = ref(0)
const activityTick = ref(0)
const zippingArtifacts = ref(false)

const readOnly = computed(() => status.value.mode === 'folder' && status.value.permission !== 'granted')
const historyGroups = computed(() => historyFilter.value
  ? historyAll.value.filter(group => group.path === historyFilter.value)
  : historyAll.value)
const usagePercent = computed(() => {
  if (!usage.value?.quota) return 0
  return Math.min(100, Math.round((usage.value.usage / usage.value.quota) * 100))
})
const usageWarn = computed(() => usagePercent.value >= 85)
const statusText = computed(() => {
  if (status.value.mode === 'folder') {
    return readOnly.value ? `只读 · ${status.value.folderName || '本机文件夹'}` : `本机文件夹 · ${status.value.folderName}`
  }
  return '浏览器内置工作区'
})
const usageText = computed(() => {
  if (!usage.value) return ''
  const files = `${usage.value.files}${usage.value.files >= 5000 ? '+' : ''} 个文件`
  const size = formatBytes(usage.value.bytes)
  if (!usage.value.quota) return `${files} · ${size}`
  return `${files} · ${size} · 存储 ${formatBytes(usage.value.usage)} / ${formatBytes(usage.value.quota)}`
})
const usageTitle = computed(() => usage.value
  ? `工作区文件 ${usage.value.files} 个，共 ${formatBytes(usage.value.bytes)}；浏览器存储占用 ${formatBytes(usage.value.usage)}，配额 ${formatBytes(usage.value.quota)}`
  : '')
const aiWriteText = computed(() => {
  if (activityTick.value < 0 || !lastAiWriteAt.value) return ''
  return timeAgo(lastAiWriteAt.value)
})
const aiWriteTitle = computed(() => lastAiWriteAt.value
  ? `最近一次 AI 写入：${formatTime(lastAiWriteAt.value)}`
  : '')

const searchMode = computed(() => !!filter.value.trim())
const contentMode = computed(() => searchMode.value && searchScope.value === 'content')
const rootNode = computed(() => treeNodes.get(''))
const treeLoading = computed(() => {
  const node = rootNode.value
  return !node || (node.loading && !node.loaded)
})
const treeError = computed(() => rootNode.value?.error || '')

const flatRows = computed(() => {
  const rows = []
  const walk = (path, depth) => {
    const node = treeNodes.get(path)
    if (!node) return
    if (node.loading && !node.loaded) {
      if (path) rows.push({ key: `loading:${path}`, kind: 'loading', pseudo: true, depth, path })
      return
    }
    if (node.error) {
      rows.push({ key: `error:${path}`, kind: 'error', pseudo: true, depth, path, error: node.error })
      return
    }
    if (node.loaded && !node.entries.length) {
      if (path) rows.push({ key: `empty:${path}`, kind: 'empty', pseudo: true, depth, path })
      return
    }
    for (const entry of node.entries) {
      const childPath = path ? `${path}/${entry.name}` : entry.name
      rows.push({
        key: childPath,
        path: childPath,
        name: entry.name,
        kind: entry.kind,
        depth,
        size: entry.size,
        modified: entry.modified,
        showPath: false,
        pseudo: false,
      })
      if (entry.kind === 'dir' && expanded.has(childPath)) walk(childPath, depth + 1)
    }
  }
  walk('', 0)
  return rows
})

const searchRows = computed(() => searchResults.value.map(item => ({
  key: `s:${item.path}`,
  path: item.path,
  name: item.name,
  kind: item.kind,
  depth: 0,
  size: item.size,
  modified: item.modified,
  showPath: true,
  pseudo: false,
})))
const hitRows = computed(() => searchResults.value.map(item => ({
  key: `${item.path}:${item.line}`,
  path: item.path,
  name: artifactName(item.path),
  dir: shortDir(item.path),
  line: item.line,
  parts: splitByRange(item.text, item.range),
})))
// 内容命中用自己的行渲染，通用节点循环只在名称模式/目录树时出力
const displayRows = computed(() => {
  if (searchMode.value) return contentMode.value ? [] : searchRows.value
  return flatRows.value
})

let changeTimer = null
let highlightTimer = null
let usageTimer = null
let filterTimer = null
let activityTimer = null

function toggle() {
  if (isOpen.value) close()
  else open()
}

async function open() {
  isOpen.value = true
  preview.value = null
  diffTarget.value = null
  view.value = 'files'
  historyFilter.value = ''
  changedPath.value = ''
  filter.value = ''
  searchResults.value = []
  searchTruncated.value = false
  searchError.value = ''
  await refreshStatus()
  if (status.value.mode === 'folder' && status.value.permission !== 'granted') {
    const result = await ensureWorkspacePermission()
    if (!result.ok) window.__ui?.showToast(result.message || '文件夹授权失败', 'error', 4200)
    await refreshStatus()
  }
  await loadTree()
  refreshActivity()
  refreshUsage()
  cleanupTrash()
    .then(result => {
      if (result?.removed) {
        window.__ui?.showToast(`已自动清理 ${result.removed} 个超过 ${TRASH_RETENTION_DAYS} 天的回收站条目`, 'info', 3600)
      }
    })
    .catch(() => {})
}

function close() {
  isOpen.value = false
  preview.value = null
  diffTarget.value = null
  webPreview.value = null
}

function isPanelOpen() {
  return isOpen.value
}

function startResize(event) {
  if (window.innerWidth <= 1024) return
  const startX = event.clientX
  const startWidth = panelWidth.value
  resizing.value = true
  // 合并到每帧一次，避免高频 pointermove 造成掉帧
  let frame = 0
  let lastX = startX
  const apply = () => {
    frame = 0
    panelWidth.value = Math.round(Math.max(340, Math.min(760, startWidth + startX - lastX)))
  }
  const onMove = moveEvent => {
    lastX = moveEvent.clientX
    if (!frame) frame = requestAnimationFrame(apply)
  }
  const onUp = () => {
    if (frame) {
      cancelAnimationFrame(frame)
      apply()
    }
    document.removeEventListener('pointermove', onMove)
    document.removeEventListener('pointerup', onUp)
    document.removeEventListener('pointercancel', onUp)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    resizing.value = false
    try { localStorage.setItem(PANEL_WIDTH_KEY, String(panelWidth.value)) } catch { /* ignore */ }
  }
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  document.addEventListener('pointermove', onMove)
  document.addEventListener('pointerup', onUp)
  document.addEventListener('pointercancel', onUp)
}

function onKeydown(event) {
  if (event.ctrlKey || event.metaKey) return
  if (event.altKey && event.shiftKey && event.code === 'KeyW') {
    event.preventDefault()
    toggle()
  }
}

defineExpose({ toggle, open, close, isPanelOpen })

async function refreshStatus() {
  try {
    status.value = await getWorkspaceStatus()
  } catch {
    // 状态读取失败时保持上次结果
  }
}

function reportError(err, fallback) {
  window.__ui?.showToast(err?.message || fallback, 'error', 4200)
}

function toastReadOnly() {
  window.__ui?.showToast('授权已失效，当前为只读模式', 'error', 3200)
}

async function refreshUsage() {
  try {
    usage.value = await getWorkspaceUsage()
  } catch {
    // 统计失败不影响文件操作
  }
}

function scheduleUsageRefresh() {
  clearTimeout(usageTimer)
  usageTimer = setTimeout(refreshUsage, 900)
}

function refreshActivity() {
  artifacts.value = getTaskArtifacts()
  lastAiWriteAt.value = latestAiWriteAt()
  activityTick.value += 1
}

function persistExpanded() {
  try { localStorage.setItem(EXPANDED_KEY, JSON.stringify([...expanded].slice(0, MAX_EXPANDED))) } catch { /* ignore */ }
}

function getNode(path) {
  let node = treeNodes.get(path)
  if (!node) {
    treeNodes.set(path, { entries: [], loaded: false, loading: false, truncated: false, error: '' })
    // 取回 reactive 代理，直接改原始对象不会触发视图更新
    node = treeNodes.get(path)
  }
  return node
}

async function ensureChildren(path, { force = false } = {}) {
  const node = getNode(path)
  if (node.loading) return
  if (node.loaded && !force) return
  node.loading = true
  node.error = ''
  try {
    const result = await listDir(path)
    node.entries = [...result.entries].sort((a, b) => (
      a.kind === b.kind ? a.name.localeCompare(b.name, 'zh') : a.kind === 'dir' ? -1 : 1
    ))
    node.truncated = result.truncated
    node.loaded = true
  } catch (err) {
    node.entries = []
    node.truncated = false
    node.loaded = false
    node.error = err?.message || '读取目录失败'
    await refreshStatus()
  } finally {
    node.loading = false
  }
}

function dropSubtree(path) {
  if (!path) return
  for (const key of [...treeNodes.keys()]) {
    if (key === path || key.startsWith(`${path}/`)) treeNodes.delete(key)
  }
}

function purgeExpanded(path) {
  let dirty = false
  for (const item of [...expanded]) {
    if (item === path || item.startsWith(`${path}/`)) {
      expanded.delete(item)
      dirty = true
    }
  }
  if (dirty) persistExpanded()
}

function migratePathState(from, to) {
  let dirty = false
  const next = []
  for (const item of [...expanded]) {
    if (item === from) {
      next.push(to)
      dirty = true
    } else if (item.startsWith(`${from}/`)) {
      next.push(to + item.slice(from.length))
      dirty = true
    } else {
      next.push(item)
    }
  }
  if (dirty) {
    expanded.clear()
    next.slice(0, MAX_EXPANDED).forEach(item => expanded.add(item))
    persistExpanded()
  }
  dropSubtree(from)
}

async function restoreExpanded() {
  const paths = [...expanded].sort((a, b) => a.split('/').length - b.split('/').length)
  for (const path of paths) {
    if (treeNodes.get(path)?.loaded) continue
    await ensureChildren(path)
    if (treeNodes.get(path)?.error) {
      expanded.delete(path)
      persistExpanded()
    }
  }
}

async function loadTree() {
  treeNodes.clear()
  await ensureChildren('', { force: true })
  if (!rootNode.value?.error) await restoreExpanded()
}

function toggleDir(path) {
  if (expanded.has(path)) {
    expanded.delete(path)
    persistExpanded()
    return
  }
  if (expanded.size >= MAX_EXPANDED) {
    window.__ui?.showToast(`最多同时展开 ${MAX_EXPANDED} 个目录`, 'info', 2800)
    return
  }
  expanded.add(path)
  persistExpanded()
  ensureChildren(path)
}

function retryDir(path) {
  if (!expanded.has(path) && expanded.size < MAX_EXPANDED) {
    expanded.add(path)
    persistExpanded()
  }
  ensureChildren(path, { force: true })
}

function collapseAll() {
  expanded.clear()
  persistExpanded()
}

async function refreshTreePath(path) {
  if (!path || !treeNodes.size) {
    await loadTree()
    return
  }
  const slash = path.lastIndexOf('/')
  const parent = slash >= 0 ? path.slice(0, slash) : ''
  dropSubtree(path)
  if (treeNodes.has(parent)) await ensureChildren(parent, { force: true })
  else if (!treeNodes.has('')) await loadTree()
}

async function refreshAfterDelete(path) {
  purgeExpanded(path)
  await refreshTreePath(path)
}

async function revealPath(path) {
  const segments = String(path || '').split('/').filter(Boolean)
  const dirs = segments.slice(0, -1)
  for (let i = 0; i < dirs.length; i += 1) {
    const dirPath = dirs.slice(0, i + 1).join('/')
    if (!expanded.has(dirPath)) {
      if (expanded.size >= MAX_EXPANDED) break
      expanded.add(dirPath)
    }
    await ensureChildren(dirPath)
  }
  persistExpanded()
}

async function revealInTree(path) {
  clearFilter()
  expanded.add(path)
  persistExpanded()
  await ensureChildren(path)
}

function onFilterInput() {
  clearTimeout(filterTimer)
  searchError.value = ''
  if (!filter.value.trim()) {
    searchResults.value = []
    searchTruncated.value = false
    searchPending.value = false
    return
  }
  searchPending.value = true
  filterTimer = setTimeout(runSearch, searchScope.value === 'content' ? 380 : 220)
}

function setScope(scope) {
  if (searchScope.value === scope) return
  searchScope.value = scope
  searchResults.value = []
  searchTruncated.value = false
  searchError.value = ''
  searchStats.value = { filesMatched: 0, scannedBytes: 0, oversizedSkipped: 0 }
  clearTimeout(filterTimer)
  if (filter.value.trim()) {
    searchPending.value = true
    runSearch()
  }
}

async function runSearch() {
  const keyword = filter.value.trim()
  const scope = searchScope.value
  if (!keyword) return
  searchPending.value = true
  searchError.value = ''
  const fresh = () => filter.value.trim() === keyword && searchScope.value === scope
  try {
    if (scope === 'content') {
      const result = await searchFiles({ query: keyword, ignoreCase: true })
      if (!fresh()) return
      searchResults.value = result.results
      searchTruncated.value = result.truncated
      searchStats.value = {
        filesMatched: result.filesMatched,
        scannedBytes: result.scannedBytes,
        oversizedSkipped: result.oversizedSkipped,
      }
    } else {
      const result = await searchWorkspace(keyword)
      if (!fresh()) return
      searchResults.value = result.results
      searchTruncated.value = result.truncated
    }
  } catch (err) {
    if (fresh()) searchError.value = err?.message || '搜索失败'
  } finally {
    if (fresh()) searchPending.value = false
  }
}

function clearFilter() {
  filter.value = ''
  clearTimeout(filterTimer)
  searchResults.value = []
  searchTruncated.value = false
  searchPending.value = false
  searchError.value = ''
  searchStats.value = { filesMatched: 0, scannedBytes: 0, oversizedSkipped: 0 }
}

function onRowClick(row) {
  if (row.pseudo) return
  if (row.kind === 'dir') {
    if (searchMode.value) revealInTree(row.path)
    else toggleDir(row.path)
    return
  }
  openFile(row)
}

function openFile(row) {
  preview.value = {
    path: row.path,
    name: row.name,
    entry: { size: row.size, modified: row.modified },
  }
}

function openHit(hit) {
  preview.value = { path: hit.path, name: hit.name, entry: null, focusLine: hit.line }
}

function openDiff(row) {
  diffTarget.value = { path: row.path, name: row.name, fromViewer: false }
  preview.value = null
}

function openDiffFromViewer(path) {
  diffTarget.value = { path, name: String(path).split('/').pop() || '', fromViewer: true }
}

function closeDiff() {
  diffTarget.value = null
}

function onDiffRestored(path) {
  refreshTreePath(path)
}

async function deleteFromViewer(path, name) {
  const label = name || String(path).split('/').pop() || path
  if (await removePath(path, label)) {
    preview.value = null
    diffTarget.value = null
    await refreshAfterDelete(path)
  }
}

function isAiChanged(path) {
  return activityTick.value >= 0 && isAiTouched(path)
}

function entryChanged(path) {
  if (!changedPath.value) return false
  return changedPath.value === path || changedPath.value.startsWith(`${path}/`)
}

function iconColor(row) {
  if (row.kind === 'dir') return 'var(--accent)'
  const ext = String(row.name).split('.').pop()?.toLowerCase() || ''
  return EXT_COLORS[ext] || 'var(--text-muted)'
}

function parentDir(path) {
  const index = String(path).lastIndexOf('/')
  return index > 0 ? String(path).slice(0, index) : '工作区根目录'
}

/** 面板很窄，长路径只保留最后两级，前面用 … 提示还有更上层 */
function shortDir(path) {
  const dir = parentDir(path)
  if (dir === '工作区根目录') return dir
  const segments = dir.split('/')
  return segments.length > 2 ? `…/${segments.slice(-2).join('/')}/` : `${dir}/`
}

function artifactName(path) {
  return String(path).split('/').pop() || path
}

function actionLabel(action) {
  return ACTION_LABEL[action] || action
}

function timeAgo(at) {
  const diff = Date.now() - Number(at || 0)
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  return shortTime(at)
}

function shortTime(at) {
  if (!at) return ''
  const date = new Date(Number(at))
  if (Number.isNaN(date.getTime())) return ''
  const pad = n => String(n).padStart(2, '0')
  const now = new Date()
  if (date.toDateString() === now.toDateString()) return `${pad(date.getHours())}:${pad(date.getMinutes())}`
  if (date.getFullYear() === now.getFullYear()) return `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`
}

async function refreshAll() {
  await refreshStatus()
  if (view.value === 'trash') await loadTrash()
  else if (view.value === 'history') await loadHistory()
  else if (view.value === 'artifacts') refreshActivity()
  else {
    if (searchMode.value) await runSearch()
    await loadTree()
  }
  refreshUsage()
}

async function switchView(next) {
  if (view.value === next) return
  view.value = next
  preview.value = null
  diffTarget.value = null
  viewError.value = ''
  historyFilter.value = ''
  if (next === 'trash') await loadTrash()
  else if (next === 'history') await loadHistory()
  else if (next === 'artifacts') refreshActivity()
  else {
    clearFilter()
    await loadTree()
  }
}

async function loadTrash() {
  viewLoading.value = true
  viewError.value = ''
  try {
    trash.value = await listTrash()
  } catch (err) {
    trash.value = []
    viewError.value = err?.message || '读取回收站失败'
  } finally {
    viewLoading.value = false
  }
}

async function loadHistory() {
  viewLoading.value = true
  viewError.value = ''
  try {
    historyAll.value = await listHistory()
    if (historyFilter.value && !historyAll.value.some(group => group.path === historyFilter.value)) {
      historyFilter.value = ''
    }
  } catch (err) {
    historyAll.value = []
    viewError.value = err?.message || '读取历史版本失败'
  } finally {
    viewLoading.value = false
  }
}

async function reauthorize() {
  const result = await ensureWorkspacePermission()
  await refreshStatus()
  if (!result.ok) {
    reportError(result, '重新授权失败')
    return
  }
  window.__ui?.showToast('文件夹授权已恢复', 'success')
  await refreshAll()
}

async function openPreviewFromPath(path) {
  view.value = 'files'
  clearFilter()
  preview.value = { path, name: String(path).split('/').pop() || path, entry: null }
  await revealPath(path)
}

async function openHistoryFor(path) {
  view.value = 'history'
  preview.value = null
  diffTarget.value = null
  historyFilter.value = String(path || '')
  viewError.value = ''
  await loadHistory()
}

async function openArtifact(item) {
  if (item.action === 'mkdir') {
    view.value = 'files'
    await revealInTree(item.path)
    return
  }
  view.value = 'files'
  await revealPath(item.path)
  preview.value = { path: item.path, name: artifactName(item.path), entry: null }
}

async function downloadArtifacts() {
  if (!artifacts.value.length || zippingArtifacts.value) return
  zippingArtifacts.value = true
  try {
    const result = await zipFiles(
      artifacts.value.map(item => item.path),
      `任务产物-${formatStamp(Date.now())}.zip`
    )
    saveBlob(result.blob, result.name)
    window.__ui?.showToast(`已打包 ${result.files} 个文件（${formatBytes(result.bytes)}）`, 'success')
  } catch (err) {
    reportError(err, '打包任务产物失败')
  } finally {
    zippingArtifacts.value = false
  }
}

function openWebPreviewPath(path, name) {
  webPreview.value = { path, name }
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = sanitizeFileName(filename)
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

async function downloadZip(path) {
  if (zipping.value) return
  zipping.value = true
  try {
    const result = await zipDirectory(path)
    saveBlob(result.blob, result.name)
    window.__ui?.showToast(`已打包 ${result.files} 个文件（${formatBytes(result.bytes)}）`, 'success')
  } catch (err) {
    reportError(err, '打包失败')
  } finally {
    zipping.value = false
  }
}

function downloadCurrentZip() {
  return downloadZip('')
}

async function downloadFileByPath(path, name) {
  try {
    const file = await getFileBlob(path)
    saveBlob(file, name || path.split('/').pop() || 'file')
  } catch (err) {
    reportError(err, '下载失败')
  }
}

async function copyPath(path) {
  try {
    await navigator.clipboard.writeText(path)
    window.__ui?.showToast(`已复制路径 ${path}`, 'success', 2400)
  } catch {
    window.__ui?.showToast('复制失败，请检查剪贴板权限', 'error', 3200)
  }
}

function rowMenuItems(row) {
  const items = []
  if (row.kind === 'dir') {
    items.push({
      label: searchMode.value ? '打开' : (expanded.has(row.path) ? '折叠' : '展开'),
      action: () => onRowClick(row),
    })
    if (!readOnly.value) {
      items.push({ label: '新建文件…', action: () => createFileIn(row.path) })
      items.push({ label: '新建文件夹…', action: () => createFolderIn(row.path) })
    }
    items.push({ label: '打包下载', action: () => downloadZip(row.path) })
    items.push({ label: '复制路径', action: () => copyPath(row.path) })
    if (!readOnly.value) {
      items.push({ label: '重命名…', action: () => renameNode(row) })
      items.push({ label: '删除', action: () => deleteRow(row) })
    }
    return items
  }
  items.push({ label: '打开', action: () => openFile(row) })
  if (isAiChanged(row.path)) items.push({ label: '查看 AI 修改', action: () => openDiff(row) })
  items.push({ label: '历史版本', action: () => openHistoryFor(row.path) })
  if (/\.html?$/i.test(row.name)) {
    items.push({ label: '网页预览', action: () => openWebPreviewPath(row.path, row.name) })
  }
  items.push({ label: '复制路径', action: () => copyPath(row.path) })
  items.push({ label: '下载', action: () => downloadFileByPath(row.path, row.name) })
  if (!readOnly.value) {
    items.push({ label: '重命名…', action: () => renameNode(row) })
    items.push({ label: '删除', action: () => deleteRow(row) })
  }
  return items
}

function openRowMenu(event, row) {
  if (row.pseudo) {
    openRootMenu(event)
    return
  }
  window.__ui?.showMenu(event.clientX, event.clientY, rowMenuItems(row))
}

function openRowMenuFromButton(event, row) {
  const rect = event.currentTarget.getBoundingClientRect()
  window.__ui?.showMenu(rect.right - 170, rect.bottom + 4, rowMenuItems(row))
}

function openRootMenu(event) {
  const items = []
  if (!readOnly.value) {
    items.push({ label: '新建文件…', action: () => createFileIn('') })
    items.push({ label: '新建文件夹…', action: () => createFolderIn('') })
  }
  items.push({ label: '刷新', action: refreshAll })
  items.push({ label: '全部折叠', action: collapseAll })
  items.push({ label: '打包下载工作区', action: () => downloadZip('') })
  window.__ui?.showMenu(event.clientX, event.clientY, items)
}

function openMountMenu(event) {
  const items = status.value.mode === 'folder'
    ? [
        { label: '更换文件夹…', action: chooseFolder },
        { label: '改回内置工作区', action: unmountFolder },
      ]
    : [{ label: '选择本机文件夹…', action: chooseFolder }]
  const rect = event.currentTarget.getBoundingClientRect()
  window.__ui?.showMenu(rect.left, rect.bottom + 4, items)
}

function cleanRelativeName(input) {
  return String(input || '')
    .split('/')
    .map(seg => sanitizeFileName(seg, ''))
    .filter(seg => seg && seg !== '.' && seg !== '..')
    .join('/')
}

async function createFileIn(dir) {
  if (readOnly.value) {
    toastReadOnly()
    return
  }
  const input = await window.__ui?.showPrompt(`在「${dir || '工作区根目录'}」新建文件`, {
    placeholder: '例如 notes.md 或 sub/notes.md',
    confirmText: '新建',
  })
  if (!input) return
  const rel = cleanRelativeName(input)
  if (!rel) {
    window.__ui?.showToast('文件名不合法', 'error', 3200)
    return
  }
  const path = dir ? `${dir}/${rel}` : rel
  try {
    const exists = await statFile(path)
    if (exists.exists) {
      window.__ui?.showToast(`「${path}」已存在`, 'error', 3200)
      return
    }
    await writeFile(path, '')
    await revealPath(path)
    window.__ui?.showToast(`已创建 ${path}`, 'success', 2600)
    preview.value = { path, name: path.split('/').pop(), entry: { size: 0, modified: Date.now() } }
  } catch (err) {
    reportError(err, '新建文件失败')
  }
}

async function createFolderIn(dir) {
  if (readOnly.value) {
    toastReadOnly()
    return
  }
  const input = await window.__ui?.showPrompt(`在「${dir || '工作区根目录'}」新建文件夹`, {
    placeholder: '例如 assets 或 pages/blog',
    confirmText: '新建',
  })
  if (!input) return
  const rel = cleanRelativeName(input)
  if (!rel) {
    window.__ui?.showToast('文件夹名不合法', 'error', 3200)
    return
  }
  const path = dir ? `${dir}/${rel}` : rel
  try {
    await makeDir(path)
    const segments = path.split('/')
    for (let i = 0; i < segments.length; i += 1) {
      const dirPath = segments.slice(0, i + 1).join('/')
      if (!expanded.has(dirPath) && expanded.size < MAX_EXPANDED) expanded.add(dirPath)
      await ensureChildren(dirPath, { force: true })
    }
    persistExpanded()
    window.__ui?.showToast(`已创建 ${path}/`, 'success', 2600)
  } catch (err) {
    reportError(err, '新建文件夹失败')
  }
}

async function renameNode(row) {
  if (readOnly.value) {
    toastReadOnly()
    return
  }
  const input = await window.__ui?.showPrompt(`重命名「${row.name}」`, {
    value: row.name,
    confirmText: '重命名',
  })
  if (!input) return
  const target = sanitizeFileName(input)
  if (!target || target === row.name) return
  try {
    const result = await renamePath(row.path, target)
    migratePathState(row.path, result.path)
    if (preview.value?.path === row.path) {
      preview.value = { ...preview.value, path: result.path, name: target }
    } else if (preview.value?.path?.startsWith(`${row.path}/`)) {
      const suffix = preview.value.path.slice(row.path.length)
      preview.value = { ...preview.value, path: `${result.path}${suffix}` }
    }
    if (diffTarget.value?.path === row.path) diffTarget.value = null
    await refreshTreePath(row.path)
    window.__ui?.showToast(`已重命名为 ${result.path}${row.kind === 'dir' ? '/' : ''}`, 'success', 2800)
  } catch (err) {
    reportError(err, '重命名失败')
  }
}

async function deleteRow(row) {
  if (await removePath(row.path, row.name)) {
    if (preview.value?.path === row.path) preview.value = null
    if (diffTarget.value?.path === row.path) diffTarget.value = null
    await refreshAfterDelete(row.path)
  }
}

async function removePath(path, label) {
  if (readOnly.value) {
    toastReadOnly()
    return null
  }
  const ok = await window.__ui?.showConfirm(`删除「${label}」？文件会移入回收站，可在面板「回收站」撤销。`)
  if (!ok) return null
  try {
    const result = await deletePath(path)
    window.__ui?.showToast('已移入回收站', 'success', 6000, {
      actionText: '撤销',
      onAction: () => undoDelete(result.trashName),
    })
    scheduleUsageRefresh()
    return result
  } catch (err) {
    reportError(err, '删除失败')
    return null
  }
}

async function undoDelete(trashName) {
  try {
    const result = await restoreTrash(trashName)
    window.__ui?.showToast(
      result.renamed ? `原路径已被占用，已恢复为 ${result.path}` : `已恢复到 ${result.path}`,
      'success', 3600
    )
    await refreshAfterDelete(result.path)
    if (view.value === 'trash') await loadTrash()
    scheduleUsageRefresh()
  } catch (err) {
    reportError(err, '撤销失败')
  }
}

async function restoreEntry(item) {
  if (readOnly.value) return
  try {
    const result = await restoreTrash(item.name)
    window.__ui?.showToast(
      result.renamed ? `原路径已被占用，已恢复为 ${result.path}` : `已恢复到 ${result.path}`,
      'success', 3600
    )
    await loadTrash()
    await refreshTreePath(result.path)
    scheduleUsageRefresh()
  } catch (err) {
    reportError(err, '恢复失败')
  }
}

async function purgeEntry(item) {
  if (readOnly.value) return
  const ok = await window.__ui?.showConfirm(`永久删除「${item.originalName}」？此操作无法撤销。`)
  if (!ok) return
  try {
    await purgeTrash(item.name)
    await loadTrash()
    scheduleUsageRefresh()
  } catch (err) {
    reportError(err, '永久删除失败')
  }
}

async function clearTrash() {
  if (readOnly.value) return
  const ok = await window.__ui?.showConfirm(`清空回收站？其中 ${trash.value.length} 个条目将被永久删除。`)
  if (!ok) return
  try {
    const result = await emptyTrash()
    window.__ui?.showToast(`已永久删除 ${result.removed} 个条目`, 'success')
    await loadTrash()
    scheduleUsageRefresh()
  } catch (err) {
    reportError(err, '清空回收站失败')
  }
}

async function restoreVersion(version) {
  if (readOnly.value) return
  try {
    const result = await restoreHistory(version.file)
    window.__ui?.showToast(`已恢复 ${result.path} 的历史版本`, 'success', 3600)
    await loadHistory()
    await refreshTreePath(result.path)
    scheduleUsageRefresh()
  } catch (err) {
    reportError(err, '恢复历史版本失败')
  }
}

async function downloadVersion(version) {
  try {
    const payload = await getHistoryText(version.file)
    const name = payload.path.split('/').pop() || 'history.txt'
    const dot = name.lastIndexOf('.')
    const base = sanitizeFileName(dot > 0 ? name.slice(0, dot) : name)
    const ext = dot > 0 ? name.slice(dot) : '.txt'
    const stamp = formatStamp(version.at || payload.at)
    saveBlob(new Blob([payload.text], { type: 'text/plain;charset=utf-8' }), `${base}-${stamp}${ext}`)
  } catch (err) {
    reportError(err, '下载历史版本失败')
  }
}

function formatStamp(at) {
  const date = new Date(Number(at) || Date.now())
  const pad = n => String(n).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`
}

function formatTime(at) {
  if (!at) return '时间未知'
  const date = new Date(Number(at))
  if (Number.isNaN(date.getTime())) return '时间未知'
  const pad = n => String(n).padStart(2, '0')
  const now = new Date()
  const datePart = date.getFullYear() === now.getFullYear()
    ? `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    : `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  return `${datePart} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

async function chooseFolder() {
  const result = await pickWorkspaceFolder()
  if (result.ok) {
    window.__ui?.showToast(`已挂载文件夹「${result.name}」`, 'success')
    preview.value = null
    diffTarget.value = null
    expanded.clear()
    persistExpanded()
    await refreshStatus()
    await loadTree()
    refreshUsage()
  } else if (!result.cancelled) {
    reportError(result, '选择文件夹失败')
  }
}

async function unmountFolder() {
  const ok = await window.__ui?.showConfirm('改回内置工作区？原本机文件夹中的文件不会被删除。')
  if (!ok) return
  await clearWorkspaceFolder()
  preview.value = null
  diffTarget.value = null
  expanded.clear()
  persistExpanded()
  await refreshStatus()
  await loadTree()
  refreshUsage()
}

async function handleImport(e) {
  const files = [...(e.target.files || [])]
  e.target.value = ''
  if (!files.length) return
  if (readOnly.value) {
    toastReadOnly()
    return
  }
  const zipList = files.filter(file => /\.zip$/i.test(file.name))
  const plainFiles = files.filter(file => !/\.zip$/i.test(file.name))

  if (zipList.length) {
    const ok = await window.__ui?.showConfirm(`将把 ${zipList.length} 个 zip 备份解压到工作区根目录，同名文件会被覆盖，继续？`)
    if (!ok) return
    for (const file of zipList) {
      try {
        const result = await importZip(file, '')
        const skipped = result.skipped.length ? `，跳过 ${result.skipped.length} 项` : ''
        window.__ui?.showToast(
          `已从 ${file.name} 恢复 ${result.imported} 个文件（${formatBytes(result.bytes)}${skipped}）`,
          'success', 4800
        )
      } catch (err) {
        reportError(err, `${file.name} 导入失败`)
      }
    }
  }

  if (plainFiles.length) {
    let names = new Set()
    try {
      const listing = await listDir('')
      names = new Set(listing.entries.map(entry => entry.name))
    } catch {
      // 列目录失败时直接覆盖导入
    }
    if (plainFiles.some(file => names.has(file.name))) {
      const ok = await window.__ui?.showConfirm('工作区根目录存在同名文件，导入将覆盖，继续？')
      if (!ok) {
        await loadTree()
        return
      }
    }
    let failed = 0
    for (const file of plainFiles) {
      try {
        await writeBlob(sanitizeFileName(file.name), file)
      } catch (err) {
        failed += 1
        reportError(err, `${file.name} 导入失败`)
      }
    }
    if (failed < plainFiles.length) window.__ui?.showToast(`已导入 ${plainFiles.length - failed} 个文件`, 'success')
  }

  await loadTree()
  scheduleUsageRefresh()
}

function onWorkspaceChanged(event) {
  const path = String(event?.detail?.path || '')
  changedPath.value = path
  clearTimeout(highlightTimer)
  highlightTimer = setTimeout(() => { changedPath.value = '' }, 2600)
  activityTick.value += 1

  clearTimeout(changeTimer)
  changeTimer = setTimeout(async () => {
    if (!isOpen.value) return
    if (view.value === 'trash') await loadTrash()
    else if (view.value === 'history') await loadHistory()
    else if (view.value === 'artifacts') refreshActivity()
    else if (searchMode.value) await runSearch()
    else await refreshTreePath(path)
    scheduleUsageRefresh()
  }, 300)
}

function onAiWrite() {
  refreshActivity()
}

function onMinuteTick() {
  activityTick.value += 1
}

onMounted(() => {
  window.addEventListener('xiyue:workspace-changed', onWorkspaceChanged)
  window.addEventListener('xiyue:workspace-ai-write', onAiWrite)
  window.addEventListener('keydown', onKeydown)
  activityTimer = setInterval(onMinuteTick, 60_000)
})

onUnmounted(() => {
  window.removeEventListener('xiyue:workspace-changed', onWorkspaceChanged)
  window.removeEventListener('xiyue:workspace-ai-write', onAiWrite)
  window.removeEventListener('keydown', onKeydown)
  clearTimeout(changeTimer)
  clearTimeout(highlightTimer)
  clearTimeout(usageTimer)
  clearTimeout(filterTimer)
  clearInterval(activityTimer)
})
</script>

<style scoped>
.ws-dock {
  flex-shrink: 0;
  width: 0;
  height: 100%;
  overflow: hidden;
  background: var(--bg-primary);
  transition: width 0.28s ease;
  z-index: 15;
}
.ws-dock.open {
  width: var(--ws-width, 420px);
}
.ws-dock.resizing {
  transition: none;
}
.ws-backdrop {
  display: none;
}
.ws-panel {
  position: relative;
  width: var(--ws-width, 420px);
  height: 100%;
  background: var(--bg-primary);
  border-left: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  container-type: inline-size;
}
.ws-resize {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 6px;
  z-index: 6;
  cursor: col-resize;
  background: transparent;
  touch-action: none;
  transition: background 0.15s;
}
.ws-resize:hover,
.ws-resize:active,
.ws-dock.resizing .ws-resize {
  background: var(--accent);
  opacity: 0.35;
}

.ws-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  height: var(--topbar-h, 60px);
  box-sizing: border-box;
  padding: 0 14px 0 20px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}
.ws-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.ws-title h2 {
  font-size: 16px;
  margin: 0;
  white-space: nowrap;
}
.view-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.view-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.view-btn.active {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--bg-active);
}
.header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}
.icon-btn {
  width: 32px;
  height: 32px;
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
.icon-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.icon-btn.sm {
  width: 28px;
  height: 28px;
  border-radius: 7px;
  flex-shrink: 0;
}
.icon-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.spin {
  animation: ws-spin 0.9s linear infinite;
}
@keyframes ws-spin {
  to { transform: rotate(360deg); }
}

.ws-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.ws-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 14px 6px 16px;
  flex-shrink: 0;
}
.ws-filter {
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
}
.ws-filter > svg {
  position: absolute;
  left: 9px;
  color: var(--text-muted);
  pointer-events: none;
}
.ws-filter input {
  width: 100%;
  height: 30px;
  padding: 0 28px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: 12px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s;
}
.ws-filter input:focus {
  border-color: var(--accent);
}
.ws-filter input::placeholder {
  color: var(--text-muted);
}
.ws-filter-clear {
  position: absolute;
  right: 4px;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.ws-filter-clear:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.ws-scope {
  display: flex;
  flex-shrink: 0;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--border-color);
  border-radius: 7px;
  background: var(--bg-card);
}
.ws-scope-btn {
  padding: 2px 6px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--text-muted);
  font-size: 11px;
  font-family: inherit;
  line-height: 1.5;
  cursor: pointer;
}
.ws-scope-btn:hover {
  color: var(--text-primary);
}
.ws-scope-btn.on {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.ws-hits {
  margin-top: 2px;
}
.ws-hit {
  padding: 5px 8px 6px;
  border-radius: 7px;
  cursor: pointer;
}
.ws-hit:hover {
  background: var(--bg-hover);
}
.ws-hit-head {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}
.ws-hit-name {
  flex-shrink: 0;
  max-width: 45%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 12px;
  color: var(--text-primary);
}
.ws-hit-dir {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 11px;
  color: var(--text-muted);
}
.ws-hit-line {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--accent);
}
.ws-hit-text {
  margin: 1px 0 0;
  overflow: hidden;
  white-space: pre;
  text-overflow: ellipsis;
  font-family: ui-monospace, SFMono-Regular, Consolas, 'Courier New', monospace;
  font-size: 11px;
  line-height: 1.55;
  color: var(--text-secondary);
}
.ws-hit-text mark {
  padding: 0 1px;
  border-radius: 3px;
  background: rgba(250, 204, 21, 0.45);
  color: inherit;
}
.ws-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 4px 10px 12px;
}
.ws-scroll.is-surface {
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding: 6px 12px 10px;
}
.ws-surface {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.ws-empty {
  text-align: center;
  color: var(--text-muted);
  padding: 48px 16px;
}
.ws-empty svg {
  opacity: 0.5;
}
.ws-empty p {
  margin: 10px 0 4px;
  font-size: 13px;
}
.ws-empty span {
  font-size: 12px;
}
.ws-empty-actions {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-top: 14px;
}
.ws-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin: 10px 16px 0;
  padding: 9px 12px;
  border: 1px solid var(--danger);
  border-radius: 10px;
  background: rgba(220, 38, 38, 0.08);
  color: var(--danger);
  font-size: 12px;
  line-height: 1.5;
  flex-shrink: 0;
}
.ws-banner .btn-sm {
  flex-shrink: 0;
}
.ws-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin: 8px 6px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--danger);
}
.ws-error .btn-sm {
  flex-shrink: 0;
}
.ws-truncated {
  margin: 8px 6px;
  font-size: 11px;
  color: var(--text-muted);
}
.ws-search-meta {
  margin: 2px 6px 8px;
  font-size: 11px;
  color: var(--text-muted);
}

.ws-node {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 30px;
  padding-right: 4px;
  border-radius: 7px;
  cursor: pointer;
  transition: background 0.12s;
}
.ws-node:hover {
  background: var(--bg-hover);
}
.ws-node.changed {
  animation: ws-flash 2.6s ease-out;
  box-shadow: inset 2px 0 0 var(--accent);
}
@keyframes ws-flash {
  0%, 60% { background: var(--bg-active); }
  100% { background: transparent; }
}
.ws-chevron {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform 0.15s, background 0.12s;
}
.ws-chevron.open {
  transform: rotate(90deg);
}
.ws-chevron:hover {
  background: var(--bg-active);
  color: var(--text-primary);
}
.ws-chevron.placeholder {
  cursor: default;
  background: transparent;
}
.ws-node-icon {
  flex-shrink: 0;
  opacity: 0.9;
}
.ws-node-label {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.ws-node-name {
  font-size: 13px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ws-node-path {
  font-size: 10px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
}
.ws-node-size {
  flex-shrink: 0;
  font-size: 10px;
  color: var(--text-muted);
}
.ws-node-time {
  flex-shrink: 0;
  min-width: 38px;
  text-align: right;
  font-size: 10px;
  color: var(--text-muted);
}
.ws-node-act {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.12s, background 0.12s, color 0.12s;
}
.ws-node:hover .ws-node-act {
  opacity: 1;
}
.ws-node-act:hover {
  background: var(--bg-active);
  color: var(--accent);
}
.ai-badge {
  flex-shrink: 0;
  padding: 1px 5px;
  border: none;
  border-radius: 999px;
  background: var(--accent);
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.2px;
  white-space: nowrap;
  font-family: inherit;
}
button.ai-badge {
  cursor: pointer;
}
button.ai-badge:hover {
  filter: brightness(1.12);
}
.ws-pseudo {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 26px;
  font-size: 11px;
  color: var(--text-muted);
}
.ws-pseudo-muted {
  opacity: 0.75;
}
.ws-pseudo-error {
  color: var(--danger);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ws-skeleton {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 8px;
}
.ws-skeleton span {
  height: 13px;
  border-radius: 6px;
  background: linear-gradient(90deg, var(--bg-card), var(--bg-hover), var(--bg-card));
  background-size: 200% 100%;
  animation: ws-shimmer 1.2s linear infinite;
}
@keyframes ws-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.view-intro {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 2px 2px 10px;
  padding: 0 2px;
  font-size: 12px;
  color: var(--text-muted);
}
.view-intro-text {
  flex: 1;
  min-width: 0;
  line-height: 1.5;
}
.history-filter {
  margin: 0 2px 8px;
  padding: 6px 10px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card);
  font-size: 12px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.history-group {
  margin: 0 2px 10px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  overflow: hidden;
}
.history-path {
  display: block;
  width: 100%;
  padding: 8px 12px;
  border: none;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: 12px;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.history-path:hover {
  color: var(--accent);
}
.history-version {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
}
.history-version + .history-version {
  border-top: 1px dashed var(--border-color);
}
.history-time {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: var(--text-secondary);
}

.artifact-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.12s;
}
.artifact-row:hover {
  background: var(--bg-hover);
}
.artifact-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.artifact-action {
  flex-shrink: 0;
  padding: 2px 7px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  font-size: 10px;
  color: var(--text-secondary);
}

.ws-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 10px;
  border-radius: 9px;
  cursor: pointer;
  transition: background 0.12s;
}
.ws-item:hover {
  background: var(--bg-hover);
}
.ws-item.static {
  cursor: default;
}
.ws-item-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.ws-item-main .ws-item-name {
  flex: none;
}
.ws-item-sub {
  font-size: 11px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ws-item-icon {
  flex-shrink: 0;
  color: var(--text-muted);
}
.ws-item-icon.dir {
  color: var(--accent);
}
.ws-item-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  color: var(--text-primary);
}
.ws-item-size {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--text-muted);
}
.ws-item-del {
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.12s, background 0.12s, color 0.12s;
}
.ws-item:hover .ws-item-del {
  opacity: 1;
}
.ws-item-del.always {
  opacity: 1;
}
.ws-item-del:hover {
  background: var(--bg-active);
  color: var(--danger);
}
.ws-item-del:disabled {
  opacity: 0.4;
  cursor: default;
  background: transparent;
  color: var(--text-muted);
}

.btn-sm {
  padding: 5px 12px;
  border-radius: 7px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
}
.btn-sm:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.btn-sm:disabled {
  opacity: 0.5;
  cursor: default;
}
.btn-sm:disabled:hover {
  border-color: var(--border-color);
  color: var(--text-primary);
}
.btn-sm.danger:hover {
  border-color: var(--danger);
  color: var(--danger);
}

.ws-status {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 10px;
  padding: 7px 20px;
  border-top: 1px solid var(--border-color);
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-muted);
}
.status-mode {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.status-dot {
  flex-shrink: 0;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent);
}
.status-mode.warn {
  color: var(--danger);
}
.status-mode.warn .status-dot {
  background: var(--danger);
}
.status-ai {
  flex-shrink: 0;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--bg-active);
  color: var(--accent);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.status-usage {
  margin-left: auto;
  flex-shrink: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.status-warn {
  flex-shrink: 0;
  color: var(--danger);
}

/* 默认宽 420：让「文件/回收站/产物」文字保持可见，图标彼此太像，只靠 tooltip 分不清；
   空间不够时先牺牲标题，再牺牲文字 */
@container (max-width: 430px) {
  .ws-title h2 {
    display: none;
  }
  .ws-node-size {
    display: none;
  }
}
@container (max-width: 400px) {
  .view-btn span {
    display: none;
  }
}
@container (max-width: 360px) {
  .ws-node-time {
    display: none;
  }
}

@media (max-width: 1024px) {
  .ws-dock {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
    background: transparent;
    pointer-events: none;
    z-index: 100;
    transition: none;
  }
  .ws-dock.open {
    width: 100%;
  }
  .ws-panel {
    position: absolute;
    top: 0;
    right: 0;
    width: min(86vw, 400px);
    height: 100%;
    transform: translateX(100%);
    transition: transform 0.28s ease;
    box-shadow: -8px 0 30px rgba(0, 0, 0, 0.18);
    pointer-events: auto;
  }
  .ws-dock.open .ws-panel {
    transform: translateX(0);
  }
  .ws-dock.open .ws-backdrop {
    display: block;
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.35);
    pointer-events: auto;
  }
  .ws-resize {
    display: none;
  }
}

@media (max-width: 480px) {
  .ws-header {
    padding: 0 10px 0 14px;
  }
  .view-btn {
    padding: 6px;
  }
  .ws-status {
    padding: 7px 14px;
  }
  .status-usage {
    margin-left: 0;
  }
}
</style>
