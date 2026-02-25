# Getting Started with Pennyfarthing

Pennyfarthing is an agent orchestration framework for Claude Code. It gives you a team of specialized AI agents — each with a defined role, workflow, and personality — that collaborate through structured handoffs to build software.

This guide walks you through installation, core concepts, and your first complete work session.

> **Already installed?** Jump to [Your First Work Session](#your-first-work-session).
>
> **Want the 2-minute version?** See the [What Is Pennyfarthing?](../pennyfarthing-dist/guides/what-is-pennyfarthing.md) reference card.

---

## Prerequisites

Before installing, make sure you have:

- **Node.js 18+** — runtime for core packages
- **Python 3.11+** — runtime for the `pf` CLI
- **Git** — version control (Pennyfarthing manages branches for you)
- **Claude Code CLI** — the AI coding assistant Pennyfarthing orchestrates
- **yq** — YAML processor (`brew install yq`)
- **jq** — JSON processor (`brew install jq`)

---

## Installation

### Step 1: Install the Package

```bash
cd your-project
npm install --save-dev @pennyfarthing/core
```

This gives you 30 built-in themes. Want more? Install additional theme packs:

```bash
# Optional: 70+ additional themes across genres
npm install --save-dev @pennyfarthing/themes-comedy
npm install --save-dev @pennyfarthing/themes-scifi
npm install --save-dev @pennyfarthing/themes-prestige-tv
# ... and more (see full list with `pf theme list` after setup)
```

### Step 2: Initialize Your Project

```bash
pf init
```

This creates the Pennyfarthing directory structure using **symlinks** (not copies):

| Created | Purpose |
|---------|---------|
| `.pennyfarthing/` | Runtime framework — agents, guides, personas, scripts |
| `.claude/commands/` | Slash commands (e.g., `/pf-work`, `/pf-sm`) |
| `.claude/skills/` | Multi-step skills for agents |
| `sprint/` | Sprint tracking files |
| `.session/` | Active work session files |

### Step 3: Interactive Setup

Start Claude Code in your project directory, then run:

```
/pf-setup
```

This walks you through:
1. **Repository discovery** — detects your git structure
2. **CLAUDE.md generation** — project context for agents
3. **Theme selection** — pick a persona theme (you can change this anytime)
4. **Jira integration** — optional sprint tracking connection

### Step 4: Verify

```bash
pf doctor
```

You should see all checks passing:

```
[OK] python_install: pf CLI found on PATH
[OK] pennyfarthing_dir: .pennyfarthing/ exists
[OK] config_file: config.local.yaml valid
[OK] settings_hooks: Settings hooks present
[OK] symlinks: All symlinks valid
[OK] commands: 36 pf-* commands found
[OK] skills: 21 pf-* skills found
[OK] node_packages: node_modules/ present
[OK] theme: Theme: discworld
```

If anything fails, run `pf doctor --fix` to auto-repair.

---

## Core Concepts

Understanding these five concepts will make everything else click.

### Agents

Pennyfarthing ships with 11 specialized agents, each responsible for one part of the development process:

| Agent | Command | What They Do |
|-------|---------|--------------|
| **SM** (Scrum Master) | `/pf-sm` | Picks stories, sets up sessions, finishes work |
| **TEA** (Test Engineer) | `/pf-tea` | Writes failing tests first (TDD red phase) |
| **Dev** (Developer) | `/pf-dev` | Makes tests pass, implements features |
| **Reviewer** | `/pf-reviewer` | Adversarial code review, merges PRs |
| **Architect** | `/pf-architect` | System design, technical decisions |
| **PM** (Product Manager) | `/pf-pm` | Strategic planning, prioritization |
| **Tech Writer** | `/pf-tech-writer` | Documentation |
| **UX Designer** | `/pf-ux-designer` | Interface design, user flows |
| **DevOps** | `/pf-devops` | Infrastructure, CI/CD |
| **BA** (Business Analyst) | `/pf-ba` | Requirements, stakeholder analysis |
| **Orchestrator** | `/pf-orchestrator` | Meta-operations, process improvement |

Each agent stays in their lane — the SM never writes code, the Dev never does reviews. This separation means each agent can be deeply specialized.

### Workflows

A **workflow** defines which agents participate and in what order. Pennyfarthing includes several:

**Phased workflows** (agents hand off to each other automatically):

| Workflow | Flow | Best For |
|----------|------|----------|
| `tdd` | SM → TEA → Dev → Reviewer → SM | Features with tests |
| `trivial` | SM → Dev → Reviewer → SM | Small fixes, chores |
| `bdd` | SM → UX → TEA → Dev → Reviewer → SM | User-facing features |

**Stepped workflows** (you advance through steps manually):

| Workflow | Steps | Best For |
|----------|-------|----------|
| `architecture` | 8 steps | Design decisions |
| `release` | 11 steps | Version releases |

View all workflows: `pf workflow list`

### Phases and Gates

A workflow is a sequence of **phases**. Between phases, **gates** check quality before allowing the handoff:

```
SM (setup) ──gate──→ TEA (red) ──gate──→ Dev (green) ──gate──→ Reviewer ──gate──→ SM (finish)
```

Gates enforce standards automatically — tests must be written before implementation starts, code must pass review before merging. You don't manage gates directly; they run as part of the handoff.

### Sessions

When you start working on a story, Pennyfarthing creates a **session file** at `.session/{story-id}-session.md`. This file tracks:

- Which phase you're in
- Which agent is active
- Assessments from each completed phase
- Branch names and Jira keys

Session files are the source of truth for work state. If you restart Claude Code mid-story, the session file lets agents pick up where they left off.

### Personas and Themes

Each agent has a **persona** — a fictional character that shapes their communication style. Personas are grouped into **themes**:

```bash
pf theme list          # See all available themes
pf theme set discworld # Switch to Discworld theme
pf theme show          # Preview current theme's characters
```

The default theme is `discworld`, where the SM is Captain Carrot, the Reviewer is Granny Weatherwax, and the Dev is Ponder Stibbons. Themes are cosmetic — they change personality, not capability.

---

## Configuration

### Project Context

After setup, tell your agents about your project by editing `.claude/project/docs/shared-context.md`:

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
| Command | Purpose |
|---------|---------|
| `just dev` | Start dev servers |
| `just test` | Run all tests |
```

This context is loaded into every agent's prompt, so they understand your project without re-discovering it each time.

### Theme Selection

Browse and set themes interactively:

```bash
pf theme list                    # Browse all themes
pf theme show hitchhikers-guide  # Preview a specific theme
pf theme set hitchhikers-guide   # Switch themes
```

Or set directly in `.pennyfarthing/config.local.yaml`:

```yaml
theme: discworld
```

---

## Your First Work Session

The simplest way to start is:

```
/pf-work
```

This activates the SM agent, who checks for in-progress work or presents the backlog. Here's what a typical TDD session looks like:

### 1. SM Sets Up the Story

The SM reads the sprint backlog, helps you pick a story, claims it in Jira, creates a feature branch, and writes the session file. Then it hands off.

```
SM: "Right then, Citizen. Story 42-3 is a 3-point feature — 'Add user
    preferences API'. TDD workflow. I've created the branch and session.
    Handing off to Igor (TEA) for the red phase."
```

### 2. TEA Writes Failing Tests

The TEA agent activates, reads the session for context, and writes test cases that define the expected behavior — before any implementation exists.

```
TEA: "Yeth, marthter. I've written 4 test cases covering the preferences
     CRUD operations. All failing, as expected. The Dev can proceed."
```

### 3. Dev Makes Tests Pass

The Dev agent reads the failing tests and implements the minimum code to make them pass.

```
Dev: "I've implemented the preferences service and API routes. All 4
     tests passing. Pushing to the feature branch for review."
```

### 4. Reviewer Checks the Work

The Reviewer reads the PR, verifies test coverage, checks for issues, and either approves or requests changes.

```
Reviewer: "APPROVED. Tests cover the happy path and error cases.
          Clean implementation. Merging."
```

### 5. SM Finishes

The SM archives the session, updates Jira, and the story is done.

### Resuming Work

If you close Claude Code mid-story, just run `/pf-work` again. The SM reads the session file and routes you to whichever agent should be active.

You can also activate a specific agent directly: `/pf-dev`, `/pf-tea`, `/pf-reviewer`, etc.

---

## Sprint Management

Pennyfarthing tracks work in sprints with stories organized under epics.

```bash
pf sprint status          # Current sprint overview
pf sprint backlog         # Available stories
pf sprint story show 42-3 # Details on a specific story
```

Stories have types (feature, fix, chore), point estimates, and workflow assignments. The SM handles most sprint operations, but you can query status directly with `pf sprint`.

---

## Display Modes

Pennyfarthing works in three display modes:

| Mode | How to Start | Best For |
|------|-------------|----------|
| **CLI** | Just use Claude Code normally | Simplest setup, terminal-only |
| **BikeRack** (TUI) | `pf bikerack start` | Split-pane terminal dashboard |
| **Cyclist** (GUI) | `npm run dev:web` in cyclist package | Full browser UI with panels |

**Start with CLI mode.** It requires no extra setup and gives you the full agent workflow. BikeRack and Cyclist add visual dashboards (sprint boards, session viewers, agent portraits) but are optional.

---

## Quick Command Reference

### Getting Started
| Command | Purpose |
|---------|---------|
| `/pf-work` | Smart entry — resume or start work |
| `/pf-help` | Context-aware help |
| `/pf-sprint status` | Sprint overview |
| `/pf-sprint backlog` | Available stories |

### Agents
| Command | Purpose |
|---------|---------|
| `/pf-sm` | Scrum Master — story setup and finish |
| `/pf-tea` | Test Engineer — write failing tests |
| `/pf-dev` | Developer — implement features |
| `/pf-reviewer` | Reviewer — code review and merge |
| `/pf-architect` | Architect — design guidance |
| `/pf-pm` | Product Manager — planning |

### Management
| Command | Purpose |
|---------|---------|
| `/pf-workflow list` | All available workflows |
| `/pf-theme set` | Change persona theme |
| `/pf-health-check` | Verify installation |

### CLI
| Command | Purpose |
|---------|---------|
| `pf doctor` | Health check |
| `pf doctor --fix` | Auto-repair issues |
| `pf theme list` | Browse themes |
| `pf sprint status` | Sprint overview |

---

## Updating

```bash
npm update @pennyfarthing/core
pf doctor
```

If you installed theme packs, update those too:

```bash
npm update @pennyfarthing/themes-comedy @pennyfarthing/themes-scifi
```

---

## Troubleshooting

### "No such file or directory" errors

Symlinks may be broken. Auto-repair:

```bash
pf doctor --fix
```

### Agent doesn't recognize my project

Make sure `.claude/project/docs/shared-context.md` exists and describes your tech stack. Run `/pf-setup` to regenerate it interactively.

### Wrong agent is active

If a handoff went wrong, activate the correct agent directly:

```bash
/pf-sm        # Go back to Scrum Master
/pf-dev       # Jump to Developer
```

The agent will read the session file and determine what phase it should be in.

### Fresh reinstall

```bash
pf uninstall
npm install --save-dev @pennyfarthing/core
pf init
```

---

## Next Steps

- **[What Is Pennyfarthing?](../pennyfarthing-dist/guides/what-is-pennyfarthing.md)** — Concept reference card
- **[BikeLane Workflows](BIKELANE.md)** — All workflow types and customization
- **[User Guide](USER-GUIDE.md)** — Complete documentation
- **[Commands](COMMANDS.md)** — Full command reference
- **[Benchmarking](../packages/benchmark/docs/BENCHMARKING.md)** — Scientific persona evaluation
