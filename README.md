# startup-factory-mod

A Claude Code mod that turns a factory workspace into a live dashboard: one pane with every startup and tooling repo from `projects.yaml`.

- **Tiles**: live, in progress, dirty checkouts, problems
- **Cards for live startups**: website status and response time (`url:`), pod health
  from `kubectl --context <kubectl_context>`, git branch / dirty / ahead / behind,
  last commit; border and badge colored by health (`LIVE` / `CHECK` / `DOWN`)
- **Status line**: `🏭 5/10 live · 2 dirty · ⚠ 1 down`
- Git is re-read every 2 minutes and after each Claude turn; website and cluster
  checks run on open and with the **⚡ Checks** button
- **Widget**: minimized in the desktop app, the pane shrinks to the numbers alone
- **Factory look**: in the desktop and mobile apps a factory workspace is painted in
  brushed steel and safety orange, in light and dark mode, over a moving factory floor
  (`hooks/scene.ts`): a works skyline with smoking chimneys, a conveyor and turning
  gears on a blueprint grid. Turn it
  off with the mod's `theme` option. The terminal and editors keep their own look.

The pane opens by itself in a session started in a factory workspace: a folder with a
`projects.yaml`, or a repository up to four levels beneath one, such as
`projects/tooling/<name>` (in a terminal from 144 columns). `/factory` opens it anywhere.

## Install

Workspaces created from
[startup-factory-template](https://github.com/Deploy-your-Startup/startup-factory-template)
enable the mod in their `.claude/settings.json`; Claude Code offers to install it when
you trust the folder. Anywhere else, at a Claude Code prompt:

```
/plugin marketplace add Deploy-your-Startup/startup-factory-mod
/plugin install startup-factory@startup-factory-mod
```

Enabling the mod in a workspace's settings does not install it. If the dashboard never
appears, check `claude plugin list`; when the mod is missing, install it as above. In
the desktop app: **+** next to the prompt box, **Plugins**, **Add marketplace** with
`Deploy-your-Startup/startup-factory-mod`, then **Add plugin**.

## Registry fields it reads

```yaml
projects:
  - name: example-app
    repo: https://github.com/example-owner/example-app.git
    deployed: true                         # card in the "Live" section
    kubectl_context: example-app-production # pod check in this context’s namespace
    url: app.example.com                      # website check + link
```

Pod checks use the namespace configured in each Kubernetes context (or `default`
when none is configured). Startups sharing a cluster need separate contexts with
their own namespaces. Only Ready pods and completed jobs count as healthy; an
empty namespace is shown as needing attention.

## Develop

```bash
claude plugin validate .
claude plugin test .
```

`tsc -p .` type-checks once Claude Code has loaded the mod (it writes
`.claude-plugin/types/`).

The look needs an engine that has `$.theme` (Claude Code 2.1.325 has it, 2.1.311 does
not). On an older engine the dashboard loads without it, and `claude plugin test .`
cannot run the tests that answer `theme.set`.

`hooks/make-colors.js` and `hooks/make-colors.d.ts` are copied unchanged from Claude
Code's `plugin-authoring` skill and build the palette from the few colors in
`hooks/register.tsx`. Copy them again when the build updates; do not edit them.
