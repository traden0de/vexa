import { create } from 'zustand'
import { attentionKind, type EnvStatus, type Project, type QueueState, type RateLimitInfo, type Settings, type Task, type UpdateState } from '@shared/types'
import { call, on } from './api'
import i18n from './i18n'
import { notifyTask, updateBadge } from './notify'

export type View = 'home' | 'board' | 'git' | 'agents' | 'project' | 'settings'
export type DrawerTab = 'log' | 'plan' | 'changes' | 'reports' | 'release' | 'details'

export interface Toast {
  id: number
  text: string
  error?: boolean
}

interface State {
  ready: boolean
  settings: Settings | null
  env: EnvStatus | null
  projects: Project[]
  projectId: number | null
  tasks: Record<number, Task>
  /** Tasks waiting for the user in every project, by id. */
  attention: Record<number, Task>
  view: View
  selectedTaskId: number | null
  drawerTab: DrawerTab
  queue: QueueState
  rateLimit: RateLimitInfo | null
  branch: string | null
  toasts: Toast[]
  taskDialog: { open: boolean; edit?: Task }
  update: UpdateState | null
  /** Version the user postponed with "Later" in this session. */
  updateDismissed: string | null
  dismissUpdate(): void

  init(): Promise<void>
  setView(v: View): void
  openProject(p: Project): Promise<void>
  refreshProjects(): Promise<void>
  refreshTasks(): Promise<void>
  refreshBranch(): Promise<void>
  checkEnv(): Promise<void>
  selectTask(id: number | null, tab?: DrawerTab): void
  /** Opens the task's project (if needed) and its card. */
  openTask(t: Task): Promise<void>
  setDrawerTab(tab: DrawerTab): void
  updateSettings(patch: Partial<Settings>): Promise<void>
  toast(text: string, error?: boolean): void
  /** Runs an action and shows its error as a toast. Returns undefined on failure. */
  run<T>(fn: () => Promise<T>, success?: string): Promise<T | undefined>
  openTaskDialog(edit?: Task): void
  closeTaskDialog(): void
}

let toastSeq = 0

