# Sprint Scripts

Sprint management is handled by the Python CLI: `pf.sh sprint [COMMAND]`.

## Commands

| Command | Purpose |
|---------|---------|
| `pf.sh sprint status` | Show current sprint status and metrics |
| `pf.sh sprint backlog` | List available stories grouped by epic |
| `pf.sh sprint info` | Sprint info as JSON (for Cyclist sidebar) |
| `pf.sh sprint metrics` | Sprint velocity and progress metrics |
| `pf.sh sprint check <id>` | Check story/epic availability (JSON) |
| `pf.sh sprint future` | Show future initiatives and epics |
| `pf.sh sprint new` | Initialize a new sprint |
| `pf.sh sprint validate <file>` | Validate sprint YAML structure |
| `pf.sh sprint archive <id>` | Archive a completed story |
| `pf.sh sprint work <id>` | Start work on a story |
| `pf.sh sprint story field <id> <field>` | Get a story field value |
| `pf.sh sprint epic field <id> <field>` | Get an epic field value |
| `pf.sh sprint epic promote <id>` | Move epic from future to current sprint |
| `pf.sh sprint epic show <id>` | Show epic details |
| `pf.sh sprint epic cancel <id>` | Cancel an epic |
| `pf.sh sprint epic archive` | Archive completed epics |

## Usage

```bash
pf.sh sprint status
pf.sh sprint backlog
pf.sh sprint future epic-55
pf.sh sprint epic promote epic-41
```

## Ownership

- **Primary users:** SM agent, `/pf-sprint` skill
- **Maintained by:** Core Pennyfarthing team

## Migration Note

All bash scripts previously in this directory have been migrated to Python CLI
commands in `pf/sprint/cli.py`. See PR #716 and the follow-up
deprecation commit for details.
