# CLAUDE.md

This file provides guidance to Claude Code when working on the Pennyfarthing framework.

## Project Overview

Pennyfarthing is a Claude Code agent orchestration framework with customizable BikeLane workflows and themed personas. This repo contains the framework source code - for using Pennyfarthing, see the orchestrator repo.

**Version:** 9.2.0

## Dogfooding Architecture

The orchestrator (`pennyfarthing-orchestrator`) **dogfoods** the framework by:

1. **Inlining the framework** - This repo lives at `pennyfarthing/` inside the orchestrator
2. **Being a Pennyfarthing project itself** - The orchestrator has `.pennyfarthing/` at its root
3. **Using the framework for its own development** - Agents, workflows, and Cyclist run from the orchestrator

```
pennyfarthing-orchestrator/          # The orchestrator (pf-2)
├── .pennyfarthing/                  # Pennyfarthing installation (symlinks to node_modules)
│   ├── config.local.yaml            # Theme selection, settings
│   ├── agents/ → node_modules/...   # Symlinked content
│   └── ...
├── pennyfarthing/                   # THIS REPO (inlined framework source)
│   ├── pennyfarthing-dist/          # Framework content (source of truth)
│   ├── packages/cyclist/            # Cyclist source code
│   └── ...
├── sprint/                          # Sprint tracking (orchestrator-level)
└── .session/                        # Work sessions (orchestrator-level)
```

**Key insight:** The `.pennyfarthing/` directory is at the **orchestrator root**, not inside the `pennyfarthing/` subdirectory. This means:

- **Project root for Cyclist:** `/path/to/pennyfarthing-orchestrator` (where `.pennyfarthing/` exists)
- **NOT:** `/path/to/pennyfarthing-orchestrator/pennyfarthing` (no `.pennyfarthing/` here)

### Running Cyclist in Web Mode (for debugging)

When debugging Cyclist UI from the framework source:

```bash
cd pennyfarthing/packages/cyclist
CYCLIST_PROJECT_DIR=/path/to/pennyfarthing-orchestrator npm run dev:web
```

The `CYCLIST_PROJECT_DIR` must point to the **orchestrator root** where `.pennyfarthing/` exists, not the `pennyfarthing/` subdirectory. Otherwise, `detectPennyfarthingProject()` will fail and APIs will return 404
**Node:** >=18.0.0
**Type:** ES module with TypeScript (pnpm monorepo)

## Build Commands

```bash
pnpm run build     # TypeScript compilation (tsc)
pnpm run dev       # Watch mode (tsc --watch)
pnpm run clean     # Remove dist/
pnpm test          # Node.js native test runner
pnpm run lint      # ESLint
```

## Directory Structure

```
pennyfarthing-dist/      # Published package content (single source of truth)
├── agents/              # 19 agent definitions
├── commands/            # 46 slash commands
├── guides/              # Behavior guides
├── skills/              # 23 knowledge domains
├── personas/            # Themed agent personas
│   └── themes/          # 102 persona themes
├── workflows/           # Workflow definitions
└── scripts/             # Utility scripts

packages/
├── core/                # Main package (@pennyfarthing/core)
│   └── src/cli/         # CLI commands (init, update, doctor, etc.)
└── cyclist/             # Visual terminal (Electron app)
    ├── src/             # Electron main/renderer + React components
    └── tests/           # Vitest tests (story-ID naming: 17-1-*.test.ts)

tests/                   # Framework tests
docs/                    # Framework documentation (not ADRs - those are in orchestrator)
```

## Development Workflow

After making changes:

```bash
pnpm run build            # Compile TypeScript
pnpm link                 # Update global link

# Test in orchestrator repo
cd ~/Projects/pennyfarthing-orchestrator
pennyfarthing doctor     # Verify installation
```

## Core Principles

1. **Single Source of Truth** - All definitions live in `pennyfarthing-dist/`
2. **Symlink-based Installation** - Consumers access content via `.pennyfarthing/` symlinks
3. **Subagent Delegation** - Opus for reasoning, Haiku for mechanical tasks
4. **Tracked Build Output** - `dist/` is committed (served from GitHub)

