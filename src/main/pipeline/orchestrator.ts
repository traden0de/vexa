import type { z } from 'zod'
import type { IpcEventName, IpcEvents } from '@shared/ipc'
import {
  STAGES,
  type AgentId,
  type Bump,
  type LogEvent,
  type NewTaskInput,
  type Project,
  type QueueState,
  type RateLimitInfo,
  type Settings,
  type StageId,
  type StageState,
  type Task,
  type TaskStatus
} from '@shared/types'
import type { AgentStore } from '../agents'
import type { ClaudeCommand } from '../claude/locate'
import type { StreamEvent } from '../claude/parse'
import type { Runner } from '../claude/runner'
import type { Db } from '../db'
import { autoBranchName } from '@shared/slug'
import { GitService } from '../git'
import { applyVersion, detectVersion, nextVersion, writeChangelog } from '../version'
import * as P from './prompts'
import {
  planSchema,
  releaseSchema,
  reviewSchema,
  securitySchema,
  testSchema,
  toJsonSchema,
  type ZodSchema
} from './schemas'

export type TaskPatch = Partial<Pick<Task, 'title' | 'description' | 'type' | 'priority' | 'plan' | 'discuss' | 'branch'>>

export interface OrchestratorDeps {
  db: Db
  agents: AgentStore
  run: Runner
  locate: () => Promise<ClaudeCommand | null>
  emit: <E extends IpcEventName>(event: E, payload: IpcEvents[E]) => void
  git?: (cwd: string) => GitService
}

class StoppedError extends Error {}
class LimitError extends Error {
  constructor(readonly resetsAt?: number) {
    super('Subscription usage limit reached')
  }
}
class TaskError extends Error {
  constructor(
    readonly kind: NonNullable<Task['errorKind']>,
    message: string
  ) {
    super(message)
  }
}

const COMMIT_PREFIX: Record<Task['type'], string> = { feature: 'feat', fix: 'fix', refactor: 'refactor', breaking: 'feat!' }
const LIMIT_FALLBACK_MS = 30 * 60 * 1000

function emptyStages(): Record<StageId, StageState> {
  return { plan: '', code: '', tests: '', review: '', security: '', release: '' }
}

export class Orchestrator {
  private state: QueueState = { running: true }
  private abort?: AbortController
  private busy = false
  private resumeTimer?: ReturnType<typeof setTimeout>
  private rateLimit: RateLimitInfo | null = null
  private git: (cwd: string) => GitService

  constructor(private d: OrchestratorDeps) {
    this.git = d.git ?? ((cwd) => new GitService(cwd))
    this.recoverInterrupted()
  }

  // ---------------------------------------------------------------- queue

  getState(): QueueState {
    return { ...this.state }
  }

  getRateLimit(): RateLimitInfo | null {
    return this.rateLimit
  }

  start(): QueueState {
    this.state = { ...this.state, running: true, pausedUntil: undefined, pauseReason: undefined }
    clearTimeout(this.resumeTimer)
    this.emitState()
    this.kick()
    return this.getState()
  }

  pause(reason: QueueState['pauseReason'] = 'user'): QueueState {
    this.state = { ...this.state, running: false, pauseReason: reason }
    this.emitState()
    return this.getState()
  }

  /** Schedules a queue pass; safe to call any time. */
  kick(): void {
    setTimeout(() => void this.tick(), 0)
  }

  /** Waits until the worker is idle (used by tests). */
  async idle(): Promise<void> {
    while (this.busy) await new Promise((r) => setTimeout(r, 10))
  }

  async tick(): Promise<void> {
    if (this.busy || !this.state.running) return
    if (this.state.pausedUntil && this.state.pausedUntil > Date.now()) return
    const task = this.pickNext()
    if (!task) return
    this.busy = true
    this.abort = new AbortController()
    this.state = { ...this.state, activeTaskId: task.id, pausedUntil: undefined, pauseReason: undefined }
    this.emitState()
    try {
      await this.process(task.id)
    } finally {
      this.busy = false
      this.abort = undefined
      this.state = { ...this.state, activeTaskId: undefined }
      this.emitState()
      this.kick()
    }
  }

