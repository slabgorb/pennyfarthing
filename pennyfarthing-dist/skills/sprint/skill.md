---
name: sprint
description: |
  Sprint status, backlog, and story management for Pennyfarthing. Use when checking current
  sprint status, finding available stories, reviewing backlog, or understanding story context
  and history.
  IMPORTANT: Always use `pf sprint` CLI commands - never manually edit sprint YAML.
args: "[status|backlog|work|archive|new|story|epic|standalone]"
---

# /sprint - Sprint Management

<critical>
Never manually edit `sprint/current-sprint.yaml`. Use `pf sprint` CLI commands for deterministic, correct YAML formatting.
</critical>

## Commands

### `/sprint` or `/sprint status [filter]`

Show current sprint status with story counts and points.

<run>
pf sprint status [filter]
</run>

<args>
| Arg | Required | Description |
|-----|----------|-------------|
| `filter` | No | Filter stories: `todo`, `in-progress`, `done`, `cancelled` |
</args>

<example>
pf sprint status              # All stories
pf sprint status todo         # Backlog only
pf sprint status in-progress  # WIP only
pf sprint status done         # Completed only
</example>

<output>
Sprint metadata, stories by status (grouped under epic headers), points breakdown, completed count from archive.
When filtered, only shows epics with matching stories.
</output>

---

### `/sprint backlog`

Show available stories grouped by epic with Jira context.

<run>
pf sprint backlog
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
pf sprint check <story-id>
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
pf sprint check MSSCI-12038
# Returns: {"type": "story", "available": true, "title": "...", ...}
</example>

#### With epic ID: Start first available story in epic

<run>
pf sprint check <epic-id>
</run>

<output>
Epic info with `first_story` (highest priority available story).
Action: Automatically start work on `first_story` if available.
</output>

<example>
pf sprint check MSSCI-11952
# Returns: {"type": "epic", "first_story": {"id": "MSSCI-11954", ...}, ...}
</example>

#### With `next`: Auto-select highest priority story

<run>
pf sprint check next
</run>

<output>
Highest-priority available story across all epics.
Action: Automatically start work on returned story.
</output>

<example>
pf sprint check next
# Returns: {"type": "next", "story": {"id": "MSSCI-11950", "priority": "P1", ...}}
</example>

---

### `/sprint archive <story-id> [pr-number] [--apply]`

Archive a completed story to the sprint archive file.

<run>
pf sprint archive <story-id> [pr-number] [--apply]
</run>

<args>
| Arg | Required | Description |
|-----|----------|-------------|
| `story-id` | Yes | Story ID (e.g., `35-2`) |
| `pr-number` | No | PR number if merged via PR |
| `--apply` | No | Also remove story from current-sprint.yaml |
</args>

<example>
# Archive only (manual removal needed)
pf sprint archive 35-2 368

# Archive and remove atomically (recommended)
pf sprint archive 35-2 368 --apply
</example>

<output>
1. Extracts story from `current-sprint.yaml`
2. Appends to `sprint/archive/sprint-{YYWW}-completed.yaml`
3. With `--apply`: Also removes from current sprint
4. Without `--apply`: Outputs command to complete removal
</output>

---

### `/sprint new <yyww> <jira-id> <start> <end> "<goal>"`

Initialize a new sprint from template.

<run>
pf sprint new <yyww> <jira-id> <start> <end> "<goal>"
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
pf sprint new 2605 277 2026-02-03 2026-02-16 "Polish and stabilization"
</example>

<output>
Creates:
- `sprint/current-sprint.yaml` - New sprint file
- `sprint/archive/sprint-{YYWW}-completed.yaml` - Empty archive

Warning: Prompts for confirmation if current sprint is still active.
</output>

---

### `/sprint future [--epic EPIC_ID]`

Show future work initiatives and epics available for promotion.

<run>
pf sprint future [EPIC_ID]
</run>

<args>
| Arg | Required | Description |
|-----|----------|-------------|
| `EPIC_ID` | No | Show detailed stories for a specific epic |
</args>

<output>
Without epic ID:
- Initiatives grouped by status (READY, BLOCKED, planning)
- Epics with points, priority, and status
- Summary of total epics and points
- Promotion instructions

With epic ID:
- Full epic details including description
- All stories with points and status
- Promotion command for that epic
</output>

<example>
# Show all future work
pf sprint future

# Show details for specific epic
pf sprint future epic-55
</example>

---

### `/sprint promote <epic-id>` (deprecated — use `/sprint epic promote`)

