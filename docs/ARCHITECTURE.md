# Pennyfarthing Architecture

**Version:** 12.1.0

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
├── pennyfarthing-dist/             # Source files (source of truth)
│   ├── agents/                     # 11 main agents + 6 official subagents
│   ├── commands/                   # Slash commands
│   ├── guides/                     # Behavior guides
│   ├── skills/                     # Knowledge domains
│   ├── personas/                   # Theme files
│   ├── workflows/                  # Workflow definitions
│   └── src/pf/                     # Python CLI package (hooks, jira, sprint, story, prime, handoff)
│
├── packages/
│   ├── core/                       # @pennyfarthing/core — CLI, WheelHub server, API routes
│   ├── cyclist/                    # Visual terminal (React 19, Tailwind v4, dockview)
│   └── shared/                     # Shared types and utilities
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
    |-- Subagent: sm-setup (MODE=research)
    |-- Subagent: sm-setup (MODE=setup)
    |-- Subagent: sm-file-summary
    |-- Exit: pf handoff → TEA
    |
    v
TEA (Write Tests - RED)
    |-- Subagent: testing-runner
    |-- Exit: pf handoff resolve-gate → complete-phase → marker → Dev
    |
    v
Dev (Implement - GREEN)
    |-- Subagent: testing-runner
    |-- Exit: pf handoff resolve-gate → complete-phase → marker → Reviewer
    |
    v
Reviewer (Adversarial Review)
    |-- Subagent: reviewer-preflight
    |-- Subagent: testing-runner
    |-- Exit: pf handoff → SM (approve) or Dev (reject)
    |
    v
SM (Finish - Cleanup)
    |-- Subagent: sm-finish (PHASE=preflight)
    |-- Subagent: sm-finish (PHASE=execute)
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

Pennyfarthing includes 6 official subagents — Haiku-based coordinators for mechanical tasks. They are invoked via the Task tool with `subagent_type: "general-purpose"` and `model: "haiku"`.

Error handling is centralized in the calling agent (see `guides/agent-behavior.md`). Subagents return structured results with `status: success|blocked`.

| Subagent | Purpose | Used By |
|----------|---------|---------|
| `sm-setup` | Research backlog (MODE=research) or setup story (MODE=setup) | SM |
| `sm-finish` | Preflight checks (PHASE=preflight) or execute finish (PHASE=execute) | SM |
| `sm-file-summary` | Summarize file changes for session log | SM |
| `testing-runner` | Execute tests and report results | TEA, Dev, Reviewer |
| `reviewer-preflight` | Gather code review data | Reviewer |
| `tandem-backseat` | Background observer for tandem mode | All agents |

## Context Loading Strategy

Context loading is managed by the **Prime** system — a unified agent activation mechanism that assembles identity, workflow state, session context, and behavioral guides into a single payload before the agent begins working.

### Prime Tiers

Prime selects a context tier based on session state to manage token overhead:

| Tier | ~Tokens | When Used |
|------|---------|-----------|
| **FULL** | ~4000 | First turn of a new session (no prior agent) |
| **REFRESH** | ~600 | Resumed session, same agent, turns 0-3 |
| **HANDOFF** | ~700 | Resumed session, different agent |
| **MINIMAL** | ~200 | Deep conversation (turn > 3), same agent |

### Priority Order

Prime outputs context in priority order (highest attention first):
1. Workflow State (routing decision)
2. Agent Definition (identity)
3. Persona (character voice)
4. Behavior Guide (shared protocols)
5. Sprint Context
6. Session Context (story state)
7. Sidecars (patterns/gotchas/decisions)

### Agent Context Scope

**Strategic Agents** (PM, Orchestrator, Architect) load broad project context:
- Full sprint status
- Both API and UI contexts
- Epic definitions
- Active work
- **Budget:** ~500-800 lines

**Tactical Agents** (SM, TEA, Dev, Reviewer) load focused context:
- Story section of sprint status only
- Active session file
- Target repo context (based on story)
- **Budget:** ~450-600 lines

### Invocation

```bash
# Via pf CLI (used by agent commands)
pf agent start "<agent>" --quiet

# TypeScript API (used by Cyclist)
getPrimeContext(agentName, projectDir)
getPrimeContextWithTier(agentName, projectDir, tier)
```

