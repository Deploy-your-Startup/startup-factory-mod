# startup-factory-mod

A Claude Code mod that turns a factory workspace into a live dashboard: one pane with every startup and tooling repo from `projects.yaml`.

- **Tiles**: live, in progress, dirty checkouts, problems
- **Cards for live startups**: website status and response time (`url:`), pod health
  from `kubectl --context <kubectl_context>`, git branch / dirty / ahead / behind,
  last commit; border and badge colored by health (`LIVE` / `CHECK` / `DOWN`)
- **Status line**: `🏭 5/10 live · 2 dirty · ⚠ 1 down`
- Git is re-read every 2 minutes and after each Claude turn; website and cluster
  checks run on open and with the **⚡ Checks** button

The pane opens by itself in a session started in a factory workspace (any folder with a `projects.yaml`)
(from 144 terminal columns), or with `/factory`.

## Install

Workspaces created from
[startup-factory-template](https://github.com/Deploy-your-Startup/startup-factory-template)
enable the mod in their `.claude/settings.json`; Claude Code offers to install it when
you trust the folder. Anywhere else, at a Claude Code prompt:

```
/plugin marketplace add Deploy-your-Startup/startup-factory-mod
/plugin install startup-factory@startup-factory-mod
```

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
