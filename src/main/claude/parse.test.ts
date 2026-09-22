import { describe, expect, it } from 'vitest'
import { isUsageLimit, parseStreamLine, summarizeInput } from './parse'
import { parseCmdShim } from './locate'
import { buildArgs } from './runner'

const line = (o: unknown): string => JSON.stringify(o)

describe('parseStreamLine', () => {
  it('parses init, text, tool use and tool result', () => {
    expect(parseStreamLine(line({ type: 'system', subtype: 'init', session_id: 's1', model: 'm' }))).toEqual([
      { type: 'init', sessionId: 's1', model: 'm' }
    ])
    const a = parseStreamLine(
      line({
        type: 'assistant',
        message: {
          content: [
            { type: 'thinking', thinking: '' },
            { type: 'text', text: 'Hello' },
            { type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'npm   test' } },
            { type: 'tool_use', id: 't2', name: 'StructuredOutput', input: { a: 1 } }
          ]
        }
      })
    )
    expect(a).toEqual([
      { type: 'text', text: 'Hello' },
      { type: 'tool_use', id: 't1', name: 'Bash', input: 'npm test' }
    ])
    const r = parseStreamLine(
      line({
        type: 'user',
        message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: [{ type: 'text', text: 'ok' }], is_error: false }] }
      })
    )
    expect(r).toEqual([{ type: 'tool_result', toolUseId: 't1', output: 'ok', isError: false }])
  })

  it('skips subagent messages and garbage', () => {
    expect(
      parseStreamLine(line({ type: 'assistant', parent_tool_use_id: 'x', message: { content: [{ type: 'text', text: 'hi' }] } }))
    ).toEqual([])
    expect(parseStreamLine('not json')).toEqual([])
    expect(parseStreamLine('')).toEqual([])
  })

  it('parses result with structured output', () => {
    const [ev] = parseStreamLine(
      line({
        type: 'result',
        subtype: 'success',
        is_error: false,
        result: '{}',
        structured_output: { v: 1 },
        total_cost_usd: 0.1,
        duration_ms: 1500,
        session_id: 's'
      })
    )
    expect(ev).toMatchObject({ type: 'result', isError: false, structured: { v: 1 }, costUsd: 0.1, durationMs: 1500, sessionId: 's' })
  })

  it('parses rate limit events', () => {
    const [ev] = parseStreamLine(
      line({
        type: 'rate_limit_event',
        rate_limit_info: {
          status: 'allowed',
          resetsAt: 100,
          unifiedWindows: { five_hour: { utilization: 0.4 }, seven_day: { utilization: 0.58 } }
        }
      })
    )
    expect(ev).toMatchObject({ type: 'rate_limit', info: { status: 'allowed', resetsAt: 100, fiveHour: 0.4, sevenDay: 0.58 } })
  })
})

describe('helpers', () => {
  it('summarizes tool input', () => {
    expect(summarizeInput('Read', { file_path: 'src/a.ts' })).toBe('src/a.ts')
    expect(summarizeInput('Grep', { pattern: 'foo', path: 'src' })).toBe('foo src')
  })

  it('detects usage limit text', () => {
    expect(isUsageLimit('Claude usage limit reached. Your limit will reset at 5pm')).toBe(true)
    expect(isUsageLimit('Tests failed')).toBe(false)
  })

  it('parses npm cmd shims', () => {
    const shim = '@ECHO off\n"%dp0%\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe"   %*\n'
    expect(parseCmdShim(shim, 'C:\\npm')).toMatch(/claude-code[\\/]bin[\\/]claude\.exe$/)
  })

  it('builds CLI args without putting the prompt on the command line', () => {
    const args = buildArgs({
      cwd: '.',
      prompt: 'secret prompt',
      permissionMode: 'plan',
      model: 'opus',
      allowedTools: ['Read', 'Grep'],
      resume: 'abc',
      jsonSchema: '{}'
    })
    expect(args).toEqual(
      expect.arrayContaining(['-p', '--output-format', 'stream-json', '--permission-mode', 'plan', '--model', 'opus', '--allowedTools', 'Read,Grep', '--resume', 'abc', '--json-schema', '{}'])
    )
    expect(args).not.toContain('secret prompt')
  })
})