## Session Files

### `.session/{story-id}-session.md`

Session files use XML-tagged markdown. This structured format enables reliable machine parsing by agents and scripts while remaining human-readable.

```xml
<session story="PROJ-123" workflow="tdd">
  <meta>
    <jira>PROJ-123</jira>
    <epic>PROJ-100</epic>
    <points>3</points>
    <started>2026-01-22</started>
  </meta>

  <status phase="green" next-agent="reviewer" handoff-ready="false"/>

  <acceptance-criteria>
    <ac id="1" status="done">User can log in with valid credentials</ac>
    <ac id="2" status="in-progress">Invalid credentials show error message</ac>
    <ac id="3" status="pending">Session persists across page refresh</ac>
  </acceptance-criteria>

  <context>
    Implementing authentication feature.
    Key files: src/auth/login.ts, src/auth/session.ts
  </context>

  <work-log>
    <entry agent="sm" date="2026-01-22">
      Story setup complete. Branch created, Jira claimed.
    </entry>
    <entry agent="tea" date="2026-01-22" phase="red">
      Wrote failing tests for all 3 ACs. All verified RED.
    </entry>
    <entry agent="dev" date="2026-01-22" phase="green">
      Implementing login handler and session management.
    </entry>
  </work-log>
</session>
```

The `<status>` element is the primary machine-readable routing signal — `phase`, `next-agent`, and `handoff-ready` are updated atomically by `pf handoff complete-phase` at each phase transition. See `guides/session-schema.md` for the full element reference.

### `sprint/current-sprint.yaml`

Sprint tracking:
```yaml
sprint:
  name: Sprint 23
  start: 2026-02-03
  end: 2026-02-17
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

Agents drive phase transitions directly using the `pf handoff` CLI — no handoff subagents are involved. The exit protocol is:

```
1. Write assessment to session file (<work-log> or <assessment> entry)
2. pf handoff resolve-gate {story-id} {workflow} {phase}
   ├── blocked → report error, STOP
   ├── skip    → jump to step 4
   └── ready   → spawn gate subagent → GATE_RESULT
       ├── fail → fix issues, retry (max 3)
       └── pass → continue
3. pf handoff complete-phase {story-id} {workflow} {from} {to} {gate-type}
4. pf handoff marker {next-agent} → emit marker → EXIT
```

### `pf handoff` Commands

| Command | Purpose |
|---------|---------|
| `pf handoff resolve-gate STORY WORKFLOW PHASE` | Check gate status (`ready`, `skip`, `blocked`) |
| `pf handoff complete-phase STORY WORKFLOW FROM TO GATE_TYPE` | Atomically update session file phase |
| `pf handoff marker NEXT_AGENT` | Generate environment-aware routing marker |
| `pf handoff phase-check AGENT` | Verify the active phase belongs to this agent |

The marker generator is environment-aware: it emits a Cyclist `<!-- CYCLIST:HANDOFF:/agent -->` marker in GUI mode, or a plain text `AGENT_COMMAND` block in CLI mode. In relay mode, the next agent activates automatically.

See `guides/handoff-cli.md` for full command reference and `guides/gates.md` for gate evaluation details.

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

## Script Architecture

Pennyfarthing scripts are Python-based under `pennyfarthing-dist/src/pf/`, not shell scripts. The `pf` CLI is the primary interface for all agent operations.

### Python CLI (`pf`)

The `pf` command is globally installed and provides all agent-facing operations:

```bash
pf agent start <agent>           # Activate an agent with primed context
pf handoff resolve-gate ...      # Check gate status before phase transition
pf handoff complete-phase ...    # Atomically record phase transition in session
pf handoff marker <next-agent>   # Generate routing marker
pf sprint story finish <id>      # Archive session, update Jira, clean up
pf workflow list                 # List available workflows
pf workflow show <name>          # Show workflow phase details
```

### Shell Utilities

Thin shell wrappers exist in `pennyfarthing-dist/scripts/` for operations that integrate directly with the file system. Path resolution uses `find-root.sh` (walks up looking for `.pennyfarthing/`) — agents never hardcode absolute paths.

## OpenTelemetry Integration

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
