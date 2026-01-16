# Story 38-1: Fix stale references in agent files

## Status
- Phase: finish
- Started: 2026-01-15
- Assigned: Keith Avery
- Workflow: trivial
- **Verdict:** APPROVED - Ready for SM finish

## Story Overview
- **Epic:** 38 - Agent File Modernization
- **Points:** 1
- **Priority:** P1
- **Repos:** pennyfarthing

## Technical Context

Quick fixes for incorrect/stale content identified in audit. All issues are
simple text replacements - no logic changes.

### Issues to Fix

1. **README.md:71** - Wrong path `../agent-scopes.yaml`
   - Fix: `.claude/project/docs/agent-scopes.yaml`

2. **README.md:361** - Wrong path `.claude/guides/agent-scopes.yaml`
   - Fix: `.claude/project/docs/agent-scopes.yaml`

3. **README.md:249-250** - Contradictory WRONG example
   - Shows `$CLAUDE_PROJECT_DIR/scripts/agent-session.sh` as WRONG
   - But this is actually the CORRECT pattern (line 256 explains why)
   - Fix: Remove this misleading "WRONG" example

4. **orchestrator.md:100-108** - Hardcoded Discworld characters
   - Table shows: Carrot, Igor, Ponder, Granny, Leonard, Vetinari, Lu-Tze, Sacharissa
   - Fix: Use generic role names (SM, TEA, Dev, Reviewer, etc.)

5. **sm-handoff.md:10-11** - Hardcoded character names
   - Line 10: `From: SM (Captain Carrot)`
   - Line 11: `To: TEA (Igor)`
   - Fix: Use placeholders or generic names

6. **reviewer-preflight.md:112** - Wrong subagent_type
   - Current: `subagent_type: "general-purpose"`
   - Fix: `subagent_type: "testing-runner"`

## Files to Modify
- `pennyfarthing-dist/agents/README.md` (3 fixes)
- `pennyfarthing-dist/agents/orchestrator.md` (1 fix)
- `pennyfarthing-dist/agents/sm-handoff.md` (1 fix)
- `pennyfarthing-dist/agents/reviewer-preflight.md` (1 fix)

## Acceptance Criteria
- [x] All path references correct
- [x] No hardcoded theme character names
- [x] reviewer-preflight uses testing-runner subagent
- [x] README examples are consistent

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `pennyfarthing-dist/agents/README.md` - Fixed 2 wrong paths to agent-scopes.yaml, fixed contradictory WRONG example
- `pennyfarthing-dist/agents/orchestrator.md` - Removed hardcoded Discworld character names from agent table
- `pennyfarthing-dist/agents/sm-handoff.md` - Replaced hardcoded character names with generic/placeholder
- `pennyfarthing-dist/agents/reviewer-preflight.md` - Changed subagent_type from general-purpose to testing-runner

**Tests:** N/A (documentation changes only)
**PR:** #284 - fix(38-1): Fix stale references in agent files
**Branch:** feat/38-1-fix-stale-agent-refs (pushed)

**Handoff:** To Reviewer for code review

## Reviewer Handoff

**Repository:** pennyfarthing
**Branch:** feat/38-1-fix-stale-agent-refs
**PR:** #284 - fix(38-1): Fix stale references in agent files
**Commit:** 9250c724

**Files Changed:**
- `pennyfarthing-dist/agents/README.md` - Fixed 2 stale paths to agent-scopes.yaml, corrected contradictory example
- `pennyfarthing-dist/agents/orchestrator.md` - Removed hardcoded Discworld character names from agent table
- `pennyfarthing-dist/agents/sm-handoff.md` - Replaced hardcoded character names with generic placeholders
- `pennyfarthing-dist/agents/reviewer-preflight.md` - Corrected subagent_type from general-purpose to testing-runner
- `sprint/current-sprint.yaml` - Updated story status

**What Was Implemented:**
All 6 stale reference issues identified in the audit have been fixed:
1. README path references now point to correct `.claude/project/docs/agent-scopes.yaml`
2. Hardcoded Discworld character references replaced with generic role names (SM, TEA, Dev, Reviewer)
3. Contradictory "WRONG" example removed from README
4. reviewer-preflight now uses correct testing-runner subagent type

Documentation is now consistent and free of hardcoded theme dependencies.

## Workflow Tracking
**Workflow:** trivial
**Phase:** finish
**Phase Started:** 2026-01-16T00:44:28Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-01-15T00:00:00Z | 2026-01-15T19:35:00Z | 19h 35m |
| implement | 2026-01-15T19:35:00Z | 2026-01-16T00:37:53Z | 5h 2m |
| review | 2026-01-16T00:37:53Z | 2026-01-16T00:44:28Z | 6m |
| finish | 2026-01-16T00:44:28Z | - | - |

## Reviewer Preflight Results

### Test Cache
No cache available - tests executed fresh.

| Metric | Value |
|--------|-------|
| Git SHA | 9250c724 |
| Test Status | PASS (2502 passed, 81 skipped) |
| Lint Status | YELLOW (pre-existing warning) |
| Last Run | 2026-01-15T20:45:00Z |

### Pre-Flight Checks Completed
- [x] All tests passing
- [x] No new lint errors
- [x] No code smells
- [x] File paths verified
- [x] Documentation changes correct
- [x] Ready for code review

**Pre-Flight Report:** Available at `.session/38-1-preflight-report.md`

## Reviewer Assessment

**PR:** #284
**Verdict:** APPROVED

**Code Review Evidence:**
- **Path verification:** Both corrected paths (README.md:71, README.md:361) point to `.claude/project/docs/agent-scopes.yaml` which exists (verified via `ls -la`)
- **Pattern observed:** Uses generic role names (SM, TEA, Dev) consistently with other agent files - matches pattern in sm.md, dev.md, tea.md, reviewer.md
- **Logic consistency:** README example at lines 249-250 now correctly shows hardcoded absolute path as WRONG, matching explanation at line 255

**Security:** N/A - Documentation changes only, no auth or input handling
**Performance:** N/A - No runtime code changes

**Verification Performed:**
- Confirmed no remaining hardcoded theme references in `pennyfarthing-dist/agents/*.md` via grep
- Confirmed `testing-runner` subagent type matches pattern used across all agent files (sm.md, dev.md, reviewer.md, generic-handoff.md)
- Confirmed corrected file path exists on disk

**Minor Observations (non-blocking):**
- None. Clean, focused fixes.

**Handoff:** APPROVED - To SM for finish-story workflow

## Handoff History

| From Phase | To Phase | Agent | Timestamp | Context | Mode |
|-----------|---------|-------|-----------|---------|------|
| review | finish | sm | 2026-01-16T00:44:28Z | 47% | manual |
