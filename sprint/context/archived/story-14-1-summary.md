# Story 14-1: Extend scenario schema with error_type taxonomy

## Completion Summary

**Status**: ✅ COMPLETE
**Date**: 2026-01-02
**PR**: https://github.com/1898andCo/pennyfarthing/pull/46 (merged)
**Points**: 1

## What Was Built

Extended the scenario schema (`scenarios/schema.yaml`) with TRAIL error taxonomy to support OCEAN personality correlation research.

### Changes Made

1. **TRAIL Error Taxonomy Section** (lines 111-131)
   - Defined `error_type` enum with three values:
     - `reasoning` - Logic and decision-making failures
     - `planning` - Task orchestration and coordination failures
     - `execution` - System and tool interaction failures
   - Included category descriptions and examples
   - Marked as optional (`required: false`) for backward compatibility

2. **baseline_issues Extension**
   - Added optional `error_type` field to all severity levels:
     - critical
     - high
     - medium
     - low

3. **Updated Example**
   - Demonstrated error_type usage in code_review example:
     - SQL_INJECTION → `reasoning`
     - PASSWORD_EXPOSURE → `planning`
     - ERROR_IGNORED → `execution`

## Acceptance Criteria Verified

- [x] Schema validates error_type field on baseline_issues
- [x] Enum restricts to: reasoning, planning, execution
- [x] Existing scenarios pass validation (field is optional)

## Technical Notes

- No tests required - schema documentation only
- All existing scenarios remain valid (backward compatible)
- Foundation laid for Epic 14 TRAIL-OCEAN correlation research

## Workflow

| Phase | Agent | Action |
|-------|-------|--------|
| Setup | Miles Vorkosigan (SM) | Created Epic 14 backlog, routed to Dev |
| Implementation | Baz Jesek (Dev) | Schema changes, PR #46 |
| Review | Aral Vorkosigan (Reviewer) | Approved - clean implementation |
| Finish | Miles Vorkosigan (SM) | Merged, archived |

## Next Steps

Continue Epic 14 with Story 14-2 (TRAIL-OCEAN hypothesis mapping) or 14-4 (debugging scenarios).
