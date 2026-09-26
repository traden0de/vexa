import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { simpleGit, type SimpleGit } from 'simple-git'
import type { DiffFile, GitBranch, GitCommit, GitStatus } from '@shared/types'
export { slugify } from '@shared/slug'

export class GitService {
  readonly git: SimpleGit

  constructor(readonly cwd: string) {
    this.git = simpleGit({ baseDir: cwd, maxConcurrentProcesses: 1, config: ['core.quotepath=false'] })
  }

  async isRepo(): Promise<boolean> {
    try {
      return (await this.git.revparse(['--show-toplevel'])).trim().length > 0
    } catch {
      return false
    }
  }

  async init(): Promise<void> {
    await this.git.init()
    const hasCommits = await this.hasCommits()
    if (!hasCommits) {
      await this.git.add(['-A'])
      await this.git.commit('chore: initial commit', undefined, { '--allow-empty': null })
    }
  }

  async hasCommits(): Promise<boolean> {
    try {
      await this.git.revparse(['HEAD'])
      return true
    } catch {
      return false
    }
  }

  async status(): Promise<GitStatus> {
    if (!(await this.isRepo())) return { isRepo: false, ahead: 0, behind: 0, files: [] }
    const s = await this.git.status()
    return {
      isRepo: true,
      branch: s.current ?? undefined,
      ahead: s.ahead,
      behind: s.behind,
      tracking: s.tracking ?? undefined,
      files: s.files.map((f) => ({ path: f.path, index: f.index, workingDir: f.working_dir }))
    }
  }

  async isClean(): Promise<boolean> {
    return (await this.git.status()).isClean()
  }

  async currentBranch(): Promise<string> {
    return (await this.git.revparse(['--abbrev-ref', 'HEAD'])).trim()
  }

  async branchExists(name: string): Promise<boolean> {
    const b = await this.git.branchLocal()
    return b.all.includes(name)
  }

  async checkout(name: string): Promise<void> {
    await this.git.checkout(name)
  }

  async createBranch(name: string, from: string, checkout = true): Promise<void> {
    if (checkout) await this.git.checkout(['-b', name, from])
    else await this.git.branch([name, from])
  }

  async isValidBranchName(name: string): Promise<boolean> {
    try {
      await this.git.raw(['check-ref-format', '--branch', name])
      return !name.startsWith('-')
    } catch {
      return false
    }
  }

  async deleteBranch(name: string, force = false): Promise<void> {
    await this.git.branch([force ? '-D' : '-d', name])
  }

  /** Stages everything and commits if there is anything to commit. Returns true if a commit was made. */
  async commitAll(message: string): Promise<boolean> {
    await this.git.add(['-A'])
    const s = await this.git.status()
    if (s.staged.length === 0 && s.isClean()) return false
    await this.git.commit(message)
    return true
  }

  async commitFiles(message: string, files: string[]): Promise<void> {
    if (files.length) await this.git.add(files)
    await this.git.commit(message)
  }

  /** Merges `branch` into the current branch with a merge commit. Aborts and returns false on conflict. */
  async mergeNoFf(branch: string, message: string): Promise<{ ok: true } | { ok: false; conflicts: string[] }> {
    try {
      await this.git.merge(['--no-ff', '-m', message, branch])
      return { ok: true }
    } catch (e: any) {
      const conflicts: string[] = e?.git?.conflicts?.map((c: any) => c.file).filter(Boolean) ?? []
      try {
        await this.git.merge(['--abort'])
      } catch {
        // nothing to abort
      }
      return { ok: false, conflicts }
    }
  }

  /**
   * Merges `branch` into the current branch and keeps a conflicted merge in place
   * so someone can resolve it. Returns the conflicted files (empty on a clean merge).
   */
  async mergeKeepConflicts(branch: string, message: string): Promise<string[]> {
    try {
      await this.git.merge(['--no-ff', '-m', message, branch])
      return []
    } catch (e) {
      const files = await this.conflictedFiles()
      if (!files.length) throw e
      return files
    }
  }

