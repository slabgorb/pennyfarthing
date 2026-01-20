# Story MSSCI-12036: Rewrite /workflow skill with prescriptive scripts

## Story Overview
- **Epic:** MSSCI-11952 - Skill Frontmatter Enhancement
- **Points:** 2 | **Priority:** P2
- **Repos:** pennyfarthing
- **Workflow:** trivial
- **Jira:** MSSCI-12036
- **Branch:** feat/MSSCI-12036-workflow-skill-rewrite
- **Phase:** sm
- **Status:** setup

## Technical Context

### Current State
The `/workflow` skill at `pennyfarthing-dist/skills/workflow/SKILL.md` uses inline shell snippets for:
- Listing available workflows (manual for-loop)
- Showing current workflow from session file
- Displaying workflow phase visualization
- Setting workflow mid-session

### Target State
Rewrite to follow the prescriptive pattern from `/sprint`:
1. YAML frontmatter with name, description, args
2. Commands section with clear subcommand structure
3. Helper scripts in `.pennyfarthing/scripts/` for deterministic operations
4. "Run:" blocks showing exact bash commands

### Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `pennyfarthing-dist/skills/workflow/skill.md` | Rewrite | Prescriptive skill with script references |
| `.pennyfarthing/scripts/list-workflows.sh` | Create | List all available workflows |
| `.pennyfarthing/scripts/show-workflow.sh` | Create | Show workflow details (current or named) |

### Scripts Design

**list-workflows.sh** - Output all workflows in a table:
```
Workflow    Default  Description
--------    -------  -----------
tdd         yes      Test-driven development (SM → TEA → Dev → Reviewer)
trivial     no       Quick fixes without TEA (SM → Dev → Reviewer)
agent-docs  no       Documentation workflow
bdd         no       Behavior-driven development
```

**show-workflow.sh [name]** - Show workflow details:
- If no argument: show current session's workflow
- If argument: show named workflow details
- Include phase sequence visualization

### Reference Implementations
- `/sprint` skill: `pennyfarthing-dist/skills/sprint/skill.md`
- `/story` skill: `pennyfarthing-dist/skills/story/skill.md`

## Acceptance Criteria
- [x] /workflow skill rewritten with prescriptive format
- [x] Helper scripts for workflow operations
- [x] Scripts handle all 4 existing workflows (tdd, trivial, agent-docs, bdd)

## Dev Assessment
**Implementation Complete:** Yes
**Files Changed:**
- `pennyfarthing-dist/skills/workflow/skill.md` - Complete rewrite with prescriptive format
- `pennyfarthing-dist/skills/workflow/scripts/list-workflows.sh` - New script to list workflows
- `pennyfarthing-dist/skills/workflow/scripts/show-workflow.sh` - New script to show workflow details
- `pennyfarthing-dist/scripts/list-workflows.sh` - Symlink to skill script
- `pennyfarthing-dist/scripts/show-workflow.sh` - Symlink to skill script

**Tests:** Manual verification - all scripts working correctly
- `list-workflows.sh` outputs all 4 workflows in table format
- `show-workflow.sh` detects current session workflow (trivial)
- `show-workflow.sh tdd` shows TDD workflow details
- Scripts exclude archived sessions from detection

**PR:** #376 - feat(workflow): rewrite /workflow skill with prescriptive scripts
**Branch:** feat/MSSCI-12036-workflow-skill-rewrite (pushed)

**Handoff:** To Reviewer for code review

## Reviewer Assessment
**Decision:** APPROVED
**Reviewer:** Major Charles Emerson Winchester III

### Findings

| Severity | Finding | Status |
|----------|---------|--------|
| None | - | - |

### Analysis
1. **Scripts follow established patterns** - Both scripts properly use `set -euo pipefail`, check for `yq` dependency, and handle `PROJECT_ROOT` consistent with other Pennyfarthing scripts.

2. **Session detection correctly scoped** - The `-maxdepth 1` prevents archived sessions from being incorrectly detected.

3. **YAML parsing** - Uses `yq` for reliable YAML parsing rather than fragile shell text manipulation.

4. **Edge cases handled** - Invalid workflow names show helpful error with available options; missing session falls back to default.

5. **Skill.md structure** - Follows the prescriptive pattern established by `/sprint` and `/story` skills.

6. **Removed stale references** - Old "Related" section referenced non-existent TypeScript files; appropriately removed.

### Preflight
- **Tests:** 2837 passing, 1 failing (pre-existing flaky test in session-context)
- **Lint:** 1 warning (pre-existing unused var in settings.ts)
- **Neither related to this PR**

**Handoff:** To SM (Hawkeye) for story completion

## Workflow Tracking
**Workflow:** trivial
**Phase:** review
**Phase Started:** 2026-01-20T19:20:00Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-01-20T18:50:00Z | 2026-01-20T19:00:00Z | 10m |
| impl | 2026-01-20T19:00:00Z | 2026-01-20T19:15:00Z | 15m |
| review | 2026-01-20T19:20:00Z | 2026-01-20T19:25:00Z | 5m |

## Workflow Phases
- [x] SM: Story setup
- [x] Dev: Implement (trivial - no TEA)
- [x] Reviewer: Code review - APPROVED
- [ ] SM: Finish story
