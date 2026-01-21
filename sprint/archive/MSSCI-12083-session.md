# Story MSSCI-12083: /workflow list command with type indicator

**Epic:** Stepped Workflow Support (BMAD-Inspired)
**Points:** 1 | **Priority:** P1
**Repos:** pennyfarthing
**Workflow:** trivial
**Branch:** feat/MSSCI-12083-workflow-list-type
**Phase:** approved
**Status:** in_progress
**PR:** #391

## Description

Update /workflow list to show all workflows with type indicator:
- Display phased vs stepped workflows
- Show step count for stepped workflows
- Indicate available modes (create/validate/edit)

## Acceptance Criteria

- [x] List shows workflow type (phased/stepped)
- [x] Stepped workflows show step count
- [x] Tri-modal workflows show available modes

## Workflow Progress

- [x] SM: Story setup
- [x] Dev: Implement feature
- [x] Reviewer: Code review
- [ ] SM: Finish story

## Dev Assessment

**Implementation Complete:** Yes

**Files Changed:**
- `pennyfarthing-dist/skills/workflow/scripts/list-workflows.sh` - Enhanced with type detection, step/phase counting, and modes display
- `pennyfarthing-dist/skills/workflow/skill.md` - Updated documentation for new output format

**Approach:**
- Added type detection by checking for `.workflow.type` or `.workflow.steps` in YAML
- Count phases for phased workflows, steps for stepped workflows
- Extract modes from `.workflow.modes.available` for tri-modal workflows
- Added legend explaining workflow types

**Sample Output:**
```
| Workflow | Type | Default | Steps/Phases | Modes | Description |
|----------|------|---------|--------------|-------|-------------|
| tdd | phased | yes | 5 phases | - | Test-driven development with code review |
```

**Handoff:** To Reviewer for code review

## Reviewer Assessment

**Decision:** APPROVED

**Security:** No issues found - all variables from YAML parsed by yq
**Architecture:** Clean addition to existing pattern
**Tests:** N/A (shell script, manually verified working)

**Observations (non-blocking):**
1. Error suppression on `find` - handled by directory existence check
2. Pattern variable unquoted in `find -name` - unlikely to cause issues with typical patterns

**Verdict:** Code is clean, meets all acceptance criteria. Ready for SM to finish story.

## Notes

Trivial 1-point story - direct to Dev (skip TEA).
