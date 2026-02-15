# Pennyfarthing Agent Coordination Architecture

## Overview

This document describes how Pennyfarthing agents are coordinated. The framework supports both single-repo and multi-repo projects.

**Key Principle:** Single entry point (`/pf-session new` or `/work`), state detection via session files, handoffs via Haiku subagents.

## The TDD Flow

SM → TEA → Dev → Reviewer → SM (setup → red → green → review → finish)

Handoffs between agents are managed by Haiku subagents.

**Entry points:** `/pf-session new` (new story) or `/work` (smart resume/start)
**State detection:** Agents read session file on activation
**Handoffs:** Agents spawn Haiku subagents to update session file
**Finish:** SM handles when status = `approved`

## Architecture Principles

### 1. Single Source of Truth
- **Agent definitions:** `.pennyfarthing/agents/`
- **Subagent prompts:** `.pennyfarthing/agents/`
- **Scope configuration:** `.pennyfarthing/project/docs/agent-scopes.yaml`
- **Sprint tracking:** `sprint/current-sprint.yaml`
- **Session state:** `.session/{STORY_ID}-session.md`

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
/$CLAUDE_PROJECT_DIR/
├── .pennyfarthing/                       # Pennyfarthing coordination directory (symlinks to node_modules)
│   ├── agents/                         # Agent definitions (symlinks to pennyfarthing-dist)
│   │   ├── orchestrator.md             # Master orchestrator
│   │   ├── pm.md                       # Product Manager
│   │   ├── sm.md                       # Scrum Master (+ sm-*.md subagents)
│   │   ├── architect.md                # System Architect
│   │   ├── dev.md                      # Developer (+ dev-handoff.md)
│   │   ├── tea.md                      # Test Engineer (+ tea-handoff.md)
│   │   ├── reviewer.md                 # Code Reviewer (+ reviewer-*.md subagents)
│   │   ├── tech-writer.md              # Technical Writer
│   │   ├── ux-designer.md              # UX Designer
│   │   └── devops.md                   # DevOps Engineer
│   │
│   ├── commands/                       # Slash commands (symlinks)
│   ├── guides/                         # Behavior guides (symlinks)
│   ├── skills/                         # Knowledge domain skills (symlinks)
│   ├── scripts/                        # Utility scripts (symlinks)
│   │
│   ├── project/                        # Project-specific overrides
│   │   ├── agents/                     # Agent sidecars (patterns, gotchas, decisions)
│   │   └── commands/                   # Custom project commands
│   │
│   ├── sidecars/                       # Agent learning files (local, writable)
│   ├── config.local.yaml               # Theme, bell_mode, relay_mode, permission_mode
│   └── persona-config.yaml             # Project default theme (shared with team)
│
├── .session/                           # Active work sessions
│   └── {story-id}-session.md           # Session files (one per story)
│
├── sprint/                             # Sprint tracking
│   ├── current-sprint.yaml             # Active sprint and stories
│   ├── context/                        # Epic technical context
│   ├── archive/                        # Completed sprints
│   └── sidecars/                       # Agent learning files
│
└── pennyfarthing-dist/                 # Source of truth (if Pennyfarthing project itself)
    ├── agents/                         # 10 main agents + 14 subagents
    ├── commands/                       # 42 slash commands
    ├── guides/                         # Behavior guides and patterns
    ├── skills/                         # Knowledge domain skills
    ├── personas/themes/                # 102 themed personas
    └── scripts/                        # Utility scripts
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
  5. .session/{STORY_ID}-session.md        # Active work
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
  2. .session/{STORY_ID}-session.md        # Active story
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

#### `.session/{STORY_ID}-session.md`
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
Read: .pennyfarthing/agents/[agent].md
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
Read: .session/{STORY_ID}-session.md
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

1. Load PM agent definition (.pennyfarthing/agents/pm.md)
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

1. Load Dev agent definition (.pennyfarthing/agents/dev.md)
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

Handoffs are automated via Haiku subagents in `.pennyfarthing/agents/`.

### The Flow

