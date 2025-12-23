# Pennyfarthing

**v1.5.1** | **The outer loop goes once, the inner loop goes many times.**

Pennyfarthing is a shared agent orchestration framework for Claude Code projects. It provides:

- **Agent definitions** - Strategic and tactical agents for TDD workflows
- **Persona system** - Theme-based character personas (Discworld, Star Trek, etc.)
- **Subagent handoffs** - Haiku-based state transition coordinators
- **Slash commands** - Entry points for agent activation
- **Core skills** - Project-agnostic knowledge domains

## Documentation

| Document | Description |
|----------|-------------|
| [Getting Started](docs/GETTING-STARTED.md) | Installation and first steps |
| [Architecture](docs/ARCHITECTURE.md) | System design and principles |
| [Agents](docs/AGENTS.md) | Agent reference and capabilities |
| [Commands](docs/COMMANDS.md) | Slash command reference |
| [Workflows](docs/WORKFLOWS.md) | Key workflow guides |
| [Personas](docs/PERSONAS.md) | Persona system and themes |
| [Configuration](docs/CONFIGURATION.md) | Configuration reference |
| [Skills](docs/SKILLS.md) | Skills reference |
| [Changelog](CHANGELOG.md) | Version history and release notes |

## Quick Start

### Add to Existing Project

```bash
cd your-project

# Add as submodule
git submodule add git@github.com:1898andCo/pennyfarthing.git .claude/pennyfarthing

# Initialize project-specific directories
.claude/pennyfarthing/scripts/init-project.sh your-project-name

# Follow the prompts to configure
```

See [Getting Started](docs/GETTING-STARTED.md) for detailed instructions.

### Directory Structure

```
pennyfarthing/
├── core/
│   ├── agents/           # Base agent definitions (11 agents)
│   ├── subagents/        # Handoff coordinators (13 subagents)
│   ├── commands/         # Slash commands (24 commands)
│   └── docs/             # Core architecture docs
├── personas/
│   ├── themes/           # discworld, star-trek, literary-classics, minimalist
│   └── attributes.yaml   # Personality modifiers
├── skills/               # Project-agnostic skills (10 skills)
│   ├── agentic-patterns/
│   ├── context-engineering/
│   ├── code-review/
│   ├── testing/
│   ├── story-management/
│   ├── sprint-context/
│   ├── jira-cli/
│   ├── just/
│   ├── dev-patterns/
│   └── persona-benchmark/
├── scripts/
│   ├── init-project.sh   # Initialize in new project
│   └── agent-session.sh  # Session management
├── benchmarks/           # Agent performance testing
├── tests/                # Framework tests
├── docs/                 # Full documentation
└── README.md
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

See [Workflows](docs/WORKFLOWS.md) for detailed workflow guides.

## Available Themes

| Theme | Style | Example (Orchestrator) |
|-------|-------|------------------------|
| `discworld` | Terry Pratchett's Discworld | DEATH |
| `star-trek-tng` | Star Trek: The Next Generation | Q |
| `star-trek-tos` | Star Trek: The Original Series | Guardian of Forever |
| `literary-classics` | Classic literature (Shakespeare) | The Ghost |
| `minimalist` | Professional, no personas | Process Coordinator |

See [Personas](docs/PERSONAS.md) for complete theme documentation.

## Project Integration

After adding pennyfarthing, your project will have:

```
your-project/
├── .claude/
│   ├── pennyfarthing/              # Git submodule (shared)
│   ├── project/                    # Project-specific
│   │   ├── agents/*-sidecar/       # Agent memory
│   │   ├── skills/                 # Project skills
│   │   ├── docs/                   # shared-context.md
│   │   └── hooks/                  # setup-env.sh
│   ├── agents/        --> symlink to pennyfarthing/core/agents/
│   ├── subagents/     --> symlink to pennyfarthing/core/subagents/
│   ├── commands/      --> symlink to pennyfarthing/core/commands/
│   ├── guides/        --> symlink to pennyfarthing/core/guides/
│   ├── personas/      --> symlink to pennyfarthing/personas/
│   └── persona-config.yaml
├── sprint/
│   └── current-sprint.yaml
├── .session/
│   └── current_work.md
└── ...
```

## Updating

```bash
cd your-project
git submodule update --remote .claude/pennyfarthing
```

## License

Proprietary - 1898 & Co.
