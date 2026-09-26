import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ImagePlus } from 'lucide-react'
import type { Priority, TaskType } from '@shared/types'
import { call } from '../api'
import { useStore } from '../store'
import { autoBranchName } from '@shared/slug'
import { IMAGE_ACCEPT, Thumbs, readImages, type DraftImage } from './Images'
import { Modal, Seg } from './ui'

export function TaskDialog(): ReactNode {
  const { t } = useTranslation()
  const edit = useStore((s) => s.taskDialog.edit)
  const close = useStore((s) => s.closeTaskDialog)
  const projectId = useStore((s) => s.projectId)!
  const run = useStore((s) => s.run)
  const [title, setTitle] = useState(edit?.title ?? '')
  const [description, setDescription] = useState(edit?.description ?? '')
  const [type, setType] = useState<TaskType>(edit?.type ?? 'feature')
  const [priority, setPriority] = useState<Priority>(edit?.priority ?? 2)
  const [discuss, setDiscuss] = useState(edit?.discuss ?? false)
  const [branch, setBranch] = useState(edit?.branchCustom ? (edit.branch ?? '') : '')
  const nextSeq = useStore((s) => Object.values(s.tasks).reduce((m, x) => Math.max(m, x.seq), 0) + 1)
  const branchLocked = !!edit?.baseBranch
  const [busy, setBusy] = useState(false)
  const [images, setImages] = useState<DraftImage[]>([])
  const [dragging, setDragging] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!edit?.images?.length) return
    let alive = true
    call('tasks:images', edit.id).then((list) => {
      if (alive) setImages((cur) => [...list.map((x) => ({ name: x.name, src: x.dataUrl })), ...cur.filter((c) => c.data)])
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edit?.id])

  const addFiles = async (files: Iterable<File>): Promise<void> => {
    const added = await readImages(files)
    if (added.length) setImages((cur) => [...cur, ...added])
  }
  const imageInputs = images.map(({ name, data }) => ({ name, data }))

  const submit = async (status: 'backlog' | 'queue'): Promise<void> => {
    if (!title.trim()) return
    setBusy(true)
    const ok = edit
      ? await run(() => call('tasks:update', edit.id, { title: title.trim(), description, type, priority, discuss, images: imageInputs, ...(branchLocked ? {} : { branch }) }), t('toast_saved'))
      : await run(() => call('tasks:create', { projectId, title, description, type, priority, status, discuss, branch: branch.trim() || undefined, images: imageInputs }), t('toast_created'))
    setBusy(false)
    if (ok) close()
  }

  return (
    <Modal onClose={close}>
      <form
        className={`dialog ${dragging ? 'dropping' : ''}`}
        onPaste={(e) => {
          const files = [...e.clipboardData.files].filter((f) => f.type.startsWith('image/'))
          if (!files.length) return
          e.preventDefault()
          void addFiles(files)
        }}
        onDragOver={(e) => {
          if (![...e.dataTransfer.items].some((i) => i.kind === 'file')) return
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false)
        }}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          void addFiles(e.dataTransfer.files)
        }}
        onSubmit={(e) => {
          e.preventDefault()
          void submit(edit ? 'backlog' : 'queue')
        }}
      >
        <header>{edit ? t('et_title') : t('nt_title')}</header>
        <div className="body">
          <div className="field">
            <label htmlFor="nt-title">{t('nt_name')}</label>
            <input id="nt-title" className="inp" autoFocus placeholder={t('nt_ph')} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="nt-desc">{t('nt_desc')}</label>
            <textarea
              id="nt-desc"
              className="inp"
              style={{ minHeight: 140 }}
              placeholder={t('nt_dph')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="field">
            <span className="flabel">{t('nt_images')}</span>
            <Thumbs images={images} onRemove={(i) => setImages((cur) => cur.filter((_, k) => k !== i))} />
            <div className="row" style={{ gap: 10 }}>
              <button type="button" className="btn sm" onClick={() => fileInput.current?.click()}>
                <ImagePlus /> {t('nt_attach')}
              </button>
              <small className="faint" style={{ fontSize: 12 }}>
                {t('nt_images_hint')}
              </small>
            </div>
            <input
              ref={fileInput}
              type="file"
              accept={IMAGE_ACCEPT}
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files) void addFiles(e.target.files)
                e.target.value = ''
              }}
            />
          </div>
          <label className="checkline" htmlFor="nt-discuss">
            <input id="nt-discuss" type="checkbox" checked={discuss} onChange={(e) => setDiscuss(e.target.checked)} />
            <span>
              {t('nt_discuss')}
              <small>{t('nt_discuss_hint')}</small>
            </span>
          </label>
          <div className="field">
            <label htmlFor="nt-branch">{t('nt_branch')}</label>
            <input
              id="nt-branch"
              className="inp mono"
              style={{ fontSize: 12.5 }}
              disabled={branchLocked}
              placeholder={edit?.branch && !edit.branchCustom ? edit.branch : autoBranchName(edit?.seq ?? nextSeq, title || 'task')}
              value={branchLocked ? (edit?.branch ?? '') : branch}
              onChange={(e) => setBranch(e.target.value)}
            />
            <small className="faint" style={{ fontSize: 12 }}>
              {branchLocked ? t('nt_branch_locked') : t('nt_branch_hint')}
            </small>
          </div>
          <div className="row" style={{ gap: 16, alignItems: 'flex-start' }}>
            <div className="field">
              <span className="flabel">{t('nt_type')}</span>
              <Seg
                value={type}
                onChange={setType}
                options={(['feature', 'fix', 'refactor', 'breaking'] as TaskType[]).map((v) => ({ value: v, label: v }))}
              />
            </div>
            <div className="field">
              <span className="flabel">{t('nt_prio')}</span>
              <Seg
                value={priority}
                onChange={setPriority}
                options={[
                  { value: 1 as Priority, label: t('low') },
                  { value: 2 as Priority, label: t('normal') },
                  { value: 3 as Priority, label: t('high') }
                ]}
              />
            </div>
          </div>
        </div>
        <footer>
          <button type="button" className="btn ghost" onClick={close}>
            {t('cancel')}
          </button>
          {edit ? (
            <button type="submit" className="btn primary" disabled={busy || !title.trim()}>
              {t('save')}
            </button>
          ) : (
            <>
              <button type="button" className="btn" disabled={busy || !title.trim()} onClick={() => void submit('backlog')}>
                {t('save_backlog')}
              </button>
              <button type="submit" className="btn primary" disabled={busy || !title.trim()}>
                {t('save_queue')}
              </button>
            </>
          )}
        </footer>
      </form>
    </Modal>
  )
}
