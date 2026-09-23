import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { AgentStore } from './agents'
import { locateClaude } from './claude/locate'
import { runClaude } from './claude/runner'
import { Db } from './db'
import { registerIpc } from './ipc'
import { migrateFromVeltrix } from './migrate'
import { Orchestrator } from './pipeline/orchestrator'
import type { IpcEventName, IpcEvents } from '@shared/ipc'

// Lets tests and multiple dev instances use an isolated data folder.
if (process.env.VEXA_USER_DATA) app.setPath('userData', process.env.VEXA_USER_DATA)

let win: BrowserWindow | null = null

function emit<E extends IpcEventName>(event: E, payload: IpcEvents[E]): void {
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send(event, payload)
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: '#0e1116',
    title: 'Vexa',
    autoHideMenuBar: true,
    // Packaged builds take the icon from the exe; in dev use the source PNG.
    ...(app.isPackaged ? {} : { icon: join(app.getAppPath(), 'build', 'icon.png') }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  win.on('ready-to-show', () => win?.show())
  // External links open in the system browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (process.env.ELECTRON_RENDERER_URL && url.startsWith(process.env.ELECTRON_RENDERER_URL)) return
    e.preventDefault()
  })
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(() => {
  app.setAppUserModelId('dev.vexa.app')
  const userData = app.getPath('userData')
  if (!process.env.VEXA_USER_DATA) migrateFromVeltrix(app.getPath('appData'), userData)
  const db = new Db(join(userData, 'vexa.db'))
  const builtinAgents = app.isPackaged
    ? join(process.resourcesPath, 'agents')
    : join(app.getAppPath(), 'resources', 'agents')
  const agents = new AgentStore(builtinAgents, join(userData, 'agents'))
  const locate = () => locateClaude(db.getSettings().claudePath || undefined)
  const orchestrator = new Orchestrator({ db, agents, run: runClaude, locate, emit })

  registerIpc({ db, agents, orchestrator, locate, getWindow: () => win })
  createWindow()
  orchestrator.kick()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
  // Kill a running claude process on exit; the task is marked interrupted on next start.
  app.on('before-quit', () => orchestrator.shutdown())
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
