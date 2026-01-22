# ADR-0006: State Detection Over Explicit Commands

**Status:** Accepted
**Date:** 2026-01-19
**Author:** Architect (White Queen)

## Context

Agent workflows involve multiple phases (setup, red, green, review, finish). The user must be able to:
1. Start new work
2. Resume interrupted work
3. Complete finished work
4. Switch between stories

Traditional approaches use explicit commands (`/start`, `/resume`, `/finish`), but this:
- Increases cognitive load (user must know current state)
- Creates error opportunities (wrong command for current state)
- Requires complex command routing logic

## Decision

Agents detect workflow state from session files and sprint YAML rather than requiring explicit user commands.

### State Detection Flow

```
/new-work (or /sm, /work, etc.)
    ↓
workflow-status-check subagent
    ↓
Reads:
  1. .session/{story-id}-session.md - exists? phase?
  2. sprint/current-sprint.yaml - story status?
  3. Git branch state - uncommitted changes?
  4. Jira status - claimed? in progress?
    ↓
Returns: NEW_WORK | IN_PROGRESS | FINISH | ERROR
    ↓
Agent takes appropriate action based on detected state
```

### Session File as State Authority

The session file (`.session/{story-id}-session.md`) is the authoritative source for workflow state:

```markdown
## Story X-Y: [Title]
**Phase:** setup | red | green | review | finish
**Status:** in_progress | blocked | complete
**Workflow:** tdd | trivial | agent-docs

## Workflow Tracking
**Phase Started:** ISO 8601 timestamp
```

### State Transitions

| Current State | Condition | Agent Action |
|---------------|-----------|--------------|
| No session | No active work | Start new story selection |
| Phase: setup | Setup incomplete | Resume setup |
| Phase: red | Tests not committed | Resume test writing |
| Phase: green | Implementation incomplete | Resume implementation |
| Phase: review | Review not complete | Resume review |
| Phase: finish | Cleanup needed | Run finish workflow |

### Implementation

The `workflow-status-check` subagent (Haiku) performs detection:

```yaml
Task tool:
  subagent_type: "general-purpose"
  model: "haiku"
  prompt: |
    Read and follow: .pennyfarthing/agents/workflow-status-check.md

    CONTEXT: Detect workflow state for agent activation
```

Returns structured result:
```yaml
status: success | blocked
workflow_state: NEW_WORK | IN_PROGRESS | FINISH
story_id: "X-Y" (if applicable)
phase: setup | red | green | review | finish
```

## Consequences

### Positive

- **Single entry point** - `/new-work` handles all cases
- **Reduced cognitive load** - User doesn't need to track state
- **Automatic resume** - Interrupted work continues seamlessly
- **Consistent behavior** - Same command, appropriate action
- **Error prevention** - Can't run wrong command for state

### Negative

- **Detection overhead** - Must read files on each activation
- **State file dependency** - Corrupted session file breaks detection
- **Implicit behavior** - Users may not know what action will occur
- **Debugging complexity** - Must understand state detection to debug

### Constraints

- **Never hardcode state** - Always detect from session files
- **Never bypass detection** - Even when state seems obvious
- **Session file is truth** - Sprint YAML is secondary
- **Subagent does detection** - Keep Opus for decisions

## Alternatives Considered

### 1. Explicit Commands

Separate `/start`, `/resume`, `/finish` commands.

**Rejected:** Higher cognitive load. Users must track state and choose correct command.

### 2. Interactive Prompts

Ask user what they want to do on activation.

**Rejected:** Slows down workflow. State detection can determine action automatically.

### 3. Git Branch as State

Use current git branch to determine state.

**Rejected:** Insufficient granularity. Can't distinguish red/green/review phases from branch alone.

## Implementation Notes

State detection was refined through multiple iterations:
- v1: Direct file reading in agent
- v2: Extracted to subagent for Haiku efficiency
- v3: Added Git and Jira checks for comprehensive detection

Key files:
- `pennyfarthing-dist/agents/workflow-status-check.md` - Detection subagent
- `.session/{story-id}-session.md` - State authority
- `sprint/current-sprint.yaml` - Story registry

## References

- BMAD Architecture Review (2026-01-19)
- ADR-0009: Session File Coordination Protocol
