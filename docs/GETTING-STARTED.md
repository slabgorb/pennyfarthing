# Getting Started with Pennyfarthing

Pennyfarthing is an agent orchestration framework for Claude Code. It gives you a team of 11 specialized AI agents that collaborate through structured BikeLane workflows to build software — each with a defined role, quality gates, and automatic handoffs.

Pick the path that matches your situation:

| You are... | Path |
|------------|------|
| Joining a project that already uses Pennyfarthing | [Path A: Join an existing project](#path-a-join-an-existing-project) |
| Adding Pennyfarthing to your own project | [Path B: Set up a new project](#path-b-set-up-a-new-project) |
| Contributing to the Pennyfarthing framework itself | [Path C: Framework development](#path-c-framework-development-dogfooding) |

> **Already set up?** Jump to [Your First Work Session](#your-first-work-session).
>
> **Want the 2-minute version?** See the [What Is Pennyfarthing?](../pennyfarthing-dist/guides/what-is-pennyfarthing.md) quick reference.

---

## Prerequisites

| Requirement | Why |
|-------------|-----|
| **Python 3.11+** | Primary runtime for the `pf` CLI |
| **Git** | Branch management (Pennyfarthing creates feature branches for you) |
| **Claude Code CLI** | The AI coding assistant Pennyfarthing orchestrates |
| **GitHub CLI (`gh`)** | Authentication for the private repo (`brew install gh && gh auth login`) |

**Optional:**

| Tool | Why |
|------|-----|
| **yq** | YAML processing (`brew install yq`) |
| **jq** | JSON processing (`brew install jq`) |
| **Node.js 18+** | Only needed for Frame visual dashboards — `pf init` installs this if needed |

---

## Path A: Join an existing project

Someone on your team already ran `/pf-setup`. You just need the CLI.

### 1. Install

```bash
# Pick one:
pipx install "git+https://github.com/slabgorb/pennyfarthing.git"
# or: uv tool install "pennyfarthing-scripts @ git+https://github.com/slabgorb/pennyfarthing.git"
# or: curl -fsSL https://raw.githubusercontent.com/slabgorb/pennyfarthing/main/pennyfarthing-dist/scripts/install.sh | bash
```

> See [Alternative installs](#alternative-installs) for more options.

### 2. Clone and go

```bash
git clone git@github.com:your-org/your-project.git
cd your-project
claude
```

On your first Claude Code session, the project's committed `bootstrap.sh` hook fires automatically. It detects that `.pennyfarthing/` needs initialization, runs `pf init`, and sets everything up. You'll see agents, themes, and workflows immediately.

If `pf` isn't installed when the bootstrap runs, it will attempt to install it via brew, uv, or pipx automatically.

### 3. Verify

```bash
pf doctor
```

That's it. Jump to [Your First Work Session](#your-first-work-session).

---

## Path B: Set up a new project

You're bringing Pennyfarthing into a repo for the first time.

### 1. Authenticate and install

```bash
# Authenticate with GitHub (required — private repo)
gh auth login

# Install the CLI (pick one)
pipx install "git+https://github.com/slabgorb/pennyfarthing.git"
# or: uv tool install "pennyfarthing-scripts @ git+https://github.com/slabgorb/pennyfarthing.git"
```

> See [Alternative installs](#alternative-installs) for more options.

### 2. Initialize your project

```bash
cd your-project
pf init
```

This is idempotent (safe to run multiple times) and creates:

| Created | Purpose |
|---------|---------|
| `.pennyfarthing/` | Runtime framework — agents, guides, personas, scripts, workflows |
| `.pennyfarthing/sidecars/` | Agent learning files (local, writable) |
| `.pennyfarthing/config.local.yaml` | Theme, display modes, permissions |
| `.claude/commands/` | Slash commands for Claude Code (e.g., `/pf-work`) |
| `.claude/skills/` | Multi-step skills for agents |
| `.claude/settings.local.json` | Claude Code hooks for agent workflows |
| `sprint/` | Sprint tracking YAML |
| `.session/` | Active work session files |

### 3. Interactive setup

Start Claude Code in your project directory, then run:

```
/pf-setup
```

This walks you through 11 interactive steps:

1. **Project discovery** — detects git repos, tech stack, build/test commands
2. **Clone subrepos** — optionally clone related repositories
3. **repos.yaml** — generates multi-repo topology config
4. **CLAUDE.md** — creates project-specific agent instructions
5. **shared-context.md** — populates project context for all agents
6. **Task runner** — creates justfile for cross-repo commands
7. **Theme selection** — pick a persona theme (100 themes bundled)
8. **Theme packs** — optionally install additional theme plugins
9. **Jira integration** — optional bidirectional sprint tracking
10. **GUI setup** — optionally install Frame visual dashboard
11. **Validation** — confirms everything is configured correctly

> `pf init` creates the directory structure. `/pf-setup` configures it interactively inside Claude Code.

### 4. Verify

```bash
pf doctor
```

You should see all checks passing:

```
[OK] python_install: pf CLI found on PATH
[OK] pennyfarthing_dir: .pennyfarthing/ exists
[OK] config_file: config.local.yaml valid
[OK] settings_hooks: Settings hooks present
[OK] bootstrap: Bootstrap hook configured
[OK] content_dirs: All content directories present
[OK] commands: 37 pf-* commands found
[OK] skills: 22 pf-* skills found
[OK] theme: Theme: discworld
```

If anything fails, run `pf doctor --fix` to auto-repair.

### 5. Commit the setup

After `/pf-setup` completes, commit the generated files so teammates can use [Path A](#path-a-join-an-existing-project):

```bash
git add .pennyfarthing/ .claude/ sprint/ .session/
git commit -m "feat: add Pennyfarthing agent orchestration"
```

Now jump to [Your First Work Session](#your-first-work-session).

---

## Path C: Framework development (dogfooding)

You're contributing to Pennyfarthing itself using the orchestrator repo.

### 1. Clone the orchestrator

```bash
git clone git@github.com:slabgorb/orc-penny.git && cd orc-penny
```

This repo contains `pennyfarthing/` as an inlined subrepo with its own git history.

### 2. Setup

```bash
just setup
```

This clones `pennyfarthing/` if missing, installs all dependencies (pnpm + Python), builds packages, and installs the `pf` CLI in editable mode from the local source.

**Prerequisites:** Python 3.11+, Node 18+, [pnpm](https://pnpm.io/) 9+, [just](https://github.com/casey/just), Claude Code CLI, Git SSH access to `slabgorb`.

### 3. Launch

```bash
just claude       # starts Claude Code with OTEL telemetry pre-configured
/guided-tour      # optional interactive walkthrough
```

### Key differences from consumer projects

| | Consumer project | Orchestrator (dogfooding) |
|---|---|---|
| **`.pennyfarthing/`** | Standalone files from `pf init` | Symlinks to `pennyfarthing/pennyfarthing-dist/` |
| **Edits to agents/guides/workflows** | Not recommended | Edit in `pennyfarthing/pennyfarthing-dist/`, changes are live |
| **Git repos** | One repo | Two repos — orchestrator (`main`) and framework (`develop`) |
| **Install method** | `pipx install` / `uv tool install` | `just setup` (editable install) |
| **Framework changes** | Receive via `pipx upgrade` / `uv tool upgrade` | Commit directly to `pennyfarthing/` |

> See the [orchestrator README](https://github.com/slabgorb/orc-penny) for the full two-repo workflow.

---

## Alternative installs

Multiple ways to install the `pf` CLI:

```bash
# Auto-detect — tries uv, pipx, pip in order
curl -fsSL https://raw.githubusercontent.com/slabgorb/pennyfarthing/main/pennyfarthing-dist/scripts/install.sh | bash

# With pipx (recommended — isolated environment)
pipx install "git+https://github.com/slabgorb/pennyfarthing.git"

# With uv (fastest)
uv tool install "pennyfarthing-scripts @ git+https://github.com/slabgorb/pennyfarthing.git"

# With pip (last resort — installs into current environment)
pip install "git+https://github.com/slabgorb/pennyfarthing.git"
```

> **Note:** The Python package name is `pennyfarthing-scripts`. The installed CLI command is `pf`.

If the installer puts `pf` in `~/.local/bin` and it's not on your PATH:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

Add that line to your `~/.zshrc` or `~/.bashrc` to make it permanent.

Verify with `pf --version` — you should see `pf, version 12.6.2` (or later).

---

## Core Concepts

### Agents

11 specialized agents, each responsible for one part of the development process:

| Agent | Command | Role |
|-------|---------|------|
| **SM** (Scrum Master) | `/pf-sm` | Story setup, session management, completion |
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

Each agent stays in its lane — the SM never writes code, the Dev never does reviews. This separation makes each agent deeply specialized.

### Workflows

A **workflow** defines which agents participate and in what order.

**Phased workflows** (agents hand off automatically):

| Workflow | Flow | Best For |
|----------|------|----------|
| `tdd` | SM → TEA → Dev → Reviewer → SM | Features with tests |
| `bdd` | SM → UX → TEA → Dev → Reviewer → SM | User-facing features |
| `trivial` | SM → Dev → Reviewer → SM | Small fixes, chores |
| `agent-docs` | SM → Orchestrator → Tech Writer → SM | Documentation updates |
| `patch` | Dev → Reviewer → SM | Interrupt-driven bug fixes |

**Stepped workflows** (you advance through steps manually):

| Workflow | Best For |
|----------|----------|
| `architecture` | System design documents |
| `release` | Version releases |
| `research` | Technical or domain research |
| `prd` | Product requirements |

View all: `pf workflow list`

### Gates

Between workflow phases, **gates** check quality before allowing the handoff:

```
SM (setup) ──gate──→ TEA (red) ──gate──→ Dev (green) ──gate──→ Reviewer ──gate──→ SM (finish)
```

Gates enforce standards automatically — tests must be written before implementation starts, code must pass review before merging. You don't manage gates directly; they run as part of the handoff.

### Sessions

When you start working on a story, Pennyfarthing creates a **session file** at `.session/{story-id}-session.md`. This tracks:

- Current phase and active agent
- Assessments from each completed phase
- Branch names and Jira keys

If you restart Claude Code mid-story, the session file lets agents pick up where they left off.

### Personas and Themes

Each agent takes on a **persona** — a fictional character that shapes their communication style. Personas are grouped into **themes**:

```bash
pf theme list          # See all 100 bundled themes
pf theme set discworld # Switch themes
pf theme show          # Preview current theme's characters
```

Themes are cosmetic — they change personality, not capability. Switch anytime.

---

## Your First Work Session

The simplest way to start:

```
/pf-work
```

This activates the SM agent, who checks for in-progress work or presents the backlog. Here's what a typical TDD session looks like:

### 1. SM sets up the story

The SM reads the sprint backlog, helps you pick a story, claims it in Jira, creates a feature branch, and writes the session file. Then it hands off.

### 2. TEA writes failing tests

The TEA agent reads the session for context and writes test cases that define expected behavior — before any implementation exists. All tests fail (red phase).

### 3. Dev makes tests pass

The Dev reads the failing tests and implements the minimum code to make them pass (green phase).

### 4. Reviewer checks the work

The Reviewer reads the PR, verifies test coverage, checks for issues, and either approves or requests changes.

### 5. SM finishes

The SM archives the session, updates Jira, and the story is done.

### Resuming work

If you close Claude Code mid-story, run `/pf-work` again. The SM reads the session file and routes you to whichever agent should be active.

You can also activate a specific agent directly: `/pf-dev`, `/pf-tea`, `/pf-reviewer`, etc.

---

## Display Modes

Pennyfarthing works in any terminal. Optional dashboards add real-time visibility into what agents are doing.

| Mode | How to Start | What You Get |
|------|-------------|--------------|
| **CLI only** | `claude` | Agents in your terminal, no dashboard |
| **Frame TUI** | `pf frame start` | Terminal dashboard alongside Claude Code |
| **Frame GUI** | `just gui` + `just claude` | Dashboard in browser, Claude in terminal |

**Start with CLI mode.** It requires no extra setup and gives you the full agent workflow. Frame adds visual panels (sprint boards, workflow state, git diffs, agent portraits) but is optional.

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

## Quick Command Reference

### Getting started

| Command | Purpose |
|---------|---------|
| `/pf-work` | Smart entry — resume or start work |
| `/pf-help` | Context-aware help |
| `/pf-sprint status` | Sprint overview |
| `/pf-sprint backlog` | Available stories |
| `/pf-guided-tour` | Interactive walkthrough of all features |

### Agents

| Command | Purpose |
|---------|---------|
| `/pf-sm` | Scrum Master — story setup and finish |
| `/pf-tea` | Test Engineer — write failing tests |
| `/pf-dev` | Developer — implement features |
| `/pf-reviewer` | Reviewer — code review and merge |
| `/pf-architect` | Architect — design guidance |
| `/pf-pm` | Product Manager — planning |

### CLI

| Command | Purpose |
|---------|---------|
| `pf doctor` | Health check |
| `pf doctor --fix` | Auto-repair issues |
| `pf theme list` | Browse themes |
| `pf theme set <name>` | Change active theme |
| `pf sprint status` | Sprint overview |
| `pf validate` | Run all validators |
| `pf workflow list` | Show all workflows |
| `pf frame start` | Launch Frame dashboard |
| `pf package list` | Show installable theme plugins (if any) |

---

## Updating

```bash
# pipx
pipx upgrade pennyfarthing-scripts

# uv
uv tool upgrade pennyfarthing-scripts

# pip
pip install --upgrade "pennyfarthing-scripts @ git+https://github.com/slabgorb/pennyfarthing.git"
```

After upgrading the CLI, re-initialize your project to pick up new commands and skills:

```bash
pf init
pf doctor
```

---

## Troubleshooting

### `pf` command not found

If you installed with uv or pipx, `~/.local/bin` may not be on your PATH:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

Add to your shell profile (`~/.zshrc` or `~/.bashrc`) to make permanent.

### Health check failures

```bash
pf doctor --fix
```

This auto-repairs missing directories, broken symlinks, and stale config.

### Agent doesn't recognize my project

Run `/pf-setup` inside Claude Code to regenerate project context interactively.

### Wrong agent is active

Activate the correct agent directly:

```
/pf-sm        # Go back to Scrum Master
/pf-dev       # Jump to Developer
```

The agent reads the session file and determines what phase it should be in.

### Fresh reinstall

```bash
rm -rf .pennyfarthing/ .claude/commands/ .claude/skills/  # Remove project files
pipx reinstall pennyfarthing-scripts  # Reinstall CLI (or your original install method)
pf init                               # Re-initialize project
```

---

## Next Steps

- **[What Is Pennyfarthing?](../pennyfarthing-dist/guides/what-is-pennyfarthing.md)** — Concept quick reference
- **[BikeLane Workflows](../pennyfarthing-dist/guides/bikelane.md)** — All workflow types and customization
- **[Frame Guide](../pennyfarthing-dist/guides/frame.md)** — Dashboard setup and panels
- **[CHANGELOG](../CHANGELOG.md)** — Release history
