import type { ReactNode } from 'react'
import { IBM_Plex_Sans, JetBrains_Mono, Syne, Unbounded } from 'next/font/google'
import type { Lang } from '@/content/types'
import '@/app/globals.css'

const brand = Syne({ subsets: ['latin'], weight: ['600', '700', '800'], variable: '--font-brand', display: 'swap' })
// Syne has no Cyrillic, so Russian pages set headings in Unbounded (same wide geometric feel).
const brandCyr = Unbounded({ subsets: ['latin', 'cyrillic'], weight: ['600', '700', '800'], variable: '--font-brand', display: 'swap' })
const sans = IBM_Plex_Sans({ subsets: ['latin', 'cyrillic'], weight: ['400', '500', '600'], variable: '--font-sans', display: 'swap' })
const mono = JetBrains_Mono({ subsets: ['latin', 'cyrillic'], weight: ['400', '500'], variable: '--font-mono', display: 'swap' })

// Runs before first paint so a saved light/dark choice never flashes the other theme.
const themeScript = `try{var t=localStorage.getItem('vexa-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`

export function Html({ lang, children }: { lang: Lang; children: ReactNode }): ReactNode {
  return (
    <html lang={lang} className={`${lang === 'ru' ? brandCyr.variable : brand.variable} ${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  )
}
