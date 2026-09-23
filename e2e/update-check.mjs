// Local update test: serves a folder with latest.yml + installer over HTTP and drives an older
// packaged build through check → download (install is not triggered).
// Usage: node e2e/update-check.mjs <oldAppExe> <folderWithLatestYml> <shotsDir>
import { _electron as electron } from 'playwright-core'
import { createServer } from 'node:http'
import { createReadStream, mkdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const [exe, feedDir, outDir = 'e2e/shots'] = process.argv.slice(2)
mkdirSync(outDir, { recursive: true })
const server = createServer((req, res) => {
  const file = join(feedDir, decodeURIComponent(new URL(req.url, 'http://x').pathname))
  try {
    const st = statSync(file)
    const range = req.headers.range?.match(/bytes=(\d+)-(\d*)/)
    if (range) {
      const start = Number(range[1])
      const end = range[2] ? Number(range[2]) : st.size - 1
      res.writeHead(206, { 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes' })
      createReadStream(file, { start, end }).pipe(res)
    } else {
      res.writeHead(200, { 'Content-Length': st.size, 'Accept-Ranges': 'bytes' })
      createReadStream(file).pipe(res)
    }
  } catch {
    res.writeHead(404).end()
  }
})
await new Promise((r) => server.listen(8765, r))

const app = await electron.launch({
  executablePath: exe,
  env: { ...process.env, VEXA_UPDATE_URL: 'http://127.0.0.1:8765/', VEXA_USER_DATA: join(tmpdir(), 'vexa-upd-' + Date.now()) }
})
const win = await app.firstWindow()
await win.setViewportSize({ width: 1440, height: 900 })
await win.waitForSelector('.rail')
const invoke = (ch) => win.evaluate((c) => window.vexa.invoke(c), ch)
await win.evaluate(() => window.vexa.invoke('settings:set', { tourSeen: { welcome: true, board: true } }))
await win.reload()
await win.waitForSelector('.rail')

// Startup check fires after 5 s and should surface the banner.
await win.waitForSelector('.update-card', { timeout: 30000 })
console.log('banner', await win.locator('.update-card b').innerText())
await win.screenshot({ path: join(outDir, '30-update-banner.png') })

await win.locator('.update-card .btn.primary').click()
let s
for (let i = 0; i < 240; i++) {
  s = await invoke('update:state')
  if (s.status === 'downloaded' || s.status === 'error') break
  if (i === 2) await win.screenshot({ path: join(outDir, '31-update-downloading.png') })
  await win.waitForTimeout(500)
}
console.log('final', JSON.stringify(s))
await win.screenshot({ path: join(outDir, '32-update-ready.png') })
await win.locator('.rail-btn[aria-label="Настройки"]').click()
await win.waitForTimeout(500)
await win.screenshot({ path: join(outDir, '33-settings-updates.png') })
await app.close()
server.close()
process.exitCode = s?.status === 'downloaded' ? 0 : 1
