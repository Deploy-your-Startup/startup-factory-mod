# startup-factory-mod

A Claude Code mod that turns the [startup-factory](https://github.com/philipp-lein/startup-factory)
hub into a live dashboard: one pane with every startup and tooling repo from `projects.yaml`.

- **Tiles**: live, in progress, dirty checkouts, problems
- **Cards for live startups**: website status and response time (`url:`), pod health
  from `kubectl --context <kubectl_context>`, git branch / dirty / ahead / behind,
  last commit; border and badge colored by health (`LIVE` / `CHECK` / `DOWN`)
- **Status line**: `🏭 5/10 live · 2 dirty · ⚠ 1 down`
- Git is re-read every 2 minutes and after each Claude turn; website and cluster
  checks run on open and with the **⚡ Checks** button

The pane opens by itself in a session started in the startup-factory folder
(from 144 terminal columns), or with `/factory`.

## Install

Inside the startup-factory repo nothing is needed: its `.claude/settings.json`
enables the mod. Anywhere else, at a Claude Code prompt:

```
/plugin install startup-factory --marketplace philipp-lein/startup-factory-mod
```

## Registry fields it reads

```yaml
projects:
  - name: about-phil
    repo: git@github.com:philipp-lein/about-phil.git
    deployed: true                         # card in the "Live" section
    kubectl_context: about-phil-production # pod check in this context’s namespace
    url: aboutphil.de                      # website check + link
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
