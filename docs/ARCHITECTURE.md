# Pennyfarthing Architecture

This document describes the system design and architectural principles of Pennyfarthing.

## Core Principles

### 1. Single Source of Truth

All definitions live in one place:
- **Agent definitions:** `core/agents/`
- **Subagent prompts:** `core/subagents/`
- **Commands:** `core/commands/`
- **Personas:** `personas/`

Projects consume these via symlinks, not copies.

### 2. State Detection Over Explicit Commands

Agents detect workflow state from session files rather than requiring explicit user direction:
- Read `.session/current_work.md` on activation
- Determine appropriate action based on current state
- No need for separate "pickup", "handoff", or "finish" commands

### 3. Subagent Delegation

Heavy lifting is delegated to Haiku-based subagents:
- Opus handles reasoning and decision-making
- Haiku handles mechanical work (tests, git, status checks)
- Reduces context usage and improves performance

### 4. Lazy Context Loading

Context is loaded only when needed:
- Strategic agents load broad context upfront
- Tactical agents load narrow, focused context
- Documents loaded only when specific tasks require them

## Directory Structure

```
pennyfarthing/
├── core/                           # Framework core
│   ├── agents/                     # Agent definitions (11 agents)
│   ├── subagents/                  # Handoff coordinators (13 subagents)
│   ├── commands/                   # Slash commands (23 commands)
│   └── docs/                       # Core documentation
│
├── personas/                       # Persona system
│   ├── themes/                     # Theme files
│   │   ├── discworld.yaml
│   │   ├── star-trek.yaml
│   │   ├── literary-classics.yaml
│   │   └── minimalist.yaml
│   └── attributes.yaml             # Personality modifiers
│
├── skills/                         # Project-agnostic knowledge
│   ├── agentic-patterns/
│   ├── context-engineering/
│   ├── code-review/
│   ├── testing/
│   ├── story-management/
│   ├── sprint-context/
│   ├── jira-cli/
│   ├── just/
│   ├── dev-patterns/
│   └── persona-benchmark/
│
├── scripts/                        # Utility scripts
│   ├── init-project.sh
│   ├── agent-session.sh
│   └── utils/                      # Reusable utilities
│       ├── retry.sh                # Exponential backoff
│       ├── checkpoint.sh           # Session state persistence
│       └── repo-scan.sh            # Cross-repo git status
│
├── benchmarks/                     # Agent performance testing
│   ├── test-cases/
│   └── results/
│
└── tests/                          # Framework tests
```

## Agent Hierarchy

### Strategic Agents

Full project scope. Make cross-repo decisions. Coordinate work.

| Agent | Role | Responsibilities |
|-------|------|------------------|
| **Orchestrator** | Meta operations | Process improvement, agent coordination |
| **PM** | Product Manager | Sprint planning, prioritization, roadmap |
| **SM** | Scrum Master | Story creation, technical context |
| **Architect** | System Architect | Design decisions, patterns |
| **DevOps** | Infrastructure | CI/CD, deployment, monitoring |

### Tactical Agents

Story-scoped. Focus on implementation. Execute TDD flow.

| Agent | Role | Responsibilities |
|-------|------|------------------|
| **SM** | Story Coordinator | Story setup, finish |
| **TEA** | Test Engineer | Write failing tests (RED) |
| **Dev** | Developer | Implement to pass tests (GREEN) |
| **Reviewer** | Code Reviewer | Adversarial code review |

### Support Agents

Specialized tasks outside core TDD flow.

| Agent | Role | Responsibilities |
|-------|------|------------------|
| **Tech Writer** | Documentation | API docs, user guides, README |
| **UX Designer** | User Experience | UI design, accessibility |

## The TDD Flow

