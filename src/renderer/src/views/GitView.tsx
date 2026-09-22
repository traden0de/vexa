import { lazy, Suspense, useCallback, useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowDownToLine, ArrowUpFromLine, Check, GitBranch, LoaderCircle, Plus, RefreshCw, Sparkles, Trash2, X } from 'lucide-react'
import type { GitBranch as Branch, GitCommit, GitStatus } from '@shared/types'
import { call } from '../api'
import { useStore } from '../store'
import { AskDialog, Modal } from '../components/ui'

const DiffView = lazy(() => import('../components/DiffView').then((m) => ({ default: m.DiffView })))

export function GitView(): ReactNode {
  const { t } = useTranslation()
  const pid = useStore((s) => s.projectId)!
  const run = useStore((s) => s.run)
  const refreshBranch = useStore((s) => s.refreshBranch)
  const queue = useStore((s) => s.queue)
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [branches, setBranches] = useState<Branch[]>([])
  const [log, setLog] = useState<GitCommit[]>([])
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [diffFile, setDiffFile] = useState<string | null>(null)
  const [newBranch, setNewBranch] = useState(false)
  const [deleting, setDeleting] = useState<{ name: string; force: boolean } | null>(null)
  const tasks = useStore((s) => s.tasks)
  // Branches of tasks still in the pipeline are managed by Veltrix, not deleted by hand.
  const taskBranches = new Set(
    Object.values(tasks)
      .filter((x) => x.branch && x.status !== 'done' && x.status !== 'backlog')
      .map((x) => x.branch!)
  )

  const load = useCallback(async () => {
    const s = await call('git:status', pid)
    setStatus(s)
    setChecked(new Set(s.files.map((f) => f.path)))
    if (s.isRepo) {
      const [b, l] = await Promise.all([call('git:branches', pid), call('git:log', pid)])
      setBranches(b)
      setLog(l)
    }
    void refreshBranch()
  }, [pid, refreshBranch])

  useEffect(() => {
    void load()
  }, [load, queue.activeTaskId])

  const op = async (name: string, fn: () => Promise<unknown>, success?: string): Promise<void> => {
    setBusy(name)
    await run(fn, success)
    setBusy(null)
    await load()
  }

  if (!status) return null
  if (!status.isRepo) {
    return (
      <div className="page">
        <h1>Git</h1>
        <p className="sub">{t('git_not_repo')}</p>
        <button className="btn primary" onClick={() => op('init', () => call('git:init', pid), t('toast_done'))}>
          <GitBranch /> {t('git_init')}
        </button>
      </div>
    )
  }

  const running = queue.activeTaskId != null
  const spin = (name: string, icon: ReactNode): ReactNode => (busy === name ? <LoaderCircle className="spin" /> : icon)

  return (
    <div className="page">
      <h1>Git</h1>
      <p className="sub mono" style={{ fontSize: 12.5 }}>
        {status.branch}
        {status.tracking ? ` ← ${status.tracking}` : ''}
        {status.ahead ? ` · ↑${status.ahead}` : ''}
        {status.behind ? ` · ↓${status.behind}` : ''}
      </p>
      <div className="row" style={{ marginBottom: 18 }}>
        <button className="btn" disabled={!!busy || running} onClick={() => op('pull', () => call('git:pull', pid).then((s) => useStore.getState().toast(t('toast_pulled', { s }))))}>
          {spin('pull', <ArrowDownToLine />)} {t('pull')}
        </button>
        <button className="btn" disabled={!!busy || running} onClick={() => op('push', () => call('git:push', pid).then((b) => useStore.getState().toast(t('toast_pushed', { branch: b }))))}>
          {spin('push', <ArrowUpFromLine />)} {t('push')}
          {status.ahead > 0 && <span className="chip" style={{ padding: '0 6px' }}>{status.ahead}</span>}
        </button>
        <button className="btn" disabled={!!busy} onClick={() => op('fetch', () => call('git:fetch', pid), t('toast_done'))}>
          {spin('fetch', <RefreshCw />)} {t('fetch')}
        </button>
        <button className="btn" disabled={!!busy || running || status.files.length === 0} onClick={() => op('stash', () => call('git:stash', pid), t('toast_done'))}>
          {t('stash')}
        </button>
        <button className="btn" disabled={!!busy || running} onClick={() => op('pop', () => call('git:stashPop', pid), t('toast_done'))}>
          {t('stash_pop')}
        </button>
        <button className="btn ghost icon" aria-label={t('refresh')} onClick={() => void load()}>
          <RefreshCw />
        </button>
      </div>

      <div className="grid2">
        <div className="panel">
          <h3>
            {t('git_changes')} <span className="chip">{status.files.length}</span>
          </h3>
          {status.files.length === 0 ? (
            <p className="faint" style={{ margin: 0 }}>
              {t('git_clean')}
            </p>
          ) : (
            <>
              <div className="list" style={{ maxHeight: 280, overflow: 'auto' }}>
                {status.files.map((f) => {
                  const code = (f.index + f.workingDir).replace(/\s/g, '') || 'M'
                  return (
                    <div className="li" key={f.path}>
                      <input
                        type="checkbox"
                        aria-label={f.path}
                        checked={checked.has(f.path)}
                        onChange={(e) => {
                          const n = new Set(checked)
                          if (e.target.checked) n.add(f.path)
                          else n.delete(f.path)
                          setChecked(n)
                        }}
                      />
                      <span className="mono" style={{ color: code.includes('?') ? 'var(--ok)' : code.includes('D') ? 'var(--bad)' : 'var(--warn)', width: 18 }}>
                        {code.slice(0, 2)}
                      </span>
                      <button className="mono ell" style={{ border: 0, background: 'none', padding: 0, fontSize: 12.5, textAlign: 'left' }} onClick={() => setDiffFile(f.path)}>
                        {f.path}
                      </button>
                    </div>
                  )
                })}
              </div>
              <div className="field" style={{ marginTop: 14 }}>
                <label htmlFor="commit-msg">{t('git_commit')}</label>
                <textarea id="commit-msg" className="inp mono" style={{ minHeight: 70, fontSize: 12.5 }} value={message} onChange={(e) => setMessage(e.target.value)} />
              </div>
              <div className="row">
                <button
                  className="btn primary"
                  disabled={!!busy || running || !message.trim() || checked.size === 0}
                  onClick={() =>
                    op(
                      'commit',
                      async () => {
                        await call('git:commit', pid, message.trim(), [...checked])
                        setMessage('')
                      },
                      t('toast_committed')
                    )
                  }
                >
                  {spin('commit', <Check />)} {t('commit')}
                </button>
                <button
                  className="btn"
                  disabled={!!busy}
                  onClick={async () => {
                    setBusy('gen')
                    const m = await run(() => call('git:generateMessage', pid))
                    if (m) setMessage(m)
                    setBusy(null)
                  }}
                >
                  {spin('gen', <Sparkles />)} {t('git_gen')}
                </button>
              </div>
            </>
          )}
        </div>
        <div className="panel">
          <h3>
            {t('git_branches')}
            <span className="grow" />
            <button className="btn sm" disabled={!!busy || running || !status.branch} onClick={() => setNewBranch(true)}>
              <Plus /> {t('new_branch')}
            </button>
          </h3>
          <div className="list" style={{ maxHeight: 420, overflow: 'auto' }}>
            {branches.map((b) => {
              const owned = taskBranches.has(b.name)
              return (
                <div className="li" key={b.name}>
                  <GitBranch />
                  <span className="mono ell" style={{ fontSize: 12.5, fontWeight: b.current ? 600 : 400 }}>
                    {b.name}
                  </span>
                  {b.current && <span className="refbr">HEAD</span>}
                  <span className="grow" />
                  <span className="sub2">{b.commit.slice(0, 7)}</span>
                  {!b.current && (
                    <>
                      <button className="btn sm" disabled={!!busy || running} onClick={() => op('co', () => call('git:checkout', pid, b.name))}>
                        {t('checkout')}
                      </button>
                      <button
                        className="btn sm ghost icon"
                        disabled={!!busy || owned}
                        title={owned ? t('branch_of_task') : t('delete')}
                        aria-label={`${t('delete')} ${b.name}`}
                        onClick={() => setDeleting({ name: b.name, force: false })}
                      >
                        <Trash2 />
                      </button>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <h3>{t('git_history')}</h3>
        <div className="list gitlog">
          {log.map((c) => {
            const refs = c.refs
              .split(',')
              .map((r) => r.trim())
              .filter(Boolean)
            return (
              <div className="li" key={c.hash}>
                <span className={`graph ${c.isMerge ? 'm' : ''}`}>
                  <i />
                </span>
                <span style={{ color: 'var(--accent-ink)' }}>{c.hash.slice(0, 7)}</span>
                <span className="ell" style={{ fontFamily: 'var(--sans)', fontSize: 13 }}>
                  {c.message}
                </span>
                {refs.map((r) =>
                  r.startsWith('tag: ') ? (
                    <span className="reftag" key={r}>
                      {r.slice(5)}
                    </span>
                  ) : (
                    <span className="refbr" key={r}>
                      {r.replace('HEAD -> ', '')}
                    </span>
                  )
                )}
                <span className="grow" />
                <span className="sub2">{c.author}</span>
                <span className="sub2">{new Date(c.date).toLocaleDateString()}</span>
              </div>
            )
          })}
        </div>
      </div>
      {diffFile && <FileDiffModal pid={pid} file={diffFile} onClose={() => setDiffFile(null)} />}
      {newBranch && (
        <NewBranchDialog
          branches={branches}
          current={status.branch ?? ''}
          onClose={() => setNewBranch(false)}
          onCreate={async (name, from, checkout) => {
            const ok = await run(async () => {
              await call('git:createBranch', pid, name, from, checkout)
              return true
            }, t('toast_branch_created', { name }))
            if (!ok) return false
            await load()
            return true
          }}
        />
      )}
      {deleting && (
        <AskDialog
          key={`${deleting.name}-${deleting.force}`}
          title={t('delete_branch_title', { name: deleting.name })}
          body={deleting.force ? t('delete_branch_force') : t('delete_branch_body')}
          confirm={deleting.force ? t('delete_anyway') : t('delete')}
          danger
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            const { name, force } = deleting
            try {
              await call('git:deleteBranch', pid, name, force)
              useStore.getState().toast(t('toast_branch_deleted', { name }))
              await load()
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e)
              // git refuses -d for unmerged branches: offer a forced delete instead.
              if (!force && /not fully merged/i.test(msg)) {
                setTimeout(() => setDeleting({ name, force: true }), 0)
                return
              }
              useStore.getState().toast(msg, true)
            }
          }}
        />
      )}
    </div>
  )
}

function FileDiffModal({ pid, file, onClose }: { pid: number; file: string; onClose: () => void }): ReactNode {
  const { t } = useTranslation()
  const [c, setC] = useState<{ original: string; modified: string } | null>(null)
  useEffect(() => {
    void call('git:fileDiff', pid, file).then(setC)
  }, [pid, file])
  return (
    <Modal onClose={onClose}>
      <div className="dialog" style={{ width: 'min(1200px, 100%)', height: '85vh', display: 'flex', flexDirection: 'column' }}>
        <header className="row">
          <span className="mono" style={{ fontSize: 13 }}>
            {file}
          </span>
          <span className="grow" />
          <button className="btn ghost icon" onClick={onClose} aria-label={t('close')}>
            <X />
          </button>
        </header>
        <div style={{ flex: 1, minHeight: 0 }}>
          {c && (
            <Suspense fallback={null}>
              <DiffView original={c.original} modified={c.modified} path={file} />
            </Suspense>
          )}
        </div>
      </div>
    </Modal>
  )
}

function NewBranchDialog({
  branches,
  current,
  onClose,
  onCreate
}: {
  branches: Branch[]
  current: string
  onClose: () => void
  onCreate: (name: string, from: string, checkout: boolean) => Promise<boolean>
}): ReactNode {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [from, setFrom] = useState(current)
  const [checkout, setCheckout] = useState(true)
  const [busy, setBusy] = useState(false)
  return (
    <Modal onClose={onClose}>
      <form
        className="dialog"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!name.trim()) return
          setBusy(true)
          const ok = await onCreate(name.trim(), from, checkout)
          setBusy(false)
          if (ok) onClose()
        }}
      >
        <header>{t('nb_title')}</header>
        <div className="body">
          <div className="field">
            <label htmlFor="nb-name">{t('nb_name')}</label>
            <input id="nb-name" className="inp mono" autoFocus placeholder="feature/my-branch" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="nb-from">{t('nb_from')}</label>
            <select id="nb-from" className="inp mono" value={from} onChange={(e) => setFrom(e.target.value)}>
              {branches.map((b) => (
                <option key={b.name} value={b.name}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <label className="checkline" htmlFor="nb-checkout">
            <input id="nb-checkout" type="checkbox" checked={checkout} onChange={(e) => setCheckout(e.target.checked)} />
            <span>{t('nb_checkout')}</span>
          </label>
        </div>
        <footer>
          <button type="button" className="btn ghost" onClick={onClose}>
            {t('cancel')}
          </button>
          <button type="submit" className="btn primary" disabled={busy || !name.trim()}>
            <Plus /> {t('create')}
          </button>
        </footer>
      </form>
    </Modal>
  )
}
