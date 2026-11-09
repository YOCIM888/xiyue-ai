/**
 * 斜杠快捷指令：把 /指令 + 内容 转成实际发送给模型的提示词。
 * /画图 不走提示词，直接标记强制生图。
 */

export const SLASH_COMMANDS = [
  {
    id: 'image',
    command: '/画图',
    label: '画图',
    desc: '按描述直接生成图片，不依赖自然语言识别',
    example: '一只在月球上晒太阳的橘猫，赛博朋克风格',
    needsArg: true,
  },
  {
    id: 'document',
    command: '/文档',
    label: '文档',
    desc: '从「我的文档」选择文件一起提问',
    example: '选择 PDF、DOCX、TXT 等已导入的文档',
  },
  {
    id: 'summarize',
    command: '/总结',
    label: '总结',
    desc: '总结当前对话，或总结指定内容',
    example: '（留空总结整段对话，或粘贴要总结的内容）',
  },
  {
    id: 'translate',
    command: '/翻译',
    label: '翻译',
    desc: '翻译内容，可指定目标语言',
    example: '英文 今天天气很好',
  },
  {
    id: 'polish',
    command: '/润色',
    label: '润色',
    desc: '保持原意，让表达更自然精炼',
    example: '（留空润色上一条消息，或粘贴要润色的文字）',
  },
  {
    id: 'outline',
    command: '/大纲',
    label: '大纲',
    desc: '为内容或主题生成层级大纲',
    example: '写一篇介绍向量数据库的文章',
  },
  {
    id: 'explain',
    command: '/解释',
    label: '解释',
    desc: '解释代码或概念，说明关键点',
    example: '这段代码为什么会出现 Event loop is closed',
  },
]

const TARGET_LANG_RE = /^(中文|英文|日语|韩语|法语|德语|西班牙语|俄语|english|chinese|japanese|korean)\s+([\s\S]+)$/i

/** 根据输入过滤指令：仅在尚未输入空格时弹出 */
export function matchSlashCommands(input) {
  const text = String(input ?? '')
  if (!text.startsWith('/') || /\s/.test(text)) return []
  const q = text.slice(1).toLowerCase()
  return SLASH_COMMANDS.filter(c => {
    const keys = [c.label, c.command.slice(1), c.id]
    return keys.some(k => k.toLowerCase().includes(q))
  })
}

/** 解析完整输入，返回 { command, arg, payload, display, forceImage } */
export function parseSlashInput(input) {
  const text = String(input ?? '').trim()
  if (!text.startsWith('/')) return null
  const spaceIdx = text.search(/\s/)
  const cmdText = spaceIdx === -1 ? text : text.slice(0, spaceIdx)
  const arg = spaceIdx === -1 ? '' : text.slice(spaceIdx + 1).trim()
  const command = SLASH_COMMANDS.find(c => c.command === cmdText)
  if (!command) return null

  const display = text
  if (command.id === 'image') {
    return { command, arg, payload: arg, display, forceImage: true }
  }
  return { command, arg, payload: buildPrompt(command.id, arg), display, forceImage: false }
}

function buildPrompt(id, arg) {
  switch (id) {
    case 'summarize':
      return arg
        ? `请总结以下内容，提炼关键要点、结论和待办：\n\n${arg}`
        : '请总结我们上面的对话，提炼关键结论、已确认的信息、待办事项和尚未解决的问题。'
    case 'translate': {
      const match = arg.match(TARGET_LANG_RE)
      const target = match ? match[1] : ''
      const body = match ? match[2] : arg
      if (!body) {
        return '请把上一条消息翻译一下：原文是中文就译成英文，否则译成中文。'
      }
      return target
        ? `请把以下内容翻译成${target}：\n\n${body}`
        : `请翻译以下内容：原文是中文就译成英文，否则译成中文。\n\n${body}`
    }
    case 'polish':
      return arg
        ? `请润色以下内容：保持原意，让表达更自然、精炼，直接给出润色后的版本。\n\n${arg}`
        : '请润色我上一条消息：保持原意，让表达更自然、精炼，直接给出润色后的版本。'
    case 'outline':
      return arg
        ? `请为以下主题生成一份层级大纲：\n\n${arg}`
        : '请为上面的对话内容生成一份层级大纲。'
    case 'explain':
      return arg
        ? `请解释以下内容；如果是代码，请说明整体逻辑、关键行和潜在问题：\n\n${arg}`
        : '请解释我上一条消息里的内容；如果是代码，请说明整体逻辑、关键行和潜在问题。'
    default:
      return arg
  }
}
