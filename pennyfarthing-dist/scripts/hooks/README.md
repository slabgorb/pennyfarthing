# Hooks

Git hooks and Claude Code hooks.

## Scripts

| Script | Purpose |
|--------|---------|
| `context-circuit-breaker.sh` | Claude hook: halt at context limit |
| `context-warning.sh` | Claude hook: warn on high context |
| `otel-auto-config.sh` | Claude hook: configure OTEL |
| `post-merge.sh` | Git hook: post-merge actions |
| `pre-commit.sh` | Git hook: branch protection, agent validation, sprint YAML validation |
| `pre-edit-check.sh` | Claude hook: validate before edit |
| `pre-push.sh` | Git hook: pre-push validation |
| `session-start.sh` | Claude hook: session start |
| `session-stop.sh` | Claude hook: session stop |

## Installation

Git hooks are installed via:

```bash
pf git install-hooks
```

Claude hooks are configured in `.claude/settings.json`.

## Ownership

- **Primary users:** Git, Claude Code
- **Maintained by:** Core Pennyfarthing team
