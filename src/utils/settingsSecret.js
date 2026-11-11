/**
 * 设置里的敏感字段加密落盘。
 * - 使用 AES-GCM，密钥为不可导出的 CryptoKey，存放在独立的 IndexedDB 库；
 * - 内存里仍是明文，保证设置同步读取与请求逻辑不变；
 * - 仅降低 localStorage / 磁盘转储中的明文暴露，不能防 XSS。
 */
import { getItem, setCachedItem, setPersistedItem } from './kv'

const SETTINGS_KEY = 'ai_chat_settings'
const SECRET_FIELDS = ['apiKey', 'secondaryApiKey', 'tavilyApiKey']
const PREFIX = 'enc:v1:'
const DB_NAME = 'xiyue-secret-db'
const DB_VERSION = 1
const STORE = 'keys'
const KEY_ID = 'settings'

let dbPromise = null
let keyPromise = null
let writeQueue = Promise.resolve()

function isSealed(value) {
  return typeof value === 'string' && value.startsWith(PREFIX)
}

function toBase64(bytes) {
  let text = ''
  for (const byte of bytes) text += String.fromCharCode(byte)
  return btoa(text)
}

function fromBase64(text) {
  const raw = atob(text)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i)
  return out
}

function openDB() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined' || !indexedDB) {
      reject(new Error('IndexedDB 不可用'))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error || new Error('密钥库打开失败'))
  })
  dbPromise.catch(() => { dbPromise = null })
  return dbPromise
}

function idbRequest(db, mode, action) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const request = action(tx.objectStore(STORE))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function getSecretKey() {
  if (keyPromise) return keyPromise
  keyPromise = (async () => {
    if (!globalThis.crypto?.subtle) throw new Error('WebCrypto 不可用')
    const db = await openDB()
    const existing = await idbRequest(db, 'readonly', store => store.get(KEY_ID))
    if (existing) return existing

    // 先生成候选密钥，再在同一个读写事务里二次确认：
    // 两个标签页同时首次启动时，后到的那个会复用先写入的密钥，避免互相覆盖
    const candidate = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    )
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      const request = store.get(KEY_ID)
      let picked = null
      request.onsuccess = () => {
        if (request.result) {
          picked = request.result
          return
        }
        picked = candidate
        store.put(candidate, KEY_ID)
      }
      tx.oncomplete = () => resolve(picked)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error || new Error('密钥写入被中止'))
    })
  })().catch(err => {
    keyPromise = null
    throw err
  })
  return keyPromise
}

async function encryptValue(value, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(value)
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded)
  return `${PREFIX}${toBase64(iv)}:${toBase64(new Uint8Array(cipher))}`
}

async function decryptValue(value, key) {
  const parts = value.split(':')
  if (parts.length !== 4 || `${parts[0]}:${parts[1]}:` !== PREFIX) throw new Error('密文格式不正确')
  const iv = fromBase64(parts[2])
  const data = fromBase64(parts[3])
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data)
  return new TextDecoder().decode(plain)
}

/** 把设置里的明文字段加密；空值与已加密值保持原样 */
export async function sealSettings(settings, key) {
  const out = { ...settings }
  const secretKey = key || await getSecretKey()
  for (const field of SECRET_FIELDS) {
    const value = out[field]
    if (typeof value !== 'string' || !value || isSealed(value)) continue
    out[field] = await encryptValue(value, secretKey)
  }
  return out
}

/** 解密设置里的字段；返回 failed 表示有字段无法解密（通常是密钥库被清空） */
export async function unsealSettings(settings, key) {
  const out = { ...settings }
  let failed = false
  let secretKey
  try {
    secretKey = key || await getSecretKey()
  } catch {
    return { settings: out, failed: true }
  }
  for (const field of SECRET_FIELDS) {
    const value = out[field]
    if (!isSealed(value)) continue
    try {
      out[field] = await decryptValue(value, secretKey)
    } catch {
      out[field] = ''
      failed = true
    }
  }
  return { settings: out, failed }
}

/** 加密后落盘；失败时回退明文，保证不支持 WebCrypto 的环境仍可用 */
export function persistSettingsCiphertext(settings) {
  const snapshot = JSON.stringify(settings)
  writeQueue = writeQueue.then(async () => {
    try {
      const sealed = await sealSettings(JSON.parse(snapshot))
      setPersistedItem(SETTINGS_KEY, JSON.stringify(sealed))
    } catch (err) {
      // IDB/WebCrypto 不可用时退回明文，属于预期降级，不反复刷日志
      if (!/IndexedDB 不可用|WebCrypto 不可用/.test(String(err?.message || err))) {
        console.warn('[settings] 加密保存失败，暂以明文保存', err)
      }
      setPersistedItem(SETTINGS_KEY, snapshot)
    }
  }).catch(err => console.warn('[settings] 保存失败', err))
  return writeQueue
}

export async function flushSecretWrites() {
  try { await writeQueue } catch { /* 已内部处理 */ }
}

/**
 * 启动时把旧的明文设置迁移成密文，并把解密后的设置放进内存缓存。
 * 必须在应用挂载前调用，否则设置 store 会读到密文。
 */
export async function migrateSettingsAtBoot() {
  const raw = getItem(SETTINGS_KEY)
  if (!raw) return
  let data
  try {
    data = JSON.parse(raw)
  } catch {
    return
  }
  if (!data || typeof data !== 'object') return

  const hasSealed = SECRET_FIELDS.some(field => isSealed(data[field]))
  const hasPlain = SECRET_FIELDS.some(field => typeof data[field] === 'string' && data[field] && !isSealed(data[field]))
  if (!hasSealed && !hasPlain) return

  let plain = data
  let failed = false
  if (hasSealed) {
    const result = await unsealSettings(data)
    plain = result.settings
    failed = result.failed
  }
  setCachedItem(SETTINGS_KEY, JSON.stringify(plain))

  if (!hasPlain && !failed) return
  try {
    const sealed = await sealSettings(plain)
    setPersistedItem(SETTINGS_KEY, JSON.stringify(sealed))
  } catch (err) {
    console.warn('[settings] 设置加密迁移失败，继续使用本机存储', err)
  }
}

export { SECRET_FIELDS, isSealed }
