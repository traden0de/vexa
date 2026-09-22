import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import YAML from 'yaml'
import { AGENT_IDS, type AgentDef, type AgentId, type PermissionMode } from '@shared/types'

/**
 * Agents are markdown files with YAML frontmatter. Resolution order (last wins):
 * builtin (resources/agents) → user (userData/agents) → project (<project>/.veltrix/agents).
 */
export class AgentStore {
  constructor(
    private builtinDir: string,
    private userDir: string
  ) {}

  list(projectPath?: string): AgentDef[] {
    return AGENT_IDS.map((id) => this.get(id, projectPath))
  }

  get(id: AgentId, projectPath?: string): AgentDef {
    const layers: [string, AgentDef['source']][] = [
      [this.builtinDir, 'builtin'],
      [this.userDir, 'user']
    ]
    if (projectPath) layers.push([projectDir(projectPath), 'project'])
    let def: AgentDef | undefined
    for (const [dir, source] of layers) {
      const file = join(dir, `${id}.md`)
      if (existsSync(file)) def = parseAgent(id, readFileSync(file, 'utf8'), source)
    }
    if (!def) throw new Error(`Agent definition not found: ${id}`)
    return def
  }

  save(agent: AgentDef, scope: 'user' | 'project', projectPath?: string): void {
    const dir = scope === 'user' ? this.userDir : projectDir(requirePath(projectPath))
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, `${agent.id}.md`), serializeAgent(agent), 'utf8')
  }

  reset(id: AgentId, scope: 'user' | 'project', projectPath?: string): void {
    const dir = scope === 'user' ? this.userDir : projectDir(requirePath(projectPath))
    rmSync(join(dir, `${id}.md`), { force: true })
  }

  builtinIds(): string[] {
    return readdirSync(this.builtinDir).filter((f) => f.endsWith('.md'))
  }
}

function projectDir(projectPath: string): string {
  return join(projectPath, '.veltrix', 'agents')
}

function requirePath(p?: string): string {
  if (!p) throw new Error('Project is required for project-scoped agents')
  return p
}

export function parseAgent(id: AgentId, text: string, source: AgentDef['source']): AgentDef {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  const meta = (m ? YAML.parse(m[1]) : {}) ?? {}
  const body = (m ? m[2] : text).trim()
  return {
    id,
    name: String(meta.name ?? id),
    description: String(meta.description ?? ''),
    model: String(meta.model ?? ''),
    effort: meta.effort ? String(meta.effort) : undefined,
    permissionMode: (meta.permissionMode ?? 'default') as PermissionMode,
    allowedTools: Array.isArray(meta.allowedTools) ? meta.allowedTools.map(String) : [],
    prompt: body,
    source
  }
}

export function serializeAgent(a: AgentDef): string {
  const meta: Record<string, unknown> = {
    name: a.name,
    description: a.description,
    model: a.model,
    permissionMode: a.permissionMode,
    allowedTools: a.allowedTools
  }
  if (a.effort) meta.effort = a.effort
  return `---\n${YAML.stringify(meta).trim()}\n---\n${a.prompt.trim()}\n`
}
