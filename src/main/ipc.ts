import { dialog, ipcMain, nativeImage, shell, type BrowserWindow } from 'electron'
import { execFile } from 'node:child_process'
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { promisify } from 'node:util'
import type { IpcChannel, IpcContract } from '@shared/ipc'
import { attentionKind, type EnvStatus, type Project } from '@shared/types'
import type { AgentStore } from './agents'
import { claudeAuth, claudeVersion, resetClaudeLocation, type ClaudeCommand } from './claude/locate'
import { runClaude } from './claude/runner'
import type { Db } from './db'
import { GitService } from './git'
import type { Orchestrator } from './pipeline/orchestrator'
import type { Updater } from './updater'
import { commitMessageSchema, toJsonSchema } from './pipeline/schemas'
import { detectVersion } from './version'

const exec = promisify(execFile)

/** Height of the window-buttons strip; matches `.topbar` in styles.css. */
export const TITLE_BAR_HEIGHT = 56

interface Ctx {
  db: Db
  agents: AgentStore
  orchestrator: Orchestrator
  locate: () => Promise<ClaudeCommand | null>
  getWindow: () => BrowserWindow | null
  updater: Updater
}

type Handler<C extends IpcChannel> = (
  ...args: Parameters<IpcContract[C]>
) => ReturnType<IpcContract[C]> | Promise<ReturnType<IpcContract[C]>>

function handle<C extends IpcChannel>(channel: C, fn: Handler<C>): void {
  ipcMain.handle(channel, (_e, ...args) => (fn as (...a: unknown[]) => unknown)(...args))
}

