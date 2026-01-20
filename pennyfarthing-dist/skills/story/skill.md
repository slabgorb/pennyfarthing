---
name: story
description: |
  Story creation, sizing, and templates. Use when creating new stories,
  determining story points, or getting the right template for bug/feature/refactor work.
  For starting work on stories, use /sprint work instead.
args: "[size|template|create] [options]"
---

# /story - Story Management

Story creation and sizing utilities. For **starting work** on stories, use `/sprint work`.

## Commands

### `/story size [points]`

Display story sizing guidelines.

**Without argument:** Show all sizing guidelines
**With points:** Show specific guidance for that point value

**Run:**
```bash
.pennyfarthing/scripts/run.sh size-story.sh [points]
```

**Examples:**
```bash
.pennyfarthing/scripts/run.sh size-story.sh        # All guidelines
.pennyfarthing/scripts/run.sh size-story.sh 3      # 3-point guidance
.pennyfarthing/scripts/run.sh size-story.sh 13     # Split guidance
```

**Output:** Sizing characteristics, workflow suggestions, examples.

---

### `/story template [type]`

Display story templates by type.

**Without argument:** Show all templates
**With type:** Show specific template (bug, feature, refactor, chore)

**Run:**
```bash
.pennyfarthing/scripts/run.sh story-template.sh [type]
```

**Examples:**
```bash
.pennyfarthing/scripts/run.sh story-template.sh           # All templates
.pennyfarthing/scripts/run.sh story-template.sh bug       # Bug template
.pennyfarthing/scripts/run.sh story-template.sh feature   # Feature template
```

**Output:** YAML template with acceptance criteria patterns.

---

### `/story create <epic-id> "<title>" <points> [options]`

Generate a story YAML block for adding to sprint.

**Run:**
```bash
.pennyfarthing/scripts/run.sh create-story.sh <epic-id> "<title>" <points> [options]
```

**Arguments:**
| Arg | Required | Description |
|-----|----------|-------------|
| `epic-id` | Yes | Parent epic (e.g., `MSSCI-11952`) |
| `title` | Yes | Story title (quoted) |
| `points` | Yes | Story points (1, 2, 3, 5, 8) |

**Options:**
| Option | Values | Default | Description |
|--------|--------|---------|-------------|
| `--type` | bug, feature, refactor, chore | feature | Story type |
| `--workflow` | (project-defined) | auto | Override auto-workflow |
| `--priority` | P0, P1, P2, P3 | P2 | Priority level |
| `--repos` | (project-defined) | - | Affected repos |
| `--jira` | flag | - | Also show Jira create command |

**Examples:**
```bash
# Simple feature
.pennyfarthing/scripts/run.sh create-story.sh MSSCI-11952 "Add error handling" 3

# Bug fix
.pennyfarthing/scripts/run.sh create-story.sh MSSCI-11952 "Fix null pointer" 2 --type bug

# Chore with explicit workflow
.pennyfarthing/scripts/run.sh create-story.sh MSSCI-11952 "Update deps" 1 --type chore

# With Jira command
.pennyfarthing/scripts/run.sh create-story.sh MSSCI-11952 "New feature" 5 --jira
```

**Output:** YAML block ready to paste into `sprint/current-sprint.yaml`

---

## Sizing Quick Reference

| Points | Scale | Complexity | Examples |
|--------|-------|------------|----------|
| 1-2 | Trivial | Single file, minimal testing | Config, typo, simple fix |
| 3 | Small | Few files, some testing | Validation, single component |
| 5 | Medium | Multiple files, comprehensive testing | New page, API endpoint |
| 8 | Large | Significant scope, extensive testing | Integration, major refactor |
| 13+ | **SPLIT** | Too complex for single story | Break into smaller stories |

## Workflow Selection

Workflows define the development process for a story. Common patterns:

| Workflow | When to Use |
|----------|-------------|
| `trivial` | Quick changes, no new tests needed |
| `tdd` | Standard development with test coverage |
| `agent-docs` | Documentation-focused work |
| `bdd` | Behavior-driven development |

**Auto-selection heuristics:**
- 1-2 point chores/bugs → `trivial`
- 3+ point features → `tdd`
- Documentation tasks → `agent-docs`

Projects can define custom workflows in `pennyfarthing-dist/workflows/`.

## Acceptance Criteria Patterns

### Good AC (SMART)
- "Admin users can access /admin/settings without 403"
- "API returns 204 No Content on successful DELETE"
- "Tests cover admin, manager, analyst roles"

### Bad AC (Vague)
- "Feature works correctly"
- "No bugs"
- "Good performance"

## Related Commands

| Command | Purpose |
|---------|---------|
| `/sprint work` | Start work on a story |
| `/sprint backlog` | View available stories |
| `/sprint archive` | Archive completed story |
| `/workflow` | View/set workflow definitions |

## File Locations

| File | Purpose |
|------|---------|
| `sprint/current-sprint.yaml` | Add new stories here |
| `sprint/planning.yaml` | Future epics/stories |
| `pennyfarthing-dist/workflows/` | Workflow definitions |
