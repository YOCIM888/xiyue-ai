import { sendChatRequest } from './api'

/**
 * 梦境推演
 * 独立于主聊天与探索星空的互动叙事模块，只读取设置中的模型配置。
 */

const OPENING_XINGSHI = `法院的扣薪通知邮件躺在邮箱最顶端，冰冷的白底黑字，没有任何情绪。

HR例行公事的消息简单直白：自下月薪资起，税后固定扣缴百分之二十，用于偿还加州法院备案的民事债务。

二十六岁的陈墨坐在写字楼靠窗的工位上，指尖悬在键盘上空，迟迟没有落下。

八十万美金的创业贷款，倒闭清算后剩下的五十万差额，终究穿透了LLC有限责任的保护壳。当初随手签下的个人担保协议，此刻化作一张密不透风的网，牢牢箍住了他所有的退路。

税后八千美元的月薪，在洛杉矶程序员的薪资体系里，堪堪算作温饱稳定。可扣掉一千六百刀的固定债务还款，再刨去两千八百刀的一室公寓月租，剩余的余额，仅够支撑最拮据的三餐与通勤。

午休短暂的十分钟，他漫无目的地划着手机。WhatsApp的消息弹窗率先跳出，是姜知雅发来的消息，语气带着一点莫名的不安。

【知雅：我今天右眼皮一直跳，跳了一早上，心慌得很，跟公司请假了，在家待着。】

陈墨盯着屏幕看了两秒，只当是女孩子偏信的玄学小迷信，随手回了句让她好好休息。

页面往下滑动，紧接着刷到漫天流传的新型狂犬病毒传闻，字句耸人听闻，全网零星有人转发讨论。他扯了扯嘴角，只当又是网络博眼球的虚假谣言、夸大其词的玩笑，没放在心上，径直划走。

这段日子压在身上的现实重担早已足够沉重，债务、判决、被锁死的人生，层层叠叠。他根本没有多余的心力，去理会这些虚无缥缈的末日传闻。

曾经意气风发、孤注一掷创业的念头，早已被现实碾得粉碎。

这座城市的贫富割裂在此刻体现得淋漓尽致。窗外是洛杉矶明媚刺眼的日光，远处富人区的别墅错落有致，街道干净整洁，一派松弛繁荣；而他的生活，被死死锁在精密冰冷的司法规则里。

没有破产跑路的勇气，也没有一夜翻盘的机遇。Chapter7个人破产的选项在脑海里一闪而过，十年的信用污点、后续求职租房的层层限制，足以废掉他未来数年的所有规划。

他只能选择硬扛。

代码一行行敲进屏幕，指尖熟练、动作麻木。曾经用来创造项目、搭建事业的技术，如今只剩下唯一的意义——续命、还债、活下去。

每个月的工资到账，系统会自动划走债务款项，无声无息，从无例外。

他避开了洛杉矶街头流浪汉的宿命，没有坠入Skid Row的泥潭，没有被债务逼得流离失所。可代价是，二十岁后半的人生彻底失去了松弛与自由。

没有社交，没有消遣，没有试错的资本。

白天是规整体面的程序员，夜里是背负五十万巨债、被法院强制执行的债务人。

洛杉矶的晚风透过窗缝吹进来，温柔却刺骨。陈墨望着楼下川流不息的车流，忽然彻底明白：有限责任公司的保护是假的，创业者孤注一掷的代价，永远最后由自己买单。

彼时的他尚且不知，姜知雅莫名的心悸、止不住的眼皮跳动，并非无端的迷信，而那些被当成玩笑的病毒传闻，是末日降临前，最先亮起的预警。

日子就这样紧绷着、僵持着，日复一日，看似平稳，实则风暴将至。

放下手机，揉了揉酸涩的眼眶，盯着屏幕上跑了一半的测试用例，心里却莫名被知雅那句“心慌得很”搅得有些发闷。迟疑片刻，还是拿起手机回了过去。

“别自己吓自己了，眼皮跳就是没睡好。你要是实在不放心，下午去楼下药店问问，或者我下班顺路过去看看你。”

发完又觉得语气太干，补了一句：

“午饭吃了吗？”

陈墨下意识抬头，最先看见的是狂奔的人群。有人撞翻了路边的热狗餐车，烤肠与冰可乐滚了一地，没人回头捡。紧接着他瞥见街对面的身影——一个男人弓着背压在路人身上，肩膀剧烈耸动，周遭的人哭喊着四散奔逃。等那人抬起头时，陈墨的血液瞬间凉了半截。

满脸的血沫混着白沫顺着下巴往下淌，眼白翻得只剩底下一点黑，四肢以一种诡异的角度扭曲着，却爆发出惊人的速度。他甩开被扑倒的人，朝着人群逃窜的方向扑过去，动作僵硬又疯狂，根本不像抽大麻嗑嗨了的瘾君子——那些人顶多是亢奋脱序，而眼前这个，更像一具从停尸袋里爬出来、只剩撕咬本能的尸体。`

