<p align="center">
  <img src="pennyfarthing.png" alt="Pennyfarthing Logo" width="200">
</p>

# Pennyfarthing

**v1.6.0** | *The outer loop goes once, the inner loop goes many times.*

A shared agent orchestration framework for Claude Code projects. Pennyfarthing provides a complete TDD workflow with themed agent personas, automatic handoffs, and extensible skills.

## Features

- **10 Agents** - Strategic (PM, Architect) and tactical (SM, TEA, Dev, Reviewer) agents
- **Automatic Handoffs** - Context-aware agent transitions (auto-invoke when < 70% context)
- **7 Persona Themes** - Star Trek, Discworld, Shakespeare, Jane Austen, and more
- **11 Skills** - Reusable knowledge domains (testing, code-review, jira-cli, etc.)
- **24 Slash Commands** - Entry points for agent activation and workflows

## Quick Start

```bash
# Add to your project as a submodule
git submodule add git@github.com:1898andCo/pennyfarthing.git .claude/pennyfarthing

# Initialize project structure
.claude/pennyfarthing/scripts/init-project.sh your-project-name
```

Then in Claude Code:
```
/new-work
```

## The TDD Flow

```
/new-work → SM → TEA → Dev → Reviewer → SM (finish)
             │     │     │       │
          setup  tests  impl   review
```

| Agent | Role | Phase |
|-------|------|-------|
| **SM** | Scrum Master | Story selection, session setup, completion |
| **TEA** | Test Engineer | Write failing tests (RED) |
| **Dev** | Developer | Make tests pass (GREEN) |
| **Reviewer** | Code Reviewer | Quality validation, approve/reject |

Handoffs are automatic when context usage is below 70%. Above that threshold, agents recommend starting a fresh session.

## Documentation

| Document | Description |
|----------|-------------|
| [Getting Started](docs/GETTING-STARTED.md) | Installation and first steps |
| [Architecture](docs/ARCHITECTURE.md) | System design and principles |
| [Agents](docs/AGENTS.md) | Agent reference and capabilities |
| [Commands](docs/COMMANDS.md) | Slash command reference |
| [Workflows](docs/WORKFLOWS.md) | TDD and workflow guides |
| [Personas](docs/PERSONAS.md) | Theme system and customization |
| [Configuration](docs/CONFIGURATION.md) | Configuration reference |
| [Skills](docs/SKILLS.md) | Skills reference |
| [Changelog](CHANGELOG.md) | Version history |

## Directory Structure

```
pennyfarthing/
├── core/
│   ├── agents/           # 10 agent definitions
│   ├── subagents/        # 13 handoff coordinators
│   ├── commands/         # 24 slash commands
│   └── guides/           # Tactical/strategic behavior guides
├── personas/
│   └── themes/           # 7 persona themes
├── skills/               # 11 reusable skill domains
├── scripts/
│   ├── init-project.sh   # Project initialization
│   ├── agent-session.sh  # Session management
│   ├── release.sh        # Release automation
│   └── check-context.sh  # Context usage checking
├── docs/                 # Full documentation
└── README.md
```

## Available Themes

| Theme | Style | Characters |
|-------|-------|------------|
| `star-trek-tos` | Star Trek: The Original Series | Kirk, Spock, McCoy, Scotty |
| `star-trek` | Star Trek: TNG | Picard, Data, Riker |
| `discworld` | Terry Pratchett's Discworld | DEATH, Vetinari, Vimes |
| `shakespeare` | Shakespearean drama | Prospero, Puck, Hamlet |
| `jane-austen` | Regency era wit | Mr. Darcy, Elizabeth Bennet |
| `literary-classics` | Classic literature mix | Various |
| `minimalist` | Professional, no personas | Functional names only |

Configure in `.claude/persona-config.yaml`:
```yaml
theme: star-trek-tos
```

## Project Integration

After initialization, your project will have:

```
your-project/
├── .claude/
│   ├── pennyfarthing/        # Git submodule (shared framework)
│   ├── project/              # Project-specific configuration
│   │   ├── agents/*-sidecar/ # Agent memory/learnings
│   │   ├── skills/           # Project-specific skills
│   │   └── docs/             # shared-context.md
│   ├── agents/      → pennyfarthing/core/agents/
│   ├── commands/    → pennyfarthing/core/commands/
│   ├── subagents/   → pennyfarthing/core/subagents/
│   ├── guides/      → pennyfarthing/core/guides/
│   └── persona-config.yaml
├── sprint/
│   └── current-sprint.yaml   # Sprint tracking
└── .session/
    └── current_work.md       # Active work session
```

## Updating

```bash
git submodule update --remote .claude/pennyfarthing
```

## What's New in v1.6.0

- **Auto-invoke handoffs** - Agents automatically invoke the next agent when context < 70%
- **Standardized agent structure** - All agents follow consistent section order
- **Agent templates** - Reference templates for tactical and strategic agents

## License

Proprietary - 1898 & Co.
