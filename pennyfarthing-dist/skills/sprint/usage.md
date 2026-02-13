# Sprint CLI — Detailed Usage

## Top-Level Commands

### `pf sprint status [FILTER]`

| Arg | Required | Type | Description |
|-----|----------|------|-------------|
| `FILTER` | No | Choice | `backlog`, `todo`, `in-progress`, `review`, `done` |

Returns sprint metadata, stories grouped by epic, points breakdown.

### `pf sprint backlog`

No arguments. Shows stories with `backlog`, `ready`, or `planning` status grouped by epic.

### `pf sprint work [STORY_ID] [--dry-run]`

| Arg/Option | Required | Description |
|------------|----------|-------------|
| `STORY_ID` | No | Story ID, or `next` for highest priority |
| `--dry-run` | No | Preview without making changes |

Without argument: shows backlog. With `next`: auto-selects highest priority.

### `pf sprint archive <STORY_ID> [PR_NUMBER] [--apply] [--dry-run]`

| Arg/Option | Required | Description |
|------------|----------|-------------|
| `STORY_ID` | Yes | Story ID to archive |
| `PR_NUMBER` | No | PR number if merged via PR |
| `--apply` | No | Also remove from current-sprint.yaml |
| `--dry-run` | No | Preview without making changes |

### `pf sprint new <YYWW> <JIRA_ID> <START> <END> <GOAL> [--dry-run]`

| Arg | Required | Description |
|-----|----------|-------------|
| `YYWW` | Yes | Sprint identifier (e.g., `2607`) |
| `JIRA_ID` | Yes | Jira sprint ID number |
| `START` | Yes | Start date `YYYY-MM-DD` |
| `END` | Yes | End date `YYYY-MM-DD` |
| `GOAL` | Yes | Sprint goal (quoted string) |
| `--dry-run` | No | Preview without making changes |

Creates `sprint/current-sprint.yaml` and `sprint/archive/sprint-{YYWW}-completed.yaml`.

### `pf sprint future [EPIC_ID]`

| Arg | Required | Description |
|-----|----------|-------------|
| `EPIC_ID` | No | Show detailed stories for a specific epic |

Without arg: initiative summary. With arg: full epic detail with stories.

### `pf sprint info`

No arguments. Returns sprint header fields plus computed totals as JSON.

### `pf sprint metrics [--json]`

| Option | Description |
|--------|-------------|
| `--json` | Output in JSON format |

Shows points, stories, timeline, and velocity tracking.

### `pf sprint check <ID>`

| Arg | Required | Description |
|-----|----------|-------------|
| `ID` | Yes | Story ID, epic ID, or `next` |

Returns JSON with `type` (`story`, `epic`, `next`, `not_found`), availability, and details.

### `pf sprint validate [SUBCOMMAND] [--fix] [--strict]`

| Arg/Option | Required | Description |
|------------|----------|-------------|
| Subcommand | No | `sprint`, `schema`, `agent`, `workflow` (omit for all) |
| `--fix` | No | Auto-fix format issues |
| `--strict` | No | Treat warnings as errors |

---

## Story Commands

### `pf sprint story show <STORY_ID> [--json]`

| Arg/Option | Required | Description |
|------------|----------|-------------|
| `STORY_ID` | Yes | Story ID (e.g., `MSSCI-12664` or `67-1`) |
| `--json` | No | Output as JSON |

### `pf sprint story add <EPIC_ID> <TITLE> <POINTS> [options]`

| Arg/Option | Required | Description |
|------------|----------|-------------|
| `EPIC_ID` | Yes | Parent epic (e.g., `76`) |
| `TITLE` | Yes | Story title (quoted) |
| `POINTS` | Yes | Story points (integer) |
| `--type` | No | `feature` (default), `bug`, `chore`, `refactor` |
| `--priority` | No | `p0`, `p1` (default), `p2`, `p3` (case-insensitive) |
| `--workflow` | No | `tdd` (default), `trivial`, `bdd` |
| `--jira` | No | Jira issue key |
| `--initiative` | No | Add as standalone story to initiative slug instead |
| `--repos` | No | Repository scope (default: `pennyfarthing`) |
| `--sprint-file` | No | Path to sprint YAML file |
| `--dry-run` | No | Preview without making changes |

