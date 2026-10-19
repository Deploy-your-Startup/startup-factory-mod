# startup-factory-mod

Claude Code mod (function-hooks plugin) that renders the startup-factory dashboard.

- `hooks/register.tsx` — the hooks module: registry parsing, git/kubectl/http checks, the `Pane` render
- `types/index.d.ts` — the `$.state` contract (`startup-factory.board`)
- `hooks/*.test.tsx` — tests run by `claude plugin test .`
- `.claude-plugin/marketplace.json` — makes this repo its own marketplace

## Rules

- Test through the engine with
  `claude-code/testing` (`$.ui.mount` the Pane, answer `fs`, `process.run`,
  `http.fetch` beneath the plugin).
- Before committing: run `claude plugin validate .` and the portable policy
  integration check. Run `claude plugin test .` when the installed engine exposes
  that command, and `tsc -p .` when its generated `.claude-plugin/types/tsconfig.json`
  exists. Record unavailable engine/type checks explicitly; documentation checks
  alone do not establish that the plugin works in a supported engine.
- Bump `version` in `.claude-plugin/plugin.json` on every change, so installs pick it up
  with `claude plugin update`.
- The module runs without Node or DOM; everything outside goes through `$`.
- Never shadow `h` (the JSX factory) with a local variable.

## Test coverage and completion claims

Follow [Testing policy and completion evidence](docs/testing-policy.md); report
skipped engine checks and remaining gaps.
