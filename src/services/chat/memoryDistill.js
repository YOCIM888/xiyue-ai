import { useMemoryStore } from '../../stores/memory'
import { detectMemoryCommand, extractMemoryEntries } from '../memory'

/**
 * 自动记忆沉淀：每 N 轮用户消息触发一次，后台执行。
 * isRunning/setRunning 由 store 持有，保证重新创建 store 时状态也会重置。
 */
export function maybeAutoDistill(branch, settings, userContent, { isRunning, setRunning }) {
  const memory = useMemoryStore()
  if (!memory.autoEnabled || isRunning() || !settings.settingsReady) return
  if (detectMemoryCommand(userContent)) return

  const turns = branch.messages.filter(m => m.role === 'user').length
  const every = Math.max(2, Math.min(50, Number(memory.autoTurns) || 10))
  if (!turns || turns % every !== 0) return

  const transcript = branch.messages
    .filter(m => m.content)
    .slice(-16)
    .map(m => ({ role: m.role, content: m.content }))
  setRunning(true)
  window.__ui?.showToast(`正在进行第 ${turns} 轮记忆沉淀…`, 'info', 2200)
  saveMemoriesFromChat(
    '请从最近对话中自动提炼值得长期保留的用户偏好、事实、目标与约定。',
    transcript,
    settings,
    { auto: true }
  ).finally(() => { setRunning(false) })
}

/** 提炼并保存记忆（后台执行，不阻塞对话） */
export async function saveMemoriesFromChat(userText, transcript, settings, { auto = false } = {}) {
  const memory = useMemoryStore()
  try {
    const entries = await extractMemoryEntries({
      apiBase: settings.apiBase,
      apiKey: settings.apiKey,
      model: settings.model,
      temperature: settings.temperature,
      messages: transcript,
      userText,
    })
    if (!entries.length) return
    let added = 0
    for (const entry of entries) {
      const exists = memory.memories.some(m => m.title === entry.title && m.content === entry.content)
      if (exists) continue
      memory.create(entry.title, entry.content, 'chat')
      added++
    }
    if (added) {
      window.__ui?.showToast(
        auto ? `已自动沉淀 ${added} 条记忆` : `已存入记忆：${added} 条`,
        'success'
      )
    } else if (!auto) {
      window.__ui?.showToast('这些内容已在记忆中', 'info')
    }
  } catch {
    window.__ui?.showToast(
      auto ? '自动记忆沉淀失败，请检查模型配置' : '记忆保存失败，请检查模型配置',
      'error'
    )
  }
}
