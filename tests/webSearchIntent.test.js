import { describe, expect, it } from 'vitest'
import {
  buildSearchFallbackLinks,
  buildSearchFallbackText,
  detectSearchIntent,
  detectSearchReply,
} from '../src/services/webSearch'

describe('detectSearchIntent', () => {
  it('空内容与超长内容不判意图', () => {
    expect(detectSearchIntent('')).toBe('none')
    expect(detectSearchIntent('   ')).toBe('none')
    expect(detectSearchIntent(null)).toBe('none')
    expect(detectSearchIntent(undefined)).toBe('none')
    expect(detectSearchIntent('今'.repeat(501))).toBe('none')
  })

  it('明确的搜索动作直接搜', () => {
    for (const text of [
      '帮我搜一下今天的新闻',
      '上网搜搜 DeepSeek 的定价',
      'google 一下 2026 年 AI 大会',
      '查询下高铁时刻表',
    ]) {
      expect(detectSearchIntent(text)).toBe('search')
    }
  })

  it('强时效词直接搜，不必是问句', () => {
    for (const text of [
      'DeepSeek 最新版本',
      '明天天气',
      '现在股价多少',
      '这场比赛的比分',
    ]) {
      expect(detectSearchIntent(text)).toBe('search')
    }
  })

  it('问候语开头不影响明确搜索动作的判定', () => {
    expect(detectSearchIntent('你好')).toBe('none')
    expect(detectSearchIntent('你好，帮我搜一下今天的新闻')).toBe('search')
  })

  it('弱时效词要配合问句或事实主题才搜', () => {
    expect(detectSearchIntent('最近有什么新电影')).toBe('search')
    expect(detectSearchIntent('目前的价格是多少')).toBe('search')
    expect(detectSearchIntent('我最近看了本书')).toBe('none')
    expect(detectSearchIntent('最近好吗')).toBe('none')
  })

  it('事实类问句但没有时效线索时先征求同意', () => {
    expect(detectSearchIntent('2024 年诺贝尔文学奖得主是谁')).toBe('confirm')
    expect(detectSearchIntent('这个活动的官网地址是什么')).toBe('confirm')
  })

  it('问助手自己或聊情绪时不提示联网', () => {
    for (const text of [
      '你是谁',
      '你能做什么',
      '你有什么功能',
      '我好累',
      '我最近心情不好怎么办',
    ]) {
      expect(detectSearchIntent(text)).toBe('none')
    }
  })
})

describe('detectSearchReply', () => {
  it('整句只是肯定态度时算同意', () => {
    for (const text of ['搜', '搜一下', '搜吧', '搜索！', '要', '要搜', '好', '好的', '好吧', '嗯', '嗯嗯', '可以', '对', '行', '查一下', 'yes', 'OK', ' ok ']) {
      expect(detectSearchReply(text)).toBe('yes')
    }
  })

  it('整句只是否定态度时算拒绝', () => {
    for (const text of ['不', '不用', '不用了', '不需要', '不要', '不搜', '别搜', '算了', 'no']) {
      expect(detectSearchReply(text)).toBe('no')
    }
  })

  it('夹带其他内容的句子交给普通意图判定', () => {
    expect(detectSearchReply('搜一下明天的天气')).toBe('other')
    expect(detectSearchReply('好的，那我们继续写代码')).toBe('other')
    expect(detectSearchReply('随便')).toBe('other')
    expect(detectSearchReply('')).toBe('other')
    expect(detectSearchReply(null)).toBe('other')
  })
})

describe('搜索兜底链接', () => {
  it('空查询不生成链接', () => {
    expect(buildSearchFallbackLinks('')).toEqual([])
    expect(buildSearchFallbackText('   ')).toBe('')
  })

  it('查询词做 URL 编码并给出四个引擎', () => {
    const links = buildSearchFallbackLinks('OpenAI 新 模型')
    expect(links).toHaveLength(4)
    expect(links.map(l => l.name)).toEqual(['必应', '百度', '360 搜索', '搜狗'])
    expect(links[0].url).toContain('q=OpenAI%20%E6%96%B0%20%E6%A8%A1%E5%9E%8B')
    expect(buildSearchFallbackText('OpenAI 新 模型')).toMatch(/^手动搜索：\[必应\]/)
  })
})
