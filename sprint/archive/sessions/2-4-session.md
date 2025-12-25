## Story 2-4: Prune Stale Sidecar Entries
**Epic:** 2 (Sprint Operations Polish)
**Points:** 1 | **Priority:** P2
**Repos:** pennyfarthing
**Branch:** feat/2-4-prune-stale-sidecars
**Jira:** MSSCI-11146
**Started:** 2024-12-24
**Phase:** approved
**Status:** ready

## Acceptance Criteria
- [x] Each sidecar has 5-15 relevant entries per file
- [x] Outdated entries archived to sprint/archive/sidecar-archive/
- [x] All remaining entries verified as current

## Workflow
- [x] SM: Story setup
- [x] Dev: Implement pruning
- [x] Reviewer: Code review
- [ ] SM: Finish story

## Technical Context
See: .session/story-2-4-context.md

## Notes
- 1-point trivial story, routes directly to Dev (skip TEA)
- pm-sidecar is largest target (~1131 lines)
- Archive, don't delete - keep reversible

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `.claude/project/agents/*-sidecar/*.md` - Pruned to 5-15 entries, project-specific only
- `sprint/archive/sidecar-archive/` - Archived original content (27 files)

**Summary:**
- Before: 4,157 lines across 26 files
- After: 755 lines across 27 files (82% reduction)
- Restructured orchestrator-sidecar to standard 3-file format
- Replaced PM research docs with lean project patterns

**Tests:** N/A (documentation change)
**PR:** #11 - chore(2-4): Prune stale sidecar entries
**Branch:** feat/2-4-prune-stale-sidecars (pushed)

**Handoff:** To Reviewer for code review

## Reviewer Assessment

**PR:** #11
**Verdict:** APPROVED

**Quality:** Content reduction well-executed (82% reduction)
**Structure:** All sidecars standardized to patterns/gotchas/decisions format
**Preservation:** Original content archived intact
**Content:** Retained content is genuinely project-specific

**Handoff:** To SM for finish-story workflow