Move an epic from `future.yaml` to `current-sprint.yaml`.

<run>
pf sprint epic promote <epic-id>
</run>

<args>
| Arg | Required | Description |
|-----|----------|-------------|
| `epic-id` | Yes | Local epic ID (e.g., `epic-41`) |
</args>

<when>
Next steps after promote:
- Review appended YAML in current-sprint.yaml
- Create Jira epic: `/jira create epic <epic-id>`
- Remove from planning.yaml if desired
</when>

---

### `/sprint story show <story-id> [--json]`

Show details for a specific story.

<run>
pf sprint story show <story-id> [--json]
</run>

<args>
| Arg | Required | Description |
|-----|----------|-------------|
| `story-id` | Yes | Story ID (e.g., `MSSCI-12664` or `67-1`) |
| `--json` | No | Output as JSON |
</args>

---

### `/sprint story add <epic-id> "<title>" <points> [options]`

Add a new story to an epic in sprint YAML.

<run>
pf sprint story add <epic-id> "<title>" <points> [options]
</run>

<args>
| Arg | Required | Description |
|-----|----------|-------------|
| `epic-id` | Yes | Parent epic (e.g., `epic-76`) |
| `title` | Yes | Story title (quoted) |
| `points` | Yes | Story points (1, 2, 3, 5, 8) |
| `--type` | No | Story type: feature, bug, chore, refactor (default: feature) |
| `--priority` | No | Priority: P0, P1, P2, P3 (default: P1) |
| `--workflow` | No | Workflow: tdd, trivial, bdd (default: tdd) |
| `--jira` | No | Jira issue key |
</args>

<example>
pf sprint story add epic-76 "Add error handling" 3
pf sprint story add epic-76 "Fix null pointer" 2 --type bug
</example>

---

### `/sprint story update <story-id> [options]`

Update fields on a story.

<run>
pf sprint story update <story-id> [options]
</run>

<args>
| Arg | Required | Description |
|-----|----------|-------------|
| `story-id` | Yes | Story ID (e.g., `76-4`) |
| `--status` | No | New status (backlog, ready, in_progress, done, canceled) |
| `--points` | No | New points value |
| `--priority` | No | New priority |
| `--assigned-to` | No | Assignee |
| `--dry-run` | No | Preview changes without writing |
</args>

---

### `/sprint story size [points]`

Display story sizing guidelines.

<run>
pf sprint story size [points]
</run>

<args>
| Arg | Required | Description |
|-----|----------|-------------|
| `points` | No | Specific point value to show guidance for |
</args>

<output>
Sizing characteristics, workflow suggestions, examples.
</output>

---

### `/sprint story template [type]`

Display story templates by type.

<run>
pf sprint story template [type]
</run>

<args>
| Arg | Required | Description |
|-----|----------|-------------|
| `type` | No | Template type: feature, bug, refactor, chore |
</args>

<output>
YAML template with acceptance criteria patterns.
</output>

---

### `/sprint story finish <story-id> [--dry-run]`

Complete a story: archive session, merge PR, transition Jira, update sprint YAML.

<critical>
Prerequisites before running:
- Session file exists at `.session/{story-id}-session.md`
- PR is approved and mergeable
- Reviewer has approved (phase: finish in session)
</critical>

<run>
pf sprint story finish <story-id> [--dry-run]
</run>

<args>
| Arg | Required | Description |
|-----|----------|-------------|
| `story-id` | Yes | Story ID (e.g., `MSSCI-12052`) |
| `--dry-run` | No | Show what would be done without executing |
</args>

---

### `/sprint story claim <story-id> [--claim|--unclaim]`

Claim or unclaim a story in Jira.

<run>
pf sprint story claim <story-id>
</run>

---

### `/sprint story assign <story-id> <assignee>`

Assign a Jira story to a user. Shortcut for `/jira assign`.

<run>
pf jira assign <story-id> <assignee>
</run>

<args>
| Arg | Required | Description |
|-----|----------|-------------|
| `story-id` | Yes | Jira key (e.g., `MSSCI-14552`) |
| `assignee` | Yes | Email or GitHub username (e.g., `keith.avery@1898andco.io`, `slabgorb`) |
</args>

<example>
pf jira assign MSSCI-14552 keith.avery@1898andco.io
pf jira assign MSSCI-14552 slabgorb
</example>

---

### `/sprint epic add <epic-id> <title> [options]`

Add a new epic to the current sprint.

<run>
pf sprint epic add <epic-id> <title> [options]
</run>

