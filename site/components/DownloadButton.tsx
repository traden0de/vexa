'use client'

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { ChevronDown, Code2, Download, ExternalLink, History } from 'lucide-react'
import type { Dict } from '@/content/types'

type Props = {
  labels: Dict['download']
  version: string
  installer: string
  releasePage: string
  repo: string
}

/**
 * Split button: the main part is a plain link to the installer (GitHub answers with a redirect
 * to the file, so the download starts and the visitor stays here); the chevron opens GitHub links.
 */
export function DownloadButton({ labels, version, installer, releasePage, repo }: Props): ReactNode {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const caret = useRef<HTMLButtonElement>(null)
  const menuId = useId()

  const items = [
    { href: releasePage, label: labels.release, icon: ExternalLink },
    { href: `${repo}/releases`, label: labels.all, icon: History },
    { href: repo, label: labels.source, icon: Code2 }
  ]

  const focusItem = (i: number): void => {
    const links = root.current?.querySelectorAll<HTMLAnchorElement>('[role="menuitem"]')
    if (links?.length) links[(i + links.length) % links.length].focus()
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent): void => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  const openMenu = (first: number): void => {
    setOpen(true)
    requestAnimationFrame(() => focusItem(first))
  }

  const onCaretKey = (e: KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      openMenu(0)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      openMenu(-1)
    }
  }

  const onMenuKey = (e: KeyboardEvent): void => {
    const links = [...(root.current?.querySelectorAll<HTMLAnchorElement>('[role="menuitem"]') ?? [])]
    const i = links.indexOf(document.activeElement as HTMLAnchorElement)
    if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
      caret.current?.focus()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      focusItem(i + 1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      focusItem(i - 1)
    } else if (e.key === 'Home') {
      e.preventDefault()
      focusItem(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      focusItem(-1)
    } else if (e.key === 'Tab') setOpen(false)
  }

  return (
    <div className="dl">
      <div className="split" ref={root}>
        <a className="split-main" href={installer}>
          <Download aria-hidden />
          <span>{labels.main}</span>
          <span className="split-ver">v{version}</span>
        </a>
        <button
          ref={caret}
          type="button"
          className="split-caret"
          aria-label={labels.more}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => setOpen(!open)}
          onKeyDown={onCaretKey}
        >
          <ChevronDown aria-hidden />
        </button>
        {open && (
          <ul className="split-menu" id={menuId} role="menu" aria-label={labels.more} onKeyDown={onMenuKey}>
            {items.map(({ href, label, icon: Icon }) => (
              <li key={href} role="none">
                <a role="menuitem" href={href} target="_blank" rel="noopener" onClick={() => setOpen(false)}>
                  <Icon aria-hidden />
                  {label}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="dl-sub">{labels.platform}</p>
    </div>
  )
}
