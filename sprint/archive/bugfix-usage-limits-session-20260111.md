# Session: Bugfix - Usage Limits Stats Strip Not Working

## Story Info
| Field | Value |
|-------|-------|
| ID | bugfix-usage-limits |
| Title | Fix usage limits showing 100%/100% |
| Points | 2 |
| Type | Bugfix |
| Epic | 23 - Cyclist Claude Code Command Integration |

## Status
| Phase | Status | Agent |
|-------|--------|-------|
| Setup | DONE | SM |
| RED | SKIP | - |
| GREEN | DONE | Dev |
| Review | APPROVED | Reviewer |
| Finish | PENDING | SM |

## Problem Statement

The session credit limit feature (implemented in Story 23-1) shows "100%/100%" for both 5-hour and weekly usage limits. This is incorrect - it should show actual usage data from Claude.

### Root Cause

The `startUsagePolling()` function in `packages/cyclist/src/main.ts:718-733` was scaffolded but never implemented:

```typescript
export function startUsagePolling(_projectDir: string): () => void {
  usagePollTimer = setInterval(() => {
    // TODO: Call /status, parse output, and update usage stats
    // For now, polling is set up but no data is broadcast until real integration
  }, USAGE_POLL_INTERVAL_MS);
  // ...
}
```

The polling interval runs every 60 seconds but does nothing. Default values are `0` (0% used), and the UI calculates `100 - 0 = 100%` remaining.

## Technical Context

### Key Files
| File | Purpose |
|------|---------|
| `packages/cyclist/src/main.ts:718-733` | `startUsagePolling()` - needs implementation |
| `packages/cyclist/src/main.ts:674-684` | `updateUsageStats()` - broadcasts to renderer |
| `packages/cyclist/src/public/js/stats-strip.js:155-180` | UI display logic (working correctly) |

### What Needs to Happen
1. Run Claude's `/status` command via the existing PTY/session
2. Parse the usage limits from output (format TBD - investigate first)
3. Extract 5-hour and weekly percentages
4. Call `updateUsageStats()` with real values

### Existing Infrastructure
- `sendToTerminal()` can send commands to the Claude session
- PTY output is already being captured and parsed
- `parser.ts` has patterns for extracting data from Claude output
- IPC broadcast via `updateUsageStats()` is already wired up

## Acceptance Criteria
- [x] Usage limits display actual values (via ccusage CLI)
- [x] Polling updates values every 60 seconds
- [x] Display shows "—%" when data unavailable (not 100%)

## Handoff
| Field | Value |
|-------|-------|
| From | SM (Mentor) |
| To | Dev (Odysseus) |
| Time | 2026-01-11 |
| Note | Bugfix - skip TDD, implement directly |

---

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `packages/cyclist/src/main.ts` - Implemented `fetchUsageFromCcusage()` and updated `startUsagePolling()`
- `packages/cyclist/src/public/js/stats-strip.js` - Handle "no data" case with "—%" display
- `.claude/project/agents/reviewer-sidecar/gotchas.md` - Added gotcha about stub implementations

**Approach:**
Instead of parsing `/status` output (not available in programmatic mode), used the `ccusage` CLI tool which reads local JSONL files from `~/.claude/projects/`. This provides:
- 5-hour block usage: From active block's totalTokens vs MAX_TOKENS_PER_BLOCK
- Weekly usage: Sum of last 7 days of blocks vs weekly max

**Tests:** 79/79 related tests passing (42 usage-limits + 37 stats-strip)
**PR:** #174 - fix(usage): implement actual usage limits display via ccusage
**Branch:** fix/usage-limits-display (pushed)

**Handoff:** To Reviewer (Penelope) for code review

---

## Reviewer Assessment

**PR:** #174
**Verdict:** APPROVED

**Code Review Evidence:**
- **Data flow traced:** `npx ccusage blocks --json` output at `main.ts:724` → JSON parse → calculate percentage → `updateUsageStats()` at `main.ts:797` → IPC broadcast → `stats-strip.js:updateUsageMeter()` at line 150. Safe - no user input, local files only.
- **Pattern observed:** Proper error handling with graceful degradation at `main.ts:775-778`. Returns null on failure, UI shows "—%" instead of misleading data.
- **Error handling:** try-catch wraps entire fetch function. Null checks before broadcasting. Cleanup function properly clears interval at `main.ts:805-811`.

**Security:** N/A - no user input handling, no network requests (uses --offline), subprocess command is hardcoded (no injection risk).

**Performance:** Acceptable. `execSync` blocks event loop but mitigated by: 30s timeout, 60s polling interval, and `--offline` flag means fast local file reads.

**Minor Observations (non-blocking):**
- `MAX_TOKENS_PER_BLOCK` at `main.ts:715` is hardcoded for "Claude Max plan" - could be configurable for other plans
- Weekly limit calculation at `main.ts:758` is approximation (33.6x 5-hour limit)

**Handoff:** To SM for finish-story workflow

---

## Reviewer Handoff - APPROVED

**Date:** 2026-01-11
**Reviewer:** Penelope (Granny Weatherwax)
**Subagent:** reviewer-handoff-approve
**PR:** #174 - fix(usage): implement actual usage limits display via ccusage
**Repos:** pennyfarthing
**Action:** Route to SM for finish workflow

**Summary:**
PR #174 approved after code review. All acceptance criteria verified:
- Usage limits display actual values (via ccusage CLI)
- Polling updates values every 60 seconds
- Display shows "—%" when data unavailable

**Next Step:** SM completes story (archive session, close PR/story)

---

## SM Completion Summary

**Date:** 2026-01-11
**SM:** Mentor (Athena)

### What Was Accomplished

Fixed the usage limits display in Cyclist's session stats strip. The original Story 23-1 implementation scaffolded the UI but left `startUsagePolling()` as a stub, causing the display to show "100%/100%" (derived from 100 - 0 default values).

**Solution:** Implemented `fetchUsageFromCcusage()` which invokes the `ccusage` CLI tool to read Claude Code's local JSONL usage files. This provides:
- **5-hour block usage:** Active block's totalTokens vs MAX_TOKENS_PER_BLOCK (45M for Max plan)
- **Weekly usage:** Sum of last 7 days vs weekly limit approximation

**Key Design Decision:** Used `ccusage --offline` instead of parsing `/status` output. This was pragmatic - the CLI tool already handles the JSONL parsing, and `--offline` flag ensures fast local file reads without network latency.

### Files Changed
| File | Change |
|------|--------|
| `packages/cyclist/src/main.ts` | Implemented `fetchUsageFromCcusage()`, updated `startUsagePolling()` |
| `packages/cyclist/src/public/js/stats-strip.js` | Handle null data with "—%" display |
| `.claude/project/agents/reviewer-sidecar/gotchas.md` | Added gotcha about stub implementations |

### Acceptance Criteria
- [x] Usage limits display actual values (via ccusage CLI)
- [x] Polling updates values every 60 seconds
- [x] Display shows "—%" when data unavailable (not 100%)

### Learnings
- **Stub Detection:** When features show default values, check if implementation is actually complete vs scaffolded
- **External Tools:** Leveraging existing CLI tools (ccusage) can be more robust than reimplementing parsing logic

### Story Complete
PR #174 merged. Session archived.
