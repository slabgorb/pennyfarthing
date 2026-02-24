# Pennyfarthing Architecture

This document describes the system design and architectural principles of Pennyfarthing.

## Core Principles

### 1. Single Source of Truth

All definitions live in one place (`pennyfarthing-dist/`), accessed via symlinks:
- **Agent definitions:** `.pennyfarthing/agents/` → `pennyfarthing/agents/`
- **Official subagents:** `.pennyfarthing/agents/` (same directory as agents)
- **Commands:** `.claude/commands/` → `pennyfarthing/commands/`
- **Personas:** `.pennyfarthing/personas/` → `pennyfarthing/personas/`
- **Workflows:** `.pennyfarthing/workflows/` → `pennyfarthing/workflows/`

Projects consume these via symlinks, not copies. Updates propagate automatically.

### 2. State Detection Over Explicit Commands

Agents detect workflow state from session files rather than requiring explicit user direction:
- Read `.session/{story-id}-session.md` on activation
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
├── pennyfarthing-dist/             # Source files (copied on install)
│   ├── agents/                     # 19 agent definitions (includes subagents)
│   ├── commands/                   # 46 slash commands
│   ├── guides/                     # Behavior guides
│   ├── skills/                     # 23 knowledge domains
│   ├── personas/                   # 102 theme files
│   └── workflows/                  # 19 workflow definitions
│
├── src/                            # NPM CLI source
│
├── scripts/                        # Utility scripts
│   ├── agent-session.sh
│   └── utils/                      # Reusable utilities
│       ├── retry.sh                # Exponential backoff
│       ├── checkpoint.sh           # Session state persistence
│       └── repo-scan.sh            # Cross-repo git status
│
└── tests/                          # Framework tests

After installation (in project):

your-project/
├── .claude/                        # Claude Code discovery (minimal)
│   ├── commands/                   # → symlinks to node_modules commands
│   ├── skills/                     # → symlinks to node_modules skills
│   ├── project/                    # Project-specific (user-editable)
│   │   ├── commands/               # User's custom commands
│   │   ├── skills/                 # User's custom skills
│   │   └── docs/                   # Project documentation
│   └── settings.local.json         # Claude Code settings
│
└── .pennyfarthing/                 # Pennyfarthing content
    ├── agents/                     # → symlink to node_modules agents
    ├── guides/                     # → symlink to node_modules guides
    ├── personas/                   # → symlink to node_modules personas
    ├── scripts/                    # → symlink to node_modules scripts
    ├── workflows/                  # → symlink to node_modules workflows
    ├── sidecars/                   # Agent learning files
    │   └── {agent}/                # patterns.md, gotchas.md, decisions.md
    ├── config.local.yaml           # Theme configuration
    └── cyclist.yaml                # Cyclist settings
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

Story-scoped. Focus on implementation. Execute workflow phases.

| Agent | Role | Responsibilities |
|-------|------|------------------|
| **SM** | Story Coordinator | Story setup, finish |
| **TEA** | Test Engineer | Write failing tests (RED) |
| **Dev** | Developer | Implement to pass tests (GREEN) |
| **Reviewer** | Code Reviewer | Adversarial code review |

### Support Agents

Specialized tasks outside core workflows.

| Agent | Role | Responsibilities |
|-------|------|------------------|
| **Tech Writer** | Documentation | API docs, user guides, README |
| **UX Designer** | User Experience | UI design, accessibility |

## BikeLane Workflow System

Pennyfarthing's BikeLane system provides flexible workflow orchestration through three workflow types:

### Workflow Types

| Type | Description | Example |
|------|-------------|---------|
| **Phased** | Linear progression through defined phases | TDD (RED → GREEN → REFACTOR) |
| **Stepped** | Discrete steps with branch logic and loops | Sprint Planning, PRD creation |
| **Procedural** | Free-form agent coordination | Brainstorming, Research |

### Example: TDD Workflow (Phased)

