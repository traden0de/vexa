import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Check,
  ChevronRight,
  GitBranch,
  GitMerge,
  Info,
  MessageCircleQuestion,
  Send,
  LoaderCircle,
  Pencil,
  Play,
  RotateCcw,
  ShieldCheck,
  Square,
  Trash2,
  Undo2,
  X
} from 'lucide-react'
import { STAGES, STAGE_AGENT, type Bump, type DiffFile, type LogEvent, type PlanQuestion, type Task } from '@shared/types'
import { call, on } from '../api'
import { useStore, type DrawerTab } from '../store'
import { AGENT_COLORS, AskDialog, Markdown, TypeTag, formatCost, formatDuration } from './ui'

const DiffView = lazy(() => import('./DiffView').then((m) => ({ default: m.DiffView })))

type Ask = null | 'replan' | 'rework' | 'reject' | 'delete'

export function TaskDrawer(): ReactNode {
  const { t } = useTranslation()
  const task = useStore((s) => (s.selectedTaskId != null ? s.tasks[s.selectedTaskId] : undefined))
  const tab = useStore((s) => s.drawerTab)
  const setTab = useStore((s) => s.setDrawerTab)
  const selectTask = useStore((s) => s.selectTask)
  const setView = useStore((s) => s.setView)
  const openTaskDialog = useStore((s) => s.openTaskDialog)
  const queue = useStore((s) => s.queue)
  const run = useStore((s) => s.run)
  const [ask, setAsk] = useState<Ask>(null)
  const [bump, setBump] = useState<Bump>('patch')
  const [planDraft, setPlanDraft] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Answers>({})

  useEffect(() => {
    setBump(task?.bump ?? 'patch')
    setPlanDraft(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id, task?.bump])

  useEffect(() => setAnswers({}), [task?.id, task?.questionRounds])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !ask && !document.querySelector('.modal')) selectTask(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ask, selectTask])

  if (!task) return null
  const close = (): void => selectTask(null)
  const isActive = queue.activeTaskId === task.id
  const r = task.reports

  const tabs: { id: DrawerTab; label: string; count?: number }[] = [
    { id: 'details', label: t('tab_details') },
    { id: 'log', label: t('tab_log') },
    { id: 'plan', label: t('tab_plan') }
  ]
  if (task.branch || task.mergeCommit) tabs.push({ id: 'changes', label: t('tab_changes') })
  if (r.tests || r.review || r.security) tabs.push({ id: 'reports', label: t('tab_reports') })
  if (r.release) tabs.push({ id: 'release', label: t('tab_release') })
  const activeTab = tabs.some((x) => x.id === tab) ? tab : 'log'

  const act = async <T,>(fn: () => Promise<T>, msg?: string): Promise<void> => {
    await run(fn, msg)
  }

  let footer: ReactNode = null
  if (isActive || task.status === 'planning' || task.status === 'progress') {
    footer = (
      <>
        <span className="chip">
          <span className="dot live" /> {task.activeStage ? t(`s_${task.activeStage}`) : t('running')}
        </span>
        <span className="grow" />
        <button className="btn danger" onClick={() => act(() => call('tasks:stop', task.id))}>
          <Square /> {t('stop')}
        </button>
      </>
    )
  } else if (task.status === 'backlog') {
    footer = (
      <>
        <button className="btn primary" onClick={() => act(() => call('tasks:move', task.id, 'queue'))}>
          <Play /> {t('send')}
        </button>
        <button className="btn" onClick={() => openTaskDialog(task)}>
          <Pencil /> {t('edit')}
        </button>
        <span className="grow" />
        <button className="btn danger" onClick={() => setAsk('delete')}>
          <Trash2 /> {t('delete')}
        </button>
      </>
    )
  } else if (task.status === 'queue') {
    footer = (
      <>
        <span className="chip">{t('waiting_queue')}</span>
        <span className="grow" />
        <button className="btn" onClick={() => act(() => call('tasks:move', task.id, 'backlog'))}>
          <Undo2 /> {t('c_backlog')}
        </button>
      </>
    )
  } else if (task.status === 'approval' && task.questions?.length) {
    footer = (
      <>
        <button
          className="btn primary"
          onClick={() =>
            act(async () => {
              await call('tasks:answer', task.id, answerStrings(task.questions!, answers))
              close()
            }, t('toast_answered'))
          }
        >
          <Send /> {t('answer')}
        </button>
        <span className="grow" />
        <button className="btn ghost" onClick={() => act(() => call('tasks:move', task.id, 'backlog'))}>
          <Undo2 /> {t('c_backlog')}
        </button>
      </>
    )
  } else if (task.status === 'approval') {
    footer = (
      <>
        <button
          className="btn primary"
          onClick={() =>
            act(async () => {
              await call('tasks:approvePlan', task.id, planDraft ?? undefined)
              close()
            }, t('toast_approved'))
          }
        >
          <Check /> {t('approve')}
        </button>
        <button
          className="btn"
          onClick={() => {
            setTab('plan')
            setPlanDraft(planDraft ?? task.plan ?? '')
          }}
        >
          <Pencil /> {t('edit_plan')}
        </button>
        <button className="btn" onClick={() => setAsk('replan')}>
          <RotateCcw /> {t('replan')}
        </button>
        <span className="grow" />
        <button className="btn ghost" onClick={() => act(() => call('tasks:move', task.id, 'backlog'))}>
          <Undo2 /> {t('c_backlog')}
        </button>
      </>
    )
  } else if (task.status === 'review') {
    footer = (
      <>
        <button
          className="btn ok"
          onClick={() =>
            act(async () => {
              const done = await call('tasks:accept', task.id, bump)
              close()
              return done
            }, t('toast_merged', { tag: `v${nextOf(task, bump)}` }))
          }
        >
          <GitMerge /> {t('accept')} · v{nextOf(task, bump)}
        </button>
        <button className="btn" onClick={() => setAsk('rework')}>
          <RotateCcw /> {t('rework')}
        </button>
        <span className="grow" />
        <button className="btn danger" onClick={() => setAsk('reject')}>
          <Trash2 /> {t('reject')}
        </button>
      </>
    )
  } else if (task.status === 'failed') {
    footer = (
      <>
        <button className="btn primary" onClick={() => act(() => call('tasks:retry', task.id))}>
          <RotateCcw /> {t('retry')}
        </button>
        {task.errorKind === 'dirty' && (
          <button
            className="btn"
            onClick={() => {
              close()
              setView('git')
            }}
          >
            <GitBranch /> {t('go_git')}
          </button>
        )}
        {task.branch && task.planApproved && (
          <button className="btn" onClick={() => setAsk('rework')}>
            <Pencil /> {t('rework')}
          </button>
        )}
        <span className="grow" />
        {task.branch ? (
          <button className="btn danger" onClick={() => setAsk('reject')}>
            <Trash2 /> {t('reject')}
          </button>
        ) : (
          <button className="btn" onClick={() => act(() => call('tasks:move', task.id, 'backlog'))}>
            <Undo2 /> {t('c_backlog')}
          </button>
        )}
      </>
    )
  } else if (task.status === 'done') {
    footer = (
      <>
        <span className="grow" />
        <button className="btn danger" onClick={() => setAsk('delete')}>
          <Trash2 /> {t('delete')}
        </button>
      </>
    )
  }

  return (
    <>
      <div className="scrim" onClick={close} />
      <aside className="drawer" role="dialog" aria-label={task.title}>
        <div className="dr-h">
          <div className="row">
            <span className="mono faint" style={{ fontSize: 12 }}>
              #{task.seq}
            </span>
            <TypeTag type={task.type} />
            {task.branch && (
              <span className="chip">
                <GitBranch /> {task.branch}
                {task.baseBranch && ` ${t('branch_into')} ${task.baseBranch}`}
              </span>
            )}
            {task.iteration > 0 && (
              <span className="chip">
                {t('iter')} {task.iteration}
              </span>
            )}
            {(task.costUsd > 0 || task.durationMs > 0) && (
              <span className="chip tnum">{t('cost_time', { cost: formatCost(task.costUsd), time: formatDuration(task.durationMs) })}</span>
            )}
            <span className="grow" />
            <button className="btn ghost icon" onClick={close} aria-label={t('close')}>
              <X />
            </button>
          </div>
          <h2>{task.title}</h2>
          <div className="stepper">
            {STAGES.map((s) => (
              <div key={s} className={`step ${task.stages[s]}`}>
                <div className="bar" />
                <b>
                  <span className="ag" style={{ background: AGENT_COLORS[STAGE_AGENT[s]][0] }} />
                  {t(`s_${s}`)}
                </b>
              </div>
            ))}
          </div>
          {task.error && <div className="error-box">{task.error}</div>}
        </div>
        <div className="tabs" role="tablist">
          {tabs.map((x) => (
            <button key={x.id} role="tab" aria-selected={activeTab === x.id} className={activeTab === x.id ? 'on' : ''} onClick={() => setTab(x.id)}>
              {x.label}
            </button>
          ))}
        </div>
        {activeTab === 'changes' ? (
          <div className="dr-b flush">
            <ChangesTab task={task} />
          </div>
        ) : activeTab === 'log' ? (
          <LogTab task={task} live={isActive} />
        ) : (
          <div className="dr-b">
            {activeTab === 'details' && <DetailsTab task={task} />}
            {activeTab === 'plan' && (
              <PlanTab task={task} draft={planDraft} setDraft={setPlanDraft} answers={answers} setAnswers={setAnswers} />
            )}
            {activeTab === 'reports' && <ReportsTab task={task} />}
            {activeTab === 'release' && <ReleaseTab task={task} bump={bump} setBump={setBump} />}
          </div>
        )}
        {footer && <div className="dr-f">{footer}</div>}
      </aside>

      {ask === 'replan' && (
        <AskDialog
          title={t('replan_title')}
          placeholder={t('replan_ph')}
          confirm={t('replan')}
          onClose={() => setAsk(null)}
          onConfirm={(c) => act(() => call('tasks:replan', task.id, c), t('toast_replan'))}
        />
      )}
      {ask === 'rework' && (
        <AskDialog
          title={t('rework_title')}
          placeholder={t('rework_ph')}
          confirm={t('rework')}
          onClose={() => setAsk(null)}
          onConfirm={(c) => act(() => call('tasks:rework', task.id, c), t('toast_rework'))}
        />
      )}
      {ask === 'reject' && (
        <AskDialog
          title={t('reject_title')}
          body={t('reject_body', { branch: task.branch ?? '' })}
          confirm={t('reject')}
          danger
          onClose={() => setAsk(null)}
          onConfirm={() => act(() => call('tasks:reject', task.id), t('toast_rejected'))}
        />
      )}
      {ask === 'delete' && (
        <AskDialog
          title={t('delete_title')}
          body={t('delete_body')}
          confirm={t('delete')}
          danger
          onClose={() => setAsk(null)}
          onConfirm={() => act(() => call('tasks:remove', task.id))}
        />
      )}
    </>
  )
}

