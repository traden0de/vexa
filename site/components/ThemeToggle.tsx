'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'
import type { Dict } from '@/content/types'

type Theme = 'system' | 'light' | 'dark'
const ORDER: Theme[] = ['system', 'light', 'dark']
const ICON = { system: Monitor, light: Sun, dark: Moon }

/** Cycles System → Light → Dark; "system" removes data-theme so prefers-color-scheme decides. */
export function ThemeToggle({ labels }: { labels: Dict['theme'] }): ReactNode {
  const [theme, setTheme] = useState<Theme>('system')

  useEffect(() => {
    const t = document.documentElement.dataset.theme
    if (t === 'light' || t === 'dark') setTheme(t)
  }, [])

  const next = (): void => {
    const t = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length]
    setTheme(t)
    if (t === 'system') delete document.documentElement.dataset.theme
    else document.documentElement.dataset.theme = t
    try {
      if (t === 'system') localStorage.removeItem('vexa-theme')
      else localStorage.setItem('vexa-theme', t)
    } catch {
      // storage blocked — the choice just lasts for this page view
    }
  }

  const Icon = ICON[theme]
  const label = `${labels.label}: ${labels[theme]}`
  return (
    <button type="button" className="icon-btn" onClick={next} aria-label={label} title={label}>
      <Icon aria-hidden />
    </button>
  )
}