When using `--initiative`, positional args shift: `<TITLE> <POINTS>` (no epic ID).

### `pf sprint story update <STORY_ID> [options]`

| Arg/Option | Required | Description |
|------------|----------|-------------|
| `STORY_ID` | Yes | Story ID (e.g., `76-4`) |
| `--status` | No | `backlog`, `ready`, `in_progress`, `done`, `canceled` |
| `--points` | No | New points value |
| `--priority` | No | New priority |
| `--assigned-to` | No | Assignee email |
| `--workflow` | No | New workflow type |
| `--completed` | No | Completed date (ISO format) |
| `--started` | No | Started date (ISO format) |
| `--sprint-file` | No | Path to sprint YAML file |
| `--dry-run` | No | Preview without making changes |

Auto-sets `completed` date when status is `done`. Auto-sets `started` and `assigned_to` when status is `in_progress`.

### `pf sprint story field <STORY_ID> <FIELD>`

| Arg | Required | Description |
|-----|----------|-------------|
| `STORY_ID` | Yes | Story ID (e.g., `79-1` or `MSSCI-12345`) |
| `FIELD` | Yes | Field name: `workflow`, `status`, `jira`, `points`, `title`, `repos`, `priority` |

Returns field value or `null`. Defaults: `workflow=tdd`, `status=backlog`, `repos=pennyfarthing`.

### `pf sprint story size [POINTS]`

| Arg | Required | Description |
|-----|----------|-------------|
| `POINTS` | No | Specific point value |

### `pf sprint story template [TYPE]`

| Arg | Required | Description |
|-----|----------|-------------|
| `TYPE` | No | `feature`, `bug`, `refactor`, `chore` |

### `pf sprint story finish <STORY_ID> [--dry-run]`

| Arg/Option | Required | Description |
|------------|----------|-------------|
| `STORY_ID` | Yes | Story ID (e.g., `83-2`) |
| `--dry-run` | No | Show steps without executing |

Requires: session file exists, PR approved, reviewer phase complete.

### `pf sprint story claim <STORY_ID> [--claim/--unclaim] [--dry-run]`

| Arg/Option | Required | Description |
|------------|----------|-------------|
| `STORY_ID` | Yes | Story ID / Jira key |
| `--claim/--unclaim` | No | Claim (default) or unclaim |
| `--dry-run` | No | Preview without making changes |

---

## Epic Commands

### `pf sprint epic show <EPIC_ID> [--json]`

| Arg/Option | Required | Description |
|------------|----------|-------------|
| `EPIC_ID` | Yes | Epic ID (e.g., `epic-42`, `42`, or `MSSCI-14298`) |
| `--json` | No | Output as JSON |

Searches both current sprint and future initiative shards.

### `pf sprint epic add <EPIC_ID> <TITLE> [options]`

| Arg/Option | Required | Description |
|------------|----------|-------------|
| `EPIC_ID` | Yes | Epic ID (e.g., `epic-85`) |
| `TITLE` | Yes | Epic title |
| `--priority` | No | `p0`, `p1` (default), `p2`, `p3` (case-insensitive) |
| `--status` | No | `backlog` (default), `ready`, `in_progress` |
| `--repos` | No | Repository scope (default: `pennyfarthing`) |
| `--jira` | No | Jira epic key |
| `--description` / `-d` | No | Epic description |
| `--sprint-file` | No | Path to sprint YAML file |
| `--dry-run` | No | Preview without making changes |

### `pf sprint epic update <EPIC_ID> [options]`

| Arg/Option | Required | Description |
|------------|----------|-------------|
| `EPIC_ID` | Yes | Epic ID (e.g., `103`, `epic-103`, or `MSSCI-14951`) |
| `--status` | No | `backlog`, `canceled`, `done`, `in_progress` |
| `--priority` | No | New priority (e.g., `P0`, `P1`) |
| `--sprint-file` | No | Path to sprint YAML file |
| `--dry-run` | No | Preview without making changes |

