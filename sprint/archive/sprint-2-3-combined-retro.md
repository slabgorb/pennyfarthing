# Sprint 2 & 3 Combined Retrospective

**Date:** 2025-12-31
**Period:** Dec 23 - Dec 31, 2025 (8 days)
**Facilitator:** The Investigator (Orchestrator)

---

## Executive Summary

Two sprints completed in 8 days with 56 story points delivered (37 + 19). Version jumped from 3.3.0 to 4.0.5, including a major architectural change to symlink-based installation. High velocity but significant version churn indicates a "ship fast, fix fast" pattern that needs examination.

---

## Sprint 2: Sprint Operations Polish

**Goal:** Improve developer experience with automated workflows and proper permissions
**Duration:** Dec 23-28, 2025 (5 days)
**Planned:** 34 points | **Delivered:** 37 points (109%)

### Stories Completed (17 total)

| Epic | Stories | Points | Status |
|------|---------|--------|--------|
| Epic 2 (Sprint Ops Polish) | 7 | 16 | ✅ Complete |
| Epic 4 (Permissions Framework) | 6 | 13 | ✅ Complete |
| Epic 5 (Theme Management CLI) | 4 | 8 | ✅ Complete |

### Key Deliverables
- **Jira Sync Automation** - SM finish workflow auto-transitions Jira
- **Sprint Metrics Script** - `sprint-metrics.sh` dashboard
- **Theme CLI** - `pennyfarthing theme list/set/show/create`
- **Sidecar Pruning** - 82% reduction (4,157 → 755 lines)
- **Subagent Migration** - All 13 converted to YAML frontmatter
- **Statusline Bug Fix** - Story 4-5 added and fixed mid-sprint
- **Scripts Isolation** - Moved from `/scripts` to `.claude/pennyfarthing/scripts/`

### Versions Released
3.3.0 → 3.4.0 → 3.5.0 → 3.5.3 → 3.6.0 → 3.6.1

---

## Sprint 3: Interactive Theme Creation

**Goal:** Interactive theme creation and remaining permissions framework
**Duration:** Dec 28-31, 2025 (4 days)
**Planned:** 19 points | **Delivered:** 19 points (100%)

### Stories Completed (8 total)

| Epic | Stories | Points | Status |
|------|---------|--------|--------|
| Epic 6 (Theme Wizard) | 5 | 13 | ✅ Complete |
| Epic 4-continued (Carried) | 3 | 6 | ✅ Complete |

### Key Deliverables
- **/theme-maker Command** - Full interactive wizard
- **AI-Driven Mode** - Generate themes from concepts
- **Guided Mode** - Pick from AI suggestions
- **Manual Mode** - Specify all details directly
- **Version Tracking** - Warns when custom themes may be stale
- **Context Budget Config** - Configurable warning/critical thresholds
- **Hooks Documentation** - HOOKS.md guide
- **Agent Scopes** - Permission definitions per agent type

### Versions Released
3.7.0 → 3.7.1 → 3.8.0 → 4.0.0 → 4.0.1 → 4.0.2 → 4.0.3 → 4.0.5

---

## Combined Metrics

| Metric | Sprint 2 | Sprint 3 | Total |
|--------|----------|----------|-------|
| Points Delivered | 37 | 19 | 56 |
| Stories Completed | 17 | 8 | 25 |
| Commits | 122 | 69 | 191 |
| Commits/Day | 24.4 | 17.3 | 23.9 |
| Versions Released | 6 | 8 | 14 |

### Commit Breakdown (191 total)
- **feat:** 40 (21%) - Feature implementations
- **fix:** 44 (23%) - Bug fixes
- **chore:** 75 (39%) - Version bumps, archiving, admin
- **docs/refactor/test:** 28 (15%) - Documentation, cleanup
- **other:** 4 (2%)

### Fix-to-Feature Ratio: 1.1:1
*Each feature required approximately one fix. This is higher than ideal (target: 0.3:1)*

---

## Liked (What Went Well)

### 1. Sprint 1 Action Items - All Completed ✅
| Sprint 1 Ask | Sprint 2 Delivery |
|--------------|-------------------|
| Automate Jira sync | Story 2-1 |
| Sprint metrics script | Story 2-2 |
| --auto-pr flag | Story 2-3 |
| Prune stale sidecars | Story 2-4 (82% reduction) |

### 2. Velocity Excellence
- 56 points in 8 days = **7.0 points/day**
- Exceeds 20pt velocity target by 180%
- Started Sprint 3 work early while finishing Sprint 2

### 3. Theme System Maturation
- Full CLI management
- Interactive wizard with 3 creation modes
- Version tracking for custom themes
- 7 new themes shipped

### 4. Major Architecture Improvement
- v4.0.0: Symlink-based installation
- Cleaner separation between Pennyfarthing and project files
- `/scripts` freed for end-user project use

### 5. Cross-Epic Coordination
- Work from Epic 4 carried into Sprint 3 cleanly
- Tracked with `carried_from: sprint-2` markers
- No lost context during transition

---

## Learned (Discoveries)

