export type TaskStatus =
  | 'backlog'
  | 'queue'
  | 'planning'
  | 'approval'
  | 'progress'
  | 'review'
  | 'done'
  | 'failed'

export const TASK_COLUMNS: TaskStatus[] = [
  'backlog',
  'queue',
  'planning',
  'approval',
  'progress',
  'review',
  'done',
  'failed'
]

export type TaskType = 'feature' | 'fix' | 'refactor' | 'breaking'
export type Priority = 1 | 2 | 3
export type Bump = 'patch' | 'minor' | 'major'

export type StageId = 'plan' | 'code' | 'tests' | 'review' | 'security' | 'release'
export const STAGES: StageId[] = ['plan', 'code', 'tests', 'review', 'security', 'release']
/** '' = not started, waiting = needs the user */
export type StageState = '' | 'active' | 'done' | 'failed' | 'waiting'

export type AgentId = 'planner' | 'developer' | 'tester' | 'reviewer' | 'security' | 'release'
export const AGENT_IDS: AgentId[] = ['planner', 'developer', 'tester', 'reviewer', 'security', 'release']
export const STAGE_AGENT: Record<StageId, AgentId> = {
  plan: 'planner',
  code: 'developer',
  tests: 'tester',
  review: 'reviewer',
  security: 'security',
  release: 'release'
}

export interface Project {
  id: number
  path: string
  name: string
  lastOpened: number
}

export type Severity = 'low' | 'medium' | 'high' | 'critical'

export interface Issue {
  severity: Severity
  file?: string
  line?: number
  message: string
}

export interface TestReport {
  passed: boolean
  testCommand?: string
  summary: string
  total?: number
  failed?: number
  coverage?: number
  failures: { name: string; message: string }[]
}

export interface ReviewReport {
  verdict: 'approve' | 'changes_requested'
  summary: string
  issues: Issue[]
}

export interface SecurityReport {
  summary: string
  issues: Issue[]
}

export interface ChangelogEntry {
  added: string[]
  changed: string[]
  fixed: string[]
  removed: string[]
  security: string[]
}

export interface ReleaseReport {
  bump: Bump
  reason: string
  changelog: ChangelogEntry
}

export interface PlanQuestion {
  id: string
  question: string
  options: { label: string; description?: string }[]
  multiSelect: boolean
  allowCustom: boolean
}

export interface DiscussionEntry {
  question: string
  answer: string
}

export interface Task {
  id: number
  projectId: number
  seq: number
  title: string
  description: string
  type: TaskType
  priority: Priority
  status: TaskStatus
  order: number
  stages: Record<StageId, StageState>
  /** Currently running stage, if any */
  activeStage?: StageId
  iteration: number
  plan?: string
  planApproved: boolean
  /** Ask the planner to discuss options before writing the plan. */
  discuss: boolean
  /** Questions from the planner waiting for the user. */
  questions?: PlanQuestion[]
  /** Answered questions, oldest first. */
  discussion: DiscussionEntry[]
  /** How many times the planner has asked questions for this task. */
  questionRounds?: number
  replanComment?: string
  reworkComment?: string
  branch?: string
  /** The branch name was typed by the user (kept on reject). */
  branchCustom?: boolean
  baseBranch?: string
  /** Merge commit on the base branch once the task is accepted (the task branch is deleted then). */
  mergeCommit?: string
  sessions: Partial<Record<AgentId, string>>
  reports: {
    tests?: TestReport
    review?: ReviewReport
    security?: SecurityReport
    release?: ReleaseReport
  }
  currentVersion?: string
  bump?: Bump
  version?: string
  costUsd: number
  durationMs: number
  error?: string
  errorKind?: 'dirty' | 'stopped' | 'limit' | 'max_iterations' | 'conflict' | 'no_git' | 'claude' | 'other'
  createdAt: number
  updatedAt: number
  startedAt?: number
}

export interface NewTaskInput {
  projectId: number
  title: string
  description: string
  type: TaskType
  priority: Priority
  status: 'backlog' | 'queue'
  discuss: boolean
  /** Custom branch name; generated when empty. */
  branch?: string
}

export type LogKind = 'sys' | 'text' | 'tool' | 'tool_result' | 'error' | 'result'

export interface LogEvent {
  id?: number
  taskId: number
  ts: number
  agent?: AgentId
  kind: LogKind
  text?: string
  tool?: string
  toolUseId?: string
  input?: string
  output?: string
  isError?: boolean
}

export type PermissionMode = 'plan' | 'acceptEdits' | 'default' | 'dontAsk' | 'bypassPermissions' | 'auto'

export interface AgentDef {
  id: AgentId
  name: string
  description: string
  model: string
  effort?: string
  permissionMode: PermissionMode
  allowedTools: string[]
  prompt: string
  source: 'builtin' | 'user' | 'project'
}

export interface Settings {
  lang: 'ru' | 'en'
  theme: 'system' | 'light' | 'dark'
  maxIterations: number
  defaultModel: string
  autoResume: boolean
  waitForReview: boolean
  claudePath: string
  lastProjectId?: number
  tourSeen: { welcome: boolean; board: boolean }
}

export interface RateLimitInfo {
  status: string
  resetsAt?: number
  fiveHour?: number
  sevenDay?: number
  updatedAt: number
}

export interface QueueState {
  running: boolean
  activeTaskId?: number
  pausedUntil?: number
  pauseReason?: 'user' | 'limit' | 'error'
}

export interface EnvStatus {
  claude: { found: boolean; path?: string; version?: string }
  auth: { loggedIn: boolean; method?: string; detail?: string }
  git: { found: boolean; version?: string }
  node: { found: boolean; version?: string }
}

export interface GitFile {
  path: string
  index: string
  workingDir: string
}

export interface GitStatus {
  isRepo: boolean
  branch?: string
  ahead: number
  behind: number
  tracking?: string
  files: GitFile[]
}

export interface GitBranch {
  name: string
  current: boolean
  commit: string
  label: string
}

export interface GitCommit {
  hash: string
  date: string
  message: string
  author: string
  refs: string
  isMerge: boolean
}

export interface DiffFile {
  path: string
  status: string
  additions: number
  deletions: number
}

export interface VersionInfo {
  current: string
  files: string[]
  tags: { name: string; date: string }[]
}
