import type { Metadata } from 'next'
import { Html } from '@/components/Html'

export const metadata: Metadata = { title: 'Vexa — 404', icons: { icon: '/favicon-64.png' } }

export default function GlobalNotFound() {
  return (
    <Html lang="en">
      <main className="notfound wrap">
        <p className="eyebrow">404</p>
        <h1>This page is not on the board.</h1>
        <p className="lead">Страница не найдена.</p>
        <p>
          <a href="/">vexa →</a> · <a href="/ru/">на русском →</a>
        </p>
      </main>
    </Html>
  )
}
