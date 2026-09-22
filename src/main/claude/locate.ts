import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import { promisify } from 'node:util'

const run = promisify(execFile)
const isWin = process.platform === 'win32'

export interface ClaudeCommand {
  /** Executable to spawn directly (no shell). */
  command: string
  /** Arguments to put before the CLI arguments (e.g. a script path for node). */
  prefix: string[]
  path: string
}

let cached: { key: string; cmd: ClaudeCommand | null } | undefined

/**
 * Finds the user's installed `claude` CLI. On Windows npm installs a `.cmd` shim,
 * which cannot be spawned without a shell, so we resolve the real target from it.
 */
export async function locateClaude(override?: string): Promise<ClaudeCommand | null> {
  const key = override ?? ''
  if (cached && cached.key === key) return cached.cmd
  const cmd = await resolve(override)
  cached = { key, cmd }
  return cmd
}

export function resetClaudeLocation(): void {
  cached = undefined
}

async function resolve(override?: string): Promise<ClaudeCommand | null> {
  const candidates: string[] = []
  if (override) candidates.push(override)
  try {
    const { stdout } = await run(isWin ? 'where' : 'which', isWin ? ['claude'] : ['-a', 'claude'])
    candidates.push(...stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean))
  } catch {
    // not on PATH
  }
  candidates.push(join(homedir(), '.local', 'bin', isWin ? 'claude.exe' : 'claude'))
  if (!isWin) candidates.push('/usr/local/bin/claude', '/opt/homebrew/bin/claude')

  // Prefer real executables over shims.
  const ordered = [
    ...candidates.filter((c) => /\.exe$/i.test(c)),
    ...candidates.filter((c) => !/\.exe$/i.test(c))
  ]
  for (const c of ordered) {
    const cmd = fromCandidate(c)
    if (cmd) return cmd
  }
  return null
}

function fromCandidate(path: string): ClaudeCommand | null {
  if (!existsSync(path)) return null
  if (!isWin) return { command: path, prefix: [], path }
  if (/\.exe$/i.test(path)) return { command: path, prefix: [], path }
  const shim = /\.(cmd|bat)$/i.test(path) ? path : existsSync(path + '.cmd') ? path + '.cmd' : null
  if (!shim) return null
  const target = parseCmdShim(readFileSync(shim, 'utf8'), dirname(shim))
  if (!target || !existsSync(target)) return null
  if (/\.exe$/i.test(target)) return { command: target, prefix: [], path: target }
  if (/\.(c|m)?js$/i.test(target)) return { command: 'node', prefix: [target], path: target }
  return null
}

/** Extracts the target of an npm-generated .cmd shim ("%dp0%\node_modules\...\cli.js"). */
export function parseCmdShim(content: string, dir: string): string | null {
  const m = content.match(/"%(?:~dp0|dp0)%\\?([^"]+\.(?:exe|c?js|mjs))"/i)
  if (!m) return null
  return join(dir, m[1])
}

export async function claudeVersion(cmd: ClaudeCommand): Promise<string | undefined> {
  try {
    const { stdout } = await run(cmd.command, [...cmd.prefix, '--version'], { timeout: 15000 })
    return stdout.trim().split(/\s+/)[0]
  } catch {
    return undefined
  }
}

export async function claudeAuth(cmd: ClaudeCommand): Promise<{ loggedIn: boolean; method?: string; detail?: string }> {
  try {
    const { stdout } = await run(cmd.command, [...cmd.prefix, 'auth', 'status'], { timeout: 20000 })
    const j = JSON.parse(stdout)
    return {
      loggedIn: !!j.loggedIn,
      method: j.authMethod,
      detail: j.subscriptionType ?? j.orgName ?? j.email ?? undefined
    }
  } catch (e: any) {
    // `auth status` exits non-zero when logged out but still prints JSON.
    try {
      const j = JSON.parse(e?.stdout ?? '')
      return { loggedIn: !!j.loggedIn, method: j.authMethod }
    } catch {
      return { loggedIn: false }
    }
  }
}
