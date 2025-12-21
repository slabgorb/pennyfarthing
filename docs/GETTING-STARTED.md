# Getting Started with Pennyfarthing

This guide walks you through installing and configuring Pennyfarthing for your Claude Code project.

## Prerequisites

- Git
- An existing project directory
- Claude Code CLI installed

## Installation

### Step 1: Add as Git Submodule

```bash
cd your-project

# Add pennyfarthing as a submodule
git submodule add git@github.com:1898andCo/pennyfarthing.git .claude/pennyfarthing
```

### Step 2: Initialize Project

```bash
# Run the initialization script
.claude/pennyfarthing/scripts/init-project.sh your-project-name
```

This creates:
- `.claude/project/` - Project-specific configuration
- `.claude/agents/` - Symlink to core agents
- `.claude/commands/` - Symlink to slash commands
- `.claude/personas/` - Symlink to persona themes
- `sprint/` - Sprint tracking directory
- `.session/` - Work session directory

### Step 3: Configure Your Project

Edit the generated files:

1. **`.claude/project/docs/shared-context.md`** - Add your project details:
   - Project name and description
   - Tech stack
   - Repository structure
   - Development commands

2. **`.claude/project/docs/agent-scopes.yaml`** - Configure agent behavior:
   - Define your repositories
   - Set test patterns
   - Configure file patterns

3. **`.claude/persona-config.yaml`** - Choose your theme:
   ```yaml
   theme: discworld  # or: star-trek, literary-classics, minimalist

   attributes:
     verbosity: medium
     formality: casual
     humor: enabled
     emoji_use: minimal
   ```

## Directory Structure After Init

```
your-project/
├── .claude/
│   ├── pennyfarthing/              # Git submodule (shared)
│   ├── project/                    # Project-specific
│   │   ├── agents/                 # Agent sidecars (project knowledge)
│   │   │   ├── dev-sidecar/
│   │   │   ├── tea-sidecar/
│   │   │   └── ...
│   │   ├── skills/                 # Project skills
│   │   ├── docs/
│   │   │   ├── shared-context.md   # Project overview
│   │   │   └── agent-scopes.yaml   # Scope configuration
│   │   └── hooks/
│   │       └── setup-env.sh        # Environment setup
│   ├── agents/        --> symlink to pennyfarthing/core/agents/
│   ├── subagents/     --> symlink to pennyfarthing/core/subagents/
│   ├── commands/      --> symlink to pennyfarthing/core/commands/
│   ├── personas/      --> symlink to pennyfarthing/personas/
│   └── persona-config.yaml
├── sprint/
│   └── current-sprint.yaml         # Sprint tracking
├── .session/
│   └── current_work.md             # Active work session
└── ...
```

## First Steps

### Start Your First Work Session

```bash
# In Claude Code
/new-work
```

The SM (Scrum Master) agent will activate and:
1. Show you the current sprint status
2. Help you select or create a story
3. Set up the work session
4. Hand off to TEA for test writing

### Understanding the TDD Flow

```
/new-work --> SM --> TEA --> Dev --> Reviewer --> SM (finish)
```

1. **SM (Scrum Master)** - Sets up the story, creates branches, initializes session
2. **TEA (Test Engineer)** - Writes failing tests (RED phase)
3. **Dev (Developer)** - Implements code to pass tests (GREEN phase)
4. **Reviewer** - Reviews code quality, security, patterns
5. **SM** - Archives session, marks story complete

### Quick Commands

| Command | Purpose |
|---------|---------|
| `/new-work` | Start a new work session |
| `/sm` | Activate Scrum Master |
| `/tea` | Activate Test Engineer |
| `/dev` | Activate Developer |
| `/reviewer` | Activate Code Reviewer |
| `/architect` | Get architectural guidance |
| `/pm` | Strategic planning |

## Updating Pennyfarthing

```bash
cd your-project
git submodule update --remote .claude/pennyfarthing
```

## Troubleshooting

### Submodule Not Found

If you see "Error: .claude/pennyfarthing submodule not found":

```bash
# Make sure you're in the project root
cd your-project

# Add the submodule first
git submodule add git@github.com:1898andCo/pennyfarthing.git .claude/pennyfarthing
```

### Symlinks Broken

If symlinks are broken after pulling:

```bash
# Re-run init to recreate symlinks
.claude/pennyfarthing/scripts/init-project.sh your-project-name
```

### Environment Variables Not Set

Make sure your project's `.env` file is being sourced:

```bash
# Check if PROJECT_ROOT is set
echo $PROJECT_ROOT

# Source manually if needed
source .claude/project/hooks/setup-env.sh
```

## Next Steps

- Read [Architecture](ARCHITECTURE.md) to understand the system design
- See [Workflows](WORKFLOWS.md) for detailed workflow guides
- Check [Commands](COMMANDS.md) for all available commands
- Explore [Personas](PERSONAS.md) to customize agent personalities
