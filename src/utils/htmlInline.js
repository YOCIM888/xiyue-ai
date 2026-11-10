const MIME_BY_EXT = {
  html: 'text/html',
  htm: 'text/html',
  css: 'text/css',
  js: 'text/javascript',
  mjs: 'text/javascript',
  json: 'application/json',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
  eot: 'application/vnd.ms-fontobject',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  txt: 'text/plain',
  md: 'text/plain',
}

const EXTERNAL_URL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i

export function mimeFromPath(path) {
  const name = String(path || '').split(/[?#]/)[0]
  const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : ''
  return MIME_BY_EXT[ext] || 'application/octet-stream'
}

export function isTextMime(mime) {
  return /^text\/|javascript|json|svg/i.test(String(mime || ''))
}

/**
 * 把网页里的相对资源地址解析成工作区相对路径。
 * 外部地址、data/blob、锚点返回 null；越出工作区根的 .. 也返回 null。
 */
export function resolveAssetPath(baseSegments, href) {
  const raw = String(href ?? '').trim()
  if (!raw || raw.startsWith('#')) return null
  if (EXTERNAL_URL.test(raw)) return null
  const clean = raw.split('#')[0].split('?')[0]
  if (!clean) return null
  const segments = clean.startsWith('/') ? [] : [...(baseSegments || [])]
  for (const part of clean.replace(/^\/+/, '').split('/')) {
    if (!part || part === '.') continue
    if (part === '..') {
      if (!segments.length) return null
      segments.pop()
      continue
    }
    segments.push(part)
  }
  return segments.length ? segments.join('/') : null
}

/** 重写 CSS 里的 url(...)；mapUrl 返回 null 时保留原样 */
export function rewriteCssUrls(css, mapUrl) {
  return String(css || '').replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (match, quote, url) => {
    const mapped = mapUrl(String(url).trim())
    return mapped ? `url("${mapped}")` : match
  })
}

/** 重写 img/source 的 srcset，逐项解析相对路径 */
export function rewriteSrcset(value, mapUrl) {
  return String(value || '')
    .split(',')
    .map(item => {
      const [url, ...descriptor] = item.trim().split(/\s+/)
      if (!url) return ''
      const mapped = mapUrl(url)
      return [mapped || url, ...descriptor].join(' ')
    })
    .filter(Boolean)
    .join(', ')
}
