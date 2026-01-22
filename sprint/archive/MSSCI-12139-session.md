# MSSCI-12139: Import UX Design workflow

**Story:** MSSCI-12139
**Jira:** MSSCI-12139
**Epic:** BikeLane BMAD Workflow Imports
**Points:** 3
**Workflow:** tdd
**Phase:** finish
**Status:** in_progress
**Repos:** pennyfarthing
**Feature Branch:** feat/MSSCI-12139-ux-design-workflow

---

## Story Overview

Import the BMAD UX Design workflow into Pennyfarthing's stepped workflow system. This is a single-mode (not tri-modal) workflow with 14 steps that guides users through UX design planning with the UX Designer agent.

## Source Analysis

**BMAD Source:** `/Users/keithavery/Projects/BMAD-METHOD/src/modules/bmm/workflows/2-plan-workflows/create-ux-design/`

**Structure:**
- `workflow.md` - Workflow definition with YAML frontmatter
- `steps/step-01-init.md` through `step-14-complete.md` (14 steps)
- `step-01b-continue.md` - Continuation handler for resuming
- `ux-design-template.md` - Output template

**Characteristics:**
- Single-mode workflow (no create/validate/edit modes)
- 14 sequential steps with decision gates
- Continuation support via step-01b-continue.md
- Uses placeholder variables: `{project_name}`, `{user_name}`, `{date}`, etc.
- Agent assignment: ux-designer

## Technical Approach

1. **Run migration script** using `migrate-bmad-workflow.mjs`
2. **Validate generated files** match Pennyfarthing schema
3. **Test workflow listing** via `/workflow list`
4. **Test workflow execution** via `/workflow start ux-design`

**Target Directory:** `pennyfarthing-dist/workflows/ux-design/`

## Files to Create

| File | Purpose |
|------|---------|
| `pennyfarthing-dist/workflows/ux-design/workflow.yaml` | Workflow definition |
| `pennyfarthing-dist/workflows/ux-design/steps/*.md` | 14 step files |
| `pennyfarthing-dist/workflows/ux-design/step-01b-continue.md` | Continuation handler |
| `pennyfarthing-dist/workflows/ux-design/ux-design-template.md` | Output template |

## Dependencies

- UX Designer agent exists: `pennyfarthing-dist/agents/ux-designer.md`
- Step file parser: MSSCI-12079 (done)
- Variable resolver: MSSCI-12081 (done)
- Session state tracking: MSSCI-12082 (done)
- Gate detection: MSSCI-12085 (done)

## Acceptance Criteria

- [ ] AC1: `pennyfarthing-dist/workflows/ux-design/` directory created
- [ ] AC2: `workflow.yaml` with correct schema (name, description, type: stepped, steps)
- [ ] AC3: All 14 step files copied with variable syntax validated
- [ ] AC4: Template file (`ux-design-template.md`) copied
- [ ] AC5: Continuation handler (`step-01b-continue.md`) copied
- [ ] AC6: `/workflow list` shows ux-design as available
- [ ] AC7: Workflow can be started with `/workflow start ux-design`

## Testing Strategy

1. **Migration tests:** Verify script runs without errors on UX design source
2. **Schema validation:** Check workflow.yaml matches stepped workflow schema
3. **Step file validation:** Verify all 14 steps have valid frontmatter
4. **Integration test:** Start workflow and verify step 1 loads correctly

---

## Workflow Log

### Setup Phase
- **Agent:** SM (Captain Carrot)
- **Action:** Story context created, ready for handoff to TEA

### RED Phase
- **Agent:** TEA (Igor)
- **Action:** Tests written and verified RED state

## TEA Assessment

**Tests:** 44 tests written (43 failing, 1 passing - RED state confirmed)
**Coverage:** All 7 acceptance criteria covered
**Test File:** `pennyfarthing-dist/scripts/tests/ux-design-workflow-import.test.sh`

### Test Distribution by AC

| AC | Tests | Coverage |
|----|-------|----------|
| AC1 | 3 | Directory structure (workflow dir, yaml, steps/) |
| AC2 | 8 | Schema validation (name, description, type: stepped, steps config, agent) |
| AC3 | 18 | Step files (14 existence + content + count + variable syntax) |
| AC4 | 3 | Template file existence and content |
| AC5 | 3 | Continuation handler existence and content |
| AC6 | 4 | Workflow listing (YAML valid, triggers, types) |
| AC7 | 5 | Workflow startup (version, variables, patterns) |

### Implementation Notes for Dev

