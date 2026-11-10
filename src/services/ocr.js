/**
 * 图片理解 / OCR 技能：视觉能力判断、请求前图片压缩、识别指令。
 * 这里只负责把图片交给支持视觉的模型读字，不做本地 OCR。
 */
import {
  compressImageDataUrl,
  OCR_IMAGE_OPTIONS,
  OCR_IMAGE_OPTIONS_MANY,
} from '../utils/image'

// 单次最多参与识别的图片数，避免多图把上下文撑爆
export const OCR_MAX_IMAGES = 6

// 明确支持视觉的模型特征
const VISION_MODEL_RE =
  /(vision|vl|gpt-4o|gpt-4\.1|gpt-5|gpt-6|claude|gemini|llava|minicpm-v|janus|glm-4v|glm-4\.5v|glm-4\.6v|internvl|pixtral|molmo|omni|qwen.*vl)/i

// 明确为纯文本的模型特征
const TEXT_ONLY_MODEL_RE =
  /(deepseek-(chat|reasoner|coder|r1|v[0-3]|flash)|deepseek-r1|gpt-3\.5|text-davinci|o1-mini|llama-?[23]|mistral)/i

// 接口返回「不支持图片」类错误的关键词
const VISION_ERROR_RE =
  /(vision|multimodal|image_url|image input|invalid image|unsupported image|image.{0,20}(not supported|unsupported)|(does not support|not support).{0,20}image|(不支持|无法识别|无法处理).{0,12}图片|图片.{0,12}(不支持|无法识别|不被支持))/i

/**
 * 判断模型视觉能力。
 * @param {string} model 模型名
 * @param {string} apiBase 接口地址
 * @param {'auto'|'vision'|'text'} mode 用户配置：自动 / 支持图片 / 纯文本
 * @returns {'vision'|'text'|'unknown'} unknown 表示需要调用接口后再按错误判断
 */
export function detectVisionSupport(model, _apiBase = '', mode = 'auto') {
  if (mode === 'vision') return 'vision'
  if (mode === 'text') return 'text'
  const name = String(model || '')
  if (!name) return 'unknown'
  if (VISION_MODEL_RE.test(name)) return 'vision'
  if (TEXT_ONLY_MODEL_RE.test(name)) return 'text'
  return 'unknown'
}

/** 接口错误是否表示当前模型不支持图片 */
export function isVisionUnsupportedError(message) {
  return VISION_ERROR_RE.test(String(message || ''))
}

/**
 * 请求前控制图片体积：最多 6 张，多图时进一步降低清晰度。
 * @param {string[]} images
 * @returns {Promise<{ images: string[], dropped: number }>}
 */
export async function prepareOcrImages(images) {
  const source = Array.isArray(images) ? images.filter(Boolean) : []
  const kept = source.slice(0, OCR_MAX_IMAGES)
  const options = kept.length > 3 ? OCR_IMAGE_OPTIONS_MANY : OCR_IMAGE_OPTIONS
  const prepared = []
  for (const url of kept) {
    const compressed = await compressImageDataUrl(url, options)
    prepared.push(compressed || url)
  }
  return { images: prepared, dropped: source.length - kept.length }
}

// 追加到最后一条用户消息上的识别指令
export const OCR_INSTRUCTION = [
  '【图片理解任务】本次消息包含图片，请优先识别图片中的文字与关键内容：',
  '1. 先按阅读顺序逐字提取图片中的文字，保留数字、单位、标点，以及表格 / 列表的原有结构；',
  '2. 再概括关键信息（标题、字段、金额、日期、人名、结论等）；',
  '3. 字迹模糊或无法确认的内容标注「不确定」，不要猜测或编造；',
  '4. 如果图片中没有文字，再描述主要画面与关键内容。',
  '如果你无法读取图片，请直接说明，不要假装看懂了图片内容。',
].join('\n')
