import type { Issue, Task, TestReport } from '@shared/types'

function taskHeader(t: Task): string {
  return [
    `# Task #${t.seq}: ${t.title}`,
    `Type: ${t.type}`,
    '',
    t.description.trim() || '(no description)',
    '',
    LANGUAGE_RULE
  ].join('\n')
}

/**
 * Keeps plans and reports in the user's language (code and commit messages follow the project),
 * and stops agents from touching the version, which Vexa applies on accept.
 */
const LANGUAGE_RULE =
  'Language: write every human-readable text you produce (plan, summaries, findings, changelog lines) in the same language as the task title and description above.\n' +
  'Versioning: do not change the project version or CHANGELOG.md and do not treat an unchanged version as a problem — Vexa bumps the version, writes the changelog and tags the release when the user accepts the task.'

/** How many rounds of questions the planner may ask before it must write the plan. */
export const MAX_QUESTION_ROUNDS = 3

export function planPrompt(t: Task): string {
  const parts = [taskHeader(t)]
  if (t.discussion.length) {
    parts.push(
      '## Answers from the user',
      t.discussion.map((d) => `- Q: ${d.question}\n  A: ${d.answer}`).join('\n')
    )
  }
  if (t.plan && t.replanComment) {
    parts.push('## Previous plan', t.plan, '## Feedback from the user — revise the plan accordingly', t.replanComment)
  }
  parts.push(questionRule(t), 'Do not modify any files.')
  return parts.join('\n\n')
}

function questionRule(t: Task): string {
  const rounds = t.questionRounds ?? 0
  if (rounds >= MAX_QUESTION_ROUNDS)
    return 'Questions are no longer allowed: return kind "plan" with the implementation plan now.'
  const how =
    'Each question has a short id, the question text, 2–4 concrete options (label + one-line description of the trade-off), ' +
    'multiSelect when several options can be combined, and allowCustom: true. Ask at most 4 questions at a time.'
  if (t.discuss && t.discussion.length === 0)
    return (
      'The user asked to discuss this task before planning. Return kind "questions": ask 1–4 clarifying questions ' +
      'and/or offer alternative implementation approaches to choose from. ' +
      how
    )
  return (
    'If a decision is genuinely ambiguous and would change the implementation (and you cannot infer it from the task, ' +
    'the code or CLAUDE.md), return kind "questions". Otherwise — which is the normal case — return kind "plan" with the ' +
    'implementation plan. ' +
    how
  )
}

export function developPrompt(t: Task, base: string): string {
  return [
    taskHeader(t),
    '## Approved plan',
    t.plan ?? '(no plan)',
    `You are on branch \`${t.branch}\` created from \`${base}\`. Implement the plan and commit your work.`
  ].join('\n\n')
}

export function fixPrompt(findings: string, reworkComment?: string): string {
  const parts: string[] = []
  if (reworkComment) parts.push('## Rework requested by the user', reworkComment)
  if (findings) parts.push('## Findings to fix', findings)
  parts.push('Fix all of the above on the current branch and commit.')
  return parts.join('\n\n')
}

export function testPrompt(t: Task, base: string): string {
  return [
    taskHeader(t),
    `The implementation is on branch \`${t.branch}\` (base \`${base}\`). See \`git diff ${base}...HEAD\`.`,
    'Make sure the change is covered by tests, run the whole test suite and report the result.'
  ].join('\n\n')
}

export function reviewPrompt(t: Task, base: string, stat: string): string {
  return [
    taskHeader(t),
    '## Approved plan',
    t.plan ?? '(no plan)',
    `## Diff to review\nRun \`git diff ${base}...HEAD\` to see it. Summary:\n\n\`\`\`\n${stat.trim()}\n\`\`\``,
    'Review the change and report your verdict.'
  ].join('\n\n')
}

export function securityPrompt(t: Task, base: string, stat: string): string {
  return [
    taskHeader(t),
    `## Diff to audit\nRun \`git diff ${base}...HEAD\` to see it. Summary:\n\n\`\`\`\n${stat.trim()}\n\`\`\``,
    'Audit the change and report the issues you find.'
  ].join('\n\n')
}

export function releasePrompt(t: Task, base: string, stat: string, current: string): string {
  return [
    taskHeader(t),
    `Current version: ${current}. Task type declared by the user: ${t.type}.`,
    `## Diff\nRun \`git diff ${base}...HEAD\` to see it. Summary:\n\n\`\`\`\n${stat.trim()}\n\`\`\``,
    'Decide the version bump and write the CHANGELOG entries.'
  ].join('\n\n')
}

export function formatTestFindings(r: TestReport): string {
  const lines = [`Tests failed: ${r.summary}`]
  for (const f of r.failures) lines.push(`- ${f.name}: ${f.message}`)
  return lines.join('\n')
}

export function formatIssues(title: string, issues: Issue[]): string {
  return [
    title,
    ...issues.map((i) => `- [${i.severity}] ${i.file ? `${i.file}${i.line ? `:${i.line}` : ''} — ` : ''}${i.message}`)
  ].join('\n')
}
