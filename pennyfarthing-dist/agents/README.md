# Pennyfarthing Core Agents

## Overview

This directory contains the **single source of truth** for all Pennyfarthing agent definitions. Agents are coordinated across both `API` and `UI` repositories.

**See:** `../ AGENT-COORDINATION.md` for complete architecture documentation.

## Main Agents

| Agent | Role |
|-------|------|
| **SM** | Story coordination, session management |
| **TEA** | Test writing, TDD guidance |
| **Dev** | Feature implementation |
| **Reviewer** | Adversarial code review |
| **Orchestrator** | Process improvement, meta-ops |
| **PM** | Planning, prioritization |
| **Architect** | System design, ADRs |
| **DevOps** | Infrastructure, deployment |
| **Tech Writer** | Documentation |
| **UX Designer** | UI design, accessibility |

### Official Subagents (Haiku-based)
Lightweight subagents for mechanical tasks. Invoked via `Task tool` with `subagent_type: "general-purpose"` and `model: "haiku"`.

**Invocation pattern:**
```yaml
Task tool:
  subagent_type: "general-purpose"
  model: "haiku"
  run_in_background: true   # For independent work; omit for sequential workflows
  prompt: |
    Read and follow: .pennyfarthing/agents/{subagent-name}.md

    {PARAMETERS}
```

**See `agent-behavior.md` → "Interactive Background Task Protocol"** for when to use background vs foreground execution.

- **`workflow-status-check.md`** - Detect workflow state
- **`sm-setup.md`** - Research OR setup mode (Story 31-11)
- **`sm-finish.md`** - Preflight OR execute phase (Story 31-11)
- **`handoff.md`** - Workflow-driven handoff (Stories 31-7, 31-10)
- **`sm-handoff.md`** - SM→TEA/Dev handoff with Jira/branch verification
- **`sm-file-summary.md`** - Summarize file changes
- **`reviewer-preflight.md`** - Gather review data
- **`testing-runner.md`** - Execute tests, report results

### Removed Files (Stories 31-11, 31-12)
These files have been deleted and replaced by consolidated versions:

**SM Subagents (Story 31-12):**
- `sm-work-research.md` → use `sm-setup` with MODE=research
- `sm-story-setup.md` → use `sm-setup` with MODE=setup
- `sm-finish-bookkeeping.md` → use `sm-finish` with PHASE=preflight
- `sm-finish-execution.md` → use `sm-finish` with PHASE=execute

**Handoff Subagents (Story 31-11):**
- `tea-handoff.md` → use `handoff` with CURRENT_PHASE=red
- `dev-handoff.md` → use `handoff` with CURRENT_PHASE=green
- `reviewer-handoff-approve.md` → use `handoff` with VERDICT=approved
- `reviewer-handoff-reject.md` → use `handoff` with VERDICT=rejected

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

**Configuration:** `.claude/project/docs/agent-scopes.yaml`

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
.pennyfarthing/agents/
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
│ # Official Subagents (8 active)
├── workflow-status-check.md   # Detect workflow state
├── sm-setup.md        # Research or setup mode (Story 31-11)
├── sm-finish.md       # Preflight or execute (Story 31-11)
├── handoff.md         # Workflow-driven handoff (Stories 31-7, 31-10)
├── sm-handoff.md              # SM→TEA/Dev handoff with Jira/branch
├── sm-file-summary.md         # Summarize files
├── reviewer-preflight.md      # Review prep
└── testing-runner.md          # Run tests
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

## Common Handoffs

```
SM → TEA/Dev:    Story setup complete
TEA → Dev:       Tests written
Dev → Reviewer:  Implementation complete
Reviewer → SM:   Story approved
Reviewer → Dev:  Changes requested
```

## Creating New Agents