export const DREAM_WORKS = [
  {
    id: 'xingshi',
    title: '行尸',
    mark: '尸',
    tag: '末日生存 · 抉择叙事',
    meta: '洛杉矶 · 现代都市 · 多线走向',
    description:
      '一场被所有人当作谣言的病毒，正在把洛杉矶变成行尸之城。你扮演背负五十万巨债的程序员陈墨，每一个选择都可能决定谁能活到明天。',
    setting: `现代都市末日题材。
主角：陈墨，26 岁，洛杉矶程序员。创业失败后背上约五十万美元债务，被加州法院按月强制扣缴，税后月薪八千美元，扣完债务与房租只剩最拮据的日常开销；没有社交、没有消遣、没有试错资本，习惯了硬扛。
重要人物：姜知雅，与陈墨关系亲近的女性朋友，当天因心慌请假在家。
世界状态：一种新型狂犬病毒在洛杉矶扩散，感染者失去理智、只剩撕咬本能；官方信息混乱，街头秩序正在崩溃，通讯与交通随时可能中断。
基调：冷峻克制的写实生存叙事，强调压迫感、资源匮乏与人性的抉择；没有超能力，没有爽文翻盘。`,
    opening: OPENING_XINGSHI,
    openingOptions: ['逃跑离开现场', '寻找姜知雅', '找点防身的东西'],
  },
]

export function getWork(id) {
  return DREAM_WORKS.find(w => w.id === id) || null
}

export function isDreamApiReady(settings) {
  if (!settings?.apiBase) return false
  if (settings.apiBase.includes('/ollama')) return true
  return !!settings.apiKey
}

function extractObject(text) {
  const clean = String(text || '').replace(/```json/g, '').replace(/```/g, '').trim()
  const start = clean.indexOf('{')
  const end = clean.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('无法解析生成内容')
  return JSON.parse(clean.slice(start, end + 1))
}

function cleanOption(text) {
  return String(text || '')
    .replace(/^[A-Da-d][.、:：]\s*/, '')
    .replace(/^\d+[.、]\s*/, '')
    .replace(/^[-·]\s*/, '')
    .replace(/（自定义[^）]*）/g, '')
    .trim()
    .slice(0, 40)
}

const FALLBACK_OPTIONS = ['先冷静观察周围的情况', '立刻找地方藏身', '想办法弄到能用的武器']

/** 模型有时会把选项写进正文，这里做一次兜底抽取 */
function extractInlineOptions(text) {
  const kept = []
  const options = []
  for (const line of String(text).split('\n')) {
    const m = line.match(/^\s*(?:选项)?[A-Ca-c][.、:：]\s*(.+)$/)
    if (m && options.length < 3) {
      options.push(m[1].trim())
    } else {
      kept.push(line)
    }
  }
  return { narrative: kept.join('\n').trim(), options }
}

function normalizeOptions(raw) {
  const list = (Array.isArray(raw) ? raw : [])
    .map(cleanOption)
    .filter(Boolean)
    .filter(t => !/^自定义/.test(t))
    .slice(0, 3)
  while (list.length < 3) list.push(FALLBACK_OPTIONS[list.length])
  return list
}

/**
 * 根据玩家的选择续写下一幕，并生成新的 3 个选项
 * @returns {Promise<{narrative: string, options: string[]}>}
 */
export async function generateNextScene({ work, turns = [], choice, settings }) {
  const systemPrompt = `你是中文互动叙事作品《${work.title}》的叙事引擎，负责推进剧情并给出行动选项。

【作品设定】
${work.setting}

【叙事规则】
1. 使用简体中文，第三人称叙述，紧贴陈墨的视角，冷峻、克制、写实，允许少量感官与环境细节。
2. 严格延续已有时间线、人物关系与既定事实，不重写开场、不复述前文、不跳跃时间线。
3. 每次只推进一个场景片段，180-320 字，紧接玩家刚刚的选择，写出这个选择带来的直接后果和新的处境。
4. 不替玩家说话或做决定，正文里不出现“你会怎么做”“请选择”之类的话，也不要列出选项字母。
5. 结尾停在一个必须立即行动的抉择点，并给出 3 个差异明显的行动选项：6-18 字、动词开头、符合当前处境，不要编号、不要 A/B/C 前缀。
6. 不输出 Markdown、标题、括号注释、表情符号或额外解释。
7. 严格输出 JSON，不要输出代码块或任何多余文字：
{"narrative":"本幕正文","options":["选项一","选项二","选项三"]}`

  const recent = turns.slice(-6)
  const offset = Math.max(0, turns.length - recent.length)
  const history = recent
    .map((t, i) => `第${offset + i + 1}幕：${String(t.narrative || '').slice(0, 500)}\n玩家选择：${t.fromChoice}`)
    .join('\n\n')

  const userContent = turns.length
    ? `【前情（最近的幕）】\n${history}\n\n【玩家此刻的选择】\n${choice}\n\n请续写下一幕，并给出 3 个新的行动选项。`
    : `【开场剧情】\n${work.opening}\n\n【玩家此刻的选择】\n${choice}\n\n请续写下一幕，并给出 3 个新的行动选项。`

  let output = ''
  await sendChatRequest({
    apiBase: settings.apiBase,
    apiKey: settings.apiKey,
    model: settings.model,
    temperature: Math.min(Math.max(settings.temperature ?? 0.8, 0.6), 1.0),
    maxTokens: 1000,
    topP: 0.95,
    thinkingEnabled: false,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    onChunk: (chunk) => {
      if (chunk.type === 'content' && chunk.text) output += chunk.text
    },
  })

  const data = extractObject(output)
  let narrative = String(data?.narrative || data?.scene || data?.content || data?.正文 || data?.剧情 || '').trim()
  let rawOptions = data?.options || data?.choices || data?.actions || data?.选项 || []

  if (!Array.isArray(rawOptions) || !rawOptions.length) {
    const inline = extractInlineOptions(narrative)
    if (inline.options.length) {
      rawOptions = inline.options
      narrative = inline.narrative
    }
  }

  if (!narrative) throw new Error('生成内容为空，请重试')

  return {
    narrative,
    options: normalizeOptions(rawOptions),
  }
}