## BikeLane Workflows

| Type | Description | Examples |
|------|-------------|----------|
| **Phased** | Agent-driven with automatic handoffs | tdd, bdd, trivial |
| **Stepped** | Progressive disclosure with gates | prd, architecture |
| **Procedural** | Flexible agent-guided | brainstorming, code-review |

## CLI Commands

```
/new-work → SM → TEA → Dev → Reviewer → SM (finish)
```

| Agent | Role | Responsibilities |
|-------|------|------------------|
| SM | Scrum Master | Story setup, session management, completion |
| TEA | Test Engineer | Write failing tests (RED phase) |
| Dev | Developer | Implement to pass tests (GREEN phase) |
| Reviewer | Code Reviewer | Adversarial review, approve/reject |

### Official Subagent System

Subagents use Claude Code's Task tool with `subagent_type`. Key subagents:
- `workflow-status-check` - Detect current workflow state
- `generic-sm-setup` - Research backlog (MODE=research) or setup story (MODE=setup)
- `generic-sm-finish` - Preflight checks (PHASE=preflight) or execute finish (PHASE=execute)
- `sm-handoff` - SM→TEA/Dev handoff with Jira/branch verification
- `testing-runner` - Config-driven test execution
- `handoff` - Workflow-driven phase transitions (TEA/Dev/Reviewer)
- `reviewer-preflight` - Gather review data before critical analysis

### Handoff Protocol

1. Agent completes work
2. Spawns appropriate subagent via Task tool
3. Subagent updates session file with structured result
4. Next agent reads state and continues

### BMAD 6.0 Compatibility

Pennyfarthing provides full BMAD 6.0 workflow import support:
- Stepped workflows with tri-modal execution (create/validate/edit)
- Custom mode support beyond standard three
- Migration script: `pennyfarthing-dist/scripts/migrate-bmad-workflow.mjs`

## Script Organization

Pennyfarthing has THREE script locations with distinct purposes:

| Location | Ships to Users | Purpose |
|----------|----------------|---------|
| `scripts/` | ❌ No | Meta scripts for framework development |
| `pennyfarthing-dist/scripts/` | ✅ Yes | Distributed bash/JS for user workflows |
| `pennyfarthing_scripts/` | ✅ Yes | Distributed Python package |

### Decision Tree: Where Should My Script Go?

```
Is this script for Pennyfarthing development ONLY?
├── YES → Is it Python?
│   ├── YES → scripts/*.py (use .venv with GPU deps)
│   └── NO → scripts/*.sh or *.js
└── NO (ships to users) → Is it Python?
    ├── YES → pennyfarthing_scripts/
    └── NO → pennyfarthing-dist/scripts/<category>/
```

### Meta Scripts (`scripts/`)

**NOT distributed** - only available in this repo:
- `deploy.sh` - Release Pennyfarthing (version bump, tag, push)
- `benchmark-runner.{sh,js}` - Run persona benchmarks
- `job-fair-*.sh` - Job Fair evaluations
- `aggregate-benchmark-stats.{sh,js}` - Benchmark aggregation
- And other development/CI tools

### Distributed Scripts (`pennyfarthing-dist/scripts/`)

Shipped via npm, available in user projects:
- `sprint/` - Sprint management
- `story/` - Story operations
- `jira/` - Jira integration
- `git/` - Git operations (release.sh)
- `portraits/` - Portrait generation (requires GPU setup)
- `core/` - Infrastructure and phase-check utilities
- `lib/` - Shared libraries (find-root.sh, etc.)
- And more...

### Distributed Python (`pennyfarthing_scripts/`)

Shipped via npm, available in user projects:
- `jira/` - Jira CLI wrapper
- `sprint/` - Sprint management
- `story/` - Story operations
- `brownfield/` - Codebase analysis
- Plus hooks (bellmode_hook.py, pretooluse_hook.py, etc.)

### Important: No Duplicates

Scripts must exist in ONLY ONE location. Build-time validation prevents duplication.

The `/release --bump` command only works from this repo (requires `scripts/deploy.sh`).

### Script Path Resolution

There are TWO patterns depending on script type:

