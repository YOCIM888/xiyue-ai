/* 预览的模块加载层：宿主已经把 <script type="module"> 换成 import "canonical 路径"，
 * 这里把随文档一起注入的模块源码做成 blob URL，再用一张 importmap 把 canonical 路径、
 * 裸模块名（CDN）与页面自带的映射串起来 —— 跨文件 import、循环依赖、顶层 await
 * 全部交给浏览器原生 ESM 加载器，语义不掺假。
 *
 * importmap 必须在解析到 body 之前插入，否则后面的模块脚本解析不到 specifier，
 * 所以本文件由 head 最前面的运行时脚本同步调用。
 * 它和 previewPaths.js（去掉 export）、previewBoot.js 包在同一个 IIFE 里注入，
 * 因此这里只是普通函数声明：不能出现 import / export，也不能出现字面量的 script 结束标签。
 */
/* eslint-disable-next-line no-unused-vars -- 调用点在 previewBoot.js，三段源码拼进同一个 IIFE */
function loadPreviewModules(config) {
  const list = Array.isArray(config?.modules) ? config.modules : []
  const pathsByUrl = new Map()
  const modules = {}
  for (const item of list) {
    const path = String(item?.path || '')
    if (!path) continue
    const url = URL.createObjectURL(new Blob([String(item?.text ?? '')], { type: 'text/javascript' }))
    modules[path] = url
    pathsByUrl.set(url, path)
  }
  const bare = (Array.isArray(config?.bare) ? config.bare : []).map(item => String(item)).filter(Boolean)
  const map = buildImportMap({ modules, bare, page: config?.pageImports || null })
  if (!Object.keys(map.imports).length && !map.scopes) return { count: 0, bare, pathsByUrl }

  const script = document.createElement('script')
  script.type = 'importmap'
  // 走 DOM API 赋值，不需要再转义 script 结束标签
  script.textContent = JSON.stringify(map)
  ;(document.head || document.documentElement).prepend(script)
  // 实时刷新会一份份换文档，blob URL 不主动释放会一直攒下去
  window.addEventListener('pagehide', () => {
    for (const url of pathsByUrl.keys()) URL.revokeObjectURL(url)
  }, { once: true })
  return { count: pathsByUrl.size, bare, pathsByUrl }
}
