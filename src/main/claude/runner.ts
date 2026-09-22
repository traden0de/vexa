import { spawn, execFile } from 'node:child_process'
import { createInterface } from 'node:readline'
import type { PermissionMode, RateLimitInfo } from '@shared/types'
import type { ClaudeCommand } from './locate'
import { isUsageLimit, parseStreamLine, type StreamEvent } from './parse'

export interface RunOptions {
  cwd: string
  prompt: string
  model?: string
  effort?: string
  permissionMode: PermissionMode
  allowedTools?: string[]
  appendSystemPrompt?: string
  resume?: string
  jsonSchema?: string
  signal?: AbortSignal
  onEvent?: (e: StreamEvent) => void
}

export interface RunResult {
  sessionId?: string
  text: string
  structured?: unknown
  costUsd: number
  durationMs: number
  isError: boolean
  aborted: boolean
  limit?: { resetsAt?: number }
  stderr: string
}

export type Runner = (cmd: ClaudeCommand, opts: RunOptions) => Promise<RunResult>

export function buildArgs(opts: RunOptions): string[] {
  const args = [
    '-p',
    '--output-format',
    'stream-json',
    '--verbose',
    '--permission-mode',
    opts.permissionMode,
    // Nobody can answer permission prompts in headless mode: deny instead of hanging.
    '--permission-prompts',
    'none'
  ]
  if (opts.model) args.push('--model', opts.model)
  if (opts.effort) args.push('--effort', opts.effort)
  if (opts.allowedTools?.length) args.push('--allowedTools', opts.allowedTools.join(','))
  if (opts.appendSystemPrompt) args.push('--append-system-prompt', opts.appendSystemPrompt)
  if (opts.resume) args.push('--resume', opts.resume)
  if (opts.jsonSchema) args.push('--json-schema', opts.jsonSchema)
  return args
}

/** Spawns `claude -p` with the prompt on stdin and streams parsed events. */
export const runClaude: Runner = (cmd, opts) =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd.command, [...cmd.prefix, ...buildArgs(opts)], {
      cwd: opts.cwd,
      env: { ...process.env, CLAUDE_CODE_ENTRYPOINT: 'veltrix' },
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    })

    let result: Extract<StreamEvent, { type: 'result' }> | undefined
    let sessionId: string | undefined
    let lastLimit: RateLimitInfo | undefined
    let stderr = ''
    let aborted = false

    const onAbort = (): void => {
      aborted = true
      killTree(child.pid)
    }
    if (opts.signal) {
      if (opts.signal.aborted) onAbort()
      else opts.signal.addEventListener('abort', onAbort, { once: true })
    }

    const rl = createInterface({ input: child.stdout })
    rl.on('line', (line) => {
      for (const ev of parseStreamLine(line)) {
        if (ev.type === 'init') sessionId = ev.sessionId
        if (ev.type === 'result') result = ev
        if (ev.type === 'rate_limit') lastLimit = ev.info
        opts.onEvent?.(ev)
      }
    })
    child.stderr.on('data', (d) => {
      stderr += d.toString()
      if (stderr.length > 20000) stderr = stderr.slice(-20000)
    })
    child.on('error', (err) => {
      opts.signal?.removeEventListener('abort', onAbort)
      reject(err)
    })
    child.on('close', (code) => {
      opts.signal?.removeEventListener('abort', onAbort)
      const text = result?.text ?? ''
      const isError = aborted || !result || result.isError || (code !== 0 && code !== null)
      const limited =
        !aborted &&
        isError &&
        (lastLimit?.status === 'rejected' || isUsageLimit(text) || isUsageLimit(stderr))
      resolve({
        sessionId: result?.sessionId ?? sessionId,
        text: text || (isError ? stderr.trim().slice(-2000) : ''),
        structured: result?.structured,
        costUsd: result?.costUsd ?? 0,
        durationMs: result?.durationMs ?? 0,
        isError,
        aborted,
        limit: limited ? { resetsAt: lastLimit?.resetsAt } : undefined,
        stderr
      })
    })

    child.stdin.on('error', () => {
      // Process died before reading stdin; the close handler reports it.
    })
    child.stdin.end(opts.prompt)
  })

export function killTree(pid?: number): void {
  if (!pid) return
  if (process.platform === 'win32') {
    execFile('taskkill', ['/pid', String(pid), '/T', '/F'], () => {})
  } else {
    try {
      process.kill(pid, 'SIGTERM')
    } catch {
      // already gone
    }
  }
}
