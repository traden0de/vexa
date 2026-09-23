import type { ReactNode } from 'react'
import { Html } from '@/components/Html'

export default function RootLayout({ children }: { children: ReactNode }): ReactNode {
  return <Html lang="ru">{children}</Html>
}
