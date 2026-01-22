# ADR-0009: Session File Coordination Protocol

**Status:** Accepted
**Date:** 2026-01-19
**Author:** Architect (White Queen)

## Context

Multiple agents (SM, TEA, Dev, Reviewer) must coordinate through the TDD workflow. Each agent needs to:
1. Know the current phase and story context
2. Pass information to the next agent
3. Record their assessment and decisions
4. Enable workflow resumption after interruption

Traditional approaches:
- Database with status tracking
- Message queues between agents
- API calls to coordinator service

These add infrastructure complexity. For a Claude Code-based system, we need file-based coordination that works within the LLM's capabilities.

## Decision

All agents coordinate via a structured session file at `.session/{story-id}-session.md`.

### Session File Format

```markdown
## Story X-Y: [Title]
**Repos:** pennyfarthing/api/ui
**Branch:** feat/X-Y-slug
**Jira:** MSSCI-12345
**Phase:** setup | red | green | review | finish
**Status:** in_progress | blocked | complete
**Workflow:** tdd | trivial | agent-docs

## Workflow Tracking
**Phase Started:** 2026-01-19T10:30:00Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-01-19T10:00:00Z | 2026-01-19T10:30:00Z | 30m |

## Story Context
[Technical approach, acceptance criteria, implementation notes]

## TEA Assessment
**Test Files:** [list of test files]
**Coverage:** [areas covered]
**Status:** Tests failing (RED) | Tests passing
**Notes:** [any special considerations]

## Dev Assessment
**Files Changed:** [list of files]
**PR:** #123
**Branch:** feat/X-Y-slug
**Status:** Implementation complete | In progress
**Notes:** [implementation decisions]

## Reviewer Assessment
**VERDICT:** APPROVED | REJECTED
**Evidence:** [specific findings]
**Recommendations:** [if rejected, what to fix]
```

### Handoff Protocol

1. **Agent completes work** - Performs their phase responsibilities
2. **Agent writes assessment** - Documents findings in their section
3. **Agent spawns handoff subagent** - Updates Workflow Tracking
4. **Subagent emits marker** - `<!-- CYCLIST:HANDOFF:/next-agent -->`
5. **Next agent reads state** - Loads session file on activation

### Critical Rule

**Agents must write their assessment BEFORE spawning the handoff subagent.**

```markdown
# CORRECT order:
1. Complete work (write tests, implement code, review)
2. Write assessment section in session file
3. Spawn handoff subagent

# WRONG order:
1. Complete work
2. Spawn handoff subagent  # Assessment not written yet!
3. Write assessment        # Too late, handoff already happened
```

Failure to follow this order causes `agent-session.sh stop` to fail because expected sections are missing.

### Phase Ownership

| Phase | Owner | Writes | Reads |
|-------|-------|--------|-------|
| setup | SM | Story Context, metadata | Sprint YAML |
| red | TEA | TEA Assessment | Story Context |
| green | Dev | Dev Assessment | TEA Assessment |
| review | Reviewer | Reviewer Assessment | Dev Assessment, TEA Assessment |
| finish | SM | Phase History | All assessments |

## Consequences

### Positive

- **File-based** - No infrastructure dependencies
- **Human-readable** - Can inspect and debug easily
- **Git-trackable** - Session history is preserved
- **Resumable** - Interrupted work can continue
- **Context-efficient** - Agents load only needed sections

### Negative

- **File locking** - Concurrent writes could corrupt
- **Parse complexity** - Markdown parsing has edge cases
- **Size growth** - Long sessions accumulate content
- **Manual recovery** - Corrupted files need manual repair

### Constraints

- **One active session per story** - Multiple sessions cause confusion
- **Assessment before handoff** - Required order
- **Structured sections** - Use exact header names
- **Phase field accuracy** - Must reflect actual state

## Alternatives Considered

### 1. Database Coordination

SQLite or similar for status tracking.

**Rejected:** Adds dependency. Claude Code can't easily query databases. File-based is simpler.

### 2. API Coordinator Service

Central service managing state transitions.

**Rejected:** Over-engineered for single-user workflow. Adds infrastructure.

### 3. Environment Variables

Pass state via shell environment.

**Rejected:** Lost between sessions. Can't persist complex state.

### 4. Sprint YAML Only

Track all state in `sprint/current-sprint.yaml`.

**Rejected:** Sprint YAML is for high-level tracking. Session files are for detailed work context.

## Implementation Notes

Session files were introduced in v5.0 and refined through v6 and v7:
- v5: Basic phase tracking
- v6: Added Workflow Tracking section
- v7: Added CYCLIST markers for UI integration

Key files:
- `.session/{story-id}-session.md` - Active session
- `sprint/archive/` - Completed session archives
- `pennyfarthing-dist/agents/*-handoff.md` - Handoff subagents

## References

- BMAD Architecture Review (2026-01-19)
- ADR-0006: State Detection Pattern
- Pennyfarthing Workflow Documentation
