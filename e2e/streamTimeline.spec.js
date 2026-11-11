import { test, expect } from '@playwright/test'
import http from 'node:http'

const BASE_SETTINGS = {
  userName: '视觉验证',
  apiKey: 'sk-visual',
  model: 'visual-model',
  temperature: 0.7,
  maxTokens: 2048,
  skillsAllOnV1: true,
  personaEnabled: false,
  replyRulesEnabled: false,
  thinkingEnabled: true,
  workModeEnabled: true,
}

const WRITE_CHAIN = '```tool\n{"tool":"files","args":{"action":"write","path":"effect-chain.ts","content":"export interface Effect {\\n  id: string\\n  run(): void\\n}\\n\\nexport const chain: Effect[] = []\\n"}}\n```'
const WRITE_WORKER = '```tool\n{"tool":"files","args":{"action":"write","path":"process-worker.ts","content":"import { chain } from \'./effect-chain\'\\n\\nexport function tick() {\\n  chain.forEach(effect => effect.run())\\n}\\n"}}\n```'
const READ_CHAIN = '```tool\n{"tool":"files","args":{"action":"read","path":"effect-chain.ts"}}\n```'
const CALC = '```tool\n{"tool":"calculate","args":{"lang":"js","code":"return 1+1"}}\n```'

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

/** 带真实节奏的本地 SSE 服务：思考 → 叙述 → 工具围栏，三轮剧本 */
function startMockServer() {
  let chatCount = 0
  const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': '*',
        'access-control-allow-methods': '*',
      })
      return res.end()
    }
    let raw = ''
    for await (const chunk of req) raw += chunk
    const payload = JSON.parse(raw || '{}')
    const isTitle = String(payload.messages?.[0]?.content || '').includes('请用 3~8 个字概括')
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'access-control-allow-origin': '*',
      'cache-control': 'no-cache',
    })
    const send = obj => res.write(`data: ${JSON.stringify(obj)}\n\n`)
    const think = text => send({ choices: [{ delta: { reasoning_content: text } }] })
    const say = text => send({ choices: [{ delta: { content: text } }] })
    const stream = async (fn, text, size, ms) => {
      for (const piece of text.match(new RegExp(`[\\s\\S]{1,${size}}`, 'g')) || []) {
        fn(piece)
        await sleep(ms)
      }
    }
    const finish = () => {
      send({ usage: { prompt_tokens: 120, completion_tokens: 80, total_tokens: 200 } })
      res.write('data: [DONE]\n\n')
      res.end()
    }

    if (isTitle) {
      say('效果链搭建验证')
      return finish()
    }
    chatCount += 1
    if (chatCount === 1) {
      await stream(think, '用户要搭一条效果链。先创建两个核心文件，再读回验证。', 6, 50)
      await stream(say, '收到，这次要搭的是效果链核心。我先创建两个文件，确认当前状态再动手。\n', 6, 30)
      say(`${WRITE_CHAIN}\n${WRITE_WORKER}`)
      await sleep(250)
      return finish()
    }
    if (chatCount === 2) {
      await stream(think, '文件已创建。读回 effect-chain 并算一个校验值。', 6, 50)
      await stream(say, '架构已经摸清。现在读回验证，我会逐步确认。\n', 6, 30)
      say(`${READ_CHAIN}\n${CALC}`)
      await sleep(250)
      return finish()
    }
    await stream(think, '验证通过，收尾总结。', 6, 60)
    await stream(say, '完成。两个文件已创建并读回验证，校验值 2 与预期一致。', 4, 120)
    return finish()
  })
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }))
  })
}

async function seedAndOpen(page, port) {
  await page.addInitScript((settings) => {
    try {
      if (sessionStorage.getItem('e2e_seeded') === '1') return
      sessionStorage.setItem('e2e_seeded', '1')
      localStorage.setItem('ai_chat_settings', JSON.stringify(settings))
      localStorage.removeItem('xiyue_storage_migrated_v1')
    } catch { /* ignore */ }
  }, { ...BASE_SETTINGS, apiBase: `http://127.0.0.1:${port}/v1` })
  await page.goto('/')
  await page.waitForSelector('.topbar')
}

async function runFlow(page) {
  await page.locator('.chat-input').fill('帮我搭一条效果链')
  await page.locator('.action-btn.send').click()
}

