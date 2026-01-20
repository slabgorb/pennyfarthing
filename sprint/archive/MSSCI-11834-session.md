# Story 38-2: Modernize UX Designer agent for custom workflows

**Story ID:** MSSCI-11834
**Epic:** 38 (Agent File Modernization)
**Points:** 2
**Priority:** P3
**Workflow:** agent-docs
**Repos:** pennyfarthing
**Assignee:** Keith Avery
**Started:** 2026-01-19

## Story Overview

Modernize the UX Designer agent file to match the structure and conventions of other production agents (Dev, SM, TEA, Reviewer, Tech Writer). The agent-docs workflow routes through Orchestrator for analysis/implementation, then Tech Writer for documentation quality review.

## Current State

The UX Designer agent (`pennyfarthing-dist/agents/ux-designer.md`) is currently marked `<status>experimental</status>` and lacks several sections present in modern agents:

**Missing sections:**
- `<reasoning-mode>` - No explicit reasoning toggle like Dev/SM
- No workflow participation section - Doesn't document role in any workflow
- Minimal handoff protocol - Basic handoff to Dev but no structured protocol

**Current structure:**
- persona, status, role, helpers, responsibilities, skills, constraints, context, on-activation, workflows (Feature Design, Component Design, User Flow), design principles, handoffs, exit

## Technical Approach

1. **Add `<reasoning-mode>` section** matching Dev/SM/Tech Writer pattern:
   - Default quiet mode, toggle with "verbose mode"
   - UX-Designer-specific reasoning (user needs, design decisions, accessibility)

2. **Add workflow section:**
   - Clear workflow for UI/UX stories
   - Document when UX Designer is invoked
   - Gate conditions for design handoff

3. **Enhance handoff protocol to Dev:**
   - Structured handoff template
   - Clear deliverables checklist
   - Design spec format

4. **Update status:**
   - Change from `experimental` to `production` if all ACs met

## Files to Modify

| File | Changes |
|------|---------|
| `pennyfarthing-dist/agents/ux-designer.md` | Add reasoning-mode, workflow section, enhanced handoff protocol |

## Acceptance Criteria

- [ ] UX Designer has reasoning-mode section (matching Dev/SM pattern)
- [ ] Clear workflow for UI/UX stories (when/how UX Designer is invoked)
- [ ] Handoff protocol to Dev defined (structured deliverables)

## Testing Strategy

No automated tests - this is documentation work. Validation:
- XML tags properly nested
- Consistent structure with other agents
- No broken references

## Workflow Status

| Phase | Agent | Status |
|-------|-------|--------|
| setup | SM | ✅ Complete |
| analyze | Orchestrator | ✅ Complete |
| impl | Orchestrator | ✅ Complete |
| review | Tech Writer | ✅ Complete |
| finish | SM | ⏳ Pending |

---

## SM Handoff to Orchestrator

**Ready for:** Orchestrator to analyze and implement changes
**Context:** Story session created, Jira claimed, branch ready
**Next:** Orchestrator analyzes current UX Designer agent, proposes changes, implements updates

---

## Orchestrator Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `pennyfarthing-dist/agents/ux-designer.md` - Added reasoning-mode, workflow participation, structured handoff protocol, status→production

**Validation:**
- [x] XML tags properly closed
- [x] No hardcoded themes
- [x] Patterns consistent with Dev/SM/Tech Writer agents

**PR:** #348 - feat(MSSCI-11834): modernize UX Designer agent
**Branch:** feat/MSSCI-11834-ux-designer-modernize (pushed)

**Handoff:** To Tech Writer for documentation quality review

---

## Tech Writer Review

**Reviewer:** The Mock Turtle (Tech Writer)
**Status:** ✅ APPROVED

### Quality Check

| Criterion | Status | Notes |
|-----------|--------|-------|
| Structure consistent with other agents | ✅ Pass | Matches Dev, SM, Tech Writer pattern exactly |
| XML tags properly nested | ✅ Pass | All 12 tags correctly opened and closed |
| No stale/broken references | ✅ Pass | Sidecar exists, skill references valid |
| Clear documentation | ✅ Pass | Well-organized, comprehensive |
| Examples accurate | ✅ Pass | UX-appropriate examples (modal design, user flows) |

### Acceptance Criteria Verification

- [x] **UX Designer has reasoning-mode section** - Follows exact pattern: quiet mode default, verbose toggle, THOUGHT/ACTION/OBSERVATION/REFLECT example, agent-specific reasoning bullets
- [x] **Clear workflow for UI/UX stories** - "Workflow Participation" section documents when invoked, typical flow (PM/SM → UX Designer → Dev → Reviewer), phase actions table, design deliverables checklist
- [x] **Handoff protocol to Dev defined** - Comprehensive structured handoff template including overview, user flow, components table, design specs, states/interactions, accessibility requirements, and notes for Dev

### Improvements Noted

1. **Status upgraded** from `experimental` to `production` - appropriate given modernization
2. **Structured handoff template** is particularly thorough - includes layout, colors, typography, spacing specs
3. **Accessibility requirements checklist** in handoff is a valuable addition

### Minor Observations (Non-blocking)

- Context section mentions `TailwindCSS, shadcn/ui, UI/ (React 18)` - these are project-specific hints that may not exist in all projects, but this is consistent with how Tech Writer references `API/docs/`, `UI/docs/`

### Recommendation

**APPROVED for merge.** The UX Designer agent is now fully modernized and ready for production use.

**Handoff:** To SM (The Mad Hatter) for story completion
