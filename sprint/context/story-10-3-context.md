# Story 10-3: Create Fan-out/Fan-in Pattern - Technical Context

**Generated:** 2026-01-06
**Story ID:** 10-3
**Epic:** Epic 10 - Multi-Agent Choreography Patterns
**Points:** 2
**Priority:** P2
**Jira:** MSSCI-11374

## Story Overview

Document the fan-out/fan-in pattern for parallel agent execution and result aggregation. This pattern enables coordinating multiple agents simultaneously, collecting their results, and continuing workflow.

## Acceptance Criteria

From sprint backlog:
- Pattern documented with example
- Shows Task tool parallelism
- Result aggregation covered

## Technical Approach

### Pattern Structure

The fan-out/fan-in pattern follows this structure:

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

### Key Mechanisms

1. **Task Tool Parallel Invocation** - Multiple Task calls in a single response execute concurrently
2. **run_in_background Parameter** - Enables true parallel execution without blocking
3. **TaskOutput Tool** - Collects results from background tasks
4. **Result Aggregation** - Merging multiple results into unified output

### Implementation Details

#### Fan-out Invocation Syntax

```yaml
# Method 1: Multiple Task calls in single message (automatic parallelism)
Task:
  subagent_type: "file-reader"
  prompt: "Read config.yaml"

Task:
  subagent_type: "file-reader"
  prompt: "Read settings.json"

# Method 2: Explicit background execution
Task:
  subagent_type: "repo-checker"
  prompt: "Check frontend repo status"
  run_in_background: true

Task:
  subagent_type: "repo-checker"
  prompt: "Check backend repo status"
  run_in_background: true
```

#### Fan-in Collection Syntax

```yaml
# Collect background task results
TaskOutput:
  task_id: "<agent-id-from-task-result>"
  block: true  # Wait for completion
  timeout: 30000  # 30 second timeout
```

### Current Usage in Codebase

| Location | Current Pattern | Potential Parallelism |
|----------|-----------------|----------------------|
| SM file summaries | Sequential | Could parallelize multiple file reads |
| Orchestrator repo checks | Sequential | Could check all repos simultaneously |
| testing-runner | Sequential per-repo | Could run tests across repos in parallel |
| repo-status command | Sequential | Could query all repos in parallel |

### Relevant Files

| File | Lines | Purpose |
|------|-------|---------|
| `pennyfarthing-dist/agents/sm.md` | L95-142 | Helper-first workflow (sequential) |
| `pennyfarthing-dist/agents/orchestrator.md` | - | Multi-agent coordination |
| `pennyfarthing-dist/agents/testing-runner.md` | L78-113 | Sequential test execution |
| `pennyfarthing-dist/commands/repo-status.md` | L13-24 | Sequential repo checking |
| `pennyfarthing-dist/guides/patterns/helper-delegation-pattern.md` | L461 | References fan-out pattern |

### Documentation Structure

Following the established pattern from 10-1 and 10-2:

```
fan-out-fan-in-pattern.md
├── Problem Statement
│   ├── Sequential bottleneck
│   ├── Waiting for independent work
│   └── Scaling with repo count
├── Solution
│   ├── Parallel Task invocation
│   ├── Background execution
│   └── Result aggregation
├── State Diagram
│   ├── Mermaid version
│   └── ASCII version
├── Implementation
│   ├── Synchronous fan-out (multiple Task calls)
│   ├── Asynchronous fan-out (run_in_background)
│   ├── Fan-in with TaskOutput
│   └── Result aggregation patterns
├── When to Use
│   ├── Independent work items
│   ├── Multiple repos
│   └── Data gathering
├── Error Recovery
│   ├── Partial failure handling
│   ├── Timeout management
│   └── Fallback strategies
└── Anti-Patterns
    ├── Dependent tasks in parallel
    ├── Too many parallel tasks
    └── Ignoring failures
```

### Best Practices to Document

From epic context (L157-160):
1. Use `run_in_background: true` for independent tasks
2. Use `TaskOutput` to collect results
3. Handle partial failures gracefully
4. Set appropriate timeouts

### Error Scenarios to Cover

1. **Partial Failure** - Some tasks succeed, some fail
2. **Timeout** - Task exceeds time limit
3. **All Fail** - Complete fan-out failure
4. **Mixed Results** - Different result structures from different agents

## Testing Strategy

Since this is a documentation story, verification is:
1. Document exists at `pennyfarthing-dist/guides/patterns/fan-out-fan-in-pattern.md`
2. Contains all required sections (problem, solution, diagram, implementation, etc.)
3. References actual Task tool syntax and parameters
4. Includes practical examples (real or realistic)
5. Documents error recovery patterns
6. Contains anti-patterns section

## Definition of Done

- [ ] Pattern documented in `pennyfarthing-dist/guides/patterns/fan-out-fan-in-pattern.md`
- [ ] Contains Mermaid and ASCII state diagrams
- [ ] Shows actual Task tool syntax with `run_in_background`
- [ ] Documents TaskOutput collection pattern
- [ ] Covers partial failure handling
- [ ] Includes anti-patterns section
- [ ] Follows structure of existing pattern docs (10-1, 10-2)

## Dependencies

- **Builds on:** Story 10-1 (TDD flow pattern) and 10-2 (helper delegation pattern)
- **References:** Task tool documentation, existing agent files
- **No blockers:** Pure documentation work

## Notes

- Current codebase uses sequential patterns; this documents the parallel alternative
- Pattern is supported by Claude Code Task tool but not yet widely used in Pennyfarthing
- Documentation enables future refactoring to parallel patterns where beneficial
