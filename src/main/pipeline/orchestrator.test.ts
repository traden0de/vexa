import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import type { NewTaskInput, Task } from '@shared/types'
import { AgentStore } from '../agents'
import type { RunOptions, RunResult, Runner } from '../claude/runner'
import { Db } from '../db'
import { GitService } from '../git'
import { Orchestrator } from './orchestrator'

const git = (cwd: string, ...args: string[]): string => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()

function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'vx-repo-'))
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.email', 'test@example.com')
  git(dir, 'config', 'user.name', 'Test')
  writeFileSync(join(dir, 'package.json'), '{\n  "name": "demo",\n  "version": "1.0.0"\n}\n')
  writeFileSync(join(dir, 'index.js'), 'module.exports = {}\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'init')
  return dir
}

type Agent = 'planner' | 'developer' | 'tester' | 'reviewer' | 'security' | 'release'

function agentOf(o: RunOptions): Agent {
  const p = o.appendSystemPrompt ?? ''
  if (p.includes('the Planner')) return 'planner'
  if (p.includes('the Developer')) return 'developer'
  if (p.includes('the Tester')) return 'tester'
  if (p.includes('the Code Reviewer')) return 'reviewer'
  if (p.includes('the Security Auditor')) return 'security'
  return 'release'
}

interface Script {
  questionsFirst?: boolean
  testsPassOn?: number
  limitOn?: Agent
}

function fakeRunner(script: Script, calls: { agent: Agent; opts: RunOptions }[]): Runner {
  let testRuns = 0
  return async (_cmd, opts): Promise<RunResult> => {
    const agent = agentOf(opts)
    calls.push({ agent, opts })
    const ok = (structured?: unknown): RunResult => ({
      sessionId: `sess-${agent}`,
      text: 'done',
      structured,
      costUsd: 0.01,
      durationMs: 100,
      isError: false,
      aborted: false,
      stderr: ''
    })
    if (script.limitOn === agent) {
      return { ...ok(), isError: true, text: 'Claude usage limit reached', limit: { resetsAt: Math.floor(Date.now() / 1000) + 3600 } }
    }
    switch (agent) {
      case 'planner':
        if (script.questionsFirst && !opts.prompt.includes('Answers from the user'))
          return ok({
            kind: 'questions',
            questions: [
              { id: 'q1', question: 'Which style?', options: [{ label: 'Arrow' }, { label: 'Function' }], multiSelect: false, allowCustom: true }
            ]
          })
        return ok({ kind: 'plan', plan: '## Changes\n- add sum()', expectedBump: 'minor' })
      case 'developer':
        writeFileSync(join(opts.cwd, 'sum.js'), `module.exports = (a, b) => a + b // ${calls.length}\n`)
        return ok()
      case 'tester': {
        testRuns++
        const passed = testRuns >= (script.testsPassOn ?? 1)
        writeFileSync(join(opts.cwd, 'sum.test.js'), `// test run ${testRuns}\n`)
        return ok({ passed, summary: passed ? 'all green' : '1 failing', total: 3, failed: passed ? 0 : 1, failures: passed ? [] : [{ name: 'sum', message: 'expected 3' }] })
      }
      case 'reviewer':
        return ok({ verdict: 'approve', summary: 'LGTM', issues: [{ severity: 'low', message: 'nit' }] })
      case 'security':
        return ok({ summary: 'clean', issues: [] })
      case 'release':
        return ok({ bump: 'minor', reason: 'new function', changelog: { added: ['sum() helper'], changed: [], fixed: [], removed: [], security: [] } })
    }
  }
}