1. Use `migrate-bmad-workflow.mjs` script for migration
2. Source: `~/Projects/BMAD-METHOD/src/modules/bmm/workflows/2-plan-workflows/create-ux-design/`
3. Target: `pennyfarthing-dist/workflows/ux-design/`
4. Ensure dashed variables `{var-name}` are converted to `{var_name}` format
5. Continuation handler goes in `steps/` directory (not root)
6. Template file stays in workflow root directory

Ready for Dev (Ponder Stibbons) to implement and turn tests GREEN.

### GREEN Phase
- **Agent:** Dev (Ponder Stibbons)
- **Action:** Implemented workflow import and verified GREEN state

## Dev Assessment

**Implementation Complete:** Yes
**Tests:** 44/44 passing (GREEN)
**PR:** #425 - feat(workflow): import UX Design workflow from BMAD
**Branch:** feat/MSSCI-12139-ux-design-workflow (pushed)

### Files Created

| File | Purpose |
|------|---------|
| `pennyfarthing-dist/workflows/ux-design/workflow.yaml` | Workflow definition with ux-designer agent |
| `pennyfarthing-dist/workflows/ux-design/steps/step-01-init.md` | Initialization step |
| `pennyfarthing-dist/workflows/ux-design/steps/step-01b-continue.md` | Continuation handler |
| `pennyfarthing-dist/workflows/ux-design/steps/step-02-discovery.md` | Discovery phase |
| `pennyfarthing-dist/workflows/ux-design/steps/step-03-core-experience.md` | Core experience |
| `pennyfarthing-dist/workflows/ux-design/steps/step-04-emotional-response.md` | Emotional design |
| `pennyfarthing-dist/workflows/ux-design/steps/step-05-inspiration.md` | Inspiration gathering |
| `pennyfarthing-dist/workflows/ux-design/steps/step-06-design-system.md` | Design system |
| `pennyfarthing-dist/workflows/ux-design/steps/step-07-defining-experience.md` | Experience definition |
| `pennyfarthing-dist/workflows/ux-design/steps/step-08-visual-foundation.md` | Visual foundation |
| `pennyfarthing-dist/workflows/ux-design/steps/step-09-design-directions.md` | Design directions |
| `pennyfarthing-dist/workflows/ux-design/steps/step-10-user-journeys.md` | User journeys |
| `pennyfarthing-dist/workflows/ux-design/steps/step-11-component-strategy.md` | Component strategy |
| `pennyfarthing-dist/workflows/ux-design/steps/step-12-ux-patterns.md` | UX patterns |
| `pennyfarthing-dist/workflows/ux-design/steps/step-13-responsive-accessibility.md` | Responsive + accessibility |
| `pennyfarthing-dist/workflows/ux-design/steps/step-14-complete.md` | Completion step |
| `pennyfarthing-dist/workflows/ux-design/ux-design-template.md` | Output template |
| `pennyfarthing-dist/scripts/tests/ux-design-workflow-import.test.sh` | Test suite |

### Implementation Notes

1. Used `migrate-bmad-workflow.mjs` script for base migration
2. Updated workflow.yaml to:
   - Use `ux-design` as workflow name
   - Assign `ux-designer` agent
   - Add BMAD reference documentation
   - Include on_demand trigger type
3. All 14 step files + continuation handler copied to steps/
4. Template file copied to workflow root
5. Variable syntax converted from dashed to underscore format

Ready for Reviewer (Granny Weatherwax) to review.

### REVIEW Phase
- **Agent:** Reviewer (Granny Weatherwax)
- **Action:** Approved implementation

## Reviewer Assessment

**Decision:** APPROVED

### Verification Summary

| AC | Description | Status |
|----|-------------|--------|
| AC1 | Directory created | ✓ Verified |
| AC2 | workflow.yaml schema | ✓ Valid YAML, correct fields |
| AC3 | 14 step files | ✓ All present, variables converted |
| AC4 | Template file | ✓ Present with content |
| AC5 | Continuation handler | ✓ In steps/ directory |
| AC6 | Workflow listing | ✓ Triggers include ux-design, on_demand |
| AC7 | Workflow startup | ✓ Version 1.0.0, variables defined |

### Review Findings

**Security:** No issues - static markdown workflow files only
**Correctness:** All files present and properly formatted
**Variable Conversion:** Confirmed `{project-root}` → `{project_root}` conversion
**Agent Assignment:** Correctly set to `ux-designer`
**Tests:** 44/44 passing

**Critical Issues:** None
**Major Issues:** None
**Minor Issues:** None

### Judgment

This is a straightforward workflow import following established patterns. The migration script properly converted variable syntax. All acceptance criteria are met.

Ready for SM (Captain Carrot) to finish story.
