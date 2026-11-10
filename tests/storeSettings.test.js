// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { emitRemote, kvStore, resetKv } from './helpers/kvMemory.js'

vi.mock('../src/utils/kv', async () => (await import('./helpers/kvMemory.js')).kvMock)

const { useSettingsStore } = await import('../src/stores/settings.js')
const { KEYS, loadSettings } = await import('../src/utils/storage.js')

const OLD_PERSONA = '你是一个有用、友好的AI助手。请用中文回答用户的问题。'

/** 一份「已经迁移过」的存档：有 userPersona、有副模型字段、技能开关已放开过一次 */
const migrated = (extra = {}) => ({
  userPersona: '',
  secondaryApiBase: 'https://open.bigmodel.cn/api/paas/v4',
  skillsAllOnV1: true,
  ...extra,
})

const seed = data => kvStore.set(KEYS.SETTINGS, JSON.stringify(data))

let toasts

beforeEach(() => {
  resetKv()
  toasts = []
  window.__ui = { showToast: (...args) => toasts.push(args) }
  setActivePinia(createPinia())
})

describe('首次装载', () => {
  it('全新用户拿到默认配置，技能全开', () => {
    const store = useSettingsStore()
    expect(store.model).toBe('deepseek-flash')
    expect(store.apiBase).toBe('https://api.deepseek.com')
    expect(store.temperature).toBe(0.7)
    expect(store.maxTokens).toBe(32768)
    expect(store.contextLength).toBe(131072)
    expect(store.workModeEnabled).toBe(true)
    expect(store.searchSkillEnabled).toBe(true)
    expect(store.browserSkillEnabled).toBe(true)
    expect(store.calcSandboxEnabled).toBe(true)
    expect(store.symbolRules).toHaveLength(5)
  })

  it('老存档没有副模型配置时，首次装载就把默认结构写回去', () => {
    seed({ apiKey: 'sk-留着', model: 'kimi-k3' })
    useSettingsStore()
    const saved = loadSettings()
    expect(saved.secondaryApiBase).toBe('https://open.bigmodel.cn/api/paas/v4')
    expect(saved.secondaryModel).toBe('glm-4.6v-flash')
    expect(saved.secondaryImageModel).toBe('cogview-3-flash')
    expect(saved.skillsAllOnV1).toBe(true)
    // 主模型配置不能被迁移覆盖
    expect(saved.apiKey).toBe('sk-留着')
    expect(saved.model).toBe('kimi-k3')
  })

  it('已经迁移过的存档原样读回，不重写', () => {
    seed(migrated({ apiKey: 'sk-1', model: 'glm-5.3' }))
    const before = kvStore.get(KEYS.SETTINGS)
    const store = useSettingsStore()
    expect(store.apiKey).toBe('sk-1')
    expect(kvStore.get(KEYS.SETTINGS)).toBe(before)
  })

  it('存档是坏 JSON 时退化成默认配置', () => {
    kvStore.set(KEYS.SETTINGS, '{坏掉了')
    const store = useSettingsStore()
    expect(store.model).toBe('deepseek-flash')
    expect(store.apiKey).toBe('')
  })
})

describe('技能开关迁移', () => {
  it('没迁移过的存档里写着 false 也一律放开：那多半是升级前的默认值', () => {
    seed({ userPersona: '', secondaryApiBase: 'x', searchSkillEnabled: false, workModeEnabled: false })
    const store = useSettingsStore()
    expect(store.searchSkillEnabled).toBe(true)
    expect(store.workModeEnabled).toBe(true)
  })

  it('迁移过之后尊重用户主动关闭', () => {
    seed(migrated({ searchSkillEnabled: false, workModeEnabled: false, browserSkillEnabled: false }))
    const store = useSettingsStore()
    expect(store.searchSkillEnabled).toBe(false)
    expect(store.workModeEnabled).toBe(false)
    expect(store.browserSkillEnabled).toBe(false)
    // 没写的那个仍按默认值
    expect(store.calcSandboxEnabled).toBe(true)
  })
})

