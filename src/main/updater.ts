import { app } from 'electron'
import electronUpdater, { type AppUpdater, type UpdateInfo } from 'electron-updater'
import type { UpdateState } from '@shared/types'

/**
 * Updates come from GitHub Releases (see `publish` in electron-builder.yml): each release carries
 * `latest.yml`, the installer and its blockmap for differential downloads. Nothing is downloaded
 * until the user agrees; an installed update also applies on the next quit.
 */
export class Updater {
  private state: UpdateState
  private updater: AppUpdater | null = null

  constructor(
    private emit: (s: UpdateState) => void,
    /** Installing restarts the app, which would kill a running agent. */
    private isBusy: () => boolean
  ) {
    this.state = { status: app.isPackaged ? 'idle' : 'unsupported', current: app.getVersion() }
    if (!app.isPackaged) return

    const u = electronUpdater.autoUpdater
    u.autoDownload = false
    u.autoInstallOnAppQuit = true
    u.allowPrerelease = false
    // Test hook: point the app at a local folder served over HTTP (generic provider).
    if (process.env.VEXA_UPDATE_URL) u.setFeedURL({ provider: 'generic', url: process.env.VEXA_UPDATE_URL })

    u.on('checking-for-update', () => this.set({ status: 'checking', error: undefined }))
    u.on('update-available', (info) => this.set({ status: 'available', ...describe(info) }))
    u.on('update-not-available', () => this.set({ status: 'not-available', checkedAt: Date.now() }))
    u.on('download-progress', (p) => this.set({ status: 'downloading', percent: Math.round(p.percent) }))
    u.on('update-downloaded', (info) => this.set({ status: 'downloaded', percent: 100, ...describe(info) }))
    u.on('error', (e) => this.set({ status: 'error', error: humanError(e) }))
    this.updater = u
  }

  getState(): UpdateState {
    return { ...this.state }
  }

  async check(): Promise<UpdateState> {
    if (!this.updater) return this.getState()
    if (this.state.status === 'downloading' || this.state.status === 'downloaded') return this.getState()
    try {
      await this.updater.checkForUpdates()
    } catch (e) {
      this.set({ status: 'error', error: humanError(e) })
    }
    return this.getState()
  }

  async download(): Promise<UpdateState> {
    if (!this.updater || this.state.status !== 'available') return this.getState()
    this.set({ status: 'downloading', percent: 0 })
    try {
      await this.updater.downloadUpdate()
    } catch (e) {
      this.set({ status: 'error', error: humanError(e) })
    }
    return this.getState()
  }

  install(): void {
    if (!this.updater || this.state.status !== 'downloaded') return
    if (this.isBusy()) throw new Error('A task is running. The update will install when it finishes and you restart, or when you quit Vexa.')
    // Silent install, then relaunch.
    setImmediate(() => this.updater!.quitAndInstall(true, true))
  }

  private set(patch: Partial<UpdateState>): void {
    this.state = { ...this.state, ...patch }
    this.emit(this.getState())
  }
}

function describe(info: UpdateInfo): Pick<UpdateState, 'version' | 'notes'> {
  const notes = Array.isArray(info.releaseNotes)
    ? info.releaseNotes.map((n) => n.note ?? '').join('\n\n')
    : (info.releaseNotes ?? undefined)
  return { version: info.version, notes: notes ? stripHtml(notes) : undefined }
}

/** GitHub returns release notes as HTML; the banner shows plain text. */
function stripHtml(s: string): string {
  return s
    .replace(/<\/(p|li|h\d)>/gi, '\n')
    .replace(/<li>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function humanError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  if (/ENOTFOUND|ETIMEDOUT|ECONNRESET|ECONNREFUSED|net::ERR_/i.test(msg)) return 'No connection to GitHub. Check the internet and try again.'
  if (/404|latest\.yml/i.test(msg)) return 'No published release with update information was found.'
  return msg.split('\n')[0].slice(0, 300)
}
