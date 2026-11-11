import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('../src/utils/kv', () => ({
  getItem: () => null,
  setCachedItem: () => {},
  setPersistedItem: () => {},
}))

const secrets = await import('../src/utils/settingsSecret.js')

let key
beforeAll(async () => {
  key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
})

describe('设置中的 API Key 加密', () => {
  it('加密后不含明文，能原样解回', async () => {
    const source = {
      apiKey: 'sk-main-secret',
      secondaryApiKey: 'sk-secondary',
      tavilyApiKey: 'tvly-secret',
      userName: '测试用户',
    }
    const sealed = await secrets.sealSettings(source, key)
    expect(secrets.isSealed(sealed.apiKey)).toBe(true)
    expect(sealed.apiKey.startsWith('enc:v1:')).toBe(true)
    expect(JSON.stringify(sealed)).not.toContain('sk-main-secret')
    expect(JSON.stringify(sealed)).not.toContain('sk-secondary')
    expect(JSON.stringify(sealed)).not.toContain('tvly-secret')
    expect(sealed.userName).toBe('测试用户')

    const { settings, failed } = await secrets.unsealSettings(sealed, key)
    expect(failed).toBe(false)
    expect(settings).toEqual(source)
  })

  it('空值与普通字段保持原样', async () => {
    const source = { apiKey: '', secondaryApiKey: '', replyRules: '保持简洁' }
    const sealed = await secrets.sealSettings(source, key)
    expect(sealed).toEqual(source)
  })

  it('密钥不匹配时清空敏感字段并标记失败', async () => {
    const sealed = await secrets.sealSettings({ apiKey: 'sk-x' }, key)
    const other = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
    const { settings, failed } = await secrets.unsealSettings(sealed, other)
    expect(failed).toBe(true)
    expect(settings.apiKey).toBe('')
  })
})
