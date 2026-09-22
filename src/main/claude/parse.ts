import type { RateLimitInfo } from '@shared/types'

/** Normalized event produced from one line of `claude -p --output-format stream-json`. */
export type StreamEvent =
  | { type: 'init'; sessionId: string; model?: string }
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: string }
  | { type: 'tool_result'; toolUseId: string; output: string; isError: boolean }
  | { type: 'rate_limit'; info: RateLimitInfo }
  | {
      type: 'result'
      sessionId?: string
      isError: boolean
      text: string
      structured?: unknown
      costUsd: number
      durationMs: number
      subtype?: string
    }

const MAX_OUTPUT = 6000

export function parseStreamLine(line: string): StreamEvent[] {
  const trimmed = line.trim()
  if (!trimmed.startsWith('{')) return []
  let o: any
  try {
    o = JSON.parse(trimmed)
  } catch {
    return []
  }
  return parseStreamObject(o)
}

export function parseStreamObject(o: any): StreamEvent[] {
  switch (o?.type) {
    case 'system':
      if (o.subtype === 'init') return [{ type: 'init', sessionId: o.session_id, model: o.model }]
      return []
    case 'assistant': {
      // Messages from subagents carry parent_tool_use_id; we show only the main thread.
      if (o.parent_tool_use_id) return []
      const out: StreamEvent[] = []
      for (const block of o.message?.content ?? []) {
        if (block.type === 'text' && block.text?.trim()) out.push({ type: 'text', text: block.text })
        else if (block.type === 'tool_use' && block.name !== 'StructuredOutput')
          out.push({ type: 'tool_use', id: block.id, name: block.name, input: summarizeInput(block.name, block.input) })
      }
      return out
    }
    case 'user': {
      if (o.parent_tool_use_id) return []
      const content = o.message?.content
      if (!Array.isArray(content)) return []
      const out: StreamEvent[] = []
      for (const block of content) {
        if (block.type !== 'tool_result') continue
        out.push({
          type: 'tool_result',
          toolUseId: block.tool_use_id,
          output: truncate(stringifyContent(block.content)),
          isError: !!block.is_error
        })
      }
      return out
    }
    case 'rate_limit_event': {
      const i = o.rate_limit_info ?? {}
      const w = i.unifiedWindows ?? {}
      return [
        {
          type: 'rate_limit',
          info: {
            status: i.status ?? 'unknown',
            resetsAt: i.resetsAt,
            fiveHour: w.five_hour?.utilization,
            sevenDay: w.seven_day?.utilization,
            updatedAt: Date.now()
          }
        }
      ]
    }
    case 'result':
      return [
        {
          type: 'result',
          sessionId: o.session_id,
          isError: !!o.is_error || (o.subtype && o.subtype !== 'success'),
          text: typeof o.result === 'string' ? o.result : '',
          structured: o.structured_output,
          costUsd: Number(o.total_cost_usd) || 0,
          durationMs: Number(o.duration_ms) || 0,
          subtype: o.subtype
        }
      ]
    default:
      return []
  }
}

/** A one-line human summary of tool input, e.g. the file path or the command. */
export function summarizeInput(name: string, input: any): string {
  if (!input || typeof input !== 'object') return ''
  const pick =
    input.command ??
    (name === 'Grep' || name === 'Glob' ? input.pattern : undefined) ??
    input.file_path ??
    input.path ??
    input.pattern ??
    input.url ??
    input.query ??
    input.description ??
    input.prompt
  if (typeof pick === 'string') {
    const extra = name === 'Grep' && input.path ? `  ${input.path}` : ''
    return oneLine(pick + extra)
  }
  return oneLine(JSON.stringify(input))
}

function stringifyContent(c: unknown): string {
  if (typeof c === 'string') return c
  if (Array.isArray(c))
    return c
      .map((b: any) => (b?.type === 'text' ? b.text : b?.type === 'image' ? '[image]' : JSON.stringify(b)))
      .join('\n')
  return c == null ? '' : JSON.stringify(c)
}

function oneLine(s: string): string {
  const l = s.replace(/\s+/g, ' ').trim()
  return l.length > 200 ? l.slice(0, 197) + '…' : l
}

function truncate(s: string): string {
  return s.length > MAX_OUTPUT ? s.slice(0, MAX_OUTPUT) + `\n… (${s.length - MAX_OUTPUT} more chars)` : s
}

/** True when a failed result looks like the subscription usage limit. */
export function isUsageLimit(text: string): boolean {
  return /usage limit|rate limit|limit reached|limit will reset|out of (extra )?usage/i.test(text)
}
