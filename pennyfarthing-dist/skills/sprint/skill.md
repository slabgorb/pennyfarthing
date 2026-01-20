---
name: sprint
description: |
  Sprint status, backlog, and story management for Pennyfarthing. Use when checking current
  sprint status, finding available stories, reviewing backlog, or understanding story context
  and history.
  IMPORTANT: Always use the provided scripts - never manually edit sprint YAML.
args: "[status|backlog|archive|new]"
---

# /sprint - Sprint Management

**CRITICAL:** Never manually edit `sprint/current-sprint.yaml`. Use the scripts below for deterministic, correct YAML formatting.

## Commands

### `/sprint` or `/sprint status`

Show current sprint status with story counts and points.

**Run:**
```bash
.pennyfarthing/scripts/run.sh sprint-status.sh
```

**Output:** Sprint metadata, stories by status, points breakdown, completed count from archive.

---

### `/sprint backlog`

Show available stories grouped by epic with Jira context.

**Run:**
```bash
.pennyfarthing/scripts/run.sh available-stories.sh
```

**Output:** Backlog stories with epic descriptions, points, priority, and workflow tags.

---

### `/sprint archive <story-id> [pr-number]`

Archive a completed story to the sprint archive file.

**Run:**
```bash
.pennyfarthing/scripts/run.sh archive-story.sh <story-id> [pr-number]
```

**Arguments:**
| Arg | Required | Description |
|-----|----------|-------------|
| `story-id` | Yes | Jira key (e.g., `MSSCI-11945`) |
| `pr-number` | No | PR number if merged via PR |

**Example:**
```bash
.pennyfarthing/scripts/run.sh archive-story.sh MSSCI-11945 368
```

**What it does:**
1. Extracts story from `current-sprint.yaml`
2. Appends to `sprint/archive/sprint-{YYWW}-completed.yaml`
3. Outputs yq command to remove from current sprint

**IMPORTANT:** After running, execute the provided yq command to complete removal:
```bash
yq eval -i 'del(.epics[].stories[] | select(.id == "MSSCI-11945"))' sprint/current-sprint.yaml
```

---

### `/sprint new <yyww> <jira-id> <start> <end> "<goal>"`

Initialize a new sprint from template.

**Run:**
```bash
.pennyfarthing/scripts/run.sh new-sprint.sh <yyww> <jira-id> <start> <end> "<goal>"
```

**Arguments:**
| Arg | Required | Description |
|-----|----------|-------------|
| `yyww` | Yes | Sprint identifier (e.g., `2605` for 2026 week 5) |
| `jira-id` | Yes | Jira sprint ID number (e.g., `277`) |
| `start` | Yes | Start date `YYYY-MM-DD` |
| `end` | Yes | End date `YYYY-MM-DD` |
| `goal` | Yes | Sprint goal (quoted string) |

**Example:**
```bash
.pennyfarthing/scripts/run.sh new-sprint.sh 2605 277 2026-02-03 2026-02-16 "Polish and stabilization"
```

**Creates:**
- `sprint/current-sprint.yaml` - New sprint file
- `sprint/archive/sprint-{YYWW}-completed.yaml` - Empty archive

**Warning:** Prompts for confirmation if current sprint is still active.

---

## File Locations

| File | Purpose |
|------|---------|
| `sprint/current-sprint.yaml` | Active/backlog work only |
| `sprint/archive/sprint-{YYWW}-completed.yaml` | Completed stories for sprint |
| `sprint/sprint-template.yaml` | Format reference |

## YAML Constraints

| Field | Valid Values |
|-------|-------------|
| Sprint name | `"TO Sprint YYWW"` (e.g., "TO Sprint 2604") |
| Story IDs | Jira keys `MSSCI-XXXXX` |
| Status | `backlog`, `in_progress`, `done` |
| Workflow | `tdd`, `trivial`, `agent-docs`, `bdd` |
| Priority | `P0`, `P1`, `P2`, `P3` |

## Dependencies

```bash
brew install yq
brew install ankitpokhrel/jira/jira
```

## Quick Reference

| Command | Script |
|---------|--------|
| `/sprint` | `sprint-status.sh` |
| `/sprint status` | `sprint-status.sh` |
| `/sprint backlog` | `available-stories.sh` |
| `/sprint archive MSSCI-XXX` | `archive-story.sh MSSCI-XXX` |
| `/sprint archive MSSCI-XXX 123` | `archive-story.sh MSSCI-XXX 123` |
| `/sprint new 2605 277 ...` | `new-sprint.sh 2605 277 ...` |
