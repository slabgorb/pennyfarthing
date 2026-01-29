# Core Scripts

Essential scripts required for all Pennyfarthing operations.

## Scripts

| Script | Purpose |
|--------|---------|
| `agent-session.sh` | Agent persona loading and session management |
| `check-context.sh` | Context usage checker for monitoring token limits |
| `prime.sh` | Context loading for agent activation |

## Usage

These scripts are invoked directly:

```bash
.pennyfarthing/scripts/core/agent-session.sh start sm
.pennyfarthing/scripts/core/check-context.sh --human
```

## Ownership

- **Primary users:** All agents, all workflows
- **Maintained by:** Core Pennyfarthing team