<args>
| Arg | Required | Description |
|-----|----------|-------------|
| `epic-id` | Yes | Epic ID (e.g., `epic-85`) |
| `title` | Yes | Epic title |
| `--priority` | No | Priority: P0, P1, P2, P3 (default: P1) |
| `--jira` | No | Jira epic key |
| `--description` | No | Epic description |
</args>

---

### `/sprint epic promote <epic-id>`

Move an epic from `future.yaml` to `current-sprint.yaml`.

<run>
pf sprint epic promote <epic-id>
</run>

<args>
| Arg | Required | Description |
|-----|----------|-------------|
| `epic-id` | Yes | Local epic ID (e.g., `epic-41`) |
</args>

---

### `/sprint epic archive [epic-id] [--dry-run] [--jira]`

Archive completed epics.

<run>
pf sprint epic archive [epic-id] [--dry-run] [--jira]
</run>

---

### `/sprint epic import <file> [initiative] [--marker] [--dry-run]`

Import BMAD epics-and-stories output to future.yaml.

<run>
pf sprint epic import <file> [initiative] [--marker TAG] [--dry-run]
</run>

---

### `/sprint epic show <epic-id> [--json]`

Show details for a specific epic. Searches both current sprint and future initiative shards.

<run>
pf sprint epic show <epic-id> [--json]
</run>

<args>
| Arg | Required | Description |
|-----|----------|-------------|
| `epic-id` | Yes | Epic ID (e.g., `epic-42` or `MSSCI-14298`) |
| `--json` | No | Output as JSON |
</args>

---

### `/sprint epic cancel <epic-id> [--jira] [--dry-run]`

Cancel an epic and all its stories. Searches both current sprint and future initiative shards.

<run>
pf sprint epic cancel <epic-id> [--jira] [--dry-run]
</run>

<args>
| Arg | Required | Description |
|-----|----------|-------------|
| `epic-id` | Yes | Epic ID (e.g., `epic-42` or `MSSCI-14298`) |
| `--jira` | No | Also cancel the epic in Jira |
| `--dry-run` | No | Show what would be done without making changes |
</args>

---

### `/sprint epic remove <epic-id> [--dry-run]`

Remove an epic from future.yaml.

<run>
pf sprint epic remove <epic-id> [--dry-run]
</run>

---

### `/sprint initiative show <name> [--json]`

Show details for a specific initiative including its epics and stories.

<run>
pf sprint initiative show <name> [--json]
</run>

<args>
| Arg | Required | Description |
|-----|----------|-------------|
| `name` | Yes | Initiative slug (e.g., `benchmark-reliability`, `technical-debt`) |
| `--json` | No | Output as JSON |
</args>

---

### `/sprint initiative cancel <name> [--jira] [--dry-run]`

Cancel an initiative and all its epics/stories.

<run>
pf sprint initiative cancel <name> [--jira] [--dry-run]
</run>

<args>
| Arg | Required | Description |
|-----|----------|-------------|
| `name` | Yes | Initiative slug (e.g., `benchmark-reliability`, `technical-debt`) |
| `--jira` | No | Also cancel epics in Jira |
| `--dry-run` | No | Show what would be done without making changes |
</args>

---

### `/sprint standalone ["title"] [points]`

Wrap current changes into a standalone Jira story, branch, PR, and merge.

This is an agent-executed workflow. Use `/standalone` to run it interactively.

---

## Sizing Quick Reference

| Points | Scale | Complexity | Examples |
|--------|-------|------------|----------|
| 1-2 | Trivial | Single file, minimal testing | Config, typo, simple fix |
| 3 | Small | Few files, some testing | Validation, single component |
| 5 | Medium | Multiple files, comprehensive testing | New page, API endpoint |
| 8 | Large | Significant scope, extensive testing | Integration, major refactor |
| 13+ | **SPLIT** | Too complex for single story | Break into smaller stories |

## Acceptance Criteria Patterns

### Good AC (SMART)

<example>
- "Admin users can access /admin/settings without 403"
- "API returns 204 No Content on successful DELETE"
- "Tests cover admin, manager, analyst roles"
</example>

### Bad AC (Vague)

<critical>
Avoid these patterns:
- "Feature works correctly"
- "No bugs"
- "Good performance"
</critical>

---

## Read Operations

These commands read sprint YAML without modifying it. Use these instead of direct `yq` queries.

### Get Story Field

<run>
pf sprint story field <story-id> <field>
</run>

