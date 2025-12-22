# Pennyfarthing Agent Coordination Architecture

## Overview

This document describes how Pennyfarthing agents are coordinated across the `API` and `UI` repositories.

**Key Principle:** Single entry point (`/new-work`), state detection via session files, handoffs via Haiku subagents.

## The TDD Flow

```
/new-work → SM → TEA → Dev → Reviewer → SM (finish)
              │     │     │        │
           setup  tests  impl   review
              │     │     │        │
              └─────┴─────┴────────┘
                 subagent handoffs
```

**Entry point:** `/new-work` only
**State detection:** Agents read session file on activation
**Handoffs:** Agents spawn Haiku subagents to update session file
**Finish:** SM handles when status = `approved`

## Architecture Principles

### 1. Single Source of Truth
- **Agent definitions:** `.claude/agents/`
- **Subagent prompts:** `.claude/subagents/`
- **Scope configuration:** `.claude/docs/agent-scopes.yaml`
- **Sprint tracking:** `sprint/current-sprint.yaml`
- **Session state:** `.session/current-work.md`

### 2. Hierarchical Agent Structure
```
Strategic Agents (Full Scope)
├── orchestrator  → Orchestrates everything
├── pm           → Plans across all repos
├── architect    → Designs across all repos
└── devops       → Infrastructure and deployment

Tactical Agents (Story-Scoped) - THE TDD FLOW
├── sm           → Story setup and finish
├── tea          → Write failing tests (RED)
├── dev          → Implement to GREEN, create PR
└── reviewer     → Adversarial code review

Support Agents
├── tech-writer  → Documentation
└── ux-designer  → UI design
```

### 3. Context Loading Strategy
- **Strategic agents** load full project context (both repos)
- **Tactical agents** load only target repo context based on active story
- **Context budget** kept under 500-800 lines per agent
- **Lazy loading** - load docs only when specific task requires them

## Directory Structure

```
/$PROJECT_ROOT/
├── .claude/                              # Base coordination directory
│   ├── core/                           # Core agent system
│   │   ├── agents/                     # Single source of truth
│   │   │   ├── orchestrator.md         # Master orchestrator
│   │   │   ├── pm.md                  # Product Manager
│   │   │   ├── sm.md                  # Scrum Master
│   │   │   ├── architect.md           # System Architect
│   │   │   ├── dev.md                 # Developer
│   │   │   ├── tea.md                 # Test Engineer
│   │   │   ├── tech-writer.md         # Technical Writer
│   │   │   └── ux-designer.md         # UX Designer
│   │   ├── agent-scopes.yaml          # Scope configuration
│   │   └── AGENT-COORDINATION.md      # This file
│   │
│   ├── sprint/                         # Unified sprint tracking
│   │   ├── sprint-status.yaml         # All stories, both repos
│   │   └── README.md                  # Sprint tracking guide
│   │
│   ├── active/                         # Current work sessions
│   │   └── current-work.md            # Active story context
│   │
│   ├── docs/                           # Project-wide documentation
│   ├── scripts/                        # Utility scripts
│   └── templates/                      # Templates
│
├── API/                      # API repository
│   ├── .claude/
│   │   ├── context.md                 # API-specific context (~30 lines)
│   │   └── project/                       # API-specific Pennyfarthing metadata
│   └── docs/
│       ├── epics.md                   # API epic definitions
│       ├── architecture.md            # API architecture
│       ├── api-reference.md           # API documentation
│       └── data-models.md             # Data models
│
├── UI/                       # UI repository
│   ├── .claude/
│   │   ├── context.md                 # UI-specific context (~30 lines)
│   │   └── project/                       # UI-specific Pennyfarthing metadata
│   └── docs/
│       ├── design-system.md           # Design system
│       └── components.md              # Component library
│
```

## Agent Types

### Strategic Agents (Full Scope)

**Characteristics:**
- See entire project (both repos)
- Load all context on activation
- Make cross-repo decisions
- Coordinate work across repos

**Agents:**
- **Pennyfarthing Master:** Orchestrates all agents and workflows
- **PM:** Plans sprints, prioritizes epics, manages backlog
- **SM:** Creates stories, adds technical context, validates readiness
- **Architect:** Makes design decisions, defines patterns, ensures consistency

**Context Loading:**
```yaml
On Activation:
  1. sprint/sprint-status.yaml     # Full sprint status
  2. API/.claude/context.md      # API context
  3. UI/.claude/context.md       # UI context
  4. API/docs/epics.md         # Epic definitions (PM only)
  5. .session/current-work.md        # Active work
```

### Tactical Agents (Story-Scoped)

**Characteristics:**
- Focus on specific repo(s)
- Load context based on active story
- Implement/test/document specific features
- Narrow, deep expertise

**Agents:**
- **Dev:** Implements features in target repo
- **TEA:** Tests features in target repo
- **Tech Writer:** Documents features in target repo
- **UX Designer:** Designs UI interfaces (UI only)