export function registerIpc(ctx: Ctx): void {
  const { db, agents, orchestrator: orch } = ctx

  const project = (id: number): Project => {
    const p = db.getProject(id)
    if (!p) throw new Error('Project not found')
    return p
  }
  const git = (projectId: number): GitService => new GitService(project(projectId).path)
  const needClaude = async (): Promise<ClaudeCommand> => {
    const c = await ctx.locate()
    if (!c) throw new Error('Claude Code CLI not found. Install it or set the path in Settings.')
    return c
  }

  // ---- environment
  handle('env:check', async (): Promise<EnvStatus> => {
    const cmd = await ctx.locate()
    const [version, auth, gitV] = await Promise.all([
      cmd ? claudeVersion(cmd) : Promise.resolve(undefined),
      cmd ? claudeAuth(cmd) : Promise.resolve({ loggedIn: false }),
      exec('git', ['--version']).then(
        (r) => r.stdout.trim().replace(/^git version\s*/, ''),
        () => undefined
      )
    ])
    const nodeV = await exec('node', ['--version']).then(
      (r) => r.stdout.trim(),
      () => undefined
    )
    return {
      claude: { found: !!cmd, path: cmd?.path, version },
      auth,
      git: { found: !!gitV, version: gitV },
      node: { found: !!nodeV, version: nodeV }
    }
  })

  // ---- projects
  handle('projects:list', () => db.listProjects().filter((p) => existsSync(p.path)))
  handle('projects:open', async (path) => {
    let dir = path
    if (!dir) {
      const win = ctx.getWindow()
      const r = win
        ? await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
        : await dialog.showOpenDialog({ properties: ['openDirectory'] })
      if (r.canceled || !r.filePaths[0]) return null
      dir = r.filePaths[0]
    }
    if (!existsSync(dir) || !statSync(dir).isDirectory()) throw new Error(`Folder not found: ${dir}`)
    const p = db.upsertProject(dir)
    db.setSettings({ lastProjectId: p.id })
    return p
  })
  handle('projects:clone', async (url) => {
    const win = ctx.getWindow()
    const opts = { title: 'Clone into…', properties: ['openDirectory' as const, 'createDirectory' as const] }
    const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    if (r.canceled || !r.filePaths[0]) return null
    const name = basename(url.replace(/\.git$/, '').replace(/\/+$/, '')) || 'repo'
    const target = join(r.filePaths[0], name)
    if (existsSync(target)) throw new Error(`Folder already exists: ${target}`)
    await exec('git', ['clone', '--', url, target], { timeout: 10 * 60 * 1000 })
    const p = db.upsertProject(target)
    db.setSettings({ lastProjectId: p.id })
    return p
  })
  handle('projects:remove', (id) => db.removeProject(id))

  // ---- tasks
  handle('tasks:list', (projectId) => db.listTasks(projectId))
  handle('tasks:create', (input) => orch.createTask(input))
  handle('tasks:update', (id, patch) => orch.updateTask(id, patch))
  handle('tasks:move', (id, status) => orch.move(id, status))
  handle('tasks:remove', (id) => orch.remove(id))
  handle('tasks:events', (taskId) => db.listEvents(taskId))
  handle('tasks:answer', (id, answers) => orch.answerQuestions(id, answers))
  handle('tasks:approvePlan', (id, plan) => orch.approvePlan(id, plan))
  handle('tasks:replan', (id, comment) => orch.replan(id, comment))
  handle('tasks:accept', (id, bump) => orch.accept(id, bump))
  handle('tasks:rework', (id, comment) => orch.rework(id, comment))
  handle('tasks:resolveConflict', (id) => orch.resolveConflict(id))
  handle('tasks:images', (id) => orch.taskImages(id))
  handle('tasks:attention', () => db.listTasks().filter((t) => attentionKind(t) !== null))
  handle('tasks:reject', (id) => orch.reject(id))
  handle('tasks:retry', (id) => orch.retry(id))
  handle('tasks:stop', (id) => orch.stop(id))
  /** Diff range of a task: its branch while it exists, the merge commit after accept. */
  const taskRange = async (id: number): Promise<{ g: GitService; base: string; head: string } | null> => {
    const t = db.getTask(id)
    if (!t) return null
    const g = git(t.projectId)
    if (t.mergeCommit) return { g, base: `${t.mergeCommit}^1`, head: t.mergeCommit }
    if (!t.branch || !t.baseBranch || !(await g.branchExists(t.branch))) return null
    return { g, base: t.baseBranch, head: t.branch }
  }
  handle('tasks:diffFiles', async (id) => {
    const r = await taskRange(id)
    return r ? r.g.diffFiles(r.base, r.head) : []
  })
  handle('tasks:fileVersions', async (id, file) => {
    const r = await taskRange(id)
    if (!r) return { original: '', modified: '' }
    const base = await r.g.mergeBase(r.base, r.head)
    return { original: await r.g.show(base, file), modified: await r.g.show(r.head, file) }
  })

  // ---- window
  let badge = 0
  handle('window:focus', () => {
    const w = ctx.getWindow()
    if (!w) return
    if (w.isMinimized()) w.restore()
    w.show()
    w.focus()
  })
  handle('window:titleBar', (color, symbolColor) => {
    const w = ctx.getWindow()
    if (!w || process.platform === 'darwin') return
    w.setTitleBarOverlay({ color, symbolColor, height: TITLE_BAR_HEIGHT })
  })
  handle('window:badge', (count, png) => {
    const w = ctx.getWindow()
    if (!w) return
    w.setOverlayIcon(count > 0 && png ? nativeImage.createFromDataURL(png) : null, count > 0 ? String(count) : '')
    if (count > badge && !w.isFocused()) w.flashFrame(true)
    badge = count
  })

  // ---- queue
  handle('queue:state', () => orch.getState())
  handle('queue:start', () => orch.start())
  handle('queue:pause', () => orch.pause('user'))
  handle('ratelimit:get', () => orch.getRateLimit())

  // ---- git
  handle('git:status', (pid) => git(pid).status())
  handle('git:init', (pid) => git(pid).init())
  handle('git:commit', (pid, message, files) => git(pid).commitFiles(message, files))
  handle('git:generateMessage', async (pid) => {
    const g = git(pid)
    const diff = await g.stagedOrWorkingDiff()
    if (!diff.trim()) throw new Error('Nothing to describe: there are no changes.')
    const status = await g.status()
    const res = await runClaude(await needClaude(), {
      cwd: project(pid).path,
      model: 'haiku',
      permissionMode: 'plan',
      allowedTools: [],
      jsonSchema: toJsonSchema(commitMessageSchema),
      prompt:
        'Write a git commit message in Conventional Commits format for the changes below. ' +
        'First line ≤ 72 chars; add a short body only if it helps. Do not use tools.\n\n' +
        `Files:\n${status.files.map((f) => `${f.workingDir}${f.index} ${f.path}`).join('\n')}\n\nDiff:\n${diff}`
    })
    const parsed = commitMessageSchema.safeParse(res.structured)
    if (!parsed.success) throw new Error(res.text || 'Could not generate a commit message')
    return parsed.data.message.trim()
  })
  handle('git:branches', (pid) => git(pid).branches())
  handle('git:log', (pid) => git(pid).log(60))
  handle('git:checkout', (pid, branch) => git(pid).checkout(branch))
  handle('git:createBranch', async (pid, name, from, checkout) => {
    const g = git(pid)
    const branch = name.trim()
    if (!(await g.isValidBranchName(branch))) throw new Error(`"${branch}" is not a valid git branch name.`)
    if (await g.branchExists(branch)) throw new Error(`Branch "${branch}" already exists.`)
    await g.createBranch(branch, from, checkout)
  })
  handle('git:deleteBranch', async (pid, name, force) => {
    const active = db
      .listTasks(pid)
      .find((t) => t.branch === name && t.status !== 'done' && t.status !== 'backlog')
    if (active) throw new Error(`Branch "${name}" belongs to task #${active.seq}. Reject the task instead.`)
    await git(pid).deleteBranch(name, force)
  })
  handle('git:pull', (pid) => git(pid).pull())
  handle('git:push', (pid) => git(pid).push())
  handle('git:fetch', (pid) => git(pid).fetch())
  handle('git:stash', (pid) => git(pid).stash())
  handle('git:stashPop', (pid) => git(pid).stashPop())
  handle('git:fileDiff', async (pid, file) => {
    const g = git(pid)
    return { original: (await g.hasCommits()) ? await g.show('HEAD', file) : '', modified: g.readWorking(file) }
  })

  // ---- agents
  handle('agents:list', (pid) => agents.list(pid ? project(pid).path : undefined))
  handle('agents:save', (agent, scope, pid) => {
    const path = pid ? project(pid).path : undefined
    agents.save(agent, scope, path)
    return agents.list(path)
  })
  handle('agents:reset', (id, scope, pid) => {
    const path = pid ? project(pid).path : undefined
    agents.reset(id, scope, path)
    return agents.list(path)
  })

  // ---- project files
  const claudeMd = (pid: number): string => join(project(pid).path, 'CLAUDE.md')
  handle('project:readClaudeMd', (pid) => (existsSync(claudeMd(pid)) ? readFileSync(claudeMd(pid), 'utf8') : null))
  handle('project:writeClaudeMd', (pid, content) => writeFileSync(claudeMd(pid), content, 'utf8'))
  handle('project:runInit', async (pid) => {
    const res = await runClaude(await needClaude(), {
      cwd: project(pid).path,
      permissionMode: 'acceptEdits',
      allowedTools: ['Read', 'Glob', 'Grep', 'Write', 'Edit', 'Bash(git log:*)', 'Bash(ls:*)'],
      prompt: '/init'
    })
    if (res.isError) throw new Error(res.text || '/init failed')
    return existsSync(claudeMd(pid)) ? readFileSync(claudeMd(pid), 'utf8') : null
  })
  handle('project:versions', async (pid) => {
    const p = project(pid)
    const v = detectVersion(p.path)
    const g = new GitService(p.path)
    const tags = (await g.isRepo()) ? await g.tags() : []
    return { current: v.version, files: v.files, tags }
  })
  handle('project:changelog', (pid) => {
    const f = join(project(pid).path, 'CHANGELOG.md')
    return existsSync(f) ? readFileSync(f, 'utf8') : null
  })

  // ---- settings
  handle('settings:get', () => db.getSettings())
  handle('settings:set', (patch) => {
    if ('claudePath' in patch) resetClaudeLocation()
    return db.setSettings(patch)
  })

  handle('update:state', () => ctx.updater.getState())
  handle('update:check', () => ctx.updater.check())
  handle('update:download', () => ctx.updater.download())
  handle('update:install', () => ctx.updater.install())

  handle('shell:openPath', (path) => {
    void shell.openPath(path)
  })
}
