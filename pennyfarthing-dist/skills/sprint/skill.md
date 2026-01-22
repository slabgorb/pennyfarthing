---
name: sprint
description: |
  Sprint status, backlog, and story management for Pennyfarthing. Use when checking current
  sprint status, finding available stories, reviewing backlog, or understanding story context
  and history.
  IMPORTANT: Always use the provided scripts - never manually edit sprint YAML.
args: "[status|backlog|work|archive|new|promote]"
---

# /sprint - Sprint Management

<critical>
Never manually edit `sprint/current-sprint.yaml`. Use the scripts below for deterministic, correct YAML formatting.
</critical>

## Commands

### `/sprint` or `/sprint status`

Show current sprint status with story counts and points.

<run>
.pennyfarthing/scripts/run.sh sprint/sprint-status.sh
</run>

<output>
Sprint metadata, stories by status, points breakdown, completed count from archive.
</output>

---

### `/sprint backlog`

Show available stories grouped by epic with Jira context.

<run>
.pennyfarthing/scripts/run.sh sprint/available-stories.sh
</run>

<output>
Backlog stories with epic descriptions, points, priority, and workflow tags.
</output>

---

### `/sprint work [story-id|epic-id|next]`

Start work on a story. This is the primary entry point for development work.

<when>
- Starting new development work
- `/new-work` is an alias for this command
</when>

#### Without argument: Interactive selection

Shows backlog, user selects story, then proceeds to setup.

<output>
1. Load SM persona
2. Check for in-progress work
3. Show available stories
4. User selects story
5. Setup and handoff to TEA/Dev
</output>

#### With story ID: Direct start

<run>
.pennyfarthing/scripts/run.sh sprint/check-story.sh <story-id>
</run>

<args>
| Arg | Required | Description |
|-----|----------|-------------|
| `story-id` | Yes | Jira key (e.g., `MSSCI-12038`) |
</args>

<output>
- `available: true` - Skip backlog, proceed to setup
- `available: false` - Report why (assigned, in progress, etc.)
</output>

<example>
.pennyfarthing/scripts/run.sh sprint/check-story.sh MSSCI-12038
# Returns: {"type": "story", "available": true, "title": "...", ...}
</example>

#### With epic ID: Start first available story in epic

<run>
.pennyfarthing/scripts/run.sh sprint/check-story.sh <epic-id>
</run>

<output>
Epic info with `first_story` (highest priority available story).
Action: Automatically start work on `first_story` if available.
</output>

<example>
.pennyfarthing/scripts/run.sh sprint/check-story.sh MSSCI-11952
# Returns: {"type": "epic", "first_story": {"id": "MSSCI-11954", ...}, ...}
</example>

#### With `next`: Auto-select highest priority story

<run>
.pennyfarthing/scripts/run.sh sprint/check-story.sh next
</run>

<output>
Highest-priority available story across all epics.
Action: Automatically start work on returned story.
</output>

<example>
.pennyfarthing/scripts/run.sh sprint/check-story.sh next
# Returns: {"type": "next", "story": {"id": "MSSCI-11950", "priority": "P1", ...}}
</example>

---

### `/sprint archive <story-id> [pr-number]`

Archive a completed story to the sprint archive file.

<run>
.pennyfarthing/scripts/run.sh sprint/archive-story.sh <story-id> [pr-number]
</run>

<args>
| Arg | Required | Description |
|-----|----------|-------------|
| `story-id` | Yes | Jira key (e.g., `MSSCI-11945`) |
| `pr-number` | No | PR number if merged via PR |
</args>

<example>
.pennyfarthing/scripts/run.sh sprint/archive-story.sh MSSCI-11945 368
</example>

<output>
1. Extracts story from `current-sprint.yaml`
2. Appends to `sprint/archive/sprint-{YYWW}-completed.yaml`
3. Outputs yq command to remove from current sprint
</output>

<critical>
After running, execute the provided yq command to complete removal:
```bash
yq eval -i 'del(.epics[].stories[] | select(.id == "MSSCI-11945"))' sprint/current-sprint.yaml
```
</critical>

---

### `/sprint new <yyww> <jira-id> <start> <end> "<goal>"`

Initialize a new sprint from template.

