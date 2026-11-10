// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { kvStore, resetKv } from './helpers/kvMemory.js'

vi.mock('../src/utils/kv', async () => (await import('./helpers/kvMemory.js')).kvMock)

const { useAssetsStore } = await import('../src/stores/assets.js')

const KEY = 'xiyue_assets'
const seed = list => kvStore.set(KEY, JSON.stringify(list))
const saved = () => JSON.parse(kvStore.get(KEY) || '[]')

beforeEach(() => {
  resetKv()
  setActivePinia(createPinia())
})

describe('装载', () => {
  it('没有存档时是空列表', () => {
    expect(useAssetsStore().assets).toEqual([])
  })

  it('坏 JSON 与非数组存档都退化成空列表', () => {
    kvStore.set(KEY, '{坏掉')
    expect(useAssetsStore().assets).toEqual([])
    setActivePinia(createPinia())
    seed({ a: 1 })
    expect(useAssetsStore().assets).toEqual([])
  })

  it('数组里混进非对象条目时被丢掉，其余照常装载', () => {
    seed([null, '一段字符串', { title: '有效', content: 'x' }])
    const store = useAssetsStore()
    expect(store.assets).toHaveLength(1)
    expect(store.assets[0].title).toBe('有效')
  })
})

describe('旧数据规整', () => {
  it('缺 id 的旧条目会补上，重复 id 会被重新分配', () => {
    seed([
      { title: 'a', content: '1' },
      { id: 'same', title: 'b', content: '2' },
      { id: 'same', title: 'c', content: '3' },
    ])
    const store = useAssetsStore()
    expect(store.assets[0].id).toBeTruthy()
    const ids = store.assets.map(a => a.id)
    expect(new Set(ids).size).toBe(3)
    expect(ids).toContain('same')
  })

  it('空标题落到「未命名文档」，非字符串正文转成字符串', () => {
    seed([{ title: '   ', content: 12345 }, { content: null }])
    const store = useAssetsStore()
    expect(store.assets[0].title).toBe('未命名文档')
    expect(store.assets[0].content).toBe('12345')
    expect(store.assets[1].title).toBe('未命名文档')
    expect(store.assets[1].content).toBe('')
  })

  it('fileType 统一小写，contentType 按它推导', () => {
    seed([
      { title: 'a', fileType: 'MD' },
      { title: 'b', fileType: 'txt' },
      { title: 'c', fileType: 'TXT', contentType: 'markdown' },
      { title: 'd' },
    ])
    const store = useAssetsStore()
    expect(store.assets[0]).toMatchObject({ fileType: 'md', contentType: 'markdown' })
    expect(store.assets[1]).toMatchObject({ fileType: 'txt', contentType: 'text' })
    // 显式写了 contentType 就尊重它
    expect(store.assets[2]).toMatchObject({ fileType: 'txt', contentType: 'markdown' })
    expect(store.assets[3]).toMatchObject({ fileType: '', contentType: 'markdown' })
  })

  it('source 缺失时按有没有 fileType 判断是导入还是手动', () => {
    seed([
      { title: 'a', fileType: 'docx' },
      { title: 'b' },
      { title: 'c', source: 'manual', fileType: 'docx' },
      { title: 'd', source: '乱七八糟' },
    ])
    const store = useAssetsStore()
    expect(store.assets.map(a => a.source)).toEqual(['import', 'manual', 'manual', 'manual'])
  })

  it('时间戳缺失或非法时补上，updatedAt 不早于 createdAt', () => {
    seed([{ title: 'a', createdAt: '不是数字' }, { title: 'b', createdAt: 100, updatedAt: 0 }])
    const store = useAssetsStore()
    expect(store.assets[0].createdAt).toBeGreaterThan(0)
    expect(store.assets[0].updatedAt).toBe(store.assets[0].createdAt)
    expect(store.assets[1]).toMatchObject({ createdAt: 100, updatedAt: 100 })
  })

  it('sorted 按更新时间倒序，且不改动原数组', () => {
    seed([
      { id: '1', title: '早', content: '', createdAt: 1, updatedAt: 10 },
      { id: '2', title: '晚', content: '', createdAt: 2, updatedAt: 99 },
    ])
    const store = useAssetsStore()
    expect(store.sorted.map(a => a.title)).toEqual(['晚', '早'])
    expect(store.assets.map(a => a.title)).toEqual(['早', '晚'])
  })
})

