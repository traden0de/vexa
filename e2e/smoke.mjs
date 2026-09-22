// Launches the built app, opens a project and saves screenshots of every screen.
import { _electron as electron } from 'playwright-core'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const project = process.argv[2]
const outDir = process.argv[3] ?? 'e2e/shots'
mkdirSync(outDir, { recursive: true })

const app = await electron.launch({ args: ['.'], env: { ...process.env, VELTRIX_E2E: '1' } })
const win = await app.firstWindow()
win.on('console', (m) => m.type() === 'error' && console.log('[renderer error]', m.text()))
win.on('pageerror', (e) => console.log('[pageerror]', e.message))
await win.setViewportSize({ width: 1440, height: 900 })
await win.waitForSelector('.rail')
await win.waitForTimeout(1500)
await win.screenshot({ path: join(outDir, '01-start.png') })

if (project) {
  await win.evaluate((p) => window.veltrix.invoke('projects:open', p), project)
  await win.reload()
  await win.waitForSelector('.board')
  await win.waitForTimeout(800)
  await win.screenshot({ path: join(outDir, '02-board.png') })
  for (const [i, label] of ['Git', 'Агенты', 'Проект', 'Настройки', 'Проекты'].entries()) {
    await win.locator(`.rail-btn[aria-label="${label}"]`).click()
    await win.waitForTimeout(900)
    await win.screenshot({ path: join(outDir, `0${3 + i}-${label}.png`) })
  }
}
await app.close()
