import { ref } from 'vue'

/**
 * 跨组件的输入框草稿。
 * 工作区面板挂在 App 上、输入框只在 /chat 路由里，「发给 AI 修」可能发生在没有输入框的页面；
 * 先存到这里，ChatInput 挂载时用 immediate watch 取走，路由跳转就不会把内容丢掉。
 * 只放纯文本：往对话里倒结构化数据是明确禁止的。
 */
export const chatDraft = ref('')

export function requestChatDraft(text) {
  const value = String(text ?? '').trim()
  if (!value) return false
  chatDraft.value = value
  return true
}

/** 取走并清空：草稿只投递一次，重复挂载不该把它再塞一遍 */
export function takeChatDraft() {
  const value = chatDraft.value
  chatDraft.value = ''
  return value
}
