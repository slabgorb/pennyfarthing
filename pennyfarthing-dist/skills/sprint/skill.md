---
name: sprint
description: |
  Sprint status, backlog, and story management for Pennyfarthing. Use when checking current
  sprint status, finding available stories, reviewing backlog, or understanding story context
  and history.
  IMPORTANT: Always use the provided scripts - never manually edit sprint YAML.
args: "[status|backlog|work|archive|new]"
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

### `/sprint work [story-id|epic-id|next]`

Start work on a story. This is the primary entry point for development work.

**Alias:** `/new-work` is equivalent to `/sprint work`

#### Without argument: Interactive selection

Shows backlog, user selects story, then proceeds to setup.

**Flow:**
1. Load SM persona
2. Check for in-progress work
3. Show available stories
4. User selects story
5. Setup and handoff to TEA/Dev

#### With story ID: Direct start

**Run first:**
```bash
.pennyfarthing/scripts/run.sh check-story.sh <story-id>
```

**If `available: true`:** Skip backlog, proceed directly to story setup with returned data.
**If `available: false`:** Report why (assigned, in progress, etc.)

**Example:**
```bash
.pennyfarthing/scripts/run.sh check-story.sh MSSCI-12038
# Returns: {"type": "story", "available": true, "title": "...", ...}
```

#### With epic ID: Start first available story in epic

**Run first:**
```bash
.pennyfarthing/scripts/run.sh check-story.sh <epic-id>
```

**Returns:** Epic info with `first_story` (highest priority available story).
**Action:** Automatically start work on `first_story` if available.

**Example:**
```bash
.pennyfarthing/scripts/run.sh check-story.sh MSSCI-11952
# Returns: {"type": "epic", "first_story": {"id": "MSSCI-11954", ...}, ...}
```

#### With `next`: Auto-select highest priority story

**Run first:**
```bash
.pennyfarthing/scripts/run.sh check-story.sh next
```

**Returns:** Highest-priority available story across all epics.
**Action:** Automatically start work on returned story.

**Example:**
```bash
.pennyfarthing/scripts/run.sh check-story.sh next
# Returns: {"type": "next", "story": {"id": "MSSCI-11950", "priority": "P1", ...}}
```

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

## Work Flow Details

When `/sprint work` (or `/new-work`) starts a story:

<agent-activation>
Load SM persona first:
```bash
d="$PWD"; while [[ ! -d "$d/.claude" ]] && [[ "$d" != "/" ]]; do d="$(dirname "$d")"; done; "$d/.pennyfarthing/scripts/run.sh" agent-session.sh start "sm"
```
</agent-activation>

### Story Setup Steps

1. **Check story** via `check-story.sh` (if ID provided)
2. **Write context** to `.session/context-story-{id}.md`
3. **Setup story** via `generic-sm-setup` subagent (claims Jira, creates branch)
4. **Handoff** to next agent based on workflow:

| Workflow | Route |
|----------|-------|
| `trivial` | SM → Dev |
| `tdd` | SM → TEA → Dev → Reviewer |
| `agent-docs` | SM → Orchestrator |

### Gates Before Handoff

- [ ] Session file exists at `.session/{story-id}-session.md`
- [ ] Story context written with ACs
- [ ] Jira claimed (assigned, In Progress)
- [ ] Branch created

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

| Command | Script/Action |
|---------|---------------|
| `/sprint` | `sprint-status.sh` |
| `/sprint status` | `sprint-status.sh` |
| `/sprint backlog` | `available-stories.sh` |
| `/sprint work` | Interactive story selection → SM flow |
| `/sprint work MSSCI-XXX` | `check-story.sh` → direct start |
| `/sprint work EPIC-ID` | `check-story.sh` → start first story |
| `/sprint work next` | `check-story.sh next` → start highest priority |
| `/sprint archive MSSCI-XXX` | `archive-story.sh MSSCI-XXX` |
| `/sprint new 2605 277 ...` | `new-sprint.sh 2605 277 ...` |
| `/new-work` | Alias for `/sprint work` |
| `/new-work MSSCI-XXX` | Alias for `/sprint work MSSCI-XXX` |
| `/new-work next` | Alias for `/sprint work next` |
