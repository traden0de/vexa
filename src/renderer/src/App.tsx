import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Bot,
  Check,
  CircleAlert,
  Clock,
  FileText,
  Folder,
  GitBranch,
  GitFork,
  House,
  KanbanSquare,
  Moon,
  Pause,
  Play,
  Plus,
  Settings as Gear,
  Sun,
  Tag
} from 'lucide-react'
import appIcon from '../../../build/icon.png'
import { call } from './api'
import { isDark, useProject, useStore, type View } from './store'
import { Board } from './components/Board'
import { TaskDrawer } from './components/TaskDrawer'
import { TaskDialog } from './components/TaskDialog'
import { HomeView } from './views/HomeView'
import { GitView } from './views/GitView'
import { AgentsView } from './views/AgentsView'
import { ProjectView } from './views/ProjectView'
import { SettingsView } from './views/SettingsView'

export function App(): ReactNode {
  const ready = useStore((s) => s.ready)
  const init = useStore((s) => s.init)
  const view = useStore((s) => s.view)
  const projectId = useStore((s) => s.projectId)
  const taskDialog = useStore((s) => s.taskDialog)

  useEffect(() => {
    void init()
  }, [init])

  if (!ready) return null
  const v: View = projectId == null && view !== 'settings' ? 'home' : view

  return (
    <div className="app">
      <Rail view={v} />
      <div className="main">
        <Topbar />
        <section className="view">
          {v === 'home' && <HomeView />}
          {v === 'board' && <Board />}
          {v === 'git' && <GitView />}
          {v === 'agents' && <AgentsView />}
          {v === 'project' && <ProjectView />}
          {v === 'settings' && <SettingsView />}
        </section>
        <StatusBar />
      </div>
      <TaskDrawer />
      {taskDialog.open && <TaskDialog />}
      <Toasts />
    </div>
  )
}

function Rail({ view }: { view: View }): ReactNode {
  const { t } = useTranslation()
  const setView = useStore((s) => s.setView)
  const hasProject = useStore((s) => s.projectId != null)
  const items: [View, ReactNode][] = [
    ['home', <House key="h" />],
    ['board', <KanbanSquare key="b" />],
    ['git', <GitFork key="g" />],
    ['agents', <Bot key="a" />],
    ['project', <FileText key="p" />]
  ]
  return (
    <nav className="rail">
      <img className="logo" src={appIcon} alt="Veltrix" />
      {items.map(([v, icon]) => (
        <button
          key={v}
          className={`rail-btn ${view === v ? 'on' : ''}`}
          disabled={v !== 'home' && !hasProject}
          onClick={() => setView(v)}
          aria-label={t(`nav_${v}`)}
        >
          {icon}
          <span className="tip">{t(`nav_${v}`)}</span>
        </button>
      ))}
      <div className="spacer" />
      <button className={`rail-btn ${view === 'settings' ? 'on' : ''}`} onClick={() => setView('settings')} aria-label={t('nav_settings')}>
        <Gear />
        <span className="tip">{t('nav_settings')}</span>
      </button>
    </nav>
  )
}

function Topbar(): ReactNode {
  const { t } = useTranslation()
  const project = useProject()
  const branch = useStore((s) => s.branch)
  const queue = useStore((s) => s.queue)
  const settings = useStore((s) => s.settings)!
  const setView = useStore((s) => s.setView)
  const openTaskDialog = useStore((s) => s.openTaskDialog)
  const updateSettings = useStore((s) => s.updateSettings)
  const run = useStore((s) => s.run)
  const [version, setVersion] = useState<string | null>(null)
  const tasks = useStore((s) => s.tasks)

  useEffect(() => {
    if (!project) return setVersion(null)
    call('project:versions', project.id).then(
      (v) => setVersion(v.current),
      () => setVersion(null)
    )
  }, [project, tasks])

  const limited = queue.pauseReason === 'limit' && queue.pausedUntil
  return (
    <header className="topbar">
      {project ? (
        <button className="proj" onClick={() => setView('home')} title={project.path}>
          <Folder /> {project.name} <small>{project.path}</small>
        </button>
      ) : (
        <span className="proj">Veltrix</span>
      )}
      {branch && (
        <span className="chip">
          <GitBranch /> {branch}
        </span>
      )}
      {version && version !== '0.0.0' && (
        <span className="chip">
          <Tag /> v{version}
        </span>
      )}
      <div className="grow" />
      <div className="queue">
        <span className={`dot ${limited ? 'warn' : queue.running ? 'live' : ''}`} />
        {limited
          ? t('queue_limit', { time: new Date(queue.pausedUntil!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })
          : queue.running
            ? t('queue_running')
            : t('queue_paused')}
        <button className="btn sm" onClick={() => run(() => call(queue.running && !limited ? 'queue:pause' : 'queue:start'))}>
          {queue.running && !limited ? <Pause /> : <Play />}
          {queue.running && !limited ? t('pause') : t('start')}
        </button>
      </div>
      {project && (
        <button className="btn primary" onClick={() => openTaskDialog()}>
          <Plus /> {t('new_task')}
        </button>
      )}
      <div className="seg" role="group" aria-label="Language">
        {(['ru', 'en'] as const).map((l) => (
          <button key={l} className={settings.lang === l ? 'on' : ''} onClick={() => updateSettings({ lang: l })}>
            {l.toUpperCase()}
          </button>
        ))}
      </div>
      <button className="btn ghost icon" aria-label={t('theme')} onClick={() => updateSettings({ theme: isDark() ? 'light' : 'dark' })}>
        {isDark() ? <Sun /> : <Moon />}
      </button>
    </header>
  )
}

function StatusBar(): ReactNode {
  const { t } = useTranslation()
  const queue = useStore((s) => s.queue)
  const tasks = useStore((s) => s.tasks)
  const rl = useStore((s) => s.rateLimit)
  const env = useStore((s) => s.env)
  const active = queue.activeTaskId != null ? tasks[queue.activeTaskId] : undefined
  const queued = Object.values(tasks).filter((x) => x.status === 'queue').length
  const five = rl?.fiveHour != null ? Math.round(rl.fiveHour * 100) : null
  const seven = rl?.sevenDay != null ? Math.round(rl.sevenDay * 100) : null
  return (
    <footer className="statusbar">
      <span>
        <span className={`dot ${active ? 'live' : ''}`} />
        {active
          ? `${t('running')}: #${active.seq} · ${active.activeStage ? t(`s_${active.activeStage}`) : ''}${active.iteration ? ` · ${t('iter')} ${active.iteration}` : ''}`
          : queue.activeTaskId != null
            ? t('running')
            : t('idle')}
      </span>
      <span>{t('queued_n', { n: queued })}</span>
      <span className="grow" />
      {(five != null || seven != null) && (
        <span title={rl?.resetsAt ? new Date(rl.resetsAt * 1000).toLocaleString() : undefined}>
          <Clock /> {t('limit')}
          {five != null && (
            <>
              <span className="meter">
                <i style={{ width: `${five}%` }} />
              </span>
              {t('limit_5h', { p: five })}
            </>
          )}
          {seven != null && <> · {t('limit_7d', { p: seven })}</>}
        </span>
      )}
      {env?.claude.version && <span className="mono">claude {env.claude.version}</span>}
    </footer>
  )
}

function Toasts(): ReactNode {
  const toasts = useStore((s) => s.toasts)
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((x) => (
        <div key={x.id} className={`toast ${x.error ? 'error' : ''}`}>
          {x.error ? <CircleAlert /> : <Check />}
          {x.text}
        </div>
      ))}
    </div>
  )
}
