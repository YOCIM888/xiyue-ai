import { describe, expect, it } from 'vitest'
import {
  isTextMime, mimeFromPath, resolveAssetPath, rewriteCssUrls, rewriteSrcset,
} from '../src/utils/htmlInline'

describe('resolveAssetPath', () => {
  it('解析同级与子目录资源', () => {
    expect(resolveAssetPath(['pages'], 'style.css')).toBe('pages/style.css')
    expect(resolveAssetPath([], 'js/app.js')).toBe('js/app.js')
  })

  it('支持 ../ 回到上级目录', () => {
    expect(resolveAssetPath(['pages', 'sub'], '../img/a.png')).toBe('pages/img/a.png')
    expect(resolveAssetPath(['a'], '../b.css')).toBe('b.css')
  })

  it('拒绝越出工作区根目录', () => {
    expect(resolveAssetPath([], '../secret.txt')).toBeNull()
    expect(resolveAssetPath(['a'], '../../x.png')).toBeNull()
  })

  it('忽略查询串与锚点', () => {
    expect(resolveAssetPath([], 'app.js?v=2#main')).toBe('app.js')
    expect(resolveAssetPath([], '#top')).toBeNull()
  })

  it('跳过外部地址与内联地址', () => {
    expect(resolveAssetPath([], 'https://example.com/a.css')).toBeNull()
    expect(resolveAssetPath([], '//cdn.example.com/a.js')).toBeNull()
    expect(resolveAssetPath([], 'data:text/css,body{}')).toBeNull()
    expect(resolveAssetPath([], 'blob:https://x/y')).toBeNull()
    expect(resolveAssetPath([], 'javascript:void(0)')).toBeNull()
  })

  it('以 / 开头按工作区根目录解析', () => {
    expect(resolveAssetPath(['pages'], '/assets/logo.png')).toBe('assets/logo.png')
  })
})

describe('rewriteCssUrls', () => {
  const map = url => (url === 'a.png' ? 'data:image/png;base64,AAA' : null)

  it('替换带引号与不带引号的 url', () => {
    const css = '.a{background:url(a.png)}.b{background:url("a.png")}.c{src:url(\'a.png\')}'
    expect(rewriteCssUrls(css, map).match(/data:image\/png;base64,AAA/g)).toHaveLength(3)
  })

  it('map 返回 null 时保留原样', () => {
    const css = '.a{background:url(missing.png)}'
    expect(rewriteCssUrls(css, map)).toBe(css)
  })

  it('非 url 文本不变', () => {
    const css = 'body{color:red}'
    expect(rewriteCssUrls(css, map)).toBe(css)
  })
})

describe('rewriteSrcset', () => {
  it('逐个替换并保留尺寸描述符', () => {
    const map = url => (url === 'a.png' ? 'data:a' : url === 'b.png' ? 'data:b' : null)
    expect(rewriteSrcset('a.png 1x, b.png 2x', map)).toBe('data:a 1x, data:b 2x')
  })

  it('未映射的地址保持原样', () => {
    expect(rewriteSrcset('c.png 1x', () => null)).toBe('c.png 1x')
  })
})

describe('mimeFromPath', () => {
  it('按扩展名返回 MIME', () => {
    expect(mimeFromPath('a/b/style.css')).toBe('text/css')
    expect(mimeFromPath('logo.SVG')).toBe('image/svg+xml')
    expect(mimeFromPath('app.js?v=1')).toBe('text/javascript')
    expect(mimeFromPath('unknown.bin')).toBe('application/octet-stream')
  })

  it('识别文本类型', () => {
    expect(isTextMime('text/css')).toBe(true)
    expect(isTextMime('image/svg+xml')).toBe(true)
    expect(isTextMime('image/png')).toBe(false)
  })
})
