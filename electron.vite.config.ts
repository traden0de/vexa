import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    resolve: { alias: { '@shared': resolve('src/shared') } }
  },
  preload: {
    resolve: { alias: { '@shared': resolve('src/shared') } }
  },
  renderer: {
    resolve: { alias: { '@shared': resolve('src/shared'), '@': resolve('src/renderer/src') } },
    plugins: [react()],
    // Vite may bind to IPv6 ::1 only while Electron resolves localhost to 127.0.0.1.
    server: { host: '127.0.0.1' },
    build: { minify: 'esbuild', chunkSizeWarningLimit: 16000 }
  }
})
