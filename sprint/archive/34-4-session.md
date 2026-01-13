# Story 34-4: Upgrade Path Handling

| Field | Value |
|-------|-------|
| Story | 34-4 |
| Title | Upgrade path handling |
| Points | 2 |
| Status | GREEN |
| Phase | sm |
| Phase Started | 2026-01-13T20:15:00Z |
| Branch | feat/34-4-upgrade-path-handling |
| Jira | MSSCI-11622 |

## Acceptance Criteria

- [ ] README documents upgrade path (when to rebuild, clean artifacts)
- [ ] just cyclist-setup cleans stale artifacts before rebuilding
- [ ] install-cli.sh warns if replacing CLI pointing to different location
- [ ] Troubleshooting section for upgrade-specific issues

## TEA Assessment

**Tests Required:** Yes
**Reason:** Script changes have behavioral logic that could regress

**Test Files:**
- `packages/cyclist/tests/34-4-upgrade-path.test.ts` - Upgrade path validation

**Tests Written:** 12 tests covering 2 testable ACs + documentation checks
**Status:** RED (failing - ready for Dev)

### Test Coverage Breakdown

| AC | Tests | Description |
|----|-------|-------------|
| AC2: cyclist-setup cleans | 3 | Verifies cyclist-clean in setup, order before pnpm, user messaging |
| AC3: install-cli warns | 6 | Checks for existing CLI, reads path, compares, warns, suggests action |
| Documentation existence | 3 | Upgrading section exists, references cyclist-doctor, mentions when to rebuild |

**Note:** ACs 1 and 4 are documentation-only (prose content not testable). The 3 documentation tests verify structure exists, not content quality.

**Handoff:** To Dev (Hari Seldon) for implementation

## Dev Assessment

**Implementation Summary:**
Implemented all 4 acceptance criteria with minimal, focused changes.

**Files Changed:**
- `justfile` - Added cyclist-clean as step 1/4 in cyclist-setup recipe
- `packages/cyclist/scripts/install-cli.sh` - Added existing CLI detection and relocation warning
- `packages/cyclist/README.md` - Added "Upgrading Cyclist" section (31 lines)

**Design Decisions:**
1. **cyclist-setup cleans first** - Step 0 ensures stale artifacts don't cause issues during rebuild
2. **Warning, not blocking** - CLI relocation warning informs but doesn't prevent install
3. **grep-based detection** - Simple, reliable extraction of CYCLIST_ROOT from existing wrapper
4. **Consolidated docs** - "When to Rebuild" and diagnostic info in single Upgrading section

**Test Results:**
- 12/12 tests passing (GREEN)
- No regression in existing tests

**Confidence:** High - straightforward changes with comprehensive test coverage

**Handoff:** To Reviewer (The Merovingian) for code review

## Reviewer Assessment

**Verdict:** APPROVE

**Code Quality:**
- Proper strict mode in shell scripts (`set -euo pipefail`)
- Defensive error handling (`2>/dev/null || echo ""`)
- Correct pattern matching for CYCLIST_ROOT extraction
- Clean, minimal changes focused on acceptance criteria

**Security:** No vulnerabilities found
- No command injection
- No unquoted variables
- No credential exposure
- Proper quoting throughout

**Minor Observations (Non-blocking):**
- Warning labels "Current"/"New" could be clearer ("Old location"/"New location")
- Documentation is comprehensive and well-structured

**Test Coverage:** 12 tests covering all testable ACs - comprehensive

**Ready for merge to develop.**

## Technical Context

**Current State Analysis:**

| Component | Current Behavior | Upgrade Gap |
|-----------|-----------------|-------------|
| README.md | Setup docs, troubleshooting | No dedicated upgrade section |
| cyclist-setup | Idempotent 3-step: deps → rebuild → build | Doesn't clean stale dist/ first |
| install-cli.sh | Creates wrapper at /usr/local/bin/cyclist | No warning if CLI points elsewhere |
| cyclist-doctor | Health check with --fix | Works, but users don't know to run it |

**Key Files to Modify:**

1. **packages/cyclist/README.md**
   - Add "Upgrading Cyclist" section before Troubleshooting
   - Document when rebuild is needed (Node upgrade, pnpm update, git pull)
   - Reference cyclist-doctor --fix as first diagnostic step

2. **justfile** (cyclist-setup recipe, ~L81-100)
   - Add `just cyclist-clean` step before install deps
   - Ensures stale dist/ artifacts are removed before rebuild