```
/new-work
    |
    v
SM (Story Setup)
    |-- Helper: Status Check
    |-- Helper: Research Backlog
    |-- I: Select Story & Write Context
    |-- Helper: File Summary
    |-- Helper: Story Setup
    |
    v
TEA (Write Tests - RED)
    |-- Helper: Run Tests
    |-- Helper: Handoff
    |
    v
Dev (Implement - GREEN)
    |-- Helper: Run Tests
    |-- I: Write Code
    |-- Helper: Handoff
    |
    v
Reviewer (Adversarial Review)
    |-- Helper: Preflight
    |-- I: Review Code
    |-- Helper: Approve/Reject
    |
    v
SM (Finish - Cleanup)
    |-- Helper: Bookkeeping
    |-- Helper: Execution
```

## Subagent System

Subagents are Haiku-based coordinators that manage state transitions.

### SM Subagents

| Subagent | Purpose |
|----------|---------|
| `sm-story-setup.md` | Claim Jira, write session, create branches |
| `sm-handoff.md` | General coordination |
| `sm-work-research.md` | Research stories and context |
| `sm-file-summary.md` | Summarize file changes |
| `sm-finish-bookkeeping.md` | Archive session, update sprint |
| `sm-finish-execution.md` | Execute finish workflow |

### TEA Subagents

| Subagent | Purpose |
|----------|---------|
| `tea-handoff.md` | Update session after tests (RED) |
| `testing-runner.md` | Execute tests, report results |

### Dev Subagents

| Subagent | Purpose |
|----------|---------|
| `dev-handoff.md` | Update session after PR (GREEN) |

### Reviewer Subagents

| Subagent | Purpose |
|----------|---------|
| `reviewer-preflight.md` | Gather review data |
| `reviewer-handoff-approve.md` | Approve and route to SM |
| `reviewer-handoff-reject.md` | Reject and route to Dev |

### Utility Subagents

| Subagent | Purpose |
|----------|---------|
| `workflow-status-check.md` | Detect workflow state |

## Context Loading Strategy

### Strategic Agents

Load full project context:
```yaml
On Activation:
  1. sprint/current-sprint.yaml   # Full sprint
  2. API/.claude/context.md       # API context
  3. UI/.claude/context.md        # UI context
  4. .session/current_work.md     # Active work
```

**Budget:** ~500-800 lines

### Tactical Agents

Load focused context:
```yaml
On Activation:
  1. sprint/current-sprint.yaml   # Story section only
  2. .session/current_work.md     # Active work
  3. Target repo context          # Based on story
```

**Budget:** ~450-600 lines

### Context Budget Breakdown

**Strategic Agent (PM):**
```
pm.md:                    200 lines
sprint-status.yaml:       150 lines
API/context:              30 lines
UI/context:               30 lines
epics.md (summary):       100 lines
active work:              50 lines
----------------------------
Total:                    560 lines
```

**Tactical Agent (Dev):**
```
dev.md:                   300 lines
sprint-status (story):    50 lines
API/context:              30 lines
active work:              50 lines
----------------------------
Total:                    430 lines
```

## Session Files

### `.session/current_work.md`

Active work session context:
```markdown
# Current Work Session

## Story
- **ID:** PROJ-123
- **Title:** Implement user authentication
- **Repos:** API, UI

## Progress
- [x] SM: Story setup complete
- [x] TEA: Tests written (RED)
- [ ] Dev: Implementation
- [ ] Reviewer: Code review

## Context
[Story details, acceptance criteria]

## Notes
[Progress notes, decisions made]
```

### `sprint/current-sprint.yaml`

Sprint tracking:
```yaml
sprint:
  name: Sprint 23
  start: 2025-01-06
  end: 2025-01-20
  goal: Complete authentication epic

stories:
  - id: PROJ-123
    title: User login API
    status: in_progress
    repos: [API]
    points: 3

  - id: PROJ-124
    title: Login UI
    status: backlog
    repos: [UI]
    points: 5
```

## Handoff Protocol

### Agent to Agent