  private pickNext(): Task | undefined {
    const settings = this.settings()
    const all = this.d.db.listTasks()
    const blocked = new Set<number>()
    if (settings.waitForReview) for (const t of all) if (t.status === 'review') blocked.add(t.projectId)
    return all
      .filter((t) => t.status === 'queue')
      .filter((t) => !(t.planApproved && blocked.has(t.projectId)))
      .sort(
        (a, b) =>
          Number(b.planApproved) - Number(a.planApproved) || b.priority - a.priority || a.order - b.order || a.id - b.id
      )[0]
  }

  private async process(taskId: number): Promise<void> {
    const task = this.mustTask(taskId)
    const project = this.d.db.getProject(task.projectId)
    try {
      if (!project) throw new TaskError('other', 'Project not found')
      if (task.planApproved) await this.implement(task, project)
      else await this.planStage(task, project)
    } catch (e) {
      this.handleFailure(task, e)
    }
  }

  private handleFailure(task: Task, e: unknown): void {
    for (const s of STAGES) if (task.stages[s] === 'active') task.stages[s] = e instanceof LimitError ? '' : 'failed'
    task.activeStage = undefined
    if (e instanceof LimitError) {
      // Put the task back; it continues after the limit resets.
      task.status = 'queue'
      task.errorKind = 'limit'
      task.error = 'Subscription usage limit reached'
      this.save(task)
      this.log(task, { kind: 'error', text: task.error })
      const until = e.resetsAt ? e.resetsAt * 1000 + 60_000 : Date.now() + LIMIT_FALLBACK_MS
      const autoResume = this.settings().autoResume
      this.state = { ...this.state, running: autoResume, pausedUntil: until, pauseReason: 'limit' }
      this.emitState()
      clearTimeout(this.resumeTimer)
      if (autoResume) this.resumeTimer = setTimeout(() => this.start(), Math.max(0, until - Date.now()))
      return
    }
    if (e instanceof StoppedError) {
      task.status = 'failed'
      task.errorKind = 'stopped'
      task.error = 'Stopped by the user'
      this.save(task)
      this.log(task, { kind: 'sys', text: 'Stopped by the user' })
      this.pause('user')
      return
    }
    const kind = e instanceof TaskError ? e.kind : 'other'
    const message = e instanceof Error ? e.message : String(e)
    task.status = 'failed'
    task.errorKind = kind
    task.error = message
    this.save(task)
    this.log(task, { kind: 'error', text: message })
  }

  // ---------------------------------------------------------------- stages

  private async planStage(task: Task, project: Project): Promise<void> {
    const git = this.git(project.path)
    if (!(await git.isRepo())) throw new TaskError('no_git', 'The project is not a git repository. Initialize git on the Git screen.')
    task.status = 'planning'
    task.startedAt ??= Date.now()
    task.error = task.errorKind = undefined
    this.setStage(task, 'plan', 'active')
    // The planner keeps its session across question rounds and re-plans.
    const { data } = await this.runAgent(task, project, 'planner', P.planPrompt(task), planSchema, true)
    const asks = data.kind === 'questions' && (task.questionRounds ?? 0) < P.MAX_QUESTION_ROUNDS
    task.stages.plan = 'waiting'
    task.activeStage = undefined
    task.status = 'approval'
    if (asks) {
      task.questions = data.questions!.map((q, i) => ({ ...q, id: q.id || `q${i + 1}` }))
      task.questionRounds = (task.questionRounds ?? 0) + 1
      this.save(task)
      this.log(task, { kind: 'sys', text: `The planner has ${task.questions.length} question(s). Waiting for your answers.` })
      return
    }
    if (!data.plan?.trim()) throw new TaskError('claude', 'The planner returned no plan.')
    task.plan = data.plan
    task.questions = undefined
    task.replanComment = undefined
    this.save(task)
    this.log(task, { kind: 'sys', text: `Plan ready (expected bump: ${data.expectedBump ?? '?'}). Waiting for approval.` })
  }

