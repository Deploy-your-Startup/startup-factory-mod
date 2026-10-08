import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Board, Cluster, Project, Site } from '../types'

const PANE = 'startup-factory'
const TITLE = 'Startup Factory'
const GIT_EVERY_MS = 2 * 60 * 1000

const EMPTY: Board = { root: null, projects: [], refreshedAt: null, isBusy: false }
const board = atom({ plugin: 'startup-factory', key: 'board' } as const, EMPTY)

type Entry = Record<string, string>

// projects.yaml is flat enough that a line reader covers it: two top-level
// lists (`projects:`, `tooling:`) of `- name: ...` items with scalar fields.
function parseRegistry(text: string): { projects: Entry[]; tooling: Entry[] } {
  const lists: { projects: Entry[]; tooling: Entry[] } = { projects: [], tooling: [] }
  let list: Entry[] | null = null
  let item: Entry | null = null
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\s+#.*$/, '')
    if (line.trim() === '' || line.trim().startsWith('#')) continue
    const top = /^(\w[\w-]*):\s*$/.exec(line)
    if (top) {
      list = top[1] === 'projects' ? lists.projects : top[1] === 'tooling' ? lists.tooling : null
      item = null
      continue
    }
    const field = /^\s*(-\s+)?([\w-]+):\s*(.*)$/.exec(line)
    if (!field || !list) continue
    if (field[1]) {
      item = {}
      list.push(item)
    }
    if (item) item[field[2]!] = field[3]!.trim().replace(/^["']|["']$/g, '')
  }
  return lists
}

function githubUrl(repo: string | undefined): string | undefined {
  const match = /github\.com[:/](.+?)(\.git)?$/.exec(repo ?? '')
  return match ? `https://github.com/${match[1]}` : undefined
}

function projectPath(root: string, project: Project): string {
  return `${root}/projects/${project.kind === 'startup' ? 'startups' : 'tooling'}/${project.name}`
}

async function readGit($: EngineInterface, root: string, project: Project): Promise<Project> {
  const path = projectPath(root, project)
  if (!(await $.fs.exists(`${path}/.git`))) return { ...project, isCloned: false }

  const [status, log] = await Promise.all([
    $.process.run(['git', '-C', path, 'status', '--porcelain=v2', '--branch'], { timeoutMs: 10_000 }),
    $.process.run(['git', '-C', path, 'log', '-1', '--format=%ct%x09%s'], { timeoutMs: 10_000 }),
  ])
  let branch: string | undefined
  let ahead = 0
  let behind = 0
  let dirty = 0
  for (const line of status.stdout.split('\n')) {
    if (line.startsWith('# branch.head ')) branch = line.slice('# branch.head '.length)
    else if (line.startsWith('# branch.ab ')) {
      const [, a, b] = /\+(\d+) -(\d+)/.exec(line) ?? []
      ahead = Number(a ?? 0)
      behind = Number(b ?? 0)
    } else if (line !== '' && !line.startsWith('#')) dirty += 1
  }
  const [stamp, subject] = log.stdout.trim().split('\t')

  return {
    ...project,
    isCloned: true,
    branch,
    ahead,
    behind,
    dirty,
    lastCommitAt: stamp ? Number(stamp) * 1000 : undefined,
    lastCommit: subject || undefined,
  }
}

async function readCluster($: EngineInterface, context: string): Promise<Cluster> {
  try {
    const run = await $.process.run(
      ['kubectl', '--context', context, 'get', 'pods', '-A', '--no-headers'],
      { timeoutMs: 20_000 },
    )
    if (run.exitCode !== 0) {
      const message = run.stderr.trim().split('\n')[0] ?? `exit ${run.exitCode}`
      return { state: 'error', message: message.slice(0, 120) }
    }
    const pods = run.stdout.split('\n').filter(line => line.trim() !== '')
    const running = pods.filter(line => /\s(Running|Completed)\s/.test(line)).length
    return { state: 'ok', running, total: pods.length }
  } catch (error) {
    return { state: 'error', message: String(error).slice(0, 120) }
  }
}

async function readSite($: EngineInterface, url: string): Promise<Site> {
  const startedAt = await $.clock.now()
  try {
    const response = await $.http.fetch(url, { method: 'GET' })
    return { state: 'ok', status: response.status, ms: (await $.clock.now()) - startedAt }
  } catch (error) {
    return { state: 'error', message: String(error).slice(0, 120) }
  }
}

function siteUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  return /^https?:\/\//.test(raw) ? raw : `https://${raw}`
}

