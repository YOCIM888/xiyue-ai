import { onBeforeUnmount, ref } from 'vue'

/**
 * 浏览器语音输入（Web Speech API）
 * - onUpdate(text)：识别到内容（含临时结果）时回填输入框
 * - onFinish()：自然识别结束后触发，用于自动发送
 * 手动停止时只结束识别并保留已识别文字，不自动发送。
 */
export function useVoiceInput({ getBaseText = () => '', onUpdate = () => {}, onFinish = () => {} } = {}) {
  const listening = ref(false)
  let recognition = null
  let micStream = null
  let finalText = ''
  let starting = false
  let manualStop = false
  let session = 0

  // 真正释放麦克风：停止我们持有的音轨
  function releaseMic() {
    if (micStream) {
      micStream.getTracks().forEach(track => {
        try { track.stop() } catch {}
      })
      micStream = null
    }
  }

  function stop() {
    session += 1
    manualStop = true
    starting = false
    listening.value = false
    const rec = recognition
    recognition = null
    if (rec) {
      try { rec.abort() } catch {}
    }
    releaseMic()
  }

  async function start() {
    if (starting || recognition) return
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!Ctor) {
      window.__ui?.showToast('当前浏览器不支持语音输入，请使用 Chrome 或 Edge', 'error', 3500)
      return
    }

    const id = ++session
    starting = true
    manualStop = false
    finalText = ''
    const baseText = (getBaseText() || '').trim()

    // 先申请麦克风并持有音轨，停止时才能真正释放设备
    if (navigator.mediaDevices?.getUserMedia) {
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      } catch {
        starting = false
        listening.value = false
        window.__ui?.showToast('麦克风权限被拒绝，请在浏览器设置中允许后重试', 'error', 3500)
        return
      }
      // 等待权限期间用户已点击停止
      if (id !== session || manualStop) {
        releaseMic()
        starting = false
        return
      }
    }

    const rec = new Ctor()
    recognition = rec
    recognition.lang = navigator.language || 'zh-CN'
    recognition.continuous = false
    recognition.interimResults = true
    recognition.maxAlternatives = 1

    recognition.onstart = () => {
      if (id === session) listening.value = true
    }

    recognition.onresult = (event) => {
      if (id !== session) return
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
      if (id !== session) return
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
      if (id !== session) return
      listening.value = false
      recognition = null
      starting = false
      releaseMic()
      if (!manualStop && finalText.trim()) onFinish()
    }

    try {
      recognition.start()
    } catch {
      if (id === session) {
        listening.value = false
        recognition = null
      }
      releaseMic()
    } finally {
      starting = false
    }
  }

  function toggle() {
    if (listening.value || starting) stop()
    else start()
  }

  onBeforeUnmount(() => {
    stop()
  })

  return { listening, toggle }
}
