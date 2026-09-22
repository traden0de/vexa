import { z } from 'zod'

/**
 * Structured outputs requested from agents via `claude --json-schema`.
 * The JSON Schema is passed to the CLI; the zod schema validates what comes back.
 */

const issue = z.object({
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  file: z.string().optional(),
  line: z.number().optional(),
  message: z.string()
})

export const planSchema = z.object({
  plan: z.string(),
  expectedBump: z.enum(['patch', 'minor', 'major'])
})

export const testSchema = z.object({
  passed: z.boolean(),
  testCommand: z.string().optional(),
  summary: z.string(),
  total: z.number().optional(),
  failed: z.number().optional(),
  coverage: z.number().optional(),
  failures: z.array(z.object({ name: z.string(), message: z.string() })).default([])
})

export const reviewSchema = z.object({
  verdict: z.enum(['approve', 'changes_requested']),
  summary: z.string(),
  issues: z.array(issue).default([])
})

export const securitySchema = z.object({
  summary: z.string(),
  issues: z.array(issue).default([])
})

const list = z.array(z.string()).default([])
export const releaseSchema = z.object({
  bump: z.enum(['patch', 'minor', 'major']),
  reason: z.string(),
  changelog: z.object({ added: list, changed: list, fixed: list, removed: list, security: list })
})

export const commitMessageSchema = z.object({ message: z.string() })

export type ZodSchema = z.ZodType

/** Converts a zod schema to a JSON Schema string for the CLI flag. */
export function toJsonSchema(schema: ZodSchema): string {
  const json = z.toJSONSchema(schema, { io: 'input' }) as Record<string, unknown>
  delete json.$schema
  return JSON.stringify(json)
}
