# Core Scripts

Essential scripts required for all Pennyfarthing operations.

## Scripts

| Script | Purpose |
|--------|---------|
| `run.sh` | Bootstrap script - finds PROJECT_ROOT and dispatches to other scripts |
| `agent-session.sh` | Agent persona loading and session management |
| `check-context.sh` | Context usage checker for monitoring token limits |
| `prime.sh` | Context loading for agent activation |

## Usage

These scripts are invoked via `run.sh`:

```bash
.pennyfarthing/scripts/core/run.sh core/agent-session.sh start sm
.pennyfarthing/scripts/core/run.sh core/check-context.sh --human
```

## Ownership

- **Primary users:** All agents, all workflows
- **Maintained by:** Core Pennyfarthing team
