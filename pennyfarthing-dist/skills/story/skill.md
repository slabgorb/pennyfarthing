---
name: story
description: |
  Story creation, sizing, and templates. Use when creating new stories,
  determining story points, or getting the right template for bug/feature/refactor work.
  For starting work on stories, use /sprint work instead.
args: "[size|template|create|finish] [options]"
---

# /story - Story Management

Story creation and sizing utilities. For **starting work** on stories, use `/sprint work`.

## Commands

### `/story size [points]`

Display story sizing guidelines.

<when>
- Without argument: Show all sizing guidelines
- With points: Show specific guidance for that point value
</when>

<run>
.pennyfarthing/scripts/core/run.sh story/size-story.sh [points]
</run>

<example>
.pennyfarthing/scripts/core/run.sh story/size-story.sh        # All guidelines
.pennyfarthing/scripts/core/run.sh story/size-story.sh 3      # 3-point guidance
.pennyfarthing/scripts/core/run.sh story/size-story.sh 13     # Split guidance
</example>

<output>
Sizing characteristics, workflow suggestions, examples.
</output>

---

### `/story template [type]`

Display story templates by type.

<when>
- Without argument: Show all templates
- With type: Show specific template (bug, feature, refactor, chore)
</when>

<run>
.pennyfarthing/scripts/core/run.sh story/story-template.sh [type]
</run>

<example>
.pennyfarthing/scripts/core/run.sh story/story-template.sh           # All templates
.pennyfarthing/scripts/core/run.sh story/story-template.sh bug       # Bug template
.pennyfarthing/scripts/core/run.sh story/story-template.sh feature   # Feature template
</example>

<output>
YAML template with acceptance criteria patterns.
</output>

---

### `/story create <epic-id> "<title>" <points> [options]`

Generate a story YAML block for adding to sprint.

<run>
.pennyfarthing/scripts/core/run.sh story/create-story.sh <epic-id> "<title>" <points> [options]
</run>

<args>
| Arg | Required | Description |
|-----|----------|-------------|
| `epic-id` | Yes | Parent epic (e.g., `MSSCI-11952`) |
| `title` | Yes | Story title (quoted) |
| `points` | Yes | Story points (1, 2, 3, 5, 8) |
</args>

<output>
| Option | Values | Default | Description |
|--------|--------|---------|-------------|
| `--type` | bug, feature, refactor, chore | feature | Story type |
| `--workflow` | (project-defined) | auto | Override auto-workflow |
| `--priority` | P0, P1, P2, P3 | P2 | Priority level |
| `--repos` | (project-defined) | - | Affected repos |
| `--jira` | flag | - | Also show Jira create command |
</output>

<example>
# Simple feature
.pennyfarthing/scripts/core/run.sh story/create-story.sh MSSCI-11952 "Add error handling" 3

# Bug fix
.pennyfarthing/scripts/core/run.sh story/create-story.sh MSSCI-11952 "Fix null pointer" 2 --type bug

# Chore with explicit workflow
.pennyfarthing/scripts/core/run.sh story/create-story.sh MSSCI-11952 "Update deps" 1 --type chore

# With Jira command
.pennyfarthing/scripts/core/run.sh story/create-story.sh MSSCI-11952 "New feature" 5 --jira
</example>

<output>
YAML block ready to paste into `sprint/current-sprint.yaml`
</output>

---

### `/story finish <story-id> [--dry-run]`

Complete a story: archive session, merge PR, transition Jira, update sprint YAML.

<critical>
Prerequisites before running:
- Session file exists at `.session/{story-id}-session.md`
- PR is approved and mergeable
- Reviewer has approved (phase: finish in session)
</critical>

<run>
.pennyfarthing/scripts/core/run.sh workflow/finish-story.sh <story-id> [--dry-run]
</run>

<args>
| Arg | Required | Description |
|-----|----------|-------------|
| `story-id` | Yes | Story ID (e.g., `MSSCI-12052`) |
| `--dry-run` | No | Show what would be done without executing |
</args>

<example>
.pennyfarthing/scripts/core/run.sh workflow/finish-story.sh MSSCI-12052           # Finish story
.pennyfarthing/scripts/core/run.sh workflow/finish-story.sh MSSCI-12052 --dry-run # Preview only
</example>

<output>
1. Archives session file to `sprint/archive/{jira-key}-session.md`
2. Squash merges PR and deletes remote branch
3. Transitions Jira issue to Done
4. Updates sprint YAML (status: done, completed date, removes assigned_to)
5. Deletes local feature branch
6. Removes session file

Step-by-step progress with final summary and Jira link.
</output>

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

<output>
Auto-selection heuristics:
- 1-2 point chores/bugs → `trivial`
- 3+ point features → `tdd`
- Documentation tasks → `agent-docs`
</output>

<when>
Projects can define custom workflows in `pennyfarthing-dist/workflows/`.
</when>

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

## Related Skills

| Skill | Purpose |
|-------|---------|
| `/sprint` | Sprint management, backlog, start work |
| `/jira` | Jira operations (create in Jira, sync, claim) |
| `/workflow` | View/set workflow definitions |

## File Locations

| File | Purpose |
|------|---------|
| `sprint/current-sprint.yaml` | Add new stories here |
| `sprint/planning.yaml` | Future epics/stories |
| `pennyfarthing-dist/workflows/` | Workflow definitions |
