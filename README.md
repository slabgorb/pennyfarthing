# Pennyfarthing

**The outer loop goes once, the inner loop goes many times.**

Pennyfarthing is a shared agent orchestration framework for Claude Code projects. It provides:

- **Agent definitions** - Strategic and tactical agents for TDD workflows
- **Persona system** - Theme-based character personas (Discworld, Star Trek, etc.)
- **Subagent handoffs** - Haiku-based state transition coordinators
- **Slash commands** - Entry points for agent activation
- **Core skills** - Project-agnostic knowledge domains

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

### Directory Structure

```
pennyfarthing/
├── core/
│   ├── agents/           # Base agent definitions
│   ├── subagents/        # Handoff coordinators
│   ├── commands/         # Slash commands
│   └── docs/             # Core documentation
├── personas/
│   ├── themes/           # discworld, star-trek, literary-classics, minimalist
│   └── attributes.yaml   # Personality modifiers
├── skills/               # Project-agnostic skills
│   ├── agentic-patterns/
│   ├── context-engineering/
│   ├── story-management/
│   ├── code-review/
│   ├── jira-cli/
│   ├── sprint-context/
│   └── persona-benchmark/
├── scripts/
│   ├── init-project.sh   # Initialize in new project
│   ├── agent-session.sh  # Session management
│   └── render-templates.sh
└── README.md
```

## Project Integration

After adding pennyfarthing, your project will have:

```
your-project/
├── .claude/
│   ├── pennyfarthing/              # Git submodule (shared)
│   ├── project/                    # Project-specific
│   │   ├── agents/*-sidecar/       # Project knowledge
│   │   ├── skills/                 # Project skills
│   │   ├── docs/                   # shared-context.md
│   │   └── hooks/                  # setup-env.sh
│   ├── agents/        → symlink to pennyfarthing/core/agents/
│   ├── subagents/     → symlink to pennyfarthing/core/subagents/
│   ├── commands/      → symlink to pennyfarthing/core/commands/
│   ├── personas/      → symlink to pennyfarthing/personas/
│   └── persona-config.yaml
└── ...
```

## The TDD Workflow

```
/new-work → SM → TEA → Dev → Reviewer → SM (finish)
```

1. **SM** (Scrum Master) - Story selection, session setup
2. **TEA** (Test Engineer) - Write failing tests (RED)
3. **Dev** (Developer) - Make tests pass (GREEN)
4. **Reviewer** - Code quality validation
5. **SM** - Archive session, complete story

## Available Themes

| Theme | Style | Default Character (Orchestrator) |
|-------|-------|----------------------------------|
| `discworld` | Terry Pratchett's Discworld | DEATH |
| `star-trek` | Star Trek TNG | Q |
| `literary-classics` | Classic literature | Sherlock Holmes |
| `minimalist` | Professional, no personas | (none) |

## Updating

```bash
cd your-project
git submodule update --remote .claude/pennyfarthing
```

## License

Proprietary - 1898 & Co.
