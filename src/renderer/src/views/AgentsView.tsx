import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { RotateCcw, X } from 'lucide-react'
import { AGENT_IDS, STAGES, STAGE_AGENT, type AgentDef, type AgentId, type PermissionMode } from '@shared/types'
import { call } from '../api'
import { useStore } from '../store'
import { AGENT_COLORS } from '../components/ui'

const MODES: PermissionMode[] = ['plan', 'acceptEdits', 'default', 'dontAsk', 'auto', 'bypassPermissions']
const EFFORTS = ['', 'low', 'medium', 'high', 'xhigh', 'max']

export function AgentsView(): ReactNode {
  const { t } = useTranslation()
  const pid = useStore((s) => s.projectId) ?? undefined
  const maxIter = useStore((s) => s.settings?.maxIterations ?? 3)
  const run = useStore((s) => s.run)
  const [agents, setAgents] = useState<AgentDef[]>([])
  const [sel, setSel] = useState<AgentId>('planner')
  const [draft, setDraft] = useState<AgentDef | null>(null)
  const [newTool, setNewTool] = useState('')

  useEffect(() => {
    void call('agents:list', pid).then(setAgents)
  }, [pid])

  useEffect(() => {
    const a = agents.find((x) => x.id === sel)
    setDraft(a ? { ...a, allowedTools: [...a.allowedTools] } : null)
  }, [agents, sel])

  const save = async (scope: 'user' | 'project'): Promise<void> => {
    if (!draft) return
    const list = await run(() => call('agents:save', draft, scope, pid), t('toast_saved'))
    if (list) setAgents(list)
  }
  const reset = async (): Promise<void> => {
    if (!draft || draft.source === 'builtin') return
    const list = await run(() => call('agents:reset', draft.id, draft.source as 'user' | 'project', pid), t('toast_saved'))
    if (list) setAgents(list)
  }

  return (
    <div className="page">
      <h1>{t('nav_agents')}</h1>
      <p className="sub">{t('ag_sub')}</p>
      <div className="label" style={{ marginBottom: 8 }}>
        {t('pipeline')}
      </div>
      <div className="flow">
        {STAGES.map((s, i) => (
          <span key={s} className="row" style={{ gap: 6 }}>
            <span className="node">
              <span className="dot" style={{ background: AGENT_COLORS[STAGE_AGENT[s]][0] }} />
              {t(`a_${STAGE_AGENT[s]}`)}
            </span>
            {i < STAGES.length - 1 && <span className="faint">→</span>}
          </span>
        ))}
        <span className="chip" style={{ marginLeft: 8 }}>
          <RotateCcw /> {t('s_tests')}/{t('s_review')}/{t('s_security')} · {t('fix_loop', { n: maxIter })}
        </span>
      </div>
      <div className="agents">
        <div className="agl">
          {AGENT_IDS.map((id) => {
            const a = agents.find((x) => x.id === id)
            return (
              <button key={id} className={sel === id ? 'on' : ''} onClick={() => setSel(id)}>
                <span className="av" style={{ background: AGENT_COLORS[id][1], color: AGENT_COLORS[id][0] }}>
                  {AGENT_COLORS[id][2]}
                </span>
                <span style={{ minWidth: 0 }}>
                  {t(`a_${id}`)}
                  <small>{a && a.source !== 'builtin' ? a.description : t(`ad_${id}`)}</small>
                </span>
              </button>
            )
          })}
        </div>
        {draft && (
          <div className="panel">
            <h3>
              <span className="av" style={{ width: 24, height: 24, borderRadius: 6, fontSize: 12, background: AGENT_COLORS[draft.id][1], color: AGENT_COLORS[draft.id][0] }}>
                {AGENT_COLORS[draft.id][2]}
              </span>
              {t(`a_${draft.id}`)}
              <span className="chip">{t(`source_${draft.source}`)}</span>
            </h3>
            <div className="grid2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
              <div className="field">
                <label htmlFor="ag-model">{t('model')}</label>
                <input id="ag-model" className="inp" list="models" placeholder={t('model_default')} value={draft.model} onChange={(e) => setDraft({ ...draft, model: e.target.value })} />
                <datalist id="models">
                  {['fable', 'opus', 'sonnet', 'haiku'].map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </div>
              <div className="field">
                <label htmlFor="ag-perm">{t('perm')}</label>
                <select id="ag-perm" className="inp" value={draft.permissionMode} onChange={(e) => setDraft({ ...draft, permissionMode: e.target.value as PermissionMode })}>
                  {MODES.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="ag-effort">{t('effort')}</label>
                <select id="ag-effort" className="inp" value={draft.effort ?? ''} onChange={(e) => setDraft({ ...draft, effort: e.target.value || undefined })}>
                  {EFFORTS.map((m) => (
                    <option key={m} value={m}>
                      {m || t('model_default')}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="field">
              <span className="flabel">{t('tools_l')}</span>
              <div className="tools">
                {draft.allowedTools.map((tool) => (
                  <label key={tool}>
                    {tool}
                    <button type="button" aria-label={`remove ${tool}`} onClick={() => setDraft({ ...draft, allowedTools: draft.allowedTools.filter((x) => x !== tool) })}>
                      <X />
                    </button>
                  </label>
                ))}
              </div>
              <input
                id="ag-tool"
                className="inp mono"
                style={{ fontSize: 12.5 }}
                placeholder={t('add_tool')}
                value={newTool}
                onChange={(e) => setNewTool(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newTool.trim()) {
                    e.preventDefault()
                    if (!draft.allowedTools.includes(newTool.trim())) setDraft({ ...draft, allowedTools: [...draft.allowedTools, newTool.trim()] })
                    setNewTool('')
                  }
                }}
              />
            </div>
            <div className="field">
              <label htmlFor="ag-prompt">{t('prompt_l')}</label>
              <textarea id="ag-prompt" className="inp code prompt" value={draft.prompt} onChange={(e) => setDraft({ ...draft, prompt: e.target.value })} />
            </div>
            <div className="row">
              <button className="btn primary" onClick={() => save('user')}>
                {t('save_user')}
              </button>
              {pid != null && (
                <button className="btn" onClick={() => save('project')}>
                  {t('save_project')}
                </button>
              )}
              {draft.source !== 'builtin' && (
                <button className="btn ghost" onClick={reset}>
                  <RotateCcw /> {t('reset')}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