test('时间线流式输出：过程头部、工具行、思考行、状态行与折叠', async ({ page }, testInfo) => {
  const { server, port } = await startMockServer()
  const pageErrors = []
  page.on('pageerror', err => pageErrors.push(String(err)))
  try {
    await seedAndOpen(page, port)
    await runFlow(page)

    // 第一轮工具行出现（创建 ×2，带 diff 统计）
    await expect(page.locator('.trace-step')).toHaveCount(2, { timeout: 20_000 })
    await page.screenshot({ path: testInfo.outputPath('01-round1.png') })

    // 第二轮：读回 + 计算（并行批，沙箱初始化期间能看到 running 状态）
    await expect(page.locator('.trace-step')).toHaveCount(4, { timeout: 20_000 })
    await page.screenshot({ path: testInfo.outputPath('02-round2.png') })

    // 最终正文流式：状态行 + 光标
    await expect(page.locator('.streaming-text')).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('.gen-status')).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('03-live.png') })

    // 收尾：耗时头部、创建标签、+N 统计、思考行
    await expect(page.locator('.message-actions')).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('.process-time')).toContainText('已处理')
    await expect(page.locator('.step-label', { hasText: '创建' })).toHaveCount(2)
    await expect(page.locator('.stat-add').first()).toContainText('+')
    await expect(page.locator('.stat-del').first()).toContainText('-0')
    expect(await page.locator('.thinking-row').count()).toBeGreaterThanOrEqual(3)
    await expect(page.locator('.message-bubble').last()).not.toContainText('"tool"')
    await page.locator('.message-list').evaluate(el => { el.scrollTop = 0 })
    await sleep(300)
    await page.screenshot({ path: testInfo.outputPath('04-done.png') })

    // 展开单条步骤输出
    await page.locator('.step-row').first().click()
    await expect(page.locator('.step-detail')).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('05-detail.png') })

    // 折叠：过程收起，正文保留
    await page.locator('.process-toggle').click()
    await expect(page.locator('.tool-trace').first()).toBeHidden()
    await expect(page.locator('.part-text').first()).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('06-collapsed.png') })
    await page.locator('.process-toggle').click()
    await expect(page.locator('.tool-trace').first()).toBeVisible()

    // 暗色主题
    await page.evaluate(() => { document.documentElement.dataset.theme = 'dark' })
    await sleep(200)
    await page.screenshot({ path: testInfo.outputPath('07-dark.png') })

    // 重新生成 + 版本切换：时间线与耗时跟随版本恢复
    await page.evaluate(() => { document.documentElement.dataset.theme = 'light' })
    await page.locator('.message-actions .btn-action[title*="重新生成"]').first().click()
    await expect(page.locator('.ver-count')).toHaveText('2 / 2', { timeout: 20_000 })
    await expect(page.locator('.message-actions')).toBeVisible({ timeout: 20_000 })
    await page.locator('.ver-btn[title="上一版本"]').click()
    await expect(page.locator('.trace-step')).toHaveCount(4)
    await expect(page.locator('.process-time')).toContainText('已处理')
    await page.locator('.message-list').evaluate(el => { el.scrollTop = 0 })
    await sleep(200)
    await page.screenshot({ path: testInfo.outputPath('10-version-old.png') })
    await page.locator('.ver-btn[title="下一版本"]').click()
    await expect(page.locator('.trace-step')).toHaveCount(0)

    expect(pageErrors).toEqual([])
  } finally {
    server.close()
  }
})

test('移动端视口下时间线不溢出不遮挡', async ({ page }, testInfo) => {
  const { server, port } = await startMockServer()
  const pageErrors = []
  page.on('pageerror', err => pageErrors.push(String(err)))
  try {
    await page.setViewportSize({ width: 390, height: 844 })
    await seedAndOpen(page, port)
    await runFlow(page)
    await expect(page.locator('.message-actions')).toBeVisible({ timeout: 30_000 })
    await page.locator('.message-list').evaluate(el => { el.scrollTop = 0 })
    await sleep(300)
    await page.screenshot({ path: testInfo.outputPath('08-mobile.png') })
    const overflow = await page.evaluate(() => {
      const el = document.querySelector('.message-list')
      return el.scrollWidth > el.clientWidth + 1
    })
    expect(overflow).toBe(false)
    await page.locator('.process-toggle').click()
    await expect(page.locator('.tool-trace').first()).toBeHidden()
    await page.screenshot({ path: testInfo.outputPath('09-mobile-collapsed.png') })
    expect(pageErrors).toEqual([])
  } finally {
    server.close()
  }
})

test('上下文圆环：思考中暴涨的用量在回复结束后保持', async ({ page }) => {
  // 60k 汉字 ≈ 45k tokens：思考流式期间圆环应暴涨，收尾后不得跌回只剩正文
  const huge = '思'.repeat(60000)
  const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': '*',
        'access-control-allow-methods': '*',
      })
      return res.end()
    }
    let raw = ''
    for await (const chunk of req) raw += chunk
    const payload = JSON.parse(raw || '{}')
    const isTitle = String(payload.messages?.[0]?.content || '').includes('请用 3~8 个字概括')
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'access-control-allow-origin': '*',
      'cache-control': 'no-cache',
    })
    const send = obj => res.write(`data: ${JSON.stringify(obj)}\n\n`)
    if (isTitle) {
      send({ choices: [{ delta: { content: '长思考验证' } }] })
    } else {
      for (const piece of huge.match(/[\s\S]{1,2000}/g) || []) {
        send({ choices: [{ delta: { reasoning_content: piece } }] })
        await sleep(15)
      }
      send({ choices: [{ delta: { content: '思考结束，这是最终回答。' } }] })
    }
    send({ usage: { prompt_tokens: 120, completion_tokens: 80, total_tokens: 200 } })
    res.write('data: [DONE]\n\n')
    res.end()
  })
  const { port } = await new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => resolve({ port: server.address().port }))
  })
  const pageErrors = []
  page.on('pageerror', err => pageErrors.push(String(err)))
  const readRingUsed = () => page.evaluate(() => {
    const title = document.querySelector('.input-ctx .ctx-ring-btn')?.getAttribute('title') || ''
    const match = title.match(/上下文用量\s*([\d,]+)/)
    return match ? Number(match[1].replace(/,/g, '')) : -1
  })
  try {
    await seedAndOpen(page, port)
    await runFlow(page)
    await page.waitForFunction(() => {
      const title = document.querySelector('.input-ctx .ctx-ring-btn')?.getAttribute('title') || ''
      const match = title.match(/上下文用量\s*([\d,]+)/)
      return match ? Number(match[1].replace(/,/g, '')) > 40000 : false
    }, null, { timeout: 15_000 })
    await expect(page.locator('.message-actions')).toBeVisible({ timeout: 20_000 })
    await sleep(400)
    expect(await readRingUsed()).toBeGreaterThan(40000)
    expect(pageErrors).toEqual([])
  } finally {
    server.close()
  }
})