describe('旧档字段迁移', () => {
  it('旧「提示设置」升级：没有 userPersona 字段时强制打开 AI 人设', () => {
    seed({ personaEnabled: false, secondaryApiBase: 'x', skillsAllOnV1: true })
    expect(useSettingsStore().personaEnabled).toBe(true)
  })

  it('新版存档里用户关掉的人设保持关闭', () => {
    seed(migrated({ personaEnabled: false }))
    expect(useSettingsStore().personaEnabled).toBe(false)
  })

  it('旧版默认人设文案换成新的，用户自己改过的保留', () => {
    seed(migrated({ personaPrompt: OLD_PERSONA }))
    expect(useSettingsStore().personaPrompt).not.toBe(OLD_PERSONA)
    expect(useSettingsStore().personaPrompt).toContain('根据用户使用的语言回答')

    setActivePinia(createPinia())
    seed(migrated({ personaPrompt: '我是白曦月' }))
    expect(useSettingsStore().personaPrompt).toBe('我是白曦月')
  })

  it('reasoningEffort 只认白名单里的值', () => {
    for (const value of ['low', 'medium', 'high', 'default']) {
      setActivePinia(createPinia())
      seed(migrated({ reasoningEffort: value }))
      expect(useSettingsStore().reasoningEffort, value).toBe(value)
    }
    setActivePinia(createPinia())
    seed(migrated({ reasoningEffort: 'ultra' }))
    expect(useSettingsStore().reasoningEffort).toBe('default')
  })

  it('每轮工具调用上限夹在 1~200，写 0 或坏值回默认', () => {
    seed(migrated({ maxToolCallsPerRound: 999 }))
    expect(useSettingsStore().maxToolCallsPerRound).toBe(200)
    setActivePinia(createPinia())
    seed(migrated({ maxToolCallsPerRound: 0 }))
    expect(useSettingsStore().maxToolCallsPerRound).toBe(10)
    setActivePinia(createPinia())
    seed(migrated({ maxToolCallsPerRound: 'abc' }))
    expect(useSettingsStore().maxToolCallsPerRound).toBe(10)
    setActivePinia(createPinia())
    seed(migrated({ maxToolCallsPerRound: '30' }))
    expect(useSettingsStore().maxToolCallsPerRound).toBe(30)
  })

  it('符号规则为空时用默认五条', () => {
    seed(migrated({ symbolRules: [] }))
    expect(useSettingsStore().symbolRules).toHaveLength(5)
    setActivePinia(createPinia())
    seed(migrated({ symbolRules: [{ id: 'x', open: '《', close: '》' }] }))
    expect(useSettingsStore().symbolRules).toEqual([{ id: 'x', open: '《', close: '》' }])
  })

  it('没写深色模式时跟随系统偏好', () => {
    const original = window.matchMedia
    window.matchMedia = () => ({ matches: true })
    seed(migrated())
    expect(useSettingsStore().darkMode).toBe(true)
    setActivePinia(createPinia())
    seed(migrated({ darkMode: false }))
    expect(useSettingsStore().darkMode).toBe(false)
    window.matchMedia = original
  })
})

