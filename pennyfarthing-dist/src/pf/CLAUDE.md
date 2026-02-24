# CLAUDE.md — pf CLI

Python Click CLI for Pennyfarthing. Entry point: `pf/cli.py`. Invoked as `pf`.

## Command Index

| Command | Description | Source |
|---------|-------------|--------|
| `pf sprint` | Sprint status and story operations | `sprint/cli.py` |
| `pf jira` | Jira issue management | `jira/cli.py` |
| `pf theme` | Persona theme management | `theme/cli.py` |
| `pf bc` | Panel focus and layout management | `bc/cli.py` |
| `pf validate` | Project validators | `validate/cli.py` |
| `pf agent` | Agent session management | `cli.py` (inline) |
| `pf workflow` | Workflow state and phase management | `workflow/cli.py` |
| `pf bikerack` | BikeRack dashboard launcher | `bikerack/cli.py` |
| `pf git` | Repository operations (status, branches, worktree, hooks) | `git_group/cli.py` |
| `pf debug` | Analysis tools (hotspots, deadcode, healthscore) | `cli.py` (inline group) |

### Sugar Shortcuts

| Shortcut | Expands To |
|----------|------------|
| `pf status` | `pf sprint status` |
| `pf backlog` | `pf sprint backlog` |
| `pf work` | `pf sprint work` |
| `pf story` | `pf sprint story` |

## pf sprint

| Command | Description | Source |
|---------|-------------|--------|
| `pf sprint status [FILTER]` | Show sprint status. Filter: `all`, `backlog`, `in-progress`, `done`, `in-review` | `sprint/status.py` |
| `pf sprint backlog` | Available stories grouped by epic | `sprint/cli.py` |
| `pf sprint work [STORY_ID]` | Start work on a story (`next` for auto-select) | `sprint/work.py` |
| `pf sprint check IDENTIFIER` | Check story/epic availability (JSON output) | `sprint/cli.py` |
| `pf sprint info` | Sprint header as JSON | `sprint/cli.py` |
| `pf sprint metrics` | Sprint metrics and velocity | `sprint/cli.py` |
| `pf sprint future [EPIC_ID]` | Future initiatives overview | `sprint/cli.py` |
| `pf sprint new` | Initialize a new sprint | `sprint/cli.py` |
| `pf sprint archive STORY_ID PR` | Archive a completed story | `sprint/archive.py` |
| `pf sprint standalone TITLE` | Wrap changes into standalone Jira story + PR | `sprint/cli.py` |
| `pf sprint validate` | Validate sprint YAML | `sprint/validate_cmd.py` |

### pf sprint story

| Command | Description | Source |
|---------|-------------|--------|
| `pf sprint story show ID` | Show story details | `sprint/cli.py` |
| `pf sprint story add EPIC_ID TITLE POINTS` | Add story to epic | `sprint/story_add.py` |
| `pf sprint story update ID [OPTIONS]` | Update story fields | `sprint/story_update.py` |
| `pf sprint story field ID FIELD` | Get single field value | `sprint/cli.py` |
| `pf sprint story size [POINTS]` | Sizing guidelines | `sprint/cli.py` |
| `pf sprint story template [TYPE]` | Story templates | `sprint/cli.py` |
| `pf sprint story finish ID` | Complete story (archive, merge, Jira) | `sprint/story_finish.py` |
| `pf sprint story claim JIRA_KEY` | Claim/unclaim in Jira | `sprint/cli.py` |

### pf sprint epic

| Command | Description | Source |
|---------|-------------|--------|
| `pf sprint epic show ID` | Show epic details | `sprint/cli.py` |
| `pf sprint epic add ID TITLE` | Add new epic | `sprint/epic_add.py` |
| `pf sprint epic update ID [OPTIONS]` | Update epic fields | `sprint/epic_update.py` |
| `pf sprint epic field ID FIELD` | Get single field value | `sprint/cli.py` |
| `pf sprint epic promote ID` | Move from future to current sprint | `sprint/cli.py` |
| `pf sprint epic archive [ID]` | Archive completed epics | `sprint/archive_epic.py` |
| `pf sprint epic cancel ID` | Cancel epic and all stories | `sprint/cli.py` |
| `pf sprint epic import FILE` | Import BMAD epics to future.yaml | `sprint/import_epic.py` |
| `pf sprint epic remove ID` | Remove from future.yaml | `sprint/cli.py` |

