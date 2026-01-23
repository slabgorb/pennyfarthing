---
description: Sprint status, backlog, and story management - check status, find work, archive completed stories
args: "[status|backlog|work|archive|new|future|promote] [args...]"
---

# Sprint Management

<purpose>
Manage sprint workflow: check status, view backlog, start work, archive completed stories, and promote future epics. This is the primary interface for sprint operations.
</purpose>

<critical>
Never manually edit `sprint/current-sprint.yaml`. Always use the provided scripts.
</critical>

## Commands

### `/sprint` or `/sprint status [filter]`

Show current sprint status with story counts and points.

```bash
.pennyfarthing/scripts/core/run.sh sprint/sprint-status.sh [filter]
```

| Filter | Description |
|--------|-------------|
| (none) | All stories |
| `todo` | Backlog only |
| `in-progress` | Work in progress |
| `done` | Completed stories |

### `/sprint backlog`

Show available stories ready for work, grouped by epic.

```bash
.pennyfarthing/scripts/core/run.sh sprint/available-stories.sh
```

### `/sprint work [story-id|epic-id|next]`

Start work on a story. Primary entry point for development.

| Argument | Behavior |
|----------|----------|
| (none) | Interactive selection from backlog |
| `MSSCI-XXXXX` | Start specific story |
| `epic-XX` | Start first available story in epic |
| `next` | Auto-select highest priority story |

```bash
# Check if story is available
.pennyfarthing/scripts/core/run.sh sprint/check-story.sh <story-id>

# Then load SM to begin work
```

<workflow>
When starting work, this command:
1. Validates story availability
2. Loads SM agent
3. SM creates context and claims Jira
4. Hands off to TEA (tdd) or Dev (trivial)
</workflow>

### `/sprint archive <story-id> [pr-number] [--apply]`

Archive a completed story.

```bash
.pennyfarthing/scripts/core/run.sh sprint/archive-story.sh <story-id> [pr-number] [--apply]
```

| Option | Description |
|--------|-------------|
| `--apply` | Also remove from current-sprint.yaml |

### `/sprint new <yyww> <jira-id> <start> <end> "<goal>"`

Initialize a new sprint.

```bash
.pennyfarthing/scripts/core/run.sh sprint/new-sprint.sh 2605 277 2026-02-03 2026-02-16 "Sprint goal"
```

### `/sprint future [--epic EPIC_ID]`

Show future work available for promotion.

```bash
.pennyfarthing/scripts/core/run.sh sprint/list-future.sh [--epic epic-XX]
```

### `/sprint promote <epic-id>`

Move an epic from future.yaml to current sprint.

```bash
.pennyfarthing/scripts/core/run.sh sprint/promote-epic.sh epic-XX
```

## Quick Reference

| Command | Action |
|---------|--------|
| `/sprint` | Show sprint status |
| `/sprint status todo` | Show backlog |
| `/sprint backlog` | Available stories |
| `/sprint work` | Interactive start |
| `/sprint work next` | Start highest priority |
| `/sprint work MSSCI-XXX` | Start specific story |
| `/sprint archive MSSCI-XXX` | Archive completed |
| `/sprint future` | Show future work |
| `/sprint promote epic-XX` | Promote to sprint |

## Aliases

- `/new-work` is an alias for `/sprint work`

## Related

| Skill | Purpose |
|-------|---------|
| `/jira` | Jira operations (create, sync, claim) |
| `/story` | Story creation, sizing, finish |
| `/sm` | Scrum Master agent for coordination |

<reference>
- **Skill:** `.claude/skills/sprint/skill.md`
- **Scripts:** `.pennyfarthing/scripts/sprint/`
- **Data:** `sprint/current-sprint.yaml`
</reference>
