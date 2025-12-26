# Story 2-2: Create Sprint Metrics Script - Work Session

**Started:** 2025-12-26
**Status:** approved
**Phase:** approved
**Points:** 2 (Trivial - skip TEA)
**Next Agent:** SM
**Epic:** 2 - Sprint Operations Polish
**Jira:** https://1898andco.atlassian.net/browse/MSSCI-11144
**Branch:** feat/2-2-sprint-metrics-script
**Repos:** pennyfarthing

---

## Story Overview

Create a sprint metrics script that calculates and displays sprint statistics:
- Points burned vs remaining
- Story completion rates
- Days remaining in sprint
- Percentage complete

---

## Technical Context

### Reference Implementation
- `scripts/utils/check-status.sh` (250 lines) - Similar utility pattern with colored output
- `scripts/run.sh` (54 lines) - Bootstrap for calling scripts from any directory

### Data Source
- `sprint/current-sprint.yaml` - Contains all sprint data
  - Lines 4-8: Sprint metadata (number, dates, goal)
  - Lines 436-442: Summary statistics
  - Story status fields throughout

### Approach
1. Create `scripts/utils/sprint-metrics.sh` (~80 lines)
2. Parse YAML using grep/awk (portable, no yq dependency)
3. Calculate metrics from status fields
4. Output colored summary suitable for reports

---

## Acceptance Criteria

- [x] `scripts/utils/sprint-metrics.sh` displays current sprint stats
- [x] Shows points completed/remaining/percentage
- [x] Readable output suitable for status reports

---

## Files to Create

| File | Action | Notes |
|------|--------|-------|
| `scripts/utils/sprint-metrics.sh` | CREATE | ~80 lines, zsh script |

---

## Routing

**2 pts = Trivial → Dev directly (skip TEA)**

---

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `pennyfarthing-dist/scripts/utils/sprint-metrics.sh` - New 242-line zsh script for sprint metrics
- `sprint/current-sprint.yaml` - Fixed end_date typo (2025→2026)

**Tests:** N/A (trivial chore, no TEA phase)
**PR:** #13 - feat(2-2): add sprint metrics script
**Branch:** feat/2-2-sprint-metrics-script (pushed)

**Features Implemented:**
- Human-readable output with colored sections and progress bars
- JSON output mode (`--json`) for automation
- Help text (`--help`)
- Points tracking (completed/in-progress/backlog)
- Story counts by status
- Timeline tracking (days elapsed/remaining)
- Velocity tracking vs expected

**Handoff:** To Reviewer for code review

---

## Reviewer Handoff

**Repository:** pennyfarthing
**Branch:** feat/2-2-sprint-metrics-script
**PR:** https://github.com/keithavery/pennyfarthing/pull/13

**Key Files Changed:**
- `pennyfarthing-dist/scripts/utils/sprint-metrics.sh` - New 242-line zsh script with human-readable and JSON output modes
- `sprint/current-sprint.yaml` - Fixed end_date typo (2025→2026)

**What Changed:**
- Created sprint metrics script displaying points burned/remaining, story completion rates, days elapsed/remaining, and percentage complete
- Added `--json` flag for automation and machine parsing
- Added `--help` for usage documentation
- Fixed typo in current sprint end date

**Ready for:**
- Code review and quality checks
- Verification of output accuracy

---

## Reviewer Assessment

**PR:** #13
**Verdict:** APPROVED ✅

**Quality:** Clean, well-structured script following project patterns
**Security:** No vulnerabilities - reads from known file, no user input injection risk
**Edge Cases:** Division by zero, missing files, negative values all handled
**Performance:** Acceptable for utility script usage pattern

**Minor Observations (non-blocking):**
- MAGENTA color defined but unused
- Regex `in.progress` uses wildcard dot (works but imprecise)

**Handoff:** To SM for finish-story workflow

---

## Workflow Checkpoints

- [x] SM Story Setup
- [x] Dev Implementation
- [x] Reviewer Approval

## Handoff Log

| Time | From | To | Notes |
|------|------|-----|-------|
| 2025-12-26 | SM | Dev | Story setup complete, ready for implementation |
| 2025-12-26 | Dev | Reviewer | Implementation complete, PR #13 ready for review |
| 2025-12-26 | Reviewer | SM | APPROVED - ready for finish-story workflow |
| 2025-12-26 | Reviewer Handoff Complete | SM Finish | PR approved, routing to SM for story completion |
