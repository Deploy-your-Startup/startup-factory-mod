import { expect, mock, test } from 'claude-code/testing'

const ROOT = '/factory'
const REGISTRY = `projects:
  - name: example-app
    repo: git@github.com:example-owner/example-app.git
    deployed: true
    kubectl_context: example-app-production
    url: app.example.com

  - name: demo-game
    repo: git@github.com:example-owner/demo-game.git

tooling:
  - name: cli
    repo: git@github.com:Deploy-your-Startup/cli.git
    description: "startup CLI Quellcode"
`
const CLONED = [`${ROOT}/projects.yaml`, `${ROOT}/projects/startups/example-app/.git`]
const PANE = { component: 'Pane', requestId: 'startup-factory' } as const

const RUN = { isStdoutTruncated: false, isStderrTruncated: false }

function run(argv: string) {
  if (argv.includes('status')) {
    return { ...RUN, exitCode: 0, stdout: '# branch.head main\n# branch.ab +2 -0\n1 .M N... a b c d e README.md\n', stderr: '' }
  }
  if (argv.includes('log')) return { ...RUN, exitCode: 0, stdout: `${(1_000 - 3 * 3_600_000) / 1000}\tAdd blog\n`, stderr: '' }
  if (argv.startsWith('kubectl')) {
    return { ...RUN, exitCode: 0, stdout: JSON.stringify({ items: [
      { status: { phase: 'Running', conditions: [{ type: 'Ready', status: 'True' }] } },
      { status: { phase: 'Failed' } },
    ] }), stderr: '' }
  }
  return { ...RUN, exitCode: 1, stdout: '', stderr: 'unexpected' }
}

test('the pane lists startups with git and cluster state', async ($, on) => {
  mock.clock(on, { now: 1_000 })
  on('session.root', () => ({ value: ROOT }))
  on('session.cwd', () => ({ value: ROOT }))
  on('fs.exists', (_, e) => ({ value: CLONED.includes(e.path) }))
  on('fs.read', () => ({ value: REGISTRY }))
  on('ui.status', () => ({ value: undefined }))
  on('http.fetch', () => ({ value: { status: 200, ok: true, headers: {}, text: '' } as never }))
  on('process.run', (_, e) => ({ value: run(e.argv.join(' ')) }))

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'startup-factory',
      surface,
      ...PANE,
      props: { title: 'Startup Factory', isFocused: false, bodyColumns: 60, placement: 'dock' } as never,
    })
    await ui.press({ key: 'refresh' })
    await ui.press({ key: 'clusters' })

    expect(await ui.find({ type: 'Text', text: /1\/2/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /⎇ main/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /✎1/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /3 h ago/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /CHECK/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /not cloned/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /▰▰▰▰▱▱▱▱ 1\/2/ })).toBeDefined()
    expect(await ui.find({ text: /app\.example\.com/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /200 · 0 ms/ })).toBeDefined()
    await ui.unmount()
  }
})


test('shared-cluster cards check their own contexts and report readiness', async ($, on) => {
  mock.clock(on, { now: 1_000 })
  on('session.root', () => ({ value: ROOT }))
  on('session.cwd', () => ({ value: ROOT }))
  on('fs.exists', (_, e) => ({ value: e.path === `${ROOT}/projects.yaml` }))
  on('fs.read', () => ({ value: `projects:
  - name: cluster-a
    deployed: true
    kubectl_context: cluster-a-production
  - name: cluster-b
    deployed: true
    kubectl_context: cluster-b-production
  - name: empty-startup
    deployed: true
    kubectl_context: empty-production
` }))
  on('ui.status', () => ({ value: undefined }))
  const checked = new Set<string>()
  on('process.run', (_, e) => {
    expect(e.argv[0]).toBe('kubectl')
    expect(e.argv).not.toContain('-A')
    expect(e.argv.slice(3)).toEqual(['get', 'pods', '-o', 'json'])
    const context = e.argv[2]!
    checked.add(context)
    const items = context === 'cluster-a-production' ? [
      { status: { phase: 'Running', conditions: [{ type: 'Ready', status: 'True' }] } },
      { status: { phase: 'Succeeded' } },
      { metadata: { deletionTimestamp: '2026-10-08T00:00:00Z' }, status: { phase: 'Running' } },
    ] : context === 'cluster-b-production' ? [
      { status: { phase: 'Running', conditions: [{ type: 'Ready', status: 'False' }] } },
    ] : []
    return { value: { ...RUN, exitCode: 0, stdout: JSON.stringify({ items }), stderr: '' } }
  })
  const ui = await $.ui.mount({ plugin: 'startup-factory', surface: 'terminal', ...PANE,
    props: { title: 'Startup Factory', isFocused: false, bodyColumns: 60, placement: 'dock' } as never })
  await ui.press({ key: 'refresh' })
  await ui.press({ key: 'clusters' })
  expect([...checked].sort()).toEqual(['cluster-a-production', 'cluster-b-production', 'empty-production'])
  expect(await ui.find({ type: 'Text', text: /▰▰▰▰▰▰▰▰ 2\/2/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /▱▱▱▱▱▱▱▱ 0\/1/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /▱▱▱▱▱▱▱▱ 0\/0/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /CHECK/ })).toBeDefined()
  await ui.unmount()
})