### pf sprint initiative

| Command | Description | Source |
|---------|-------------|--------|
| `pf sprint initiative show ID` | Show initiative details | `sprint/cli.py` |
| `pf sprint initiative cancel ID` | Cancel initiative and all children | `sprint/cli.py` |

## pf jira

| Command | Description | Source |
|---------|-------------|--------|
| `pf jira view KEY` | View issue details | `jira/cli.py` |
| `pf jira check KEY` | Check if story is available | `jira/cli.py` |
| `pf jira claim KEY` | Assign to self + In Progress | `jira/claim.py` |
| `pf jira assign KEY USER` | Assign to user (email or GitHub username) | `jira/cli.py` |
| `pf jira move KEY STATUS` | Transition issue status | `jira/cli.py` |
| `pf jira link KEY1 KEY2 [TYPE]` | Link two issues | `jira/cli.py` |
| `pf jira search JQL` | Search by JQL | `jira/cli.py` |
| `pf jira create epic EPIC_ID` | Create epic + children from YAML | `jira/epic.py` |
| `pf jira create story EPIC_KEY STORY_ID` | Create single story under epic | `jira/story.py` |
| `pf jira create standalone TITLE` | Create standalone story, add to sprint, Done | `jira/create.py` |
| `pf jira sync EPIC_ID` | Sync YAML to Jira | `jira/sync.py` |
| `pf jira bidirectional` | Bidirectional sync (Jira wins by default) | `jira/bidirectional.py` |
| `pf jira reconcile` | Report mismatches between YAML and Jira | `jira/reconcile.py` |
| `pf jira sprint add SPRINT_ID KEY` | Add issue to sprint | `jira/cli.py` |

## pf theme

| Command | Description | Source |
|---------|-------------|--------|
| `pf theme list` | All available themes | `theme/cli.py` |
| `pf theme show [NAME]` | Theme details (current if no name) | `theme/cli.py` |
| `pf theme set NAME` | Set active theme | `theme/cli.py` |
| `pf theme create NAME` | Create custom theme from base | `theme/cli.py` |

## pf bc

| Command | Description | Source |
|---------|-------------|--------|
| `pf bc <panel>` | Focus panel (sprint, git, diffs, todo, workflow, background, audit-log, changed, ac, debug, settings, tty) | `bc/cli.py` |
| `pf bc reset` | Clear focus | `bc/cli.py` |
| `pf bc save NAME` | Save current layout | `bc/cli.py` |
| `pf bc load NAME` | Load saved layout | `bc/cli.py` |
| `pf bc list` | List saved layouts | `bc/cli.py` |
| `pf bc clear NAME` | Delete layout | `bc/cli.py` |
| `pf bc clear-all` | Delete all layouts | `bc/cli.py` |

## pf validate

| Command | Description | Source |
|---------|-------------|--------|
| `pf validate` | Run all validators | `validate/cli.py` |
| `pf validate sprint` | Sprint YAML validation | `validate/cli.py` |
| `pf validate schema` | XML schema validation | `validate/cli.py` |
| `pf validate agent` | Agent definition validation | `validate/cli.py` |
| `pf validate workflow` | Workflow definition validation | `validate/cli.py` |

Options: `--fix` (auto-fix), `--strict` (warnings as errors)

## pf agent

| Command | Description | Source |
|---------|-------------|--------|
| `pf agent start NAME` | Start agent session with context | `prime/` |

Options: `--session-id`, `--no-persona`, `--json`, `--minimal`, `--full`, `--quiet`, `--tier {full,refresh,handoff,minimal}`

## pf workflow