export const useStore = create<State>((set, get) => ({
  ready: false,
  settings: null,
  env: null,
  projects: [],
  projectId: null,
  tasks: {},
  attention: {},
  view: 'home',
  selectedTaskId: null,
  drawerTab: 'log',
  queue: { running: true },
  rateLimit: null,
  branch: null,
  toasts: [],
  taskDialog: { open: false },
  update: null,
  updateDismissed: null,

  dismissUpdate() {
    set({ updateDismissed: get().update?.version ?? null })
  },

  async init() {
    const [settings, projects, queue, rateLimit, update, waiting] = await Promise.all([
      call('settings:get'),
      call('projects:list'),
      call('queue:state'),
      call('ratelimit:get'),
      call('update:state'),
      call('tasks:attention')
    ])
    applyTheme(settings.theme)
    void i18n.changeLanguage(settings.lang)
    const attention = Object.fromEntries(waiting.map((t) => [t.id, t]))
    set({ settings, projects, queue, rateLimit, update, attention, ready: true })
    updateBadge(waiting.length)
    useStore.subscribe((s, prev) => {
      if (s.attention !== prev.attention) updateBadge(Object.keys(s.attention).length)
    })

    on('task:updated', (t) => {
      const prev = get().attention[t.id]
      const kind = attentionKind(t)
      if (kind || prev)
        set((s) => {
          const attention = { ...s.attention }
          if (kind) attention[t.id] = t
          else delete attention[t.id]
          return { attention }
        })
      // Notify only about news, and only when the user is not looking at the window.
      if (kind && (!prev || attentionKind(prev) !== kind) && get().settings?.notifications && !document.hasFocus()) {
        const project = get().projects.find((p) => p.id === t.projectId)
        notifyTask(t, kind, project?.name, () => void get().openTask(t))
      }
      if (t.projectId !== get().projectId) return
      set((s) => ({ tasks: { ...s.tasks, [t.id]: t } }))
    })
    on('task:removed', ({ id }) =>
      set((s) => {
        const tasks = { ...s.tasks }
        delete tasks[id]
        const attention = { ...s.attention }
        delete attention[id]
        return { tasks, attention, selectedTaskId: s.selectedTaskId === id ? null : s.selectedTaskId }
      })
    )
    on('queue:state', (queue) => {
      set({ queue })
      void get().refreshBranch()
    })
    on('ratelimit', (rateLimit) => set({ rateLimit }))
    on('update:state', (update) => set({ update }))

    const last = projects.find((p) => p.id === settings.lastProjectId)
    if (last) await get().openProject(last)
    void get().checkEnv()
  },

  setView(view) {
    set({ view, selectedTaskId: null })
    if (view === 'board' || view === 'git') void get().refreshBranch()
  },

  async openProject(p) {
    const opened = await call('projects:open', p.path)
    if (!opened) return
    set({ projectId: opened.id, tasks: {}, selectedTaskId: null, view: 'board' })
    await Promise.all([get().refreshTasks(), get().refreshProjects(), get().refreshBranch()])
  },

  async refreshProjects() {
    set({ projects: await call('projects:list') })
  },

  async refreshTasks() {
    const pid = get().projectId
    if (pid == null) return
    const list = await call('tasks:list', pid)
    set({ tasks: Object.fromEntries(list.map((t) => [t.id, t])) })
  },

  async refreshBranch() {
    const pid = get().projectId
    if (pid == null) return set({ branch: null })
    try {
      const s = await call('git:status', pid)
      set({ branch: s.isRepo ? (s.branch ?? null) : null })
    } catch {
      set({ branch: null })
    }
  },

  async checkEnv() {
    set({ env: await call('env:check') })
  },

  selectTask(id, tab) {
    set({ selectedTaskId: id, drawerTab: tab ?? get().drawerTab })
  },

  async openTask(t) {
    if (get().projectId !== t.projectId) {
      let p = get().projects.find((x) => x.id === t.projectId)
      if (!p) {
        await get().refreshProjects()
        p = get().projects.find((x) => x.id === t.projectId)
      }
      if (!p) return
      await get().openProject(p)
    }
    set({ view: 'board' })
    get().selectTask(t.id, t.status === 'approval' ? 'plan' : t.status === 'review' ? 'reports' : 'log')
  },

  setDrawerTab(drawerTab) {
    set({ drawerTab })
  },

  async updateSettings(patch) {
    const settings = await call('settings:set', patch)
    if (patch.theme) applyTheme(settings.theme)
    if (patch.lang) void i18n.changeLanguage(settings.lang)
    set({ settings })
  },

  toast(text, error) {
    const id = ++toastSeq
    set((s) => ({ toasts: [...s.toasts, { id, text, error }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), error ? 6000 : 2600)
  },

  async run(fn, success) {
    try {
      const r = await fn()
      if (success) get().toast(success)
      return r
    } catch (e) {
      get().toast(e instanceof Error ? e.message : String(e), true)
      return undefined
    }
  },

  openTaskDialog(edit) {
    set({ taskDialog: { open: true, edit } })
  },

  closeTaskDialog() {
    set({ taskDialog: { open: false } })
  }
}))

export function applyTheme(theme: Settings['theme']): void {
  const root = document.documentElement
  if (theme === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)
  syncTitleBar()
}

let titleBarColors = ''

/**
 * Paints the system window buttons in the colors of the current theme, dimmed like the rest
 * of the top bar while a drawer or dialog backdrop covers it.
 */
function syncTitleBar(): void {
  const css = getComputedStyle(document.documentElement)
  let bg = parseColor(css.getPropertyValue('--panel'))
  let fg = parseColor(css.getPropertyValue('--muted'))
  for (const el of document.querySelectorAll('.scrim, .modal')) {
    const shade = parseColor(getComputedStyle(el).backgroundColor)
    bg = blend(bg, shade)
    fg = blend(fg, shade)
  }
  const colors = `${toHex(bg)} ${toHex(fg)}`
  if (colors === titleBarColors) return
  titleBarColors = colors
  void call('window:titleBar', toHex(bg), toHex(fg)).catch(() => {})
}

type Rgba = [number, number, number, number]

/** `#rgb`, `#rrggbb` or `rgb()/rgba()` → [r, g, b, a]. */
function parseColor(value: string): Rgba {
  const v = value.trim()
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v)?.[1]
  if (hex) {
    const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)).concat(1) as Rgba
  }
  const n = v.match(/[\d.]+/g)?.map(Number) ?? []
  return [n[0] ?? 0, n[1] ?? 0, n[2] ?? 0, n[3] ?? 1]
}

/** Draws a translucent `top` over an opaque `base`. */
function blend(base: Rgba, top: Rgba): Rgba {
  const a = top[3]
  return [0, 1, 2].map((i) => Math.round(base[i] * (1 - a) + top[i] * a)).concat(1) as Rgba
}

function toHex(c: Rgba): string {
  return '#' + c.slice(0, 3).map((x) => x.toString(16).padStart(2, '0')).join('')
}

// "System" theme follows Windows, so the buttons must follow it too.
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncTitleBar)
// Backdrops come and go with drawers and dialogs, which can be nested anywhere; the IPC call only fires on a real change.
new MutationObserver(syncTitleBar).observe(document.getElementById('root') ?? document.body, { childList: true, subtree: true })

export function isDark(): boolean {
  const attr = document.documentElement.getAttribute('data-theme')
  if (attr) return attr === 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function useProject(): Project | undefined {
  return useStore((s) => s.projects.find((p) => p.id === s.projectId))
}