1. Create `.pennyfarthing/agents/[name].md`
2. Follow existing agent structure
3. Update this README
4. Create command in `.claude/commands/[name].md`

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
# ✅ CORRECT - Use $CLAUDE_PROJECT_DIR with run.sh
$CLAUDE_PROJECT_DIR/scripts/run.sh core/agent-session.sh start "Agent Name"
$CLAUDE_PROJECT_DIR/.session/{STORY_ID}-session.md

# ❌ WRONG - Don't use git rev-parse (unreliable in agent context)
$(git rev-parse --show-toplevel)/scripts/run.sh core/agent-session.sh

# ❌ WRONG - Don't hardcode absolute paths
/Users/someone/project/scripts/run.sh core/agent-session.sh
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

## Background Subagent Execution

Subagents can run in background using Claude Code's `run_in_background` parameter. This allows the user to continue interacting while slow operations complete asynchronously.

**IMPORTANT:** See `agent-behavior.md` → "Interactive Background Task Protocol" for the authoritative guidance.

### The Key Insight

**Background + immediate blocking is an anti-pattern.** If you spawn with `run_in_background: true` then immediately call `TaskOutput` with `block: true`, you've blocked the conversation - the user can't interact.

### When to Use Background Execution

**Good candidates (truly independent work):**
- Test runs while writing more code
- Multiple independent file explorations
- Long-running builds while discussing next steps
- Parallel searches where you don't need results immediately

**When NOT to use (sequential workflow):**
- Status checks that determine your next action
- Handoff operations that must complete before continuing
- Any operation where you need the result to proceed

### Cyclist Integration

When running in Cyclist, background tasks are automatically tracked:
- OTEL spans detect `run_in_background: true` Task calls
- Completion notifications appear in MessageView
- User can expand to see full output

**This means:** Fire the task, tell the user it's running, and keep working. Cyclist handles the notification when it finishes.

### Tracking Background Tasks in Session Files

Use the background task tracking utilities to manage session file entries:

```bash
source $CLAUDE_PROJECT_DIR/scripts/utils/background-tasks.sh
SESSION_FILE="$CLAUDE_PROJECT_DIR/.session/${STORY_ID}-session.md"

# After spawning, record the task:
bg_task_add "$SESSION_FILE" "$TASK_ID" "testing-runner" "Background test run"

# After checking TaskOutput, update status:
bg_task_update "$SESSION_FILE" "$TASK_ID" "completed"  # or "error"

# Clean up finished tasks:
bg_task_cleanup "$SESSION_FILE"
```

**Available functions:**
| Function | Purpose |
|----------|---------|
| `bg_task_add` | Record new background task |
| `bg_task_update` | Update task status (running/completed/error) |
| `bg_task_cleanup` | Remove completed and errored tasks |
| `bg_task_list` | Show all running tasks |
| `bg_task_check` | Return 0 if any tasks running |
| `bg_task_summary` | Print counts by status |

### Background Execution Constraints

1. **No concurrent state mutation** - Don't have multiple background tasks writing to the same file
2. **Independent operations only** - Each background task should be self-contained
3. **Check before proceeding** - If you need the result, wait for it with `block: true`
4. **Clean up tracking** - Use `bg_task_cleanup` after processing results

### Example: Background Tests While Coding

```bash
# 1. Spawn testing-runner with run_in_background: true
# 2. Record: bg_task_add "$SESSION_FILE" "$TASK_ID" "testing-runner" "Tests while coding"
# 3. Continue writing code
# 4. Periodically check TaskOutput with block: false
# 5. When complete: bg_task_update "$SESSION_FILE" "$TASK_ID" "completed"
# 6. Cleanup: bg_task_cleanup "$SESSION_FILE"
# 7. If RED: stop and fix
# 8. If GREEN: continue with confidence
```

## Quick Reference

```bash
# View agent scope configuration
cat .claude/project/docs/agent-scopes.yaml

# List all agents
ls .pennyfarthing/agents/

# View agent definition
cat .pennyfarthing/agents/pm.md

# Activate agent
@/pm
```

---

**Your coordinated Pennyfarthing agent system is ready!**
