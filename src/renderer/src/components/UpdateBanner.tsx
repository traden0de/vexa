import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, RefreshCw, Sparkles, X } from 'lucide-react'
import { call } from '../api'
import { useStore } from '../store'

/** Bottom-right card offering a new version; hidden for the session with "Later". */
export function UpdateBanner(): ReactNode {
  const { t } = useTranslation()
  const update = useStore((s) => s.update)
  const dismissed = useStore((s) => s.updateDismissed)
  const dismiss = useStore((s) => s.dismissUpdate)
  const busy = useStore((s) => s.queue.activeTaskId != null)
  const run = useStore((s) => s.run)
  const [notesOpen, setNotesOpen] = useState(false)

  if (!update || !['available', 'downloading', 'downloaded'].includes(update.status)) return null
  if (update.status !== 'downloading' && dismissed === update.version) return null

  return (
    <div className="update-card" role="status">
      <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
        <Sparkles style={{ color: 'var(--accent)', marginTop: 2 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <b>
            {update.status === 'downloaded'
              ? t('upd_ready', { version: update.version })
              : t('upd_available', { version: update.version })}
          </b>
          <div className="faint" style={{ fontSize: 12 }}>
            {t('upd_current', { version: update.current })}
          </div>
        </div>
        {update.status !== 'downloading' && (
          <button className="btn ghost icon" aria-label={t('upd_later')} onClick={dismiss}>
            <X />
          </button>
        )}
      </div>

      {update.notes && update.status === 'available' && (
        <>
          <button className="linklike" onClick={() => setNotesOpen(!notesOpen)}>
            {t('upd_whats_new')}
          </button>
          {notesOpen && <pre className="update-notes">{update.notes}</pre>}
        </>
      )}

      {update.status === 'downloading' && (
        <div className="stack" style={{ gap: 4 }}>
          <span className="meter" style={{ width: '100%' }}>
            <i style={{ width: `${update.percent ?? 0}%` }} />
          </span>
          <span className="faint tnum" style={{ fontSize: 12 }}>
            {t('upd_downloading', { percent: update.percent ?? 0 })}
          </span>
        </div>
      )}

      {update.status === 'available' && (
        <div className="row">
          <button className="btn primary sm" onClick={() => run(() => call('update:download'))}>
            <Download /> {t('upd_download')}
          </button>
          <button className="btn ghost sm" onClick={dismiss}>
            {t('upd_later')}
          </button>
        </div>
      )}

      {update.status === 'downloaded' && (
        <>
          <div className="row">
            <button className="btn primary sm" disabled={busy} onClick={() => run(() => call('update:install'))}>
              <RefreshCw /> {t('upd_install')}
            </button>
            <button className="btn ghost sm" onClick={dismiss}>
              {t('upd_later')}
            </button>
          </div>
          <span className="faint" style={{ fontSize: 12 }}>
            {busy ? t('upd_busy') : t('upd_on_quit')}
          </span>
        </>
      )}
    </div>
  )
}
