// UI checks for the onboarding tour, scrolling, branch management and the task dialog.
// Usage: VELTRIX_USER_DATA=<fresh tmp dir> node e2e/features.mjs <projectPath> <shotsDir>
import { _electron as electron } from 'playwright-core'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const [project, outDir = 'e2e/shots'] = process.argv.slice(2)
mkdirSync(outDir, { recursive: true })
const fail = (msg) => {
  console.log('FAIL', msg)
  process.exitCode = 1
}

const app = await electron.launch({ args: ['.'] })
const win = await app.firstWindow()
win.on('pageerror', (e) => console.log('[pageerror]', e.message))
await win.setViewportSize({ width: 1440, height: 900 })
await win.waitForSelector('.rail')
const invoke = (ch, ...args) => win.evaluate(([c, a]) => window.veltrix.invoke(c, ...a), [ch, args])
const shot = (name) => win.screenshot({ path: join(outDir, name + '.png') })

// 1. Welcome tour on first launch
await win.waitForSelector('.driver-popover', { timeout: 5000 }).catch(() => fail('welcome tour did not start'))
await shot('20-tour-welcome-1')
await win.locator('.driver-popover-next-btn').click()
await win.waitForTimeout(400)
await shot('21-tour-welcome-2')
await win.locator('.vx-tour-skip').click()
await win.waitForTimeout(300)
if (await win.locator('.driver-popover').count()) fail('skip did not close the tour')
if (!(await invoke('settings:get')).tourSeen.welcome) fail('welcome tour not marked as seen')

// 2. Board tour on first project
const p = await invoke('projects:open', project)
await win.reload()
await win.waitForSelector('.board')
await win.waitForSelector('.driver-popover', { timeout: 5000 }).catch(() => fail('board tour did not start'))
await shot('22-tour-board-1')
for (let i = 0; i < 3; i++) await win.locator('.driver-popover-next-btn').click()
await win.waitForTimeout(400)
await shot('23-tour-board-4')
await win.keyboard.press('Escape')
await win.waitForTimeout(300)

// 3. Task dialog with "Discuss" and branch name
await win.locator('.topbar .btn.primary').click()
await win.fill('#nt-title', 'Проверка формы')
await win.check('#nt-discuss')
await win.waitForTimeout(200)
await shot('24-task-dialog')
await win.keyboard.press('Escape')

// 4. Branches on the Git screen
await win.locator('.rail-btn[aria-label="Git"]').click()
await win.waitForSelector('text=Новая ветка')
await win.locator('button', { hasText: 'Новая ветка' }).click()
await win.fill('#nb-name', 'e2e/temp-branch')
await win.uncheck('#nb-checkout')
await shot('25-new-branch')
await win.locator('.dialog footer .btn.primary').click()
await win.waitForTimeout(800)
const branches = await invoke('git:branches', p.id)
if (!branches.some((b) => b.name === 'e2e/temp-branch')) fail('branch was not created')
if (branches.find((b) => b.current)?.name === 'e2e/temp-branch') fail('checked out although the box was unticked')
await shot('26-branch-list')
await win.locator('button[aria-label="Удалить e2e/temp-branch"]').click()
await win.locator('.dialog footer .btn.danger').click()
await win.waitForTimeout(800)
if ((await invoke('git:branches', p.id)).some((b) => b.name === 'e2e/temp-branch')) fail('branch was not deleted')

// 5. Scrolling on a tall page (short window)
await win.setViewportSize({ width: 1200, height: 520 })
await win.locator('.rail-btn[aria-label="Проект"]').click()
await win.waitForTimeout(800)
const scroll = await win.evaluate(() => {
  const v = document.querySelector('.view')
  v.scrollTop = v.scrollHeight
  return { top: v.scrollTop, height: v.scrollHeight, client: v.clientHeight }
})
if (scroll.height > scroll.client && scroll.top === 0) fail('project view does not scroll')
console.log('scroll', JSON.stringify(scroll))
await shot('27-project-scrolled')

await app.close()
console.log(process.exitCode ? 'FAILED' : 'OK')