function hostOf(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '')
}

async function findRoot($: EngineInterface): Promise<string | null> {
  for (const dir of [await $.session.root(), await $.session.cwd()]) {
    if (await $.fs.exists(`${dir}/projects.yaml`)) return dir
  }
  return null
}

async function refresh($: EngineInterface): Promise<void> {
  const current = await read($, board)
  if (current.isBusy) return
  await update($, board, b => ({ ...b, isBusy: true }))

  try {
    const root = await findRoot($)
    if (root === null) {
      await update($, board, b => ({ ...b, root: null, error: 'Keine projects.yaml in diesem Projekt gefunden.' }))
      return
    }
    const registry = parseRegistry(await $.fs.read(`${root}/projects.yaml`))
    const previous = new Map(current.projects.map(p => [p.name, p]))
    const toProject = (kind: Project['kind']) => (entry: Entry): Project => ({
      name: entry.name ?? '?',
      kind,
      description: entry.description,
      repo: githubUrl(entry.repo),
      isDeployed: entry.deployed === 'true',
      context: entry.kubectl_context,
      url: siteUrl(entry.url),
      isCloned: false,
      cluster: previous.get(entry.name ?? '')?.cluster ?? { state: 'unknown' },
      site: previous.get(entry.name ?? '')?.site ?? { state: 'unknown' },
    })
    const listed = [
      ...registry.projects.map(toProject('startup')),
      ...registry.tooling.map(toProject('tooling')),
    ]
    const projects = await Promise.all(
      listed.map(p => readGit($, root, p).catch(() => p)),
    )
    const now = await $.clock.now()
    await update($, board, b => ({ ...b, root, projects, refreshedAt: now, error: undefined }))
    await showStatus($)
  } finally {
    await update($, board, b => ({ ...b, isBusy: false }))
  }
}

async function runChecks($: EngineInterface): Promise<void> {
  const { projects } = await read($, board)
  const patch = (name: string, change: Partial<Project>) =>
    update($, board, b => ({
      ...b,
      projects: b.projects.map(p => (p.name === name ? { ...p, ...change } : p)),
    }))
  const clusters = projects
    .filter(p => p.isDeployed && p.context)
    .map(async p => {
      await patch(p.name, { cluster: { state: 'checking' } })
      await patch(p.name, { cluster: await readCluster($, p.context!) })
    })
  const sites = projects
    .filter(p => p.url)
    .map(async p => {
      await patch(p.name, { site: { state: 'checking' } })
      await patch(p.name, { site: await readSite($, p.url!) })
    })
  await Promise.all([...clusters, ...sites])
  await showStatus($)
}

async function showStatus($: EngineInterface): Promise<void> {
  const { projects } = await read($, board)
  const startups = projects.filter(p => p.kind === 'startup')
  const live = startups.filter(isLive).length
  const broken = projects.filter(p => health(p) === 'bad').length
  const dirty = projects.filter(p => (p.dirty ?? 0) > 0).length
  const parts = [`🏭 ${live}/${startups.length} live`]
  if (dirty > 0) parts.push(`${dirty} dirty`)
  if (broken > 0) parts.push(`⚠ ${broken} down`)
  $.ui.status(parts.join(' · '))
}