```
/pf-work
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

### Workflow Definitions

Workflows are defined in `pennyfarthing-dist/workflows/`:
- **YAML files:** Simple workflow definitions (5 workflows)
- **Directory-based:** Complex stepped workflows (15 workflows)

The workflow system enables:
- Multiple concurrent development approaches
- Context-appropriate process selection
- Custom project-specific workflows

## Official Subagent System

Pennyfarthing includes 13 official subagents - Haiku-based coordinators that manage state transitions. They use Claude Code's official agent format and are invoked via `Task tool` with `subagent_type: "{name}"`.

Error handling is centralized in the calling agent (see `tactical-agent-behavior.md`). Subagents return structured results with `status: success|blocked`.

### SM Subagents

| Subagent | Purpose |
|----------|---------|
| `workflow-status-check` | Detect workflow state |
| `sm-setup` | Research backlog (MODE=research) or setup story (MODE=setup) |
| `sm-finish` | Preflight checks (PHASE=preflight) or execute finish (PHASE=execute) |
| `sm-file-summary` | Summarize file changes |
| `sm-handoff` | Handoff bookkeeping when SM work done |

### TEA Subagents

| Subagent | Purpose |
|----------|---------|
| `testing-runner` | Execute tests, report results |
| `tea-handoff` | Update session after tests (RED) |

### Dev Subagents

| Subagent | Purpose |
|----------|---------|
| `testing-runner` | Verify tests pass |
| `dev-handoff` | Update session after PR (GREEN) |

### Reviewer Subagents

| Subagent | Purpose |
|----------|---------|
| `testing-runner` | Run tests |
| `reviewer-preflight` | Gather review data |
| `reviewer-handoff-approve` | Approve and route to SM |
| `reviewer-handoff-reject` | Reject and route to Dev |

## Context Loading Strategy

### Strategic Agents

Load full project context:
```yaml
On Activation:
  1. sprint/current-sprint.yaml   # Full sprint
  2. API/.claude/context.md       # API context
  3. UI/.claude/context.md        # UI context
  4. .session/{story-id}-session.md     # Active work
```

**Budget:** ~500-800 lines

### Tactical Agents

Load focused context:
```yaml
On Activation:
  1. sprint/current-sprint.yaml   # Story section only
  2. .session/{story-id}-session.md     # Active work
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

### `.session/{story-id}-session.md`

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

1. Read `.pennyfarthing/config.local.yaml`
2. Get theme (e.g., `discworld`)
3. Load `personas/themes/{theme}.yaml`
4. Extract agent section
5. Apply theme-specific persona

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

`/pf-work` is the only entry point because:
- State detection handles all cases (new, resume, finish)
- Reduces cognitive load
- Prevents workflow confusion

### Why Haiku for Subagents?

- Fast execution for mechanical tasks
- Lower context requirements
- Cost-effective for frequent operations
- Opus reserved for reasoning and decisions

### Why Symlinks?

- Single source of truth (`pennyfarthing/` directory)
- Updates propagate automatically via `pf setup`
- No copy/paste drift
- Clear separation of managed vs project files
- Official subagents live alongside agent definitions

### Why Personas?

- Reduces agent confusion (distinct voices)
- Improves engagement
- Fun while remaining professional
- Configurable per project preference

### Why BikeLane Workflows?

- Flexibility: Different tasks need different process structures
- Clarity: Explicit workflow definitions reduce ambiguity
- Extensibility: Projects can add custom workflows
- Reusability: Common patterns encoded as reusable workflows

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

## OpenTelemetry Integration (v6.5+)

Pennyfarthing integrates with Claude Code's telemetry for observability and cost tracking.

### OTEL Tool Enrichment

Tool spans are enriched with operation-specific metadata:

| Tool | Enriched Fields |
|------|-----------------|
| **Bash** | Command, working directory, exit code, duration |
| **Read/Edit** | File path, line count, change type |
| **Write** | File path, bytes written, file type |
| **Grep/Glob** | Pattern, matches found, files searched |
| **Task** | Subagent type, model, prompt summary |

### Span Correlation

OTEL spans are correlated to provide:
- **Agent attribution** - Which agent made the tool call
- **Story context** - Current story ID for cost attribution
- **Workflow phase** - Current workflow phase timing
- **Session boundary** - Track work across sessions

### Configuration

Enable telemetry by setting the OTLP endpoint:

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
```

Cyclist's built-in OTLP receiver (port 4318) captures and displays this data in:
- Stats strip (token counts, context %)
- Audit log (tool execution history)
- Cost calculator (USD estimates)

### Telemetry Data Model

```typescript
interface ToolSpan {
  name: string;           // Tool name (Bash, Read, etc.)
  timestamp: number;      // Unix timestamp
  duration_ms: number;    // Execution time
  attributes: {
    agent?: string;       // Active agent role
    story_id?: string;    // Current story
    workflow_phase?: string; // Current workflow phase
    // Tool-specific attributes...
  };
}
```

See `packages/cyclist/src/otlp-receiver.ts` for the full data model