### `pf sprint epic promote <EPIC_ID> [--dry-run]`

| Arg/Option | Required | Description |
|------------|----------|-------------|
| `EPIC_ID` | Yes | Epic ID (e.g., `epic-41` or `41`) |
| `--dry-run` | No | Preview without making changes |

Moves epic from initiative shard to current-sprint.yaml. Detects ID collisions. Validates before writing.

### `pf sprint epic archive [EPIC_ID] [--dry-run] [--jira]`

| Arg/Option | Required | Description |
|------------|----------|-------------|
| `EPIC_ID` | No | Specific epic (omit to scan all completed) |
| `--dry-run` | No | Preview without making changes |
| `--jira` | No | Also update Jira epic status to Done |

### `pf sprint epic cancel <EPIC_ID> [--jira] [--dry-run]`

| Arg/Option | Required | Description |
|------------|----------|-------------|
| `EPIC_ID` | Yes | Epic ID (e.g., `epic-42` or `MSSCI-14298`) |
| `--jira` | No | Also cancel in Jira |
| `--dry-run` | No | Preview without making changes |

### `pf sprint epic import <FILE> [INITIATIVE] [--marker TAG] [--dry-run]`

| Arg/Option | Required | Description |
|------------|----------|-------------|
| `FILE` | Yes | Path to BMAD epics-and-stories markdown |
| `INITIATIVE` | No | Initiative name (extracted from file if omitted) |
| `--marker` | No | Marker tag for stories (default: `imported`) |
| `--dry-run` | No | Preview without making changes |

### `pf sprint epic remove <EPIC_ID> [--dry-run]`

| Arg/Option | Required | Description |
|------------|----------|-------------|
| `EPIC_ID` | Yes | Epic ID (e.g., `epic-41`) |
| `--dry-run` | No | Preview without making changes |

### `pf sprint epic field <EPIC_ID> <FIELD>`

| Arg | Required | Description |
|-----|----------|-------------|
| `EPIC_ID` | Yes | Epic ID (e.g., `epic-35` or `35`) |
| `FIELD` | Yes | Field name: `jira`, `title`, `description`, `status` |

---

## Initiative Commands

### `pf sprint initiative show <NAME> [--json]`

| Arg/Option | Required | Description |
|------------|----------|-------------|
| `NAME` | Yes | Initiative slug (e.g., `benchmark-reliability`) |
| `--json` | No | Output as JSON |

### `pf sprint initiative cancel <NAME> [--jira] [--dry-run]`

| Arg/Option | Required | Description |
|------------|----------|-------------|
| `NAME` | Yes | Initiative slug |
| `--jira` | No | Also cancel epics in Jira |
| `--dry-run` | No | Preview without making changes |

---

## File Locations

| File | Purpose |
|------|---------|
| `sprint/current-sprint.yaml` | Active/backlog work |
| `sprint/archive/sprint-{YYWW}-completed.yaml` | Completed stories |
| `sprint/initiative-*.yaml` | Future initiative shards |
| `sprint/epic-*.yaml` | Epic shard files |
| `sprint/future.yaml` | Future initiative index |

## YAML Constraints

| Field | Valid Values |
|-------|-------------|
| Sprint name | `"TO Sprint YYWW"` |
| Status | `backlog`, `ready`, `in_progress`, `done`, `canceled` |
| Workflow | `tdd`, `trivial`, `bdd`, `tdd-tandem`, `bdd-tandem`, `agent-docs` |
| Priority | `P0`, `P1`, `P2`, `P3` |

Note: `tdd-tandem` and `bdd-tandem` are valid workflow values in YAML but the `pf sprint story add --workflow` CLI choice is limited to `tdd`, `trivial`, `bdd`. Set tandem workflows via `pf sprint story update --workflow tdd-tandem`.
