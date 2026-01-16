# Story 31-11 Summary: Consolidate SM bookkeeping subagents

**Status:** Done
**Points:** 3
**PR:** #238 (merged 2026-01-14)
**Epic:** 31 (Customizable Workflow Engine)

## What Was Delivered

Consolidated 6 SM subagents into 3 generic subagents:

| Before | After |
|--------|-------|
| sm-story-setup | generic-sm-setup (MODE=setup) |
| sm-work-research | generic-sm-setup (MODE=research) |
| sm-finish-bookkeeping | generic-sm-finish (PHASE=preflight) |
| sm-finish-execution | generic-sm-finish (PHASE=execute) |
| sm-handoff | generic-handoff (CURRENT_PHASE=setup) |
| sm-file-summary | (kept separate) |

Also removed 4 deprecated handoff files from Story 31-10:
- tea-handoff.md, dev-handoff.md, reviewer-handoff-approve.md, reviewer-handoff-reject.md

## Key Files

**TypeScript:**
- `packages/core/src/workflow/generic-sm-setup.ts` (237 lines)
- `packages/core/src/workflow/generic-sm-finish.ts` (159 lines)
- `packages/core/src/workflow/sm-subagents.test.ts` (705 lines, 31 tests)

**Agent Definitions:**
- `pennyfarthing-dist/agents/generic-sm-setup.md`
- `pennyfarthing-dist/agents/generic-sm-finish.md`

## Key Decisions

1. **Jira handling:** JIRA_KEY is optional - workflows without Jira complete successfully
2. **sm-file-summary kept separate:** Different concern (file reading vs workflow)
3. **Phase parameter pattern:** Consistent with generic-handoff from 31-10

## Dependencies

- Story 31-7: Generic workflow-driven handoff subagent (completed)
- Story 31-10: Activate workflow-driven handoffs (completed)
