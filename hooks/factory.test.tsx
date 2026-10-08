import { expect, mock, test } from 'claude-code/testing'

const ROOT = '/factory'
const REGISTRY = `projects:
  - name: about-phil
    repo: git@github.com:philipp-lein/about-phil.git
    deployed: true
    kubectl_context: about-phil-production
    url: aboutphil.de

  - name: my-mmo
    repo: git@github.com:philipp-lein/my-mmo.git

tooling:
  - name: cli
    repo: git@github.com:Deploy-your-Startup/cli.git
    description: "startup CLI Quellcode"
`
const CLONED = [`${ROOT}/projects.yaml`, `${ROOT}/projects/startups/about-phil/.git`]
const PANE = { component: 'Pane', requestId: 'startup-factory' } as const

const RUN = { isStdoutTruncated: false, isStderrTruncated: false }

function run(argv: string) {
  if (argv.includes('status')) {
    return { ...RUN, exitCode: 0, stdout: '# branch.head main\n# branch.ab +2 -0\n1 .M N... a b c d e README.md\n', stderr: '' }
  }
  if (argv.includes('log')) return { ...RUN, exitCode: 0, stdout: `${(1_000 - 3 * 3_600_000) / 1000}\tAdd blog\n`, stderr: '' }
  if (argv.startsWith('kubectl')) {
    return { ...RUN, exitCode: 0, stdout: 'web  app-1  1/1  Running  0  1d\nweb  job-1  0/1  Error  0  1d\n', stderr: '' }
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
    expect(await ui.find({ type: 'Text', text: /vor 3 Std/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /CHECK/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /nicht geklont/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /▰▰▰▰▱▱▱▱ 1\/2/ })).toBeDefined()
    expect(await ui.find({ text: /aboutphil\.de/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /200 · 0 ms/ })).toBeDefined()
    await ui.unmount()
  }
})
