import { computed, nextTick, ref, watch, onUnmounted } from 'vue'
import { useStarryStore } from '../../stores/starry'
import { useSettingsStore } from '../../stores/settings'
import { useMemoryStore } from '../../stores/memory'
import { compressImageDataUrl } from '../../utils/image'
import { generateCharacterReply, isApiConfigured, selectRepliers, buildSystemPrompt, buildHistory } from '../../services/starry'
import { estimateMessagesTokens } from '../../utils/contextUsage'
import { buildStarryMemoryContext } from './starryMemoryContext'
import { fmtClock, fmtDivider, needsDivider } from './starryTime'

/**
 * 探索星空聊天窗口的状态与行为：消息、搜索、引用、发送、图片与更多菜单。
 * 模板保留在 StarryChat.vue，这里只负责逻辑，便于单测与复用。
 */
export function useStarryChat(props, emit) {
  const store = useStarryStore()
  const settings = useSettingsStore()
  const memory = useMemoryStore()

  function memoryContextFor(friend, group = null) {
    return buildStarryMemoryContext({ friend, group, store, memory })
  }

  const messagesEl = ref(null)
  const inputEl = ref(null)
  const imageInput = ref(null)
  const input = ref('')
  const pendingImages = ref([])

  const messages = computed(() => store.messages)
  const userName = computed(() => settings.userName || '我')
  const searchOpen = ref(false)
  const searchQuery = ref('')
  const quotedMessage = ref(null)

  const displayedMessages = computed(() => {
    const needle = searchQuery.value.trim().toLowerCase()
    if (!needle) return messages.value
    return messages.value.filter(message =>
      String(message.content || '').toLowerCase().includes(needle) ||
      String(message.senderName || '').toLowerCase().includes(needle)
    )
  })

  // 当前窗口实际会发送的上下文（角色设定 + 最近聊天记录）
  const contextUsed = computed(() => {
    if (props.type === 'group') {
      const memberId = (props.chat.members || [])[0]
      const member =
        store.friends.find(f => f.id === memberId) ||
        { id: memberId || 'member', name: props.chat.name, persona: '' }
      return estimateMessagesTokens([
        { role: 'system', content: buildSystemPrompt(member, props.chat, memoryContextFor(member, props.chat), settings.starryReplyLength) },
        ...buildHistory(member.id, messages.value),
      ])
    }
    const memoryContext = memoryContextFor(props.chat)
    return estimateMessagesTokens([
      { role: 'system', content: buildSystemPrompt(props.chat, null, memoryContext, settings.starryReplyLength) },
      ...buildHistory(props.chat.id, messages.value),
    ])
  })
  const contextLimit = computed(() => settings.contextLength || 131072)

  const typingVisible = computed(() =>
    store.sending && store.typingName && store.generatingChatId === props.chat.id
  )

  const subtitle = computed(() => {
    if (typingVisible.value) return `${store.typingName} 正在输入…`
    if (props.type === 'group') return `${props.chat.members.length + 1} 人`
    return '在线'
  })

  const placeholder = computed(() => {
    if (typingVisible.value) return '对方正在输入…'
    return props.type === 'group' ? '发消息…（输入 @ 可点名）' : '发消息…'
  })

  const canSend = computed(() =>
    (input.value.trim().length > 0 || pendingImages.value.length > 0) && !store.sending
  )

  const emptyTitle = computed(() =>
    props.type === 'group' ? `在「${props.chat.name}」聊聊吧` : `和${props.chat.name}聊聊吧`
  )
  const emptyDesc = computed(() =>
    props.type === 'group' && props.chat.members.length === 0
      ? '群聊暂无其他成员，可在右上角管理群成员'
      : '说点什么，让星光有回应'
  )

  const typingAvatar = computed(() =>
    store.friends.find(f => f.name === store.typingName)?.avatar || ''
  )

  const MOBILE_UA = /Android|iPhone|iPad|iPod|webOS/i.test(navigator.userAgent)
  const MAX_PENDING_IMAGES = 3

  function senderAvatar(m) {
    if (m.role !== 'character') return ''
    return store.friends.find(f => f.id === m.senderId)?.avatar || ''
  }

  function showDivider(i) {
    return needsDivider(displayedMessages.value, i)
  }

  function scrollToBottom() {
    nextTick(() => {
      const el = messagesEl.value
      if (el) el.scrollTop = el.scrollHeight
    })
  }

  async function loadOlder() {
    const el = messagesEl.value
    const prevHeight = el?.scrollHeight || 0
    const prevTop = el?.scrollTop || 0
    const added = store.loadOlderMessages()
    if (!added) return
    await nextTick()
    if (el) el.scrollTop = el.scrollHeight - prevHeight + prevTop
  }

  function toggleSearch() {
    searchOpen.value = !searchOpen.value
    if (!searchOpen.value) searchQuery.value = ''
  }

  function closeSearch() {
    searchOpen.value = false
    searchQuery.value = ''
  }

  async function copyMessage(message) {
    const text = String(message.content || '')
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      window.__ui?.showToast('已复制', 'success', 1600)
    } catch {
      window.__ui?.showToast('复制失败', 'error', 2000)
    }
  }

  function quoteMessage(message) {
    quotedMessage.value = {
      senderName: message.role === 'user' ? (settings.userName || '我') : (message.senderName || props.chat.name),
      content: String(message.content || '').slice(0, 120),
    }
    nextTick(() => inputEl.value?.focus())
  }

  async function removeMessage(message) {
    const ok = await window.__ui?.showConfirm('删除这条消息？此操作不可撤销。', {
      confirmText: '删除',
      cancelText: '取消',
    })
    if (!ok) return
    const removed = store.deleteMessage(message.id, props.chat.id)
    if (removed) window.__ui?.showToast('消息已删除', 'success', 1800)
  }

  function exportChat() {
    const list = store.getAllMessages(props.chat.id)
    if (!list.length) {
      window.__ui?.showToast('当前会话没有可导出的内容', 'info', 2500)
      return
    }
    const lines = [
      `# ${props.chat.name}`,
      '',
      `> 导出时间：${new Date().toLocaleString()} · 探索星空`,
      '',
    ]
    for (const message of list) {
      const name = message.role === 'user' ? (settings.userName || '我') : (message.senderName || props.chat.name)
      if (message.quote) lines.push(`> 引用 ${message.quote.senderName}：${message.quote.content}`)
      lines.push(`**${name}**：${message.content || (message.images?.length ? '[图片]' : '')}`)
      lines.push('')
    }
    const safeName = String(props.chat.name || '星空聊天').replace(/[\\/:*?"<>|]/g, '_').slice(0, 50)
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${safeName}-${new Date().toISOString().slice(0, 10)}.md`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    window.__ui?.showToast('聊天记录已导出', 'success', 2000)
  }

  function openMentionMenu(e) {
    const members = (props.chat.members || [])
      .map(id => store.friends.find(friend => friend.id === id))
      .filter(Boolean)
    if (!members.length) {
      window.__ui?.showToast('群聊暂无其他成员', 'info', 2500)
      return
    }
    const rect = e.currentTarget.getBoundingClientRect()
    window.__ui?.showMenu(
      Math.max(12, rect.left - 80),
      rect.bottom + 6,
      members.map(friend => ({
        label: friend.name,
        action: () => {
          const text = input.value
          input.value = text ? `${text.replace(/\s+$/, '')} @${friend.name} ` : `@${friend.name} `
          nextTick(() => {
            inputEl.value?.focus()
            const length = input.value.length
            inputEl.value?.setSelectionRange(length, length)
            autoResize()
          })
        },
      }))
    )
  }

  watch(messages, () => scrollToBottom(), { deep: true })
  watch(() => store.typingName, () => scrollToBottom())
  watch(() => props.chat.id, () => {
    stopGenerating(true)
    input.value = ''
    pendingImages.value = []
    quotedMessage.value = null
    closeSearch()
    scrollToBottom()
  })

  onUnmounted(() => stopGenerating(true))

  let activeAbort = null

  function stopGenerating(silent = false) {
    if (activeAbort) {
      activeAbort.abort()
      activeAbort = null
    }
    store.resetRuntime()
    if (!silent) window.__ui?.showToast('已停止生成', 'info', 2000)
  }

  async function generateWithRetry(options, retries = 1) {
    let lastError
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        return await generateCharacterReply(options)
      } catch (err) {
        if (err?.name === 'AbortError') throw err
        lastError = err
        if (attempt < retries) await delay(600 + Math.random() * 400)
      }
    }
    throw lastError
  }

  function autoResize() {
    nextTick(() => {
      const el = inputEl.value
      if (!el) return
      el.style.height = 'auto'
      el.style.height = Math.min(el.scrollHeight, 120) + 'px'
    })
  }

  function onKeydown(e) {
    if (e.key !== 'Enter') return
    // 中文输入法候选确认时的 Enter 不当作发送
    if (e.isComposing || e.keyCode === 229) return
    // 手机端：Enter 只换行
    if (MOBILE_UA || window.innerWidth <= 768) return
    // 桌面端：Enter 发送，Shift+Enter 换行
    if (!e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  // ---- 图片发送 ----
  function triggerImageUpload() {
    imageInput.value?.click()
  }

  function onImagePicked(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !file.type.startsWith('image/')) return
    if (pendingImages.value.length >= MAX_PENDING_IMAGES) {
      window.__ui?.showToast(`单次最多发送 ${MAX_PENDING_IMAGES} 张图片`, 'info', 2600)
      return
    }

    const reader = new FileReader()
    reader.onload = async (ev) => {
      let dataUrl = await compressImageDataUrl(ev.target.result, {
        maxWidth: 1024,
        maxHeight: 1024,
        quality: 0.78,
        maxBytes: 800000,
      })
      if (dataUrl && dataUrl.length > 1200000) {
        dataUrl = await compressImageDataUrl(dataUrl, {
          maxWidth: 720,
          maxHeight: 720,
          quality: 0.68,
          maxBytes: 600000,
        })
      }
      if (!dataUrl) {
        window.__ui?.showToast('图片读取失败或体积过大，请换一张试试', 'error', 3000)
        return
      }
      if (pendingImages.value.length >= MAX_PENDING_IMAGES) {
        window.__ui?.showToast(`单次最多发送 ${MAX_PENDING_IMAGES} 张图片`, 'info', 2600)
        return
      }
      pendingImages.value.push(dataUrl)
    }
    reader.onerror = () => window.__ui?.showToast('图片读取失败，请换一张试试', 'error', 3000)
    reader.readAsDataURL(file)
  }

  async function send() {
    if (!canSend.value) return
    if (!isApiConfigured(settings)) {
      window.__ui?.showToast('请先在设置中配置模型 API', 'info', 3000)
      return
    }

    const text = input.value.trim()
    const images = pendingImages.value.slice(0, MAX_PENDING_IMAGES)
    const quote = quotedMessage.value ? { ...quotedMessage.value } : null
    const targetId = props.chat.id
    const targetType = props.type
    const targetChat = { ...props.chat }
    const senderName = settings.userName || '我'

    input.value = ''
    pendingImages.value = []
    quotedMessage.value = null
    nextTick(autoResize)

    store.appendMessage({
      role: 'user',
      senderId: 'me',
      senderName,
      content: text,
      ...(images.length ? { images } : {}),
      ...(quote ? { quote } : {}),
      ts: Date.now(),
    }, targetId)

    const controller = new AbortController()
    activeAbort = controller
    store.sending = true
    store.generatingChatId = targetId

    try {
      if (targetType === 'friend') {
        store.typingName = targetChat.name
        const replyPromise = generateWithRetry({
          friend: targetChat,
          messages: store.getMessages(targetId),
          settings,
          memoryContext: memoryContextFor(targetChat),
          signal: controller.signal,
        }, 1)
          .then(reply => ({ reply }))
          .catch(error => ({ error }))
        await delay(300 + Math.random() * 300)
        const outcome = await replyPromise
        if (outcome.error) throw outcome.error
        const reply = outcome.reply
        if (controller.signal.aborted) return
        store.appendMessage({
          role: 'character',
          senderId: targetChat.id,
          senderName: targetChat.name,
          content: reply,
          ts: Date.now(),
        }, targetId)
        return
      }

      const members = targetChat.members
        .map(id => store.friends.find(f => f.id === id))
        .filter(Boolean)

      if (!members.length) {
        window.__ui?.showToast('群聊暂无其他成员，可先添加成员', 'info', 2800)
        return
      }

      // @ 点名只让被点名者回复；普通消息优先相关角色，最多随机 3 位
      const mentions = members
        .filter(friend => text.includes(`@${friend.name}`))
        .map(friend => friend.id)
      const activityMax = settings.starryActivity === 'low' ? 1 : settings.starryActivity === 'high' ? 3 : 2
      const repliers = selectRepliers(members, { mentions, text, max: activityMax })
      if (!repliers.length) return

      store.typingName = repliers.length > 1
        ? `${repliers[0].name} 等 ${repliers.length} 人`
        : repliers[0].name
      if (controller.signal.aborted) return

      // 并行发起请求，按返回顺序错峰展示，避免串行等待
      const tasks = repliers.map(friend =>
        generateWithRetry({
          friend,
          group: targetChat,
          messages: store.getMessages(targetId),
          settings,
          memoryContext: memoryContextFor(friend, targetChat),
          signal: controller.signal,
        }, 1)
          .then(reply => ({ friend, reply }))
          .catch(error => ({ friend, error }))
      )

      await delay(250 + Math.random() * 250)
      for (let i = 0; i < tasks.length; i += 1) {
        const outcome = await tasks[i]
        if (controller.signal.aborted) break
        if (outcome.error) {
          if (outcome.error.name !== 'AbortError') {
            window.__ui?.showToast(`${outcome.friend.name} 回复失败：${outcome.error.message || '请稍后重试'}`, 'error', 3500)
          }
          continue
        }

        store.typingName = outcome.friend.name
        await delay(250 + Math.random() * 300)
        if (controller.signal.aborted) break
        store.appendMessage({
          role: 'character',
          senderId: outcome.friend.id,
          senderName: outcome.friend.name,
          content: outcome.reply,
          ts: Date.now(),
        }, targetId)
      }
    } catch (err) {
      if (err?.name !== 'AbortError') {
        window.__ui?.showToast(`回复失败：${err.message}`, 'error', 3500)
      }
    } finally {
      if (activeAbort === controller) activeAbort = null
      store.resetRuntime()
    }
  }

  function openMenu(e) {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = Math.max(12, rect.right - 180)
    const y = rect.bottom + 6
    if (props.type === 'friend') {
      window.__ui?.showMenu(x, y, [
        { label: '编辑资料', action: () => emit('open-friend', props.chat) },
        { label: '导出聊天记录', action: exportChat },
        { label: '清空聊天记录', action: clearChat },
        { label: '删除好友', action: deleteFriend },
      ])
    } else {
      window.__ui?.showMenu(x, y, [
        { label: '群成员管理', action: () => emit('open-group', props.chat) },
        { label: '导出聊天记录', action: exportChat },
        { label: '清空聊天记录', action: clearChat },
        { label: '删除群聊', action: deleteGroup },
      ])
    }
  }

  async function clearChat() {
    const ok = await window.__ui?.showConfirm('清空聊天记录后无法恢复，也不会再记得之前的对话，确定吗？')
    if (!ok) return
    store.clearChat(props.type, props.chat.id)
    window.__ui?.showToast('聊天记录已清空', 'success')
    scrollToBottom()
  }

  async function deleteFriend() {
    const ok = await window.__ui?.showConfirm('删除好友后，与她的聊天记录也会一起删除，确定吗？', { confirmText: '删除' })
    if (!ok) return
    store.removeFriend(props.chat.id)
    emit('deleted')
    window.__ui?.showToast('好友已删除', 'success')
  }

  async function deleteGroup() {
    const ok = await window.__ui?.showConfirm('删除群聊后，群内的聊天记录也会一起删除，确定吗？', { confirmText: '删除' })
    if (!ok) return
    store.removeGroup(props.chat.id)
    emit('deleted')
    window.__ui?.showToast('群聊已删除', 'success')
  }

  return {
    store,
    settings,
    messagesEl,
    inputEl,
    imageInput,
    input,
    pendingImages,
    messages,
    userName,
    searchOpen,
    searchQuery,
    quotedMessage,
    displayedMessages,
    contextUsed,
    contextLimit,
    typingVisible,
    subtitle,
    placeholder,
    canSend,
    emptyTitle,
    emptyDesc,
    typingAvatar,
    senderAvatar,
    fmtClock,
    fmtDivider,
    showDivider,
    loadOlder,
    toggleSearch,
    closeSearch,
    copyMessage,
    quoteMessage,
    removeMessage,
    openMentionMenu,
    stopGenerating,
    autoResize,
    onKeydown,
    triggerImageUpload,
    onImagePicked,
    send,
    openMenu,
  }
}