| Command | Description | Source |
|---------|-------------|--------|
| `pf workflow check [--json]` | Current workflow state | `workflow/cli.py` |
| `pf workflow phase-check WORKFLOW PHASE` | Check phase owner | `workflow/cli.py` |
| `pf workflow handoff AGENT` | Emit handoff marker | `workflow/cli.py` |
| `pf workflow type WORKFLOW` | Get workflow type (phased/stepped/procedural) | `workflow/cli.py` |
| `pf workflow list` | List all available workflows | `workflow/cli.py` |
| `pf workflow show [NAME]` | Show workflow details | `workflow/cli.py` |
| `pf workflow start NAME [--mode M]` | Start stepped workflow | `workflow/cli.py` |
| `pf workflow resume [NAME]` | Resume interrupted workflow | `workflow/cli.py` |
| `pf workflow status [NAME]` | Show stepped workflow progress | `workflow/cli.py` |
| `pf workflow fix-phase ID PHASE [--dry-run]` | Repair session phase | `workflow/cli.py` |
| `pf workflow complete-step [NAME] [--step N]` | Complete current step | `workflow/cli.py` |

## pf bikerack

| Command | Description | Source |
|---------|-------------|--------|
| `pf bikerack start` | Start BikeRack + Claude CLI | `bikerack/cli.py` |
| `pf bikerack stop` | Stop running instance | `bikerack/cli.py` |
| `pf bikerack status` | Show running state | `bikerack/cli.py` |

## pf git

| Command | Description | Source |
|---------|-------------|--------|
| `pf git status [--brief]` | Check git status of all repos | `git/status_all.py` |
| `pf git branches BRANCH [--repos all\|api\|ui]` | Create feature branches | `git/create_branches.py` |
| `pf git cleanup` | Start git-cleanup workflow | `git_group/cli.py` |
| `pf git worktree create NAME BRANCH` | Create worktree(s) | `git/worktree.py` |
| `pf git worktree remove NAME` | Remove worktree | `git/worktree.py` |
| `pf git worktree list` | List active worktrees | `git/worktree.py` |
| `pf git worktree status` | Show worktree status | `git/worktree.py` |
| `pf git install-hooks` | Install git hooks with .d/ dispatcher | `git/hooks_installer.py` |

## pf debug

| Command | Description | Source |
|---------|-------------|--------|
| `pf debug hotspots analyze` | Full hotspot analysis | `hotspots/analyze.py` |
| `pf debug hotspots files` | File-level hotspot report | `hotspots/cli.py` |
| `pf debug hotspots dirs` | Directory-level hotspot report | `hotspots/cli.py` |
| `pf debug deadcode stale` | Files with no recent commits | `deadcode/analyze.py` |
| `pf debug deadcode exports` | Unused TypeScript exports | `deadcode/cli.py` |
| `pf debug healthscore analyze` | Composite health score | `healthscore/cli.py` |

## Hooks (`pf hooks`)

All hooks are in `hooks/` subpackage, invoked via `pf hooks <name>`.

| Command | Hook Type | Purpose |
|---------|-----------|---------|
| `pf hooks session-start` | SessionStart | Session setup, checkpoint, WheelHub, welcome |
| `pf hooks session-stop` | Stop | Save checkpoint for cross-session continuity |
| `pf hooks reflector-check` | Stop | Enforce CYCLIST reflector markers |
| `pf hooks pre-edit-check` | PreToolUse | Block edits to protected files |
| `pf hooks context-warning` | PreToolUse | Warn when context usage is high |
| `pf hooks context-breaker` | PreToolUse | Block tool execution at critical context |
| `pf hooks cyclist-pretooluse` | PreToolUse | Route approval through WheelHub |
| `pf hooks schema-validation` | PreToolUse:Write | Validate session/skill/step schema |
| `pf hooks bell-mode` | PostToolUse | Bell queue + tandem injection |
| `pf hooks sprint-yaml` | PostToolUse | Validate sprint YAML (YAML 1.2) |
| `pf hooks statusline` | statusLine | Render Claude Code status bar |

Legacy shims (`bellmode_hook.py`, `pretooluse_hook.py`, etc.) re-export from `hooks/` for backward compat.

## Architecture

- **Framework:** Click (lazy-loaded groups for <200ms startup)
- **Entry point:** `cli.py` registers all groups, `pyproject.toml` maps `pf` to `pf.cli:main`
- **Pattern:** Each command group is a subpackage with `cli.py` defining Click commands and sibling modules for logic
- **Output:** JSON for machine consumption (`--json`), formatted text for humans
- **Dry run:** Most mutating commands support `--dry-run` to preview changes