describe('增删改', () => {
  it('create 立刻落盘并返回规整过的条目', () => {
    const store = useAssetsStore()
    const asset = store.create('  周报  ', '正文', { fileType: 'MD' })
    expect(asset.title).toBe('周报')
    expect(asset.contentType).toBe('markdown')
    // 带了 fileType 就被当成导入的文档，而不是手动新建
    expect(asset.source).toBe('import')
    expect(saved()).toHaveLength(1)
    expect(saved()[0].id).toBe(asset.id)
  })

  it('create 的 meta 能覆盖 source 与 fileType', () => {
    const store = useAssetsStore()
    const asset = store.create('导入的', 'x', { fileType: 'pdf', source: 'import' })
    expect(asset).toMatchObject({ fileType: 'pdf', source: 'import', contentType: 'text' })
  })

  it('update 只改传了的字段，并刷新更新时间', () => {
    const store = useAssetsStore()
    const asset = store.create('原标题', '原内容')
    store.update(asset.id, { content: '新内容' })
    expect(asset.title).toBe('原标题')
    expect(asset.content).toBe('新内容')
    expect(asset.updatedAt).toBeGreaterThanOrEqual(asset.createdAt)
    expect(saved()[0].content).toBe('新内容')
  })

  it('update 不存在的 id 不会新增条目', () => {
    const store = useAssetsStore()
    store.create('a', '1')
    store.update('不存在的 id', { title: 'x' })
    expect(saved()).toHaveLength(1)
  })

  it('remove 与 clearAll 都会落盘', () => {
    const store = useAssetsStore()
    const a = store.create('a', '1')
    store.create('b', '2')
    store.remove(a.id)
    expect(saved().map(item => item.title)).toEqual(['b'])
    store.clearAll()
    expect(store.assets).toEqual([])
    expect(saved()).toEqual([])
  })

  it('saveFromMessage 没给标题时用时间戳兜底', () => {
    const store = useAssetsStore()
    const withTitle = store.saveFromMessage('正文', '我的标题')
    expect(withTitle.title).toBe('我的标题')
    const without = store.saveFromMessage('正文')
    expect(without.title).toContain('AI 回复')
    expect(saved()).toHaveLength(2)
  })
})

describe('导入导出', () => {
  it('exportData 是格式化过的 JSON，能被 importData 读回来', () => {
    const store = useAssetsStore()
    store.create('a', '1')
    const json = store.exportData()
    expect(json).toContain('\n  ')
    // 换一份空存档，模拟「导出到别的设备再导入」
    resetKv()
    setActivePinia(createPinia())
    const fresh = useAssetsStore()
    expect(fresh.assets).toEqual([])
    expect(fresh.importData(json)).toBe(1)
    expect(fresh.assets.map(a => a.title)).toEqual(['a'])
  })

  it('把导出内容再导入同一份列表会得到副本，不会覆盖原条目', () => {
    const store = useAssetsStore()
    store.create('a', '1')
    const json = store.exportData()
    expect(store.importData(json)).toBe(1)
    expect(store.assets).toHaveLength(2)
    expect(new Set(store.assets.map(a => a.id)).size).toBe(2)
  })

  it('导入时与现有条目撞 id 会重新分配，不会覆盖原来的', () => {
    const store = useAssetsStore()
    store.create('已有的', '1')
    const existingId = store.assets[0].id
    const added = store.importData(JSON.stringify([{ id: existingId, title: '导入的', content: '2' }]))
    expect(added).toBe(1)
    expect(store.assets).toHaveLength(2)
    expect(store.assets[0].id).toBe(existingId)
    expect(store.assets[1].id).not.toBe(existingId)
    expect(store.assets[1].title).toBe('导入的')
  })

  it('一次导入里的重复 id 也会被拆开', () => {
    const store = useAssetsStore()
    store.importData(JSON.stringify([{ id: 'dup', title: 'a' }, { id: 'dup', title: 'b' }]))
    expect(new Set(store.assets.map(a => a.id)).size).toBe(2)
  })

  it('导入的内容不是数组时抛错，存档不动', () => {
    const store = useAssetsStore()
    store.create('留着', '1')
    expect(() => store.importData('{"a":1}')).toThrow('格式错误')
    expect(store.assets).toHaveLength(1)
  })

  it('导入坏 JSON 时抛异常，不会把列表清空', () => {
    const store = useAssetsStore()
    store.create('留着', '1')
    expect(() => store.importData('{不是 JSON')).toThrow()
    expect(store.assets).toHaveLength(1)
  })
})