**Pattern 1: Distributed Scripts (pennyfarthing-dist/scripts/)**

Consumer-facing scripts use `.pennyfarthing/` marker discovery:

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
source "$SCRIPT_DIR/../lib/find-root.sh"
# PROJECT_ROOT is now set
```

`find-root.sh` walks up from `$PWD` looking for `.pennyfarthing/` directory. This works
because consumer projects always have `.pennyfarthing/` at their root (created by `pennyfarthing init`).

**Pattern 2: Framework Build Scripts (scripts/)**

Build-only scripts use BASH_SOURCE-based resolution since they know their position:

```bash
#!/usr/bin/env bash
set -euo pipefail

# Framework build script - derive root from script location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"
export PROJECT_ROOT
```

**Why Two Patterns?**

- Distributed scripts run in consumer projects where `.pennyfarthing/` exists at project root
- Build scripts run during framework development where there may be no `.pennyfarthing/` in the framework directory (e.g., when framework is inlined in an orchestrator)

**Environment Override:**

If `PROJECT_ROOT` is already set, `find-root.sh` respects it as an override.

## Key Files

| File | Purpose |
|------|---------|
| `pennyfarthing-dist/agents/*.md` | Agent and subagent definitions (consolidated) |
| `.pennyfarthing/config.local.yaml` | Theme selection (use `/theme` skill) |
| `sprint/current-sprint.yaml` | Active sprint and story tracking |
| `.session/{story-id}-session.md` | Active work context |
| `scripts/generate-skill-docs.sh` | Framework build script (generates SKILLS.md) |

## CLI Commands (for users)

The CLI helps users install/manage Pennyfarthing in their projects:

```bash
pennyfarthing init       # Initialize in a project
pennyfarthing update     # Update symlinks after package update
pennyfarthing doctor     # Check installation health (--fix to repair)
pennyfarthing uninstall  # Remove from project
```

## Cyclist (Visual Terminal)

Electron-based visual terminal for agent orchestration with a React UI.

**Architecture (v9.0+):**
- **Dockview panels** - 11 draggable panels (ADR-0019), replacing hand-rolled system
- **React components** - `src/public/components/` for all UI
- **Tool visualization** - `ToolCallBlock.tsx`, `ToolStack.tsx` for rich tool display

**Key codenames:**
- **WheelHub** - Central server (`packages/cyclist/src/server.ts`)
- **TirePump** - Context clearing system
- **JobFair** - Character benchmarking

**Panel components** (`src/public/components/panels/`):
- `MessagePanel` - Sacred center, cannot be closed/moved
- `ChangedPanel`, `DiffsPanel` - File change tracking
- `SprintPanel`, `ProgressPanel`, `BikeLanePanel` - Workflow tracking
- `AcceptanceCriteriaPanel` - Story acceptance criteria
- `SettingsPanel`, `DebugPanel`, `GitPanel`, `BackgroundPanel`

**Key React components:**
- `DockviewWorkspace.tsx` - Main layout with dockview-react
- `MessageView.tsx` - Conversation display with streaming
- `ToolCallBlock.tsx` - Tool use with intent summaries
- `ToolStack.tsx` - Grouped consecutive tool calls
- `QuickActions.tsx` - CYCLIST marker detection

## Critical Implementation Rules

1. **Modify `pennyfarthing-dist/`** - this is the source of truth
2. **Use `.js` extensions** in all relative TypeScript imports
3. **Return result objects** `{success, data?, error?}` instead of throwing
4. **Use Haiku for subagents** - never Opus for mechanical tasks
5. **Commit `dist/`** alongside `src/` changes
6. **Scripts use `.pennyfarthing/` paths** - never `pennyfarthing-dist/` in runtime scripts

## Testing Changes

Framework changes should be tested in the orchestrator repo:

```bash
# In pennyfarthing (framework)
pnpm run build && pnpm link

# In pennyfarthing-orchestrator (usage)
pennyfarthing doctor
# Then test workflows, agents, etc.
```

## Publishing

```bash
pnpm version patch|minor|major
pnpm publish
```

Consumers update via `npm update @pennyfarthing/core && pennyfarthing update`.
