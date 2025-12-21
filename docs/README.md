# Pennyfarthing Documentation

Complete documentation for the Pennyfarthing agent orchestration framework.

## Quick Navigation

| Document | Description |
|----------|-------------|
| [Getting Started](GETTING-STARTED.md) | Installation and first steps |
| [Architecture](ARCHITECTURE.md) | System design and principles |
| [Agents](AGENTS.md) | Agent reference and capabilities |
| [Commands](COMMANDS.md) | Slash command reference |
| [Workflows](WORKFLOWS.md) | Key workflow guides |
| [Personas](PERSONAS.md) | Persona system and themes |
| [Configuration](CONFIGURATION.md) | Configuration reference |
| [Skills](SKILLS.md) | Skills reference |

## What is Pennyfarthing?

Pennyfarthing is a shared agent orchestration framework for Claude Code projects. It provides:

- **Agent System** - Coordinated multi-agent workflows for TDD development
- **Persona System** - Theme-based character personalities (Discworld, Star Trek, etc.)
- **Subagent Handoffs** - Automated state transitions between agents
- **Slash Commands** - Entry points for agent activation
- **Skills** - Project-agnostic knowledge domains

## The Core Philosophy

> "The outer loop goes once, the inner loop goes many times."

Strategic planning happens occasionally. Tactical execution (story implementation) happens iteratively.

## The TDD Workflow

```
/new-work --> SM --> TEA --> Dev --> Reviewer --> SM (finish)
              |       |       |         |
           setup   tests    impl     review
```

1. **SM** (Scrum Master) - Story selection, session setup
2. **TEA** (Test Engineer) - Write failing tests (RED)
3. **Dev** (Developer) - Make tests pass (GREEN)
4. **Reviewer** - Code quality validation
5. **SM** - Archive session, complete story

## Getting Help

- See [Getting Started](GETTING-STARTED.md) for installation
- See [Workflows](WORKFLOWS.md) for common use cases
- See [Commands](COMMANDS.md) for command reference
