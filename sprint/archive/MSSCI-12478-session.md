# Session: 64-11 - Theme schema: Consolidate quote → catchphrases

## Story Metadata
- **Story ID:** 64-11
- **Jira Key:** MSSCI-12478
- **Title:** Theme schema: Consolidate quote → catchphrases
- **Points:** 3
- **Epic:** Epic 64 (Cyclist UX Polish)
- **Status:** In Progress

## Story Description
Some themes have quote field, others have catchphrases array. Consolidate all to use catchphrases array only.

## Acceptance Criteria
1. Migration script merges quote into catchphrases
2. All 102 themes updated
3. quote field removed from schema
4. Theme validation updated

## Workflow Configuration
- **Workflow:** tdd (phased)
- **Current Phase:** finish
- **Repos:** pennyfarthing

## Feature Branch
- **Branch Name:** feature/MSSCI-12478-theme-schema-consolidation
- **Created:** 2026-01-28
- **Upstream:** origin/develop

## Technical Context

### Current State
- Theme definitions located in `pennyfarthing-dist/personas/`
- 102 total themes across various categories
- Schema definition needs review to understand current quote/catchphrases implementation
- Migration script needs to be created to consolidate fields

### Implementation Approach

**Schema Changes Required:**
1. `packages/shared/src/theme-loader.ts` - Update `ThemeAgent` interface: replace `quote: string` with `catchphrases: string[]`
2. `packages/shared/src/theme-loader.ts` - Update YAML parser to parse `catchphrases` array instead of `quote`
3. `packages/core/src/cli/utils/themes.ts` - Update `ThemeAgent` interface (line 19): replace `quote?: string` with `catchphrases?: string[]`
4. `packages/cyclist/src/theme-metadata.ts` - Update `ThemeAgent` interface (line 30): replace `quote?: string` with `catchphrases?: string[]`
5. `packages/cyclist/src/pennyfarthing.ts` - `selectCatchphrase()` already handles this (MSSCI-12473)

**Migration Script:**
- Create script to process all 102 YAML files in `pennyfarthing-dist/personas/themes/`
- For each agent: merge `quote` value into `catchphrases` array (avoid duplicates)
- Remove `quote` field from all agents
- Keep catchphrases array order (quote can be first if not already present)

### Test Strategy

**Test Files Created:**
- `packages/shared/src/theme-loader.test.ts` - Tests loadTheme returns catchphrases, not quote
- `packages/shared/src/migrate-theme-schema.test.ts` - Tests all 102 YAML files migrated

**Tests (6 failing - RED state):**
1. AC3: ThemeAgent should have catchphrases array, not quote string
2. AC3: catchphrases array should contain at least one entry
3. AC1: Original quote should be present in catchphrases array
4. AC1: catchphrases should not have duplicates after migration
5. AC4: Should parse catchphrases array from YAML
6. AC2: No theme file should contain quote: field under agents

### Key Files to Modify
- `packages/shared/src/theme-loader.ts` - Main schema and parser
- `packages/core/src/cli/utils/themes.ts` - CLI theme utilities
- `packages/cyclist/src/theme-metadata.ts` - Cyclist theme types
- `pennyfarthing-dist/personas/themes/*.yaml` - All 102 theme files

## TEA Assessment

**Tests Required:** Yes
**Reason:** Schema migration with data transformation across 102 files

**Test Files:**
- `packages/shared/src/theme-loader.test.ts` - Tests loadTheme returns catchphrases
- `packages/shared/src/migrate-theme-schema.test.ts` - Tests all YAML files migrated

**Tests Written:** 6 tests covering 4 ACs
**Status:** RED (failing - ready for Dev)

**Handoff:** To Dev for implementation

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `packages/shared/src/theme-loader.ts` - Replaced hand-rolled parser with yaml library, updated interface
- `packages/shared/package.json` - Added yaml dependency
- `packages/core/src/cli/utils/themes.ts` - Updated ThemeAgent interface
- `packages/cyclist/src/theme-metadata.ts` - Updated ThemeAgent interface
- `pennyfarthing-dist/personas/themes/*.yaml` - Removed quote field from 101 themes
- `pennyfarthing-dist/scripts/maintenance/migrate-theme-schema.mjs` - Migration script

**Tests:** 103/103 passing (GREEN)
**PR:** #532 - feat(theme): consolidate quote → catchphrases (MSSCI-12478)
**Branch:** feature/MSSCI-12478-theme-schema-consolidation (pushed)

**Handoff:** To Reviewer for code review

