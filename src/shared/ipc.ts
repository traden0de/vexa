import type {
  AgentDef,
  AgentId,
  Bump,
  DiffFile,
  EnvStatus,
  GitBranch,
  GitCommit,
  GitStatus,
  LogEvent,
  NewTaskInput,
  Project,
  QueueState,
  RateLimitInfo,
  Settings,
  Task,
  TaskStatus,
  UpdateState,
  VersionInfo
} from './types'

/** Request/response channels: renderer -> main (ipcRenderer.invoke). */
export interface IpcContract {
  'env:check': () => EnvStatus

  'projects:list': () => Project[]
  'projects:open': (path?: string) => Project | null
  'projects:clone': (url: string) => Project | null
  'projects:remove': (id: number) => void

  'tasks:list': (projectId: number) => Task[]
  'tasks:create': (input: NewTaskInput) => Task
  'tasks:update': (
    id: number,
    patch: Partial<Pick<Task, 'title' | 'description' | 'type' | 'priority' | 'plan' | 'discuss' | 'branch'>>
  ) => Task
  /** Answers keyed by question id. */
  'tasks:answer': (id: number, answers: Record<string, string>) => Task
  'tasks:move': (id: number, status: TaskStatus) => Task
  'tasks:remove': (id: number) => void
  'tasks:events': (taskId: number) => LogEvent[]
  'tasks:approvePlan': (id: number, plan?: string) => Task
  'tasks:replan': (id: number, comment: string) => Task
  'tasks:accept': (id: number, bump: Bump) => Task
  'tasks:rework': (id: number, comment: string) => Task
  'tasks:reject': (id: number) => Task
  'tasks:retry': (id: number) => Task
  'tasks:stop': (id: number) => void
  'tasks:diffFiles': (id: number) => DiffFile[]
  'tasks:fileVersions': (id: number, file: string) => { original: string; modified: string }

  'queue:state': () => QueueState
  'queue:start': () => QueueState
  'queue:pause': () => QueueState
  'ratelimit:get': () => RateLimitInfo | null

  'git:status': (projectId: number) => GitStatus
  'git:init': (projectId: number) => void
  'git:commit': (projectId: number, message: string, files: string[]) => void
  'git:generateMessage': (projectId: number) => string
  'git:branches': (projectId: number) => GitBranch[]
  'git:log': (projectId: number) => GitCommit[]
  'git:checkout': (projectId: number, branch: string) => void
  'git:createBranch': (projectId: number, name: string, from: string, checkout: boolean) => void
  'git:deleteBranch': (projectId: number, name: string, force: boolean) => void
  'git:pull': (projectId: number) => string
  'git:push': (projectId: number) => string
  'git:fetch': (projectId: number) => void
  'git:stash': (projectId: number) => void
  'git:stashPop': (projectId: number) => void
  'git:fileDiff': (projectId: number, file: string) => { original: string; modified: string }

  'agents:list': (projectId?: number) => AgentDef[]
  'agents:save': (agent: AgentDef, scope: 'user' | 'project', projectId?: number) => AgentDef[]
  'agents:reset': (id: AgentId, scope: 'user' | 'project', projectId?: number) => AgentDef[]

  'project:readClaudeMd': (projectId: number) => string | null
  'project:writeClaudeMd': (projectId: number, content: string) => void
  'project:runInit': (projectId: number) => string | null
  'project:versions': (projectId: number) => VersionInfo
  'project:changelog': (projectId: number) => string | null

  'settings:get': () => Settings
  'settings:set': (patch: Partial<Settings>) => Settings

  'shell:openPath': (path: string) => void

  'update:state': () => UpdateState
  'update:check': () => UpdateState
  'update:download': () => UpdateState
  'update:install': () => void
}

export type IpcChannel = keyof IpcContract

/** Push events: main -> renderer. */
export interface IpcEvents {
  'task:updated': Task
  'task:removed': { id: number; projectId: number }
  'task:event': LogEvent
  'queue:state': QueueState
  'ratelimit': RateLimitInfo
  'update:state': UpdateState
}

export type IpcEventName = keyof IpcEvents

export interface PreloadBridge {
  invoke<C extends IpcChannel>(channel: C, ...args: Parameters<IpcContract[C]>): Promise<ReturnType<IpcContract[C]>>
  on<E extends IpcEventName>(event: E, cb: (payload: IpcEvents[E]) => void): () => void
}
