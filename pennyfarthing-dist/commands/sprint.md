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
pf sprint status [filter]
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
pf sprint backlog
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
# MERGE GATE: Check for open PRs first (blocks if any exist)
OPEN_PRS=$(gh pr list --state open --json number --jq 'length' 2>/dev/null || echo "0")
if [[ "$OPEN_PRS" -gt 0 ]]; then
  echo "⛔ BLOCKED: $OPEN_PRS open PR(s) - merge or close before starting new work"
  gh pr list --state open
  # Don't proceed until PRs are cleared
fi

# Check if story is available
pf sprint check <story-id>

# Then load SM to begin work
```

<workflow>
When starting work, this command:
1. **Checks merge gate** - blocks if open PRs exist
2. Validates story availability
3. Loads SM agent
4. SM creates context and claims Jira
5. Hands off to TEA (tdd) or Dev (trivial)
</workflow>

### `/sprint archive <story-id> [pr-number] [--apply]`

Archive a completed story.

```bash
pf sprint archive <story-id> [pr-number] [--apply]
```

| Option | Description |
|--------|-------------|
| `--apply` | Also remove from current-sprint.yaml |

### `/sprint new <yyww> <jira-id> <start> <end> "<goal>"`

Initialize a new sprint.

```bash
pf sprint new 2605 277 2026-02-03 2026-02-16 "Sprint goal"
```

### `/sprint future [--epic EPIC_ID]`

Show future work available for promotion.

```bash
pf sprint future [--epic epic-XX]
```

### `/sprint promote <epic-id>`

Move an epic from future.yaml to current sprint.

```bash
pf sprint epic promote epic-XX
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
| `/sprint story` | Story creation, sizing, finish (consolidated) |
| `/sm` | Scrum Master agent for coordination |

<reference>
- **Skill:** `.claude/skills/sprint/skill.md`
- **Scripts:** `.pennyfarthing/scripts/sprint/`
- **Data:** `sprint/current-sprint.yaml`
</reference>
