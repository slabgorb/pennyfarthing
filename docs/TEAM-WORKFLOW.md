# Team Workflow Guide

Guide for teams using Pennyfarthing with multiple developers working on the same project.

## Story Claiming Workflow

### Conflict Prevention

Pennyfarthing uses Jira integration as the primary conflict prevention mechanism:

1. **Check availability** - Story must be unassigned in Jira
2. **Atomic claim** - SM claims story in Jira AND creates session simultaneously
3. **Exit codes signal state**:
   - Exit 0: Available or already yours
   - Exit 1: Assigned to someone else (BLOCKED)
   - Exit 2: Not synced to Jira (proceed locally)

### Claiming a Story

```bash
# Start new work - SM checks Jira before claiming
/pf-work

# SM will run:
.pennyfarthing/scripts/jira/jira-claim-story.sh MSSCI-10988 --claim
```

If story is already assigned:
```
WARNING: Story is assigned to: Jane Smith (jane@company.io)
```

The SM will not proceed if the story belongs to someone else.

### Sprint YAML Tracking

Stories track assignment in `sprint/current-sprint.yaml`:

```yaml
- id: 24-3
  title: "Diff history navigation"
  status: in-progress
  assigned_to: Keith Avery
  started: 2026-01-12
  jira: https://jira.example.com/browse/MSSCI-10991
```

## Parallel Work Patterns

### Using Git Worktrees

Work on multiple stories simultaneously using worktrees:

```bash
# Start parallel work on a new story
/pf-parallel-work

# List active worktrees
.pennyfarthing/scripts/git/worktree-manager.sh list

# Remove completed worktree
.pennyfarthing/scripts/git/worktree-manager.sh remove wt-5-3
```

### Worktree Isolation

Each worktree has:
- **Separate directory** - Independent working copy
- **Session file** - `.session/{story-id}-session.md` with `worktree: wt-X-Y`
- **Offset ports** - Prevents server conflicts

| Worktree | API Port | UI Port |
|----------|----------|---------|
| Main | 8080 | 5173 |
| wt-1 | 8082 | 5175 |
| wt-2 | 8084 | 5177 |

### Session File Example

```markdown
# Story 36-2: Feature Implementation

## Worktree Context
worktree: wt-36-2
path: /path/to/worktrees/wt-36-2
api_port: 8082
ui_port: 5175

## Story Info
- Status: in_progress
- Phase: dev
- Assigned to: Keith Avery
```

## Conflict Avoidance Strategies

### 1. Jira Integration Lock

The primary mechanism - story assignment in Jira prevents duplicate work:

```bash
# jira-claim-story.sh logic
if [ "$ASSIGNEE" = "Unassigned" ]; then
    # Story is available - claim it
    jira issue assign "$KEY" "$(jira me)"
    exit 0
elif [ "$ASSIGNEE_EMAIL" = "$CURRENT_USER" ]; then
    # Already yours
    exit 0
else
    # Someone else has it - STOP
    exit 1
fi
```

### 2. Session File State Detection

The `workflow-status-check` subagent detects current state:

```yaml
Task tool:
  subagent_type: "workflow-status-check"
  prompt: "Check workflow state"
```

Returns:
- `FINISH_STATE` - Ready to complete
- `NEW_WORK_STATE` - No active work
- `IN_PROGRESS_STATE` - Work ongoing

### 3. Assessment-First Protocol

Agents must write assessments BEFORE handoffs:

```markdown
## Dev Assessment

**Story:** 5-2
**Tests:** All passing
**Implementation:** Complete
**Ready for review:** Yes
```

Handoff subagent verifies:
```bash
grep -q "## Dev Assessment" .session/{STORY_ID}-session.md
```

### 4. Worktree Isolation

Separate directories prevent branch conflicts:
- No `git checkout` switching
- Independent session files
- Parallel TDD flows

### 5. Sprint YAML as Source of Truth

Single `sprint/current-sprint.yaml` tracks all stories:

```yaml
stories:
  - id: 5-2
    status: in-progress
    assigned_to: Keith Avery

  - id: 5-3
    status: review
    assigned_to: Jane Smith
```

## Team Communication Patterns

### Handoff Between Developers

