# Story 34-2: Cyclist Health Check Command

| Field | Value |
|-------|-------|
| Story | 34-2 |
| Title | Cyclist health check command |
| Points | 2 |
| Status | GREEN |
| Phase | approved |
| PR | #225 |
| Phase Started | 2026-01-13T18:43:41Z |
| Branch | feat/34-2-cyclist-health-check |
| Jira | MSSCI-11620 |

## Acceptance Criteria

- [x] just cyclist-doctor runs scripts/cyclist-doctor.sh
- [x] Checks system prereqs (Node >= 18, pnpm, Python 3, Xcode tools, just)
- [x] Checks build state (dist/server.js, dist/main.js exist)
- [x] Checks node-pty prebuild exists for current platform
- [x] Checks node-pty loadable (require succeeds)
- [x] Checks Electron version compatibility with node-pty
- [x] Checks workspace deps (@pennyfarthing/core, @pennyfarthing/shared symlinks valid)
- [x] Checks port 1898 availability (warns if in use)
- [x] Each failure shows specific fix command
- [x] Supports --fix flag to auto-run fix commands
- [x] Exit 0 if all pass, exit 1 if any fail
- [x] Output colorized (green=pass, red=fail, yellow=warn)

## TEA Assessment

**Tests Required:** Yes
**Reason:** New feature with multiple checkpoints and user-facing output

**Test Files:**
- `packages/cyclist/tests/34-2-cyclist-health-check.test.ts` - Health check script validation

**Tests Written:** 49 tests covering 12 ACs
**Status:** RED (failing - ready for Dev)

### Test Coverage Breakdown

| AC | Tests | Description |
|----|-------|-------------|
| Script basics | 4 | Exists, valid syntax, executable, strict mode |
| --help flag | 4 | Help function, -h and --help flags, usage docs |
| --fix flag | 3 | Fix flag support, FIX_MODE var, help docs |
| System prereqs | 9 | Node, pnpm, Python3, Xcode, just + fix commands |
| Build state | 3 | dist/server.js, dist/main.js, fix command |
| node-pty | 4 | Prebuild check, platform detection, loadable, fix |
| Electron compat | 2 | Version check, compatibility verification |
| Workspace deps | 4 | Core symlink, shared symlink, validity, fix |
| Port 1898 | 3 | Port check, lsof/netstat, warn not fail |
| Output format | 7 | Colors (green/red/yellow), log functions |
| Exit codes | 4 | Failure count, exit 0/1, summary |
| Justfile | 2 | cyclist-doctor recipe, runs doctor.sh |

**Handoff:** To Dev (Ponder Stibbons) for implementation

## Dev Assessment

**Implementation Summary:**
Created `packages/cyclist/scripts/cyclist-doctor.sh` - a comprehensive health check script for Cyclist setup validation.

**Design Decisions:**
1. **Bash script** (not Node.js) - avoids chicken-and-egg if Node setup is broken
2. **Namespaced as `cyclist-doctor.sh`** - avoids confusion with Pennyfarthing's own doctor command
3. **`|| true` on arithmetic** - prevents `set -e` from failing when incrementing counters from 0
4. **Port 1898 is a warning, not a failure** - Cyclist auto-selects next port anyway

**Files Changed:**
- `packages/cyclist/scripts/cyclist-doctor.sh` - new (429 lines)
- `packages/cyclist/tests/34-2-cyclist-health-check.test.ts` - updated to use cyclist-doctor.sh
- `justfile` - added cyclist-doctor recipe with `*args` passthrough

**Test Results:**
- 49/49 tests passing (GREEN)
- Script verified working: `just cyclist-doctor` shows all 14 checks pass
- `--help` flag documented and working

**Known Limitations:**
- `--fix` mode requires brew on macOS (standard assumption for dev machines)
- Electron ABI compatibility check is heuristic (checks for build/ directory)

**Confidence:** High - comprehensive test coverage, verified on local machine

**Handoff:** To Reviewer (Granny Weatherwax) for code review

---

## Workflow Tracking

**Phase:** approved
**Phase Started:** 2026-01-13T18:43:41Z

### Phase History

| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| tea | 2026-01-13T17:30:00Z | 2026-01-13T18:26:21Z | 56m 21s |
| dev | 2026-01-13T18:26:21Z | 2026-01-13T18:43:41Z | 17m 20s |
| approved | 2026-01-13T18:43:41Z | - | - |

### Workflow Checklist

- [x] SM: Story setup, branch created
- [x] TEA: Tests written (RED state) - 49 tests all failing
- [x] Dev: Implementation (make tests GREEN) - PR #225
- [x] Reviewer: Code review - APPROVED
- [ ] SM: Completion and archive

## Session Log

**2026-01-13T18:26:21Z - TEA Handoff to Dev**

Test commit: `61db7b54 test(34-2): add failing tests for cyclist health check command`

Test results:
- Total tests written: 49
- Tests failing (RED): 49
- Tests passing: 0
- Status: Ready for Dev implementation

Test file: `/Users/michael.pursifull/work/pennyfarthing/packages/cyclist/tests/34-2-cyclist-health-check.test.ts`

Handoff note: All 49 tests are failing as expected. Tests cover all 12 acceptance criteria with comprehensive checks for:
- Script existence and syntax validation
- Help and fix flag support
- System prerequisites (Node, pnpm, Python3, Xcode, just)
- Build state (dist/server.js, dist/main.js)
- Native module checks (node-pty prebuild and loadability)
- Electron compatibility
- Workspace dependencies
- Port 1898 availability
- Output formatting and colors
- Exit code behavior
- Justfile recipe

Dev should implement `scripts/doctor.sh` to pass all failing tests.

**2026-01-13T18:40:00Z - Dev Handoff to Reviewer**

Implementation commit: `7823b56b feat(34-2): add cyclist-doctor health check command`

Test results:
- Total tests: 49
- Tests passing (GREEN): 49
- Tests failing: 0

PR: https://github.com/1898andCo/pennyfarthing/pull/225

Files changed:
- `packages/cyclist/scripts/cyclist-doctor.sh` (new, 429 lines)
- `packages/cyclist/tests/34-2-cyclist-health-check.test.ts` (updated for cyclist-doctor.sh naming)
- `justfile` (added cyclist-doctor recipe)
- `sprint/current-sprint.yaml` (refined ACs)

Ready for Reviewer (Granny Weatherwax).

**2026-01-13T18:45:00Z - Reviewer Assessment**

**Verdict:** APPROVE

**Code Quality:**
- Proper strict mode (`set -euo pipefail`) with `|| true` fix for arithmetic
- Clean structure with logging, check, and main functions
- Defensive coding - all external commands checked before use
- Correct exit semantics (port check is warning, not failure)
- Proper namespacing (`cyclist-doctor.sh`)

**Security:** No vulnerabilities found. All variables quoted, no command injection, no dangerous operations.

**Minor Observations (Non-blocking):**
- `--fix` assumes Homebrew (reasonable for macOS dev machines)
- node-pty loadability uses Node not Electron (prebuilds work with both)
- Electron ABI check is heuristic (documented limitation)

**Test Coverage:** 49 tests covering all ACs - comprehensive

**Ready for merge to develop.**

**2026-01-13T18:43:41Z - Reviewer Handoff to SM (Complete)**

Reviewer (Granny Weatherwax) assessment complete. PR #225 APPROVED.

All acceptance criteria verified. No critical or major issues identified.

Ready for SM to complete story: archive branch and update sprint tracking.
