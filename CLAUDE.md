# CLAUDE.md

This file provides guidance to Claude Code when working on the Pennyfarthing framework.

## Project Overview

Pennyfarthing is a Claude Code agent orchestration framework with customizable BikeLane workflows and themed personas. This repo contains the framework source code - for using Pennyfarthing, see the orchestrator repo.

**Version:** 8.1.0
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
├── skills/              # 22 knowledge domains
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

### Script Path Resolution (BASH_SOURCE-First)

All distributed bash scripts MUST derive paths from `BASH_SOURCE`, not `$PWD`. A script
knows its position in the directory tree, so it can derive PROJECT_ROOT directly.

**Standard Pattern:**

```bash
#!/usr/bin/env bash
set -euo pipefail

# Self-locate: derive PROJECT_ROOT from this script's position
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
source "$SCRIPT_DIR/../lib/find-root.sh"
# PROJECT_ROOT is now set
```

**How It Works:**

The shared library (`find-root.sh`) uses SCRIPT_DIR to:
1. Resolve symlinks to find the real script location
2. Extract the package root from the path (scripts are in `pennyfarthing-dist/scripts/<category>/`)
3. Determine context: framework dev (package root = project root) vs consumer (walk up from node_modules)

**Why This Works:**

- Scripts in `pennyfarthing-dist/scripts/misc/` are always 3 levels below the package root
- `pwd -P` resolves symlinks, so even when accessed via `.pennyfarthing/scripts/` symlink, we find the real path
- No reliance on `$PWD` means no confusion from nested repos or working directory

**Environment Override:**

If `PROJECT_ROOT` is already set (by Claude or explicitly), it's respected as an override.

## Key Files

| File | Purpose |
|------|---------|
| `pennyfarthing-dist/agents/*.md` | Agent and subagent definitions (consolidated) |
| `.pennyfarthing/config.local.yaml` | Theme selection (use `/theme` skill) |
| `sprint/current-sprint.yaml` | Active sprint and story tracking |
| `.session/{story-id}-session.md` | Active work context |
| `pennyfarthing-dist/scripts/utils/` | Utility scripts (generate-skill-docs.sh) |

## CLI Commands (for users)

The CLI helps users install/manage Pennyfarthing in their projects:

```bash
pennyfarthing init       # Initialize in a project
pennyfarthing update     # Update symlinks after package update
pennyfarthing doctor     # Check installation health (--fix to repair)
pennyfarthing uninstall  # Remove from project
```

## Cyclist (Visual Terminal)

Electron-based visual terminal for agent orchestration.

**Key codenames:**
- **WheelHub** - Central server (`packages/cyclist/src/server.ts`)
- **TirePump** - Context clearing system
- **JobFair** - Character benchmarking

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
