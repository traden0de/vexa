// End-to-end run against the real `claude` CLI: drives the UI through one task's full cycle.
// Usage: VELTRIX_USER_DATA=<tmp> node e2e/full-cycle.mjs <projectPath> <shotsDir>
import { _electron as electron } from 'playwright-core'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const [project, outDir = 'e2e/shots'] = process.argv.slice(2)
mkdirSync(outDir, { recursive: true })
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)

const app = await electron.launch({ args: ['.'] })
const win = await app.firstWindow()
win.on('pageerror', (e) => log('[pageerror]', e.message))
await win.setViewportSize({ width: 1440, height: 900 })
await win.waitForSelector('.rail')
const invoke = (ch, ...args) => win.evaluate(([c, a]) => window.veltrix.invoke(c, ...a), [ch, args])
const shot = (name) => win.screenshot({ path: join(outDir, name + '.png') })

const p = await invoke('projects:open', project)
await win.reload()
await win.waitForSelector('.board')

// Create a task through the dialog
await win.locator('.topbar .btn.primary').click()
await win.fill('#nt-title', 'Добавить функцию multiply')
await win.fill('#nt-desc', 'Добавь в src/math.js функцию multiply(a, b), возвращающую произведение, и тесты к ней.')
await shot('10-new-task')
await win.locator('.dialog footer .btn.primary').click()
log('task created')

const task = async () => (await invoke('tasks:list', p.id)).at(-1)
async function waitFor(statuses, timeoutMin, onTick) {
  const end = Date.now() + timeoutMin * 60000
  let last = ''
  while (Date.now() < end) {
    const t = await task()
    const s = `${t.status}/${t.activeStage ?? ''}/${t.iteration}`
    if (s !== last) log('state', s, t.error ?? '')
    last = s
    if (onTick) await onTick(t)
    if (statuses.includes(t.status)) return t
    await win.waitForTimeout(3000)
  }
  throw new Error('timeout waiting for ' + statuses)
}

const openCard = () => win.locator('.card', { hasText: 'multiply' }).click({ timeout: 10000 })

let t = await waitFor(['approval', 'failed'], 15)
if (t.status === 'failed') throw new Error(t.error)
await openCard()
await win.waitForSelector('.drawer')
await win.waitForTimeout(500)
await shot('11-plan-approval')

await win.locator('.dr-f .btn.primary').click()
log('plan approved')
await win.waitForTimeout(1500)
await shot('12-board-after-approve')

let logShot = false
t = await waitFor(['review', 'failed'], 60, async (cur) => {
  if (!logShot && cur.status === 'progress' && cur.activeStage === 'code') {
    logShot = true
    await openCard()
    await win.waitForSelector('.drawer')
    await win.waitForTimeout(20000)
    await shot('13-live-log')
    await win.keyboard.press('Escape')
  }
})
if (t.status === 'failed') {
  await shot('19-failed')
  throw new Error(t.error)
}
await openCard()
await win.waitForSelector('.drawer')
for (const [i, tab] of ['Отчёты', 'Изменения', 'Версия', 'Живой лог'].entries()) {
  await win.locator('.tabs button', { hasText: tab }).click()
  await win.waitForTimeout(tab === 'Изменения' ? 3000 : 800)
  await shot(`1${4 + i}-${tab}`)
}
await win.locator('.dr-f .btn.ok').click()
t = await waitFor(['done'], 2)
log('accepted', t.version)
await win.locator('.rail-btn[aria-label="Git"]').click()
await win.waitForTimeout(1200)
await shot('18-git')
log('cost', t.costUsd, 'duration', t.durationMs)
await app.close()
