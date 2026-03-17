# Orchestrator Pattern

**Pattern Type:** Multi-Repo Coordination
**Agents Involved:** All agents (SM, Dev, TEA, Reviewer, DevOps)
**Coordination Mechanism:** Lightweight wrapper repo with `repos.yaml` topology and sprint tracking

## Problem Statement

Software projects frequently span multiple independent repositories with different languages, build systems, and branching strategies:

1. **Scattered Context:** Agents working across repos lack spatial awareness — they don't know which directories belong to which repo, what's safe to edit, or where symlinks point
2. **Conflicting Git Workflows:** A Go backend uses trunk-based development while a React frontend uses gitflow — agents default to wrong branch targets
3. **No Unified Sprint Tracking:** Work spanning multiple repos has no single place for sprint artifacts, session files, or architecture decisions
4. **Configuration Drift:** Each repo evolves independently, making it hard to maintain consistent agent behavior, hooks, and workflows across the project

Without an orchestrator, agents may:
- Commit to wrong branches or target wrong PR bases
- Edit symlinked files instead of their source
- Lose context when switching between subrepos
- Create sprint artifacts in inconsistent locations

## Solution

Create a **lightweight orchestrator repository** that wraps multiple independent subrepos. The orchestrator owns sprint tracking, session management, and documentation while each subrepo retains its own git history and branching strategy.

```
Orchestrator Repo (trunk-based, PRs → main)
    │
    ├── .pennyfarthing/          ← Framework runtime (flat copies or symlinks)
    │   ├── repos.yaml           ← Topology config (hand-maintained)
    │   └── config.local.yaml    ← Local settings (theme, bell, relay)
    │
    ├── sprint/                  ← Sprint tracking (owned by orchestrator)
    │   ├── current-sprint.yaml
    │   └── epic-*.yaml
    │
    ├── .session/                ← Active work sessions
    │   └── {story-id}-session.md
    │
    ├── docs/                    ← ADRs, conventions, planning
    │
    ├── subrepo-a/               ← Gitignored, own .git, own branch strategy
    │   └── ...
    │
    ├── subrepo-b/               ← Gitignored, own .git, own branch strategy
    │   └── ...
    │
    ├── CLAUDE.md                ← Project instructions
    ├── justfile                 ← Task runner
    └── .gitignore               ← Ignores subrepo dirs
```

```
                    ┌─────────────────────────┐
                    │    Orchestrator Repo     │
                    │   (trunk-based → main)   │
                    │                         │
                    │  sprint/  .session/     │
                    │  docs/    CLAUDE.md     │
                    │  .pennyfarthing/        │
                    └────────┬────────────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
        ┌───────────┐ ┌───────────┐ ┌───────────┐
        │ subrepo-a │ │ subrepo-b │ │ subrepo-c │
        │ (gitflow) │ │ (trunk)   │ │ (gitflow) │
        │ → develop │ │ → main    │ │ → develop │
        └───────────┘ └───────────┘ └───────────┘
```

## Implementation

### 1. Directory Structure

The orchestrator repo contains only coordination artifacts. Subrepos are cloned as subdirectories and gitignored.

```
my-project-orc/
├── .pennyfarthing/
│   ├── repos.yaml              # Topology — agents read this for spatial awareness
│   ├── config.local.yaml       # Theme, bell_mode, relay_mode
│   ├── agents/                 # Framework agents (copies or symlinks)
│   ├── scripts/                # Framework scripts
│   ├── sidecars/               # Local agent learning files (NOT symlinked)
│   └── ...
├── sprint/
│   ├── current-sprint.yaml     # Sprint index
│   └── epic-*.yaml             # Epic shards
├── .session/
│   └── STORY-123-session.md    # Active work context
├── docs/
│   └── adr/                    # Architecture Decision Records
├── my-api/                     # ← Gitignored subrepo
├── my-ui/                      # ← Gitignored subrepo
├── CLAUDE.md
├── justfile
└── .gitignore
```

### 2. repos.yaml Schema

The `repos.yaml` file at `.pennyfarthing/repos.yaml` defines the complete project topology. Agents read this at prime time to understand the workspace.

