---
name: sprint
description: |
  Sprint status, backlog, and story management for Pennyfarthing. Use when checking current
  sprint status, finding available stories, reviewing backlog, or understanding story context
  and history.
  IMPORTANT: Always use the provided scripts - never manually edit sprint YAML.
args: "[status|backlog|work|archive|new|promote|epic]"
---

# /sprint - Sprint Management

**CRITICAL:** Never manually edit `sprint/current-sprint.yaml`. Use the scripts below for deterministic, correct YAML formatting.

## Commands

### `/sprint` or `/sprint status`

Show current sprint status with story counts and points.

**Run:**
```bash
.pennyfarthing/scripts/run.sh sprint/sprint-status.sh
```

**Output:** Sprint metadata, stories by status, points breakdown, completed count from archive.

---

### `/sprint backlog`

Show available stories grouped by epic with Jira context.

**Run:**
```bash
.pennyfarthing/scripts/run.sh sprint/available-stories.sh
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
.pennyfarthing/scripts/run.sh sprint/check-story.sh <story-id>
```

**If `available: true`:** Skip backlog, proceed directly to story setup with returned data.
**If `available: false`:** Report why (assigned, in progress, etc.)

**Example:**
```bash
.pennyfarthing/scripts/run.sh sprint/check-story.sh MSSCI-12038
# Returns: {"type": "story", "available": true, "title": "...", ...}
```

#### With epic ID: Start first available story in epic

**Run first:**
```bash
.pennyfarthing/scripts/run.sh sprint/check-story.sh <epic-id>
```

**Returns:** Epic info with `first_story` (highest priority available story).
**Action:** Automatically start work on `first_story` if available.

**Example:**
```bash
.pennyfarthing/scripts/run.sh sprint/check-story.sh MSSCI-11952
# Returns: {"type": "epic", "first_story": {"id": "MSSCI-11954", ...}, ...}
```

#### With `next`: Auto-select highest priority story

**Run first:**
```bash
.pennyfarthing/scripts/run.sh sprint/check-story.sh next
```

**Returns:** Highest-priority available story across all epics.
**Action:** Automatically start work on returned story.

**Example:**
```bash
.pennyfarthing/scripts/run.sh sprint/check-story.sh next
# Returns: {"type": "next", "story": {"id": "MSSCI-11950", "priority": "P1", ...}}
```

---

### `/sprint archive <story-id> [pr-number]`

Archive a completed story to the sprint archive file.

**Run:**
```bash
.pennyfarthing/scripts/run.sh sprint/archive-story.sh <story-id> [pr-number]
```

**Arguments:**
| Arg | Required | Description |
|-----|----------|-------------|
| `story-id` | Yes | Jira key (e.g., `MSSCI-11945`) |
| `pr-number` | No | PR number if merged via PR |

**Example:**
```bash
.pennyfarthing/scripts/run.sh sprint/archive-story.sh MSSCI-11945 368
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
.pennyfarthing/scripts/run.sh sprint/new-sprint.sh <yyww> <jira-id> <start> <end> "<goal>"
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
.pennyfarthing/scripts/run.sh sprint/new-sprint.sh 2605 277 2026-02-03 2026-02-16 "Polish and stabilization"
```

**Creates:**
- `sprint/current-sprint.yaml` - New sprint file
- `sprint/archive/sprint-{YYWW}-completed.yaml` - Empty archive

**Warning:** Prompts for confirmation if current sprint is still active.

---

### `/sprint promote <epic-id>`

Move an epic from `planning.yaml` to `current-sprint.yaml`.

**Run:**
```bash
.pennyfarthing/scripts/run.sh sprint/promote-epic.sh <epic-id>
```

**Arguments:**
| Arg | Required | Description |
|-----|----------|-------------|
| `epic-id` | Yes | Local epic ID (e.g., `epic-41`) |

**Example:**
```bash
.pennyfarthing/scripts/run.sh sprint/promote-epic.sh epic-41
```

**What it does:**
1. Finds epic in `sprint/planning.yaml`
2. Extracts epic metadata and all stories
3. Appends to `sprint/current-sprint.yaml` epics section
4. Outputs yq command to remove from planning.yaml

**Next steps after promote:**
- Review appended YAML in current-sprint.yaml
- Optionally create Jira epic: `/sprint epic create <epic-id>`
- Remove from planning.yaml if desired

---

### `/sprint epic create <epic-id> [--dry-run]`

Create a Jira epic and its child stories from sprint YAML.

**Run:**
```bash
.pennyfarthing/scripts/run.sh jira/create-jira-epic.sh <epic-id> [--dry-run]
```

**Arguments:**
| Arg | Required | Description |
|-----|----------|-------------|
| `epic-id` | Yes | Epic ID from current-sprint.yaml |
| `--dry-run` | No | Preview without creating issues |

