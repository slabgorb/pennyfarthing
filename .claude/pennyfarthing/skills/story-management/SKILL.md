---
name: story-management
description: Story creation, sizing, and sprint management patterns for Conductor. Use when creating stories, estimating work, or managing the sprint workflow.
---

# Story Management Skill - Conductor Project

## Overview

This skill covers story creation, sizing, and management patterns for the Conductor project sprint workflow.

## Story Sizing Guidelines

### 1-2 Points (Trivial)

- Single file change
- Config update
- Simple bug fix
- No new tests needed
- **Skip TEA, go directly to Dev**
- **Example:** Fix typo, update env variable

### 3 Points (Small)

- Few files changed
- Single component/handler
- Straightforward implementation
- Some tests needed
- **Example:** Add validation, fix authorization bug

### 5 Points (Medium)

- Multiple files across layers
- New feature component
- API + UI changes
- Comprehensive tests
- **Example:** New admin page, new API endpoint

### 8 Points (Large)

- Significant feature
- Multiple components
- Database changes
- Cross-repo coordination
- **Example:** New integration, major refactor

### 13+ Points (Epic-level)

- **SPLIT THIS STORY**
- Too complex for single story
- Multiple unknowns
- Break into 3-5 smaller stories

## Story Templates

### Bug Fix Story

```yaml
35-N-short-description:
  status: backlog
  points: 2-3
  repos: api|ui|both
  priority: P0-P2
  description: "[Symptom] - [Root cause if known]"
  error_details:
    symptom: "What user sees"
    error: "Error message"
    affected: "Pages/endpoints affected"
  ac:
    - "Bug no longer occurs"
    - "Regression test added"
    - "Related code audited for same issue"
```

### Feature Story

```yaml
35-N-short-description:
  status: backlog
  points: 5-8
  repos: api|ui|both
  priority: P1-P2
  description: "User can [action] to [benefit]"
  ac:
    - "Feature works as specified"
    - "UI matches design"
    - "API documented"
    - "Tests cover happy path and edge cases"
    - "Error handling implemented"
```

### Refactor Story

```yaml
35-N-short-description:
  status: backlog
  points: 3-5
  repos: api|ui
  priority: P2
  description: "Refactor [component] to [improvement]"
  ac:
    - "All existing tests pass"
    - "No behavior changes"
    - "Code follows new pattern"
    - "Documentation updated"
```

## Acceptance Criteria Patterns

### Good AC (SMART)

- "Admin users can access /admin/settings without 403"
- "API returns 204 No Content on successful DELETE"
- "Selected client persists in URL query param"
- "Tests cover admin, manager, analyst roles"

### Bad AC (Vague)

- "Feature works correctly"
- "No bugs"
- "Good performance"
- "User-friendly"

## Priority Guidelines

| Priority | Meaning | SLA |
|----------|---------|-----|
| P0 | Production blocker | Same day |
| P1 | High impact bug/feature | This sprint |
| P2 | Normal priority | Next sprint OK |
| P3 | Nice to have | Backlog |

## Cross-Repo Patterns

### API-First Pattern

1. **Story A (API):** Implement backend endpoint
2. **Story B (UI):** Implement frontend consuming endpoint

### Full-Stack Pattern

1. Single story with `repos: both`
2. AC covers both API and UI
3. TEA writes tests for both

## Scale-Adaptive Workflow

Based on story complexity, determine workflow depth:

| Points | Scale | Workflow | Handoff |
|--------|-------|----------|---------|
| 1-2 | Trivial | Skip TEA for chores | SM -> Dev directly |
| 3-5 | Standard | Full TDD flow | SM -> TEA -> Dev |
| 8+ | Complex | Add Architect review | SM -> Architect -> TEA -> Dev |

## Sprint File Locations

| File | Purpose |
|------|---------|
| `sprint/current-sprint.yaml` | Active stories only |
| `sprint/backlog.yaml` | Future epics/stories |
| `sprint/completed.yaml` | Done work archive |
| `sprint/archive/story-X-Y-*.md` | Detailed session archives |
| `sprint/context/story-X-Y-summary.md` | Quick context summaries |

## Story Key Format

- **Conductor:** `epic-N`, `N-M` stories (e.g., `epic-35`, `35-4`)
- **Siemulator:** `sim-epic-N`, `sim-N-M` stories (e.g., `sim-epic-10`, `sim-10-1`)

## Lessons Learned

### Authorization Stories

- Always audit related endpoints for same issue
- Add tests for admin, manager, analyst roles
- Use centralized utility pattern

### UI Stories

- Check for client selector needs (multi-client users)
- Verify route configuration
- Add E2E test for navigation

### Integration Stories

- Plan for mock infrastructure
- Consider retry/timeout handling
- Document external dependencies

## Workflow Commands

| Command | Purpose |
|---------|---------|
| `/new-work` | Start a new story (SM -> TEA -> Dev) |
| `/start-epic` | Generate epic technical context |

**Note:** Session completion is handled via `/sm` (finish-story task). Agents auto-detect active work on activation.

## Jira Integration

```bash
# Claim a story before starting
./scripts/jira-claim-story.sh 35-4-checklist-configuration-ui --claim

# Sync sprint to Jira
./scripts/sync-epic-to-jira.sh 35 --with-comments
```
