# ADR-0015: Prime Activation System

**Status:** Accepted
**Date:** 2026-01-28
**Author:** Architect (Naomi Nagata)

## Context

Every Pennyfarthing agent activation requires loading multiple context sources: agent definitions, sidecars, personas, workflow state, sprint context, and session history. Before Prime, this was scattered across shell scripts with inconsistent loading order and no unified interface.

**Problems with the old approach:**
- Each agent script loaded context differently
- No single entry point for Cyclist integration
- Workflow state detection was duplicated
- Session registration was manual and error-prone
- Persona loading wasn't centralized

## Decision

Create a unified Python-based activation system (`pennyfarthing_scripts/prime/`) that bootstraps any agent with consistent context loading, workflow detection, and session management.

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    prime.sh (entry point)                        │
│                           │                                      │
│                           ▼                                      │
│                    prime/cli.py                                  │
│                           │                                      │
│        ┌──────────────────┼──────────────────────┐              │
│        ▼                  ▼                      ▼              │
│  ┌──────────┐      ┌──────────┐          ┌──────────┐          │
│  │ loader.py │      │workflow.py│          │persona.py│          │
│  │           │      │           │          │           │          │
│  │ - agent   │      │ - state   │          │ - theme   │          │
│  │ - sidecar │      │ - redirect│          │ - crew    │          │
│  │ - behavior│      │ - phase   │          │ - voice   │          │
│  │ - sprint  │      │           │          │           │          │
│  │ - session │      │           │          │           │          │
│  │ - domain  │      │           │          │           │          │
│  └──────────┘      └──────────┘          └──────────┘          │
│        │                  │                      │              │
│        └──────────────────┼──────────────────────┘              │
│                           ▼                                      │
│                    session.py                                    │
│                  (register/cleanup)                              │
└─────────────────────────────────────────────────────────────────┘
```

### Module Responsibilities

| Module | Purpose |
|--------|---------|
| `cli.py` | Entry point, argument parsing, orchestration |
| `loader.py` | Load agent definition, sidecars, behavior guide, sprint context, session context, domain docs |
| `workflow.py` | Detect workflow state (NEW_WORK, IN_PROGRESS, FINISH), check redirects |
| `persona.py` | Load theme, extract agent persona, format crew manifest |
| `session.py` | Register session with UUID, cleanup old sessions |
| `models.py` | Data structures (PrimeResult, WorkflowState, Persona, CrewMember) |

### Loading Stages

Prime loads context in a specific order to ensure dependencies are met:

1. **Agent Definition** - `pennyfarthing-dist/agents/{agent}.md`
2. **Sidecar Files** - `.pennyfarthing/sidecars/{agent}/` (patterns, decisions, gotchas)
3. **Behavior Guide** - `pennyfarthing-dist/guides/agent-behavior.md`
4. **Sprint Context** - `sprint/current-sprint.yaml` summary
5. **Session Context** - `.session/{story-id}-session.md` if exists
6. **Persona** - Theme-specific character voice and crew
7. **Domain Docs** - `.claude/project/*.md` (only with `--full`)

### Workflow State Detection

Prime detects the current workflow state to route agents correctly:

| State | Condition | Agent Action |
|-------|-----------|--------------|
| `NEW_WORK_STATE` | No active session, backlog has stories | Show backlog, start new work |
| `IN_PROGRESS_STATE` | Active session exists | Check phase owner, redirect if needed |
| `FINISH_STATE` | Session phase is `approved` | Run finish flow |
| `EMPTY_BACKLOG_STATE` | No active session, no backlog | Suggest promoting from future.yaml |

### CLI Interface

```bash
# Standard activation
python -m pennyfarthing_scripts.prime --agent sm

# Minimal (skip optional context)
python -m pennyfarthing_scripts.prime --agent dev --minimal

# Full (include domain docs)
python -m pennyfarthing_scripts.prime --agent architect --full

# JSON output for Cyclist
python -m pennyfarthing_scripts.prime --agent tea --json

# Skip specific loading
python -m pennyfarthing_scripts.prime --agent dev --no-persona --no-workflow
```

### Output Format

**Text mode (default):**
```
Session: {uuid} -> {agent}

# Workflow State
state: IN_PROGRESS_STATE
story_id: 28-1
phase: implement
workflow: tdd

# Agent Definition: {agent}
{agent markdown content}

# Persona: {character} ({agent})
{persona XML}

# Sprint Context
{sprint summary}

# Agent Sidecar: patterns.md
{patterns content}
```

**JSON mode (`--json`):**
```json
{
  "session_id": "uuid",
  "agent": "dev",
  "workflow_status": {
    "state": "IN_PROGRESS_STATE",
    "story_id": "28-1",
    "phase": "implement"
  },
  "persona": { ... },
  "context_loaded": ["agent", "sidecar", "behavior", "sprint", "persona"]
}
```

### Integration Points

| Consumer | Usage |
|----------|-------|
| `/agent` commands | Shell wrapper calls `prime.sh` |
| Cyclist | JSON output for UI state |
| `agent-session.sh` | Thin wrapper around prime |
| Phase check scripts | Workflow state detection |

## Consequences

### Positive

- **Single entry point** - All agent activation goes through prime
- **Consistent loading** - Same order, same validation for all agents
- **Cyclist integration** - JSON output enables rich UI state
- **Session tracking** - UUID-based session registration
- **Workflow awareness** - Agents know their state before starting
- **Testable** - Python modules can be unit tested

### Negative

- **Python dependency** - Requires Python 3.10+ (not just shell)
- **Startup latency** - ~200ms for full context load
- **Complexity** - Six modules vs one shell script

### Neutral

- **Shell wrapper** - `prime.sh` remains for backward compatibility
- **Context budget** - Full load is ~15k tokens; minimal is ~5k

## Alternatives Considered

### 1. Shell-Only Implementation

Keep everything in bash scripts.

**Rejected:** Too complex for workflow detection, no structured output, hard to test.

### 2. TypeScript Implementation

Use Node.js for consistency with Cyclist.

**Rejected:** Python is already used for Jira scripts, YAML handling is cleaner in Python.

### 3. Lazy Loading per Section

Load each section only when referenced.

**Rejected:** Increases complexity, agents need full context upfront for planning.

## References

- Entry point: `pennyfarthing-dist/scripts/core/prime.sh`
- Implementation: `pennyfarthing_scripts/prime/`
- Agent-session wrapper: `pennyfarthing-dist/scripts/core/agent-session.sh`
- ADR-0006: State Detection Pattern
- ADR-0007: Subagent Delegation Model
