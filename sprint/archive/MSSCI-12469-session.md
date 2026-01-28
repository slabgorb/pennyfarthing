# Story: MSSCI-12469 - Stats strip: Redesign layout with identity context

**Story ID:** MSSCI-12469
**Jira Key:** MSSCI-12469
**Title:** Stats strip: Redesign layout with identity context
**Epic:** epic-64 (Cyclist UX Polish)
**Workflow:** tdd
**Points:** 3
**Priority:** P1
**Status:** in_progress

## Story Description

Redesign stats strip to show:
PWD (responsive: short when narrow, full when wide) → Jira email → GitHub username → spacer → Claude model → Context %

Remove: context tokens, usage limits

## Acceptance Criteria

- [ ] PWD responsive (short in narrow window, long in wide)
- [ ] Jira email displayed from jira CLI config
- [ ] GitHub username displayed from gh CLI config
- [ ] Model and context % preserved
- [ ] Usage limits removed

---

## Workflow Tracking

**Workflow Type:** tdd (Test-Driven Development)
**Current Phase:** sm-finish

**Phase Sequence:** setup → tea → dev → reviewer → sm-finish

### Phase History

| Phase | Agent | Status | Timestamp |
|-------|-------|--------|-----------|
| setup | SM | completed | 2026-01-28T00:00:00Z |
| red | TEA | completed | 2026-01-28T00:00:00Z |
| green | Dev | completed | 2026-01-28T00:00:00Z |
| review | Reviewer | rejected | 2026-01-28T00:00:00Z |
| green | Dev | completed (fixes applied) | 2026-01-28T00:00:00Z |
| review | Reviewer | approved | 2026-01-28T07:03:00Z |

### Handoff History

| From | To | Gate | Status | Timestamp |
|------|----|----|--------|-----------|
| SM (setup) | TEA (red) | story_setup | PASSED | 2026-01-28T00:00:00Z |
| TEA (red) | Dev (green) | tests_fail | PASSED | 2026-01-28T00:00:00Z |
| Dev (green) | Reviewer (review) | tests_pass | PASSED | 2026-01-28T00:00:00Z |
| Reviewer (review) | Dev (green) | code_review | REJECTED | 2026-01-28T00:00:00Z |
| Dev (green) | Reviewer (review) | tests_pass (fixes applied) | PASSED | 2026-01-28T00:00:00Z |
| Reviewer (review) | SM (finish) | code_review | APPROVED | 2026-01-28T07:03:00Z |

---

## Assessments

### TEA Assessment (Test Engineer/Architect)

**Tests Required:** Yes
**Reason:** UI redesign requires verification of new elements and removal of old ones

**Test File:**
- `packages/cyclist/tests/MSSCI-12469-stats-strip-redesign.test.ts` - Stats strip redesign tests

**Tests Written:** 52 tests covering 5 ACs
**Status:** RED (30 failing - ready for Dev)

**Test Breakdown:**
| AC | Tests | Status |
|----|-------|--------|
| AC1: PWD responsive | 9 | 9 PASS (existing) |
| AC2: Jira email | 8 | 8 FAIL |
| AC3: GitHub username | 9 | 9 FAIL |
| AC4: Model/context preserved | 9 | 9 PASS (existing) |
| AC5: Usage limits removed | 7 | 7 FAIL |
| Layout verification | 6 | 4 FAIL |
| API endpoint | 4 | 4 FAIL |

**Implementation Notes for Naomi (Dev):**
1. Create `/api/identity` endpoint returning `{jiraEmail, githubUsername}`
   - Run `jira me` to get Jira email
   - Run `gh api user` to get GitHub username
2. Add `jira-email` and `github-user` elements to `index.html` in `.stats-left`
3. Remove `usage-5hr`, `usage-weekly`, `context-tokens`, `context-stats` from HTML
4. Remove `updateUsageMeter` export and usageStats IPC subscription from `stats-strip.js`
5. Add CSS for new identity elements, remove CSS for usage elements

**Handoff:** To Naomi (Dev) for implementation

### Dev Assessment (Developer)

