/**
 * 开工前上下文：把模型自己无从推断的事实（今天是几号、工作区长什么样、项目有什么约定）
 * 预先塞进系统提示，省掉它「不知道该先看什么」而浪费的工具轮次。
 */
import { getWorkspaceStatus, listDir, readFile, formatBytes } from './workspace'
import { latestAiWriteAt } from './workspaceActivity'

const RULES_FILES = ['agents.md', 'xiyue.md', '.xiyue-rules.md', 'claude.md', 'readme.md']
const MAX_RULES_FILES = 2
const MAX_RULES_CHARS = 1200
const MAX_TREE_ENTRIES = 40
const CACHE_TTL = 60 * 1000

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

let cache = { key: '', text: '', at: 0, writeAt: 0 }

/** 日期必须写进提示，否则模型会拿训练截止年份当「今年」 */
export function dateLine(now = new Date()) {
  const pad = value => String(value).padStart(2, '0')
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  return `今天是 ${date} ${WEEKDAYS[now.getDay()]}。判断「今年 / 最近 / 最新」时以此为准，不要引用训练记忆里的年份。`
}

function treeLines(status, listed) {
  const scope = status.mode === 'folder'
    ? `工作区已挂载本机文件夹「${status.folderName || '未命名'}」`
    : '当前是浏览器内置工作区'
  if (!listed.entries.length) return [`${scope}，根目录是空的，可以直接新建文件或目录。`]
  const rows = listed.entries.slice(0, MAX_TREE_ENTRIES).map(entry =>
    entry.kind === 'dir'
      ? `  ${entry.name}/（目录）`
      : `  ${entry.name}${entry.size != null ? `（${formatBytes(entry.size)}）` : ''}`
  )
  const rest = listed.total - rows.length
  if (rest > 0) rows.push(`  …另有 ${rest} 项未列出`)
  return [`${scope}，根目录第一层共 ${listed.total} 项：`, ...rows, '（完整结构请用 files 的 list / search / find 查看，不要逐个 read 猜。）']
}

/** 约定文件从根目录列表里挑，避免为不存在的文件反复抛错 */
async function rulesLines(entries) {
  const wanted = entries
    .filter(entry => entry.kind !== 'dir' && RULES_FILES.includes(String(entry.name).toLowerCase()))
    .slice(0, MAX_RULES_FILES)
  const blocks = []
  for (const entry of wanted) {
    let text
    try {
      text = (await readFile(entry.name)).text
    } catch {
      continue
    }
    const body = String(text || '').trim().slice(0, MAX_RULES_CHARS)
    if (!body) continue
    blocks.push(`项目约定（摘自 ${entry.name}，过长已截断，需要全文请 read）：\n${body}`)
  }
  return blocks
}

async function build(settings) {
  const lines = ['\n\n【开工前上下文】', dateLine()]
  if (settings.searchSkillEnabled && String(settings.tavilyApiKey || '').trim()) {
    lines.push('需要实时信息时先用 search_web 核实，再下结论。')
  }
  if (!settings.workModeEnabled) return lines.join('\n')

  try {
    const [status, listed] = await Promise.all([getWorkspaceStatus(), listDir('')])
    lines.push(treeLines(status, listed).join('\n'))
    const rules = await rulesLines(listed.entries)
    lines.push(...rules)
  } catch {
    // 工作区不可用不影响发消息，退化成只有日期
  }
  return lines.join('\n')
}

/** 每次发消息前刷新；同一工作区、无新 AI 写入且 60 秒内直接复用快照 */
export async function refreshPreflightContext(settings) {
  const key = settings?.workModeEnabled ? 'work' : 'plain'
  const writeAt = latestAiWriteAt()
  const now = Date.now()
  if (cache.key === key && cache.writeAt === writeAt && now - cache.at < CACHE_TTL) return cache.text
  let text
  try {
    text = await build(settings)
  } catch {
    text = `\n\n【开工前上下文】\n${dateLine()}`
  }
  cache = { key, text, at: now, writeAt }
  return text
}

/** 同步读取快照，供 buildSystemPrompt 与上下文用量估算使用 */
export function getPreflightContext() {
  return cache.text
}
