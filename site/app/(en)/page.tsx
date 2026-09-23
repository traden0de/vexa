import type { Metadata } from 'next'
import { Landing } from '@/components/Landing'
import { en } from '@/content/en'
import { pageMetadata } from '@/lib/metadata'

export const metadata: Metadata = pageMetadata(en, 'en')

export default function Page() {
  return <Landing dict={en} lang="en" />
}
