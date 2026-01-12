# Sprint 9 Retrospective

**Date:** 2026-01-12
**Sprint Goal:** Wire up orphaned code and add multimodal image support
**Velocity:** 22 pts planned / **38 pts completed** (173%)
**Release:** v6.2.0

---

## Liked

- **Image paste shipped cleanly** - Epic 28 delivered all 3 stories (28-1, 28-5, 28-6) without rework. The infrastructure-first approach (28-1 base, 28-5 validation, 28-6 multi-image) paid off.

- **Fast pivots on dead ends** - Epic 29 (Wire Up Orphaned Code) was killed quickly when we discovered Claude Code's tool execution is internal. No time wasted building impossible features.

- **TDD workflow scaling** - Trivial stories (1-2 pts) correctly skipped TEA phase, going SM → Dev directly. Saved cycles without sacrificing quality.

- **Review quality** - The Merovingian's code review on 28-6 traced actual data flows and verified closure patterns. Not rubber-stamp.

- **Release cadence** - Sprint closed with a proper versioned release (v6.2.0) including changelog. Professional.

---

## Learned

- **Claude Code architecture limits** - Tool execution happens internally before stream reaches Cyclist. Can't intercept or modify. This killed Epic 29 but taught us the boundary.

- **Full re-render > surgical updates** - For small DOM collections (image thumbnails), wiping and rebuilding is cleaner than index tracking. Garbage collection handles listener cleanup.

- **Closure capture in forEach** - Each forEach iteration creates a new scope, so `() => handleRemoveClick(index)` safely captures the correct index. Confirmed in review.

- **Confidence scoring matters** - Epic 25's detection patterns needed confidence levels. High-confidence patterns get immediate action, low-confidence get suggestions.

---

## Lacked

- **ESLint configuration** - Multiple stories noted "lint: SKIP (pre-existing repo config issue)". The eslint.config.js is missing. Tech debt.

- **Jira CLI reliability** - Several finish workflows reported "Jira sync returned non-zero exit code". Manual Jira updates still needed.

- **Epic 29 feasibility research** - We committed 8 points to impossible work. Should have done architecture spike first.

---

## Longed For

- **Architecture Decision Records (ADRs)** - When we kill work like Epic 29, the reasoning should be captured formally for future reference.

- **Lint in CI** - Pre-commit hook for linting would catch issues earlier than review phase.

- **Jira auto-sync** - When PR merges, Jira should auto-transition without manual intervention or flaky CLI.

---

## Action Items

| Action | Owner | Due |
|--------|-------|-----|
| Create ADR for Epic 29 architectural limitation | SM | Sprint 10 |
| Fix eslint.config.js in pennyfarthing repo | Dev | Sprint 10 |
| Investigate gh-jira integration reliability | DevOps | Sprint 10 |

---

## Metrics

| Metric | Value |
|--------|-------|
| Stories completed | 28 |
| Stories wontfix | 10 |
| Points delivered | 38 |
| Points wontfix | 13 |
| Velocity target | 22 pts |
| Delivery rate | **173%** |
| Bugs fixed | 6 |
| Epics closed | 5 (8, 9, 25, 28, 29) |

---

## Sidecar Health

| Agent | Entries | Status |
|-------|---------|--------|
| dev | 12 | Good |
| tea | 8 | Good |
| sm | 14 | Good |
| reviewer | 7 | Good |
| architect | 9 | Good |

All sidecars in healthy range (5-15 entries).

---

## Session Cleanup

Artifacts removed:
- test-9-2-tea-red.log
- test-bugfix-usage-limits-verify.log
- tea-25-6-red-verification.md
- tea-9-2-red-check-report.md
- test-report-25-3.md
- preflight-9-1-reviewer.md
- work-research-report.md
- sprint-9-grooming-report.md (moved to archive)

Retained:
- context-epic-23.md (may reference)
- context-epic-9.md (may reference)
- reconciliation.log (git hook tracking)
- session-log.txt (active log)
