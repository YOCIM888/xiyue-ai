import { test, expect } from '@playwright/test'

const SETTINGS = {
  userName: '冒烟测试',
  apiKey: 'sk-smoke',
  apiBase: 'https://api.test/v1',
  model: 'smoke-model',
  temperature: 0.7,
  maxTokens: 2048,
  skillsAllOnV1: true,
  personaEnabled: false,
  replyRulesEnabled: false,
  thinkingEnabled: false,
}

/** 在应用脚本执行前写入 localStorage，避免首屏保存把种子覆盖掉 */
async function seedSettings(page, extra = {}) {
  await page.addInitScript((settings) => {
    try {
      if (sessionStorage.getItem('e2e_seeded') === '1') return
      sessionStorage.setItem('e2e_seeded', '1')
      localStorage.setItem('ai_chat_settings', JSON.stringify(settings))
      localStorage.removeItem('xiyue_storage_migrated_v1')
    } catch { /* ignore */ }
  }, { ...SETTINGS, ...extra })
  await page.goto('/')
  await page.waitForSelector('.topbar')
}

/** 拦截 OpenAI 兼容接口，返回一段可读的 SSE 流 */
async function mockChat(page, reply = '这是冒烟测试回复。') {
  await page.route('**/chat/completions', async (route) => {
    const body = [
      `data: ${JSON.stringify({ choices: [{ delta: { content: reply } }] })}`,
      `data: ${JSON.stringify({ usage: { prompt_tokens: 8, completion_tokens: 6, total_tokens: 14 } })}`,
      'data: [DONE]',
      '',
    ].join('\n\n')
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream; charset=utf-8' },
      body,
    })
  })
}

test('发送消息并收到流式回复', async ({ page }) => {
  await seedSettings(page)
  await mockChat(page)
  await page.locator('.chat-input').fill('你好')
  await page.locator('.action-btn.send').click()
  await expect(page.locator('.message-list')).toContainText('这是冒烟测试回复。', { timeout: 20_000 })
})

test('新建对话并切换会话', async ({ page }) => {
  await seedSettings(page)
  await page.getByRole('button', { name: '新对话' }).click()
  await page.getByRole('button', { name: '新对话' }).click()
  const topics = page.locator('.topic-item')
  await expect(topics).toHaveCount(2)
  await topics.first().click()
  await expect(topics.first()).toHaveClass(/active/)
})

test('工作区新建文件并打开网页预览', async ({ page }) => {
  await seedSettings(page)
  await page.getByRole('button', { name: '工作区', exact: true }).click()
  await expect(page.locator('.ws-panel')).toBeVisible()

  await page.locator('.ws-scroll').click({ button: 'right' })
  await page.getByRole('button', { name: '新建文件…' }).click()
  await page.locator('.modal-input').fill('index.html')
  await page.locator('.modal-btn.confirm').click()
  // 新建后会自动打开查看器，先返回文件树确认节点存在
  await expect(page.locator('.wsv-back')).toBeVisible()
  await page.locator('.wsv-back').click()
  await expect(page.locator('.ws-node-name', { hasText: 'index.html' })).toBeVisible()

  const fileNode = page.locator('.ws-node', { has: page.locator('.ws-node-name', { hasText: 'index.html' }) })
  await fileNode.click({ button: 'right' })
  await page.getByRole('button', { name: '网页预览' }).click()
  await expect(page.locator('.wvp-window')).toBeVisible({ timeout: 20_000 })
})

test('探索星空私聊发送消息', async ({ page }) => {
  await seedSettings(page)
  await mockChat(page, '星空收到你的消息了。')
  await page.goto('/#/starry')
  await expect(page.locator('.contact-item').first()).toBeVisible({ timeout: 20_000 })
  await page.locator('.contact-item').first().click()
  await page.locator('.composer-input').fill('在吗')
  await page.locator('.send-btn').click()
  await expect(page.locator('.messages')).toContainText('星空收到你的消息了。', { timeout: 25_000 })
})

test('API Key 加密落盘且刷新后仍可用', async ({ page }) => {
  await seedSettings(page)
  await page.waitForFunction(() => {
    const raw = localStorage.getItem('ai_chat_settings') || ''
    return raw.includes('enc:v1:')
  }, null, { timeout: 10_000 })
  const raw = await page.evaluate(() => localStorage.getItem('ai_chat_settings'))
  expect(raw).not.toContain('sk-smoke')
  expect(raw).not.toContain('tvly-')

  await mockChat(page)
  await page.reload()
  await page.waitForSelector('.topbar')
  await page.locator('.chat-input').fill('加密后还能用吗')
  await page.locator('.action-btn.send').click()
  await expect(page.locator('.message-list')).toContainText('这是冒烟测试回复。', { timeout: 20_000 })
})

test('设置保存后刷新仍生效', async ({ page }) => {
  await seedSettings(page, { userName: '' })
  await page.locator('.btn-settings').click()
  await page.getByRole('button', { name: /用户信息/ }).click()
  const nameInput = page.locator('.settings-panel input[type="text"]').first()
  await nameInput.fill('持久化昵称')
  await page.getByRole('button', { name: '保存并关闭' }).click()
  await page.reload()
  await page.waitForSelector('.topbar')
  await expect(page.locator('.user-name')).toHaveText('持久化昵称')
})
