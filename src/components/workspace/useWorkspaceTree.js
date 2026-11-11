import { computed, reactive, ref, onUnmounted } from 'vue'
import { listDir, searchWorkspace, searchFiles } from '../../services/workspace'
import { splitByRange } from '../../utils/textSearch'
import { isAiTouched } from '../../services/workspaceActivity'

const EXPANDED_KEY = 'xiyue_workspace_expanded_v1'
const MAX_EXPANDED = 60
const SCOPE_OPTIONS = [
  { key: 'name', label: '名称' },
  { key: 'content', label: '内容' },
]
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

/** 文件树与搜索：展开状态、按名称/内容过滤、懒加载目录。 */
export function useWorkspaceTree(ctx) {
  const filter = ref('')
  const searchScope = ref('name')
  const searchPending = ref(false)
  const searchResults = ref([])
  const searchTruncated = ref(false)
  const searchError = ref('')
  const searchStats = ref({ filesMatched: 0, scannedBytes: 0, oversizedSkipped: 0 })

  const treeNodes = reactive(new Map())
  const expanded = reactive(new Set(loadExpanded()))

  let filterTimer = null

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
      await ctx.refreshStatus()
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
    ctx.openFile(row)
  }

  function isAiChanged(path) {
    return ctx.activityTick.value >= 0 && isAiTouched(path)
  }

  function entryChanged(path) {
    if (!ctx.changedPath.value) return false
    return ctx.changedPath.value === path || ctx.changedPath.value.startsWith(`${path}/`)
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

  onUnmounted(() => clearTimeout(filterTimer))

  return {
    filter, searchScope, searchPending, searchResults, searchTruncated, searchError, searchStats,
    treeNodes, expanded, searchMode, contentMode, rootNode, treeLoading, treeError, flatRows,
    searchRows, hitRows, displayRows, SCOPE_OPTIONS, persistExpanded, getNode, ensureChildren,
    dropSubtree, purgeExpanded, migratePathState, restoreExpanded, loadTree, toggleDir, retryDir,
    collapseAll, refreshTreePath, refreshAfterDelete, revealPath, revealInTree, onFilterInput,
    setScope, runSearch, clearFilter, onRowClick, isAiChanged, entryChanged, iconColor, parentDir,
    shortDir, artifactName,
  }
}
