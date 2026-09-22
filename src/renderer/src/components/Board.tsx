import { useMemo, useState, type ReactNode } from 'react'
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
import { Play, Zap } from 'lucide-react'
import { TASK_COLUMNS, type Task, type TaskStatus, type TaskType } from '@shared/types'
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

/** Where a card may be dropped from its current column (mirrors the main-process rules). */
const DROP_RULES: Partial<Record<TaskStatus, TaskStatus[]>> = {
  backlog: ['queue', 'failed', 'approval', 'done'],
  queue: ['backlog', 'failed']
}

export function Board(): ReactNode {
  const { t } = useTranslation()
  const tasks = useStore((s) => s.tasks)
  const openTaskDialog = useStore((s) => s.openTaskDialog)
  const run = useStore((s) => s.run)
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
      </div>
      <DndContext
        sensors={sensors}
        onDragStart={(e) => setDragging(tasks[Number(e.active.id)] ?? null)}
        onDragCancel={() => setDragging(null)}
        onDragEnd={onDragEnd}
      >
        <div className="board">
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
  return (
    <div ref={setNodeRef} className={`col ${canDrop && isOver ? 'drop' : ''}`}>
      <div className="col-h">
        <span className="sw" style={{ background: COL_COLORS[status] }} />
        {t(`c_${status}`)}
        <span className="n">{tasks.length}</span>
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
          <div className="card-note note-warn">{t('plan_wait').split('.')[0]}.</div>
          <div className="act">
            <button
              className="btn sm primary"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                selectTask(task.id, 'plan')
              }}
            >
              {t('approve')}
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
        </>
      )
      break
    case 'failed':
      extra = (
        <>
          <MiniStages stages={task.stages} />
          {task.error && <div className="card-note note-bad">{task.error.length > 140 ? task.error.slice(0, 140) + '…' : task.error}</div>}
        </>
      )
      break
  }

  const showCost = task.costUsd > 0 || task.durationMs > 0
  return (
    <article
      className={`card ${selected ? 'sel' : ''} ${overlay ? 'drag-overlay' : ''}`}
      onClick={open}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && open()}
    >
      <div className="top">
        <span className="id">#{task.seq}</span>
        <TypeTag type={task.type} />
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
