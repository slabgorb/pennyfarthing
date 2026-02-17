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
npm install --save-dev @pennyfarthing/core
```

**Optional:** For the Cyclist visual terminal with agent portraits:

```bash
npm install --save-dev @pennyfarthing/cyclist
```

### Step 2: Initialize Your Project

```bash
npx pennyfarthing init
```

This creates symlinks (no file copying):
- `.pennyfarthing/agents/`, `guides/`, `personas/`, `scripts/` → `node_modules/@pennyfarthing/core/pennyfarthing-dist/`
- `.claude/commands/`, `skills/` → symlinks to built-in commands and skills
- `.claude/project/` - Your customizations (not a symlink)
- `sprint/` - Sprint tracking
- `.session/` - Work session files

### Step 3: Verify Installation

```bash
npx pennyfarthing doctor
```

All checks should pass. If not, run `npx pennyfarthing doctor --fix`.

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

In Claude Code:

```
/list-themes       # Browse all available themes
/pf-theme set         # Interactive theme selector
/show-theme        # Preview current or any theme
```

Or via CLI:

```bash
pennyfarthing theme list
pennyfarthing theme set discworld
```

Or edit `.pennyfarthing/config.local.yaml` directly:

```yaml
theme: discworld    # See THEME-COMPARISON.md for all available themes
```

## Your First Work Session

In Claude Code:

```
/pf-work
```

The SM (Scrum Master) agent activates and guides you through:
1. Selecting a story from the backlog
2. Setting up the work session
3. Handing off based on the chosen workflow

## Workflows

Pennyfarthing uses BikeLane workflows - flexible, configurable agent sequences:

```
/pf-workflow list          # See all available workflows
/pf-workflow start <name>  # Start a specific workflow
```

**Example: TDD Workflow**

```
/pf-work → SM → TEA → Dev → Reviewer → SM (finish)
```

| Agent | Command | Role |
|-------|---------|------|
| SM | `/pf-sm` | Story setup, session management |
| TEA | `/pf-tea` | Write failing tests |
| Dev | `/pf-dev` | Make tests pass |
| Reviewer | `/pf-reviewer` | Code review |

See [WORKFLOWS.md](WORKFLOWS.md) for all workflow types including stepped workflows for planning, architecture, and more.

## Quick Commands

| Command | Purpose |
|---------|---------|
| `/pf-work` | Start a work session |
| `/pf-sm` | Activate Scrum Master |
| `/pf-tea` | Activate Test Engineer |
| `/pf-dev` | Activate Developer |
| `/pf-reviewer` | Activate Reviewer |
| `/pf-architect` | Get architecture guidance |
| `/pf-pm` | Strategic planning |

## Updating

```bash
npm update @pennyfarthing/core
npx pennyfarthing doctor
```

## Troubleshooting

### "no such file or directory" errors

```bash
npx pennyfarthing doctor --fix
```

### Fresh reinstall

```bash
npx pennyfarthing uninstall
npm install --save-dev @pennyfarthing/core
npx pennyfarthing init
```

## Scientific Benchmarking (Optional)

Evaluate persona effectiveness with standardized scenarios:

```bash
# Create a baseline (run 10 times)
/benchmark-control reviewer --scenario order-service

# Compare a persona against baseline
/benchmark discworld reviewer --scenario order-service
```

**Note:** Sequential benchmarks work with standard interactive prompts. For **parallel benchmarks** (running multiple themes simultaneously), you need explicit permissions for subagents. Run `pennyfarthing doctor --fix` to add them, or see [PERMISSIONS.md](PERMISSIONS.md#benchmarking-permissions-parallel-runs).

See [BENCHMARKING.md](BENCHMARKING.md) for complete guide.

## Showcase Website

Browse all themes and character profiles at the interactive showcase:

```bash
# Build and serve locally
cd showcase && npm run dev
```

Features:
- Theme gallery with OCEAN spider charts
- Individual character profiles
- Side-by-side personality comparisons

## Next Steps

- [User Guide](USER-GUIDE.md) - Complete documentation
- [Workflows](WORKFLOWS.md) - Detailed workflow guides
- [Personas](PERSONAS.md) - Customize agent personalities
- [Commands](COMMANDS.md) - All available commands
- [Benchmarking](BENCHMARKING.md) - Scientific persona evaluation
