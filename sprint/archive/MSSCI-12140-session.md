# Story MSSCI-12140: Import Dev-Story workflow

## Story Details
- **ID:** MSSCI-12140
- **Workflow:** tdd
- **Epic:** 54 (BikeLane BMAD Workflow Imports)
- **Points:** 3
- **Priority:** P2
- **Jira:** MSSCI-12140
- **Feature Branch:** feat/MSSCI-12140-dev-story-workflow
- **Assignee:** Keith Avery

## Workflow Tracking
**Workflow:** tdd
**Phase:** review
**Phase Started:** 2026-01-21T22:30:54Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-01-21T22:22:17Z | 2026-01-21T22:23:19Z | 1m |
| red | 2026-01-21T22:23:19Z | 2026-01-21T22:23:19Z | 0m |
| green | 2026-01-21T22:23:19Z | 2026-01-21T22:30:54Z | 7m |
| review | 2026-01-21T22:30:54Z | - | - |

### Handoff History
| From | To | Gate | Verdict | Timestamp |
|------|----|----|---------|-----------|
| tea (red) | dev (green) | tests_fail | PASSED | 2026-01-21T22:23:19Z |
| dev (green) | reviewer (review) | tests_pass | PASSED | 2026-01-21T22:30:54Z |
| reviewer (review) | sm (finish) | approval | APPROVED | 2026-01-21T22:35:42Z |

## Context
Import BMAD dev-story workflow:
- Source: ~/Projects/BMAD-METHOD/src/modules/bmm/workflows/4-implementation/dev-story/
- Story implementation guidance
- TDD integration points
- Compare with our existing TDD flow

## Acceptance Criteria
- [ ] AC1: pennyfarthing-dist/workflows/dev-story/ directory created
- [ ] AC2: BMAD workflow.yaml contents converted and integrated
- [ ] AC3: instructions.xml copied with variable syntax converted
- [ ] AC4: checklist.md copied
- [ ] AC5: /workflow list shows dev-story as available workflow
- [ ] AC6: Workflow purpose documented (BMAD reference, not TDD replacement)

## Technical Context
See: .session/context-story-MSSCI-12140.md

## TEA Assessment

**Tests Required:** Yes
**Reason:** Workflow import requires validation of file structure, variable conversion, and documentation

**Test Files:**
- `pennyfarthing-dist/scripts/tests/dev-story-workflow-import.test.sh` - Shell-based integration tests for all 6 ACs

**Tests Written:** 30 tests covering 6 ACs
**Status:** RED (failing - ready for Dev)

**Test Coverage by AC:**
| AC | Tests | Description |
|----|-------|-------------|
| AC1 | 4 | Directory structure (dir exists, workflow.yaml, instructions.xml, checklist.md) |
| AC2 | 6 | workflow.yaml integration (name, description, type, agent, no config_source refs) |
| AC3 | 8 | instructions.xml variable conversion (no dashed variables, all 10 steps) |
| AC4 | 5 | checklist.md content (title, sections, checkboxes) |
| AC5 | 3 | Workflow listing (valid YAML, triggers section) |
| AC6 | 4 | Documentation (BMAD mention, not default, comment header) |

**Key Implementation Notes for Dev:**
1. This is NOT a stepped workflow - it uses workflow.yaml + instructions.xml + checklist.md
2. The migrate-bmad-workflow.mjs script expects steps-c/v/e directories - manual import may be needed
3. Variable conversion: `{var-name}` → `{var_name}` in instructions.xml
4. Document this as BMAD reference workflow, NOT a replacement for TDD

**Handoff:** To Dev for implementation

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `pennyfarthing-dist/workflows/dev-story/workflow.yaml` - Pennyfarthing wrapper with metadata and triggers
- `pennyfarthing-dist/workflows/dev-story/instructions.xml` - 10-step procedural workflow (variables converted)
- `pennyfarthing-dist/workflows/dev-story/checklist.md` - Definition of Done checklist

**Tests:** 30/30 passing (GREEN)
**PR:** #423 - feat(MSSCI-12140): Import BMAD dev-story workflow
**Branch:** feat/MSSCI-12140-dev-story-workflow (pushed)

**Implementation Notes:**
1. Manual import used (migrate-bmad-workflow.mjs expects stepped workflow structure)
2. Variable conversion applied: `{var-name}` → `{var_name}` using sed
3. workflow.yaml created as Pennyfarthing wrapper with clear BMAD compatibility documentation
4. Marked as non-default (TDD remains default for Pennyfarthing projects)

**Handoff:** To Reviewer for code review

## Reviewer Assessment

**PR:** #423
**Verdict:** APPROVED

**Code Review Evidence:**
- **Variable conversion traced:** `{project-root}` at instructions.xml:2 → `{project_root}` (correctly converted via sed)
- **Pattern observed:** Pennyfarthing wrapper workflow.yaml with clear BMAD documentation at lines 1-19
- **Error handling:** N/A - static file import, no runtime code

**Security:** N/A - no auth, no user input processing, static workflow definition files

**Performance:** N/A - no runtime execution paths in this change

**Issue Fixed During Review:**
- [MEDIUM] Emojis in checklist.md - removed per project standards (pennyfarthing-dist/workflows/dev-story/checklist.md)

**Non-Blocking Observations:**
- [LOW] instructions.xml line 2 references `{project_root}/_bmad/core/tasks/workflow.xml` - this is intentional for BMAD project compatibility, not a Pennyfarthing path

**Handoff:** To SM for finish-story workflow

## Workflow Progress
- [x] SM: Story setup
- [x] TEA: Test design (RED phase)
- [x] Dev: Implementation (GREEN phase)
- [x] Reviewer: Code review (REVIEW phase)
- [ ] SM: Finish (ready for handoff)
