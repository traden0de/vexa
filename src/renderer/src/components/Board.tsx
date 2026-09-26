import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core'
import { CircleAlert, GitPullRequestArrow, Play, Zap } from 'lucide-react'
import { TASK_COLUMNS, attentionKind, type AttentionKind, type Task, type TaskStatus, type TaskType } from '@shared/types'
import { call } from '../api'
import { useStore } from '../store'
import { MiniStages, Prio, TypeTag, formatCost, formatDuration } from './ui'

const COL_COLORS: Record<TaskStatus, string> = {
  backlog: 'var(--faint)',
  queue: 'var(--info)',
  planning: 'var(--violet)',
  approval: 'var(--accent)',
  progress: 'var(--accent)',
  review: 'var(--ok)',
  done: 'var(--teal)',
  failed: 'var(--bad)'
}

/** Most urgent first: broken things, then questions, then finished work to accept. */
const ATTN_ORDER: AttentionKind[] = ['conflict', 'failed', 'questions', 'approval', 'review']
const ATTN_TONE: Record<AttentionKind, string> = {
  conflict: 'bad',
  failed: 'bad',
  questions: 'accent',
  approval: 'accent',
  review: 'ok'
}

/** Where a card may be dropped from its current column (mirrors the main-process rules). */
const DROP_RULES: Partial<Record<TaskStatus, TaskStatus[]>> = {
  backlog: ['queue', 'failed', 'approval', 'done'],
  queue: ['backlog', 'failed']
}