function ago(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000))
  if (minutes < 1) return 'gerade eben'
  if (minutes < 60) return `vor ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `vor ${hours} Std`
  const days = Math.round(hours / 24)
  if (days < 30) return `vor ${days} ${days === 1 ? 'Tag' : 'Tagen'}`
  return `vor ${Math.round(days / 30)} Mon`
}

function bar(running: number, total: number, cells = 8): string {
  if (total === 0) return '▱'.repeat(cells)
  const filled = Math.round((running / total) * cells)
  return '▰'.repeat(filled) + '▱'.repeat(cells - filled)
}

type Health = 'ok' | 'warn' | 'bad' | 'idle'

function isLive(p: Project): boolean {
  return p.isDeployed || p.url !== undefined
}

function health(p: Project): Health {
  if (p.cluster.state === 'error' || p.site.state === 'error') return 'bad'
  if (p.site.state === 'ok' && p.site.status >= 500) return 'bad'
  if (p.cluster.state === 'ok' && p.cluster.running < p.cluster.total) return 'warn'
  if (p.site.state === 'ok' && p.site.status >= 400) return 'warn'
  if ((p.behind ?? 0) > 0) return 'warn'
  if (isLive(p)) return 'ok'
  return 'idle'
}

const HEALTH_COLOR = { ok: 'success', warn: 'warning', bad: 'error', idle: 'subtle' } as const
const HEALTH_RANK = { bad: 0, warn: 1, ok: 2, idle: 3 } as const

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({
      name: 'factory',
      description: 'Startup-Factory-Dashboard öffnen (alle Startups und ihr Zustand)',
    })
    if ((await findRoot($)) !== null) {
      void $.ui.open({ id: PANE, title: TITLE })
      void refresh($).then(() => runChecks($))
      $.clock.every(GIT_EVERY_MS, () => void refresh($))
    }
    return started
  })

  on('command.run', { command: 'factory' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE })
    void refresh($).then(() => runChecks($))
    return { text: 'Startup-Factory-Dashboard geöffnet.' }
  })

  // Claude often commits, pulls or deploys during a turn: re-read git after each.
  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if ((await read($, board)).root !== null) void refresh($)
    return done
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Link } = $.ui.resolve(e)
    const b = await read($, board)
    const now = await $.clock.now()
    const width = Math.max(30, e.props.bodyColumns ?? 60)

    const name = (p: Project, bold = true) =>
      p.repo ? <Link href={p.repo}>{p.name}</Link> : <Text bold={bold}>{p.name}</Text>

    const gitLine = (p: Project) => {
      if (!p.isCloned) return <Text dimColor italic>nicht geklont</Text>
      return (
        <Box flexDirection="row" gap={1}>
          <Text color="suggestion">⎇ {p.branch ?? '?'}</Text>
          {(p.dirty ?? 0) > 0 && <Text color="warning">✎{p.dirty}</Text>}
          {(p.ahead ?? 0) > 0 && <Text color="claude">↑{p.ahead}</Text>}
          {(p.behind ?? 0) > 0 && <Text color="warning">↓{p.behind}</Text>}
          {!p.dirty && !p.ahead && !p.behind && <Text color="success">✓</Text>}
          {p.lastCommitAt !== undefined && <Text dimColor>· {ago(now - p.lastCommitAt)}</Text>}
        </Box>
      )
    }

    const pods = (p: Project) => {
      const c = p.cluster
      if (c.state === 'ok') {
        const color = c.running === c.total ? 'success' : 'warning'
        return (
          <Text color={color}>
            {bar(c.running, c.total)} {c.running}/{c.total}
          </Text>
        )
      }
      if (c.state === 'checking') return <Text color="claude">◌ prüfe Cluster…</Text>
      if (c.state === 'error') return <Text color="error">✗ Cluster nicht erreichbar</Text>
      return <Text dimColor>☸ {p.context}</Text>
    }

    const site = (p: Project) => {
      if (!p.url) return null
      const s = p.site
      const status =
        s.state === 'ok' ? (
          <Text color={s.status >= 500 ? 'error' : s.status >= 400 ? 'warning' : 'success'}>
            {s.status} · {Math.round(s.ms)} ms
          </Text>
        )
        : s.state === 'checking' ? <Text color="claude">◌</Text>
        : s.state === 'error' ? <Text color="error">offline</Text>
        : null
      return (
        <Box flexDirection="row" gap={1}>
          <Text>🌐</Text>
          <Link href={p.url}>{hostOf(p.url)}</Link>
          {status}
        </Box>
      )
    }

    const card = (p: Project) => {
      const state = health(p)
      return (
        <Box
          key={p.name}
          flexDirection="column"
          borderStyle="round"
          borderColor={HEALTH_COLOR[state]}
          paddingX={1}
          marginBottom={1}
        >
          <Box flexDirection="row" justifyContent="space-between">
            <Box flexDirection="row" gap={1}>
              <Text color={HEALTH_COLOR[state]}>●</Text>
              {name(p)}
            </Box>
            <Text backgroundColor={HEALTH_COLOR[state]} color="inverseText" bold>
              {state === 'bad' ? ' DOWN ' : state === 'warn' ? ' CHECK ' : ' LIVE '}
            </Text>
          </Box>
          {site(p)}
          {p.context && pods(p)}
          {gitLine(p)}
          {p.lastCommit && (
            <Text dimColor wrap="truncate-end">
              “{p.lastCommit}”
            </Text>
          )}
          {p.site.state === 'error' && (
            <Text color="error" dimColor wrap="truncate-end">
              {p.site.message}
            </Text>
          )}
          {p.cluster.state === 'error' && (
            <Text color="error" dimColor wrap="truncate-end">
              {p.cluster.message}
            </Text>
          )}
        </Box>
      )
    }

    const line = (p: Project) => (
      <Box key={p.name} flexDirection="column" marginBottom={0}>
        <Box flexDirection="row" gap={1}>
          <Text color={p.isCloned ? 'subtle' : 'inactive'}>○</Text>
          {name(p, false)}
        </Box>
        <Box paddingLeft={2}>{gitLine(p)}</Box>
      </Box>
    )

    const heading = (icon: string, label: string, count?: string) => (
      <Box flexDirection="row" gap={1} marginTop={1} marginBottom={1}>
        <Text>{icon}</Text>
        <Text bold color="claude">
          {label.toUpperCase()}
        </Text>
        {count && <Text dimColor>{count}</Text>}
        <Text dimColor wrap="truncate-end">
          {'─'.repeat(width)}
        </Text>
      </Box>
    )

    const tile = (key: string, value: number, label: string, color: string) => (
      <Box
        key={key}
        flexDirection="column"
        alignItems="center"
        borderStyle="round"
        borderColor={value > 0 ? color : 'subtle'}
        flexGrow={1}
        paddingX={1}
      >
        <Text bold color={value > 0 ? color : 'subtle'}>
          {String(value)}
        </Text>
        <Text dimColor>{label}</Text>
      </Box>
    )

    const startups = b.projects.filter(p => p.kind === 'startup')
    const live = startups
      .filter(isLive)
      .sort((x, y) => HEALTH_RANK[health(x)] - HEALTH_RANK[health(y)])
    const building = startups.filter(p => !isLive(p))
    const tooling = b.projects.filter(p => p.kind === 'tooling')
    const dirty = b.projects.filter(p => (p.dirty ?? 0) > 0).length
    const issues = b.projects.filter(p => health(p) === 'bad' || health(p) === 'warn').length

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" justifyContent="space-between" marginBottom={1}>
          <Text bold color="claude">
            🏭 STARTUP FACTORY
          </Text>
          <Text dimColor>
            {b.isBusy ? '◌ lädt…' : b.refreshedAt !== null ? `↻ ${ago(now - b.refreshedAt)}` : ''}
          </Text>
        </Box>

        <Box flexDirection="row" gap={1}>
          {tile('t-live', live.length, 'live', 'success')}
          {tile('t-build', building.length, 'in Arbeit', 'suggestion')}
          {tile('t-dirty', dirty, 'dirty', 'warning')}
          {tile('t-issues', issues, 'Probleme', 'error')}
        </Box>

        <Box flexDirection="row" gap={1} marginTop={1}>
          <Button key="refresh" label="↻ Aktualisieren" onPress={() => void refresh($)} />
          <Button key="clusters" label="⚡ Checks" onPress={() => void runChecks($)} />
        </Box>

        {b.error && <Text color="error">{b.error}</Text>}
        {b.projects.length === 0 && !b.error && <Text dimColor>Lese Registry…</Text>}

        {live.length > 0 && heading('🚀', 'Live', `${live.length}/${startups.length}`)}
        {live.map(card)}
        {building.length > 0 && heading('🧪', 'In Arbeit', String(building.length))}
        {building.map(line)}
        {tooling.length > 0 && heading('🛠', 'Tooling', String(tooling.length))}
        {tooling.map(line)}
      </Box>
    )
  })
}
