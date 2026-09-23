import type { Metadata } from 'next'
import { Landing } from '@/components/Landing'
import { ru } from '@/content/ru'
import { pageMetadata } from '@/lib/metadata'

export const metadata: Metadata = pageMetadata(ru, 'ru')

export default function Page() {
  return <Landing dict={ru} lang="ru" />
}
