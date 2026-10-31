import { onBeforeUnmount, ref } from 'vue'

/**
 * 浏览器语音输入（Web Speech API）
 * - onUpdate(text)：识别到内容（含临时结果）时回填输入框
 * - onFinish()：识别出最终文字后触发，用于自动发送
 */
export function useVoiceInput({ getBaseText = () => '', onUpdate = () => {}, onFinish = () => {} } = {}) {
  const listening = ref(false)
  let recognition = null
  let finalText = ''

  function stop() {
    recognition?.stop()
  }

  function toggle() {
    if (listening.value) stop()
    else start()
  }

  function start() {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!Ctor) {
      window.__ui?.showToast('当前浏览器不支持语音输入，请使用 Chrome 或 Edge', 'error', 3500)
      return
    }

    const baseText = (getBaseText() || '').trim()
    finalText = ''
    recognition = new Ctor()
    recognition.lang = navigator.language || 'zh-CN'
    recognition.continuous = false
    recognition.interimResults = true
    recognition.maxAlternatives = 1

    recognition.onstart = () => { listening.value = true }

    recognition.onresult = (event) => {
      let interim = ''
      finalText = ''
      for (let i = 0; i < event.results.length; i += 1) {
        const result = event.results[i]
        const text = result[0]?.transcript || ''
        if (result.isFinal) finalText += text
        else interim += text
      }
      const spoken = finalText || interim
      onUpdate([baseText, spoken].filter(t => t && t.trim()).join(' '))
    }

    recognition.onerror = (event) => {
      listening.value = false
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        window.__ui?.showToast('麦克风权限被拒绝，请在浏览器设置中允许后重试', 'error', 3500)
      } else if (event.error === 'no-speech') {
        window.__ui?.showToast('没有检测到语音，请再说一次', 'info', 2800)
      } else if (event.error !== 'aborted') {
        window.__ui?.showToast(`语音识别失败：${event.error}`, 'error', 3000)
      }
    }

    recognition.onend = () => {
      listening.value = false
      recognition = null
      if (finalText.trim()) onFinish()
    }

    try {
      recognition.start()
    } catch {
      listening.value = false
      recognition = null
    }
  }

  onBeforeUnmount(() => {
    recognition?.abort()
    recognition = null
  })

  return { listening, toggle }
}
