# Story MSSCI-12473: Persona section: Random catchphrase on activation

## Story Details
- **ID:** MSSCI-12473
- **Jira Key:** MSSCI-12473
- **Workflow:** tdd
- **Repos:** pennyfarthing

## Workflow Tracking
**Workflow:** tdd
**Phase:** finish
**Phase Started:** 2026-01-27T23:52:48Z
**Feature Branch:** feat/MSSCI-12473-random-catchphrase

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-01-27T00:00:00Z | 2026-01-27T00:01:00Z | 1m |
| red | 2026-01-27T00:01:00Z | 2026-01-27T23:46:22Z | 23h 45m |
| green | 2026-01-27T23:46:22Z | 2026-01-27T23:50:20Z | 3m |
| review | 2026-01-27T23:50:20Z | 2026-01-27T23:52:48Z | 2m |

## Story Context

### Epic
- **Epic ID:** epic-64
- **Epic Title:** Epic: Cyclist UX Polish
- **Epic Jira:** MSSCI-12465

### Story Description
Instead of showing static quote, pick random catchphrase from theme's catchphrases array on agent activation. Quote stays fixed until next agent switch.

### Acceptance Criteria
- Random catchphrase selected from array on agent switch
- Falls back to first catchphrase if array has one item
- Falls back to quote field if catchphrases missing

### Story Points
- **Points:** 2
- **Priority:** P1
- **Status:** backlog

### Branch
- **Branch Name:** feat/MSSCI-12473-random-catchphrase

## TDD Workflow Routing
This story uses the **tdd** workflow (phased type), which routes through:
1. SM → TEA → Dev → Reviewer → SM (complete)

Next agent after setup: **TEA** (Test Engineer)

## SM Assessment
- **Phase Transition:** setup → red
- **Prerequisites Verified:** Feature branch created, Jira story tracked
- **Acceptance Criteria:** 3 criteria defined
- **Handoff Status:** Ready for TEA (RED phase)
- **Notes:** Story context established, branch ready for test-driven development
- **Transitioned To:** TEA at 2026-01-27T00:01:00Z

## TEA Assessment

**Tests Required:** Yes
**Reason:** Core functionality change - random catchphrase selection on agent activation

**Test Files:**
- `packages/cyclist/tests/B-MSSCI-12473-random-catchphrase.test.ts` - Tests for selectCatchphrase function

**Tests Written:** 14 tests covering 3 ACs
- AC1: Random selection from catchphrases array (3 tests)
- AC2: Single-item array fallback (2 tests)
- AC3: Missing catchphrases fallback to quote (5 tests)
- Edge cases: special chars, unicode, long strings, whitespace (4 tests)

**Status:** RED (failing - `selectCatchphrase is not a function`)

**Implementation Notes for Dev:**
1. Create `selectCatchphrase(catchphrases?: string[], fallbackQuote?: string): string` function in `pennyfarthing.ts`
2. Export it from the module
3. Use `Math.random() * array.length` for selection
4. Integrate into persona building where `quote` is currently used

**Handoff:** To Dev (Inigo Montoya) for implementation

### Handoff History
| From | To | Gate | Status | Timestamp |
|------|-----|------|--------|-----------|
| red (tea) | green (dev) | tests_fail | PASSED | 2026-01-27T23:46:22Z |
| green (dev) | review (reviewer) | tests_pass | PASSED | 2026-01-27T23:50:20Z |
| review (reviewer) | finish (sm) | approval | PASSED | 2026-01-27T23:52:48Z |

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `packages/cyclist/src/pennyfarthing.ts` - Added selectCatchphrase() function and wired into getCurrentPersona()

**Tests:** 14/14 passing (GREEN)
**PR:** #526 - feat(cyclist): random catchphrase on agent activation
**Branch:** feat/MSSCI-12473-random-catchphrase (pushed)

**Implementation Details:**
1. Created `selectCatchphrase(catchphrases?, fallbackQuote?)` function
2. Random selection via `Math.floor(Math.random() * length)`
3. Fallback chain: catchphrases array → first item if single → quote field → empty string
4. Integrated into `getCurrentPersona()` to replace static quote with selected catchphrase

**Handoff:** To Reviewer (Westley) for code review

## Reviewer Assessment

**Verdict:** APPROVED

**Data Flow Traced:**
- Theme YAML `catchphrases[]` → `getCurrentPersona()` extracts at line 450 → `selectCatchphrase()` at line 452 → returns as `quote` field → API `/api/persona` → frontend `persona.js:107` → `#character-quote` div
- Flow is complete and correct

**Observations:**
1. `[VERIFIED]` Function implementation correct at `pennyfarthing.ts:70-94` - proper null handling with `??`
2. `[VERIFIED]` Wiring complete - exported function called in `getCurrentPersona()` line 452
3. `[VERIFIED]` Error handling covers null/undefined/empty array cases
4. `[VERIFIED]` Tests comprehensive - 14 tests including randomness distribution check
5. `[LOW]` Uses `Math.random()` - acceptable for UI catchphrase selection (not crypto)

**Pattern Observed:** Clean fallback chain (empty→fallback→single→random) at `pennyfarthing.ts:78-93`

**Security:** No issues - function only selects from static theme data, no user input

**Preflight Results:**
- Tests: 14/14 passing
- Build: Clean
- Forbidden patterns: None found

**Handoff:** To SM (Vizzini) for finish-story
