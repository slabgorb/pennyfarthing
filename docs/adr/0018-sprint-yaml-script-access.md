# ADR-0018: Sprint YAML Script Access Pattern

**Status:** Accepted
**Date:** 2026-01-28
**Author:** Architect (Naomi Nagata)

## Context

Sprint tracking data lives in `sprint/current-sprint.yaml`, a structured YAML file containing epics, stories, status, points, and Jira references. Multiple agents (SM, Dev, Reviewer) need to read and update this file during their workflows.

**Problems with direct YAML editing:**
- **Race conditions** - Two agents could edit simultaneously, causing data loss
- **Validation gaps** - Easy to introduce malformed YAML or invalid state transitions
- **Inconsistent ordering** - Epic priority and story status get scrambled
- **Jira sync drift** - Manual edits bypass Jira synchronization
- **Audit trail loss** - No record of what changed and why

**Observed failures:**
- Stories marked "done" without completion date
- Duplicate story IDs after manual copy-paste
- Epic point totals not matching sum of stories
- Jira status out of sync with YAML status

## Decision

**Never directly edit sprint YAML.** All access goes through dedicated scripts in `pennyfarthing-dist/scripts/sprint/`.

### Script Architecture

```
pennyfarthing-dist/scripts/sprint/
├── sprint-common.sh       # Shared utilities (yq wrappers, validation)
├── available-stories.sh   # List stories with status=ready|backlog
├── check-story.sh         # Validate story exists and is workable
├── archive-story.sh       # Move completed story to archive
├── new-sprint.sh          # Create new sprint from template
├── list-future.sh         # Show future.yaml epics
├── promote-epic.sh        # Move epic from future to current
├── sprint-metrics.sh      # Calculate velocity, burndown
├── sprint-status.sh       # Summary view of sprint
├── get-story-field.sh     # Read single field from story
├── get-epic-field.sh      # Read single field from epic
├── set-story-field.sh     # Update single field (with validation)
├── set-epic-field.sh      # Update single field (with validation)
└── import_epic_to_future.py # Import epic definition
```

### Access Patterns

| Operation | Script | Example |
|-----------|--------|---------|
| Read story field | `get-story-field.sh` | `get-story-field.sh 28-1 status` → `in_progress` |
| Read epic field | `get-epic-field.sh` | `get-epic-field.sh 35 jira` → `MSSCI-12042` |
| Check story exists | `check-story.sh` | `check-story.sh 28-1` → exit 0 or 1 |
| List available work | `available-stories.sh` | Returns JSON of ready stories |
| Archive completed | `archive-story.sh` | Moves to `sprint/archive/`, updates totals |
| Sprint summary | `sprint-status.sh` | Points done/remaining, velocity |

### Validation Rules

Scripts enforce these invariants:

| Rule | Enforcement |
|------|-------------|
| Story ID format | `{epic}-{seq}` or `MSSCI-{number}` |
| Status transitions | `backlog → ready → in_progress → done` |
| Points must be numeric | Reject non-integer values |
| Completion date on done | Auto-set if missing |
| Epic totals recalculated | On any story status change |
| Jira key format | `MSSCI-{5 digits}` when present |

### Python Module Architecture

In addition to the bash scripts above, a Python module layer provides deterministic serialization and validation:

```
pennyfarthing_scripts/sprint/
├── yaml_io.py          # Deterministic read/write with canonical formatting
├── validate_cmd.py     # Validation with --fix flag for format repair
├── validator.py        # Schema validation (required fields, types)
├── story_add_cmd.py    # Add stories with auto-generated IDs
├── story_update_cmd.py # Update story fields with validation
└── cli.py              # Click CLI entry point
```

#### Deterministic Serialization (`yaml_io.py`)

The `canonical_dump()` function guarantees byte-identical output for identical input:

- **Fixed key ordering** per template (`SPRINT_KEY_ORDER`, `EPIC_KEY_ORDER`, `STORY_KEY_ORDER`)
- **Block scalars** (`|`) for all multiline strings
- **2-space indentation**, no trailing whitespace
- **Atomic writes** via temp file + `os.replace()` to prevent corruption
- **ruamel.yaml** for comment-preserving, order-aware YAML handling

#### Validation (`validate_cmd.py`)

`validate_sprint_yaml(path, fix=False)` checks three layers:

