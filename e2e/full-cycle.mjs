// End-to-end run against the real `claude` CLI: drives the UI through one task's full cycle.
// Usage: VEXA_USER_DATA=<tmp> [DISCUSS=1] node e2e/full-cycle.mjs <projectPath> <shotsDir>
// DISCUSS=1 ticks “Discuss before planning”, sets a custom branch and answers the planner's questions via the UI.
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
const invoke = (ch, ...args) => win.evaluate(([c, a]) => window.vexa.invoke(c, ...a), [ch, args])
const shot = (name) => win.screenshot({ path: join(outDir, name + '.png') })

const DISCUSS = !!process.env.DISCUSS
const TITLE = DISCUSS ? 'Добавить функцию divide' : 'Добавить функцию multiply'
const BRANCH = 'feature/divide'
// Tours would cover the UI the script clicks.
await invoke('settings:set', { tourSeen: { welcome: true, board: true } })
const p = await invoke('projects:open', project)
await win.reload()
await win.waitForSelector('.board')

// Create a task through the dialog
await win.locator('.topbar .btn.primary').click()
await win.fill('#nt-title', TITLE)
if (DISCUSS) {
  await win.fill('#nt-desc', 'Добавь в src/math.js функцию divide(a, b) и тесты к ней.')
  await win.check('#nt-discuss')
  await win.fill('#nt-branch', BRANCH)
} else {
  await win.fill('#nt-desc', 'Добавь в src/math.js функцию multiply(a, b), возвращающую произведение, и тесты к ней.')
}
await shot('10-new-task')
await win.locator('.dialog footer .btn.primary').click()
for (let i = 0; !(await invoke('tasks:list', p.id)).length; i++) {
  if (i > 30) {
    await shot('10-create-failed')
    throw new Error('task was not created: ' + (await win.locator('.toast').allInnerTexts()).join(' | '))
  }
  await win.waitForTimeout(500)
}
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

const openCard = () => win.locator('.card', { hasText: TITLE }).click({ timeout: 10000 })

let t = await waitFor(['approval', 'failed'], 15)
if (t.status === 'failed') throw new Error(t.error)
for (let round = 1; t.questions?.length && round <= 3; round++) {
  log('questions', JSON.stringify(t.questions.map((q) => [q.question, q.options.map((o) => o.label)])))
  await openCard()
  await win.waitForSelector('.question')
  await win.waitForTimeout(500)
  await shot('11-questions-' + round)
  for (const q of t.questions) {
    if (q.options.length) await win.locator('.question', { hasText: q.question }).locator('.option').first().click()
    else await win.fill('#q-' + q.id + '-custom', 'На твоё усмотрение')
  }
  await shot('11-answered-' + round)
  await win.locator('.dr-f .btn.primary').click()
  log('answered round', round)
  await win.waitForTimeout(1500)
  t = await waitFor(['approval', 'failed'], 15, async (cur) => cur.status !== 'approval' || !cur.questions)
  if (t.status === 'failed') throw new Error(t.error)
}
if (DISCUSS && !t.discussion.length) throw new Error('discuss mode produced no questions')
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