  private async implement(task: Task, project: Project): Promise<void> {
    const git = this.git(project.path)
    if (!(await git.isRepo()) || !(await git.hasCommits()))
      throw new TaskError('no_git', 'The project needs a git repository with at least one commit.')

    const current = await git.currentBranch()
    task.branch ??= autoBranchName(task.seq, task.title)
    if (!(await git.isClean())) {
      if (current === task.branch) await git.commitAll(`wip: ${task.title} (#${task.seq})`)
      else
        throw new TaskError(
          'dirty',
          `There are uncommitted changes on "${current}". Commit or stash them on the Git screen, then retry.`
        )
    }
    task.baseBranch ??= await this.pickBase(git, current)
    const base = task.baseBranch
    if (await git.branchExists(task.branch)) {
      if (current !== task.branch) await git.checkout(task.branch)
    } else {
      await git.createBranch(task.branch, base)
      this.log(task, { kind: 'sys', text: `Created branch ${task.branch} from ${base}` })
    }

    task.status = 'progress'
    task.startedAt ??= Date.now()
    task.error = task.errorKind = undefined
    task.stages.plan = 'done'
    this.save(task)

    const max = Math.max(1, this.settings().maxIterations)
    const rework = task.reworkComment
    let findings = rework ? '' : this.collectFindings(task)
    let ok = false

    for (let i = 1; i <= max; i++) {
      task.iteration = i
      for (const s of ['code', 'tests', 'review', 'security', 'release'] as StageId[]) task.stages[s] = ''
      this.log(task, { kind: 'sys', text: `Iteration ${i}/${max}` })

      // Developer
      this.setStage(task, 'code', 'active')
      const devPrompt =
        !task.sessions.developer
          ? P.developPrompt(task, base)
          : P.fixPrompt(findings || 'Continue: make sure the approved plan is fully implemented.', i === 1 ? rework : undefined)
      await this.runAgent(task, project, 'developer', devPrompt, undefined, true)
      await git.commitAll(`${COMMIT_PREFIX[task.type]}: ${task.title} (#${task.seq})`)
      this.setStage(task, 'code', 'done')

      // Tester
      this.setStage(task, 'tests', 'active')
      const tests = (await this.runAgent(task, project, 'tester', P.testPrompt(task, base), testSchema, false)).data
      await git.commitAll(`test: cover ${task.title} (#${task.seq})`)
      task.reports.tests = tests
      if (!tests.passed) {
        this.setStage(task, 'tests', 'failed')
        findings = P.formatTestFindings(tests)
        continue
      }
      this.setStage(task, 'tests', 'done')

      const stat = await git.diffStat(base, task.branch)

      // Reviewer
      this.setStage(task, 'review', 'active')
      const review = (await this.runAgent(task, project, 'reviewer', P.reviewPrompt(task, base, stat), reviewSchema, false)).data
      task.reports.review = review
      const blocking = review.issues.filter((x) => x.severity !== 'low')
      if (review.verdict === 'changes_requested' && blocking.length) {
        this.setStage(task, 'review', 'failed')
        findings = P.formatIssues(`Code review requested changes: ${review.summary}`, blocking)
        continue
      }
      this.setStage(task, 'review', 'done')

      // Security
      this.setStage(task, 'security', 'active')
      const sec = (await this.runAgent(task, project, 'security', P.securityPrompt(task, base, stat), securitySchema, false)).data
      task.reports.security = sec
      const critical = sec.issues.filter((x) => x.severity === 'high' || x.severity === 'critical')
      if (critical.length) {
        this.setStage(task, 'security', 'failed')
        findings = P.formatIssues(`Security audit found problems: ${sec.summary}`, critical)
        continue
      }
      this.setStage(task, 'security', 'done')
      ok = true
      break
    }

    if (!ok) throw new TaskError('max_iterations', `Checks still failing after ${max} iterations.`)

    // Release (proposal only; applied on accept)
    this.setStage(task, 'release', 'active')
    const stat = await git.diffStat(base, task.branch)
    const cur = detectVersion(project.path).version
    const rel = (await this.runAgent(task, project, 'release', P.releasePrompt(task, base, stat, cur), releaseSchema, false)).data
    if (task.type === 'breaking' && rel.bump !== 'major') rel.bump = 'major'
    task.reports.release = rel
    task.currentVersion = cur
    task.bump = rel.bump
    task.version = nextVersion(cur, rel.bump)
    task.reworkComment = undefined
    this.setStage(task, 'release', 'done')
    task.activeStage = undefined
    task.status = 'review'
    this.save(task)
    this.log(task, { kind: 'sys', text: `Ready for review. Proposed version ${cur} → ${task.version} (${rel.bump}).` })
  }

