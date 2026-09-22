import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { Priority, TaskType } from '@shared/types'
import { call } from '../api'
import { useStore } from '../store'
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
  const [busy, setBusy] = useState(false)

  const submit = async (status: 'backlog' | 'queue'): Promise<void> => {
    if (!title.trim()) return
    setBusy(true)
    const ok = edit
      ? await run(() => call('tasks:update', edit.id, { title: title.trim(), description, type, priority }), t('toast_saved'))
      : await run(() => call('tasks:create', { projectId, title, description, type, priority, status }), t('toast_created'))
    setBusy(false)
    if (ok) close()
  }

  return (
    <Modal onClose={close}>
      <form
        className="dialog"
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