describe('Orchestrator', () => {
  let db: Db
  let repo: string
  let projectId: number
  const agents = new AgentStore(resolve('resources/agents'), join(tmpdir(), 'vx-no-user-agents'))

  beforeEach(() => {
    db = new Db(':memory:')
    repo = makeRepo()
    projectId = db.upsertProject(repo).id
  })

  const make = (script: Script, calls: { agent: Agent; opts: RunOptions }[] = []): Orchestrator =>
    new Orchestrator({
      db,
      agents,
      run: fakeRunner(script, calls),
      locate: async () => ({ command: 'claude', prefix: [], path: 'claude' }),
      emit: () => {},
      attachments: mkdtempSync(join(tmpdir(), 'vx-att-'))
    })

  const settle = async (o: Orchestrator): Promise<void> => {
    for (let i = 0; i < 50; i++) {
      await o.tick()
      await o.idle()
      await new Promise((r) => setTimeout(r, 5))
      if (!db.listTasks().some((t) => t.status === 'queue')) return
    }
  }

  const newTask = (o: Orchestrator, extra: Partial<NewTaskInput> = {}): Promise<Task> =>
    o.createTask({ projectId, title: 'Add sum function', description: 'sum(a, b)', type: 'feature', priority: 2, status: 'queue', discuss: false, ...extra })

  it('runs the full cycle: plan → approval → fix loop → review → accept with version bump', async () => {
    const calls: { agent: Agent; opts: RunOptions }[] = []
    const o = make({ testsPassOn: 2 }, calls)
    const t = await newTask(o)
    await settle(o)

    let task = db.getTask(t.id)!
    expect(task.status).toBe('approval')
    expect(task.plan).toContain('add sum()')
    expect(calls[0].opts.permissionMode).toBe('plan')

    o.approvePlan(t.id)
    await settle(o)
    task = db.getTask(t.id)!
    expect(task.error).toBeUndefined()
    expect(task.status).toBe('review')
    expect(task.iteration).toBe(2)
    expect(calls.map((c) => c.agent)).toEqual([
      'planner',
      'developer', 'tester',
      'developer', 'tester', 'reviewer', 'security',
      'release'
    ])
    // The fix iteration resumes the developer session and carries the failures.
    const secondDev = calls[3].opts
    expect(secondDev.resume).toBe('sess-developer')
    expect(secondDev.prompt).toContain('expected 3')
    expect(task.version).toBe('1.1.0')
    expect(git(repo, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe(task.branch)
    expect(git(repo, 'status', '--porcelain')).toBe('')

    task = await o.accept(t.id, 'minor')
    expect(task.status).toBe('done')
    expect(git(repo, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('main')
    expect(git(repo, 'tag')).toBe('v1.1.0')
    expect(JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8')).version).toBe('1.1.0')
    expect(readFileSync(join(repo, 'CHANGELOG.md'), 'utf8')).toContain('- sum() helper')
    expect(existsSync(join(repo, 'sum.js'))).toBe(true)
    expect(git(repo, 'branch', '--list', task.branch!)).toBe('')
    expect(git(repo, 'log', '-1', '--pretty=%s')).toBe('chore(release): v1.1.0')
    // The diff stays viewable after the branch is gone.
    const files = await new GitService(repo).diffFiles(`${task.mergeCommit}^1`, task.mergeCommit!)
    expect(files.map((f) => f.path).sort()).toEqual(['sum.js', 'sum.test.js'])
  })

  it('fails after the iteration limit', async () => {
    db.setSettings({ maxIterations: 2 })
    const o = make({ testsPassOn: 99 })
    const t = await newTask(o)
    await settle(o)
    o.approvePlan(t.id)
    await settle(o)
    const task = db.getTask(t.id)!
    expect(task.status).toBe('failed')
    expect(task.errorKind).toBe('max_iterations')
    expect(task.stages.tests).toBe('failed')
  })

  it('refuses to start on a dirty working tree', async () => {
    const o = make({})
    const t = await newTask(o)
    await settle(o)
    writeFileSync(join(repo, 'index.js'), 'changed\n')
    o.approvePlan(t.id)
    await settle(o)
    const task = db.getTask(t.id)!
    expect(task.status).toBe('failed')
    expect(task.errorKind).toBe('dirty')
    expect(git(repo, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('main')
  })

  it('pauses the queue on the usage limit and keeps the task queued', async () => {
    const o = make({ limitOn: 'planner' })
    const t = await newTask(o)
    await o.tick()
    await o.idle()
    const task = db.getTask(t.id)!
    expect(task.status).toBe('queue')
    expect(task.errorKind).toBe('limit')
    expect(o.getState().pauseReason).toBe('limit')
    expect(o.getState().pausedUntil).toBeGreaterThan(Date.now())
  })

  it('reject deletes the branch and returns the task to backlog', async () => {
    const o = make({})
    const t = await newTask(o)
    await settle(o)
    o.approvePlan(t.id)
    await settle(o)
    const branch = db.getTask(t.id)!.branch!
    const task = await o.reject(t.id)
    expect(task.status).toBe('backlog')
    expect(git(repo, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('main')
    expect(git(repo, 'branch', '--list', branch)).toBe('')
  })

  it('waits for review before implementing the next task in the same project', async () => {
    const o = make({})
    const a = await newTask(o)
    await settle(o)
    o.approvePlan(a.id)
    await settle(o)
    expect(db.getTask(a.id)!.status).toBe('review')

    const b = await newTask(o)
    await settle(o)
    o.approvePlan(b.id)
    await o.tick()
    await o.idle()
    expect(db.getTask(b.id)!.status).toBe('queue')

    await o.accept(a.id, 'minor')
    await settle(o)
    expect(db.getTask(b.id)!.status).toBe('review')
    expect(db.getTask(b.id)!.currentVersion).toBe('1.1.0')
  })

  it('asks questions when discussing, then plans with the answers in the resumed session', async () => {
    const calls: { agent: Agent; opts: RunOptions }[] = []
    const o = make({ questionsFirst: true }, calls)
    const t = await newTask(o, { discuss: true })
    await settle(o)

    let task = db.getTask(t.id)!
    expect(task.status).toBe('approval')
    expect(task.questions?.[0].question).toBe('Which style?')
    expect(task.plan).toBeUndefined()
    expect(calls[0].opts.prompt).toContain('asked to discuss')
    expect(() => o.approvePlan(t.id)).toThrow(/questions/)

    // re-create the situation to test answering
    const t2 = await newTask(o, { discuss: true, title: 'Second' })
    await settle(o)
    o.answerQuestions(t2.id, { q1: 'Arrow' })
    task = db.getTask(t2.id)!
    expect(task.questions).toBeUndefined()
    expect(task.discussion).toEqual([{ question: 'Which style?', answer: 'Arrow' }])
    await settle(o)
    task = db.getTask(t2.id)!
    expect(task.status).toBe('approval')
    expect(task.plan).toContain('add sum()')
    const last = calls.filter((c) => c.agent === 'planner').at(-1)!.opts
    expect(last.prompt).toContain('A: Arrow')
    expect(last.resume).toBe('sess-planner')
  })

  it('only asks when needed and stops asking after the round limit', async () => {
    const calls: { agent: Agent; opts: RunOptions }[] = []
    const o = make({}, calls)
    const t = await newTask(o)
    await settle(o)
    expect(db.getTask(t.id)!.questions).toBeUndefined()
    expect(calls[0].opts.prompt).toContain('Otherwise')
    expect(calls[0].opts.prompt).not.toContain('asked to discuss')

    const task = db.getTask(t.id)!
    task.questionRounds = 3
    db.saveTask(task)
    o.replan(t.id, 'again')
    await settle(o)
    expect(calls.at(-1)!.opts.prompt).toContain('Questions are no longer allowed')
  })

  it('uses a custom branch name and validates it', async () => {
    const o = make({})
    await expect(newTask(o, { branch: 'bad..name' })).rejects.toThrow(/not a valid/)
    await expect(newTask(o, { branch: 'main' })).rejects.toThrow(/already exists/)
    const t = await newTask(o, { branch: 'feature/sum' })
    await settle(o)
    o.approvePlan(t.id)
    await settle(o)
    expect(db.getTask(t.id)!.branch).toBe('feature/sum')
    expect(git(repo, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('feature/sum')
    // Rejecting keeps the chosen name for the next attempt.
    expect((await o.reject(t.id)).branch).toBe('feature/sum')
  })

  it('bumps waiting tasks after an accept and resolves a merge conflict', async () => {
    db.setSettings({ waitForReview: false })
    const calls: { agent: Agent; opts: RunOptions }[] = []
    const o = make({}, calls)
    const a = await newTask(o)
    const b = await newTask(o, { title: 'Other sum' })
    await settle(o)
    o.approvePlan(a.id)
    o.approvePlan(b.id)
    await settle(o)
    expect(db.getTask(a.id)!.version).toBe('1.1.0')
    expect(db.getTask(b.id)!.version).toBe('1.1.0')

    await o.accept(a.id, 'minor')
    let tb = db.getTask(b.id)!
    expect(tb.currentVersion).toBe('1.1.0')
    expect(tb.version).toBe('1.2.0')

    // Both tasks created sum.js: merging the second one conflicts.
    const conflicted = await o.accept(b.id, 'minor')
    expect(conflicted.status).toBe('review')
    expect(conflicted.errorKind).toBe('conflict')
    expect(conflicted.conflicts).toContain('sum.js')
    expect(git(repo, 'status', '--porcelain')).toBe('')

    o.resolveConflict(b.id)
    await settle(o)
    tb = db.getTask(b.id)!
    expect(tb.error).toBeUndefined()
    expect(tb.status).toBe('review')
    expect(tb.syncBase).toBeUndefined()
    const dev = calls.filter((c) => c.agent === 'developer').at(-1)!.opts
    expect(dev.prompt).toContain('## Merge conflicts')
    expect(dev.prompt).toContain('- sum.js')
    expect(git(repo, 'log', '-3', '--pretty=%s', tb.branch!)).toContain(`Merge main into ${tb.branch}`)

    tb = await o.accept(b.id, 'minor')
    expect(tb.status).toBe('done')
    expect(git(repo, 'tag', '-l', 'v1.2.0')).toBe('v1.2.0')
  })

  it('stores attached images and hands them to the agents', async () => {
    const calls: { agent: Agent; opts: RunOptions }[] = []
    const o = make({}, calls)
    const png = 'data:image/png;base64,' + Buffer.from('fake-png').toString('base64')
    const t = await newTask(o, { images: [{ name: 'shot.png', data: png }] })
    expect(t.images).toEqual(['image-1.png'])
    await settle(o)
    const plan = calls[0].opts
    expect(plan.addDirs).toHaveLength(1)
    expect(plan.prompt).toContain('## Attached images')
    expect(plan.prompt).toContain(join(plan.addDirs![0], 'image-1.png'))
    expect(o.taskImages(t.id)).toEqual([{ name: 'image-1.png', dataUrl: png }])

    // Keep the first, add a second; unsupported types are refused.
    const updated = await o.updateTask(t.id, { images: [{ name: 'image-1.png' }, { name: 'b.jpg', data: 'data:image/jpeg;base64,AAAA' }] })
    expect(updated.images).toEqual(['image-1.png', 'image-2.jpg'])
    await expect(o.updateTask(t.id, { images: [{ name: 'x.svg', data: 'data:image/svg+xml;base64,AA==' }] })).rejects.toThrow(/Unsupported/)
    const removed = await o.updateTask(t.id, { images: [{ name: 'image-2.jpg' }] })
    expect(removed.images).toEqual(['image-2.jpg'])
    expect(existsSync(join(plan.addDirs![0], 'image-1.png'))).toBe(false)
  })

  it('creates a branch without switching to it', async () => {
    const g = new GitService(repo)
    expect(await g.isValidBranchName('feat/ok')).toBe(true)
    expect(await g.isValidBranchName('no spaces')).toBe(false)
    await g.createBranch('feat/ok', 'main', false)
    expect(git(repo, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('main')
    expect(await g.branchExists('feat/ok')).toBe(true)
  })
})
