# Pennyfarthing User Guide

Complete guide to using Pennyfarthing, a Claude Code agent framework with TDD workflow and persona system.

**Version:** 5.1.1

---

## Table of Contents

1. [Introduction](#introduction)
2. [Installation](#installation)
3. [Quick Start](#quick-start)
4. [CLI Commands](#cli-commands)
5. [The Agent System](#the-agent-system)
6. [The TDD Workflow](#the-tdd-workflow)
7. [Slash Commands](#slash-commands)
8. [Configuration](#configuration)
9. [Persona Themes](#persona-themes)
10. [Project Structure](#project-structure)
11. [Skills](#skills)
12. [Troubleshooting](#troubleshooting)

---

## Introduction

Pennyfarthing is a shared agent orchestration framework for Claude Code projects. It provides:

- **Agent System** - Coordinated multi-agent workflows for TDD development
- **Persona System** - 63 themed character personalities (Discworld, Star Trek, The Expanse, etc.)
- **Subagent Handoffs** - Automated state transitions between agents
- **Slash Commands** - Entry points for agent activation
- **Skills** - Project-agnostic knowledge domains
- **Sprint Management** - Story tracking and workflow coordination
- **Scientific Benchmarking** - TRAIL framework for evaluating code review effectiveness
- **Showcase Website** - Interactive theme gallery with OCEAN personality visualizations

### Core Philosophy

> "The outer loop goes once, the inner loop goes many times."

Strategic planning happens occasionally. Tactical execution (story implementation) happens iteratively through the TDD flow.

---

## Installation

### Prerequisites

- Node.js 18+
- Git
- Claude Code CLI installed
- `yq` (YAML processor) - `brew install yq`
- `jq` (JSON processor) - `brew install jq`

### Install via NPM

```bash
# Install as dev dependency (recommended)
npm install --save-dev pennyfarthing

# Or install globally (still works, but project install preferred)
npm install -g pennyfarthing
```

### Initialize a Project

```bash
cd your-project

# Install the package first
npm install --save-dev pennyfarthing

# Initialize with project name
pennyfarthing init my-project

# Or let it detect from directory name
pennyfarthing init
```

The init command (v4.0+):
1. Creates `.claude/` directory structure
2. Symlinks to `node_modules/pennyfarthing/pennyfarthing-dist/` (no file copying)
3. Creates project-specific directories for customization
4. Sets up agent sidecars for project knowledge
5. Configures session hooks for environment setup

### Migrating from 3.x

The v4.0 release changes from copying files to symlinking:

```bash
# Remove old copied files
pennyfarthing uninstall

# Install package
npm install --save-dev pennyfarthing

# Re-initialize with symlinks
pennyfarthing init
```

Your `.claude/project/` customizations are preserved.

### Verify Installation

```bash
pennyfarthing doctor
```

This checks:
- All required files are present
- Hooks are properly configured
- Permissions are correct
- No integrity issues

---

## Quick Start

### 1. Configure Your Project

After initialization, edit these files:

**`.claude/project/docs/shared-context.md`** - Project overview:
```markdown
# Shared Agent Context - my-project

## Project Overview
- **Name:** my-project
- **Type:** Web application
- **Sprint Status:** `sprint/current-sprint.yaml`

## Tech Stack
| Repo | Language | Framework |
|------|----------|-----------|
| api  | Go       | Chi       |
| ui   | TypeScript | React   |

## Commands
### Development
```bash
# Start dev servers
just dev

# Run tests
just test
```
```

**`.claude/persona-config.yaml`** - Choose a theme:
```yaml
theme: discworld  # 91 themes available - see THEME-COMPARISON.md for full list
attributes:
  verbosity: medium
  formality: casual
  humor: enabled
  emoji_use: minimal
```

### 2. Start Your First Work Session

In Claude Code:

```
/new-work
```

This activates the SM (Scrum Master) agent who will:
1. Check for any in-progress work
2. Show available stories from the sprint backlog
3. Help you select a story
4. Set up the work session
5. Hand off to TEA for test writing

### 3. Follow the TDD Flow

The standard development flow:

```
/new-work → SM → TEA → Dev → Reviewer → SM (finish)
```

1. **SM** sets up the story and creates branches
2. **TEA** writes failing tests (RED)
3. **Dev** implements code to pass tests (GREEN)
4. **Reviewer** validates code quality
5. **SM** archives the session and marks complete

---

## CLI Commands

### `pennyfarthing init [project-name]`

Initialize Pennyfarthing in a project.

```bash
pennyfarthing init my-project
pennyfarthing init                    # Auto-detect from directory
pennyfarthing init -f                 # Force, skip prompts
pennyfarthing init --dry-run          # Preview changes
pennyfarthing init --skip-templates   # Skip template generation
```

**What it creates (v4.0+):**
- `.claude/pennyfarthing/` → symlink to `node_modules/pennyfarthing/pennyfarthing-dist/`
- `.claude/agents/` → symlink to `pennyfarthing/agents/`
- `.claude/commands/` → symlink to `pennyfarthing/commands/`
- `.claude/skills/` → symlink to `pennyfarthing/skills/`
- `.claude/personas/` → symlink to `pennyfarthing/personas/`
- `.claude/project/` - Project-specific customizations (you edit this)
- `scripts/` → symlink to `pennyfarthing/scripts/`
- `sprint/` - Sprint tracking
- `.session/` - Work session files

### `pennyfarthing update`

Update Pennyfarthing to the latest version.

```bash
# v4.0+: Use npm to update (symlinks point to node_modules)
npm update pennyfarthing

# Or check current version
pennyfarthing version
```

**Behavior (v4.0+):**
- Symlinks automatically point to updated package
- No file copying or overwriting needed
- `.claude/project/` customizations always preserved
- Run `pennyfarthing doctor` after major version updates

### `pennyfarthing doctor`

Check installation health and diagnose issues.

```bash
pennyfarthing doctor
pennyfarthing doctor --fix            # Auto-apply fixes
pennyfarthing doctor --json           # Output as JSON
pennyfarthing doctor --quiet          # Only show errors
```

**Checks performed:**
- Manifest exists and is valid
- Core directories present
- File integrity (no missing files)
- Hooks configured correctly
- SessionStart hooks present (critical for $PROJECT_ROOT)
- Scripts are executable

### `pennyfarthing version`

Show version information.

```bash
pennyfarthing version
```

### `pennyfarthing uninstall`

Remove Pennyfarthing from the project for a clean reinstall.

```bash
pennyfarthing uninstall
pennyfarthing uninstall --force       # Skip confirmation
pennyfarthing uninstall --all         # Also remove project files
pennyfarthing uninstall --dry-run     # Preview what would be removed
```

**What gets removed (default):**
- `.claude/pennyfarthing/` (symlink to node_modules)
- `.claude/agents/`, `.claude/commands/`, `.claude/skills/`, `.claude/personas/` (symlinks)
- `.claude/manifest.json`, `.claude/settings.local.json`
- `scripts/hooks/`, `scripts/utils/`

**With `--all`:**
- `.claude/project/` (agent sidecars, custom docs)
- `.claude/persona-config.yaml`
- `.session/`
- `sprint/current-sprint.yaml`

**Always preserved (even with `--all`):**
- `sprint/archive/` - Completed work history
- `sprint/context/` - Story summaries

---

## The Agent System

Pennyfarthing uses specialized agents for different aspects of development:

### Tactical Agents (TDD Flow)

| Agent | Command | Role | Character (Discworld) |
|-------|---------|------|----------------------|
| **SM** | `/sm` | Story coordination, session management | Captain Carrot |
| **TEA** | `/tea` | Test writing, TDD guidance | Igor |
| **Dev** | `/dev` | Feature implementation | Ponder Stibbons |
| **Reviewer** | `/reviewer` | Code review, quality gates | Granny Weatherwax |

### Strategic Agents

| Agent | Command | Role | Character (Discworld) |
|-------|---------|------|----------------------|
| **PM** | `/pm` | Strategic planning, prioritization | Lord Vetinari |
| **Architect** | `/architect` | System design, architecture | Leonard of Quirm |
| **DevOps** | `/devops` | Infrastructure, deployment | Lu-Tze |
| **Tech Writer** | `/tech-writer` | Documentation | Sacharissa Cripslock |
| **UX Designer** | `/ux-designer` | UI/UX design | Lady Sybil |
| **Orchestrator** | `/orchestrator` | Meta-operations, process improvement | The Librarian |

### Agent Sidecars

Each agent has a sidecar directory for project-specific knowledge:

```
.claude/project/agents/dev-sidecar/
├── patterns.md     # Implementation patterns discovered
├── gotchas.md      # Common mistakes to avoid
└── decisions.md    # Past architectural decisions
```

Agents load their sidecars on activation, maintaining context across sessions.

---

## The TDD Workflow

### Standard Flow

```
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌──────────┐    ┌─────────┐
│   SM    │───▶│   TEA   │───▶│   Dev   │───▶│ Reviewer │───▶│   SM    │
│ (setup) │    │ (tests) │    │ (impl)  │    │ (review) │    │(finish) │
└─────────┘    └─────────┘    └─────────┘    └──────────┘    └─────────┘
```

### Phase Details

**1. SM (Setup)**
- Checks workflow status
- Researches available stories
- Creates story context file
- Sets up feature branches
- Claims Jira story (if configured)

**2. TEA (Test Writing)**
- Analyzes acceptance criteria
- Writes failing tests (RED)
- Ensures tests are comprehensive
- Hands off to Dev when tests ready

**3. Dev (Implementation)**
- Makes tests pass (GREEN)
- Follows project patterns
- Keeps implementation minimal
- Hands off when all tests pass

**4. Reviewer (Code Review)**
- Validates code quality
- Checks for security issues
- Ensures patterns followed
- Approves or requests changes

**5. SM (Finish)**
- Archives session files
- Writes completion summary
- Updates sprint YAML
- Transitions Jira to Done

### Scale-Adaptive Routing

| Story Size | Points | Workflow |
|------------|--------|----------|
| Trivial | 1-2 | SM → Dev (skip TEA) |
| Standard | 3-5 | SM → TEA → Dev → Reviewer |
| Complex | 8+ | SM → TEA → Dev → Reviewer |

---

## Slash Commands

### Core Workflow Commands

| Command | Purpose |
|---------|---------|
| `/new-work` | Start a new work session (activates SM) |
| `/sm` | Activate Scrum Master |
| `/tea` | Activate Test Engineer |
| `/dev` | Activate Developer |
| `/reviewer` | Activate Code Reviewer |

### Strategic Commands

| Command | Purpose |
|---------|---------|
| `/pm` | Product Manager - strategic planning |
| `/architect` | System design and architecture |
| `/devops` | Infrastructure and deployment |
| `/tech-writer` | Documentation creation |
| `/ux-designer` | UI/UX design |
| `/orchestrator` | Meta-operations, process improvement |

### Sprint & Planning Commands

| Command | Purpose |
|---------|---------|
| `/sprint-planning` | Facilitate sprint planning session |
| `/start-epic` | Start an epic with technical context |
| `/retro` | Run a sprint retrospective |
| `/sync-epic-to-jira` | Sync epic to Jira |

### Utility Commands

| Command | Purpose |
|---------|---------|
| `/repo-status` | Check git status of all repos |
| `/health-check` | Check Pennyfarthing installation |
| `/release` | Merge develop to main |
| `/parallel-work` | Start work in a new worktree |
| `/brainstorm` | Structured problem-solving session |
| `/party-mode` | Free-form creative brainstorming |

---

## Configuration

### Settings File

`.claude/settings.local.json` - Claude Code settings:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/scripts/hooks/session-start.sh"
          }
        ]
      }
    ]
  },
  "statusLine": {
    "type": "command",
    "command": "$CLAUDE_PROJECT_DIR/.claude/pennyfarthing/statusline.sh"
  },
  "permissions": {
    "allow": [
      "Read", "Grep", "Glob", "Bash",
      "Edit(.claude/**)", "Edit(sprint/**)", "Edit(.session/**)"
    ]
  }
}
```

### Environment Variables

Set by `session-start.sh`:

| Variable | Purpose |
|----------|---------|
| `PROJECT_ROOT` | Project root directory |
| `SESSION_ID` | Current Claude Code session ID |

Set by `setup-env.sh`:

| Variable | Purpose |
|----------|---------|
| `PROJECT_NAME` | Project name |
| `API_REPO` | API repository name |
| `UI_REPO` | UI repository name |

### Repository Configuration

`.claude/project/repos.yaml`:

```yaml
version: "1.0"

repos:
  my-api:
    path: "my-api"
    type: api
    language: go
    test_command: "just test"
    build_command: "just build"

  my-ui:
    path: "my-ui"
    type: ui
    language: typescript
    test_command: "npm run test -- --run"
    build_command: "npm run build"

build_order:
  - my-api
  - my-ui
```

---

## Persona Themes

Pennyfarthing includes several persona themes that give agents distinct personalities:

### Available Themes

Pennyfarthing includes **91 persona themes** across diverse universes:

| Category | Examples |
|----------|----------|
| **Sci-Fi** | Star Trek TNG, Star Trek TOS, The Expanse, Firefly, Doctor Who, Stargate |
| **Fantasy** | Discworld, Lord of the Rings, Harry Potter, Dragon Age, Mistborn |
| **Literary** | Shakespeare, Jane Austen, Literary Classics, Sherlock Holmes, Pride & Prejudice |
| **Animated** | Avatar TLA, Gravity Falls, Adventure Time, Steven Universe |
| **Games** | Mass Effect, Baldur's Gate 3, Portal, Hollow Knight |
| **Professional** | Minimalist (no personas), Corporate, Academic |

For the complete theme list with OCEAN personality profiles, see [THEME-COMPARISON.md](THEME-COMPARISON.md).

### Setting a Theme

Edit `.claude/persona-config.yaml`:

```yaml
theme: star-trek-tos

attributes:
  verbosity: medium    # minimal, medium, high
  formality: casual    # formal, casual
  humor: enabled       # enabled, disabled
  emoji_use: minimal   # none, minimal, moderate
```

### Example: Star Trek TOS Theme

| Agent | Character |
|-------|-----------|
| SM | Captain Kirk |
| TEA | Mr. Spock |
| Dev | Scotty |
| Reviewer | Dr. McCoy |
| PM | Admiral Nogura |
| Architect | Commodore Stone |

---

## Project Structure

After initialization:

```
your-project/
├── .claude/
│   ├── pennyfarthing/           # Source files (managed by Pennyfarthing)
│   │   ├── agents/              # Agent definitions
│   │   ├── commands/            # Slash command definitions
│   │   ├── guides/              # Behavior guides
│   │   ├── skills/              # Knowledge domains
│   │   ├── personas/            # Theme files
│   │   └── statusline.sh        # Status bar script
│   ├── agents/                  # → symlink to pennyfarthing/agents/
│   ├── commands/                # → symlink to pennyfarthing/commands/
│   ├── skills/                  # → symlink to pennyfarthing/skills/
│   ├── personas/                # → symlink to pennyfarthing/personas/
│   ├── project/                 # Project-specific (YOU edit this)
│   │   ├── agents/              # Agent sidecars
│   │   │   ├── dev-sidecar/
│   │   │   ├── tea-sidecar/
│   │   │   └── ...
│   │   ├── docs/
│   │   │   ├── shared-context.md
│   │   │   └── agent-scopes.yaml
│   │   ├── hooks/
│   │   │   └── setup-env.sh
│   │   └── skills/              # Project-specific skills
│   ├── manifest.json            # Installation manifest
│   ├── persona-config.yaml      # Theme configuration
│   └── settings.local.json      # Claude Code settings
├── scripts/                      # → symlink to .claude/pennyfarthing/scripts/
│   ├── hooks/                   # Session hooks
│   │   ├── session-start.sh
│   │   └── pre-edit-check.sh
│   ├── utils/                   # Utility scripts
│   │   ├── checkpoint.sh
│   │   ├── file-lock.sh
│   │   ├── logging.sh
│   │   └── ...
│   ├── agent-session.sh         # Agent session management
│   └── uninstall.sh             # Uninstall script
├── sprint/
│   ├── current-sprint.yaml      # Active sprint
│   ├── archive/                 # Completed sessions
│   └── context/                 # Story summaries
└── .session/
    ├── {story-id}-session.md          # Active work session
    ├── agents/                  # Agent session files
    └── ...
```

---

## Skills

Skills are reusable knowledge domains that agents can reference.

### Built-in Skills

| Skill | Purpose |
|-------|---------|
| `sprint-context` | Sprint status and backlog |
| `story-management` | Story creation patterns |
| `code-review` | Review guidelines |
| `testing` | Test patterns and best practices |
| `dev-patterns` | Implementation patterns |
| `jira` | Jira CLI usage |
| `just` | Justfile task runner |
| `yq` | YAML processing |

### Using Skills

Skills are loaded automatically when relevant, or can be referenced:

```
Can you show me the testing patterns from the testing skill?
```

### Project Skills

Add project-specific skills in `.claude/project/skills/`:

```
.claude/project/skills/my-domain/
├── SKILL.md          # Skill definition
└── references/       # Supporting docs
```

---

## Troubleshooting

### Common Issues

#### "no such file or directory: /scripts/agent-session.sh"

**Cause:** `$PROJECT_ROOT` environment variable not set.

**Fix:**
```bash
pennyfarthing doctor --fix
```

This adds the missing SessionStart hooks to `settings.local.json`.

#### Agent Not Showing in Status Line

**Cause:** Session hooks not running.

**Fix:**
1. Run `pennyfarthing doctor --fix`
2. Restart Claude Code session

#### "Pennyfarthing not initialized"

**Fix:**
```bash
pennyfarthing init
```

### Diagnostic Commands

```bash
# Full health check
pennyfarthing doctor

# Check what version is installed
pennyfarthing version

# List active agent sessions
./scripts/agent-session.sh list

# Check environment
echo $PROJECT_ROOT
echo $SESSION_ID
```

### Getting Help

- GitHub Issues: https://github.com/1898andCo/pennyfarthing/issues
- Check `/health-check` command in Claude Code

---

## Appendix: Quick Reference

### Workflow Cheat Sheet

```bash
# Start new work
/new-work

# Switch agents manually
/tea        # Switch to Test Engineer
/dev        # Switch to Developer
/reviewer   # Switch to Reviewer

# Get status
/repo-status

# Planning
/sprint-planning
/start-epic

# Finish work (SM handles automatically, or manually)
/sm         # SM can finish approved work
```

### File Locations

| Purpose | Location |
|---------|----------|
| Agent definitions | `.claude/agents/` (symlink) |
| Official subagents | `.claude/agents/` (in same directory) |
| Slash commands | `.claude/commands/` (symlink) |
| Project docs | `.claude/project/docs/` |
| Agent sidecars | `.claude/project/agents/` |
| Sprint data | `sprint/` |
| Active session | `.session/{story-id}-session.md` |
| Persona config | `.claude/persona-config.yaml` |

### Environment Variables

| Variable | Set By | Purpose |
|----------|--------|---------|
| `PROJECT_ROOT` | session-start.sh | Project root path |
| `SESSION_ID` | session-start.sh | Claude session ID |
| `PROJECT_NAME` | setup-env.sh | Project name |
| `CLAUDE_PROJECT_DIR` | Claude Code | Project directory |

---

*Documentation generated by Pennyfarthing Tech Writer agent.*