**Context Loading:**
```yaml
On Activation:
  1. sprint/sprint-status.yaml     # Current sprint (story section)
  2. .session/current-work.md        # Active story
  3. Determine target repo from story "Repos:" field
  4. Load target repo context:
     - If API:  API/.claude/context.md
     - If UI:   UI/.claude/context.md
     - If Both: Load both contexts
```

## Context Files

### Base Directory Context

#### `sprint/sprint-status.yaml`
**Purpose:** Unified sprint tracking for all stories
**Size:** ~100-200 lines
**Loaded By:** All agents
**Content:**
- Sprint goals
- All stories (API, UI, Both)
- Story status (backlog, in-progress, review, done)
- Story metadata (repos, priority, points, files)

#### `.session/current-work.md`
**Purpose:** Current work session context
**Size:** ~50-100 lines
**Loaded By:** All agents
**Content:**
- Active story ID
- Target repo(s)
- Story context
- Progress notes
- Done checklist

### Repository Context

#### `API/.claude/context.md`
**Purpose:** API-specific patterns and structure
**Size:** ~30-50 lines
**Loaded By:** Strategic agents + Dev/TEA when working on API
**Content:**
- Tech stack (Go, PostgreSQL, MongoDB, Redis)
- Key patterns (Repository, DI, REST, Middleware)
- Project structure
- Quick links to key directories

#### `UI/.claude/context.md`
**Purpose:** UI-specific patterns and structure
**Size:** ~30-50 lines
**Loaded By:** Strategic agents + Dev/TEA/UX when working on UI
**Content:**
- Tech stack (React, TypeScript, TailwindCSS)
- Key patterns (Components, Hooks, Context API)
- Project structure
- Quick links to key directories

### Documentation

#### `API/docs/epics.md`
**Purpose:** All epic definitions for API
**Size:** ~800+ lines (load summary only)
**Loaded By:** PM, Architect
**Content:**
- Epic descriptions
- Story breakdowns
- Technical context
- Dependencies

## Agent Activation Protocol

### Step 1: Load Agent Definition
```
Read: .claude/agents/[agent].md
Identify: Strategic or Tactical agent type
```

### Step 2: Load Base Context
```
Load files from agent-scopes.yaml:
  - Sprint status
  - Active work (if exists)
  - Repo contexts (based on agent type)
```

### Step 3: Determine Scope (Tactical Agents Only)
```
Read: .session/current-work.md
Extract: "Repos:" field (API|UI|Both)
Load: Appropriate repo context
```

### Step 4: Present Ready State
```
Display: Agent persona and menu
Show: Loaded context summary
Ready: For user input
```

## Agent Workflows

### Strategic Agent Workflow (PM Example)

```
User: @/pm

1. Load PM agent definition (.claude/agents/pm.md)
2. Load all strategic context:
   - Sprint status (full)
   - API context
   - UI context
   - Epic definitions
   - Active work
3. Present PM menu with options
4. Execute PM tasks (sprint planning, backlog grooming, etc.)
5. Update sprint status
6. Hand off to SM or other agents as needed
```

### Tactical Agent Workflow (Dev Example)

```
User: @/dev

1. Load Dev agent definition (.claude/agents/dev.md)
2. Load base context:
   - Sprint status (story section)
   - Active work
3. Determine target repo from active work "Repos:" field
4. Load target repo context:
   - If API: API/.claude/context.md
   - If UI: UI/.claude/context.md
   - If Both: Load both
5. Present Dev ready state
6. Implement story in target repo(s)
7. Update sprint status to 'review'
8. Hand off to TEA or SM
```

## Agent Handoffs (TDD Flow)

Handoffs are automated via Haiku subagents in `.claude/subagents/`.

### The Flow

```
SM → TEA → Dev → Reviewer → SM
│      │     │        │       │
│      │     │        │       └── sm-finish-execution.md
│      │     │        └── reviewer-handoff-approve.md / reject.md
│      │     └── dev-handoff.md
│      └── tea-handoff.md
└── sm-story-setup.md
```

### Complete Subagent Inventory

| Subagent File | Purpose | Model |
|--------------|---------|-------|
| **SM Subagents** | | |
| `sm-story-setup.md` | Claim Jira, write session file, create branches | haiku |
| `sm-handoff.md` | General SM handoff coordination | haiku |
| `sm-work-research.md` | Research stories and context | haiku |
| `sm-file-summary.md` | Summarize file changes for commits | haiku |
| `sm-finish-bookkeeping.md` | Archive session, update sprint YAML | haiku |
| `sm-finish-execution.md` | Execute finish-story workflow | haiku |
| **TEA Subagents** | | |
| `tea-handoff.md` | Update session after tests written (RED) | haiku |
| `testing-runner.md` | Run tests and report results | haiku |
| **Dev Subagents** | | |
| `dev-handoff.md` | Update session after PR created (GREEN) | haiku |
| **Reviewer Subagents** | | |
| `reviewer-preflight.md` | Pre-flight checks before review | haiku |
| `reviewer-handoff-approve.md` | Mark approved, route to SM | haiku |
| `reviewer-handoff-reject.md` | Route back to Dev with issues | haiku |
| **Utility Subagents** | | |
| `workflow-status-check.md` | Check workflow status across repos | haiku |

