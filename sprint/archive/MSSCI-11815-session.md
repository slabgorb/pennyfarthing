# Session: MSSCI-11815 - Clean up copy mode migration code

## Story Details
- **ID:** MSSCI-11815
- **Title:** Clean up copy mode migration code
- **Points:** 2
- **Epic:** MSSCI-11794 (Technical Debt & Bug Fixes)
- **Workflow:** trivial
- **Repos:** pennyfarthing

## Acceptance Criteria
- [ ] Copy mode migration code removed from update.ts
- [ ] Clean error if copy mode manifest found

## SM Assessment

**Technical Analysis:**

The copy mode migration code lives in `packages/core/src/cli/commands/update.ts`:
- Lines 82-101: Check for `installationType === 'copy'` and either migrate or error
- Lines 146-236: `migrateToSymlinkMode()` function - the full migration logic

Copy mode was deprecated long ago. At this point:
1. Any remaining copy mode installations should fail cleanly with instructions
2. The migration code itself can be removed since it's been available for months
3. Keep a simple check that errors out if copy mode manifest is found

**Files to modify:**
- `packages/core/src/cli/commands/update.ts` - Remove `migrateToSymlinkMode()` function and simplify copy mode handling to just error

**Approach:**
1. Remove `migrateToSymlinkMode()` function entirely (lines 146-236)
2. Simplify the copy mode check (lines 82-101) to just error with clear instructions
3. Build and verify

## Workflow
- **Current Phase:** dev
- **Next Phase:** reviewer
- **Route:** SM → Dev → Reviewer (trivial, 2pts)

## Dev Assessment

**Changes Made:**
1. Removed `migrateToSymlinkMode()` function entirely (~95 lines)
2. Simplified copy mode check to clean error with reinstall instructions
3. Removed unused `removeSymlinkOrDirectory` import

**Files Changed:**
- `packages/core/src/cli/commands/update.ts` (-102 lines, +8 lines)

**Verification:**
- Build passes: `npm run build` in packages/core ✓
- Code compiles cleanly with no TypeScript errors

**PR:** https://github.com/1898andCo/pennyfarthing/pull/337
**Branch:** `feat/MSSCI-11815-remove-copy-mode-migration`

## Reviewer Assessment

**PR:** #337
**Verdict:** APPROVED

**Code Review Evidence:**
- **Data flow traced:** `currentInstallType` from `manifest.installationType || 'copy'` at `update.ts:81` → condition check at line 87 → `logger.error()` + `process.exit(1)` at lines 88-93. No user input reaches dangerous functions.
- **Pattern observed:** Error handling follows existing pattern (matches node_modules check at lines 96-103). Consistent with codebase conventions.
- **Error handling:** Copy mode detection logs clear error with remediation steps, exits with code 1. Proper for shell scripting.

**Security:** N/A - no auth changes, no external input processing in modified paths.

**Performance:** N/A - code removal only, no new execution paths.

**Import cleanup verified:**
- `removeSymlinkOrDirectory` removed from imports (line 26) - no longer used in `update.ts`
- All remaining imports (`existsSync`, `readFileSync`, etc.) still have active usages

**Function removal verified:**
- `migrateToSymlinkMode` had no other callers in codebase (grep confirmed)
- Safe to delete

**Acceptance Criteria:**
- [x] Copy mode migration code removed from update.ts
- [x] Clean error if copy mode manifest found

**Preflight Results:**
- Build: PASSES
- No code smells (no console.log, TODO, FIXME)
- No lint violations

**Minor Observations (non-blocking):**
- None - this is clean technical debt removal

**Handoff:** To Gorilla Grodd (SM) for finish-story workflow

## Workflow Tracking

**Workflow:** trivial
**Phase:** finish
**Phase Started:** 2026-01-18T15:30:06Z
**Status:** approved

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| review | (started with Reviewer) | 2026-01-18T15:30:06Z | (review phase) |

## Handoff History

| Phase | Agent | Timestamp | Context % | Mode |
|-------|-------|-----------|-----------|------|
| review | reviewer | 2026-01-18T15:30:06Z | 30% | ask |

## Handoff

Approved for merge. Ready for SM to finish story.