## Workflow History
- **Setup (phase):** Session created - pending TEA handoff
- **Handoff to TEA:** SM setup complete, branch created, Jira claimed
- **RED phase:** 6 failing tests written, ready for implementation
- **Handoff to Dev:** RED phase complete, 6 failing tests ready
- **GREEN phase:** Implementation complete, all tests passing, PR #532 created
- **Handoff to Reviewer:** GREEN phase complete, PR #532 ready for review
- **REJECTED:** 2 blocking issues: ESLint errors in test file (lines 38, 59) and misleading "103/103 passing" claim - dev must fix lint and update assessment
- **Handoff to Dev (Re-fix):** Lint issues fixed in commit a54c19df8, re-ready for review
- **APPROVED (Re-Review):** All prior issues resolved - lint fixed, test assessment clarified, backwards compatibility verified

## Reviewer Assessment

**Verdict:** REJECTED

| Severity | Issue | Location | Fix Required |
|----------|-------|----------|--------------|
| [HIGH] | ESLint errors blocking merge | `packages/shared/src/migrate-theme-schema.test.ts:38,59` | Fix `no-regex-spaces` errors - use `{4}` instead of literal 4 spaces in regex |
| [MEDIUM] | Dev claims "103/103 tests passing" but tests actually FAIL | Test suite | Dev assessment claims GREEN but preflight shows failures in packages/core and packages/vscode-extension |

**Data flow traced:** YAML theme files → `theme-loader.ts` (parses catchphrases) → `theme-metadata.ts` / `themes.ts` interfaces → `pennyfarthing.ts selectCatchphrase()` (selects random catchphrase with fallback to quote) → returns `quote` field in Persona for API consumers. VERIFIED - wiring is correct.

**Pattern observed:** Good use of yaml library instead of hand-rolled parser at `packages/shared/src/theme-loader.ts:7,63`. This is a significant improvement - the original 80-line hand-rolled parser was correctly removed.

**Verified good:**
1. [VERIFIED] All 102 theme files present, no `quote:` field remaining (grep confirmed)
2. [VERIFIED] 101 themes have catchphrases (control.yaml intentionally exempt - documented in tests)
3. [VERIFIED] TypeScript interfaces consistently updated across all 3 packages (shared, core, cyclist)
4. [VERIFIED] Backwards compatibility maintained - `Persona.quote` output field still exists, now populated from `selectCatchphrase()` with fallback logic from MSSCI-12473
5. [VERIFIED] Migration script exists and is idempotent (removes quotes, doesn't add to catchphrases if already present)

**Issues requiring attention:**

1. **ESLint errors must be fixed before merge.** The test file has 2 blocking lint errors:
   - Line 38: `/^    quote:/m` should use `{4}` quantifier
   - Line 59: Same issue with catchphrases regex

2. **Dev assessment is misleading.** Claims "103/103 passing" but:
   - packages/core has 7 failing tests (cyclist migration - pre-existing, unrelated)
   - packages/vscode-extension has config error (pre-existing, unrelated)
   - The PR-specific tests DO pass when run in isolation

**Handoff:** Back to Dev for lint fixes

## Dev Assessment (Post-Review Fix)

**Fixes Applied:** Yes
**Commit:** a54c19df8 - fix(theme): address reviewer lint feedback (MSSCI-12478)

**Issues Resolved:**
1. Fixed `no-regex-spaces` ESLint errors in `migrate-theme-schema.test.ts` lines 38 and 59 - replaced literal 4 spaces with `{4}` quantifier
2. Fixed `@typescript-eslint/no-explicit-any` warnings in `theme-loader.test.ts` - removed unnecessary casts since ThemeAgent type is properly inferred

**Clarification on test counts:** The "103/103 passing" refers to the `packages/shared` tests which are the only tests relevant to this story. The pre-existing failures in `packages/core` (cyclist migration) and `packages/vscode-extension` (vitest config) are unrelated to this PR.

**Lint:** 0 errors, 0 warnings (passes `--max-warnings 0`)
**Tests:** 103/103 passing in packages/shared
**Branch:** feature/MSSCI-12478-theme-schema-consolidation (pushed)

**Handoff:** Back to Reviewer for re-review

## Reviewer Assessment (Re-Review)

**Verdict:** APPROVED

**Issues from prior review - RESOLVED:**
1. [FIXED] ESLint `no-regex-spaces` errors at `migrate-theme-schema.test.ts:38,59` - now uses `{4}` quantifier
2. [FIXED] `@typescript-eslint/no-explicit-any` warnings in `theme-loader.test.ts` - removed unnecessary casts
3. [CLARIFIED] Test count - Dev correctly scoped "103/103" to `packages/shared` which is the relevant package

**Verification performed:**
- [VERIFIED] `npm run lint` passes with 0 errors, 0 warnings
- [VERIFIED] `packages/shared` tests: 103/103 pass
- [VERIFIED] Regex patterns use proper `{4}` quantifier (grep confirmed)
- [VERIFIED] No `as any` casts remain in test file (grep confirmed)

**Prior observations remain valid:**
- Data flow verified: YAML → theme-loader → interfaces → selectCatchphrase
- All 102 themes migrated, no `quote:` field remaining
- Backwards compatibility maintained via `Persona.quote` output field
- Migration script is idempotent

**Handoff:** To SM for finish-story
