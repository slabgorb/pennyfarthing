# Pennyfarthing Documentation

Complete documentation for the Pennyfarthing agent orchestration framework.

## What is Pennyfarthing?

Pennyfarthing is a Claude Code agent orchestration framework built around three pillars:

### 1. Development Platform

A multi-agent system with customizable BikeLane workflows for structured software development:

- **17 Agents** (10 coordinated + 7 subagents) - SM, TEA, Dev, Reviewer, Architect, PM, Tech Writer, UX Designer, DevOps, Orchestrator
- **BikeLane Workflows** - Phased (8), Stepped (17), and Procedural types
- **Subagent Handoffs** - Automated state transitions between agents
- **46 Slash Commands** - Entry points for agent activation
- **19 Skills** - Project-agnostic knowledge domains

### 2. Personality Research

A scientific study of how strong personalities affect agent behavior:

- **OCEAN Profiling** - Big Five personality scores for every character
- **TRAIL Framework Integration** - Categorizing errors (reasoning, planning, execution) and correlating with personality
- **Benchmarking System** - `/solo`, `/benchmark-control`, `/benchmark` for statistical evaluation
- **JobFair** - Discovering which characters excel at roles beyond their native specialization
- **Hypothesis Testing** - Does High Openness detect more reasoning errors? Does Low Agreeableness improve adversarial review?

The persona themes (97 across Discworld, Star Trek, Breaking Bad, etc.) are instruments of inquiry, not decoration. Early findings show character expertise often trumps abstract personality scores.

### 3. 1898 Integration

Tooling to smooth out annoying development processes:

- **Jira Integration** - Bidirectional sync, epic auto-creation, sprint velocity tracking
- **Sprint Management** - Story tracking with `current-sprint.yaml`
- **Git Workflow** - Branch conventions, PR creation, commit standards

## Quick Navigation

| Document | Description |
|----------|-------------|
| [**User Guide**](USER-GUIDE.md) | Complete guide - installation, configuration, usage |
| [Getting Started](GETTING-STARTED.md) | Quick start guide |

### Development Platform
| Document | Description |
|----------|-------------|
| [Agents](AGENTS.md) | Agent reference and capabilities |
| [Commands](COMMANDS.md) | Slash command reference |
| [BikeLane](BIKELANE.md) | Workflow system architecture |
| [BikeLane Diagrams](BIKELANE-DIAGRAMS.md) | Visual Mermaid diagrams of all workflows |

### Personality Research
| Document | Description |
|----------|-------------|
| [Benchmarking](../packages/benchmark/docs/BENCHMARKING.md) | Scientific persona evaluation methodology |
| [TRAIL-OCEAN Mapping](../pennyfarthing-dist/personas/TRAIL-OCEAN-MAPPING.md) | Hypothesis-driven personality testing |
| [OCEAN Benchmarking](../packages/benchmark/docs/OCEAN-BENCHMARKING.md) | Empirical findings on personality correlations |
| [Personas](PERSONAS.md) | Persona system overview |

### Integration & Operations
| Document | Description |
|----------|-------------|
| [Jira Integration](JIRA-INTEGRATION.md) | Jira CLI and sprint sync |
| [CI/CD Integration](CI-CD-INTEGRATION.md) | CI pipelines and git hooks |
| [Team Workflow](TEAM-WORKFLOW.md) | Multi-developer coordination |
| [Configuration](CONFIGURATION.md) | Configuration reference |
| [Troubleshooting](TROUBLESHOOTING.md) | Error diagnosis and recovery |

### Tools
| Document | Description |
|----------|-------------|
| [Cyclist Guide](CYCLIST-GUIDE.md) | Visual terminal user guide |
| [Cyclist Architecture](CYCLIST-ARCHITECTURE.md) | Cyclist internals and IPC |
| [Skills](SKILLS.md) | Skills reference |
| [Debugging Sessions](DEBUGGING-SESSIONS.md) | Debug Claude Code sessions |

## Quick Start

```bash
cd your-project

# Install as dev dependency
npm install --save-dev @pennyfarthing/core

# Initialize (creates symlinks)
npx pennyfarthing init

# Verify installation
npx pennyfarthing doctor

# Start working (in Claude Code)
/work
```

## Example: TDD Workflow

SM → TEA → Dev → Reviewer → SM (setup → red → green → review → finish)

This is one of many BikeLane workflows. Others include stepped planning workflows (PRD, Architecture), procedural workflows (Brainstorming, Retrospective), and quick workflows (Trivial, Quick-Dev).

## CLI Commands

| Command | Purpose |
|---------|---------|
| `npx pennyfarthing init` | Initialize in a project |
| `npm update @pennyfarthing/core` | Update to latest version |
| `npx pennyfarthing doctor` | Check installation health |
| `npx pennyfarthing version` | Show version info |

## Getting Help

- See [User Guide](USER-GUIDE.md) for complete documentation
- See [Troubleshooting](TROUBLESHOOTING.md) for common issues
- GitHub Issues: https://github.com/1898andCo/pennyfarthing/issues
