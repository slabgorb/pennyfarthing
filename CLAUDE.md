# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Pennyfarthing is a Claude Code agent orchestration framework with TDD workflow and themed personas. It coordinates multiple AI agents (SM, TEA, Dev, Reviewer) through story-driven development cycles.

**Version:** 4.0.0
**Node:** >=18.0.0
**Type:** ES module with TypeScript

## Build Commands

```bash
npm run build     # TypeScript compilation (tsc)
npm run dev       # Watch mode (tsc --watch)
npm run clean     # Remove dist/
npm test          # Node.js native test runner
npm run lint      # ESLint (requires separate install)
```

## Architecture

### Directory Structure

```
pennyfarthing-dist/      # Single source of truth for all definitions
├── agents/              # 10 main agents + 13 official subagents (consolidated)
├── commands/            # 41 slash commands
├── guides/              # Behavior guides
├── skills/              # 11 knowledge domains
├── personas/            # Themed agent personas (101 themes)
└── scripts/             # Utility scripts

src/                     # TypeScript CLI source
├── cli/                 # Commander-based CLI
│   ├── commands/        # init, update, doctor, uninstall, version
│   └── utils/           # logger, prompts, manifest, files

packages/cyclist/        # Cyclist visual terminal (monorepo package)
├── src/public/js/       # Frontend JavaScript components
├── tests/               # Vitest tests (B-*.test.ts naming)
└── package.json         # Cyclist-specific dependencies

.claude/                 # Project's own Pennyfarthing setup (symlinks to pennyfarthing-dist/)
sprint/                  # Sprint tracking (current-sprint.yaml, archive/, context/)
.pennyfarthing/          # Pennyfarthing runtime data
├── sidecars/            # Agent learning files (patterns, gotchas, decisions per agent)
.session/                # Active work sessions ({story-id}-session.md)
```

### Core Principles

1. **Single Source of Truth** - All agent/command/skill definitions live in `pennyfarthing-dist/`, accessed via symlinks
2. **State Detection** - Agents detect workflow state from `.session/{story-id}-session.md`, not explicit commands
3. **Subagent Delegation** - Opus handles reasoning; Haiku subagents handle mechanical work (tests, git, status)
4. **Lazy Context Loading** - Context loaded only when needed per agent type
5. **Tracked Build Output** - `dist/` is committed (not gitignored) because we serve directly from GitHub

### TDD Flow

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
- `generic-handoff` - Workflow-driven phase transitions (TEA/Dev/Reviewer)
- `reviewer-preflight` - Gather review data before critical analysis

### Handoff Protocol

1. Agent completes work
2. Spawns appropriate subagent via Task tool
3. Subagent updates session file with structured result
4. Next agent reads state and continues

## Key Files

| File | Purpose |
|------|---------|
| `pennyfarthing-dist/agents/*.md` | Agent and subagent definitions (consolidated) |
| `.pennyfarthing/config.local.yaml` | Theme selection (use `/theme` skill) |
| `sprint/current-sprint.yaml` | Active sprint and story tracking |
| `.session/{story-id}-session.md` | Active work context |
| `scripts/utils/` | Resilience utilities (retry.sh, checkpoint.sh, repo-scan.sh) |

## CLI Commands (for users)

```bash
pennyfarthing init [name]    # Initialize in a project
pennyfarthing update         # Update to latest version
pennyfarthing doctor         # Check installation health (--fix to auto-repair)
pennyfarthing uninstall      # Remove from project
```

## Persona System

Agents use themed personas for character and style. See `.claude/skills/theme/skill.md` for theme management.