```yaml
# .pennyfarthing/repos.yaml
repos:
  orchestrator:
    path: .
    type: orchestrator
    description: Project coordination and sprint management
    language: javascript          # or: none (if orchestrator has no code)
    branch_strategy: trunk-based
    default_branch: main
    owns:
      - sprint/**
      - docs/**
      - .session/**
      - justfile
    never_edit:
      - node_modules/**
      - .pennyfarthing/agents/**    # Symlinked or copied framework dirs
      - .pennyfarthing/commands/**
      - .pennyfarthing/guides/**
      - .pennyfarthing/scripts/**
    symlinks: {}                    # Consumer mode: no symlinks (flat copies)
    ui_layer: none

  my-api:
    path: my-api
    type: api
    description: Backend API service
    language: go
    test_command: go test ./...
    build_command: go build ./...
    lint_command: golangci-lint run
    branch_strategy: trunk-based
    default_branch: main
    owns:
      - "**/*.go"
      - go.mod
      - go.sum
    never_edit:
      - vendor/**
    symlinks: {}
    ui_layer: none

  my-ui:
    path: my-ui
    type: ui
    description: Frontend application
    language: typescript
    test_command: npm test
    build_command: npm run build
    lint_command: npm run lint
    branch_strategy: gitflow
    default_branch: develop
    owns:
      - src/**
      - public/**
    never_edit:
      - node_modules/**
      - dist/**
    symlinks: {}
    ui_layer: react
    components_path: src/components
```

**Topology fields:**

| Field | Required | Description |
|-------|----------|-------------|
| `path` | Yes | Relative path from orchestrator root |
| `type` | Yes | `orchestrator`, `api`, `ui`, `service`, `library`, `framework`, `connector`, `plugin` |
| `description` | Yes | Human-readable purpose |
| `language` | No | Primary language (`typescript`, `go`, `rust`, `python`, `java`, `none`) |
| `branch_strategy` | Yes | `trunk-based` or `gitflow` |
| `default_branch` | Yes | Target branch for PRs (`main` or `develop`) |
| `owns` | Yes | Glob patterns this repo is responsible for |
| `never_edit` | Yes | Off-limits paths (build output, dependencies, symlinks) |
| `symlinks` | Yes | Map of `symlink_path → source_path` (empty `{}` for consumer mode) |
| `ui_layer` | No | `react`, `cli`, or `none` |
| `components_path` | No | UI component directory (when `ui_layer` is set) |
| `test_command` | No | How to run tests |
| `build_command` | No | How to build |
| `lint_command` | No | How to lint |

### 3. CLAUDE.md Conventions

Orchestrator CLAUDE.md files follow a standard structure:

```markdown
# CLAUDE.md — My Project

<critical>
## Two Git Repos
- **This repo** (orchestrator) — sprint files, sessions, docs. Trunk-based: PRs → `main`.
- **`my-api/`** — backend source. Trunk-based: PRs → `main`.
- **`my-ui/`** — frontend source. Gitflow: PRs → `develop`.
</critical>

<critical>
## Rules
1. **Never edit `.pennyfarthing/` framework dirs** — those are copies/symlinks from pennyfarthing
2. **Never edit sprint YAML directly** — use `pf sprint story` commands
3. **Match model to task** — Haiku for mechanical tasks, Sonnet/Opus for analytical subagents
</critical>

<git-operations>
Commit format: `<type>(<scope>): <subject>`
Orchestrator commits: `git add sprint/ && git commit -m "chore(sprint): ..."`
Subrepo commits: `cd my-api && git add . && git commit -m "feat: ..."`
</git-operations>

<info>
## Repository Structure
| Directory | Purpose |
|-----------|---------|
| `.pennyfarthing/` | Runtime framework |
| `sprint/` | Sprint tracking |
| `.session/` | Active work sessions |
| `my-api/` | Backend API (gitignored subrepo) |
| `my-ui/` | Frontend app (gitignored subrepo) |
</info>
```

### 4. Git Workflow

The orchestrator and subrepos have **independent git histories**:

```bash
# Orchestrator commits (sprint tracking, docs)
git add sprint/
git commit -m "chore(sprint): complete story PROJ-123"

# Subrepo commits (code changes)
cd my-api
git add .
git commit -m "feat(auth): add JWT validation"
git push

# Back to orchestrator
cd ..
```

Subrepo directories are listed in `.gitignore`:
```
my-api/
my-ui/
.session/
```

### 5. Setup via `pf init` + `/pf-setup`

