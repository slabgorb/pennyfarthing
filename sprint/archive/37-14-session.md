# Story 37-14: Bug - Handoff buttons show hardcoded theme characters - Session

## Story Info

| Field | Value |
|-------|-------|
| **Story ID** | 37-14 |
| **Title** | Bug: Handoff buttons show hardcoded theme characters |
| **Epic** | 37 - Technical Debt & Bug Fixes |
| **Points** | 2 |
| **Status** | in_progress |
| **Repos** | cyclist |
| **Branch** | fix/37-14-handoff-theme-fix |
| **Workflow** | trivial |

## Current Phase

**TRIVIAL** - SM hands off to Dev

## Problem Description

Quick action handoff buttons in Cyclist show character names from a hardcoded theme instead of the currently active theme.

Root cause: `getAgentDisplayName()` in quick-actions.js calls `getThemeAgents()` which returns null when the theme cache hasn't been populated.

## Files to Investigate

- packages/cyclist/src/public/js/components/message-view/quick-actions.js
- packages/cyclist/src/public/js/story.js (themeAgentsCache)

## Acceptance Criteria

- [ ] Handoff buttons show character names from current theme
- [ ] Buttons update when theme is switched
- [ ] No hardcoded theme references in production code
- [ ] Works on initial load (theme cache populated before needed)

## Workflow

```
Current: SM → Dev (trivial workflow)
```

---

## Workflow Tracking

**Workflow:** trivial
**Phase:** setup
**Phase Started:** 2026-01-15T00:00:00Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-01-15T00:00:00Z | - | - |

## Session Log

### 2026-01-15 - SM Setup

Setting up story for Dev to implement fix.
