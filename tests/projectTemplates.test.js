import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { installOpfs } from './helpers/opfsShim'

let templates
let ws

beforeEach(async () => {
  installOpfs()
  vi.resetModules()
  templates = await import('../src/services/projectTemplates.js')
  ws = await import('../src/services/workspace.js')
})

afterEach(() => {
  delete globalThis.navigator
  delete globalThis.window
})

describe('模板清单', () => {
  it('三套模板都自带首页、样式、逻辑与说明，路径全是单层相对路径', () => {
    expect(templates.PROJECT_TEMPLATES.map(t => t.id)).toEqual(['static', 'vue', 'react'])
    for (const template of templates.PROJECT_TEMPLATES) {
      const paths = template.files.map(f => f.path)
      expect(paths).toContain('index.html')
      expect(paths).toContain('app.js')
      expect(paths).toContain('style.css')
      for (const path of paths) {
        expect(path).not.toContain('/')
        expect(path).not.toContain('..')
      }
      for (const file of template.files) expect(file.text.trim().length).toBeGreaterThan(0)
    }
  })

  it('templateById 认 id，不认识的返回 null 而不是抛错', () => {
    expect(templates.templateById('vue').label).toBe('Vue 3')
    expect(templates.templateById('nope')).toBe(null)
    expect(templates.templateById(undefined)).toBe(null)
  })

  it('每套模板都留了 #inc 与 #out，AI 自测回路照着点就行', () => {
    for (const template of templates.PROJECT_TEMPLATES) {
      const app = template.files.find(f => f.path === 'app.js').text
      expect(app).toMatch(/['"]inc['"]/)
      expect(app).toMatch(/['"]out['"]/)
    }
  })

  it('生成出来的代码没有被外层模板字符串吃掉转义', () => {
    const staticApp = templates.templateById('static').files.find(f => f.path === 'app.js').text
    expect(staticApp).toContain('out.textContent = `已点击 ${count} 次`')
    expect(staticApp).not.toContain('\\$')
    const vueApp = templates.templateById('vue').files.find(f => f.path === 'app.js').text
    expect(vueApp).toContain('@click="count++"')
    expect(vueApp).toContain('{{ count }}')
    const reactApp = templates.templateById('react').files.find(f => f.path === 'app.js').text
    expect(reactApp).toContain('h(\'p\', { id: \'out\' }, `已点击 ${count} 次`)')
  })

  it('CDN 地址写在页面自带的 importmap 里，覆盖裸模块名的默认兜底', () => {
    const vueHtml = templates.templateById('vue').files.find(f => f.path === 'index.html').text
    expect(vueHtml).toContain('type="importmap"')
    // runtime-only 构建会让 template 字符串静默失效，必须是带编译器的浏览器构建
    expect(vueHtml).toContain('vue.esm-browser')
    const reactHtml = templates.templateById('react').files.find(f => f.path === 'index.html').text
    expect(reactHtml).toContain('"react-dom/client"')
    // 少了 external=react 就会有两个 React 实例，页面直接报 Invalid hook call
    expect(reactHtml).toContain('?external=react')
  })
})

describe('scaffoldProject', () => {
  it('按目录名写出一整套文件，并给出可直接预览的首页', async () => {
    const result = await templates.scaffoldProject('static', 'demo-site')
    expect(result.dir).toBe('demo-site')
    expect(result.entry).toBe('demo-site/index.html')
    expect(result.paths).toEqual([
      'demo-site/index.html',
      'demo-site/style.css',
      'demo-site/app.js',
      'demo-site/README.md',
    ])
    const read = await ws.readFile('demo-site/app.js')
    expect(read.text).toContain("document.getElementById('inc')")
    const html = await ws.readFile('demo-site/index.html')
    expect(html.text.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(html.text).toContain('<script type="module" src="./app.js"></script>')
  })

  it('目录名为空或带非法字符时退回模板默认名', async () => {
    expect((await templates.scaffoldProject('vue', '')).dir).toBe('my-vue-app')
    expect((await templates.scaffoldProject('react', '  ')).dir).toBe('my-react-app')
  })

  it('项目名里的路径分隔符与 .. 被清洗掉，模板永远落在根目录下一层', async () => {
    expect((await templates.scaffoldProject('static', 'a/b')).dir).toBe('a_b')
    expect((await templates.scaffoldProject('vue', '..')).dir).toBe('my-vue-app')
    const listed = (await ws.listDir('')).entries.map(e => e.name).sort()
    expect(listed).toEqual(['a_b', 'my-vue-app'])
  })

  it('不认识的模板 id 直接报错，不会写半个项目', async () => {
    await expect(templates.scaffoldProject('svelte', 'x')).rejects.toThrow(/没有这个模板/)
    expect((await ws.listDir('')).entries).toEqual([])
  })

  it('首页已存在就拒绝，不覆盖别人的项目', async () => {
    await templates.scaffoldProject('static', 'dup')
    await expect(templates.scaffoldProject('vue', 'dup')).rejects.toThrow(/已存在/)
    // 原来那套文件没被动过
    expect((await ws.readFile('dup/index.html')).text).toContain('静态站起手模板')
  })
})
