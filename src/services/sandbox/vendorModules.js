/**
 * 沙箱内置垫片：把有限的几个裸模块名解析成图里的普通模块，其余裸名仍然拒绝。
 * 之所以能在 opaque origin 的 iframe 里用，是因为源码文本由宿主随 payload 一起送进去，
 * 再由沙箱自己做成 blob URL —— 不需要放开沙箱的网络权限。
 */

const JSX_RUNTIME = `import { h, Fragment } from "vendor/vue.js"

function jsx(type, props, key) {
  const children = props.children
  delete props.children
  if (arguments.length > 2) props.key = key
  return h(type, props, children)
}

export { Fragment, jsx, jsx as jsxs, jsx as jsxDEV }
`

const VUE_MOUNT = `import { createApp, nextTick } from "vendor/vue.js"

export async function mountForTest(component, props) {
  const host = document.createElement("div")
  document.body.appendChild(host)
  const problems = []
  const app = createApp(component, props)
  app.config.errorHandler = err => { problems.push(err) }
  app.config.warnHandler = msg => { problems.push(new Error(msg)) }
  app.mount(host)
  await nextTick()
  const result = { text: host.textContent.trim(), html: host.innerHTML }
  app.unmount()
  host.remove()
  if (problems.length) {
    const first = problems[0]
    if (first instanceof Error) {
      // 原样抛出才能保留组件内的调用栈，宿主随后会把 blob URL 换回源文件行号
      first.message = '组件渲染报错：' + first.message
      throw first
    }
    throw new Error('组件渲染报错：' + problems.map(item => String(item)).join('；'))
  }
  return result
}

export { nextTick }
`

async function loadVueRuntime() {
  const module = await import('vue/dist/vue.esm-browser.prod.js?raw')
  return String(module.default)
}

export const VENDOR_MODULES = {
  'vue': { path: 'vendor/vue.js', load: loadVueRuntime },
  'vue/jsx-runtime': { path: 'vendor/vue-jsx-runtime.js', text: () => JSX_RUNTIME, requires: ['vendor/vue.js'] },
  'xiyue:vue-mount': { path: 'vendor/vue-mount.js', text: () => VUE_MOUNT, requires: ['vendor/vue.js'] },
}

export const VUE_MOUNT_SPECIFIER = 'xiyue:vue-mount'
export const VUE_MOUNT_PATH = VENDOR_MODULES[VUE_MOUNT_SPECIFIER].path

export function vendorBySpecifier(specifier) {
  return VENDOR_MODULES[String(specifier ?? '').trim()] || null
}

export function vendorByPath(path) {
  const target = String(path ?? '')
  for (const entry of Object.values(VENDOR_MODULES)) {
    if (entry.path === target) return entry
  }
  return null
}

/** 垫片源码：静态的直接返回，vue 运行时首次用到才拉 168 KB */
export async function vendorText(entry) {
  return entry.text ? entry.text() : await entry.load()
}

/** 组件冒烟测试入口：run 一个 .vue 时合成的宿主模块代码（挂在虚拟根目录，所以路径要带 ./） */
export function vueEntryHostCode(componentPath) {
  return [
    'import { mountForTest } from "xiyue:vue-mount"',
    `import Component from "./${componentPath}"`,
    '',
    'export default () => mountForTest(Component)',
    '',
  ].join('\n')
}
