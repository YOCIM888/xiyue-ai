/**
 * OPFS 内存桩：Node 测试环境没有 navigator.storage.getDirectory，也没有真实的
 * FileSystemDirectoryHandle，这里只按 workspace.js 用到的语义实现。
 *
 * 与真实 OPFS 对齐的行为：NotFoundError / TypeMismatchError / InvalidModificationError、
 * createWritable 的「暂存到 close() 才提交」、values() 异步迭代、覆盖写更新 lastModified。
 *
 * 一处刻意的差异：getFile() 返回 Uint8Array 子类而不是 Blob/File。JSZip v3 在 Node 下读不了
 * Blob（它的 Blob 分支依赖浏览器 FileReader），而工作区代码只用到 size / lastModified /
 * text() / arrayBuffer()，这几个都补齐了。
 */

const WORKSPACE_DIR = 'xiyue-workspace'

function domError(name, message) {
  return new DOMException(message, name)
}

class ShimFile extends Uint8Array {
  constructor(bytes, meta = {}) {
    super(bytes)
    this.name = meta.name ?? ''
    this.size = this.length
    this.lastModified = meta.lastModified ?? 0
    this.type = meta.type ?? ''
  }

  arrayBuffer() {
    return Promise.resolve(this.slice().buffer)
  }

  text() {
    return Promise.resolve(new TextDecoder('utf-8').decode(this))
  }
}

class ShimWritable {
  constructor(target) {
    this.target = target
    this.chunks = []
    this.closed = false
  }

  async write(chunk) {
    if (this.closed) throw domError('InvalidStateError', 'writable 已关闭')
    if (typeof chunk === 'string') {
      this.chunks.push(new TextEncoder().encode(chunk))
    } else if (chunk instanceof ArrayBuffer) {
      this.chunks.push(new Uint8Array(chunk))
    } else if (ArrayBuffer.isView(chunk)) {
      this.chunks.push(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength))
    } else if (chunk && typeof chunk.arrayBuffer === 'function') {
      this.chunks.push(new Uint8Array(await chunk.arrayBuffer()))
    } else {
      throw domError('TypeError', `无法写入 ${typeof chunk}`)
    }
  }

  async close() {
    if (this.closed) return
    this.closed = true
    this.target.commit(this.chunks)
  }

  async abort() {
    this.closed = true
  }
}

class ShimFileHandle {
  constructor(name, parent) {
    this.name = name
    this.kind = 'file'
    this.parent = parent
    this.bytes = new Uint8Array(0)
    this.lastModified = parent.tree.touch()
  }

  commit(chunks) {
    const total = chunks.reduce((sum, part) => sum + part.length, 0)
    const merged = new Uint8Array(total)
    let offset = 0
    for (const part of chunks) {
      merged.set(part, offset)
      offset += part.length
    }
    this.bytes = merged
    this.lastModified = this.parent.tree.touch()
  }

  async getFile() {
    return new ShimFile(this.bytes, { name: this.name, lastModified: this.lastModified })
  }

  async createWritable() {
    return new ShimWritable(this)
  }
}

class ShimDirHandle {
  constructor(name, parent, tree) {
    this.name = name
    this.kind = 'directory'
    this.parent = parent
    this.tree = tree || parent.tree
    this.children = new Map()
  }

  async getDirectoryHandle(name, { create = false } = {}) {
    const existing = this.children.get(name)
    if (existing) {
      if (existing.kind !== 'directory') throw domError('TypeMismatchError', `${name} 是文件`)
      return existing
    }
    if (!create) throw domError('NotFoundError', `${name} 不存在`)
    const dir = new ShimDirHandle(name, this, this.tree)
    this.children.set(name, dir)
    return dir
  }

  async getFileHandle(name, { create = false } = {}) {
    const existing = this.children.get(name)
    if (existing) {
      if (existing.kind !== 'file') throw domError('TypeMismatchError', `${name} 是目录`)
      return existing
    }
    if (!create) throw domError('NotFoundError', `${name} 不存在`)
    const file = new ShimFileHandle(name, this)
    this.children.set(name, file)
    return file
  }

