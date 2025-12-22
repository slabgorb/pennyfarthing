# Story 1-2: Complete Strategic Agent Behavior Guide - Technical Context

## Story Overview

- **Epic:** Epic 1 - Agentic Best Practices Implementation
- **Points:** 3
- **Priority:** P1
- **Repos:** pennyfarthing

## Current State

`core/guides/strategic-agent-behavior.md` exists (181 lines) with:
- Strategic agent roles table (Orchestrator, PM, SM, Architect, DevOps)
- Context loading patterns
- Brief planning workflow bullets
- Handoff protocol to tactical agents
- Decision documentation template

**Gaps identified:**
1. No PM ↔ Architect coordination patterns
2. No approval gates or escalation rules
3. Sprint planning is just bullet points, not a workflow

## Technical Approach

Add ~50-80 lines to the existing guide covering:

### 1. PM ↔ Architect Coordination (new section)
- When PM should request architecture review
- How Architect responds (sync vs async)
- Design approval flow
- Handling design disagreements

### 2. Approval Gates (new section)
- Define clear gates: when to proceed vs escalate
- Risk thresholds that require approval
- Who approves what (table format)
- Escalation path when blocked

### 3. Sprint Planning Workflow (expand existing)
- Pre-planning: PM prepares backlog
- Planning ceremony: PM, SM, Architect participate
- Story sizing and breakdown
- Commitment and sprint goal

## Files to Modify

| File | Change |
|------|--------|
| `core/guides/strategic-agent-behavior.md` | Add 3 new sections (~50-80 lines) |

## Acceptance Criteria

- [ ] AC1: PM/Architect coordination documented with clear triggers and responses
- [ ] AC2: Approval gates defined with risk thresholds and escalation paths
- [ ] AC3: Sprint planning workflow documented as ceremony flow

## Testing Strategy

Manual review - verify:
1. New sections follow existing guide style
2. Coordination patterns are actionable
3. Gates have clear criteria
4. Sprint planning is step-by-step

## Dependencies & Risks

**Dependencies:** None - standalone documentation enhancement

**Risks:**
- Over-documenting (too prescriptive) - mitigate by keeping patterns flexible
- Under-documenting (too vague) - mitigate by including concrete examples
