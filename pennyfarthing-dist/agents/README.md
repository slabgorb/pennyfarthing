# Pennyfarthing Core Agents

## Overview

This directory contains the **single source of truth** for all Pennyfarthing agent definitions. Agents are coordinated across both `API` and `UI` repositories.

**See:** `../ AGENT-COORDINATION.md` for complete architecture documentation.

## Agent Hierarchy

### Strategic Agents (Full Scope)
Oversee both repos, make cross-repo decisions, coordinate work.

- **`orchestrator.md`** - Master orchestrator
- **`pm.md`** - Product Manager (planning, prioritization)
- **`sm.md`** - Scrum Master (story creation, technical specs)
- **`architect.md`** - System Architect (design decisions, patterns)
- **`devops.md`** - DevOps Engineer (infrastructure, deployment)

### Tactical Agents (Story-Scoped)
Focus on specific repo(s), implement/test/document features.

- **`dev.md`** - Developer (feature implementation)
- **`tea.md`** - Test Engineer/Architect (testing, quality)
- **`reviewer.md`** - Code Reviewer (adversarial review, quality gates)
- **`tech-writer.md`** - Technical Writer (documentation)
- **`ux-designer.md`** - UX Designer (UI design, UX)

### Official Subagents (Haiku-based)
Lightweight subagents for mechanical tasks. Invoked via `Task tool` with `subagent_type`.

- **`workflow-status-check.md`** - Detect workflow state
- **`sm-work-research.md`** - Research stories and context
- **`sm-file-summary.md`** - Summarize file changes
- **`sm-story-setup.md`** - Claim Jira, write session, create branches
- **`sm-handoff.md`** - Handoff bookkeeping to TEA
- **`sm-finish-bookkeeping.md`** - Archive session, update sprint
- **`sm-finish-execution.md`** - Execute finish workflow
- **`generic-handoff.md`** - Workflow-driven handoff (replaces tea/dev/reviewer handoffs)
- **`reviewer-preflight.md`** - Gather review data
- **`testing-runner.md`** - Execute tests, report results

### Deprecated Handoffs (replaced by generic-handoff)
- `tea-handoff.md` - Now use `generic-handoff` with CURRENT_PHASE=red
- `dev-handoff.md` - Now use `generic-handoff` with CURRENT_PHASE=green
- `reviewer-handoff-approve.md` - Now use `generic-handoff` with VERDICT=approved
- `reviewer-handoff-reject.md` - Now use `generic-handoff` with VERDICT=rejected

## Context Loading

Agents load context based on their type:

### Strategic Agents Load:
- Full sprint status
- Both API and UI contexts
- Epic definitions
- Active work

### Tactical Agents Load:
- Story section of sprint status
- Active work
- Target repo context only (based on story)

**Configuration:** `../agent-scopes.yaml`

## Usage

### Activate an Agent

```bash
# Via workflow
@/pm
@/dev
@/tea

# Or mention in chat
"Let's activate the PM agent"
"Activate Dev to implement this story"
```

### Agent Files

Each agent file contains:
- **Persona:** Character and expertise
- **Responsibilities:** What they handle
- **Context:** Project information
- **Context Loading:** What files to load on activation
- **Activation:** How they operate
- **Workflows:** Common tasks and patterns
- **Handoffs:** How they coordinate with other agents

## File Structure

```
.claude/agents/
├── README.md                  # This file
│
│ # Main Agents (10)
├── orchestrator.md            # Master orchestrator
├── pm.md                      # Product Manager
├── sm.md                      # Scrum Master
├── architect.md               # System Architect
├── devops.md                  # DevOps Engineer
├── dev.md                     # Developer
├── tea.md                     # Test Engineer
├── reviewer.md                # Code Reviewer
├── tech-writer.md             # Technical Writer
├── ux-designer.md             # UX Designer
│
│ # Official Subagents (10 active + 4 deprecated)
├── workflow-status-check.md   # Detect workflow state
├── sm-work-research.md        # Research stories
├── sm-file-summary.md         # Summarize files
├── sm-story-setup.md          # Story setup
├── sm-handoff.md              # SM handoff
├── sm-finish-bookkeeping.md   # Archive session
├── sm-finish-execution.md     # Execute finish
├── generic-handoff.md         # Workflow-driven handoff (Story 31-10)
├── reviewer-preflight.md      # Review prep
├── testing-runner.md          # Run tests
│ # Deprecated (replaced by generic-handoff)
├── tea-handoff.md             # Use generic-handoff CURRENT_PHASE=red
├── dev-handoff.md             # Use generic-handoff CURRENT_PHASE=green
├── reviewer-handoff-approve.md # Use generic-handoff VERDICT=approved
└── reviewer-handoff-reject.md  # Use generic-handoff VERDICT=rejected
```

