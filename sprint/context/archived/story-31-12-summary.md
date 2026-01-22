# Story 31-12 Summary: Remove deprecated SM subagent files and fix workflow enforcement

**Status:** COMPLETED
**Story ID:** 31-12
**Epic:** 31 - Customizable Workflow Engine
**Points:** 2
**Priority:** P2
**Jira:** MSSCI-11682
**Branch:** feat/31-12-remove-deprecated-sm-subagents
**PR:** #239

## Overview

This story completed cleanup work from Story 31-11, removing deprecated SM subagent files that were replaced by the generic-sm-setup and generic-sm-finish consolidated subagents. Additionally, it fixed workflow enforcement issues discovered during testing.

## Changes Completed

### Files Deleted (4)
- `pennyfarthing-dist/agents/sm-story-setup.md` (replaced by generic-sm-setup MODE=setup)
- `pennyfarthing-dist/agents/sm-work-research.md` (replaced by generic-sm-setup MODE=research)
- `pennyfarthing-dist/agents/sm-finish-bookkeeping.md` (replaced by generic-sm-finish PHASE=preflight)
- `pennyfarthing-dist/agents/sm-finish-execution.md` (replaced by generic-sm-finish PHASE=execute)

### Files Retained
- `sm-handoff.md` - Still needed for SM→TEA transition with Jira/branch setup
- `sm-file-summary.md` - Still actively used for file summarization

### Documentation Updates (12 files)
- `CLAUDE.md` - Updated Official Subagent System section
- `docs/AGENTS.md` - Updated SM subagent table
- `docs/ARCHITECTURE.md` - Updated SM subagent table
- `docs/TDD-FLOW-DIAGRAMS.md` - Updated mermaid and sequence diagrams
- `docs/JIRA-INTEGRATION.md` - Updated subagent orchestration section
- `pennyfarthing-dist/commands/sm.md` - Updated reference section
- `pennyfarthing-dist/guides/AGENT-COORDINATION.md` - Updated handoff flow
- `pennyfarthing-dist/guides/patterns/tdd-flow-pattern.md` - Updated phase transitions table
- `pennyfarthing-dist/guides/patterns/helper-delegation-pattern.md` - Updated delegation categories
- `pennyfarthing-dist/guides/SESSION-ARTIFACTS.md` - Updated created/archived by sections
- `sprint/sidecars/sm/patterns.md` - Updated helper delegation list
- `pennyfarthing-dist/scripts/utils/validate-subagent-frontmatter.sh` - Updated expected subagents list (13→8)

### Agent Configuration Updates
- `pennyfarthing-dist/agents/sm.md` - Updated helpers section, workflow examples, gates, and subagents table
- `pennyfarthing-dist/agents/sm-handoff.md` - Added CRITICAL section to prevent marking ACs complete without verification
- `pennyfarthing-dist/commands/new-work.md` - Complete rewrite with explicit 7-step subagent sequence
- `pennyfarthing-dist/agents/README.md` - Updated subagent lists and removed deprecated section

### Bug Fix: Workflow Enforcement
Added explicit gates and enforcement to prevent SM from skipping workflow steps:
- Session file must exist at `.session/{story-id}-session.md`
- Jira must be claimed (or explicitly skipped)
- Branch must be created before coding begins

## Workflow History

| Phase | Duration | Status |
|-------|----------|--------|
| Setup | 5h 5m | Complete |
| Implement | 30m + 8m 39s | Complete (2 iterations) |
| Review | 1h 2m + 1h 43m 20s | Complete (2 iterations - 1st rejected, 2nd approved) |

### Initial Rejection (Reviewer)
The first review iteration identified orphaned references to deleted subagents scattered across 10+ documentation files. While file deletions were correct, the cleanup was incomplete.

### Fix Pass
Dev (Naomi) fixed all 12 flagged files, removing all orphaned references and updating documentation to reference the consolidated subagents instead. The migration guides were appropriately preserved to document what was replaced.

### Final Approval
Reviewer verified that all critical issues were resolved, cleanup was complete, and the migration documentation was properly preserved.

## Acceptance Criteria - All Met

- [x] sm-story-setup.md deleted
- [x] sm-work-research.md deleted
- [x] sm-finish-bookkeeping.md deleted
- [x] sm-finish-execution.md deleted
- [x] sm-handoff.md retained (still needed for SM→TEA with Jira/branch setup)
- [x] sm-file-summary.md retained (still in use)
- [x] SM agent deprecated section cleaned up
- [x] SM agent workflow examples updated to use consolidated subagents
- [x] SM agent has explicit gates before coding (session file, Jira, branch)
- [x] /new-work command updated with explicit subagent call sequence
- [x] README deprecation notices removed

## Key Improvements

1. **Reduced complexity:** From 6 SM-specific subagents down to 3 (plus remove 4 deprecated generic handoff files)
2. **Workflow enforcement:** Explicit gates prevent SM from skipping critical setup steps
3. **Consistent patterns:** All handoffs now unified under generic-handoff subagent
4. **Complete cleanup:** No orphaned references to deleted files remain in active documentation
5. **Historical preservation:** Migration guides retained to show what was replaced

## Next Steps

Story 31-13 (Context-aware handoffs with auto-compaction) represents the next phase of workflow optimization, allowing handoffs to be aware of context usage and automatically compact when needed.
