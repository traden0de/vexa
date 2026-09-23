import type { NextConfig } from 'next'

const config: NextConfig = {
  // Pure static HTML in out/ — deployed as a DigitalOcean App Platform static site.
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  poweredByHeader: false,
  // site/ has its own lockfile inside the app repo
  turbopack: { root: __dirname }
}

export default config
