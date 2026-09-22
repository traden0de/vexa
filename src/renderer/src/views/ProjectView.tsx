import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { FileText, FolderOpen, LoaderCircle, Pencil, Sparkles, Tag } from 'lucide-react'
import type { VersionInfo } from '@shared/types'
import { call } from '../api'
import { useProject, useStore } from '../store'
import { Markdown } from '../components/ui'

export function ProjectView(): ReactNode {
  const { t } = useTranslation()
  const project = useProject()!
  const run = useStore((s) => s.run)
  const [md, setMd] = useState<string | null | undefined>(undefined)
  const [draft, setDraft] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [versions, setVersions] = useState<VersionInfo | null>(null)
  const [changelog, setChangelog] = useState<string | null>(null)

  useEffect(() => {
    void call('project:readClaudeMd', project.id).then(setMd)
    void call('project:versions', project.id).then(setVersions)
    void call('project:changelog', project.id).then(setChangelog)
  }, [project.id])

  const init = async (): Promise<void> => {
    setBusy(true)
    const r = await run(() => call('project:runInit', project.id), t('toast_done'))
    if (r !== undefined) setMd(r)
    setBusy(false)
  }

  return (
    <div className="page">
      <h1>
        {t('nav_project')} · {project.name}
      </h1>
      <p className="sub row">
        <span className="mono" style={{ fontSize: 12 }}>
          {project.path}
        </span>
        <button className="btn sm ghost" onClick={() => call('shell:openPath', project.path)}>
          <FolderOpen /> {t('open_folder_os')}
        </button>
      </p>
      <div className="grid2" style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(260px, 1fr)', alignItems: 'start' }}>
        <div className="panel">
          <h3>
            <FileText /> {t('claude_md')}
            <span className="grow" />
            <button className="btn sm" disabled={busy} onClick={init}>
              {busy ? <LoaderCircle className="spin" /> : <Sparkles />} {t('create_md')}
            </button>
            {md != null && draft === null && (
              <button className="btn sm" onClick={() => setDraft(md)}>
                <Pencil /> {t('edit')}
              </button>
            )}
          </h3>
          {draft !== null ? (
            <>
              <textarea id="claude-md" className="inp code" style={{ minHeight: 420 }} value={draft} onChange={(e) => setDraft(e.target.value)} />
              <div className="row" style={{ marginTop: 10 }}>
                <button
                  className="btn primary"
                  onClick={async () => {
                    const ok = await run(() => call('project:writeClaudeMd', project.id, draft), t('toast_saved'))
                    if (ok !== undefined) {
                      setMd(draft)
                      setDraft(null)
                    }
                  }}
                >
                  {t('save')}
                </button>
                <button className="btn ghost" onClick={() => setDraft(null)}>
                  {t('cancel')}
                </button>
              </div>
            </>
          ) : md === null ? (
            <p className="faint">{t('claude_md_none')}</p>
          ) : md ? (
            <Markdown text={md} />
          ) : null}
        </div>
        <div className="stack" style={{ gap: 16 }}>
          <div className="panel">
            <h3>
              <Tag /> {t('versions')}
            </h3>
            {versions && (
              <>
                <div className="row" style={{ marginBottom: 10 }}>
                  <span className="muted">{t('current_version')}</span>
                  <span className="reftag" style={{ fontSize: 13 }}>
                    v{versions.current}
                  </span>
                </div>
                {versions.files.length > 0 && (
                  <p className="faint" style={{ fontSize: 12, marginTop: 0 }}>
                    {t('version_files')}: <span className="mono">{versions.files.join(', ')}</span>
                  </p>
                )}
                <div className="list">
                  {versions.tags.length === 0 && <p className="faint">{t('no_tags')}</p>}
                  {versions.tags.slice(0, 20).map((tg) => (
                    <div className="li" key={tg.name}>
                      <span className="reftag">{tg.name}</span>
                      <span className="grow" />
                      <span className="sub2">{tg.date}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
          {changelog && (
            <div className="panel">
              <h3>CHANGELOG.md</h3>
              <div style={{ maxHeight: 420, overflow: 'auto' }}>
                <Markdown text={changelog} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