```bash
# 1. Create and initialize
mkdir ~/Projects/my-project-orc
cd ~/Projects/my-project-orc
git init
pf init .

# 2. Run interactive setup workflow
# /pf-setup walks through:
#   Step 1: Discovery — detect project type (orchestrator)
#   Step 2: Clone — clone subrepos from GitHub
#   Step 3: repos.yaml — generate topology config
#   Step 4: CLAUDE.md — generate project instructions
#   Steps 5-11: Theme, Jira, justfile, etc.
```

## When to Use

| Scenario | Use Orchestrator? | Rationale |
|----------|:-:|-----------|
| Multiple repos, one project | Yes | Central sprint tracking and agent context |
| Monorepo (single git history) | No | Already unified — use standard setup |
| Single repo, no subrepos | No | Orchestrator adds unnecessary indirection |
| Framework development (dogfooding) | Yes | Inline framework repo + symlinks for live editing |
| Microservices with shared sprint | Yes | Coordinate work across independent services |

## Consumer vs Dogfooding Mode

Orchestrators operate in one of two modes:

| Aspect | Consumer Mode | Dogfooding Mode |
|--------|:---:|:---:|
| Framework files | Flat copies in `.pennyfarthing/` | Symlinks → `pennyfarthing-dist/` |
| Framework repo | Not present | Inlined as subrepo |
| `pf init` behavior | Copies files | Creates/repairs symlinks |
| Who uses this | Normal projects | Pennyfarthing framework development |

See `docs/conventions/dogfooding.md` for details.

## Error Recovery

| Failure | Recovery |
|---------|----------|
| Subrepo clone fails | Re-run `git clone` manually, then re-run `/pf-setup` step 2 |
| repos.yaml out of date | Edit `.pennyfarthing/repos.yaml` directly (it's hand-maintained) |
| Symlink broken (dogfooding) | Run `pf init .` to repair |
| Wrong branch target for PR | Check `repos.yaml` `branch_strategy` field — agent should read this |
| Agent edits symlinked dir | Undo and edit source at `pennyfarthing-dist/` instead |

## Anti-Patterns

| Wrong | Correct |
|-------|---------|
| Commit subrepo code from orchestrator root | `cd subrepo && git add . && git commit` |
| Store sprint artifacts in subrepo | Sprint files belong in orchestrator's `sprint/` |
| Edit `.pennyfarthing/agents/` directly | Edit source at `pennyfarthing-dist/agents/` (dogfooding) or wait for `pf upgrade` (consumer) |
| One giant repos.yaml with 20+ repos | Group related repos; consider multiple orchestrators for separate concerns |
| Hardcode subrepo paths in scripts | Read from `repos.yaml` at runtime |

## Existing Examples

| Orchestrator | Subrepos | Notes |
|-------------|----------|-------|
| `pf-1` (pennyfarthing-orchestrator) | `pennyfarthing/` (framework) | Dogfooding mode — framework dev with symlinks |
| `orc-ax` | Axiathon services | Consumer mode — Rust-based project |
| `poller-orc` (poller-orchestrator) | Poller services | Consumer mode — Go-based project, origin of pre-epic sketch convention |
| `clip-orc` | CLIP rewrite repos | Consumer mode — CLIP system rewrite |

## Related Patterns

| Pattern | Relationship |
|---------|-------------|
| [Helper Delegation](helper-delegation-pattern.md) | Orchestrator agents delegate mechanical work to Haiku subagents |
| [TDD Flow](tdd-flow-pattern.md) | TDD workflow operates within a single subrepo context |
| [Approval Gates](approval-gates-pattern.md) | Gates apply at subrepo boundaries (e.g., PR review before merge) |
| [Fan-out/Fan-in](fan-out-fan-in-pattern.md) | Parallel work across subrepos uses fan-out for independent tasks |

## References

- `pennyfarthing-dist/workflows/project-setup/workflow.yaml` — Setup workflow definition
- `pennyfarthing-dist/workflows/project-setup/steps/step-01-discover.md` — Orchestrator detection heuristic
- `pennyfarthing-dist/workflows/project-setup/steps/step-02-clone-repos.md` — Subrepo cloning
- `pennyfarthing-dist/workflows/project-setup/steps/step-03-repos-yaml.md` — Topology generation
- `docs/conventions/dogfooding.md` — Consumer vs dogfooding modes

*Last verified: 2026-03-04* / *Pennyfarthing v12.3.0*
