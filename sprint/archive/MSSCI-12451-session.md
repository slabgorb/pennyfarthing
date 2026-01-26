# Story Session: MSSCI-12451 BikeLane Workflow Sidebar Section

**Story:** BikeLane workflow visualization sidebar section
**Points:** 5
**Workflow:** TDD
**Branch:** `feat/MSSCI-12451-bikelane-sidebar-section`
**Started:** 2026-01-26

## Story Description

Create a new collapsible sidebar section for BikeLane workflow visualization in Cyclist.

### Acceptance Criteria

1. New collapsible section between Story and Git sections
2. Collapsed view shows: workflow type badge + phase summary
3. Expanded view shows:
   - Workflow metadata (type, description)
   - Phase progress visualization (icons + arrows)
   - Phase history timeline with status/durations
4. Hidden when no workflow active
5. Collapse state persists via existing system

### UX Design Spec (from Alex Kamal)

**Collapsed View:**
```
BIKELANE   [TDD]   SM → TEA → Dev → Rev    ▼
```

**Expanded View:**
```
BIKELANE   [TDD]                           ▲
Type: Phased
Cycle: Test-Driven Development

  ✓  ──→  ✓  ──→  ●  ──→  ○
 SM     TEA    Dev    Rev
SETUP   RED   GREEN  REVIEW

PHASE HISTORY
✓ SETUP    SM     2m 14s
✓ RED      TEA    8m 32s
→ GREEN    Dev    in progress
○ REVIEW   Rev    pending
```

**Color Coding:**
- Done: green (`--status-ready`)
- Current: accent blue with pulse animation
- Pending: gray, muted opacity

### Technical Context

**Key Files:**
- `packages/cyclist/src/public/index.html` - Add section HTML
- `packages/cyclist/src/public/styles.css` - Add BikeLane styles
- `packages/cyclist/src/public/js/bikelane-section.js` - New component (create)
- `packages/cyclist/src/public/js/story.js` - Extract workflow data
- `packages/cyclist/src/public/js/collapsed-sections.js` - Register section

**Data Sources:**
- `StoryInfo.workflow` from `story-parser.ts` - WorkflowPhase[] with status
- Phase History table from session files
- Workflow YAML files for type/description

### Phase History

| Phase | Agent | Status | Notes |
|-------|-------|--------|-------|
| RED | TEA | complete | 67 failing tests written |
| GREEN | Dev | complete | 78 tests passing, merged via 29f820e25 |
| REVIEW | Reviewer | complete | APPROVED - merged to develop |
