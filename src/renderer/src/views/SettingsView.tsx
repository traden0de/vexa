import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Compass, Download, LoaderCircle, RefreshCw } from 'lucide-react'
import { call } from '../api'
import type { Settings } from '@shared/types'
import { useStore } from '../store'
import { Seg, Toggle } from '../components/ui'

export function SettingsView(): ReactNode {
  const { t } = useTranslation()
  const settings = useStore((s) => s.settings)!
  const update = useStore((s) => s.updateSettings)
  const checkEnv = useStore((s) => s.checkEnv)
  const setView = useStore((s) => s.setView)
  const [path, setPath] = useState(settings.claudePath)
  const [model, setModel] = useState(settings.defaultModel)
  useEffect(() => setPath(settings.claudePath), [settings.claudePath])
  useEffect(() => setModel(settings.defaultModel), [settings.defaultModel])

  const set = (patch: Partial<Settings>): void => void update(patch)

  return (
    <div className="page" style={{ maxWidth: 860 }}>
      <h1>{t('set_title')}</h1>
      <p className="sub" />
      <UpdatesPanel />
      <div className="panel">
        <div className="set-row">
          <div>
            {t('tour_again')}
            <p>{t('tour_again_d')}</p>
          </div>
          <div>
            <button
              className="btn"
              onClick={async () => {
                const hasProject = useStore.getState().projectId != null
                const part = hasProject ? 'board' : 'welcome'
                await update({ tourSeen: { ...settings.tourSeen, [part]: false } })
                setView(hasProject ? 'board' : 'home')
              }}
            >
              <Compass /> {t('tour_again')}
            </button>
          </div>
        </div>
        <div className="set-row">
          <div>{t('lang')}</div>
          <Seg value={settings.lang} onChange={(lang) => set({ lang })} options={[{ value: 'ru', label: 'Русский' }, { value: 'en', label: 'English' }]} />
        </div>
        <div className="set-row">
          <div>{t('theme')}</div>
          <Seg
            value={settings.theme}
            onChange={(theme) => set({ theme })}
            options={(['system', 'light', 'dark'] as const).map((v) => ({ value: v, label: t(`theme_${v}`) }))}
          />
        </div>
        <div className="set-row">
          <div>
            {t('max_iter')}
            <p>{t('set_iter_d')}</p>
          </div>
          <input
            id="set-iter"
            className="inp"
            type="number"
            min={1}
            max={10}
            value={settings.maxIterations}
            onChange={(e) => set({ maxIterations: Math.min(10, Math.max(1, Number(e.target.value) || 1)) })}
          />
        </div>
        <div className="set-row">
          <div>
            {t('set_model')}
            <p>{t('set_model_d')}</p>
          </div>
          <input id="set-model" className="inp" list="set-models" value={model} onChange={(e) => setModel(e.target.value)} onBlur={() => set({ defaultModel: model.trim() })} />
          <datalist id="set-models">
            {['fable', 'opus', 'sonnet', 'haiku'].map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </div>
        <div className="set-row">
          <div>
            {t('set_wait')}
            <p>{t('set_wait_d')}</p>
          </div>
          <Toggle label={t('set_wait')} on={settings.waitForReview} onChange={(waitForReview) => set({ waitForReview })} />
        </div>
        <div className="set-row">
          <div>
            {t('set_auto')}
            <p>{t('set_auto_d')}</p>
          </div>
          <Toggle label={t('set_auto')} on={settings.autoResume} onChange={(autoResume) => set({ autoResume })} />
        </div>
        <div className="set-row">
          <div>
            {t('set_path')}
            <p>{t('set_path_d')}</p>
          </div>
          <input
            id="set-path"
            className="inp mono"
            style={{ fontSize: 12.5 }}
            value={path}
            placeholder="claude"
            onChange={(e) => setPath(e.target.value)}
            onBlur={async () => {
              await update({ claudePath: path.trim() })
              void checkEnv()
            }}
          />
        </div>
      </div>
    </div>
  )
}

function UpdatesPanel(): ReactNode {
  const { t } = useTranslation()
  const update = useStore((s) => s.update)
  const settings = useStore((s) => s.settings)!
  const updateSettings = useStore((s) => s.updateSettings)
  const busy = useStore((s) => s.queue.activeTaskId != null)
  const run = useStore((s) => s.run)
  if (!update) return null

  const status = (() => {
    switch (update.status) {
      case 'unsupported':
        return t('upd_unsupported')
      case 'checking':
        return t('upd_checking')
      case 'not-available':
        return t('upd_latest')
      case 'available':
        return t('upd_available', { version: update.version })
      case 'downloading':
        return t('upd_downloading', { percent: update.percent ?? 0 })
      case 'downloaded':
        return t('upd_ready', { version: update.version })
      case 'error':
        return `${t('upd_error')}: ${update.error}`
      default:
        return ''
    }
  })()

  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <div className="set-row">
        <div>
          {t('upd_title')} <span className="reftag">v{update.current}</span>
          <p style={{ color: update.status === 'error' ? 'var(--bad)' : undefined }}>{status}</p>
        </div>
        <div className="row">
          {update.status === 'available' && (
            <button className="btn primary" onClick={() => run(() => call('update:download'))}>
              <Download /> {t('upd_download')}
            </button>
          )}
          {update.status === 'downloaded' && (
            <button className="btn primary" disabled={busy} title={busy ? t('upd_busy') : undefined} onClick={() => run(() => call('update:install'))}>
              <RefreshCw /> {t('upd_install')}
            </button>
          )}
          {update.status !== 'downloading' && update.status !== 'downloaded' && (
            <button
              className="btn"
              disabled={update.status === 'unsupported' || update.status === 'checking'}
              onClick={() => run(() => call('update:check'))}
            >
              {update.status === 'checking' ? <LoaderCircle className="spin" /> : <RefreshCw />} {t('upd_check')}
            </button>
          )}
        </div>
      </div>
      <div className="set-row">
        <div>
          {t('upd_auto')}
          <p>{t('upd_auto_d')}</p>
        </div>
        <Toggle label={t('upd_auto')} on={settings.autoCheckUpdates} onChange={(autoCheckUpdates) => void updateSettings({ autoCheckUpdates })} />
      </div>
    </div>
  )
}
