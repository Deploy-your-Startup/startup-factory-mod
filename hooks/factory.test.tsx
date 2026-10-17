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