1. Current agent completes work
2. Spawns appropriate subagent
3. Subagent updates session file
4. Subagent outputs handoff phrase
5. Next agent activates and reads state

### Handoff Phrases

| Transition | Phrase |
|------------|--------|
| SM -> TEA | "TEA, Story X needs tests. Write failing tests for these ACs." |
| TEA -> Dev | "Dev, tests are RED and ready. Make them GREEN." |
| Dev -> Reviewer | "Reviewer, PR #N is ready. All tests GREEN." |
| Reviewer -> SM | "SM, Story X approved. Run finish-story." |
| Reviewer -> Dev | "Dev, {N} issues found. See assessment." |

## Persona System

### Loading Order

1. Read `.claude/persona-config.yaml`
2. Get theme (e.g., `discworld`)
3. Load `personas/themes/{theme}.yaml`
4. Extract agent section
5. Apply attributes (verbosity, humor, etc.)

### Theme Structure

```yaml
agents:
  sm:
    character: Captain Carrot
    style: Supportive, by the book
    expertise: Agile, sprint management
    role: Natural leader
    emoji: "🏃"
    helper:
      name: Nobby
      style: Mechanical legwork
```

## Integration Points

### Project Sidecars

Project-specific knowledge for each agent:
```
.claude/project/agents/
├── dev-sidecar/
│   └── patterns.md      # Dev-specific project patterns
├── tea-sidecar/
│   └── patterns.md      # Test-specific patterns
└── ...
```

### Environment Hooks

```bash
# .claude/project/hooks/setup-env.sh
export PROJECT_ROOT="..."
export PROJECT_NAME="..."
export API_REPO="..."
export UI_REPO="..."
```

### Jira Integration

Stories sync to/from Jira via:
- `/sync-epic-to-jira` - Push epic to Jira
- Subagent claims (assigns to user)
- Status updates on story completion

## Design Decisions

### Why Single Entry Point?

`/new-work` is the only entry point because:
- State detection handles all cases (new, resume, finish)
- Reduces cognitive load
- Prevents workflow confusion

### Why Haiku for Subagents?

- Fast execution for mechanical tasks
- Lower context requirements
- Cost-effective for frequent operations
- Opus reserved for reasoning and decisions

### Why Symlinks?

- Single source of truth (core files)
- Updates propagate automatically
- No copy/paste drift
- Clear separation of core vs project

### Why Personas?

- Reduces agent confusion (distinct voices)
- Improves engagement
- Fun while remaining professional
- Configurable per project preference

## Resilience Utilities

Sprint 1 introduced reusable utilities in `scripts/utils/` for robust agent workflows.

### Retry with Backoff

`scripts/utils/retry.sh` provides exponential backoff for transient failures:

```bash
source scripts/utils/retry.sh

# retry_with_backoff MAX_ATTEMPTS INITIAL_DELAY MAX_DELAY COMMAND
retry_with_backoff 3 1 10 curl -s https://api.example.com/health

# Primary with fallback
command_with_fallback "git pull --ff-only" "git pull --no-rebase"
```

### Session Checkpoints

`scripts/utils/checkpoint.sh` enables session state persistence:

```bash
source scripts/utils/checkpoint.sh

# Save/restore state
checkpoint_save "story_phase" "dev"
phase=$(checkpoint_restore "story_phase")

# Maintenance
checkpoint_list    # Show recent
checkpoint_rotate 500  # Prevent unbounded growth
```

Format: `ISO_TIMESTAMP|LABEL|DATA`

### Repo Scanning

`scripts/utils/repo-scan.sh` provides cross-repo git status:

```bash
source scripts/utils/repo-scan.sh

# Single repo: returns repo|branch|uncommitted|ahead
scan_repo_git_status pennyfarthing

# All configured repos
scan_all_repos_status

# Check for open PR
check_repo_pr pennyfarthing feature/my-branch
```

Used by the `workflow-status-check.md` subagent for state detection