export function Board(): ReactNode {
  const { t } = useTranslation()
  const tasks = useStore((s) => s.tasks)
  const openTaskDialog = useStore((s) => s.openTaskDialog)
  const openTask = useStore((s) => s.openTask)
  const projectId = useStore((s) => s.projectId)
  const run = useStore((s) => s.run)
  const boardRef = useRef<HTMLDivElement>(null)
  const [filter, setFilter] = useState<TaskType | 'all'>('all')
  const [dragging, setDragging] = useState<Task | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const byCol = useMemo(() => {
    const m = Object.fromEntries(TASK_COLUMNS.map((c) => [c, [] as Task[]])) as Record<TaskStatus, Task[]>
    for (const task of Object.values(tasks)) if (filter === 'all' || task.type === filter) m[task.status].push(task)
    for (const c of TASK_COLUMNS) {
      m[c].sort((a, b) =>
        c === 'done' || c === 'failed' || c === 'review'
          ? b.updatedAt - a.updatedAt
          : Number(b.planApproved) - Number(a.planApproved) || b.priority - a.priority || a.order - b.order
      )
    }
    return m
  }, [tasks, filter])

  const waiting = useMemo(
    () =>
      Object.values(tasks)
        .map((task) => ({ task, kind: attentionKind(task) }))
        .filter((x): x is { task: Task; kind: AttentionKind } => x.kind !== null)
        .sort((a, b) => ATTN_ORDER.indexOf(a.kind) - ATTN_ORDER.indexOf(b.kind) || a.task.seq - b.task.seq),
    [tasks]
  )
  const waitingKey = waiting.map((x) => x.task.id).join()

  // The board is wider than the screen: scroll so every waiting card is visible,
  // or at least the most urgent one when they do not fit together.
  useEffect(() => {
    if (!waitingKey) return
    const frame = requestAnimationFrame(() => {
      const board = boardRef.current
      if (!board) return
      const box = board.getBoundingClientRect()
      const spans = waitingKey.split(',').flatMap((id) => {
        const r = board.querySelector(`[data-task="${id}"]`)?.getBoundingClientRect()
        return r ? [[r.left - box.left + board.scrollLeft - 18, r.right - box.left + board.scrollLeft + 18]] : []
      })
      if (!spans.length) return
      const all = [Math.min(...spans.map((s) => s[0])), Math.max(...spans.map((s) => s[1]))]
      const [from, to] = all[1] - all[0] <= board.clientWidth ? all : spans[0]
      let left = board.scrollLeft
      if (from < left) left = from
      else if (to > left + board.clientWidth) left = to - board.clientWidth
      if (left !== board.scrollLeft) board.scrollTo({ left, behavior: 'smooth' })
    })
    return () => cancelAnimationFrame(frame)
  }, [projectId, waitingKey])

  const onDragEnd = (e: DragEndEvent): void => {
    setDragging(null)
    const task = tasks[Number(e.active.id)]
    const to = e.over?.id as TaskStatus | undefined
    if (!task || !to || to === task.status) return
    if (!DROP_RULES[to]?.includes(task.status)) return
    void run(() => call('tasks:move', task.id, to))
  }

  return (
    <div className="board-wrap">
      <div className="board-head">
        <h2>{t('board')}</h2>
        <div className="row">
          {(['all', 'feature', 'fix', 'refactor', 'breaking'] as const).map((f) => (
            <button key={f} className={`chip ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>
              {f === 'all' ? t('all') : f}
            </button>
          ))}
        </div>
        {waiting.length > 0 && (
          <div className="attn-bar" data-tour="attention">
            <span className="attn-title">
              <CircleAlert /> {t('attn_title')}
            </span>
            {waiting.map(({ task, kind }) => (
              <button key={task.id} className={`attn-chip tone-${ATTN_TONE[kind]}`} onClick={() => void openTask(task)} title={task.title}>
                <span className="mono">#{task.seq}</span> {t(`attn_${kind}`)}
              </button>
            ))}
          </div>
        )}
      </div>
      <DndContext
        sensors={sensors}
        onDragStart={(e) => setDragging(tasks[Number(e.active.id)] ?? null)}
        onDragCancel={() => setDragging(null)}
        onDragEnd={onDragEnd}
      >
        <div className="board" data-tour="board" ref={boardRef}>
          {TASK_COLUMNS.map((c) => (
            <Column key={c} status={c} tasks={byCol[c]} dragging={dragging}>
              {c === 'backlog' && (
                <button className="add-inline" onClick={() => openTaskDialog()}>
                  + {t('new_task')}
                </button>
              )}
            </Column>
          ))}
        </div>
        <DragOverlay dropAnimation={null}>{dragging && <CardBody task={dragging} overlay />}</DragOverlay>
      </DndContext>
    </div>
  )
}

function Column({
  status,
  tasks,
  dragging,
  children
}: {
  status: TaskStatus
  tasks: Task[]
  dragging: Task | null
  children?: ReactNode
}): ReactNode {
  const { t } = useTranslation()
  const canDrop = !!dragging && dragging.status !== status && !!DROP_RULES[status]?.includes(dragging.status)
  const { setNodeRef, isOver } = useDroppable({ id: status, disabled: !canDrop })
  const waiting = tasks.filter((x) => attentionKind(x)).length
  return (
    <div ref={setNodeRef} className={`col ${canDrop && isOver ? 'drop' : ''}`} data-tour={`col-${status}`}>
      <div className="col-h">
        <span className="sw" style={{ background: COL_COLORS[status] }} />
        {t(`c_${status}`)}
        <span className="n">{tasks.length}</span>
        {waiting > 0 && (
          <span className="attn-n" title={t('attn_title')}>
            {waiting}
          </span>
        )}
      </div>
      <div className="col-b">
        {tasks.map((task) => (
          <Card key={task.id} task={task} />
        ))}
        {children}
      </div>
    </div>
  )
}

function Card({ task }: { task: Task }): ReactNode {
  const draggable = task.status === 'backlog' || task.status === 'queue' || task.status === 'failed' || task.status === 'done' || task.status === 'approval'
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id, disabled: !draggable })
  return (
    <div
      ref={setNodeRef}
      {...(draggable ? { ...attributes, ...listeners } : {})}
      className={isDragging ? 'card dragging' : undefined}
      data-task={task.id}
      style={{ borderRadius: 10 }}
    >
      <CardBody task={task} />
    </div>
  )
}

function CardBody({ task, overlay }: { task: Task; overlay?: boolean }): ReactNode {
  const { t } = useTranslation()
  const selected = useStore((s) => s.selectedTaskId === task.id)
  const selectTask = useStore((s) => s.selectTask)
  const run = useStore((s) => s.run)
  const reviewBlocked = useStore(
    (s) => s.settings?.waitForReview && task.planApproved && Object.values(s.tasks).some((x) => x.status === 'review')
  )

  const open = (): void => {
    const tab =
      task.status === 'approval' ? 'plan' : task.status === 'review' ? 'reports' : task.status === 'backlog' ? 'details' : 'log'
    selectTask(task.id, tab)
  }

  const kind = attentionKind(task)
  /** A button inside the card: must not start a drag or open the card twice. */
  const action = (label: ReactNode, onClick: () => void, cls = 'btn sm primary'): ReactNode => (
    <div className="act">
      <button
        className={cls}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          onClick()
        }}
      >
        {label}
      </button>
    </div>
  )

  let extra: ReactNode = null
  switch (task.status) {
    case 'backlog':
      extra = (
        <div className="act">
          <button
            className="btn sm"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              void run(() => call('tasks:move', task.id, 'queue'))
            }}
          >
            <Play /> {t('send')}
          </button>
        </div>
      )
      break
    case 'queue':
      extra = task.errorKind === 'limit' ? (
        <div className="card-note note-warn">{task.error}</div>
      ) : task.planApproved ? (
        <div className={`card-note ${reviewBlocked ? 'note-warn' : 'note-info'}`}>{reviewBlocked ? t('waiting_review_block') : t('plan_approved')}</div>
      ) : null
      break
    case 'planning':
      extra = <MiniStages stages={task.stages} />
      break
    case 'approval':
      extra = (
        <>
          {task.questions?.length ? (
            <div className="card-note note-info">{t('questions_note')}</div>
          ) : (
            <div className="card-note note-warn">{t('plan_wait').split('.')[0]}.</div>
          )}
          <div className="act">
            <button
              className="btn sm primary"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                selectTask(task.id, 'plan')
              }}
            >
              {task.questions?.length ? t('answer') : t('approve')}
            </button>
          </div>
        </>
      )
      break
    case 'progress':
      extra = (
        <>
          <MiniStages stages={task.stages} />
          <div className="meta">
            <Zap /> {task.activeStage ? t(`s_${task.activeStage}`) : '…'} · {t('iter')} {task.iteration}
          </div>
        </>
      )
      break
    case 'review':
      extra = (
        <>
          <MiniStages stages={task.stages} />
          <div className="card-note note-ok">
            {task.currentVersion} → v{task.version}
          </div>
          {kind === 'conflict'
            ? action(
                <>
                  <GitPullRequestArrow /> {t('attn_conflict')}
                </>,
                () => void run(() => call('tasks:resolveConflict', task.id), t('toast_resolve'))
              )
            : action(t('attn_review'), () => selectTask(task.id, 'reports'), 'btn sm ok')}
        </>
      )
      break
    case 'failed':
      extra = (
        <>
          <MiniStages stages={task.stages} />
          {task.error && <div className="card-note note-bad">{task.error.length > 140 ? task.error.slice(0, 140) + '…' : task.error}</div>}
          {kind === 'failed' && action(t('attn_failed'), () => selectTask(task.id, 'log'), 'btn sm')}
        </>
      )
      break
  }

  const showCost = task.costUsd > 0 || task.durationMs > 0
  return (
    <article
      className={`card ${selected ? 'sel' : ''} ${kind ? 'attn' : ''} ${overlay ? 'drag-overlay' : ''}`}
      onClick={open}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && open()}
    >
      <div className="top">
        <span className="id">#{task.seq}</span>
        <TypeTag type={task.type} />
        {task.discuss && <span className="tag t-discuss">{t('discuss_tag')}</span>}
        <span className="grow" />
        <Prio p={task.priority} />
      </div>
      <div className="ttl">{task.title}</div>
      {extra}
      {(showCost || task.status === 'done') && (
        <div className="meta">
          {task.status === 'done' && task.version && <span className="reftag">v{task.version}</span>}
          {showCost && (
            <span className="tnum">
              {formatCost(task.costUsd)} · {formatDuration(task.durationMs)}
            </span>
          )}
        </div>
      )}
    </article>
  )
}
