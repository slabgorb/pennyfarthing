# Pennyfarthing User Guide

Complete guide to using Pennyfarthing, a Claude Code agent framework with BikeLane workflow system and persona themes.

**Version:** 9.0.2

---

## Table of Contents

1. [Introduction](#introduction)
2. [Installation](#installation)
3. [Quick Start](#quick-start)
4. [CLI Commands](#cli-commands)
5. [The Agent System](#the-agent-system)
6. [The BikeLane Workflow System](#the-bikelane-workflow-system)
7. [Slash Commands](#slash-commands)
8. [Configuration](#configuration)
9. [Persona Themes](#persona-themes)
10. [Project Structure](#project-structure)
11. [Skills](#skills)
12. [Troubleshooting](#troubleshooting)

---

## Introduction

Pennyfarthing is a shared agent orchestration framework for Claude Code projects. It provides:

- **Agent System** - 19 coordinated agents for multi-agent development
- **BikeLane Workflows** - 19 workflow options for different development scenarios (TDD, BDD, research, architecture, etc.)
- **Persona System** - 102 themed character personalities (Discworld, Star Trek, The Expanse, etc.)
- **Subagent Handoffs** - Automated state transitions between agents
- **Slash Commands** - 46 entry points for agent activation and workflows
- **Skills** - 23 project-agnostic knowledge domains
- **Sprint Management** - Story tracking and workflow coordination
- **Scientific Benchmarking** - TRAIL framework for evaluating code review effectiveness
- **Showcase Website** - Interactive theme gallery with OCEAN personality visualizations

### Core Philosophy

> "The outer loop goes once, the inner loop goes many times."

Strategic planning happens occasionally. Tactical execution (story implementation) happens iteratively through the appropriate BikeLane workflow.

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
npm install --save-dev @pennyfarthing/core
```

**Optional:** For the Cyclist visual terminal with agent portraits:

```bash
npm install --save-dev @pennyfarthing/cyclist
```

### Initialize a Project

```bash
cd your-project

# Install first
npm install --save-dev @pennyfarthing/core

# Initialize with project name
npx pennyfarthing init my-project

# Or let it detect from directory name
npx pennyfarthing init
```

The init command:
1. Creates `.claude/` directory structure
2. Symlinks to `node_modules/@pennyfarthing/core/pennyfarthing-dist/` (no file copying)
3. Creates `.pennyfarthing/` for local config (gitignored)
4. Sets up agent sidecars for project knowledge
5. Configures session hooks for environment setup

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

**`.pennyfarthing/config.local.yaml`** - Choose a theme:
```yaml
theme: discworld  # 102 themes available - see THEME-COMPARISON.md for full list
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
5. Hand off to the appropriate workflow

### 3. Choose Your Workflow

BikeLane provides different workflows for different scenarios. You can:

- Let agents automatically select a workflow based on the task
- Explicitly start a workflow with `/workflow start <name>`
- View available workflows with `/workflow list`
- Check current progress with `/workflow status`

Common workflows include:
- **tdd** - Test-driven development (RED-GREEN-REFACTOR)
- **bdd** - Behavior-driven development
- **trivial** - Quick fixes and simple changes
- **prd** - Product requirements documentation
- **architecture** - System design and planning
- **research** - Investigation and discovery

See [The BikeLane Workflow System](#the-bikelane-workflow-system) for complete details.

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

**What it creates:**
- `.pennyfarthing/agents/`, `commands/`, `skills/`, `personas/` → symlinks to `node_modules/@pennyfarthing/core/pennyfarthing-dist/`
- `.claude/project/` - Project-specific customizations (you edit this)
- `.pennyfarthing/` - Local config (gitignored)
- `sprint/` - Sprint tracking
- `.session/` - Work session files

### `pennyfarthing update`

Update Pennyfarthing to the latest version.

```bash
# Update via npm
npm update @pennyfarthing/core

# Or check current version
npx pennyfarthing version
```

**Behavior:**
- Symlinks automatically point to updated package
- No file copying or overwriting needed
- `.claude/project/` customizations always preserved
- Run `npx pennyfarthing doctor` after major version updates

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
- `.pennyfarthing/agents/`, `.claude/commands/`, `.claude/skills/`, `.pennyfarthing/personas/` (symlinks)
- `.claude/manifest.json`, `.claude/settings.local.json`
- `scripts/hooks/`, `scripts/utils/`

**With `--all`:**
- `.claude/project/` (agent sidecars, custom docs)
- `.pennyfarthing/` (local config)
- `.session/`
- `sprint/current-sprint.yaml`

**Always preserved (even with `--all`):**
- `sprint/archive/` - Completed work history
- `sprint/context/` - Story summaries

---

## The Agent System

Pennyfarthing uses specialized agents for different aspects of development:

### Tactical Agents (Development Flow)

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

## The BikeLane Workflow System

BikeLane is Pennyfarthing's flexible workflow system that adapts to different development scenarios. Instead of forcing all work through a single process, BikeLane offers 19 different workflows organized into three categories.

### Workflow Categories

#### 1. Phased Workflows (Agent-Driven)

Agent-driven workflows where agents hand off between phases:

| Workflow | Purpose | Flow |
|----------|---------|------|
| **tdd** | Test-driven development | SM → TEA → Dev → Reviewer → SM |
| **bdd** | Behavior-driven development | SM → TEA (BDD) → Dev → Reviewer → SM |
| **trivial** | Quick fixes (1-2 pts) | SM → Dev (skip tests) → SM |
| **agent-docs** | Documentation work | SM → Tech Writer → Reviewer → SM |

**Example TDD Flow:** SM → TEA → Dev → Reviewer → SM (setup → red → green → review → finish)

#### 2. Stepped Workflows (Progressive Disclosure)

Structured workflows with gates and checkpoints, compatible with BMAD 6.0:

| Workflow | Purpose | Gates |
|----------|---------|-------|
| **prd** | Product requirements | Research → Draft → Review → Finalize |
| **architecture** | System design | Context → Design → Review → Decide |
| **research** | Investigation | Plan → Execute → Analyze → Report |
| **refactoring** | Code improvement | Analyze → Plan → Execute → Validate |
| **bug-investigation** | Root cause analysis | Reproduce → Diagnose → Fix → Verify |
| **spike** | Technical exploration | Plan → Explore → Evaluate → Recommend |
| **security-review** | Security audit | Scan → Analyze → Report → Remediate |
| **performance-tuning** | Optimization | Baseline → Profile → Optimize → Validate |
| **dependency-upgrade** | Upgrade management | Audit → Plan → Upgrade → Test |
| **release-planning** | Release preparation | Scope → Plan → Prepare → Execute |

**Example Architecture Workflow:**
```
Context Gathering → Design → Review → Decision
     (gate)        (gate)   (gate)    (complete)
```

#### 3. Procedural Workflows (Flexible Processes)

Open-ended workflows for collaborative and creative work:

| Workflow | Purpose |
|----------|---------|
| **brainstorming** | Structured problem-solving |
| **code-review** | Manual code review process |
| **pair-programming** | Collaborative development |
| **onboarding** | New developer orientation |
| **incident-response** | Production issue handling |

### BikeLane Quick Reference

```bash
# List all available workflows
/workflow list

# Start a specific workflow
/workflow start tdd
/workflow start architecture
/workflow start research

# Check current workflow progress
/workflow status

# Switch workflows mid-stream (if needed)
/workflow start <different-workflow>
```

### BMAD 6.0 Compatibility

Pennyfarthing's stepped workflows are compatible with the BMAD 6.0 pattern language for structured problem-solving. If you're familiar with BMAD patterns, you'll find:

- Progressive disclosure of information
- Explicit gates and checkpoints
- Structured decision points
- Clear completion criteria

This makes it easy to bring established BMAD workflows into Pennyfarthing projects.

### Scale-Adaptive Routing

BikeLane can automatically select workflows based on story size:

| Story Size | Points | Suggested Workflow |
|------------|--------|-------------------|
| Trivial | 1-2 | trivial |
| Standard | 3-5 | tdd or bdd |
| Complex | 8+ | tdd with architecture spike |

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

### Workflow Commands

| Command | Purpose |
|---------|---------|
| `/workflow list` | Show all available workflows |
| `/workflow start <name>` | Start a specific workflow |
| `/workflow status` | Check current workflow progress |

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

`.pennyfarthing/repos.yaml`:

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

Pennyfarthing includes **102 persona themes** across diverse universes:

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

Edit `.pennyfarthing/config.local.yaml`:

```yaml
theme: star-trek-tos
```

Or use the CLI/commands:

```bash
pennyfarthing theme set star-trek-tos
```

```
/set-theme star-trek-tos
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
│   ├── agents/                  # → symlink to node_modules/@pennyfarthing/core/pennyfarthing-dist/agents/
│   ├── commands/                # → symlink to node_modules/@pennyfarthing/core/pennyfarthing-dist/commands/
│   ├── skills/                  # → symlink to node_modules/@pennyfarthing/core/pennyfarthing-dist/skills/
│   ├── personas/                # → symlink to node_modules/@pennyfarthing/core/pennyfarthing-dist/personas/
│   ├── scripts/                 # → symlink to node_modules/@pennyfarthing/core/pennyfarthing-dist/scripts/
│   ├── project/                 # Project-specific (YOU edit this)
│   │   ├── agents/              # Agent sidecars
│   │   │   ├── dev-sidecar/
│   │   │   ├── tea-sidecar/
│   │   │   └── ...
│   │   ├── docs/
│   │   │   └── shared-context.md
│   │   └── hooks/
│   │       └── setup-env.sh
│   ├── manifest.json            # Installation manifest
│   └── settings.local.json      # Claude Code settings
├── .pennyfarthing/
│   └── config.local.yaml        # Theme selection (gitignored)
├── sprint/
│   ├── current-sprint.yaml      # Active sprint
│   ├── archive/                 # Completed sessions
│   └── context/                 # Story summaries
└── .session/
    └── {story-id}-session.md    # Active work session
```

---

## Skills

Skills are reusable knowledge domains that agents can reference.

### Built-in Skills

| Skill | Purpose |
|-------|---------|
| `sprint` | Sprint status and backlog |
| `story` | Story creation patterns |
| `code-review` | Review guidelines |
| `testing` | Test patterns and best practices |
| `dev-patterns` | Implementation patterns |
| `jira` | Jira CLI usage |
| `just` | Justfile task runner |
| `yq` | YAML processing |
| `workflow` | BikeLane workflow management |
| `context-engineering` | Context window optimization |
| `agentic-patterns` | Agent reasoning patterns |

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

# List available workflows
/workflow list

# Start specific workflow
/workflow start tdd
/workflow start architecture
/workflow start research

# Check workflow progress
/workflow status

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
| Agent definitions | `.pennyfarthing/agents/` (symlink) |
| Official subagents | `.pennyfarthing/agents/` (in same directory) |
| Slash commands | `.claude/commands/` (symlink) |
| Project docs | `.claude/project/docs/` |
| Agent sidecars | `.claude/project/agents/` |
| Sprint data | `sprint/` |
| Active session | `.session/{story-id}-session.md` |
| Theme config | `.pennyfarthing/config.local.yaml` |

### Environment Variables

| Variable | Set By | Purpose |
|----------|--------|---------|
| `PROJECT_ROOT` | session-start.sh | Project root path |
| `SESSION_ID` | session-start.sh | Claude session ID |
| `PROJECT_NAME` | setup-env.sh | Project name |
| `CLAUDE_PROJECT_DIR` | Claude Code | Project directory |

---

*Documentation generated by Pennyfarthing Tech Writer agent.*
