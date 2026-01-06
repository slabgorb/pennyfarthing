# Story 10-4: Create Approval Gates Pattern - Technical Context

**Generated:** 2026-01-06
**Story ID:** 10-4
**Epic:** Epic 10 - Multi-Agent Choreography Patterns
**Points:** 2
**Priority:** P2
**Jira:** MSSCI-11375

## Story Overview

Document the approval gates pattern for human-in-the-loop approval mechanisms. This pattern controls workflow progression through explicit verification points where automated checks, human review, or user decisions must pass before continuing.

## Acceptance Criteria

From sprint backlog:
- Pattern documented with examples
- Different approval types covered (automated gates, human review, user decisions, plan approval)
- Integration with TDD flow shown

## Technical Approach

### Gate Types to Document

1. **Automated Gates** - Test/lint must pass (reviewer-preflight)
2. **Human Review Gates** - Reviewer approval required
3. **User Decision Gates** - AskUserQuestion for choices
4. **Plan Approval Gates** - EnterPlanMode for complex work

### Pattern Structure

```
Workflow Stage
    │
    ▼
┌─────────────────┐
│  APPROVAL GATE  │
│  (verification) │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
  PASS      FAIL
    │         │
    ▼         ▼
Continue   Block/Route
Workflow   Back
```

### Key Mechanisms

1. **Assessment-First Protocol** - Agent writes assessment BEFORE spawning handoff subagent
2. **Verdict Verification** - Handoff subagent verifies assessment contains expected verdict
3. **Status Transition** - Session file status drives workflow state
4. **Error Recovery Escalation** - Structured failure reporting with retry pattern

### Implementation Details

#### Assessment-First Protocol (Critical Pattern)

All agents follow this sequence:
```
1. Agent completes work
2. Agent writes Assessment to session file
3. Agent spawns handoff subagent
4. Handoff subagent verifies Assessment exists (step 0)
5. Handoff subagent executes routing
```

This is NOT: Assessment written by handoff subagent
This IS: Assessment written by main agent, handoff subagent verifies then routes

#### Rejection Flow

```
Reviewer finds issues
    ↓
Writes "CHANGES REQUESTED" in assessment
    ↓
Spawns reviewer-handoff-reject
    ↓
Handoff verifies REJECTED verdict
    ↓
Phase stays `review`, routes back to Dev
    ↓
Dev fixes and re-submits
    ↓
Reviewer reviews again
```

### Gate Types Found in Codebase

| Gate Type | Location | Mechanism |
|-----------|----------|-----------|
| Assessment Verification | All handoff subagents L28-32 | grep "## {Agent} Assessment" |
| Verdict Verification | reviewer-handoff-approve L35-36 | Check "APPROVED" vs "REJECTED" |
| Status Transition | sm.md L82-93 | workflow-status-check detects state |
| RED/GREEN Tests | tea-handoff L42-76, dev.md L94-116 | testing-runner verifies |
| Scale-Based Routing | sm.md L359-365 | Story points determine path |
| Context-Aware Routing | sm.md L367-389 | Context usage determines handoff |
| Error Recovery | All handoffs L41-77 | Retry → escalate pattern |

### Relevant Files

| File | Lines | Purpose |
|------|-------|---------|
| `agents/reviewer.md` | L9-25, L188-228 | Adversarial mindset, assessment templates |
| `agents/reviewer-handoff-approve.md` | L26-39 | Approval routing checklist |
| `agents/reviewer-handoff-reject.md` | L30-43 | Rejection routing checklist |
| `agents/sm.md` | L82-93, L359-365 | Status gates, scale routing |
| `agents/dev.md` | L137-144 | Self-review checklist gate |
| `agents/tea.md` | L96-104 | Chore bypass criteria |
| `agents/tea-handoff.md` | L42-76 | RED verification gate |

### Documentation Structure

Following the established pattern from 10-1, 10-2, and 10-3:

```
approval-gates-pattern.md
├── Problem Statement
│   ├── Uncontrolled workflow progression
│   ├── Quality escapes without gates
│   └── Lost context on state changes
├── Solution
│   ├── Explicit verification points
│   ├── Assessment-first protocol
│   └── Verdict-based routing
├── State Diagram
│   ├── Mermaid version
│   └── ASCII version
├── Implementation
│   ├── Gate Types (4 types)
│   ├── Assessment-First Protocol
│   ├── Rejection/Approval Flow
│   └── Context-Aware Routing
├── When to Use
│   ├── Quality gates before merge
│   ├── User decision points
│   └── Complex work requiring planning
├── Error Recovery
│   ├── Retry pattern
│   ├── Escalation format
│   └── Common failures
└── Anti-Patterns
    ├── Skipping assessment step
    ├── Silent approvals
    └── Missing rejection details
```

### Best Practices to Document

1. Always write assessment BEFORE spawning handoff subagent
2. Rejections must include documented issues (no blind rejections)
3. Use severity categorization: Critical/Major/Minor
4. Check context usage before invoking next agent
5. Provide structured escalation on failures

### Error Scenarios to Cover

1. **Missing Assessment** - Handoff blocked, escalate to calling agent
2. **Wrong Verdict** - Misrouted subagent called, escalate
3. **All Tests GREEN when RED expected** - TEA handoff blocked
4. **No Issues Documented** - Rejection blocked

## Testing Strategy

Since this is a documentation story, verification is:
1. Document exists at `pennyfarthing-dist/guides/patterns/approval-gates-pattern.md`
2. Contains all required sections (problem, solution, diagram, implementation, etc.)
3. Documents all four gate types with examples
4. Shows rejection flow with session file state changes
5. Includes error recovery and anti-patterns sections

## Definition of Done

- [ ] Pattern documented in `pennyfarthing-dist/guides/patterns/approval-gates-pattern.md`
- [ ] Contains Mermaid and ASCII state diagrams
- [ ] Documents all four gate types (automated, human review, user decision, plan approval)
- [ ] Shows assessment-first protocol with examples
- [ ] Covers rejection flow mechanics
- [ ] Includes anti-patterns section
- [ ] Follows structure of existing pattern docs (10-1, 10-2, 10-3)

## Dependencies

- **Builds on:** Stories 10-1, 10-2, 10-3 (related patterns)
- **References:** reviewer.md, handoff subagents, sm.md
- **No blockers:** Pure documentation work

## Notes

- This is the final story in Epic 10 - completes the choreography patterns documentation
- Pattern is heavily implemented in reviewer workflow
- Documentation enables understanding of the review/rejection cycle
