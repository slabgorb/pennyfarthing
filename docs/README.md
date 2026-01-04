# Pennyfarthing Documentation

Complete documentation for the Pennyfarthing agent orchestration framework.

## Quick Navigation

| Document | Description |
|----------|-------------|
| [**User Guide**](USER-GUIDE.md) | Complete guide - installation, configuration, usage |
| [Getting Started](GETTING-STARTED.md) | Quick start guide |
| [Agents](AGENTS.md) | Agent reference and capabilities |
| [Commands](COMMANDS.md) | Slash command reference |
| [Workflows](WORKFLOWS.md) | Key workflow guides |
| [Personas](PERSONAS.md) | Persona system and themes |
| [Theme Comparison](THEME-COMPARISON.md) | OCEAN personality profiles and theme selection |
| [Showcase](SHOWCASE.md) | Interactive theme gallery website |
| [Configuration](CONFIGURATION.md) | Configuration reference |
| [Skills](SKILLS.md) | Skills reference |
| [Benchmarking](BENCHMARKING.md) | Scientific persona evaluation |

## What is Pennyfarthing?

Pennyfarthing is a shared agent orchestration framework for Claude Code projects. It provides:

- **Agent System** - Coordinated multi-agent workflows for TDD development
- **91 Persona Themes** - Character personalities with OCEAN profiles (Discworld, Star Trek, The Expanse, etc.)
- **Subagent Handoffs** - Automated state transitions between agents
- **Slash Commands** - Entry points for agent activation
- **Skills** - Project-agnostic knowledge domains
- **Sprint Management** - Story tracking and workflow coordination
- **Scientific Benchmarking** - TRAIL framework for evaluating code review effectiveness

## Quick Start

```bash
cd your-project

# Install as dev dependency
npm install --save-dev pennyfarthing

# Initialize (creates symlinks)
pennyfarthing init

# Verify installation
pennyfarthing doctor

# Start working (in Claude Code)
/new-work
```

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

## CLI Commands

| Command | Purpose |
|---------|---------|
| `pennyfarthing init` | Initialize in a project |
| `npm update pennyfarthing` | Update to latest version |
| `pennyfarthing doctor` | Check installation health |
| `pennyfarthing version` | Show version info |

## Getting Help

- See [User Guide](USER-GUIDE.md) for complete documentation
- See [Troubleshooting](USER-GUIDE.md#troubleshooting) for common issues
- GitHub Issues: https://github.com/1898andCo/pennyfarthing/issues
