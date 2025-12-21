# Pennyfarthing Development Context

> "The outer loop goes once, the inner loop goes many times."

## What This Project Is

Pennyfarthing is a **shared agent orchestration framework** designed to be embedded in other projects. It provides:

- **Agent definitions**: Reusable agent personas and behaviors
- **Subagent coordinators**: Lightweight handoff automation (Haiku-based)
- **Slash commands**: Entry points for workflows
- **Persona system**: Themeable character overlays
- **Skills**: Project-agnostic knowledge domains

## Meta-Development Considerations

When working on pennyfarthing itself, remember:

1. **Changes propagate**: Agent definitions here affect all projects using pennyfarthing as a submodule
2. **Backwards compatibility**: Consider how changes affect existing project integrations
3. **Self-reference**: We use pennyfarthing to develop pennyfarthing (this is intentional)

## Architecture Principles

### Single Source of Truth
All agent definitions live in `core/agents/`. Projects symlink to these, never copy.

### Context Budgeting
Agents should load 500-800 lines max. Design for just-in-time loading.

### Hierarchical Agents
- **Strategic** (PM, Architect, Orchestrator): Full project scope
- **Tactical** (SM, TEA, Dev, Reviewer): Story-scoped execution

### Subagent Pattern
Main agent (Opus) thinks and decides. Helper (Haiku) executes mechanical work.

## Directory Structure

```
pennyfarthing/
├── core/
│   ├── agents/          # Agent definitions (single source of truth)
│   ├── subagents/       # Haiku-based handoff coordinators
│   ├── commands/        # Slash command definitions
│   └── docs/            # Core documentation
├── personas/
│   ├── attributes.yaml  # Personality dimensions
│   └── themes/          # Character themes (discworld, star-trek, etc.)
├── skills/              # Project-agnostic knowledge domains
├── benchmarks/          # Agent performance testing
└── scripts/             # Initialization and utilities
```

## Key Domains for Development

### LLM-in-the-Loop Patterns
- ReAct (Reason + Act)
- Plan-and-Execute
- Self-Reflection
- Tool augmentation

### Human-in-the-Loop Patterns
- Confidence protocols (HIGH/MEDIUM/LOW)
- Approval gates
- Handoff detection and routing

### Agentic Coding Patterns
- TDD workflow orchestration
- Multi-agent collaboration
- Context window management
- State persistence via session files

## Testing Changes

When modifying agent behavior:
1. Use the benchmark framework in `benchmarks/`
2. Test across multiple personas to ensure capability isn't tied to theme
3. Consider edge cases in handoff transitions
