# CLAUDE.md

This file provides guidance to Claude Code when working on the Pennyfarthing framework.

## Project Overview

Pennyfarthing is a Claude Code agent orchestration framework with customizable BikeLane workflows and themed personas. This repo contains the framework source code - for using Pennyfarthing, see the orchestrator repo.

**Version:** 7.9.0
**Node:** >=18.0.0
**Type:** ES module with TypeScript (pnpm monorepo)

## Build Commands

```bash
npm run build     # TypeScript compilation (tsc)
npm run dev       # Watch mode (tsc --watch)
npm run clean     # Remove dist/
npm test          # Node.js native test runner
npm run lint      # ESLint
```

## Directory Structure

```
pennyfarthing-dist/      # Published package content (single source of truth)
├── agents/              # 19 agent definitions
├── commands/            # 45 slash commands
├── guides/              # Behavior guides
├── skills/              # 22 knowledge domains
├── personas/            # Themed agent personas (102 themes)
├── workflows/           # Workflow definitions
└── scripts/             # Utility scripts

packages/
├── core/                # Main package (@pennyfarthing/core)
│   └── src/cli/         # CLI commands (init, update, doctor, etc.)
└── cyclist/             # Visual terminal (Electron app)
    ├── src/public/js/   # Frontend components
    └── tests/           # Vitest tests (B-*.test.ts naming)

tests/                   # Framework tests
docs/                    # Framework documentation (not ADRs - those are in orchestrator)
```

## Development Workflow

After making changes:

```bash
npm run build            # Compile TypeScript
npm link                 # Update global link

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
- See `docs/bmad-compatibility-matrix.md` for details

## Key Files

| File | Purpose |
|------|---------|
| `pennyfarthing-dist/agents/*.md` | Agent and subagent definitions (consolidated) |
| `.pennyfarthing/config.local.yaml` | Theme selection (use `/theme` skill) |
| `sprint/current-sprint.yaml` | Active sprint and story tracking |
| `.session/{story-id}-session.md` | Active work context |
| `pennyfarthing-dist/scripts/utils/` | Resilience utilities (retry.sh, checkpoint.sh, repo-scan.sh) |

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
npm run build && npm link

# In pennyfarthing-orchestrator (usage)
pennyfarthing doctor
# Then test workflows, agents, etc.
```

## Publishing

```bash
npm version patch|minor|major
npm publish
```

Consumers update via `npm update @pennyfarthing/core && pennyfarthing update`.