  /** True while a merge is in progress (MERGE_HEAD exists). */
  async isMerging(): Promise<boolean> {
    try {
      await this.git.revparse(['-q', '--verify', 'MERGE_HEAD'])
      return true
    } catch {
      return false
    }
  }

  async conflictedFiles(): Promise<string[]> {
    const raw = await this.git.raw(['diff', '--name-only', '--diff-filter=U'])
    return raw.split('\n').map((s) => s.trim()).filter(Boolean)
  }

  async tag(name: string, message: string): Promise<void> {
    await this.git.addAnnotatedTag(name, message)
  }

  async diffFiles(base: string, branch: string): Promise<DiffFile[]> {
    const range = `${base}...${branch}`
    const [numstat, names] = await Promise.all([
      this.git.raw(['diff', '--numstat', range]),
      this.git.raw(['diff', '--name-status', range])
    ])
    const statusByPath = new Map<string, string>()
    for (const line of names.split('\n').filter(Boolean)) {
      const parts = line.split('\t')
      statusByPath.set(parts[parts.length - 1], parts[0][0])
    }
    return numstat
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [a, d, ...rest] = line.split('\t')
        const path = rest.join('\t').replace(/^.*\{.* => (.*)\}.*$/, '$1')
        return {
          path,
          status: statusByPath.get(path) ?? 'M',
          additions: a === '-' ? 0 : Number(a),
          deletions: d === '-' ? 0 : Number(d)
        }
      })
  }

  async diffStat(base: string, branch: string): Promise<string> {
    return this.git.raw(['diff', '--stat', `${base}...${branch}`])
  }

  /** File content at a ref, or '' when it does not exist there. */
  async show(ref: string, file: string): Promise<string> {
    try {
      return await this.git.show([`${ref}:${file.replace(/\\/g, '/')}`])
    } catch {
      return ''
    }
  }

  readWorking(file: string): string {
    const p = join(this.cwd, file)
    return existsSync(p) ? readFileSync(p, 'utf8') : ''
  }

  async mergeBase(a: string, b: string): Promise<string> {
    return (await this.git.raw(['merge-base', a, b])).trim()
  }

  async branches(): Promise<GitBranch[]> {
    const b = await this.git.branchLocal()
    return Object.values(b.branches).map((x) => ({
      name: x.name,
      current: x.current,
      commit: x.commit,
      label: x.label
    }))
  }

  async log(max = 50): Promise<GitCommit[]> {
    if (!(await this.hasCommits())) return []
    const raw = await this.git.raw([
      'log',
      `--max-count=${max}`,
      '--date=iso-strict',
      '--pretty=format:%H%x1f%ad%x1f%s%x1f%an%x1f%D%x1f%P%x1e'
    ])
    return raw
      .split('\x1e')
      .map((r) => r.trim())
      .filter(Boolean)
      .map((r) => {
        const [hash, date, message, author, refs, parents] = r.split('\x1f')
        return { hash, date, message, author, refs, isMerge: (parents ?? '').trim().split(' ').length > 1 }
      })
  }

  async tags(): Promise<{ name: string; date: string }[]> {
    const raw = await this.git.raw(['tag', '--sort=-creatordate', '--format=%(refname:short)%09%(creatordate:short)'])
    return raw
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        const [name, date] = l.split('\t')
        return { name, date }
      })
  }

  async pull(): Promise<string> {
    const r = await this.git.pull()
    return `${r.summary.changes} changes, +${r.summary.insertions} −${r.summary.deletions}`
  }

  async push(): Promise<string> {
    const branch = await this.currentBranch()
    await this.git.push(['-u', 'origin', branch, '--follow-tags'])
    return branch
  }

  async fetch(): Promise<void> {
    await this.git.fetch()
  }

  async stash(): Promise<void> {
    await this.git.stash(['push', '-u', '-m', 'vexa: stash'])
  }

  async stashPop(): Promise<void> {
    await this.git.stash(['pop'])
  }

  async stagedOrWorkingDiff(maxChars = 60000): Promise<string> {
    const staged = await this.git.diff(['--cached'])
    const diff = staged.trim() ? staged : await this.git.diff()
    return diff.length > maxChars ? diff.slice(0, maxChars) + '\n… (truncated)' : diff
  }
}
