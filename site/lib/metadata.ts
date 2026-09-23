import type { Metadata } from 'next'
import type { Dict, Lang } from '@/content/types'

/** Absolute URLs (canonical, hreflang, Open Graph) only when SITE_URL is set at build time. */
const site = process.env.SITE_URL?.replace(/\/$/, '')

export function pageMetadata(dict: Dict, lang: Lang): Metadata {
  const path = lang === 'en' ? '/' : '/ru/'
  return {
    title: dict.meta.title,
    description: dict.meta.description,
    icons: { icon: '/favicon-64.png', apple: '/apple-touch-icon.png' },
    ...(site && {
      metadataBase: new URL(site),
      alternates: { canonical: path, languages: { en: '/', ru: '/ru/', 'x-default': '/' } }
    }),
    openGraph: {
      title: dict.meta.title,
      description: dict.meta.description,
      type: 'website',
      locale: lang === 'en' ? 'en_US' : 'ru_RU',
      ...(site && { url: path, images: [{ url: '/icon.png', width: 256, height: 256 }] })
    }
  }
}