<run>
.pennyfarthing/scripts/run.sh sprint/new-sprint.sh <yyww> <jira-id> <start> <end> "<goal>"
</run>

<args>
| Arg | Required | Description |
|-----|----------|-------------|
| `yyww` | Yes | Sprint identifier (e.g., `2605` for 2026 week 5) |
| `jira-id` | Yes | Jira sprint ID number (e.g., `277`) |
| `start` | Yes | Start date `YYYY-MM-DD` |
| `end` | Yes | End date `YYYY-MM-DD` |
| `goal` | Yes | Sprint goal (quoted string) |
</args>

<example>
.pennyfarthing/scripts/run.sh sprint/new-sprint.sh 2605 277 2026-02-03 2026-02-16 "Polish and stabilization"
</example>

<output>
Creates:
- `sprint/current-sprint.yaml` - New sprint file
- `sprint/archive/sprint-{YYWW}-completed.yaml` - Empty archive

Warning: Prompts for confirmation if current sprint is still active.
</output>

---

### `/sprint promote <epic-id>`

Move an epic from `planning.yaml` to `current-sprint.yaml`.

<run>
.pennyfarthing/scripts/run.sh sprint/promote-epic.sh <epic-id>
</run>

<args>
| Arg | Required | Description |
|-----|----------|-------------|
| `epic-id` | Yes | Local epic ID (e.g., `epic-41`) |
</args>

<example>
.pennyfarthing/scripts/run.sh sprint/promote-epic.sh epic-41
</example>

<output>
1. Finds epic in `sprint/planning.yaml`
2. Extracts epic metadata and all stories
3. Appends to `sprint/current-sprint.yaml` epics section
4. Outputs yq command to remove from planning.yaml
</output>

<when>
Next steps after promote:
- Review appended YAML in current-sprint.yaml
- Create Jira epic: `/jira create epic <epic-id>`
- Remove from planning.yaml if desired
</when>

---

## Jira Operations

For Jira-specific operations, use the `/jira` skill:

| Task | Command |
|------|---------|
| Create epic in Jira | `/jira create epic <epic-id>` |
| Sync epic to Jira | `/jira sync <epic-id>` |
| Reconcile YAML vs Jira | `/jira reconcile` |
| Claim a story | `/jira claim <issue-key>` |
| View issue details | `/jira view <issue-key>` |

---

## Work Flow Details

<when>
When `/sprint work` (or `/new-work`) starts a story:
</when>

<agent-activation>
Load SM persona first:
```bash
d="$PWD"; while [[ ! -d "$d/.claude" ]] && [[ "$d" != "/" ]]; do d="$(dirname "$d")"; done; "$d/.pennyfarthing/scripts/run.sh" core/agent-session.sh start "sm"
```
</agent-activation>

### Story Setup Steps

<output>
1. **Check story** via `check-story.sh` (if ID provided)
2. **Write context** to `.session/context-story-{id}.md`
3. **Setup story** via `generic-sm-setup` subagent (claims Jira, creates branch)
4. **Handoff** to next agent based on workflow:

| Workflow | Route |
|----------|-------|
| `trivial` | SM → Dev |
| `tdd` | SM → TEA → Dev → Reviewer |
| `agent-docs` | SM → Orchestrator |
</output>

### Gates Before Handoff

<critical>
All gates must pass before handoff:
- [ ] Session file exists at `.session/{story-id}-session.md`
- [ ] Story context written with ACs
- [ ] Jira claimed (assigned, In Progress)
- [ ] Branch created
</critical>

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

<output>
The `in_sprint` field tracks Jira sprint membership:
- `in_sprint: true` - Story is in the Jira sprint
- `in_sprint: false` - Story is not in Jira sprint (backlog)
- Field omitted - Sprint membership not explicitly tracked
</output>

## Dependencies

<run>
brew install yq
</run>

<when>
For Jira integration, see `/jira` skill prerequisites.
</when>

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
| `/new-work` | Alias for `/sprint work` |
| `/new-work MSSCI-XXX` | Alias for `/sprint work MSSCI-XXX` |
| `/new-work next` | Alias for `/sprint work next` |

## Related Skills

| Skill | Purpose |
|-------|---------|
| `/jira` | Jira operations (create, sync, reconcile, claim) |
| `/story` | Story creation, sizing, finish workflow |