## Context Budget

Each agent is designed to work within **~500-800 line context budget**:

### Strategic Agent Budget
- Agent file: ~200-300 lines
- Sprint status: ~100-150 lines
- Repo contexts: ~60 lines
- Epics/docs: ~100 lines
- Active work: ~50 lines
- **Total:** ~500-660 lines

### Tactical Agent Budget
- Agent file: ~250-400 lines
- Sprint status (story): ~50 lines
- Active work: ~50 lines
- Target repo context: ~100 lines
- **Total:** ~450-600 lines

## Agent Coordination

### TDD Flow Handoffs

```
SM → TEA:      Story selected, write failing tests
TEA → Dev:     Tests written (RED), make them pass
Dev → Reviewer: Implementation done, review PR
Reviewer → SM: Story approved, finish it
Reviewer → Dev: Issues found, fix needed
```

### Strategic → Tactical Handoffs

```
PM → SM:     Epic needs stories
SM → TEA:    Story ready for tests
TEA → Dev:   Tests ready for implementation
Dev → Reviewer: PR ready for review
```

### Strategic ↔ Strategic Coordination

```
PM ↔ Architect:  Need design decisions
PM ↔ SM:         Story prioritization
SM ↔ Architect:  Technical approach
```

### Tactical → Strategic Feedback

```
Dev → SM:         Story blocked or needs clarification
TEA → SM:         Test coverage gaps identified
Reviewer → SM:    Code quality concerns
Tech Writer → SM: Documentation needs
```

## Creating New Agents

To add a new agent:

1. Create `.claude/agents/[name].md`
2. Follow existing agent structure
3. Add to `../agent-scopes.yaml`
4. Update this README
5. Create command in `.claude/commands/[name].md`

### Agent Template Structure

```markdown
# [Agent Name] Agent - [Role]

## Persona
[Character description and expertise]

## Responsibilities
[What they handle]

## Context
[Project information]

## Context Loading
[What files to load on activation]

## Activation
[How they operate]

## Key Workflows
[Common tasks]

## Handoffs
[Coordination with other agents]

## Activation Command
[@/agent-name]

## Exit
[How to exit agent mode]
```

## Benefits

✅ **Single Source of Truth** - All agents in one place
✅ **Coordinated Planning** - Strategic agents see full scope
✅ **Focused Implementation** - Tactical agents load only what they need
✅ **Clear Hierarchy** - Strategic coordinate, tactical execute
✅ **Scalable** - Easy to add new agents

## Path Standards

**IMPORTANT:** All agent commands use `$CLAUDE_PROJECT_DIR` for path references.

### Standard Pattern
```bash
# ✅ CORRECT - Use $CLAUDE_PROJECT_DIR
$CLAUDE_PROJECT_DIR/scripts/agent-session.sh start "Agent Name"
$CLAUDE_PROJECT_DIR/.session/{STORY_ID}-session.md

# ❌ WRONG - Don't use git rev-parse
$(git rev-parse --show-toplevel)/scripts/agent-session.sh

# ❌ WRONG - Don't hardcode paths
$CLAUDE_PROJECT_DIR/scripts/agent-session.sh
```

### Why $CLAUDE_PROJECT_DIR?
- `$(git rev-parse --show-toplevel)` doesn't work reliably in agent context
- Hardcoded paths break on different machines
- `$CLAUDE_PROJECT_DIR` is set by the environment and works consistently

### Usage in Agent Commands
All agent commands in `.claude/commands/` have been standardized to use `$CLAUDE_PROJECT_DIR`:
- Agent session registration
- Script execution
- File path references

## Quick Reference

```bash
# View agent scope configuration
cat .claude/guides/agent-scopes.yaml

# List all agents
ls .claude/agents/

# View agent definition
cat .claude/agents/pm.md

# Activate agent
@/pm
```

---

**Your coordinated Pennyfarthing agent system is ready!** 🎯
