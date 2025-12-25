# Story 2-4: Prune Stale Sidecar Entries - Technical Context

## Story Overview
- **Epic:** 2 (Sprint Operations Polish)
- **Points:** 1 (trivial)
- **Priority:** P2
- **Repos:** pennyfarthing
- **Jira:** MSSCI-11146

## Current State

10 agent sidecars with ~4,157 total lines:

| Sidecar | Lines | Files | Notes |
|---------|-------|-------|-------|
| pm-sidecar | 1,131 | 5 | **Largest - prime target** |
| devops-sidecar | 459 | 3 | |
| ux-designer-sidecar | 442 | 3 | |
| architect-sidecar | 412 | 3 | |
| reviewer-sidecar | 385 | 3 | |
| sm-sidecar | 372 | 3 | |
| tea-sidecar | 368 | 3 | |
| dev-sidecar | 361 | 3 | |
| orchestrator-sidecar | 227 | 1 | |

**Target:** 5-15 entries per file (~50-150 lines per file)

## Technical Approach

1. **Review each sidecar directory** in `.claude/project/agents/*-sidecar/`
2. For each file:
   - Identify outdated/redundant entries
   - Keep most valuable 5-15 entries
   - Move pruned entries to `sprint/archive/sidecar-archive/{agent}/`
3. **Prioritize keeping:**
   - Recent entries (last 2 sprints)
   - Entries referenced in current workflows
   - Unique insights not documented elsewhere

## Files to Modify

### Primary (sidecars to prune)
- `.claude/project/agents/pm-sidecar/*.md` (priority - largest)
- `.claude/project/agents/devops-sidecar/*.md`
- `.claude/project/agents/ux-designer-sidecar/*.md`
- `.claude/project/agents/architect-sidecar/*.md`
- `.claude/project/agents/reviewer-sidecar/*.md`
- `.claude/project/agents/sm-sidecar/*.md`
- `.claude/project/agents/tea-sidecar/*.md`
- `.claude/project/agents/dev-sidecar/*.md`
- `.claude/project/agents/orchestrator-sidecar/*.md`

### Create
- `sprint/archive/sidecar-archive/` directory structure

## Acceptance Criteria
- [ ] AC1: Each sidecar has 5-15 relevant entries per file
- [ ] AC2: Outdated entries archived to `sprint/archive/sidecar-archive/`
- [ ] AC3: All remaining entries verified as current

## Consolidation Opportunities (from research)

1. **Context Budget Targets** - duplicated across SM/Dev/TEA patterns
2. **Helper Delegation Format** - SM patterns has outdated format
3. **Pennyfarthing Version Check** - possibly redundant section in Dev patterns

## Dependencies & Risks

**Dependencies:** None

**Risks:**
- Subjective decisions on what to keep vs. archive
- May accidentally remove still-valuable content

**Mitigations:**
- Archive rather than delete (reversible)
- Start with pm-sidecar (largest, most obvious candidates)
- Keep security and handoff patterns intact

## Routing

**1-point trivial story** → Routes directly to Dev (skip TEA)
