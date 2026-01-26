# ADR-0007: Subagent Delegation Model (Opus/Haiku Split)

**Status:** Accepted
**Date:** 2026-01-19
**Author:** Architect (White Queen)

## Context

Agent workflows involve two categories of work:

1. **Reasoning tasks** - Decision-making, code analysis, design choices
2. **Mechanical tasks** - File operations, git commands, status checks, test execution

Using a single model (Opus) for all tasks is:
- Token-inefficient for mechanical work
- Slower due to reasoning overhead on simple tasks
- More expensive than necessary

## Decision

Split work between Opus (reasoning) and Haiku (mechanical) models using a subagent delegation pattern.

### Model Assignment

| Model | Role | Task Types |
|-------|------|------------|
| **Opus** | Main agent | Reasoning, decisions, code analysis, design |
| **Haiku** | Subagent | File operations, git, tests, status checks |

### Subagent Invocation Pattern

Main agents invoke subagents via Claude Code's Task tool:

```yaml
Task tool:
  subagent_type: "general-purpose"
  model: "haiku"
  run_in_background: true  # or false for sequential
  prompt: |
    Read and follow: .pennyfarthing/agents/{subagent-name}.md

    PARAMETER1: value
    PARAMETER2: value
```

### Background vs Foreground Execution

**Background** (`run_in_background: true`):
- Independent operations that don't block decision-making
- Long-running tasks (tests while agent continues planning)
- Parallel exploration of multiple files

**Foreground** (default):
- Status checks (need result to decide next action)
- Handoff operations (must complete before agent exits)
- Quality gates (test verification before proceeding)

### Official Subagents

| Subagent | Purpose | Execution |
|----------|---------|-----------|
| `workflow-status-check` | Detect workflow state | Foreground |
| `sm-setup` | Research backlog or setup story | Background |
| `sm-finish` | Preflight or execute finish | Background |
| `sm-file-summary` | Summarize files | Background |
| `sm-handoff` | SM→TEA/Dev handoff | Foreground |
| `testing-runner` | Run tests | Background |
| `reviewer-preflight` | Gather review data | Background |
| `handoff` | Phase transitions | Foreground |

### What Main Agent Does vs Subagent

| Main Agent (Opus) | Subagent (Haiku) |
|-------------------|------------------|
| Design decisions | Scan codebase for patterns |
| Trade-off analysis | Gather file summaries |
| Code review judgment | Run test suites |
| Implementation choices | Git operations |
| Error handling decisions | Status checks |

## Consequences

### Positive

- **Token efficiency** - Haiku costs ~10x less than Opus
- **Speed** - Mechanical tasks complete faster without reasoning overhead
- **Parallelism** - Background subagents run while main agent thinks
- **Separation of concerns** - Clear boundary between thinking and doing
- **Scalability** - Can add more subagents without increasing main agent complexity

### Negative

- **Coordination overhead** - Must manage subagent invocation and results
- **Context limitations** - Haiku has smaller context window
- **Reliability concerns** - Haiku may miss nuances Opus would catch
- **Debugging complexity** - Issues may span agent boundaries

### Constraints

- **Never use Opus for subagents** - Wastes tokens on mechanical tasks
- **Subagent instructions must be explicit** - Haiku doesn't infer well
- **Handoffs must be foreground** - Can't exit until handoff completes
- **Keep subagent prompts focused** - Single responsibility per subagent

## Alternatives Considered

### 1. Single Model (All Opus)

Use Opus for everything.

**Rejected:** Expensive and slow for mechanical tasks. Poor token efficiency.

### 2. Single Model (All Haiku)

Use Haiku for everything.

**Rejected:** Insufficient reasoning capability for design decisions and complex analysis.

### 3. Dynamic Model Selection

Choose model based on task complexity at runtime.

**Deferred:** Adds complexity. Current explicit split is sufficient. May revisit with more experience.

### 4. Specialized Subagent Types

Create many specialized subagent types (test-runner, git-handler, etc.).

**Partially adopted:** We have specialized subagents but they all use `subagent_type: "general-purpose"` with Haiku. Specialization is in the prompt, not the type.

## Implementation Notes

The subagent pattern evolved through several iterations:
- v1: Inline bash commands in main agent
- v2: Script-based helpers (shell scripts)
- v3: Haiku subagents with Task tool

Key insight: Haiku subagents are more reliable than shell scripts because they can adapt to unexpected situations while still being cost-effective.

Key files:
- `pennyfarthing-dist/agents/*.md` - All subagent definitions
- `pennyfarthing-dist/guides/shared-agent-behavior.md` - Subagent invocation patterns

## References

- BMAD Architecture Review (2026-01-19)
- Claude Code Task Tool Documentation
- ADR-0002: Context Budget Optimization