**Example:**
```bash
.pennyfarthing/scripts/run.sh jira/create-jira-epic.sh MSSCI-11952
.pennyfarthing/scripts/run.sh jira/create-jira-epic.sh epic-41 --dry-run
```

**What it does:**
1. Creates Jira epic if no `jira:` field exists
2. Creates child stories linked to the epic
3. Sets story points and priority in Jira
4. Adds stories to current sprint (if jira_sprint_id set)
5. Updates sprint YAML with Jira keys

**Prerequisites:**
- `jira` CLI installed and configured
- `JIRA_API_TOKEN` environment variable set

---

### `/sprint reconcile [--fix]`

Generate a reconciliation report comparing sprint YAML against Jira.

**Run:**
```bash
.pennyfarthing/scripts/run.sh jira/jira-reconcile.sh [--fix]
```

**Arguments:**
| Arg | Required | Description |
|-----|----------|-------------|
| `--fix` | No | Apply automatic fixes where safe |

**Example:**
```bash
.pennyfarthing/scripts/run.sh jira/jira-reconcile.sh          # Report only
.pennyfarthing/scripts/run.sh jira/jira-reconcile.sh --fix    # Report and fix
```

**What it checks:**
1. **Status mismatches** - YAML status vs Jira status
2. **Missing Jira keys** - YAML stories without jira: field
3. **Orphan issues** - In Jira sprint but not in YAML
4. **Sprint membership** - YAML stories not in Jira sprint
5. **Epic sync** - Epic ID/jira field alignment

**What --fix does:**
- Adds YAML stories to Jira sprint if missing
- Does NOT auto-fix status mismatches (requires human decision)
- Does NOT create missing Jira issues (requires human decision)

---

### `/sprint epic sync <epic-id> [options]`

Sync an epic and its stories from sprint YAML to Jira.

**Run:**
```bash
.pennyfarthing/scripts/run.sh jira/sync-epic-jira.sh <epic-id> [options]
```

**Arguments:**
| Arg | Required | Description |
|-----|----------|-------------|
| `epic-id` | Yes | Epic ID from current-sprint.yaml |
| `--dry-run` | No | Preview without making changes |
| `--transition` | No | Transition Jira issues to match YAML status |
| `--points` | No | Sync story points from YAML to Jira |
| `--all` | No | Equivalent to `--transition --points` |

**Examples:**
```bash
.pennyfarthing/scripts/run.sh jira/sync-epic-jira.sh MSSCI-11952              # Show status
.pennyfarthing/scripts/run.sh jira/sync-epic-jira.sh MSSCI-11952 --dry-run    # Preview
.pennyfarthing/scripts/run.sh jira/sync-epic-jira.sh MSSCI-11952 --all        # Full sync
```

**What it does:**
1. Compares sprint YAML status with Jira status
2. Optionally transitions Jira issues to match
3. Optionally syncs story points to Jira
4. Reports sync summary

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
| Status | `backlog`, `ready`, `in_progress`, `done` |
| Workflow | `tdd`, `trivial`, `agent-docs`, `bdd` |
| Priority | `P0`, `P1`, `P2`, `P3` |
| in_sprint | `true`, `false` - Jira sprint membership |

## Sprint Schema

### Sprint-level fields

| Field | Description |
|-------|-------------|
| `name` | Sprint name in "TO Sprint YYWW" format |
| `jira_sprint_id` | Numeric Jira sprint ID (e.g., 276) |
| `jira_sprint_name` | Jira sprint name (should match name) |
| `goal` | Sprint goal/objective |
| `start_date` | YYYY-MM-DD |
| `end_date` | YYYY-MM-DD |
| `status` | `active` or `closed` |

### Story-level fields

| Field | Description |
|-------|-------------|
| `in_sprint` | `true/false` - whether story is in Jira sprint (synced bidirectionally) |

The `in_sprint` field tracks Jira sprint membership:
- `in_sprint: true` - Story is in the Jira sprint
- `in_sprint: false` - Story is not in Jira sprint (backlog)
- Field omitted - Sprint membership not explicitly tracked

**Bidirectional sync:**
- **Jira → YAML**: `syncStorySprintMembershipFromJira()` updates `in_sprint` based on Jira
- **YAML → Jira**: `syncStorySprintMembershipToJira()` adds/removes stories from Jira sprint

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
| `/sprint promote epic-41` | `promote-epic.sh epic-41` |
| `/sprint epic create MSSCI-XXX` | `create-jira-epic.sh MSSCI-XXX` |
| `/sprint epic sync MSSCI-XXX` | `sync-epic-jira.sh MSSCI-XXX` |
| `/new-work` | Alias for `/sprint work` |
| `/new-work MSSCI-XXX` | Alias for `/sprint work MSSCI-XXX` |
| `/new-work next` | Alias for `/sprint work next` |
| `/sprint reconcile` | `jira-reconcile.sh` |
| `/sprint reconcile --fix` | `jira-reconcile.sh --fix` |
