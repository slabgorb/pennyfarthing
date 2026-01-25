# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Pennyfarthing is a Claude Code agent orchestration framework with customizable BikeLane workflows and themed personas. It coordinates AI agents through configurable development cycles - from TDD to planning workflows to BMAD-compatible stepped processes.

**Version:** 7.6.1
**Node:** >=18.0.0
**Type:** ES module with TypeScript (pnpm monorepo)

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
├── agents/              # 19 agent definitions total
├── commands/            # 45 slash commands
├── guides/              # Behavior guides
├── skills/              # 22 knowledge domains
├── personas/            # Themed agent personas (102 themes)
└── scripts/             # Utility scripts

src/                     # TypeScript CLI source
├── cli/                 # Commander-based CLI
│   ├── commands/        # init, update, doctor, uninstall, version
│   └── utils/           # logger, prompts, manifest, files

packages/cyclist/        # Cyclist visual terminal (monorepo package)
├── src/public/js/       # Frontend JavaScript components
├── tests/               # Vitest tests (B-*.test.ts naming)
└── package.json         # Cyclist-specific dependencies

.claude/                 # Claude Code discovery (minimal)
├── commands/            # → symlinks to pennyfarthing-dist/commands
├── skills/              # → symlinks to pennyfarthing-dist/skills
└── project/             # Project-specific customizations

.pennyfarthing/          # Pennyfarthing content (main location)
├── agents/              # → symlink to pennyfarthing-dist/agents
├── guides/              # → symlink to pennyfarthing-dist/guides
├── personas/            # → symlink to pennyfarthing-dist/personas
├── scripts/             # → symlink to pennyfarthing-dist/scripts
├── sidecars/            # Agent learning files (patterns, gotchas, decisions)
└── config.local.yaml    # Theme configuration

sprint/                  # Sprint tracking (current-sprint.yaml, archive/, context/)
.session/                # Active work sessions ({story-id}-session.md)
```

### Core Principles

1. **Single Source of Truth** - All agent/command/skill definitions live in `pennyfarthing-dist/`, accessed via symlinks
2. **State Detection** - Agents detect workflow state from `.session/{story-id}-session.md`, not explicit commands
3. **Subagent Delegation** - Opus handles reasoning; Haiku subagents handle mechanical work (tests, git, status)
4. **Lazy Context Loading** - Context loaded only when needed per agent type
5. **Tracked Build Output** - `dist/` is committed (not gitignored) because we serve directly from GitHub

### BikeLane Workflows

BikeLane is the umbrella for all workflow types in Pennyfarthing. Use `/workflow list` to see all available workflows, `/workflow start <name>` to begin.

**BikeLane Workflow Types:**

| Type | Description | Examples |
|------|-------------|----------|
| **Phased** | Agent-driven development cycles with automatic handoffs | tdd, bdd, trivial, agent-docs |
| **Stepped** | Progressive disclosure with user gates, BMAD 6.0 compatible | prd, architecture, research, sprint-planning, epics-and-stories, product-brief, project-context, implementation-readiness, ux-design, quick-dev, quick-spec |
| **Procedural** | Flexible agent-guided processes | brainstorming, code-review, dev-story, retrospective |

#### Example: TDD Workflow

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
- `sm-setup` - Research backlog (MODE=research) or setup story (MODE=setup)
- `sm-finish` - Preflight checks (PHASE=preflight) or execute finish (PHASE=execute)
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

```bash
pennyfarthing init [name]    # Initialize in a project
pennyfarthing update         # Update to latest version
pennyfarthing doctor         # Check installation health (--fix to auto-repair)
pennyfarthing uninstall      # Remove from project
```

## Persona System

Agents use themed personas for character and style. See `.claude/skills/theme/skill.md` for theme management.

## Jira Integration

Pennyfarthing integrates with Jira for sprint and story tracking. Key capabilities:

### Epic Auto-Creation (PR #315)
- SM setup automatically creates Jira epics when a local epic lacks a `jira` field
- Epic creation uses `packages/core/src/jira/jira-epic-creation.ts`
- Updates sprint YAML atomically with new Jira key
- Enables seamless story workflow without manual Jira setup

### Bidirectional Sync (PR #322)
- `jira-bidirectional-sync.mjs` syncs status, points, and stories between sprint YAML and Jira
- Dry-run mode shows changes before applying
- Supports both YAML→Jira and Jira→YAML updates
- Handles new stories, status transitions, and story point updates

### Sprint Integration (PR #316, #317)
- Sprint YAML references Jira sprint ID for membership queries
- Status checks query Jira sprint for velocity metrics
- Scripts detect stories in Jira but missing from YAML

See `pennyfarthing-dist/skills/jira/skill.md` for detailed CLI commands and workflows.

## Cyclist Internal Codenames

The Cyclist visual terminal uses bicycle-themed internal codenames:

| Codename | Component | Description |
|----------|-----------|-------------|
| **WheelHub** | `packages/cyclist/src/server.ts` | Central coordination server - the hub where all communication converges (API, WebSocket, OTLP) |
| **TirePump** | Context clearing system | The complete context clear-and-reload system - clears the session, resets stats, and reloads the current agent when context runs low |
| **JobFair** | Character benchmarking | Discovers which theme characters excel at each role by running them against benchmarks - finds hidden talents across the cast |

## Architecture Decision Records

Key architectural decisions are documented in `docs/adr/`. Review these before making significant changes:

| ADR | Decision | Impact |
|-----|----------|--------|
| [0005](docs/adr/0005-single-source-of-truth-symlinks.md) | Single Source of Truth via Symlinks | Never modify `.claude/` or `.pennyfarthing/` symlinked dirs |
| [0006](docs/adr/0006-state-detection-pattern.md) | State Detection Pattern | Agents detect state from session files, not explicit commands |
| [0007](docs/adr/0007-subagent-delegation-model.md) | Subagent Delegation (Opus/Haiku) | Use Haiku for mechanical tasks, Opus for reasoning |
| [0008](docs/adr/0008-result-object-error-handling.md) | Result Object Error Handling | Return `{success, error}`, don't throw exceptions |
| [0009](docs/adr/0009-session-file-coordination.md) | Session File Coordination | Write assessment BEFORE spawning handoff subagent |
| [0010](docs/adr/0010-esm-module-requirements.md) | ESM Module Requirements | Always use `.js` extension in relative imports |

## Critical Implementation Rules

1. **Modify `pennyfarthing-dist/`**, not symlinked directories
2. **Use `.js` extensions** in all relative TypeScript imports
3. **Return result objects** `{success, data?, error?}` instead of throwing
4. **Write assessment BEFORE handoff** in session files
5. **Use Haiku for subagents** - never Opus for mechanical tasks
6. **Commit `dist/`** alongside `src/` changes (tracked build output)
7. **Detect state** from session files, never hardcode workflow state
