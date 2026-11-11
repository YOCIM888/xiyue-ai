import { useSettingsStore } from '../../stores/settings'
import { useMemoryStore } from '../../stores/memory'
import { buildToolPrompt } from '../tools'
import { getPreflightContext } from '../preflight'
import { buildMainChatMemoryContext } from '../../utils/memoryContext'
// 系统提示词文件（Vite 构建时内联，零延迟）
import systemPromptRaw from '../../../public/prompt/system.md?raw'

/** 组装主聊天的系统提示词；必须保持同步，预取上下文在发消息前已刷新 */
export function buildSystemPrompt() {
  const settings = useSettingsStore()
  const externalPrompt = systemPromptRaw || ''
  const persona = settings.personaPrompt || ''
  const userName = settings.userName || ''
  const userPersona = (settings.userPersona || '').trim()
  const replyRules = (settings.replyRules || '').trim()
  const personaOn = settings.personaEnabled

  const parts = []
  if (personaOn && persona.trim()) {
    // 人设优先：只发人设，忽略系统提示词
    parts.push(persona.trim())
  } else if (externalPrompt.trim()) {
    // 关闭 AI 人设时使用默认的白曦月人设
    parts.push(externalPrompt.trim())
  }

  if (userName.trim() || userPersona) {
    const lines = ['\n\n【用户信息】']
    if (userName.trim()) {
      lines.push(`当前与你对话的用户名叫"${userName.trim()}"，请在交流中使用此名称称呼用户，并以此判断用户身份。`)
    }
    if (userPersona) lines.push(`用户人设：${userPersona}`)
    parts.push(lines.join('\n'))
  }

  if (settings.replyRulesEnabled && replyRules) {
    parts.push(`\n\n【回复规则】\n${replyRules}`)
  }

  const toolPrompt = buildToolPrompt(settings)
  if (toolPrompt) parts.push(toolPrompt)

  // 开工预取在发消息前已刷好快照，这里只读取
  const preflight = getPreflightContext()
  if (preflight) parts.push(preflight)

  // 长期记忆：主记忆未禁用时生效，读取有上限
  const memory = useMemoryStore()
  const memorySection = buildMainChatMemoryContext(memory)
  if (memorySection) parts.push('\n\n' + memorySection)
  return parts.join('')
}
