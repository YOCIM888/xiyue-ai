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
    id: 'table',
    command: '/表格',
    label: '表格',
    aliases: ['csv', 'excel', '表格分析'],
    desc: '分析 CSV / Excel 数据，输出统计、异常、图表与结论',
    example: '（粘贴数据或上传 .csv/.xlsx 文件，可补充分析目标）',
  },
  {
    id: 'calc',
    command: '/计算',
    label: '计算',
    aliases: ['calc', '算一下'],
    desc: '让模型写 JS / Python 在本地执行，避免心算',
    example: '123456789 × 987654321 的精确结果',
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
  {
    id: 'export',
    command: '/导出',
    label: '导出',
    aliases: ['export', '导出对话'],
    desc: '导出当前对话为 Markdown、HTML、PDF 或 Word',
    example: '（直接选择格式，或输入 /导出 md）',
  },
]

const TARGET_LANG_RE = /^(中文|英文|日语|韩语|法语|德语|西班牙语|俄语|english|chinese|japanese|korean)\s+([\s\S]+)$/i

/** 根据输入过滤指令：仅在尚未输入空格时弹出 */
export function matchSlashCommands(input) {
  const text = String(input ?? '')
  if (!text.startsWith('/') || /\s/.test(text)) return []
  const q = text.slice(1).toLowerCase()
  return SLASH_COMMANDS.filter(c => {
    const keys = [c.label, c.command.slice(1), c.id, ...(c.aliases || [])]
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
  const command = SLASH_COMMANDS.find(c =>
    c.command === cmdText || (c.aliases || []).some(a => `/${a}` === cmdText)
  )
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
    case 'table':
      return arg
        ? `请分析以下 CSV / Excel 表格数据，按顺序输出：\n1. 数据结构：行列数、字段名与含义；\n2. 数据质量：缺失值、重复行、明显异常值；\n3. 关键统计：数值列的总计、均值、最小、最大，分类列的数量分布 Top N；\n4. 趋势与洞察：存在时间列时说明变化趋势，并指出值得注意的规律或异常；\n5. 结论与建议：给出可执行的下一步；\n6. 可视化：若数据适合，追加一个最合适的图表，代码块语言必须写成 \`\`\`echarts，内容为合法 JSON（不要注释、不要函数、不要多余文字），图表类型只用 bar、line、pie、scatter。\n结果用 Markdown 表格呈现；数据不足以判断时直接说明，不要编造。\n\n${arg}`
        : '请分析我上传或粘贴的 CSV / Excel 表格数据：先识别行列数与字段含义，再检查缺失值、重复和异常，给出数值列的关键统计与分类列分布，最后总结趋势、结论与建议，用 Markdown 表格呈现。若数据适合，再追加一个最合适的图表，代码块语言必须写成 echarts，内容为合法 JSON（不要注释、不要函数），图表类型只用 bar、line、pie、scatter。数据不足时直接说明，不要编造。'
    case 'calc':
      return arg
        ? `请使用计算沙箱完成以下任务，不要心算：\n\n${arg}\n\n如果需要计算，请输出一个 \`\`\`sandbox-js 或 \`\`\`sandbox-python 代码块；JavaScript 用 return 返回结果，Python 用 print 或最后一行表达式输出。`
        : '请使用计算沙箱计算我上一条消息中的问题。需要计算时输出一个 ```sandbox-js 或 ```sandbox-python 代码块，不要直接给出心算结果。'
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
