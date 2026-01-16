# Story 37-16: Agent High-Context Circuit Breaker Not Triggering

## Story Details
- **ID:** 37-16
- **Title:** Bug: Agent high-context circuit breaker not triggering
- **Points:** 3
- **Workflow:** tdd
- **Epic:** 37 - Technical Debt & Bug Fixes
- **Priority:** P1

## Root Cause Identified

The context circuit breaker hook (`context-circuit-breaker.sh`) is NOT registered in the project's `.claude/settings.local.json` file. The hook script exists and works correctly, but it's never invoked because it's missing from the PreToolUse hooks configuration.

Secondary issue: UI thresholds in `stats-strip.js` don't align with backend thresholds.

## Technical Approach

1. Register `context-circuit-breaker.sh` in `.claude/settings.local.json` PreToolUse hooks
2. Add `context_budget` configuration section to settings
3. Align UI thresholds in `stats-strip.js` with backend (70%/85%)
4. Write tests to verify end-to-end operation

## Files to Modify

### pennyfarthing repo:
- `.claude/settings.local.json` - Add circuit-breaker hook + context_budget

### cyclist repo:
- `packages/cyclist/src/public/js/stats-strip.js` - Align threshold constants

## Acceptance Criteria
- [ ] Root cause identified (why circuit breaker doesn't trigger)
- [ ] Circuit breaker fires at configured threshold
- [ ] Warning displayed to user when threshold approached
- [ ] Agent behavior changes appropriately at each threshold
- [ ] Context percentage calculation verified accurate
- [ ] Works in both Cyclist and raw Claude Code modes

## Progress
- [x] Research phase complete
- [x] Root cause identified: Missing hook registration
- [x] Tests written (RED phase)
- [x] Implementation complete (GREEN phase)
- [x] Review passed

## Code Review Assessment

**Reviewer:** Granny Weatherwax (Esme Weatherwax)
**Date:** 2026-01-16
**Verdict:** APPROVED

### Summary
The fix correctly addresses the root cause: the circuit breaker hook was never registered in the project's settings. The implementation properly separates Pennyfarthing configuration (`.pennyfarthing/config.local.yaml`) from Claude SDK configuration (`.claude/settings.local.json`).

### Findings

| Severity | Issue | Location | Status |
|----------|-------|----------|--------|
| Minor | Duplicate hook registration | `.claude/settings.local.json:65-82` | RESOLVED |

**Minor Issue:** ~~The circuit-breaker hook appeared twice in settings.local.json.~~ Fixed by user - duplicate removed.

### What Was Done Right
1. **Proper config separation** - Pennyfarthing config in `.pennyfarthing/`, SDK hooks in `.claude/`
2. **Graceful fallbacks** - YAML → JSON → defaults chain works correctly
3. **Threshold alignment** - UI now matches backend (70% warning, 85% critical)
4. **Test coverage** - New tests verify both hook registration and UI thresholds
5. **Documentation** - Session file header format documented in subagent

### Security: CLEAR
No user input handling, no injection vectors, proper use of yaml.safe_load().

### Edge Cases: HANDLED
Config parsing failures fall back to sensible defaults.

### Recommendation
APPROVE - Ship it. The duplicate hook is cosmetic and can be fixed in a follow-up chore.

## Tests Written (RED Phase)

### Shell Tests (tests/resilience/test_context_circuit_breaker.sh)
Added AC4 section - Project Settings Have Circuit Breaker:
1. `test_hook_registered_in_project_settings` - Hook must be in `.claude/settings.local.json`
2. `test_project_has_context_budget` - Project must have `context_budget` in `.pennyfarthing/config.local.yaml`
3. `test_project_has_critical_threshold` - Must define `critical_threshold`
4. `test_hook_has_correct_matcher_in_project` - Must use `Edit|Write|Bash|Task` matcher

### Cyclist Tests (packages/cyclist/tests/B-22-stats-strip.test.ts)
Added AC6 section - Context Thresholds Align with Backend:
1. Warning threshold should be 70% (not 50%)
2. Danger threshold should be 85% (not 80%)
3. Compact imminent threshold should be 70% (not 65%)

## Implementation (GREEN Phase)

### Changes Made
1. **check-context.sh** - Now reads context_budget from `.pennyfarthing/config.local.yaml` (preferred) with fallback to settings.local.json
2. **stats-strip.js** - Aligned thresholds: COMPACT_IMMINENT=70, warning=70%, danger=85%
3. **generic-sm-setup.md** - Fixed session file header format for Cyclist parser

### Configuration Applied (Manual)
- `.claude/settings.local.json` - Added context-circuit-breaker.sh hook
- `.pennyfarthing/config.local.yaml` - Added context_budget section

### Test Results
- Shell tests: 24/24 passing
- Cyclist tests: 40/40 passing

### PR
**PR:** #291
**Branch:** feat/37-16-circuit-breaker-fix

## Workflow Tracking
**Workflow:** tdd
**Phase:** finish
**Phase Started:** 2026-01-16T13:25:00Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-01-16T12:49:37Z | 2026-01-16T12:52:18Z | 3m |
| tea | 2026-01-16T12:52:18Z | 2026-01-16T12:58:00Z | 6m |
| dev | 2026-01-16T12:58:00Z | 2026-01-16T13:15:00Z | 17m |
| review | 2026-01-16T13:15:00Z | 2026-01-16T13:25:00Z | 10m |
| finish | 2026-01-16T13:25:00Z | - | - |