When one developer needs to hand off to another:

1. **Complete current phase** - Finish TEA, Dev, or Review
2. **Update session file** - Document current state
3. **Unassign in Jira** - Allow colleague to claim
4. **Commit and push** - All work on branch

```bash
# Unassign story (allows teammate to claim)
jira issue assign MSSCI-10988 -u ""
```

### Shared vs Personal Configuration

| Type | Location | Shared? |
|------|----------|---------|
| Sprint data | `sprint/current-sprint.yaml` | Yes (git) |
| Session files | `.session/*.md` | Yes (git) |
| Settings/Theme | `.pennyfarthing/config.local.yaml` | No (gitignored) |

### Sprint File Conflicts

When multiple developers update `sprint/current-sprint.yaml`:

```bash
# Pull before making changes
git pull origin develop

# Make your updates
# ... edit sprint/current-sprint.yaml ...

# Commit immediately
git add sprint/current-sprint.yaml
git commit -m "chore: update sprint status"
git push
```

## Fan-Out/Fan-In for Parallel Tasks

### Independent Work Items

For tasks that can run in parallel (e.g., testing multiple repos):

```yaml
# Fan-out: Start parallel tasks
Task:
  subagent_type: "testing-runner"
  description: "Test API"
  prompt: REPOS: api

Task:
  subagent_type: "testing-runner"
  description: "Test UI"
  prompt: REPOS: ui

Task:
  subagent_type: "testing-runner"
  description: "Test shared"
  prompt: REPOS: shared
```

All three execute concurrently.

### Background Execution

For long-running tasks:

```yaml
# Start background
Task:
  subagent_type: "testing-runner"
  run_in_background: true
  prompt: REPOS: api

# Continue other work...

# Collect results when ready
TaskOutput:
  task_id: "abc123"
  block: true
  timeout: 120000
```

## Permission Scopes

### Strategic vs Tactical Agents

| Scope | Agents | Permissions |
|-------|--------|-------------|
| Full (Strategic) | SM, PM, Orchestrator | Edit sprint/**, .session/** |
| Story (Tactical) | Dev, TEA, Reviewer | Edit src/**, .session/current |

This prevents developers from accidentally modifying each other's work.

### Example Scope Definition

```yaml
dev:
  scope: story
  permissions:
    - Read              # Read any file
    - Grep              # Search contents
    - Bash              # Execute commands
    - Edit(src/**)      # Edit source code
    - Edit(.session/**) # Edit own session
```

## Workflow Example: Two Developers

### Developer A starts Story 5-2

```bash
# Dev A claims via SM
/pf-work
# Select story 5-2
# SM claims in Jira, creates session file
```

### Developer B starts Story 5-3

```bash
# Dev B claims different story
/pf-work
# Select story 5-3
# SM claims in Jira (different story - no conflict)
```

### Developer B tries to claim 5-2

```bash
/pf-work
# Select story 5-2

# SM checks Jira:
# "Story 5-2 is assigned to Developer A (devA@company.io)"
# "Please select a different story or coordinate with Developer A"
```

## Best Practices

### 1. Claim Before Working

Always use `/pf-work` to claim stories through Jira. Don't start work without claiming.

### 2. Push Frequently

Keep branches up to date:
```bash
git push -u origin feat/5-2-feature-name
```

### 3. Complete Phases

Finish one phase before context switching:
- Complete TEA tests before moving to another story
- Finish Dev implementation before switching

### 4. Update Sprint Status

Keep `sprint/current-sprint.yaml` current:
```yaml
- id: 5-2
  status: review  # Update when phase changes
```

### 5. Communicate Blockers

If blocked, document in session file:
```markdown
## Blockers
- Waiting for API endpoint from backend team
- Need design clarification on error states
```

### 6. Clean Up Worktrees

Remove worktrees when stories complete:
```bash
.pennyfarthing/scripts/git/worktree-manager.sh remove wt-5-2
```

## See Also

- [Jira Integration](JIRA-INTEGRATION.md) - Jira CLI and sync patterns
- [Workflows](WORKFLOWS.md) - TDD workflow documentation
- [Custom Agents](CUSTOM-AGENTS.md) - Agent handoff patterns