| Layer | What | Blocks commit? |
|-------|------|----------------|
| Syntax | YAML parse errors with line numbers | Yes |
| Schema | Missing required fields, invalid types | Yes |
| Format | Key ordering drift, wrong string styles | No (warning only) |

The `--fix` flag automatically repairs format drift by reading with `read_sprint()` and rewriting with `write_sprint()`, applying canonical formatting. Schema errors require manual intervention.

#### Pre-commit Hook Integration

The pre-commit hook (story 76-5) runs `validate_sprint_yaml()` on staged `sprint/*.yaml` files, blocking commits with syntax or schema errors. Format warnings are displayed but non-blocking.

### Integration with Jira

The `pennyfarthing_scripts/jira/` Python module handles bidirectional sync:

```bash
# Sync YAML → Jira (update Jira from local changes)
python -m pennyfarthing_scripts.jira.bidirectional --direction yaml-to-jira

# Sync Jira → YAML (pull Jira updates locally)
python -m pennyfarthing_scripts.jira.bidirectional --direction jira-to-yaml

# Dry run (show what would change)
python -m pennyfarthing_scripts.jira.bidirectional --dry-run
```

Scripts call this automatically when:
- Story status changes to `done` (update Jira)
- `archive-story.sh` runs (close Jira issue)
- Sprint starts (create missing Jira epics)

### Agent Behavior Rules

From `agent-behavior.md`:

```markdown
<critical>
**Never directly edit sprint YAML.** All sprint YAML modifications MUST go
through dedicated scripts.
</critical>
```

Agents use the `/sprint` skill which wraps these scripts:
- `/sprint status` → `sprint-status.sh`
- `/sprint backlog` → `available-stories.sh`
- `/sprint work X-Y` → `check-story.sh` + session setup
- `/sprint archive X-Y` → `archive-story.sh`

### Error Handling

Scripts return structured errors:

```bash
# Success
{ "success": true, "data": { ... } }

# Failure
{ "success": false, "error": "Story 99-1 not found in current sprint" }
```

Exit codes:
- `0` - Success
- `1` - Validation error (bad input)
- `2` - Not found (story/epic doesn't exist)
- `3` - State error (invalid transition)

## Consequences

### Positive

- **Data integrity** - Validation prevents malformed YAML
- **Atomic updates** - Scripts use temp file + rename pattern
- **Consistent ordering** - Epics sorted by priority, stories by status
- **Audit trail** - Git history shows script-driven changes
- **Jira sync** - Automatic synchronization on state changes
- **Testable** - Scripts can be unit tested in isolation

### Negative

- **Indirection** - Can't just `yq` a quick fix
- **Script maintenance** - 14 scripts to maintain
- **Learning curve** - Must know which script to use
- **Performance** - Each script spawns subshell

### Neutral

- **yq dependency** - Bash scripts require `yq` (already in toolchain)
- **Python + ruamel.yaml** - Python modules require `ruamel.yaml` for deterministic serialization
- **Dual tooling** - Bash scripts for simple field access, Python modules for validation and canonical formatting

## Alternatives Considered

### 1. YAML Schema Validation Only

Use JSON Schema to validate YAML structure, allow direct edits.

**Rejected:** Doesn't prevent race conditions or enforce state transitions.

### 2. Database Instead of YAML

Store sprint data in SQLite or similar.

**Rejected:** YAML is human-readable, git-trackable, and works offline.

### 3. Lock File Pattern

Acquire lock before editing, release after.

**Rejected:** Complex to implement correctly, doesn't help with validation.

### 4. Event Sourcing

Store changes as events, derive state.

**Rejected:** Overkill for sprint tracking. YAML + scripts is sufficient.

## References

- Bash scripts: `pennyfarthing-dist/scripts/sprint/`
- Python modules: `pennyfarthing_scripts/sprint/` (`yaml_io.py`, `validate_cmd.py`, `validator.py`)
- Jira sync: `pennyfarthing_scripts/jira/bidirectional.py`
- Skill wrapper: `pennyfarthing-dist/skills/sprint/skill.md`
- Agent behavior: `pennyfarthing-dist/guides/agent-behavior.md`
- Pre-commit hook: `pennyfarthing-dist/scripts/hooks/pre-commit.sh` (Check 3)
- ADR-0008: Result Object Error Handling (script return format)