function nextOf(task: Task, bump: Bump): string {
  const [maj, min, pat] = (task.currentVersion ?? '0.0.0').split('.').map((x) => parseInt(x, 10) || 0)
  if (bump === 'major') return `${maj + 1}.0.0`
  if (bump === 'minor') return `${maj}.${min + 1}.0`
  return `${maj}.${min}.${pat + 1}`
}

// ---------------------------------------------------------------- tabs

function DetailsTab({ task }: { task: Task }): ReactNode {
  const { t } = useTranslation()
  return task.description.trim() ? <Markdown text={task.description} /> : <p className="faint">{t('nt_dph')}</p>
}

function LogTab({ task, live }: { task: Task; live: boolean }): ReactNode {
  const { t } = useTranslation()
  const [events, setEvents] = useState<LogEvent[]>([])
  const box = useRef<HTMLDivElement>(null)
  const stick = useRef(true)

  useEffect(() => {
    let alive = true
    const pending: LogEvent[] = []
    let loaded = false
    const off = on('task:event', (e) => {
      if (e.taskId !== task.id) return
      if (!loaded) pending.push(e)
      else setEvents((prev) => [...prev, e])
    })
    call('tasks:events', task.id).then((list) => {
      if (!alive) return
      loaded = true
      const seen = new Set(list.map((e) => e.id))
      setEvents([...list, ...pending.filter((e) => !seen.has(e.id))])
    })
    return () => {
      alive = false
      off()
    }
  }, [task.id])

  useEffect(() => {
    if (stick.current && box.current) box.current.scrollTop = box.current.scrollHeight
  }, [events])

  const results = useMemo(() => {
    const m = new Map<string, LogEvent>()
    for (const e of events) if (e.kind === 'tool_result' && e.toolUseId) m.set(e.toolUseId, e)
    return m
  }, [events])

  return (
    <div
      className="dr-b"
      ref={box}
      onScroll={(e) => {
        const el = e.currentTarget
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
      }}
    >
      <div className="log">
        {events.length === 0 && !live && <p className="faint">{t('waiting_queue')}</p>}
        {events.map((e) => (
          <LogRow key={e.id} e={e} result={e.toolUseId ? results.get(e.toolUseId) : undefined} />
        ))}
        {live && (
          <div className="ev">
            <span className="ts" />
            <div>
              <span className="caret" />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function LogRow({ e, result }: { e: LogEvent; result?: LogEvent }): ReactNode {
  const { t } = useTranslation()
  if (e.kind === 'tool_result') return null
  const ts = new Date(e.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  if (e.kind === 'sys' || e.kind === 'error' || e.kind === 'result') {
    return (
      <div className="ev">
        <span className="ts">{ts}</span>
        <div className={`sysline ${e.kind === 'error' || e.isError ? 'err' : ''}`}>{e.text}</div>
      </div>
    )
  }
  const color = e.agent ? AGENT_COLORS[e.agent][0] : 'var(--muted)'
  const head = e.agent && (
    <div className="who" style={{ color }}>
      <span className="dot" style={{ background: color }} />
      {t(`a_${e.agent}`)}
    </div>
  )
  if (e.kind === 'text') {
    return (
      <div className="ev">
        <span className="ts">{ts}</span>
        <div>
          {head}
          <div className="txt">{e.text}</div>
        </div>
      </div>
    )
  }
  return (
    <div className="ev">
      <span className="ts">{ts}</span>
      <div style={{ minWidth: 0 }}>
        {head}
        <details className="tool">
          <summary>
            <ChevronRight />
            <span className="tn">{e.tool}</span>
            <span className="arg">{e.input}</span>
            <span className="res" style={{ color: result ? (result.isError ? 'var(--bad)' : 'var(--ok)') : 'var(--faint)' }}>
              {result ? (result.isError ? '✗' : '✓') : <LoaderCircle className="spin" style={{ width: 12, height: 12 }} />}
            </span>
          </summary>
          {result?.output && <pre>{result.output}</pre>}
        </details>
      </div>
    </div>
  )
}

function PlanTab({
  task,
  draft,
  setDraft,
  answers,
  setAnswers
}: {
  task: Task
  draft: string | null
  setDraft: (s: string | null) => void
  answers: Answers
  setAnswers: (a: Answers) => void
}): ReactNode {
  const { t } = useTranslation()
  if (task.questions?.length)
    return (
      <>
        <Discussion task={task} />
        <QuestionsForm questions={task.questions} answers={answers} setAnswers={setAnswers} />
      </>
    )
  if (!task.plan) return <p className="faint">{t('plan_none')}</p>
  return (
    <>
      <Discussion task={task} />
      {task.status === 'approval' && (
        <div className="callout">
          <Info />
          <div>{t('plan_wait')}</div>
        </div>
      )}
      {draft !== null ? (
        <textarea id="plan-edit" className="inp code" style={{ minHeight: 420 }} value={draft} onChange={(e) => setDraft(e.target.value)} />
      ) : (
        <Markdown text={task.plan} />
      )}
    </>
  )
}

function ChangesTab({ task }: { task: Task }): ReactNode {
  const { t } = useTranslation()
  const [files, setFiles] = useState<DiffFile[] | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [content, setContent] = useState<{ original: string; modified: string } | null>(null)

  useEffect(() => {
    call('tasks:diffFiles', task.id).then(
      (f) => {
        setFiles(f)
        setSel((cur) => cur ?? f[0]?.path ?? null)
      },
      () => setFiles([])
    )
  }, [task.id, task.updatedAt])

  useEffect(() => {
    if (!sel) return setContent(null)
    let alive = true
    call('tasks:fileVersions', task.id, sel).then((c) => alive && setContent(c))
    return () => {
      alive = false
    }
  }, [task.id, sel, task.updatedAt])

  if (files && files.length === 0) return <p className="faint" style={{ padding: 20 }}>{t('no_changes')}</p>
  return (
    <div className="changes">
      <div className="files">
        {files?.map((f) => (
          <button key={f.path} className={`fl ${sel === f.path ? 'on' : ''}`} onClick={() => setSel(f.path)} title={f.path}>
            <span className="st" style={{ color: f.status === 'A' ? 'var(--ok)' : f.status === 'D' ? 'var(--bad)' : 'var(--warn)' }}>
              {f.status}
            </span>
            <span className="nm">{f.path}</span>
            <span className="add">+{f.additions}</span>
            <span className="del">−{f.deletions}</span>
          </button>
        ))}
      </div>
      <div className="diffhost">
        {sel && content ? (
          <Suspense fallback={null}>
            <DiffView original={content.original} modified={content.modified} path={sel} />
          </Suspense>
        ) : (
          <p className="faint" style={{ padding: 20 }}>
            {t('select_file')}
          </p>
        )}
      </div>
    </div>
  )
}

function ReportsTab({ task }: { task: Task }): ReactNode {
  const { t } = useTranslation()
  const { tests, review, security } = task.reports
  const issues = [
    ...(review?.issues ?? []).map((i) => ({ ...i, by: 'reviewer' as const })),
    ...(security?.issues ?? []).map((i) => ({ ...i, by: 'security' as const }))
  ]
  const secHigh = security?.issues.filter((i) => i.severity === 'high' || i.severity === 'critical').length ?? 0
  if (!tests && !review && !security) return <p className="faint">{t('no_reports')}</p>
  return (
    <>
      <div className="reps">
        {tests && (
          <div className="rep">
            <span className="label">{t('tests')}</span>
            <span className="big tnum">
              {tests.total != null ? `${tests.total - (tests.failed ?? 0)}/${tests.total}` : tests.passed ? '✓' : '✗'}
            </span>
            <span className="v" style={{ color: tests.passed ? 'var(--ok)' : 'var(--bad)' }}>
              {tests.passed ? <Check /> : <X />} {tests.passed ? t('passed') : t('failed')}
              {tests.coverage != null && ` · ${t('coverage')} ${tests.coverage}%`}
            </span>
            <Summary text={tests.summary} />
            {tests.testCommand && <code className="mono faint" style={{ fontSize: 11.5 }}>{tests.testCommand}</code>}
          </div>
        )}
        {review && (
          <div className="rep">
            <span className="label">{t('reviewer')}</span>
            <span className="big">{review.verdict === 'approve' ? t('approved') : t('changes_requested')}</span>
            <span className="v" style={{ color: review.verdict === 'approve' ? 'var(--ok)' : 'var(--warn)' }}>
              {t('issues_n', { n: review.issues.length })}
            </span>
            <Summary text={review.summary} />
          </div>
        )}
        {security && (
          <div className="rep">
            <span className="label">{t('security')}</span>
            <span className="big">{secHigh} high</span>
            <span className="v" style={{ color: secHigh ? 'var(--bad)' : 'var(--ok)' }}>
              <ShieldCheck /> {secHigh ? t('issues_n', { n: security.issues.length }) : t('no_high')}
            </span>
            <Summary text={security.summary} />
          </div>
        )}
        <div className="rep">
          <span className="label">
            {t('cost')} · {t('duration')}
          </span>
          <span className="big tnum">{formatCost(task.costUsd)}</span>
          <span className="v muted">{formatDuration(task.durationMs)}</span>
        </div>
      </div>
      {tests && tests.failures.length > 0 && (
        <>
          <div className="label" style={{ marginBottom: 8 }}>
            {t('tests')}
          </div>
          <div className="issues">
            {tests.failures.map((f, i) => (
              <div className="issue" key={i}>
                <span className="sev high">fail</span>
                <div>
                  <div>{f.name}</div>
                  <div className="loc">{f.message}</div>
                </div>
                <span />
              </div>
            ))}
          </div>
        </>
      )}
      {issues.length > 0 && (
        <>
          <div className="label" style={{ marginBottom: 8 }}>
            {t('issues')}
          </div>
          <div className="issues">
            {issues.map((i, k) => (
              <div className="issue" key={k}>
                <span className={`sev ${i.severity}`}>{i.severity}</span>
                <div>
                  <div>{i.message}</div>
                  {i.file && (
                    <div className="loc">
                      {i.file}
                      {i.line ? `:${i.line}` : ''}
                    </div>
                  )}
                </div>
                <span className="tag" style={{ background: AGENT_COLORS[i.by][1], color: AGENT_COLORS[i.by][0] }}>
                  {t(`a_${i.by}`)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  )
}

function Summary({ text }: { text: string }): ReactNode {
  const [open, setOpen] = useState(false)
  return (
    <p className={open ? undefined : 'clamp'} title={open ? undefined : text} onClick={() => setOpen(!open)}>
      {text}
    </p>
  )
}

function ReleaseTab({ task, bump, setBump }: { task: Task; bump: Bump; setBump: (b: Bump) => void }): ReactNode {
  const { t } = useTranslation()
  const rel = task.reports.release
  if (!rel) return <p className="faint">{t('no_release')}</p>
  const next = nextOf(task, bump)
  const groups: [keyof typeof rel.changelog, string][] = [
    ['added', 'Added'],
    ['changed', 'Changed'],
    ['fixed', 'Fixed'],
    ['removed', 'Removed'],
    ['security', 'Security']
  ]
  const preview = [
    `## [${next}]`,
    ...groups
      .filter(([k]) => rel.changelog[k].length)
      .map(([k, title]) => `\n### ${title}\n${rel.changelog[k].map((s) => `- ${s}`).join('\n')}`)
  ].join('\n')
  return (
    <>
      <div className="label">{t('bump_title')}</div>
      <div className="ver" style={{ marginTop: 10 }}>
        <span className="old">{task.currentVersion}</span>
        <ChevronRight />
        <span className="new">{next}</span>
      </div>
      <p className="muted" style={{ fontSize: 13 }}>
        {t('bump_hint', { bump: rel.bump.toUpperCase(), reason: rel.reason })}
      </p>
      <div className="bump">
        {(['patch', 'minor', 'major'] as Bump[]).map((b) => (
          <button key={b} className={bump === b ? 'on' : ''} onClick={() => setBump(b)} disabled={task.status !== 'review'}>
            <b>{b.toUpperCase()}</b>
            <span>{t(`${b}_d`)}</span>
          </button>
        ))}
      </div>
      <div className="label" style={{ marginBottom: 8 }}>
        {t('changelog')}
      </div>
      <pre className="pre">{preview}</pre>
    </>
  )
}

// ---------------------------------------------------------------- planner questions

type Answers = Record<string, { picked: string[]; custom: string }>

/** Turns the form state into one answer string per question. */
function answerStrings(questions: PlanQuestion[], answers: Answers): Record<string, string> {
  const out: Record<string, string> = {}
  for (const q of questions) {
    const a = answers[q.id]
    out[q.id] = [...(a?.picked ?? []), a?.custom.trim() ?? ''].filter(Boolean).join('; ')
  }
  return out
}

function QuestionsForm({
  questions,
  answers,
  setAnswers
}: {
  questions: PlanQuestion[]
  answers: Answers
  setAnswers: (a: Answers) => void
}): ReactNode {
  const { t } = useTranslation()
  const update = (id: string, patch: Partial<Answers[string]>): void => {
    const cur = answers[id] ?? { picked: [], custom: '' }
    setAnswers({ ...answers, [id]: { ...cur, ...patch } })
  }
  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="callout">
        <MessageCircleQuestion />
        <div>
          <b>{t('questions_title')}</b>
          <div className="muted" style={{ fontSize: 13 }}>
            {t('questions_hint')}
          </div>
        </div>
      </div>
      {questions.map((q) => {
        const a = answers[q.id] ?? { picked: [], custom: '' }
        return (
          <fieldset key={q.id} className="question">
            <legend>{q.question}</legend>
            {q.options.map((o) => {
              const checked = a.picked.includes(o.label)
              return (
                <label key={o.label} className={`option ${checked ? 'on' : ''}`}>
                  <input
                    type={q.multiSelect ? 'checkbox' : 'radio'}
                    name={`q-${q.id}`}
                    checked={checked}
                    onChange={() =>
                      update(q.id, {
                        picked: q.multiSelect
                          ? checked
                            ? a.picked.filter((x) => x !== o.label)
                            : [...a.picked, o.label]
                          : [o.label]
                      })
                    }
                  />
                  <span>
                    {o.label}
                    {o.description && <small>{o.description}</small>}
                  </span>
                </label>
              )
            })}
            {q.allowCustom && (
              <input
                id={`q-${q.id}-custom`}
                className="inp"
                placeholder={q.options.length ? t('other_answer') : t('other_ph')}
                value={a.custom}
                onChange={(e) => update(q.id, { custom: e.target.value, ...(q.multiSelect || !e.target.value ? {} : { picked: [] }) })}
              />
            )}
          </fieldset>
        )
      })}
    </div>
  )
}

function Discussion({ task }: { task: Task }): ReactNode {
  const { t } = useTranslation()
  if (!task.discussion.length) return null
  return (
    <details className="discussion" open={!!task.questions?.length}>
      <summary>
        {t('discussion')} · {task.discussion.length}
      </summary>
      {task.discussion.map((d, i) => (
        <div key={i} className="qa">
          <div className="q">{d.question}</div>
          <div className="a">{d.answer}</div>
        </div>
      ))}
    </details>
  )
}
