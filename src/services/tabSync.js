/**
 * 跨标签页同步。
 * 同一浏览器开两个标签时，OPFS 与 kv（IndexedDB）是共享的，但各自的内存副本互相看不见，
 * 后写的那份会静默盖掉先写的。这里只负责「告诉别的标签我改了什么」，怎么合并由订阅方决定。
 *
 * 刻意不广播值本身，只广播键名：会话正文可能有几 MB，结构化克隆一份纯属浪费，
 * 而 IndexedDB 才是权威数据源，收到通知的一方按需重读就行。
 */
const CHANNEL_NAME = 'xiyue-tab-sync'

/** 每个标签一个 id，用来丢掉自己发出去又被自己收回来的消息 */
export const TAB_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

/**
 * Node 也有全局 BroadcastChannel，但那是另一回事：它会让进程一直不退出，
 * 而且同一进程里多个模块实例（测试用 resetModules 重新 import 时很常见）会互相收到消息，
 * 变成一堆「假的其他标签页」。这套同步只在真浏览器里成立。
 */
const isNode = typeof globalThis.process !== 'undefined' && !!globalThis.process.versions?.node

let channel = null
let broken = false
const handlers = new Set()

function ensureChannel() {
  if (broken || isNode || typeof window === 'undefined' || typeof BroadcastChannel !== 'function') return null
  if (channel) return channel
  try {
    channel = new BroadcastChannel(CHANNEL_NAME)
  } catch {
    // 隐私模式或浏览器不支持：降级成单标签行为，功能不受影响，只是不跨标签同步
    broken = true
    channel = null
  }
  return channel
}

export function tabSyncSupported() {
  return !isNode && typeof window !== 'undefined' && typeof BroadcastChannel === 'function' && !broken
}

/**
 * 广播一条变更。
 * @param {string} type 消息类型，如 'kv' / 'workspace'
 * @param {object} [payload] 附带字段，会平铺进消息里
 */
export function broadcastTab(type, payload = {}) {
  const target = ensureChannel()
  if (!target) return false
  try {
    target.postMessage({ type, from: TAB_ID, at: Date.now(), ...payload })
    return true
  } catch {
    return false
  }
}

/**
 * 订阅别的标签发来的消息（自己的消息已在内部过滤掉）。
 * @param {(message: {type: string, from: string, at: number}) => void} handler
 * @returns {() => void} 取消订阅
 */
export function onTabMessage(handler) {
  if (typeof handler !== 'function') return () => {}
  const target = ensureChannel()
  if (!target) return () => {}
  if (!handlers.size) {
    target.onmessage = (event) => {
      const data = event?.data
      if (!data || typeof data.type !== 'string' || data.from === TAB_ID) return
      for (const fn of handlers) {
        try {
          fn(data)
        } catch {
          // 单个订阅者出错不该让其他标签同步一起停摆
        }
      }
    }
  }
  handlers.add(handler)
  return () => {
    handlers.delete(handler)
  }
}

/** 同一类提示的节流：连续改十几个文件时不要弹十几个 toast */
export function createThrottle(interval = 4000) {
  let last = 0
  return () => {
    const now = Date.now()
    if (now - last < interval) return false
    last = now
    return true
  }
}
