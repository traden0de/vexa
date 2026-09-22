import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Compass } from 'lucide-react'
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
