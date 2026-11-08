/**
 * 图片压缩（Canvas）。上传与请求前共用这一套逻辑，避免重复实现。
 * 默认参数与原有上传行为完全一致：宽度超过 1024 才缩放，JPEG 质量 0.8。
 */
const DEFAULT_OPTIONS = {
  maxWidth: 1024,
  maxHeight: Infinity,
  quality: 0.8,
  maxBytes: Infinity,
}

// 图片理解 / OCR：优先保证文字清晰度，长边 1600、较高质量
export const OCR_IMAGE_OPTIONS = {
  maxWidth: 1600,
  maxHeight: 3000,
  quality: 0.86,
  maxBytes: 1200000,
}

// 多图时降低单张体积，避免上下文被图片撑爆
export const OCR_IMAGE_OPTIONS_MANY = {
  maxWidth: 1280,
  maxHeight: 2400,
  quality: 0.82,
  maxBytes: 900000,
}

/**
 * 压缩 DataURL 图片。
 * @param {string} dataUrl
 * @param {{ maxWidth?: number, maxHeight?: number, quality?: number, maxBytes?: number }} options
 * @returns {Promise<string|null>} 压缩后的 DataURL；无法解码时返回 null
 */
export function compressImageDataUrl(dataUrl, options = {}) {
  const { maxWidth, maxHeight, quality, maxBytes } = { ...DEFAULT_OPTIONS, ...options }
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width, maxHeight / img.height)
      // 尺寸与体积都在预算内则原样返回，不重新编码
      if (scale >= 1 && dataUrl.length <= maxBytes) {
        resolve(dataUrl)
        return
      }
      const canvas = document.createElement('canvas')
      canvas.width = img.width * scale
      canvas.height = img.height * scale
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => resolve(null)
    img.src = dataUrl
  })
}