test('a session inside a factory repository finds the registry above it and gets the factory look', async ($, on) => {
  mock.clock(on, { now: 1_000 })
  const inside = `${ROOT}/projects/tooling/cli`
  on('session.root', () => ({ value: inside }))
  on('session.cwd', () => ({ value: inside }))
  on('fs.exists', (_, e) => ({ value: e.path === `${ROOT}/projects.yaml` }))
  on('fs.read', () => ({ value: REGISTRY }))
  on('ui.status', () => ({ value: undefined }))
  on('http.fetch', () => ({ value: { status: 200, ok: true, headers: {}, text: '' } as never }))
  on('process.run', (_, e) => ({ value: run(e.argv.join(' ')) }))
  on('command.register', () => ({ value: { command: 'factory' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  const opened: string[] = []
  on('ui.open', (_, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  const looks: Array<{ label?: string; modes: string[]; hasBackdrop: boolean }> = []
  on('theme.set', (_, e) => {
    looks.push({
      label: e.colors?.label,
      modes: Object.keys(e.colors?.inputs ?? {}).sort(),
      hasBackdrop: e.backdrop?.scene === 'factory-floor',
    })
    return { value: { isDrawn: true } as never }
  })

  await $.session.start({ cwd: inside, surface: 'desktop', isInteractive: true })

  expect(opened).toEqual(['startup-factory'])
  expect(looks).toEqual([{ label: 'Startup Factory', modes: ['dark', 'light'], hasBackdrop: true }])
})

test('outside a factory workspace nothing opens and the look stays the app\'s', async ($, on) => {
  on('session.root', () => ({ value: '/elsewhere/app' }))
  on('session.cwd', () => ({ value: '/elsewhere/app' }))
  on('fs.exists', () => ({ value: false }))
  on('command.register', () => ({ value: { command: 'factory' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  let touched = 0
  on('ui.open', () => {
    touched += 1
    return { value: { isPlaced: true } }
  })
  on('theme.set', () => {
    touched += 1
    return { value: { isDrawn: true } as never }
  })

  await $.session.start({ cwd: '/elsewhere/app', surface: 'desktop', isInteractive: true })

  expect(touched).toBe(0)
})

test('the theme option turned off keeps the app\'s own look', { options: { theme: false } }, async ($, on) => {
  mock.clock(on, { now: 1_000 })
  on('session.root', () => ({ value: ROOT }))
  on('session.cwd', () => ({ value: ROOT }))
  on('fs.exists', (_, e) => ({ value: e.path === `${ROOT}/projects.yaml` }))
  on('fs.read', () => ({ value: REGISTRY }))
  on('ui.status', () => ({ value: undefined }))
  on('http.fetch', () => ({ value: { status: 200, ok: true, headers: {}, text: '' } as never }))
  on('process.run', (_, e) => ({ value: run(e.argv.join(' ')) }))
  on('command.register', () => ({ value: { command: 'factory' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  let looks = 0
  on('theme.set', () => {
    looks += 1
    return { value: { isDrawn: true } as never }
  })

  await $.session.start({ cwd: ROOT, surface: 'desktop', isInteractive: true })

  expect(looks).toBe(0)
})

test('minimized to a widget, the pane shows the numbers alone', async ($, on) => {
  mock.clock(on, { now: 1_000 })
  on('session.root', () => ({ value: ROOT }))
  on('session.cwd', () => ({ value: ROOT }))
  on('fs.exists', (_, e) => ({ value: CLONED.includes(e.path) }))
  on('fs.read', () => ({ value: REGISTRY }))
  on('ui.status', () => ({ value: undefined }))
  on('process.run', (_, e) => ({ value: run(e.argv.join(' ')) }))

  const full = await $.ui.mount({ plugin: 'startup-factory', surface: 'desktop', ...PANE,
    props: { title: 'Startup Factory', isFocused: false, bodyColumns: 60, placement: 'dock' } as never })
  await full.press({ key: 'refresh' })
  await full.unmount()

  const widget = await $.ui.mount({ plugin: 'startup-factory', surface: 'desktop', ...PANE,
    props: { title: 'Startup Factory', isFocused: false, bodyColumns: 30, placement: 'widget', anchoredEdges: [] } as never })
  expect(await widget.find({ type: 'Text', text: /1\/2 live/ })).toBeDefined()
  expect(await widget.find({ type: 'Text', text: /✎ 1 dirty/ })).toBeDefined()
  expect(await widget.find({ key: 'refresh' })).toBeUndefined()
  await widget.unmount()
})


test('the backdrop is the factory floor, drawn where a look draws', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  const props = { scene: 'factory-floor', plugin: 'startup-factory', glass: { blur: 10, opacity: 0.82 } }

  for (const surface of ['desktop', 'mobile'] as const) {
    const ui = await $.ui.mount({ plugin: 'startup-factory', surface, component: 'Backdrop', props })
    const scene = await ui.find({ type: 'Svg' })
    const source = String(scene?.props.source)
    expect(scene?.props.alt).toMatch(/factory skyline/)
    expect(source.length).toBeLessThan(131_072)
    expect(source).toMatch(/^<svg .*<\/svg>$/)
    await ui.unmount()
  }

  const other = await $.ui.mount({ plugin: 'startup-factory', surface: 'desktop', component: 'Backdrop',
    props: { ...props, scene: 'someone-elses' } })
  expect(await other.find({ type: 'Svg' })).toBeUndefined()
  expect(await other.find({ type: 'Text', text: /engine/ })).toBeDefined()
  await other.unmount()
})