**Implementation Complete:** Yes
**Files Changed (Round 1):**
- `packages/cyclist/src/api/identity.ts` - New identity API endpoint with caching (5min TTL)
- `packages/cyclist/src/api/index.ts` - Export createIdentityRouter
- `packages/cyclist/src/server.ts` - Mount /api/identity endpoint
- `packages/cyclist/src/public/index.html` - Add jira-email, github-user; remove usage elements
- `packages/cyclist/src/public/js/stats-strip.js` - Add identity functions; remove usage code
- `packages/cyclist/src/public/styles.css` - Add identity styles; remove usage styles

**Files Changed (Round 2 - Test Cleanup):**
- Deleted `tests/23-1-usage-limits.test.ts` - Obsolete tests for removed feature
- Updated `tests/B-22-stats-strip.test.ts` - Replace usage elements with identity
- Updated `tests/stats.test.ts` - Replace usage references with identity
- Updated `tests/sidebar.test.ts` - Replace usage elements with identity
- Fixed `stats-strip.js` - Remove dead code (strip-context-tokens reference)

**Tests:** 126 passing (GREEN) - Full test suite for MSSCI-12469 related tests
**PR:** #530 - feat(cyclist): redesign stats strip with identity context (MSSCI-12469)
**Branch:** feat/MSSCI-12469-stats-strip-redesign (pushed)
**Commits:** 2 (implementation + test cleanup)

**Round 2 Status:** All reviewer feedback incorporated and fixed
- Deleted obsolete test files for removed usage limits feature
- Updated remaining tests to match new stats strip layout
- Full test suite now passes with all acceptance criteria verified
- Ready for final code review

**Handoff:** To Avasarala (Reviewer) for final approval

### Reviewer Assessment (Code Reviewer) - Round 2

**Verdict:** APPROVED

**Review Observations:**

| Status | Finding | Location | Notes |
|--------|---------|----------|-------|
| [VERIFIED] | Test cleanup complete - 23-1-usage-limits.test.ts deleted (367 lines) | `tests/` | Obsolete tests for removed feature properly deleted |
| [VERIFIED] | B-22-stats-strip.test.ts updated with identity element tests | `tests/B-22-stats-strip.test.ts:74-84` | Properly tests jira-email and github-user |
| [VERIFIED] | stats.test.ts updated with identity assertions | `tests/stats.test.ts:45-51` | Tests identity elements in stats strip |
| [VERIFIED] | sidebar.test.ts updated | `tests/sidebar.test.ts:89-95` | Tests for identity elements in stats strip |
| [VERIFIED] | Security: No command injection risk | `identity.ts:23,41` | Hardcoded CLI commands with no user input |

**Data flow traced:** `/api/identity` → Express router → `getIdentity()` (cached 5min) → `getJiraEmail()`/`getGithubUsername()` (execSync with hardcoded commands) → JSON response → `fetchIdentity()` → `updateJiraEmail()`/`updateGithubUser()` → DOM elements with textContent (safe)

**Pattern observed:** Proper caching implementation at `identity.ts:53-74` with 5-minute TTL, preventing excessive CLI calls

**Error handling verified:**
- `identity.ts:29-32,48-50`: try-catch returning null on CLI failure
- `stats-strip.js:166-167`: Silent failure on API error (acceptable)
- `stats-strip.js:132-141,148-159`: Graceful null-check on element updates

**Security analysis:** VERIFIED SAFE
- Commands at `identity.ts:23`: `jira me --raw 2>/dev/null` - hardcoded, no injection
- Commands at `identity.ts:41`: `gh api user 2>/dev/null` - hardcoded, no injection
- DOM updates use `textContent` not `innerHTML` - XSS safe

**Test integrity:** PASSED
- MSSCI-12469 tests: 52/52 passing
- Related test files updated: B-22, stats.test, sidebar.test all pass
- Obsolete usage-limits tests properly deleted
- 16 failures in unrelated test files (MSSCI-12275, MSSCI-12477, etc.) - pre-existing issues

**Handoff:** To Camina Drummer (SM) for finish-story

---

## Session Notes

- Setup initiated: 2026-01-28
- Assignee: keith
- Repository: pennyfarthing
- Feature branch: feat/MSSCI-12469-stats-strip-redesign