### SM → TEA (Story Setup)
**Trigger:** User selects story via `/new-work`
**Subagent:** `sm-story-setup.md`
**Action:** Claim Jira, write session file, create branches
**Handoff phrase:** "TEA, Story X-Y needs tests. Write failing tests for these ACs."

### TEA → Dev (Tests Written)
**Trigger:** TEA completes failing tests
**Subagent:** `tea-handoff.md`
**Action:** Update session file, mark TEA checkbox done
**Handoff phrase:** "Dev, tests are RED and ready. Make them GREEN."

### Dev → Reviewer (Implementation Complete)
**Trigger:** Dev creates PR with passing tests
**Subagent:** `dev-handoff.md`
**Action:** Update session file, mark Dev checkbox done
**Handoff phrase:** "Reviewer, PR #N is ready. All tests GREEN."

### Reviewer → SM (Approved)
**Trigger:** Reviewer approves PR
**Subagent:** `reviewer-handoff-approve.md`
**Action:** Update status to `approved`, mark Reviewer checkbox done
**Handoff phrase:** "SM, Story X-Y approved. Run finish-story."

### Reviewer → Dev (Rejected)
**Trigger:** Reviewer finds issues
**Subagent:** `reviewer-handoff-reject.md`
**Action:** Update session with issues, route back to Dev
**Handoff phrase:** "Dev, {N} issues found. See assessment for details."

### SM → Done (Finish)
**Trigger:** Status = `approved`
**Subagent:** `finish-work-teardown.md`
**Action:** Archive session, create summary, update sprint YAML, sync Jira

## Support Agent Handoffs

### Any → Architect
**Trigger:** Need design decisions or architectural guidance
**Context:** Technical problem or design question
**Action:** Architect provides design and implementation guidance

### Any → Tech Writer
**Trigger:** Feature needs documentation
**Context:** Implemented feature
**Action:** Tech Writer creates documentation

### Any → UX Designer
**Trigger:** Feature needs UI design
**Context:** User story and requirements
**Action:** UX Designer creates UI design and specs

## Context Budget Management

### Target Budgets
- **Agent file:** 200-400 lines
- **Sprint status:** 100-200 lines (full) or 50 lines (story section)
- **Repo contexts:** 30-50 lines each
- **Active work:** 50-100 lines
- **Total per agent:** 500-800 lines

### Strategic Agent Budget
```
PM Agent Example:
  - pm.md:                    200 lines
  - sprint-status.yaml:       150 lines
  - API/context:     30 lines
  - UI/context:      30 lines
  - epics.md (summary):       100 lines
  - active work:               50 lines
  Total:                      560 lines ✓
```

### Tactical Agent Budget
```
Dev Agent Example (API story):
  - dev.md:                   300 lines
  - sprint-status (story):     50 lines
  - API/context:     30 lines
  - active work:               50 lines
  Total:                      430 lines ✓
```

## Benefits

### ✅ Single Source of Truth
- All agents defined in one place
- No duplicate or conflicting agent files
- Easy to update and maintain

### ✅ Coordinated Planning
- Strategic agents see full project scope
- Unified sprint tracking
- Clear cross-repo dependencies

### ✅ Focused Implementation
- Tactical agents load only what they need
- Reduced context overhead
- Faster agent activation

### ✅ Clear Hierarchy
- Strategic agents coordinate
- Tactical agents execute
- Clean handoffs between agents

### ✅ Scalable
- Easy to add new agents
- Context budgets stay manageable
- Works for solo dev or team

## Architecture History

### Previous Architecture (Pre-December 2025)
- Separate commands: `/new-work`, `/pickup-work`, `/handoff-work`, `/finish-work`
- Manual handoff documentation
- No subagent extraction

### Current Architecture (December 2025)
- Single entry point: `/new-work`
- State detection via session file
- Handoffs via Haiku subagents in `.claude/subagents/`
- SM handles finish-story when status = `approved`

### Directory Structure
```
.claude/agents/          # Agent definitions
.claude/subagents/       # Handoff subagent prompts
.claude/docs/agent-scopes.yaml  # Scope configuration
.session/               # Session files
sprint/                     # Sprint tracking
```

### Commands Reference
```bash
/new-work      # Start new story (only entry point)
/sm            # Scrum Master (also handles finish-story)
/tea           # Test Engineer
/dev           # Developer
/reviewer      # Code review
/architect     # Architecture design
/tech-writer   # Documentation
```

---

**Single entry point. State detection. Subagent handoffs.**