3. **packages/cyclist/scripts/install-cli.sh**
   - Check if /usr/local/bin/cyclist exists and reads CYCLIST_DIR
   - Warn if existing CLI points to different directory
   - Suggest removing old CLI first

**Upgrade Flow (After Changes):**
```
git pull                    # Get latest code
just cyclist-setup          # Auto-cleans dist/, rebuilds everything
just cyclist-doctor --fix   # Verify and auto-repair
just cyclist-install        # Install app + CLI (warns if relocation)
```

**Edge Cases:**
- User moved Cyclist repo but old CLI wrapper still exists
- Node version changed (requires native module rebuild)
- pnpm major version change (symlinks may break)
- Multiple Cyclist installations (different branches/forks)

## Routing

**Points:** 2 (trivial work)
**Route:** SM → Dev (skip TEA)
**Reason:** Documentation + minor script changes, no complex logic requiring TDD

---

## Workflow Tracking

**Phase:** approved
**Phase Started:** 2026-01-13T21:25:00Z

### Phase History

| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| sm | 2026-01-13T20:15:00Z | 2026-01-13T20:20:00Z | 5m |
| tea | 2026-01-13T20:20:00Z | 2026-01-13T21:05:00Z | 45m |
| dev | 2026-01-13T21:05:00Z | 2026-01-13T21:15:00Z | 10m |
| review | 2026-01-13T21:15:00Z | 2026-01-13T21:25:00Z | 10m |
| approved | 2026-01-13T21:25:00Z | - | - |

### Workflow Checklist

- [x] SM: Story setup, branch created
- [x] TEA: Tests written (RED state) - 12 tests all failing
- [x] Dev: Implementation (make tests GREEN) - PR #226
- [x] Reviewer: Code review - APPROVED
- [ ] SM: Completion and archive

## Session Log

**2026-01-13T20:15:00Z - SM Story Setup**

Story selected from Epic 34 backlog. Technical context prepared based on file analysis.

Key insights:
- cyclist-doctor --fix already handles most repair scenarios
- Main gap is documentation and artifact cleanup automation
- CLI relocation warning prevents confusion when user moves repo

**2026-01-13T20:20:00Z - SM Handoff to Dev**

Branch created: `feat/34-4-upgrade-path-handling`
Sprint YAML updated: status → in_progress

Handoff to Dev (Hari Seldon) for implementation.

Implementation targets:
1. packages/cyclist/README.md - Add "Upgrading Cyclist" section
2. justfile - Add cyclist-clean to cyclist-setup recipe
3. packages/cyclist/scripts/install-cli.sh - Add relocation warning
4. packages/cyclist/README.md - Add upgrade troubleshooting subsection

**2026-01-13T21:05:00Z - TEA Handoff to Dev**

Test commit: `f85fecea test(34-4): add failing tests for upgrade path handling`

Test results:
- Total tests written: 12
- Tests failing (RED): 12
- Tests passing: 0
- Status: Ready for Dev implementation

Test file: `/Users/michael.pursifull/work/pennyfarthing/packages/cyclist/tests/34-4-upgrade-path.test.ts`

Handoff note: All 12 tests are failing as expected. Tests cover:
- AC2: cyclist-setup must call cyclist-clean before pnpm install (3 tests)
- AC3: install-cli.sh must detect/warn about CLI relocation (6 tests)
- Documentation: README must have Upgrading section with cyclist-doctor reference (3 tests)

Dev should implement changes to pass all failing tests. Key files:
1. `justfile` (cyclist-setup recipe) - add cyclist-clean step
2. `packages/cyclist/scripts/install-cli.sh` - add existing CLI detection and warning
3. `packages/cyclist/README.md` - add Upgrading section

**2026-01-13T21:15:00Z - Dev Handoff to Reviewer**

Implementation commit: `9d7dd7dd feat(34-4): add upgrade path handling for Cyclist`

Test results:
- Total tests: 12
- Tests passing (GREEN): 12
- Tests failing: 0

PR: https://github.com/1898andCo/pennyfarthing/pull/226

Files changed:
- `justfile` - cyclist-setup now calls cyclist-clean first
- `packages/cyclist/scripts/install-cli.sh` - relocation warning logic added
- `packages/cyclist/README.md` - Upgrading Cyclist section added

Ready for Reviewer (The Merovingian).

**2026-01-13T21:25:00Z - Reviewer Assessment**

**Verdict:** APPROVE

PR #226 reviewed and approved. All acceptance criteria verified.

Code quality: Clean, minimal, well-tested
Security: No vulnerabilities
Test coverage: 12/12 tests passing

Ready for SM to complete: merge PR and archive story.
