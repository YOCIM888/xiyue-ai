// IndexedDB 键值封装：以字符串形式保存，供统一存储层使用
const DB_NAME = 'xiyue-db'
const DB_VERSION = 1
const STORE = 'kv'
const OPEN_TIMEOUT = 4000

let dbPromise = null

export function isIDBSupported() {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null
  } catch {
    return false
  }
}

function openDB() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    if (!isIDBSupported()) {
      reject(new Error('IndexedDB 不可用'))
      return
    }
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      reject(new Error('IndexedDB 打开超时'))
    }, OPEN_TIMEOUT)

    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    req.onsuccess = () => {
      if (settled) {
        req.result.close()
        return
      }
      settled = true
      clearTimeout(timer)
      resolve(req.result)
    }
    req.onerror = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(req.error || new Error('IndexedDB 打开失败'))
    }
    req.onblocked = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(new Error('IndexedDB 被其他标签页占用'))
    }
  })
  dbPromise.catch(() => { dbPromise = null })
  return dbPromise
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function idbGetAll() {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const store = tx.objectStore(STORE)
    const out = []
    const req = store.openCursor()
    req.onsuccess = () => {
      const cursor = req.result
      if (!cursor) {
        resolve(out)
        return
      }
      out.push({ key: cursor.key, value: cursor.value })
      cursor.continue()
    }
    req.onerror = () => reject(req.error)
  })
}

export async function idbGet(key) {
  const db = await openDB()
  const tx = db.transaction(STORE, 'readonly')
  return requestToPromise(tx.objectStore(STORE).get(key))
}

export async function idbSet(key, value) {
  const db = await openDB()
  const tx = db.transaction(STORE, 'readwrite')
  tx.objectStore(STORE).put(value, key)
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(true)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error || new Error('IndexedDB 写入被中止'))
  })
}

export async function idbDelete(key) {
  const db = await openDB()
  const tx = db.transaction(STORE, 'readwrite')
  tx.objectStore(STORE).delete(key)
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(true)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error || new Error('IndexedDB 删除被中止'))
  })
}

export async function idbClear() {
  const db = await openDB()
  const tx = db.transaction(STORE, 'readwrite')
  tx.objectStore(STORE).clear()
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(true)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error || new Error('IndexedDB 清空被中止'))
  })
}
