import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Download, FolderOpen, RefreshCw, X } from 'lucide-react'
import { call } from '../api'
import { useStore } from '../store'
import { Modal } from '../components/ui'

export function HomeView(): ReactNode {
  const { t } = useTranslation()
  const projects = useStore((s) => s.projects)
  const env = useStore((s) => s.env)
  const openProject = useStore((s) => s.openProject)
  const refreshProjects = useStore((s) => s.refreshProjects)
  const checkEnv = useStore((s) => s.checkEnv)
  const run = useStore((s) => s.run)
  const [cloning, setCloning] = useState(false)
  const attention = useStore((s) => s.attention)
  const waitingBy: Record<number, number> = {}
  for (const x of Object.values(attention)) waitingBy[x.projectId] = (waitingBy[x.projectId] ?? 0) + 1

  const openFolder = async (): Promise<void> => {
    const p = await run(() => call('projects:open'))
    if (p) await openProject(p)
  }

  const checks: [string, boolean, string | undefined][] = env
    ? [
        [t('env_claude'), env.claude.found, env.claude.found ? `${env.claude.version ?? ''} · ${env.claude.path}` : t('env_missing')],
        [t('env_login'), env.auth.loggedIn, env.auth.loggedIn ? [env.auth.method, env.auth.detail].filter(Boolean).join(' · ') : t('env_logged_out')],
        [t('env_git'), env.git.found, env.git.version ?? t('env_missing')],
        [t('env_node'), env.node.found, env.node.version ?? t('env_missing')]
      ]
    : []

  return (
    <div className="page">
      <div className="hero-home">
        <span className="wm">Vexa</span>
        <p>{t('home_sub')}</p>
      </div>
      <div className="row" style={{ marginBottom: 24 }}>
        <button className="btn primary" onClick={openFolder} data-tour="open-folder">
          <FolderOpen /> {t('open_folder')}
        </button>
        <button className="btn" onClick={() => setCloning(true)}>
          <Download /> {t('clone')}
        </button>
      </div>
      <div className="grid2" style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(260px, 1fr)' }}>
        <div>
          <div className="label" style={{ marginBottom: 10 }}>
            {t('recent')}
          </div>
          {projects.length === 0 ? (
            <p className="faint">{t('no_projects')}</p>
          ) : (
            <div className="recent">
              {projects.map((p) => (
                <div
                  key={p.id}
                  className="pcard"
                  role="button"
                  tabIndex={0}
                  style={{ cursor: 'pointer' }}
                  onClick={() => run(() => openProject(p))}
                  onKeyDown={(e) => e.key === 'Enter' && run(() => openProject(p))}
                >
                  <b>
                    {p.name}
                    {!!waitingBy[p.id] && <span className="pbadge">{t('attention_n', { n: waitingBy[p.id] })}</span>}
                  </b>
                  <span className="path">{p.path}</span>
                  <span className="faint" style={{ fontSize: 12 }}>
                    {new Date(p.lastOpened).toLocaleString()}
                  </span>
                  <button
                    className="btn ghost icon rm"
                    aria-label={t('remove_recent')}
                    title={t('remove_recent')}
                    onClick={(e) => {
                      e.stopPropagation()
                      void run(async () => {
                        await call('projects:remove', p.id)
                        await refreshProjects()
                      })
                    }}
                  >
                    <X />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="panel" data-tour="env">
          <h3>
            {t('env')}
            <span className="grow" />
            <button className="btn ghost icon" aria-label={t('refresh')} onClick={() => void checkEnv()}>
              <RefreshCw />
            </button>
          </h3>
          {checks.map(([name, ok, detail]) => (
            <div className="check" key={name}>
              <span className={`ic ${ok ? '' : 'bad'}`}>{ok ? <Check /> : <X />}</span>
              <div style={{ minWidth: 0 }}>
                {name}
                <div className="mono faint" style={{ fontSize: 11.5, overflowWrap: 'anywhere' }}>
                  {detail}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      {cloning && <CloneDialog onClose={() => setCloning(false)} />}
    </div>
  )
}

function CloneDialog({ onClose }: { onClose: () => void }): ReactNode {
  const { t } = useTranslation()
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const run = useStore((s) => s.run)
  const openProject = useStore((s) => s.openProject)
  return (
    <Modal onClose={onClose}>
      <form
        className="dialog"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          const p = await run(() => call('projects:clone', url.trim()))
          setBusy(false)
          if (p) {
            onClose()
            await openProject(p)
          }
        }}
      >
        <header>{t('clone_title')}</header>
        <div className="body">
          <div className="field">
            <label htmlFor="clone-url">URL</label>
            <input id="clone-url" className="inp mono" autoFocus placeholder={t('clone_ph')} value={url} onChange={(e) => setUrl(e.target.value)} />
          </div>
          <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>
            {t('clone_hint')}
          </p>
        </div>
        <footer>
          <button type="button" className="btn ghost" onClick={onClose}>
            {t('cancel')}
          </button>
          <button type="submit" className="btn primary" disabled={busy || !url.trim()}>
            <Download /> {t('clone')}
          </button>
        </footer>
      </form>
    </Modal>
  )
}
