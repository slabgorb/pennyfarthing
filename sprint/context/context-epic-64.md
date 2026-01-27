# Epic 64: Cyclist UX Polish

## Overview
Improve Cyclist terminal UX based on UX Overview PRD - fix bugs, polish existing features, and add missing visibility. Covers DIFFS panel, stats strip, sidebar sections, tab bar, and fresh start state management.

**Jira Key:** MSSCI-12465
**Priority:** P1
**Status:** Backlog
**PRD:** docs/prd/ux-overview.md

## Epic Points
- **Total:** 34 points
- **Completed:** 5 points
- **In Progress:** 2 points (MSSCI-12468)
- **Backlog:** 27 points

## Stories

### MVP Stories (4/6 completed)

**MSSCI-12466: DIFFS panel: Show file line numbers instead of diff-relative** (2 pts) - DONE
- Line numbers in diff viewer show position within the diff, not actual file line numbers
- Developer needs to know which line in the file to navigate to
- Branch: `feat/MSSCI-12466-diffs-panel-line-numbers`
- Completed: 2026-01-27

**MSSCI-12467: DIFFS panel: Fix file opener for $EDITOR** (1 pt) - DONE
- Clicking file path header in diff viewer should open the file in the user's configured editor
- Currently broken
- Branch: (trivial)
- Completed: 2026-01-27

**MSSCI-12468: DIFFS panel: Improve combined diff view** (2 pts) - IN PROGRESS
- Combined diff view needs better UX showing original → final state with proper context
- Acceptance Criteria:
  - Combined view shows clear original → final transition
  - Context lines displayed appropriately
- Branch: `feat/MSSCI-12468-diffs-combined-view`
- Workflow: TDD (phased)

**MSSCI-12469: Stats strip: Redesign layout with identity context** (3 pts) - BACKLOG
- Redesign stats strip to show: PWD → Jira email → GitHub username → spacer → Claude model → Context %
- Remove: context tokens, usage limits

**MSSCI-12470: Tab bar: Fix indicator sync on startup** (1 pt) - DONE
- On app startup, Message and Sidebar panels are open but their tab indicators don't show active state
- Must click twice to sync
- Completed: 2026-01-27

**MSSCI-12471: Fresh start: Audit and fix stale data on load** (3 pts) - BACKLOG
- On fresh load, many panels show stale data
- Audit all stateful components and ensure clean state on app start, Clear button, TirePump

### Growth Stories (2/4 completed)

**MSSCI-12472: Persona section: Remove OCEAN scores and helper updates** (1 pt) - BACKLOG
**MSSCI-12473: Persona section: Random catchphrase on activation** (2 pts) - BACKLOG
**MSSCI-12474: Persona section: Tighten layout** (1 pt) - DONE
- Reduce vertical sprawl in persona section for more compact display
- Completed: 2026-01-27

**MSSCI-12475: Story section: Expandable sprint/epic details** (5 pts) - BACKLOG
**MSSCI-12476: BikeLane section: Show workflow status when active** (3 pts) - DONE
- BikeLane section exists but is hidden. Make it visible when a workflow is active
- Shows workflow name and type badge, current step/phase, progress visualization
- Completed: 2026-01-27

**MSSCI-12477: Background tasks: Implement subagent visibility** (5 pts) - DONE
- Background tasks section exists but doesn't work
- Implement proper visibility for subagents and long-running tasks
- Completed: 2026-01-27

### Vision Stories

**MSSCI-12478: Theme schema: Consolidate quote → catchphrases** (3 pts) - BACKLOG
- Some themes have quote field, others have catchphrases array
- Consolidate all to use catchphrases array only

## Key Files
- DIFFS panel component: `packages/cyclist/src/public/js/panels/diffs.js`
- UX Overview PRD: `docs/prd/ux-overview.md`
- Cyclist main: `packages/cyclist/src/main.ts`
- Settings and state management: `packages/cyclist/src/api/settings.ts`

## Dependencies
- UX Overview PRD must be finalized before starting story work
- DIFFS panel refactor affects multiple dependent components

## Next Steps
1. Complete MSSCI-12468 (current story) - TDD workflow
2. Move to MSSCI-12469 (Stats strip redesign)
3. Complete remaining MVP stories before growth work
