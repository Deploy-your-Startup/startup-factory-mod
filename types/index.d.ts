export type Cluster =
  | { state: 'unknown' }
  | { state: 'checking' }
  | { state: 'ok'; running: number; total: number }
  | { state: 'error'; message: string }

export type Site =
  | { state: 'unknown' }
  | { state: 'checking' }
  | { state: 'ok'; status: number; ms: number }
  | { state: 'error'; message: string }

export type Project = {
  name: string
  kind: 'startup' | 'tooling'
  description?: string
  repo?: string
  url?: string
  isDeployed: boolean
  context?: string
  isCloned: boolean
  branch?: string
  dirty?: number
  ahead?: number
  behind?: number
  lastCommit?: string
  lastCommitAt?: number
  cluster: Cluster
  site: Site
}

export type Board = {
  root: string | null
  projects: Project[]
  refreshedAt: number | null
  isBusy: boolean
  error?: string
}

declare module 'claude-code' {
  interface PluginState {
    'startup-factory': { board: Board }
  }
}
