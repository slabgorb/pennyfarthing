# Story MSSCI-12137: Import Epics-and-Stories workflow

**Story:** MSSCI-12137
**Title:** Import Epics-and-Stories workflow
**Points:** 3
**Epic:** 54 - BikeLane BMAD Workflow Imports
**Jira:** MSSCI-12137
**Repos:** pennyfarthing
**Workflow:** tdd
**Phase:** sm

---

## Workflow Tracking

**Workflow:** tdd
**Phase:** green
**Phase Started:** 2026-01-21T15:35:00Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-01-21T15:15:00Z | 2026-01-21T15:30:00Z | 15m |
| red | 2026-01-21T15:30:00Z | 2026-01-21T15:35:00Z | 5m |

### Handoff History
| From | To | Gate | Time | Notes |
|------|----|----|------|-------|
| TEA | Dev | tests_fail | 2026-01-21T15:35:00Z | 36 tests committed, RED state verified (32 failing, 4 passing vacuously) |

---

## Story Overview

Import the BMAD `create-epics-and-stories` workflow into Pennyfarthing's BikeLane stepped workflow system. This workflow transforms PRD requirements and Architecture decisions into comprehensive epics and user stories with acceptance criteria.

## Source Analysis

**BMAD Location:** `~/Projects/BMAD-METHOD/src/modules/bmm/workflows/3-solutioning/create-epics-and-stories/`

**Structure (single-mode, not tri-modal):**
```
create-epics-and-stories/
├── workflow.md                    # Main config with YAML frontmatter
├── steps/                         # 4 steps (single mode)
│   ├── step-01-validate-prerequisites.md   # Validate docs, extract requirements
│   ├── step-02-design-epics.md             # Design epic list with user value focus
│   ├── step-03-create-stories.md           # Create stories with ACs
│   └── step-04-final-validation.md         # Validate coverage and completeness
└── templates/
    └── epics-template.md          # Output template with placeholders
```

**Key Features:**
- Single-mode workflow (no create/validate/edit variants)
- 4 sequential steps with menu-driven gates
- Requires PRD + Architecture as input documents
- Optional UX Design document input
- Outputs `epics.md` with structured breakdown
- Uses Given/When/Then AC format

## Technical Approach

1. **Use migration script:** Run `migrate-bmad-workflow.mjs` to convert source
2. **Target directory:** `pennyfarthing-dist/workflows/epics-and-stories/`
3. **Customize workflow.yaml:**
   - Set appropriate agent (pm or architect)
   - Define gates at key decision points (after steps 1, 2)
   - Configure triggers for epic/story creation tasks
4. **Variable conversion:** Script handles `{var-name}` → `{var_name}` automatically
5. **Template copy:** Include `epics-template.md` in templates/

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `pennyfarthing-dist/workflows/epics-and-stories/workflow.yaml` | Create | Workflow definition |
| `pennyfarthing-dist/workflows/epics-and-stories/steps/step-01-validate-prerequisites.md` | Create | From migration |
| `pennyfarthing-dist/workflows/epics-and-stories/steps/step-02-design-epics.md` | Create | From migration |
| `pennyfarthing-dist/workflows/epics-and-stories/steps/step-03-create-stories.md` | Create | From migration |
| `pennyfarthing-dist/workflows/epics-and-stories/steps/step-04-final-validation.md` | Create | From migration |
| `pennyfarthing-dist/workflows/epics-and-stories/templates/epics-template.md` | Create | Output template |

## Acceptance Criteria

- [ ] AC1: Migration script runs without errors on source workflow
- [ ] AC2: Generated `workflow.yaml` validates against Pennyfarthing schema
- [ ] AC3: All variable syntax converted (`{var-name}` → `{var_name}`)
- [ ] AC4: `/workflow list` shows new workflow with correct metadata
- [ ] AC5: `/workflow start epics-and-stories` loads step 1 correctly
- [ ] AC6: Step transitions work with menu-based gates
- [ ] AC7: Template placeholders preserved for runtime substitution

## Testing Strategy

1. **Migration test:** Dry-run script, verify output structure
2. **Schema validation:** Validate workflow.yaml against stepped workflow schema
3. **Variable grep:** Ensure no `{var-name}` patterns remain (all converted)
4. **Workflow enumeration:** `/workflow list` shows epics-and-stories
5. **Step loading:** Start workflow, verify step 1 content loads
6. **Manual walkthrough:** Test menu navigation through steps

## Dependencies & Risks

- **Dependency:** Requires completed PRD + Architecture docs as inputs (documented in step 1)
- **Risk:** Variable patterns in BMAD may differ - verify complete conversion
- **Mitigation:** Migration script has proven pattern on PRD, product-brief, research workflows

---

## TEA Assessment

**Tests Required:** Yes
**Reason:** TDD workflow - tests verify migration script output and workflow functionality

**Test Files:**
- `pennyfarthing-dist/scripts/tests/epics-and-stories-workflow-import.test.sh` - Shell-based test suite

**Tests Written:** 36 tests covering 7 ACs
- AC1: Migration script execution (6 tests)
- AC2: Schema validation (7 tests)
- AC3: Variable syntax conversion (4 tests)
- AC4: Workflow metadata (3 tests)
- AC5: Step 1 loading (5 tests)
- AC6: Step transitions and gates (5 tests)
- AC7: Template preservation (6 tests)

**Status:** RED (32 failing, 4 passing vacuously)

**Handoff:** To Dev for implementation