### 1. The "Statusline Saga" Pattern
The statusline.sh script accumulated 29 commits with 52% being bug fixes. This taught us:
- **Symptoms:** Flip-flopping fixes, each contradicting the previous
- **Root cause:** Shared state (current-agent file) between sessions
- **Fix:** BUG-1 eliminated shared state entirely
- **Lesson:** Shared mutable state is a bug waiting to happen

### 2. Version Churn Indicates Integration Gaps
36 version bump commits in 8 days reveals:
- Fixes discovered after release, not before
- No staging/RC process catches issues late
- Each fix → release → discover next issue cycle

### 3. Symlink Architecture Benefits
v4.0.0's move to symlinks:
- Smaller git footprint in target projects
- Easier updates (npm handles it)
- Clear ownership: `.claude/pennyfarthing/` = Pennyfarthing, rest = user

### 4. Mid-Sprint Bug Discovery is Normal
Story 4-5 (statusline bug) was added mid-sprint and completed same day.
Lesson: Reserve 15-20% capacity for emergent work.

### 5. Agent Behavior Drift
Reviewer was rubber-stamping code until explicitly hardened.
Lesson: Agent behaviors must be reinforced, not assumed.

---

## Lacked (What Was Missing)

### 1. Pre-Release Testing
- 44 fix commits = 23% of work was reactive
- Statusline bugs found manually, not by automation
- No hook execution simulation in tests

### 2. Release Bundling Strategy
- 14 releases in 8 days (1.75/day)
- Many were single-fix patches
- User fatigue from frequent updates

### 3. Breaking Change Communication
- v4.0.0 was a breaking change (symlinks)
- Migration path documented but upgrade experience could be smoother

### 4. Cross-Session Testing
- BUG-1 (session isolation) wasn't caught until post-Sprint 3
- No automated test for multi-session scenarios

---

## Longed For (Wishlist)

### 1. Hook Testing Framework
```
Simulate Claude Code hook execution
Verify paths, timing, and outputs
Catch statusline-type bugs before release
```

### 2. Release Candidate Process
```
Develop → RC1 → Soak → Release
Bundle related fixes
Reduce version churn
```

### 3. Multi-Session Integration Tests
```
Spawn two simulated sessions
Verify isolation
Catch shared-state bugs automatically
```

### 4. Theme Preview in Terminal
```
Show character samples before switching
Currently requires reading YAML files
```

---

## Action Items for Sprint 4+

| Action | Priority | Owner | Notes |
|--------|----------|-------|-------|
| Add multi-session integration test | P1 | DevOps | Prevent BUG-1 regression |
| Define release bundling policy | P2 | Orchestrator | Reduce version churn |
| Create hook testing utilities | P2 | DevOps | Simulate hook execution |
| Add theme preview to CLI | P3 | Dev | `pennyfarthing theme preview <name>` |
| Document v4.0 upgrade path | P2 | Tech-Writer | For existing users |

---

## Patterns to Preserve

### ✅ DO
- Break large stories (1-4 → 1-4a/b/c/d pattern)
- Start next sprint's P1 work early when ahead
- Track carried stories with `carried_from` marker
- Prune sidecars quarterly (82% reduction was valuable)
- Mid-sprint bug fixes get their own story

### ❌ DON'T
- Use shared mutable state between sessions
- Release single-fix patches (bundle them)
- Assume agent behaviors persist (reinforce explicitly)
- Skip pre-release testing for "small" changes

---

## Sidecar Updates Made

Updated Orchestrator sidecar with Sprint 2/3 learnings:
- **patterns.md:** Added "Release Bundling", "Agent Behavior Drift Detection"
- **gotchas.md:** Added "Legacy Path Pollution"
- **decisions.md:** Added "Carryover Backlog Items", "Early Epic Start When Ahead"

---

## Key Numbers

```
Sprint Period:     8 days (Dec 23-31)
Story Points:      56 delivered (37 + 19)
Stories:           25 completed
Commits:           191 total
Versions:          14 releases (3.3.0 → 4.0.5)
Fix Ratio:         1.1:1 (44 fixes / 40 features)
Velocity:          7.0 pts/day (vs 2.9 target)
```

---

## Sprint Health Indicators

| Indicator | Sprint 2 | Sprint 3 | Target | Status |
|-----------|----------|----------|--------|--------|
| Velocity | 37 pts | 19 pts | 20 pts | 🟢 Exceeds |
| Completion | 100% | 100% | 90% | 🟢 Excellent |
| Fix Ratio | 23% | 23% | <15% | 🟡 Needs work |
| Version Churn | 6 | 8 | <3 | 🔴 High |
| Carryover | 6 pts | 0 pts | <5 pts | 🟢 Good |

---

## Quote

*"Doors and corners, kid. That's where they get you. We opened a lot of doors in these sprints—37 stories worth. But the corners? That's where the statusline saga lived. Took 29 commits to find it. The case isn't closed until you check every corner."*

— The Investigator

---

*Retrospective completed: 2025-12-31*
*Next retrospective: End of Sprint 4*
