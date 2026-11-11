/**
 * kv 内存桩。
 * store 用例只关心「写进去的读得回来」，真 kv 下面是 IndexedDB + BroadcastChannel，
 * 在测试里既慢又不确定，所以整份换成一个 Map。
 *
 * 接法（vi.mock 的工厂必须是异步的，否则可能在桩模块求值前就被调用）：
 *   vi.mock('../src/utils/kv', async () => (await import('./helpers/kvMemory.js')).kvMock)
 * 用例里再 import { kvStore, resetKv, emitRemote } 直接摆布存档。
 */

export const kvStore = new Map()

/** onRemoteKeyChange 的订阅方，emitRemote 用来模拟「另一个标签页改了键」 */
const remoteHandlers = new Set()

export function resetKv() {
  kvStore.clear()
  remoteHandlers.clear()
}

/** 真 kv 的语义是「回调执行时 getItem 已经读到新值」，这里照做：先改 Map 再通知 */
export function emitRemote(key, { removed = false, value } = {}) {
  if (removed) kvStore.delete(key)
  else if (value !== undefined) kvStore.set(key, String(value))
  for (const handler of [...remoteHandlers]) handler(key, removed)
}

export const kvMock = {
  getItem: key => (kvStore.has(key) ? kvStore.get(key) : null),
  setItem: (key, value) => { kvStore.set(key, typeof value === 'string' ? value : String(value ?? '')) },
  // 内存桩只模拟读缓存；加密落盘由真实 kv 负责，用例不关心持久层形态
  setCachedItem: (key, value) => { kvStore.set(key, typeof value === 'string' ? value : String(value ?? '')) },
  setPersistedItem: () => {},
  removeItem: key => { kvStore.delete(key) },
  keys: () => [...kvStore.keys()],
  rawEntries: () => [...kvStore.entries()],
  isStorageReady: () => true,
  getStorageEngine: () => 'memory',
  getBootInfo: () => ({ engine: 'memory' }),
  bootStorage: async () => ({ engine: 'memory' }),
  flushStorage: async () => {},
  storageEstimate: async () => ({ usage: 0, quota: 0, percent: 0, engine: 'memory' }),
  onRemoteKeyChange: handler => {
    if (typeof handler !== 'function') return () => {}
    remoteHandlers.add(handler)
    return () => { remoteHandlers.delete(handler) }
  },
}
