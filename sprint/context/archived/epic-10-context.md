# Epic 10: Multi-Agent Choreography Patterns - Technical Context

**Generated:** 2026-01-06
**Epic ID:** epic-10
**Points:** 8 (4 stories × 2 pts each)
**Priority:** P2 (quick-win)

## Epic Overview

Document the proven coordination patterns used in Pennyfarthing's multi-agent orchestration system. These patterns emerged from solving real problems and represent battle-tested solutions.

## Current State Analysis

### Existing Pattern Implementations

| Pattern | Location | Status |
|---------|----------|--------|
| TDD Flow (SM→TEA→Dev→Reviewer→SM) | `agents/*.md`, session files | Implemented, undocumented |
| Helper Delegation (Opus→Haiku) | Subagent files (`*-handoff.md`, `workflow-status-check.md`) | Implemented, undocumented |
| Fan-out/Fan-in | Task tool usage in agents | Partially used, undocumented |
| Approval Gates | Reviewer flow, SM decisions | Implemented, undocumented |

### Documentation Target

Create reusable pattern documentation in `pennyfarthing-dist/guides/patterns/` that other projects can reference.

## Technical Approach

### Pattern Documentation Structure

Each pattern document should include:

```markdown
# Pattern Name

## Problem Statement
What coordination challenge does this solve?

## Solution
How does the pattern work?

## State Diagram
Visual representation (mermaid or ASCII)

## Implementation
Code/config examples from Pennyfarthing

## When to Use
Appropriate scenarios

## Error Recovery
What happens when things go wrong

## Anti-Patterns
What NOT to do
```

### File Organization

```
pennyfarthing-dist/guides/patterns/
├── tdd-flow-pattern.md         # Story 10-1
├── helper-delegation-pattern.md # Story 10-2
├── fan-out-fan-in-pattern.md   # Story 10-3
└── approval-gates-pattern.md   # Story 10-4
```

## Story-Level Technical Details

### 10-1: Document TDD Flow Pattern (2 pts)

**Focus:** SM → TEA → Dev → Reviewer → SM linear workflow

**Key Files to Reference:**
- `agents/sm.md` (lines 81-93 - workflow routing)
- `agents/tea.md` (RED phase entry)
- `agents/dev.md` (GREEN phase)
- `agents/reviewer.md` (approval gate)
- `agents/workflow-status-check.md` (state detection)

**State Machine:**
```
NEW_WORK → SM_SETUP → TEA_RED → DEV_GREEN → REVIEW → APPROVED → SM_FINISH
```

**Session File States:**
- `Phase: sm | tea | dev | review | approved`
- Only ONE agent active at a time

**Error Recovery Paths:**
- Reviewer rejects → back to DEV_GREEN
- Tests still failing → DEV continues
- Missing epic context → block at NEW_WORK

---

### 10-2: Document Helper Delegation Pattern (2 pts)

**Focus:** Opus (strategic) → Haiku (mechanical) delegation

**Key Files to Reference:**
- `agents/workflow-status-check.md` (195 lines - state detection)
- `agents/sm-story-setup.md` (branch/Jira setup)
- `agents/tea-handoff.md` (RED verification)
- `agents/dev-handoff.md` (GREEN verification)
- `agents/reviewer-preflight.md` (pre-flight checks)

**Delegation Table:**
| Opus Agent | Haiku Subagent | Purpose |
|------------|----------------|---------|
| SM | workflow-status-check | Detect workflow state |
| SM | sm-story-setup | Create branches, claim Jira |
| TEA | tea-handoff | Verify RED, update session |
| Dev | dev-handoff | Verify GREEN, check PR |
| Reviewer | reviewer-preflight | Run tests/lint pre-check |

**Why This Pattern:**
- Problem: Agents ignore multi-step markdown instructions during handoffs
- Solution: Make critical behaviors AUTOMATIC via subagent scripts

**Invocation:**
```
Task tool:
  subagent_type: "workflow-status-check"
  prompt: "CALLING_AGENT: SM"
```

---

### 10-3: Create Fan-out/Fan-in Pattern (2 pts)

**Focus:** Parallel agent execution and result aggregation

**Key Files to Reference:**
- Task tool documentation (parallel calls)
- `agents/sm.md` (parallel status checks)
- Any place using multiple Task calls in single response

**Pattern Structure:**
```
Orchestrator
    ├──→ Agent A (parallel)
    ├──→ Agent B (parallel)
    └──→ Agent C (parallel)
         ↓
    Collect results
         ↓
    Merge/aggregate
         ↓
    Continue workflow
```

**Current Usage:**
- SM spawns parallel file summaries
- Orchestrator can check multiple repos simultaneously

**Best Practices:**
- Use `run_in_background: true` for independent tasks
- Use `TaskOutput` to collect results
- Handle partial failures gracefully

---

### 10-4: Create Approval Gates Pattern (2 pts)

**Focus:** Human-in-the-loop approval mechanisms

**Key Files to Reference:**
- `agents/reviewer.md` (adversarial mindset, approval/rejection)
- `agents/reviewer-handoff-approve.md` (approval routing)
- `agents/reviewer-handoff-reject.md` (rejection routing)
- `AskUserQuestion` tool usage
- `EnterPlanMode` tool usage

**Gate Types:**
1. **Automated Gates** - Test/lint must pass (reviewer-preflight)
2. **Human Review Gates** - Reviewer approval required
3. **User Decision Gates** - AskUserQuestion for choices
4. **Plan Approval Gates** - EnterPlanMode for complex work

**Rejection Flow:**
```
Reviewer finds issues
    ↓
Writes "CHANGES REQUESTED"
    ↓
reviewer-handoff-reject updates session
    ↓
Phase returns to `dev`
    ↓
Dev fixes and re-submits
```

## Testing Strategy

Each pattern document should be:
1. **Self-contained** - Readable without other docs
2. **Example-rich** - Show real Pennyfarthing implementations
3. **Actionable** - Reader can apply pattern immediately

**Acceptance Verification:**
- Document exists in `pennyfarthing-dist/guides/patterns/`
- Contains all required sections (problem, solution, diagram, etc.)
- References real file locations and line numbers
- Includes error scenarios and anti-patterns

## Dependencies

- No external dependencies
- All patterns already implemented in codebase
- Documentation-only work

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Patterns evolve, docs get stale | Include "last verified" dates |
| Over-documenting obvious things | Focus on non-obvious decisions |
| Missing edge cases | Review actual session logs for real failures |

## Notes

- This is "quick-win" documentation work - patterns exist, just need writing
- Each story is independent - can be worked in any order
- Priority: 10-1 and 10-2 are P1 (core patterns), 10-3 and 10-4 are P2