  private async pickBase(git: GitService, current: string): Promise<string> {
    // Task branches never serve as a base; `veltrix/` is the prefix from before the rename.
    if (!/^(vexa|veltrix)\//.test(current) && current !== 'HEAD') return current
    for (const b of ['main', 'master', 'develop']) if (await git.branchExists(b)) return b
    return current
  }

  private collectFindings(task: Task): string {
    const r = task.reports
    const parts: string[] = []
    if (r.tests && !r.tests.passed) parts.push(P.formatTestFindings(r.tests))
    if (r.review?.verdict === 'changes_requested')
      parts.push(P.formatIssues(`Code review: ${r.review.summary}`, r.review.issues.filter((i) => i.severity !== 'low')))
    const sec = r.security?.issues.filter((i) => i.severity === 'high' || i.severity === 'critical') ?? []
    if (sec.length) parts.push(P.formatIssues('Security audit:', sec))
    return parts.join('\n\n')
  }

  // ---------------------------------------------------------------- agent runs

  private async runAgent<S extends ZodSchema | undefined>(
    task: Task,
    project: Project,
    agentId: AgentId,
    prompt: string,
    schema: S | undefined,
    resume: boolean
  ): Promise<{ text: string; data: S extends ZodSchema ? z.infer<S> : undefined }> {
    const cmd = await this.d.locate()
    if (!cmd) throw new TaskError('claude', 'Claude Code CLI not found. Install it and sign in, or set its path in Settings.')
    const def = this.d.agents.get(agentId, project.path)
    const model = def.model || this.settings().defaultModel || undefined
    this.log(task, { kind: 'sys', agent: agentId, text: `▶ ${def.name}${model ? ` · ${model}` : ''}` })

    const signal = this.abort?.signal
    const res = await this.d.run(cmd, {
      cwd: project.path,
      prompt,
      model,
      effort: def.effort,
      permissionMode: def.permissionMode,
      allowedTools: def.allowedTools,
      appendSystemPrompt: def.prompt,
      resume: resume ? task.sessions[agentId] : undefined,
      jsonSchema: schema ? toJsonSchema(schema) : undefined,
      signal,
      onEvent: (ev) => this.onStream(task, agentId, ev)
    })

    task.costUsd = Math.round((task.costUsd + res.costUsd) * 10000) / 10000
    task.durationMs += res.durationMs
    if (res.sessionId) task.sessions[agentId] = res.sessionId
    this.save(task)

    if (res.aborted || signal?.aborted) throw new StoppedError()
    if (res.limit) throw new LimitError(res.limit.resetsAt)
    if (res.isError) throw new TaskError('claude', `${def.name} failed: ${res.text || 'claude exited with an error'}`)

    let data: any
    if (schema) {
      let raw = res.structured
      if (raw === undefined) raw = extractJson(res.text)
      const parsed = schema.safeParse(raw)
      if (!parsed.success) throw new TaskError('claude', `${def.name} returned an invalid report: ${parsed.error.message}`)
      data = parsed.data
    }
    return { text: res.text, data }
  }

  private onStream(task: Task, agent: AgentId, ev: StreamEvent): void {
    switch (ev.type) {
      case 'text':
        this.log(task, { kind: 'text', agent, text: ev.text })
        break
      case 'tool_use':
        this.log(task, { kind: 'tool', agent, tool: ev.name, toolUseId: ev.id, input: ev.input })
        break
      case 'tool_result':
        this.log(task, { kind: 'tool_result', agent, toolUseId: ev.toolUseId, output: ev.output, isError: ev.isError })
        break
      case 'rate_limit':
        this.rateLimit = ev.info
        this.d.emit('ratelimit', ev.info)
        break
      case 'result':
        this.log(task, {
          kind: 'result',
          agent,
          text: `${ev.isError ? 'Error' : 'Done'} · ${(ev.durationMs / 1000).toFixed(1)}s · $${ev.costUsd.toFixed(3)}`,
          isError: ev.isError
        })
        break
    }
  }

  // ---------------------------------------------------------------- user actions

  async createTask(input: NewTaskInput): Promise<Task> {
    const now = Date.now()
    const branch = input.branch?.trim() || undefined
    if (branch) await this.validateBranch(input.projectId, branch)
    const t = this.d.db.insertTask({
      discuss: !!input.discuss,
      discussion: [],
      branch,
      branchCustom: !!branch,
      projectId: input.projectId,
      seq: this.d.db.nextSeq(input.projectId),
      title: input.title.trim(),
      description: input.description.trim(),
      type: input.type,
      priority: input.priority,
      status: input.status,
      order: now,
      stages: emptyStages(),
      iteration: 0,
      planApproved: false,
      sessions: {},
      reports: {},
      costUsd: 0,
      durationMs: 0,
      createdAt: now,
      updatedAt: now
    })
    this.d.emit('task:updated', t)
    if (t.status === 'queue') this.kick()
    return t
  }

  async updateTask(id: number, patch: TaskPatch): Promise<Task> {
    const t = this.mustTask(id)
    const { branch, ...rest } = patch
    if (branch !== undefined) {
      const name = branch.trim()
      if (name !== (t.branchCustom ? t.branch : '')) {
        if (t.baseBranch) throw new Error('The branch already exists; its name can no longer be changed.')
        if (name) await this.validateBranch(t.projectId, name, t.id)
        t.branch = name || undefined
        t.branchCustom = !!name
      }
    }
    Object.assign(t, rest)
    this.save(t)
    return t
  }

  /** Checks a user-supplied branch name: valid for git, not taken by another branch or task. */
  private async validateBranch(projectId: number, name: string, taskId?: number): Promise<void> {
    const project = this.mustProject(projectId)
    const git = this.git(project.path)
    if (!(await git.isValidBranchName(name))) throw new Error(`"${name}" is not a valid git branch name.`)
    if ((await git.isRepo()) && (await git.branchExists(name))) throw new Error(`Branch "${name}" already exists.`)
    const taken = this.d.db.listTasks(projectId).find((x) => x.id !== taskId && x.branch === name && x.status !== 'done')
    if (taken) throw new Error(`Branch "${name}" is already used by task #${taken.seq}.`)
  }

  answerQuestions(id: number, answers: Record<string, string>): Task {
    const t = this.mustTask(id)
    if (t.status !== 'approval' || !t.questions?.length) throw new Error('The task has no open questions')
    for (const q of t.questions) {
      const a = answers[q.id]?.trim()
      t.discussion.push({ question: q.question, answer: a || '(no preference — decide yourself)' })
    }
    t.questions = undefined
    t.stages.plan = ''
    t.status = 'queue'
    t.order = 0
    this.save(t)
    this.log(t, { kind: 'sys', text: 'Answers sent to the planner' })
    this.kick()
    return t
  }

  move(id: number, status: TaskStatus): Task {
    const t = this.mustTask(id)
    if (t.status === status) return t
    this.assertIdle(t)
    const allowed: Partial<Record<TaskStatus, TaskStatus[]>> = {
      backlog: ['queue', 'failed', 'approval', 'done'],
      queue: ['backlog', 'failed']
    }
    if (!allowed[status]?.includes(t.status)) throw new Error(`Cannot move a task from "${t.status}" to "${status}"`)
    if (status === 'backlog' && t.status === 'approval') {
      t.planApproved = false
      t.stages.plan = ''
      t.questions = undefined
    }
    t.status = status
    t.order = Date.now()
    t.error = t.errorKind = undefined
    this.save(t)
    if (status === 'queue') this.kick()
    return t
  }

  remove(id: number): void {
    const t = this.mustTask(id)
    this.assertIdle(t)
    this.d.db.deleteTask(id)
    this.d.emit('task:removed', { id, projectId: t.projectId })
  }

  approvePlan(id: number, plan?: string): Task {
    const t = this.mustTask(id)
    if (t.status !== 'approval') throw new Error('The plan is not waiting for approval')
    if (t.questions?.length || !(plan ?? t.plan)?.trim()) throw new Error("Answer the planner's questions first: there is no plan yet")
    if (plan !== undefined) t.plan = plan
    t.planApproved = true
    t.stages.plan = 'done'
    t.status = 'queue'
    t.order = 0
    this.save(t)
    this.log(t, { kind: 'sys', text: 'Plan approved by the user' })
    this.kick()
    return t
  }

  replan(id: number, comment: string): Task {
    const t = this.mustTask(id)
    this.assertIdle(t)
    t.replanComment = comment
    t.planApproved = false
    t.stages.plan = ''
    t.status = 'queue'
    t.order = 0
    this.save(t)
    this.log(t, { kind: 'sys', text: `Re-plan requested: ${comment}` })
    this.kick()
    return t
  }

  rework(id: number, comment: string): Task {
    const t = this.mustTask(id)
    if (t.status !== 'review' && t.status !== 'failed') throw new Error('Only reviewed or failed tasks can be reworked')
    t.reworkComment = comment
    t.planApproved = true
    t.status = 'queue'
    t.order = 0
    t.error = t.errorKind = undefined
    this.save(t)
    this.log(t, { kind: 'sys', text: `Rework requested: ${comment}` })
    this.kick()
    return t
  }

  retry(id: number): Task {
    const t = this.mustTask(id)
    if (t.status !== 'failed') throw new Error('Only failed tasks can be retried')
    t.status = 'queue'
    t.error = t.errorKind = undefined
    t.order = 0
    this.save(t)
    this.kick()
    return t
  }

  shutdown(): void {
    this.abort?.abort()
  }

  stop(id: number): void {
    if (this.state.activeTaskId === id) this.abort?.abort()
  }

  async reject(id: number): Promise<Task> {
    const t = this.mustTask(id)
    this.assertIdle(t)
    const project = this.mustProject(t.projectId)
    if (t.branch) {
      const git = this.git(project.path)
      if (await git.branchExists(t.branch)) {
        const current = await git.currentBranch()
        if (current === t.branch) {
          if (!(await git.isClean())) throw new Error('The task branch has uncommitted changes. Commit or stash them first.')
          await git.checkout(t.baseBranch ?? (await this.pickBase(git, current)))
        }
        await git.deleteBranch(t.branch, true)
        this.log(t, { kind: 'sys', text: `Deleted branch ${t.branch}` })
      }
    }
    Object.assign(t, {
      status: 'backlog',
      stages: emptyStages(),
      planApproved: false,
      // A name the user chose is kept for the next attempt.
      branch: t.branchCustom ? t.branch : undefined,
      baseBranch: undefined,
      questions: undefined,
      questionRounds: 0,
      sessions: {},
      reports: {},
      iteration: 0,
      bump: undefined,
      version: undefined,
      error: undefined,
      errorKind: undefined,
      reworkComment: undefined
    } satisfies Partial<Task>)
    this.save(t)
    return t
  }

  async accept(id: number, bump: Bump): Promise<Task> {
    const t = this.mustTask(id)
    if (t.status !== 'review' || !t.branch) throw new Error('The task is not ready for review')
    this.assertIdle(t)
    const project = this.mustProject(t.projectId)
    const git = this.git(project.path)
    const current = await git.currentBranch()
    if (!(await git.isClean())) {
      if (current === t.branch) await git.commitAll(`chore: finalize ${t.title} (#${t.seq})`)
      else throw new Error(`There are uncommitted changes on "${current}". Commit or stash them first.`)
    }
    const base = t.baseBranch ?? 'main'
    await git.checkout(base)
    const merge = await git.mergeNoFf(t.branch, `Merge #${t.seq}: ${t.title}`)
    if (!merge.ok) {
      t.errorKind = 'conflict'
      t.error = `Merge conflict with ${base}${merge.conflicts.length ? `: ${merge.conflicts.join(', ')}` : ''}. Use "Request rework" so the developer merges ${base} into the branch.`
      this.save(t)
      this.log(t, { kind: 'error', text: t.error })
      throw new Error(t.error)
    }

    t.mergeCommit = (await git.git.revparse(['HEAD'])).trim()
    const cur = detectVersion(project.path).version
    const next = nextVersion(cur, bump)
    applyVersion(project.path, next)
    writeChangelog(
      project.path,
      next,
      t.reports.release?.changelog ?? {
        added: t.type === 'feature' || t.type === 'breaking' ? [t.title] : [],
        changed: t.type === 'refactor' ? [t.title] : [],
        fixed: t.type === 'fix' ? [t.title] : [],
        removed: [],
        security: []
      }
    )
    await git.commitAll(`chore(release): v${next}`)
    const tag = `v${next}`
    if ((await git.tags()).some((x) => x.name === tag)) this.log(t, { kind: 'error', text: `Tag ${tag} already exists — not tagged` })
    else await git.tag(tag, `Release ${tag}: ${t.title}`)
    try {
      await git.deleteBranch(t.branch)
    } catch {
      // keep the branch if git refuses; it is merged anyway
    }

    t.status = 'done'
    t.bump = bump
    t.currentVersion = cur
    t.version = next
    t.error = t.errorKind = undefined
    this.save(t)
    this.log(t, { kind: 'sys', text: `Merged into ${base}, released ${tag}` })
    this.kick()
    return t
  }

  // ---------------------------------------------------------------- helpers

  private recoverInterrupted(): void {
    for (const t of this.d.db.listTasks()) {
      if (t.status !== 'planning' && t.status !== 'progress') continue
      for (const s of STAGES) if (t.stages[s] === 'active') t.stages[s] = 'failed'
      t.activeStage = undefined
      t.status = 'failed'
      t.errorKind = 'stopped'
      t.error = 'Interrupted: Vexa was closed while the task was running'
      this.save(t)
    }
  }

  private setStage(task: Task, stage: StageId, state: StageState): void {
    task.stages[stage] = state
    task.activeStage = state === 'active' ? stage : task.activeStage === stage ? undefined : task.activeStage
    this.save(task)
  }

  private save(task: Task): void {
    this.d.db.saveTask(task)
    this.d.emit('task:updated', task)
  }

  private log(task: Task, e: Omit<LogEvent, 'taskId' | 'ts'>): void {
    const saved = this.d.db.addEvent({ ...e, taskId: task.id, ts: Date.now() })
    this.d.emit('task:event', saved)
  }

  private mustTask(id: number): Task {
    const t = this.d.db.getTask(id)
    if (!t) throw new Error(`Task ${id} not found`)
    return t
  }

  private mustProject(id: number): Project {
    const p = this.d.db.getProject(id)
    if (!p) throw new Error('Project not found')
    return p
  }

  private assertIdle(t: Task): void {
    if (this.state.activeTaskId === t.id) throw new Error('The task is running. Stop it first.')
  }

  private settings(): Settings {
    return this.d.db.getSettings()
  }

  private emitState(): void {
    this.d.emit('queue:state', this.getState())
  }
}

/** Last-resort: find a JSON object in free text (```json fences or the last {...}). */
export function extractJson(text: string): unknown {
  const fence = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].pop()
  const candidates = [fence?.[1], text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)]
  for (const c of candidates) {
    if (!c?.trim()) continue
    try {
      return JSON.parse(c)
    } catch {
      // try next
    }
  }
  return undefined
}
