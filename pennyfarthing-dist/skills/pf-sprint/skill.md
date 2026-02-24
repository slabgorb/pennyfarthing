---
name: sprint
description: |
  Sprint status, backlog, and story management for Pennyfarthing. Use when checking current
  sprint status, finding available stories, reviewing backlog, or understanding story context
  and history.
  IMPORTANT: Always use `pf.sh sprint` CLI commands - never manually edit sprint YAML.
args: "[status|backlog|work|story|epic|initiative|archive|new|future|info|metrics|validate|standalone]"
hooks:
  PostToolUse:
    - command: pf hooks sprint-yaml
      matcher: Edit|Write
---

# /pf-sprint - Sprint Management

<critical>
Never manually edit `sprint/current-sprint.yaml`. Use `pf.sh sprint` CLI commands for deterministic, correct YAML formatting.
</critical>

## Quick Reference

| Command | CLI | Purpose |
|---------|-----|---------|
| `/pf-sprint` | `pf.sh sprint status` | Show sprint status |
| `/pf-sprint status [filter]` | `pf.sh sprint status [filter]` | Filter: `backlog`, `todo`, `in-progress`, `review`, `done` |
| `/pf-sprint backlog` | `pf.sh sprint backlog` | Available stories by epic |
| `/pf-sprint work [id]` | `pf.sh sprint work [story-id] [--dry-run]` | Start work on a story |
| `/pf-sprint archive <id> [pr]` | `pf.sh sprint archive <id> [pr] [--apply] [--dry-run]` | Archive completed story |
| `/pf-sprint new ...` | `pf.sh sprint new <yyww> <jira-id> <start> <end> "<goal>" [--dry-run]` | Initialize new sprint |
| `/pf-sprint future [epic-id]` | `pf.sh sprint future [epic-id]` | Show future initiatives |
| `/pf-sprint info` | `pf.sh sprint info` | Sprint header as JSON |
| `/pf-sprint metrics` | `pf.sh sprint metrics [--json]` | Sprint progress and velocity |
| `/pf-sprint validate` | `pf.sh sprint validate [--fix] [--strict]` | Validate sprint YAML |

### Story Commands

| Command | CLI | Purpose |
|---------|-----|---------|
| `/pf-sprint story show <id>` | `pf.sh sprint story show <id> [--json]` | Show story details |
| `/pf-sprint story add ...` | `pf.sh sprint story add <epic-id> "<title>" <pts> [opts]` | Add story to epic |
| `/pf-sprint story update <id>` | `pf.sh sprint story update <id> [opts]` | Update story fields |
| `/pf-sprint story field <id> <f>` | `pf.sh sprint story field <id> <field>` | Get single field value |
| `/pf-sprint story size [pts]` | `pf.sh sprint story size [points]` | Sizing guidelines |
| `/pf-sprint story template [t]` | `pf.sh sprint story template [type]` | Story templates |
| `/pf-sprint story finish <id>` | `pf.sh sprint story finish <id> [--dry-run]` | Complete story workflow |
| `/pf-sprint story claim <id>` | `pf.sh sprint story claim <id> [--claim/--unclaim] [--dry-run]` | Claim/unclaim in Jira |

### Epic Commands

| Command | CLI | Purpose |
|---------|-----|---------|
| `/pf-sprint epic show <id>` | `pf.sh sprint epic show <id> [--json]` | Show epic details |
| `/pf-sprint epic add <id> <title>` | `pf.sh sprint epic add <id> <title> [opts]` | Add epic to sprint |
| `/pf-sprint epic update <id>` | `pf.sh sprint epic update <id> [--status] [--priority] [--dry-run]` | Update epic fields |
| `/pf-sprint epic promote <id>` | `pf.sh sprint epic promote <id> [--dry-run]` | Move from future to current |
| `/pf-sprint epic archive [id]` | `pf.sh sprint epic archive [id] [--dry-run] [--jira]` | Archive completed epics |
| `/pf-sprint epic cancel <id>` | `pf.sh sprint epic cancel <id> [--jira] [--dry-run]` | Cancel epic and stories |
| `/pf-sprint epic import <file>` | `pf.sh sprint epic import <file> [init] [--marker] [--dry-run]` | Import BMAD epics |
| `/pf-sprint epic remove <id>` | `pf.sh sprint epic remove <id> [--dry-run]` | Remove from future.yaml |
| `/pf-sprint epic field <id> <f>` | `pf.sh sprint epic field <id> <field>` | Get single field value |

### Initiative Commands

| Command | CLI | Purpose |
|---------|-----|---------|
| `/pf-sprint initiative show <n>` | `pf.sh sprint initiative show <name> [--json]` | Show initiative details |
| `/pf-sprint initiative cancel <n>` | `pf.sh sprint initiative cancel <name> [--jira] [--dry-run]` | Cancel initiative |

### Aliases

| Alias | Equivalent |
|-------|------------|
| `pf.sh status` | `pf.sh sprint status` |
| `pf.sh backlog` | `pf.sh sprint backlog` |
| `pf.sh work` | `pf.sh sprint work` |
| `pf.sh story` | `pf.sh sprint story` |
| `/pf-session new` | `/pf-sprint work` |

---

**Detailed options and behavior:** [usage.md](usage.md)
**Practical examples:** [examples.md](examples.md)

## Related Skills

| Skill | Purpose |
|-------|---------|
| `/pf-jira` | Jira operations (create, sync, reconcile, claim, assign) |
