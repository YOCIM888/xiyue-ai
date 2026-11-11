import { buildCharacterMemoryContext } from '../../utils/memoryContext'

/** 私聊/群聊的关系状态与长期记忆上下文，供角色回复与上下文用量估算共用。 */
export function buildStarryMemoryContext({ friend, group = null, store, memory }) {
  const chatId = group ? group.id : friend.id
  const list = store.getMessages(chatId)
  const userMessages = list.filter(m => m.role === 'user' && m.content)
  let relation = ''
  if (userMessages.length) {
    const count = userMessages.length
    const level = count >= 60 ? '很熟悉' : count >= 20 ? '比较熟悉' : count >= 5 ? '逐渐熟悉' : '刚刚认识'
    const topics = userMessages
      .slice(-5)
      .map(m => String(m.content).replace(/\s+/g, ' ').slice(0, 30))
      .join('；')
    relation = `【关系状态】\n你与用户已经进行了约 ${count} 轮对话，关系${level}。最近聊到：${topics}。请自然延续，不要生硬复述。`
  }
  return [relation, buildCharacterMemoryContext({ friend, group, memoryStore: memory, starryStore: store })]
    .filter(Boolean)
    .join('\n\n')
}
