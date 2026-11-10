const MAX_LINES = 1500
const MAX_CELLS = 900000

/**
 * 行级差异（LCS）。返回统一 diff 的逐行操作，供简易对比视图渲染。
 * 超大文本退化为「全部删除 + 全部新增」，避免长任务卡死界面。
 */
export function diffLines(oldText, newText) {
  const toLines = value => {
    const text = String(value ?? '')
    return text === '' ? [] : text.split('\n')
  }
  const a = toLines(oldText)
  const b = toLines(newText)

  if (a.length > MAX_LINES || b.length > MAX_LINES || a.length * b.length > MAX_CELLS) {
    return {
      ops: [
        ...a.map((text, i) => ({ type: 'del', text, oldLine: i + 1 })),
        ...b.map((text, i) => ({ type: 'add', text, newLine: i + 1 })),
      ],
      truncated: true,
    }
  }

  const m = a.length
  const n = b.length
  const dp = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1))
  for (let i = m - 1; i >= 0; i -= 1) {
    for (let j = n - 1; j >= 0; j -= 1) {
      dp[i][j] = a[i] === b[j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }

  const ops = []
  let i = 0
  let j = 0
  let oldLine = 1
  let newLine = 1
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      ops.push({ type: 'same', text: a[i], oldLine: oldLine++, newLine: newLine++ })
      i += 1
      j += 1
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: 'del', text: a[i], oldLine: oldLine++ })
      i += 1
    } else {
      ops.push({ type: 'add', text: b[j], newLine: newLine++ })
      j += 1
    }
  }
  while (i < m) {
    ops.push({ type: 'del', text: a[i], oldLine: oldLine++ })
    i += 1
  }
  while (j < n) {
    ops.push({ type: 'add', text: b[j], newLine: newLine++ })
    j += 1
  }
  return { ops, truncated: false }
}

export function diffStats(ops) {
  let added = 0
  let removed = 0
  for (const op of ops) {
    if (op.type === 'add') added += 1
    else if (op.type === 'del') removed += 1
  }
  return { added, removed }
}
