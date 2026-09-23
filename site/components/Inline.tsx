import type { ReactNode } from 'react'

/** Minimal inline markdown for CHANGELOG lines: `code`, **bold** and [links](url). */
export function Inline({ text }: { text: string }): ReactNode {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\))/g)
  return parts.map((p, i) => {
    if (p.startsWith('`') && p.endsWith('`')) return <code key={i}>{p.slice(1, -1)}</code>
    if (p.startsWith('**') && p.endsWith('**')) return <b key={i}>{p.slice(2, -2)}</b>
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(p)
    if (link) return <a key={i} href={link[2]}>{link[1]}</a>
    return p
  })
}
