/**
 * AI 生图：走副模型 API（智谱 images/generations，OpenAI 风格返回 data[].url）。
 * 需要用户在「设置 → 模型设置 → 副模型 API」中配置 Base URL、API Key 与生图模型。
 */

const TIMEOUT_MS = 60000
const MAX_ATTEMPTS = 2
const RETRY_DELAY_MS = 1500

const IMAGE_NOUN = /(图片|插画|插图|海报|头像|壁纸|logo|图标|封面|表情包|配图|示意图|图|banner|image|picture|illustration|poster|avatar|wallpaper|icon)/i
const IMAGE_VERB = /(画|绘制|生成|制作|设计|做|来|paint|draw|generate|create|make)/i
const VERB_NOUN_PAIR = /(画|绘制|生成|制作|设计|做|来)\s*[^。！？!?\n]{0,25}(图片|插画|插图|海报|头像|壁纸|logo|图标|封面|表情包|配图|示意图|图|banner|image|picture|illustration|poster|avatar|wallpaper|icon)/i
const DRAW_START = /^(?:请|帮我|帮忙|给我|为我|来)?\s*(?:画|绘制)\s*(?:一|一个|一张|一幅|只|个|张|幅)?\s*[^。！？!?\n]+/i
const EXPLICIT = /^\/(?:draw|image|img|画图|生图)\s*([\s\S]+)/i
// 读图 / 代码 / 文档 / 数据图表等场景不要误触发生图
const EXCLUDE = /(图片理解|识别图片|读图|ocr|这张图|这幅图|这张图片|图里|图中|截图|代码|表格|文档|生成的图|图片描述|图片的说明|描述图片|图表|折线图|柱状图|条形图|饼图|散点图|趋势图|可视化|chart)/i

/**
 * 判断是否在描述一次生图需求，返回用于生成的提示词；不是则返回空字符串。
 * @param {string} text 用户输入
 * @param {boolean} hasAttachedImages 是否附带图片（附带图片时优先走图片理解）
 */
export function detectImageIntent(text, hasAttachedImages = false) {
  const raw = String(text ?? '').trim()
  if (!raw || raw.length > 500 || hasAttachedImages) return ''

  const explicit = raw.match(EXPLICIT)
  if (explicit) return explicit[1].trim()

  if (EXCLUDE.test(raw)) return ''
  if (!IMAGE_VERB.test(raw) || (!IMAGE_NOUN.test(raw) && !DRAW_START.test(raw))) return ''

  if (VERB_NOUN_PAIR.test(raw) || DRAW_START.test(raw)) return raw
  return ''
}

/** 不同生图模型推荐的默认尺寸 */
function defaultSize(model) {
  return /glm-image/i.test(String(model || '')) ? '1280x1280' : '1024x1024'
}

function imagesEndpoint(apiBase) {
  return `${String(apiBase || '').replace(/\/+$/, '')}/images/generations`
}

/**
 * 生成图片。
 * @param {string} prompt 提示词
 * @param {object} options
 * @param {string} options.apiBase 副模型 Base URL
 * @param {string} options.apiKey 副模型 API Key
 * @param {string} options.model 生图模型，默认 glm-image
 * @param {string} options.size 可选尺寸
 * @returns {Promise<{ok:true, url:string, dataUrl:string} | {ok:false, message:string}>}
 */
export async function generateImage(prompt, { apiBase, apiKey, model = 'glm-image', size, signal } = {}) {
  const text = String(prompt ?? '').trim()
  if (!text) return { ok: false, message: '生成提示词为空' }
  if (!apiBase || !apiKey) {
    return { ok: false, message: '尚未配置副模型 API，无法生成图片' }
  }

  const url = imagesEndpoint(apiBase)
  const body = {
    model: String(model || 'glm-image'),
    prompt: text,
    size: size || defaultSize(model),
  }

  let lastMessage = '图片生成失败'
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: signal || AbortSignal.timeout(TIMEOUT_MS),
      })

      if (!resp.ok) {
        const detail = await readError(resp)
        if (resp.status === 401 || resp.status === 403) {
          return { ok: false, message: `副模型 API Key 无效或无生图权限（HTTP ${resp.status}）${detail ? `：${detail}` : ''}` }
        }
        if (resp.status === 429) {
          return { ok: false, message: `生图请求过于频繁（429），请稍后再试${detail ? `：${detail}` : ''}` }
        }
        if (resp.status >= 500) lastMessage = `生图服务暂时不可用（HTTP ${resp.status}）`
        else lastMessage = `图片生成失败（HTTP ${resp.status}）${detail ? `：${detail}` : ''}`
        if ((resp.status === 429 || resp.status >= 500) && attempt < MAX_ATTEMPTS) {
          await delay(RETRY_DELAY_MS)
          continue
        }
        return { ok: false, message: lastMessage }
      }

      const json = await resp.json()
      const item = Array.isArray(json?.data) ? json.data[0] : null
      if (!item) {
        const detail = json?.error?.message
        return { ok: false, message: `图片生成失败${detail ? `：${detail}` : '：接口未返回图片'}` }
      }

      // 优先使用 b64_json；只有 url 时尝试转 data URL，失败则保留远程地址
      if (item.b64_json) {
        const dataUrl = `data:image/png;base64,${item.b64_json}`
        return { ok: true, url: '', dataUrl }
      }
      const remoteUrl = String(item.url || '')
      if (!remoteUrl) return { ok: false, message: '图片生成失败：接口未返回图片地址' }

      // 图片链接是临时地址（30 天），且源站不允许跨域读取；
      // 直接拿不到时走图片代理转成 data URL，避免之后无法下载/失效
      const blob = await fetchImageBlob(remoteUrl)
      const dataUrl = blob ? await blobToDataUrl(blob) : ''

      return { ok: true, url: remoteUrl, dataUrl }
    } catch (err) {
      if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
        lastMessage = `图片生成超时（${TIMEOUT_MS / 1000} 秒），请稍后重试`
      } else {
        lastMessage = '图片生成失败：无法连接副模型生图接口（网络或跨域限制）'
      }
      if (attempt < MAX_ATTEMPTS) {
        await delay(RETRY_DELAY_MS)
        continue
      }
      return { ok: false, message: lastMessage }
    }
  }
  return { ok: false, message: lastMessage }
}

async function readError(resp) {
  try {
    const text = await resp.text()
    try {
      const json = JSON.parse(text)
      return String(json?.error?.message || json?.message || '').trim()
    } catch {
      return text.trim().slice(0, 120)
    }
  } catch {
    return ''
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** 先直连取图，跨域被拒时退回图片代理（源站 CDN 未开放 CORS） */
async function fetchImageBlob(url) {
  const attempts = [
    url,
    `https://images.weserv.nl/?url=${encodeURIComponent(url)}`,
  ]
  for (const target of attempts) {
    try {
      const resp = await fetch(target, { signal: AbortSignal.timeout(30000) })
      if (!resp.ok) continue
      const blob = await resp.blob()
      if (blob.type.startsWith('image/')) return blob
    } catch { /* 尝试下一种方式 */ }
  }
  return null
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('read error'))
    reader.readAsDataURL(blob)
  })
}