<args>
| Arg | Required | Description |
|-----|----------|-------------|
| `story-id` | Yes | Story ID (e.g., `35-2`) |
| `field` | Yes | Field name to extract |
</args>

<example>
pf sprint story field 35-2 workflow   # Returns: tdd
pf sprint story field 35-2 jira       # Returns: MSSCI-12345
pf sprint story field 35-2 status     # Returns: in_progress
</example>

<output>
Field value or "null" if not found. Common fields: `workflow`, `status`, `jira`, `points`, `title`, `repos`, `priority`.
</output>

---

### Get Epic Field

<run>
pf sprint epic field <epic-id> <field>
</run>

<args>
| Arg | Required | Description |
|-----|----------|-------------|
| `epic-id` | Yes | Epic ID (e.g., `epic-35` or just `35`) |
| `field` | Yes | Field name to extract |
</args>

<example>
pf sprint epic field epic-35 jira    # Returns: MSSCI-11234
pf sprint epic field 35 title        # Returns: Epic title
</example>

<output>
Field value or "null" if not found. Common fields: `jira`, `title`, `description`, `status`.
</output>

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
d="$PWD"; while [[ ! -d "$d/.claude" ]] && [[ "$d" != "/" ]]; do d="$(dirname "$d")"; done; "$d/.pennyfarthing/scripts/core/agent-session.sh" start "sm"
```
</agent-activation>

### Story Setup Steps

<output>
1. **Check story** via `pf sprint check` (if ID provided)
2. **Write context** to `.session/context-story-{id}.md`
3. **Setup story** via `sm-setup` subagent (claims Jira, creates branch)
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

All sprint commands use the `pf` Python CLI. No external dependencies like `yq` are required.

<when>
For Jira integration, see `/jira` skill prerequisites.
</when>

## Quick Reference

| Command | CLI |
|---------|-----|
| `/sprint` | `pf sprint status` |
| `/sprint status` | `pf sprint status` |
| `/sprint status todo` | `pf sprint status todo` |
| `/sprint status in-progress` | `pf sprint status in-progress` |
| `/sprint status done` | `pf sprint status done` |
| `/sprint backlog` | `pf sprint backlog` |
| `/sprint work` | Interactive story selection → SM flow |
| `/sprint work MSSCI-XXX` | `pf sprint check MSSCI-XXX` → direct start |
| `/sprint work EPIC-ID` | `pf sprint check EPIC-ID` → start first story |
| `/sprint work next` | `pf sprint check next` → start highest priority |
| `/sprint archive MSSCI-XXX` | `pf sprint archive MSSCI-XXX` |
| `/sprint new 2605 277 ...` | `pf sprint new 2605 277 ...` |
| `/sprint future` | `pf sprint future` |
| `/sprint future epic-55` | `pf sprint future epic-55` |
| `/sprint story show ID` | `pf sprint story show ID` |
| `/sprint story add ...` | `pf sprint story add ...` |
| `/sprint story update ID` | `pf sprint story update ID` |
| `/sprint story field ID FIELD` | `pf sprint story field ID FIELD` |
| `/sprint story size` | `pf sprint story size` |
| `/sprint story template` | `pf sprint story template` |
| `/sprint story finish ID` | `pf sprint story finish ID` |
| `/sprint story claim ID` | `pf sprint story claim ID` |
| `/sprint story assign ID USER` | `pf jira assign ID USER` |
| `/sprint epic show ID` | `pf sprint epic show ID` |
| `/sprint epic field ID FIELD` | `pf sprint epic field ID FIELD` |
| `/sprint epic add ...` | `pf sprint epic add ...` |
| `/sprint epic promote ID` | `pf sprint epic promote ID` |
| `/sprint epic archive` | `pf sprint epic archive` |
| `/sprint epic cancel ID` | `pf sprint epic cancel ID` |
| `/sprint epic import FILE` | `pf sprint epic import FILE` |
| `/sprint epic remove ID` | `pf sprint epic remove ID` |
| `/sprint initiative show NAME` | `pf sprint initiative show NAME` |
| `/sprint initiative cancel NAME` | `pf sprint initiative cancel NAME` |
| `/sprint standalone` | Standalone story workflow |
| `/new-work` | Alias for `/sprint work` |
| `/new-work MSSCI-XXX` | Alias for `/sprint work MSSCI-XXX` |
| `/new-work next` | Alias for `/sprint work next` |

## Related Skills

| Skill | Purpose |
|-------|---------|
| `/jira` | Jira operations (create, sync, reconcile, claim) |