describe('预设与副模型', () => {
  it('applyPreset 换模型与 base，预设带 maxTokens 时一起换', () => {
    const store = useSettingsStore()
    const preset = store.modelPresets.find(p => p.model === 'kimi-k3')
    store.applyPreset({ ...preset, maxTokens: 8192 })
    expect(store.model).toBe('kimi-k3')
    expect(store.apiBase).toBe('https://api.moonshot.ai/v1')
    expect(store.maxTokens).toBe(8192)
    store.applyPreset(preset)
    expect(store.maxTokens).toBe(8192)
  })

  it('副模型三项齐全才算就绪', () => {
    const store = useSettingsStore()
    expect(store.secondaryReady).toBe(false)
    store.secondaryApiKey = 'sk-2'
    expect(store.secondaryReady).toBe(true)
    store.secondaryModel = ''
    expect(store.secondaryReady).toBe(false)
  })

  it('内置预设不算自定义，改成别的 base 才算', () => {
    const store = useSettingsStore()
    expect(store.isCustomSecondary).toBe(false)
    store.secondaryApiBase = 'https://my-proxy.example.com/v1'
    expect(store.isCustomSecondary).toBe(true)
  })

  it('选「自定义」时只清空内置预设，不覆盖用户已经填好的配置', () => {
    const store = useSettingsStore()
    const custom = store.secondaryPresets.find(p => p.custom)
    store.applySecondaryPreset(custom)
    expect(store.secondaryApiBase).toBe('')
    expect(store.secondaryModel).toBe('')
    // 已经是自定义状态时再点一次，填好的内容不能丢
    store.secondaryApiBase = 'https://my-proxy.example.com/v1'
    store.secondaryModel = 'my-model'
    store.applySecondaryPreset(custom)
    expect(store.secondaryApiBase).toBe('https://my-proxy.example.com/v1')
    expect(store.secondaryModel).toBe('my-model')
  })

  it('选内置预设会同时换 model 与 base', () => {
    const store = useSettingsStore()
    store.applySecondaryPreset(store.secondaryPresets[0])
    expect(store.secondaryModel).toBe('glm-4.6v-flash')
    expect(store.secondaryApiBase).toBe('https://open.bigmodel.cn/api/paas/v4')
    expect(store.isCustomSecondary).toBe(false)
  })
})

describe('自动落盘', () => {
  it('改任意字段都会写回存档', async () => {
    const store = useSettingsStore()
    store.apiKey = 'sk-新'
    store.darkMode = true
    store.maxToolCallsPerRound = 42
    await nextTick()
    const saved = loadSettings()
    expect(saved.apiKey).toBe('sk-新')
    expect(saved.darkMode).toBe(true)
    expect(saved.maxToolCallsPerRound).toBe(42)
  })

  it('符号规则的深层改动也会写回', async () => {
    const store = useSettingsStore()
    store.symbolRules[0].color = '#ff0000'
    await nextTick()
    expect(loadSettings().symbolRules[0].color).toBe('#ff0000')
    store.symbolRules.push({ id: '新规则', open: '《', close: '》', color: '#000000', italic: false, bold: false })
    await nextTick()
    expect(loadSettings().symbolRules).toHaveLength(6)
  })

  it('settingsReady 要三项齐全', () => {
    const store = useSettingsStore()
    expect(store.settingsReady).toBe(false)
    store.apiKey = 'sk-1'
    expect(store.settingsReady).toBe(true)
    store.model = ''
    expect(store.settingsReady).toBe(false)
  })

  it('persist 可以手动调用，写回的始终是当前的值', () => {
    const store = useSettingsStore()
    store.userName = '小明'
    store.persist()
    expect(loadSettings().userName).toBe('小明')
  })
})

describe('跨标签同步', () => {
  it('别的标签改了设置只提示，不偷偷换掉本页正在用的配置', () => {
    const store = useSettingsStore()
    store.apiKey = 'sk-本页'
    seed(migrated({ apiKey: 'sk-另一页' }))
    emitRemote(KEYS.SETTINGS)
    expect(store.apiKey).toBe('sk-本页')
    expect(toasts).toHaveLength(1)
    expect(toasts[0][0]).toContain('另一个标签页改了设置')
    expect(toasts[0][0]).toContain('刷新后生效')
  })

  it('连续变更只提示一次', () => {
    useSettingsStore()
    emitRemote(KEYS.SETTINGS)
    emitRemote(KEYS.SETTINGS)
    emitRemote(KEYS.SETTINGS)
    expect(toasts).toHaveLength(1)
  })

  it('别的键变了不打扰用户', () => {
    useSettingsStore()
    emitRemote(KEYS.TOPICS)
    expect(toasts).toHaveLength(0)
  })
})