  async removeEntry(name, { recursive = false } = {}) {
    const existing = this.children.get(name)
    if (!existing) throw domError('NotFoundError', `${name} 不存在`)
    if (existing.kind === 'directory' && existing.children.size && !recursive) {
      throw domError('InvalidModificationError', `${name} 目录非空`)
    }
    this.children.delete(name)
  }

  async *values() {
    for (const entry of [...this.children.values()]) yield entry
  }

  async *keys() {
    for (const name of [...this.children.keys()]) yield name
  }

  async *entries() {
    for (const [name, entry] of [...this.children.entries()]) yield [name, entry]
  }
}

class OpfsTree {
  constructor() {
    this.seq = 0
    this.root = new ShimDirHandle('', null, this)
  }

  /** 单调递增的 mtime：同一毫秒内的两次写入也要能被「外部修改」检测区分开 */
  touch() {
    this.seq += 1
    return Date.now() + this.seq
  }

  workspace({ create = false } = {}) {
    return this.root.getDirectoryHandle(WORKSPACE_DIR, { create })
  }
}

function segments(path) {
  return String(path ?? '').split('/').filter(Boolean)
}

/**
 * 安装内存桩，并返回绕过 workspace.js 的直接读写入口：
 * 用于制造外部修改、断言真正落盘的结果、检查 .xiyue-history 里的残留文件。
 */
export function installOpfs({ quota = 1024 * 1024 * 1024, usage = 1024 * 1024 } = {}) {
  const tree = new OpfsTree()

  Object.defineProperty(globalThis, 'navigator', {
    value: {
      storage: {
        getDirectory: () => Promise.resolve(tree.root),
        persist: () => Promise.resolve(true),
        estimate: () => Promise.resolve({ quota, usage }),
      },
      userAgent: 'node-test',
    },
    configurable: true,
    writable: true,
  })
  globalThis.window = {
    dispatchEvent: () => true,
    addEventListener: () => {},
    removeEventListener: () => {},
    innerWidth: 1280,
    innerHeight: 800,
    CustomEvent: globalThis.CustomEvent,
  }

  async function resolve(path, { dir = false, create = false } = {}) {
    let current = await tree.workspace({ create: true })
    const parts = segments(path)
    // 中间段一律当目录打开，只有末段按 dir 参数决定
    for (let i = 0; i < parts.length; i += 1) {
      const asDir = dir || i < parts.length - 1
      current = await current[asDir ? 'getDirectoryHandle' : 'getFileHandle'](parts[i], { create })
    }
    return current
  }

  return {
    tree,
    resolve,
    workspaceRoot: () => tree.workspace({ create: true }),
    async exists(path) {
      try {
        await resolve(path)
        return true
      } catch {
        try {
          await resolve(path, { dir: true })
          return true
        } catch {
          return false
        }
      }
    },
    async readText(path) {
      return (await (await resolve(path)).getFile()).text()
    },
    /** 直接改盘，用来模拟 AI 之外的写入者 */
    async writeText(path, text) {
      const handle = await resolve(path, { create: true })
      const writable = await handle.createWritable()
      await writable.write(text)
      await writable.close()
      return handle
    },
    /** 直接删盘，用来制造内容缺失、外部删除后的状态 */
    async remove(path) {
      const parts = segments(path)
      const parent = await resolve(parts.slice(0, -1).join('/'), { dir: true })
      await parent.removeEntry(parts[parts.length - 1], { recursive: true })
    },
    async names(path = '') {
      const parent = path ? await resolve(path, { dir: true }) : await tree.workspace()
      const out = []
      for await (const entry of parent.values()) out.push(entry.name)
      return out
    },
  }
}

/**
 * 只桩 Date.now，让 at / 30 天保留期这类时间判断可控。
 * 不桩 setTimeout：searchFiles 靠 setTimeout(0) 让出主线程，冻结定时器会把测试挂死。
 */
export function controllableClock() {
  const realNow = Date.now.bind(Date)
  let offset = 0
  Date.now = () => realNow() + offset
  return {
    now: () => realNow() + offset,
    advance: ms => { offset += ms },
    back: ms => { offset -= ms },
    restore: () => { Date.now = realNow },
  }
}
