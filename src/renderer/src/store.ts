import { create } from 'zustand'
import type { EnvStatus, Project, QueueState, RateLimitInfo, Settings, Task } from '@shared/types'
import { call, on } from './api'
import i18n from './i18n'

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
  view: View
  selectedTaskId: number | null
  drawerTab: DrawerTab
  queue: QueueState
  rateLimit: RateLimitInfo | null
  branch: string | null
  toasts: Toast[]
  taskDialog: { open: boolean; edit?: Task }

  init(): Promise<void>
  setView(v: View): void
  openProject(p: Project): Promise<void>
  refreshProjects(): Promise<void>
  refreshTasks(): Promise<void>
  refreshBranch(): Promise<void>
  checkEnv(): Promise<void>
  selectTask(id: number | null, tab?: DrawerTab): void
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
  view: 'home',
  selectedTaskId: null,
  drawerTab: 'log',
  queue: { running: true },
  rateLimit: null,
  branch: null,
  toasts: [],
  taskDialog: { open: false },

  async init() {
    const [settings, projects, queue, rateLimit] = await Promise.all([
      call('settings:get'),
      call('projects:list'),
      call('queue:state'),
      call('ratelimit:get')
    ])
    applyTheme(settings.theme)
    void i18n.changeLanguage(settings.lang)
    set({ settings, projects, queue, rateLimit, ready: true })

    on('task:updated', (t) => {
      if (t.projectId !== get().projectId) return
      set((s) => ({ tasks: { ...s.tasks, [t.id]: t } }))
    })
    on('task:removed', ({ id }) =>
      set((s) => {
        const tasks = { ...s.tasks }
        delete tasks[id]
        return { tasks, selectedTaskId: s.selectedTaskId === id ? null : s.selectedTaskId }
      })
    )
    on('queue:state', (queue) => {
      set({ queue })
      void get().refreshBranch()
    })
    on('ratelimit', (rateLimit) => set({ rateLimit }))

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
}

export function isDark(): boolean {
  const attr = document.documentElement.getAttribute('data-theme')
  if (attr) return attr === 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function useProject(): Project | undefined {
  return useStore((s) => s.projects.find((p) => p.id === s.projectId))
}
