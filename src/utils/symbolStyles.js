/**
 * 符号内文字样式：对渲染后的 HTML 的文本节点应用颜色/倾斜/加粗
 * 跳过代码块，避免破坏代码
 */
export function applySymbolStyles(html, rules) {
  const active = (rules || []).filter(r => r && r.open && r.close)
  if (!html || !active.length) return html

  const doc = new DOMParser().parseFromString(html, 'text/html')
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT)
  const nodes = []
  while (walker.nextNode()) {
    const node = walker.currentNode
    if (node.parentElement?.closest('code, pre')) continue
    nodes.push(node)
  }
  nodes.forEach(node => styleTextNode(node, active))
  return doc.body.innerHTML
}

function styleTextNode(node, rules) {
  const text = node.nodeValue || ''
  if (!text) return

  const frag = node.ownerDocument.createDocumentFragment()
  let cursor = 0

  while (cursor < text.length) {
    let best = null
    for (const rule of rules) {
      const idx = text.indexOf(rule.open, cursor)
      if (idx === -1) continue
      if (!best || idx < best.idx || (idx === best.idx && rule.open.length > best.rule.open.length)) {
        best = { idx, rule }
      }
    }
    if (!best) {
      frag.appendChild(node.ownerDocument.createTextNode(text.slice(cursor)))
      break
    }

    const openEnd = best.idx + best.rule.open.length
    const closeIdx = text.indexOf(best.rule.close, openEnd)
    if (closeIdx === -1) {
      frag.appendChild(node.ownerDocument.createTextNode(text.slice(cursor)))
      break
    }

    if (best.idx > cursor) {
      frag.appendChild(node.ownerDocument.createTextNode(text.slice(cursor, best.idx)))
    }
    frag.appendChild(node.ownerDocument.createTextNode(best.rule.open))

    const inner = text.slice(openEnd, closeIdx)
    if (inner) {
      const span = node.ownerDocument.createElement('span')
      // 默认黑色跟随主题文字色，避免深色模式下不可读
      span.style.color = best.rule.color === '#000000' ? 'var(--text-primary)' : best.rule.color
      if (best.rule.bold) span.style.fontWeight = '600'
      if (best.rule.italic) span.style.fontStyle = 'italic'
      span.textContent = inner
      frag.appendChild(span)
    }

    frag.appendChild(node.ownerDocument.createTextNode(best.rule.close))
    cursor = closeIdx + best.rule.close.length
  }

  node.parentNode.replaceChild(frag, node)
}
