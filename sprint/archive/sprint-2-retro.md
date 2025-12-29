# Sprint 2 Retrospective

**Date:** 2025-12-28 (Day 4 of 14)
**Sprint Goal:** Improve developer experience with automated workflows and proper permissions
**Velocity:** 28/34 points (82%) with 10 days remaining

## Sprint Summary

| Metric | Value |
|--------|-------|
| Stories Completed | 14 |
| Points Delivered | 28 |
| PRs Merged | 10 |
| Versions Released | 3.3.0 → 3.6.1 (4 minor, multiple patches) |
| Time Elapsed | 4 days |
| Time Remaining | 10 days |

### Epics Touched
- **Epic 2** (Sprint Operations Polish): 7/7 stories DONE
- **Epic 4** (Permissions Framework): 2/5 stories (4-1, 4-5)
- **Epic 5** (Theme Management CLI): 4/4 stories DONE
- **Epic 6** (Theme Wizard): 1/5 stories (started early)

---

## Liked (What Went Well)

### Sprint 1 Retro Action Items - All Completed
| Action | Status |
|--------|--------|
| Automate Jira sync in SM finish | Story 2-1 |
| Create sprint metrics script | Story 2-2 |
| Add --auto-pr flag | Story 2-3 |
| Prune stale sidecars | Story 2-4 (82% reduction) |

### Velocity Excellence
- 28 points in 4 days (7 pts/day)
- Sprint goal achievable with time to spare
- Started Sprint 3 work early (6-1)

### Massive Code Cleanup
- **Sidecar pruning:** 4,157 to 755 lines (82% reduction)
- **Subagent migration:** All 13 converted to YAML frontmatter
- Standardized sidecar structure across all 10 agents

### Theme System Maturation
- Full CLI for theme management (list, set, show, create)
- 7 new themes added (A-Team, Princess Bride, Ted Lasso, Parks & Rec, Superfriends, Legion of Doom, The Expanse)
- User customization via preferences.yaml

---

## Learned (New Discoveries)

### Reviewer Needed Hardening
- Reviewer was rubber-stamping code
- Fixed by making adversarial mindset explicit
- Lesson: Agent behavior drifts - must be reinforced

### statusLine Hook Complexity
- Agent cleanup timing matters (SessionStart, not Stop)
- Multiple legacy paths needed cleanup
- Lesson: Installation paths must be tested on fresh and upgrade scenarios

### Mid-Sprint Bug Discovery Pattern
- Story 4-5 (statusline bug) added mid-sprint
- Quick turnaround: discovered to fixed to merged same day
- Lesson: Reserve capacity for emergent work

### YAML Frontmatter Benefits
- Subagents now auto-discoverable by Claude Code
- Simpler invocation patterns
- Better tooling integration

---

## Lacked (What Was Missing)

### Version Churn
- 8+ version bumps in 4 days
- Many small patch releases
- **Root Cause:** Fixes discovered after release

### Incomplete Permissions Epic
- Only 2/5 stories from Epic 4 completed
- context_budget, hooks, agent-scopes still backlog
- **Reason:** Prioritized Epic 5 (user-visible features)

### Test Coverage for Hooks
- statusline bugs found manually, not by tests
- Hook behavior is hard to test in isolation

---

## Longed For (Wishlist)

### Release Bundling
- Group related fixes into fewer releases
- Consider release candidate process

### Hook Testing Framework
- Simulate Claude Code hook execution
- Verify paths and timing

### Theme Preview in Terminal
- Show character samples before switching
- Currently requires reading YAML

---

## Action Items for Sprint 3

| Action | Owner | Story |
|--------|-------|-------|
| Complete Epic 4 backlog (4-2, 4-3, 4-4) | Dev | Sprint 3 |
| Add hook testing utilities | DevOps | Future |
| Consider release bundling strategy | Orchestrator | Process |
| Finish Epic 6 theme wizard (6-2 through 6-5) | Dev | Sprint 3 |

---

## Sidecar Health

| Agent | Files | Status |
|-------|-------|--------|
| All 10 agents | 3 each | Standardized |

Structure: `patterns.md`, `gotchas.md`, `decisions.md`

---

## Key Artifacts Created

### New Features
- `pennyfarthing theme list/set/show/create` - Theme management CLI
- `pennyfarthing-dist/output-styles/` - User output customization
- `.claude/pennyfarthing/preferences.yaml` - User preferences
- `/theme-maker` - Interactive theme creation wizard (skeleton)

### Scripts
- `scripts/utils/sprint-metrics.sh` - Sprint progress dashboard

### Templates
- `pennyfarthing-dist/templates/sidecar/` - Lean starter sidecars

### Themes Added
- A-Team, Princess Bride, Ted Lasso, Parks & Rec
- Superfriends, Legion of Doom, The Expanse

---

*"Doors and corners. That's where they get you. Sprint 2 opened a lot of doors... but we checked every corner."* - The Investigator
