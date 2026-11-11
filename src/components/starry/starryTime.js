/** 星空消息时间展示：时分、日期分隔条与 5 分钟间隔判断。 */
const GAP = 5 * 60 * 1000

function pad(n) {
  return String(n).padStart(2, '0')
}

export function fmtClock(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fmtDivider(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const now = new Date()
  const clock = fmtClock(ts)
  if (d.toDateString() === now.toDateString()) return clock
  if (d.getFullYear() === now.getFullYear()) {
    return `${d.getMonth() + 1}月${d.getDate()}日 ${clock}`
  }
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${clock}`
}

export function needsDivider(messages, index) {
  if (index === 0) return true
  const prev = messages[index - 1]
  const cur = messages[index]
  return (cur.ts || 0) - (prev.ts || 0) > GAP
}
