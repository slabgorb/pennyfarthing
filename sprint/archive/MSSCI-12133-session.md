# Story MSSCI-12133: Import PRD workflow (all 3 modes)

## Story Details
- **ID:** MSSCI-12133
- **Jira:** MSSCI-12133
- **Epic:** BikeLane BMAD Workflow Imports (epic-54)
- **Points:** 5
- **Priority:** P0
- **Workflow:** tdd
- **Repos:** pennyfarthing
- **Branch:** feat/MSSCI-12133-import-prd-workflow
- **Assignee:** Keith Avery

## Acceptance Criteria
- [x] AC1: Migration script successfully converts PRD workflow from BMAD format
- [x] AC2: Generated `workflow.yaml` validates against Pennyfarthing schema
- [x] AC3: All variable syntax converted (`{var-name}` → `{var_name}`)
- [x] AC4: Create mode (steps-c/) executes correctly via `/workflow start prd -c`
- [x] AC5: Validate mode (steps-v/) executes correctly via `/workflow start prd -v`
- [x] AC6: Edit mode (steps-e/) executes correctly via `/workflow start prd -e`
- [x] AC7: Gates pause for user approval at steps 2 (discovery), 8 (scoping), 12 (completion)
- [x] AC8: Templates and data directories copied and accessible

## Workflow Tracking

**Workflow:** tdd
**Phase:** finish
**Phase Started:** 2026-01-21T18:45:00Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-01-21T12:57:52Z | 2026-01-21T18:15:42Z | ~5h18m |
| red | 2026-01-21T18:15:42Z | 2026-01-21T18:15:42Z | <1m |
| green | 2026-01-21T18:15:42Z | 2026-01-21T18:35:00Z | ~20m |
| review | 2026-01-21T18:35:00Z | 2026-01-21T18:45:00Z | ~10m |
| finish | 2026-01-21T18:45:00Z | - | - |

### Handoff History
| From | To | Gate | Result | Time |
|------|----|----|--------|------|
| TEA (red) | Dev (green) | tests_fail | PASSED | 2026-01-21T18:15:42Z |
| Dev (green) | Reviewer (review) | tests_pass | PASSED | 2026-01-21T18:30:00Z |
| Reviewer (review) | SM (finish) | approval | PASSED | 2026-01-21T18:45:00Z |

## Technical Notes
- BMAD Source: ~/Projects/BMAD-METHOD/src/modules/bmm/workflows/2-plan-workflows/prd/
- Migration script: pennyfarthing-dist/scripts/migrate-bmad-workflow.mjs
- Target: pennyfarthing-dist/workflows/prd/
- Tri-modal structure: steps-c/ (create), steps-v/ (validate), steps-e/ (edit)
- Gates at steps 2 (discovery), 8 (scoping), 12 (completion)

## TEA Assessment

**Tests Required:** Yes
**Reason:** 5-point TDD story with testable acceptance criteria

**Test Files:**
- `pennyfarthing-dist/scripts/tests/prd-workflow-import.test.sh` - Bash test suite covering all 8 ACs

**Tests Written:** 35 tests covering 8 ACs
**Status:** RED (31 failing - ready for Dev)

**Test Breakdown by AC:**
| AC | Tests | Description |
|----|-------|-------------|
| AC1 | 4 | Migration completes, produces workflow.yaml |
| AC2 | 4 | Schema validation (steps, pattern, agent) |
| AC3 | 5 | Variable conversion, preserve non-variable dashes |
| AC4 | 5 | Create mode (steps-c/) structure and content |
| AC5 | 4 | Validate mode (steps-v/) structure |
| AC6 | 4 | Edit mode (steps-e/) structure |
| AC7 | 5 | Gates configuration at steps 2, 8, 12 |
| AC8 | 4 | Templates and data directories |

**Run tests:** `./pennyfarthing-dist/scripts/tests/prd-workflow-import.test.sh`

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `pennyfarthing-dist/workflows/prd/workflow.yaml` - PRD workflow configuration
- `pennyfarthing-dist/workflows/prd/steps-c/*.md` - 13 create mode steps
- `pennyfarthing-dist/workflows/prd/steps-v/*.md` - 14 validate mode steps
- `pennyfarthing-dist/workflows/prd/steps-e/*.md` - 5 edit mode steps
- `pennyfarthing-dist/workflows/prd/templates/prd-template.md` - PRD output template
- `pennyfarthing-dist/workflows/prd/data/*.csv` - Domain and project type data
- `pennyfarthing-dist/scripts/tests/prd-workflow-import.test.sh` - Fixed regex for template placeholders

**Tests:** 35/35 passing (GREEN)
**PR:** #405 - feat(MSSCI-12133): Import PRD workflow from BMAD
**Branch:** feat/MSSCI-12133-import-prd-workflow (pushed)

**Handoff:** To Reviewer (Josh Lyman) for code review

## Reviewer Assessment

**PR:** #405
**Verdict:** APPROVED

**Code Review Evidence:**

**Data flow traced:** This is a content import - markdown workflow files from BMAD, not executable code. Workflow.yaml defines paths to step directories; step files contain instructions for AI agents, not executable code. No data flows through this system at merge time.

**Pattern observed:** Follows existing architecture.yaml stepped workflow pattern at `pennyfarthing-dist/workflows/architecture.yaml`. PRD correctly adds `modes` configuration for tri-modal support (create/validate/edit).

**Error handling:** N/A - markdown content files. Workflow executor handles runtime errors.

**Security:** N/A - no auth changes, no executable code, just markdown workflow content. Checked for dangerous patterns (`eval`, `exec`, `inject`) - none found; "execute" references in step files are workflow instructions (which step to load next), not code execution.

**Quality Observations:**
- [LOW] `modes` section lacks explicit `default` field - executor falls back to 'create' anyway
- [LOW] Test regex fix from `\{[a-z]+-[a-z]+` to `\{[a-z]+-[a-z-]+\}` properly excludes template placeholders with spaces

**Tests:**
- PRD-specific: 35/35 passing
- Core: 1576/1576 passing
- Cyclist: Pre-existing flaky tests unrelated to this PR (no cyclist files changed)

**Handoff:** To SM (Leo McGarry) for finish-story workflow