```
SM → TEA → Dev → Reviewer → SM
│      │     │        │       │
│      │     │        │       └── sm-finish PHASE=execute
│      │     │        └── handoff VERDICT=approved/rejected
│      │     └── handoff CURRENT_PHASE=green
│      └── handoff CURRENT_PHASE=red
└── sm-setup MODE=setup + sm-handoff
```

### Complete Subagent Inventory

| Subagent File | Purpose | Model |
|--------------|---------|-------|
| **SM Subagents** | | |
| `sm-setup.md` | Research backlog (MODE=research) or setup story (MODE=setup) | haiku |
| `sm-finish.md` | Preflight checks (PHASE=preflight) or execute finish (PHASE=execute) | haiku |
| `sm-handoff.md` | SM → TEA/Dev handoff with Jira/branch verification | haiku |
| `sm-file-summary.md` | Summarize file changes for commits | haiku |
| **Shared Subagents** | | |
| `handoff.md` | Workflow-driven phase transitions (TEA, Dev, Reviewer) | haiku |
| `testing-runner.md` | Run tests and report results | haiku |
| **Reviewer Subagents** | | |
| `reviewer-preflight.md` | Pre-flight checks before review | haiku |
### SM → TEA (Story Setup)
**Trigger:** User selects story via `/pf-session new`
**Subagent:** `sm-setup MODE=setup` then `sm-handoff`
**Action:** Claim Jira, write session file, create branches
**Handoff phrase:** "TEA, Story X-Y needs tests. Write failing tests for these ACs."

### TEA → Dev (Tests Written)
**Trigger:** TEA completes failing tests
**Subagent:** `handoff CURRENT_PHASE=red`
**Action:** Update session file, transition to green phase
**Handoff phrase:** "Dev, tests are RED and ready. Make them GREEN."

### Dev → Reviewer (Implementation Complete)
**Trigger:** Dev creates PR with passing tests
**Subagent:** `handoff CURRENT_PHASE=green`
**Action:** Update session file, transition to review phase
**Handoff phrase:** "Reviewer, PR #N is ready. All tests GREEN."

### Reviewer → SM (Approved)
**Trigger:** Reviewer approves PR
**Subagent:** `handoff VERDICT=approved`
**Action:** Update status to `approved`, transition to finish phase
**Handoff phrase:** "SM, Story X-Y approved. Run finish-story."

### Reviewer → Dev (Rejected)
**Trigger:** Reviewer finds issues
**Subagent:** `handoff VERDICT=rejected`
**Action:** Update session with issues, route back to implement phase
**Handoff phrase:** "Dev, {N} issues found. See assessment for details."

### SM → Done (Finish)
**Trigger:** Status = `approved`
**Subagent:** `sm-finish PHASE=execute`
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
- Separate commands: `/pf-session new`, `/pickup-work`, `/handoff-work`, `/finish-work`
- Manual handoff documentation
- No subagent extraction

### Current Architecture (January 2026)
- Smart entry point: `/work` (resumes or starts new)
- Alternative: `/pf-session new` (explicitly start new story)
- State detection via session file in `.session/`
- Handoffs via Haiku subagents in `.pennyfarthing/agents/`
- SM handles finish-story when status = `approved`
- 102 themed personas for agent personality

### Directory Structure
```
.pennyfarthing/agents/             # Agent definitions (symlinked)
.pennyfarthing/commands/           # Slash commands (symlinked)
.pennyfarthing/skills/             # Knowledge domain skills (symlinked)
.session/                          # Session files
sprint/                            # Sprint tracking
```

### Commands Reference
```bash
# Entry points
/work          # Smart entry - resume or start new
/pf-session new # Explicitly start new story

# TDD Flow agents
/sm            # Scrum Master (setup + finish)
/tea           # Test Engineer (RED phase)
/dev           # Developer (GREEN phase)
/reviewer      # Code Reviewer

# Support agents
/architect     # Architecture design
/tech-writer   # Documentation
/ux-designer   # UI/UX design
/devops        # Infrastructure

# Utility
/check         # Run quality gates before handoff
/chore         # Quick commit for small changes
/pf-git release # Merge develop to main
```

---

**Smart entry. State detection. Subagent handoffs. Themed personas.**