---

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `pennyfarthing-dist/workflows/epics-and-stories/workflow.yaml` - Workflow definition with stepped type, pm agent
- `pennyfarthing-dist/workflows/epics-and-stories/steps/step-01-validate-prerequisites.md` - Validate docs, extract requirements
- `pennyfarthing-dist/workflows/epics-and-stories/steps/step-02-design-epics.md` - Design epic list with user value focus
- `pennyfarthing-dist/workflows/epics-and-stories/steps/step-03-create-stories.md` - Create stories with ACs
- `pennyfarthing-dist/workflows/epics-and-stories/steps/step-04-final-validation.md` - Validate coverage and completeness
- `pennyfarthing-dist/workflows/epics-and-stories/templates/epics-template.md` - Output template with placeholders
- `sprint/current-sprint.yaml` - Added MSSCI-12147 cleanup story to backlog

**Tests:** 36/36 passing (GREEN)
**PR:** #414 - feat(MSSCI-12137): Import epics-and-stories workflow from BMAD
**Branch:** feat/MSSCI-12137-epics-and-stories-workflow (pushed)

**Notes:**
- Migration script ran cleanly on BMAD source
- Variable conversion (`{var-name}` → `{var_name}`) didn't change anything - BMAD already uses underscores
- Added story MSSCI-12147 to backlog to remove unnecessary conversion code

**Handoff:** To Reviewer for code review

---

## Reviewer Assessment

**PR:** #414
**Verdict:** REJECTED

**Issues Found:**

| Severity | Issue | Location | Fix Required |
|----------|-------|----------|--------------|
| [HIGH] | BMAD-specific paths in step frontmatter will fail at runtime | All 4 step files, line 6 | Change `workflow_path` from `{project_root}/_bmad/bmm/workflows/...` to `.pennyfarthing`-based paths |
| [HIGH] | References to non-existent BMAD core workflows | step-01:16-17, step-02:15-16, step-03:15-16, step-04:14-15 | Remove or update `advancedElicitationTask` and `partyModeWorkflow` references |
| [MEDIUM] | `epicsTemplate` path depends on broken `workflow_path` | All 4 step files | Should use relative path `./templates/epics-template.md` |

**Blocking Issues:** 2 High
**Non-Blocking Issues:** 1 Medium

**Root Cause:**
Migration script copied BMAD frontmatter paths verbatim. BMAD uses `_bmad/` directory structure; Pennyfarthing uses `.pennyfarthing/` or `pennyfarthing-dist/`. The workflow will fail when variable resolution tries to find files at `{project_root}/_bmad/...`.

**What Passed:**
- workflow.yaml structure is correct (stepped type, proper schema)
- Template file has correct placeholder syntax
- Step content (markdown body) is fine
- Tests pass but don't exercise runtime variable resolution

**Fix Guidance:**
Step frontmatter should use Pennyfarthing conventions:
```yaml
# Instead of:
workflow_path: '{project_root}/_bmad/bmm/workflows/3-solutioning/create-epics-and-stories'

# Use:
workflow_path: '{project_root}/.pennyfarthing/workflows/epics-and-stories'
# Or relative:
epicsTemplate: './templates/epics-template.md'
```

Remove or stub out `advancedElicitationTask` and `partyModeWorkflow` - these BMAD features don't exist in Pennyfarthing yet.

**Handoff:** Back to Dev for fixes

---

## Dev Assessment (Round 2)

**Implementation Complete:** Yes
**Files Changed:**
- `pennyfarthing-dist/workflows/epics-and-stories/steps/step-01-validate-prerequisites.md` - Fixed paths
- `pennyfarthing-dist/workflows/epics-and-stories/steps/step-02-design-epics.md` - Fixed paths
- `pennyfarthing-dist/workflows/epics-and-stories/steps/step-03-create-stories.md` - Fixed paths
- `pennyfarthing-dist/workflows/epics-and-stories/steps/step-04-final-validation.md` - Fixed paths

**Fixes Applied:**
- Changed `workflow_path` from `{project_root}/_bmad/...` to `{project_root}/.pennyfarthing/workflows/epics-and-stories`
- Changed `epicsTemplate` to relative path `./templates/epics-template.md`
- Changed `workflowFile` to use `.yaml` extension
- Commented out `advancedElicitationTask` and `partyModeWorkflow` (BMAD features not yet in Pennyfarthing)

**Tests:** 36/36 passing (GREEN)
**PR:** #414 - Updated with fix commit bbef892e8
**Branch:** feat/MSSCI-12137-epics-and-stories-workflow (pushed)

**Handoff:** To Reviewer for re-review

---

## Reviewer Assessment (Round 2)

**PR:** #414
**Verdict:** APPROVED

**Code Review Evidence:**
- **Path fix verified:** All 4 step files now use `{project_root}/.pennyfarthing/workflows/epics-and-stories` (step-01:6, step-02:6, step-03:6, step-04:6)
- **Template path fixed:** `epicsTemplate` uses relative `./templates/epics-template.md` - correct since steps and templates are in same workflow directory
- **Extension corrected:** `workflowFile` now uses `.yaml` extension matching Pennyfarthing convention
- **BMAD features handled:** `advancedElicitationTask` and `partyModeWorkflow` commented out with note "BMAD features - not yet available in Pennyfarthing"

**Security:** N/A - workflow markdown files, no executable code
**Performance:** N/A - static content

**Non-Blocking Observations:**
- [LOW] Cleanup story MSSCI-12147 added for removing unused variable conversion - good housekeeping

**Handoff:** To SM for finish-story workflow

---

## Workflow Progress

| Phase | Agent | Status | Notes |
|-------|-------|--------|-------|
| setup | SM | done | Context written |
| red | TEA | done | 36 tests, RED state verified |
| green | Dev | done | 36/36 GREEN, PR #414 |
| review | Reviewer | rejected | BMAD paths won't work in Pennyfarthing |
| green | Dev | done | Fixed paths, commit bbef892e8 |
| review | Reviewer | approved | All issues addressed |

---

*Session created: 2026-01-21*
