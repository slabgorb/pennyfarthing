# Getting Started with Pennyfarthing

Get up and running with Pennyfarthing in under 5 minutes.

> For complete documentation, see the [User Guide](USER-GUIDE.md).

## Prerequisites

- Node.js 18+
- Git
- Claude Code CLI installed
- `yq` - `brew install yq`
- `jq` - `brew install jq`

## Installation

### Step 1: Install Pennyfarthing

```bash
cd your-project
npm install --save-dev pennyfarthing
```

### Step 2: Initialize Your Project

```bash
pennyfarthing init
```

This creates symlinks (no file copying):
- `.claude/pennyfarthing/` → `node_modules/pennyfarthing/pennyfarthing-dist/`
- `.claude/agents/`, `commands/`, `skills/`, `personas/` → symlinks
- `.claude/project/` - Your customizations (not a symlink)
- `scripts/` → symlink to pennyfarthing scripts
- `sprint/` - Sprint tracking
- `.session/` - Work session files

### Step 3: Verify Installation

```bash
pennyfarthing doctor
```

All checks should pass. If not, run `pennyfarthing doctor --fix`.

## Configuration

### 1. Project Context

Edit `.claude/project/docs/shared-context.md`:

```markdown
# Shared Agent Context - my-project

## Project Overview
- **Name:** my-project
- **Type:** Web application

## Tech Stack
| Repo | Language | Framework |
|------|----------|-----------|
| api  | Go       | Chi       |
| ui   | TypeScript | React   |

## Commands
```bash
just dev    # Start servers
just test   # Run tests
```
```

### 2. Choose a Theme

Edit `.claude/persona-config.yaml`:

```yaml
theme: discworld    # Options: discworld, star-trek, star-trek-tos,
                    #          literary-classics, jane-austen,
                    #          shakespeare, minimalist
```

## Your First Work Session

In Claude Code:

```
/new-work
```

The SM (Scrum Master) agent activates and guides you through:
1. Selecting a story from the backlog
2. Setting up the work session
3. Handing off to TEA for test writing

## The TDD Flow

```
/new-work → SM → TEA → Dev → Reviewer → SM (finish)
```

| Agent | Command | Role |
|-------|---------|------|
| SM | `/sm` | Story setup, session management |
| TEA | `/tea` | Write failing tests |
| Dev | `/dev` | Make tests pass |
| Reviewer | `/reviewer` | Code review |

## Quick Commands

| Command | Purpose |
|---------|---------|
| `/new-work` | Start a work session |
| `/sm` | Activate Scrum Master |
| `/tea` | Activate Test Engineer |
| `/dev` | Activate Developer |
| `/reviewer` | Activate Reviewer |
| `/architect` | Get architecture guidance |
| `/pm` | Strategic planning |

## Updating

```bash
# v4.0+: Update via npm
npm update pennyfarthing
pennyfarthing doctor
```

## Troubleshooting

### "no such file or directory" errors

```bash
pennyfarthing doctor --fix
```

### Fresh reinstall

```bash
pennyfarthing uninstall
npm install --save-dev pennyfarthing
pennyfarthing init
```

## Next Steps

- [User Guide](USER-GUIDE.md) - Complete documentation
- [Workflows](WORKFLOWS.md) - Detailed workflow guides
- [Personas](PERSONAS.md) - Customize agent personalities
- [Commands](COMMANDS.md) - All available commands
