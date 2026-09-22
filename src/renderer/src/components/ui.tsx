import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { AgentId, Priority, StageId, StageState, TaskType } from '@shared/types'
import { STAGES } from '@shared/types'

export const AGENT_COLORS: Record<AgentId, [string, string, string]> = {
  planner: ['var(--info)', 'var(--info-soft)', 'P'],
  developer: ['var(--accent-ink)', 'var(--accent-soft)', 'D'],
  tester: ['var(--ok)', 'var(--ok-soft)', 'T'],
  reviewer: ['var(--violet)', 'var(--violet-soft)', 'R'],
  security: ['var(--bad)', 'var(--bad-soft)', 'S'],
  release: ['var(--teal)', 'var(--teal-soft)', 'V']
}

export function TypeTag({ type }: { type: TaskType }): ReactNode {
  return <span className={`tag t-${type}`}>{type}</span>
}

export function Prio({ p }: { p: Priority }): ReactNode {
  return (
    <span className={`prio p${p}`} aria-label={`priority ${p}`}>
      <i />
      <i />
      <i />
    </span>
  )
}

export function MiniStages({ stages }: { stages: Record<StageId, StageState> }): ReactNode {
  return (
    <div className="mini">
      {STAGES.map((s) => (
        <i key={s} className={stages[s]} />
      ))}
    </div>
  )
}

export function Seg<T extends string | number>({
  value,
  options,
  onChange
}: {
  value: T
  options: { value: T; label: ReactNode }[]
  onChange: (v: T) => void
}): ReactNode {
  return (
    <div className="seg" role="group">
      {options.map((o) => (
        <button type="button" key={String(o.value)} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }): ReactNode {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className={`toggle ${on ? 'on' : ''}`} onClick={() => onChange(!on)} />
}

export function Modal({ children, onClose }: { children: ReactNode; onClose: () => void }): ReactNode {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      {children}
    </div>
  )
}

/** Dialog asking for a comment (re-plan, rework) or a plain confirmation. */
export function AskDialog({
  title,
  body,
  placeholder,
  confirm,
  danger,
  onConfirm,
  onClose
}: {
  title: string
  body?: ReactNode
  placeholder?: string
  confirm: string
  danger?: boolean
  onConfirm: (text: string) => void | Promise<void>
  onClose: () => void
}): ReactNode {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => ref.current?.focus(), [])
  const needsText = placeholder !== undefined
  return (
    <Modal onClose={onClose}>
      <form
        className="dialog"
        onSubmit={async (e) => {
          e.preventDefault()
          if (needsText && !text.trim()) return
          setBusy(true)
          try {
            await onConfirm(text.trim())
            onClose()
          } finally {
            setBusy(false)
          }
        }}
      >
        <header>{title}</header>
        <div className="body">
          {body && <p style={{ marginTop: 0 }}>{body}</p>}
          {needsText && (
            <textarea id="ask-text" ref={ref} className="inp" placeholder={placeholder} value={text} onChange={(e) => setText(e.target.value)} />
          )}
        </div>
        <footer>
          <button type="button" className="btn ghost" onClick={onClose}>
            {t('cancel')}
          </button>
          <button type="submit" className={`btn ${danger ? 'danger' : 'primary'}`} disabled={busy || (needsText && !text.trim())}>
            {confirm}
          </button>
        </footer>
      </form>
    </Modal>
  )
}

export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`
}

export function formatCost(usd: number): string {
  return `$${usd.toFixed(2)}`
}

// ---------------------------------------------------------------- tiny markdown

const FENCE = /^\s*```/
const LIST_ITEM = /^\s*([-*]|\d+[.)])\s+/

/** Minimal, safe markdown → React (headings, lists, code, bold, inline code, links as text). */
export function Markdown({ text }: { text: string }): ReactNode {
  const blocks: ReactNode[] = []
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  let i = 0
  let key = 0
  while (i < lines.length) {
    const line = lines[i]
    if (FENCE.test(line)) {
      const code: string[] = []
      i++
      const indent = line.match(/^\s*/)![0].length
      while (i < lines.length && !FENCE.test(lines[i])) code.push(lines[i++].slice(indent))
      i++
      blocks.push(
        <pre key={key++}>
          <code>{code.join('\n')}</code>
        </pre>
      )
      continue
    }
    const h = line.match(/^(#{1,4})\s+(.*)$/)
    if (h) {
      const level = Math.min(h[1].length + 1, 4)
      const Tag = `h${level}` as 'h2'
      blocks.push(<Tag key={key++}>{inline(h[2])}</Tag>)
      i++
      continue
    }
    if (/^\s*([-*]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d/.test(line)
      const items: string[] = []
      while (i < lines.length && /^\s*([-*]|\d+[.)])\s+/.test(lines[i])) {
        let item = lines[i].replace(/^\s*([-*]|\d+[.)])\s+/, '')
        i++
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !LIST_ITEM.test(lines[i]) && !FENCE.test(lines[i]))
          item += ' ' + lines[i++].trim()
        items.push(item)
      }
      const List = ordered ? 'ol' : 'ul'
      blocks.push(
        <List key={key++}>
          {items.map((it, j) => (
            <li key={j}>{inline(it)}</li>
          ))}
        </List>
      )
      continue
    }
    if (!line.trim()) {
      i++
      continue
    }
    const para: string[] = []
    while (i < lines.length && lines[i].trim() && !/^#{1,4}\s/.test(lines[i]) && !FENCE.test(lines[i]) && !LIST_ITEM.test(lines[i]))
      para.push(lines[i++])
    blocks.push(<p key={key++}>{inline(para.join(' '))}</p>)
  }
  return <div className="md">{blocks}</div>
}

function inline(s: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g
  let last = 0
  let m: RegExpExecArray | null
  let k = 0
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index))
    const tok = m[0]
    if (tok.startsWith('`')) out.push(<code key={k++}>{tok.slice(1, -1)}</code>)
    else if (tok.startsWith('**')) out.push(<strong key={k++}>{tok.slice(2, -2)}</strong>)
    else out.push(tok.replace(/^\[([^\]]+)\]\(([^)]+)\)$/, '$1'))
    last = m.index + tok.length
  }
  if (last < s.length) out.push(s.slice(last))
  return out
}
