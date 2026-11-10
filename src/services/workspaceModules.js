/**
 * 把 moduleGraph 接到真实工作区：目录清单、模块原文、垫片源码与编译四项 IO。
 * 依赖图、拓扑序与缺失原因的逻辑都在 sandbox/moduleGraph.js（纯函数，可单测）。
 */
import { listDir, readModuleText } from './workspace'
import { buildGraph, MAX_MODULE_FILES, MAX_MODULE_TOTAL_BYTES, VIRTUAL_ENTRY } from './sandbox/moduleGraph'
import { createCompiler } from './sandbox/compile'
import { vendorByPath, vendorText } from './sandbox/vendorModules'

export { MAX_MODULE_FILES, MAX_MODULE_TOTAL_BYTES, VIRTUAL_ENTRY }

async function listFiles(dirPath) {
  const { entries } = await listDir(dirPath)
  return {
    files: new Set(entries.filter(item => item.kind === 'file').map(item => item.name)),
    dirs: new Set(entries.filter(item => item.kind === 'dir').map(item => item.name)),
  }
}

async function readText(path) {
  return (await readModuleText(path)).text
}

async function readVendor(path) {
  const entry = vendorByPath(path)
  if (!entry) throw new Error(`沙箱没有内置模块 ${path}`)
  return await vendorText(entry)
}

// 转译结果按 路径+内容 缓存，跨轮次复用：模型反复重跑同一份测试只转一次
const compileCache = new Map()

/**
 * @param {string} entry  入口文件路径（.js/.ts/.tsx/.jsx/.vue/.json）
 * @param {string} code   单个内联入口代码（挂在工作区根目录，只支持 JS）
 * @param {Array<{path: string, text: string}>} inline 多个内联模块，路径含宿主文档所在目录
 * @param {string[]} deps 额外进图的模块路径
 * @param {boolean} allowBare 裸模块名与绝对地址原样保留（预览用 importmap 指到 CDN）
 */
export function collectModules({
  entry = '', code = '', inline = [], deps = [], allowBare = false, maxFiles, maxBytes, onStatus,
} = {}) {
  const io = { listFiles, readText, readVendor, compile: createCompiler({ onStatus, cache: compileCache }) }
  return buildGraph({ io, entry, code, inline, deps, allowBare, maxFiles, maxBytes })
}
