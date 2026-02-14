# Workflow — Examples

## Listing & Viewing

```bash
# List all available workflows
.pennyfarthing/scripts/workflow/list-workflows.sh

# Show TDD workflow details
.pennyfarthing/scripts/workflow/show-workflow.sh tdd

# Show current session's workflow
.pennyfarthing/scripts/workflow/show-workflow.sh

# Show trivial workflow
.pennyfarthing/scripts/workflow/show-workflow.sh trivial
```

## Checking State (Python CLI)

```bash
# Check current workflow state
pf workflow check
pf workflow check --json

# Who owns the "review" phase in TDD?
pf workflow phase-check tdd review
# Returns: reviewer

# Who owns the "implement" phase in trivial?
pf workflow phase-check trivial implement
# Returns: dev

# Emit handoff marker for Cyclist
pf workflow handoff reviewer
```

## Stepped Workflows (BikeLane)

```bash
# Start architecture workflow in create mode (default)
.pennyfarthing/scripts/workflow/start-workflow.sh architecture

# Start in validate mode
.pennyfarthing/scripts/workflow/start-workflow.sh architecture --mode validate

# Check progress
.pennyfarthing/scripts/workflow/workflow-status.sh

# Resume after interruption
.pennyfarthing/scripts/workflow/resume-workflow.sh
.pennyfarthing/scripts/workflow/resume-workflow.sh architecture
```

## Phase Repair

```bash
# Preview phase fix
.pennyfarthing/scripts/workflow/fix-session-phase.sh 56-1 review --dry-run

# Fix phase to review (after Dev completed)
.pennyfarthing/scripts/workflow/fix-session-phase.sh 56-1 review

# Fix phase to approved (after Reviewer approved)
.pennyfarthing/scripts/workflow/fix-session-phase.sh 56-1 approved

# Using Jira key
.pennyfarthing/scripts/workflow/fix-session-phase.sh MSSCI-12190 approved
```

## Switching Workflow Mid-Session

1. Verify the target workflow exists:
   ```bash
   .pennyfarthing/scripts/workflow/show-workflow.sh trivial
   ```

2. Edit the session file:
   - Open `.session/{story-id}-session.md`
   - Change `**Workflow:**` line to new workflow name

3. Continue with the new workflow's agent sequence.

## Common Scenarios

### Story upgraded from trivial to TDD
```bash
# Check current state
pf workflow check --json
# Edit session to change workflow from trivial to tdd
# Fix phase to match where you are
.pennyfarthing/scripts/workflow/fix-session-phase.sh 56-1 red
```

### Agent activated on wrong phase
```bash
# Check who owns the current phase
pf workflow phase-check tdd review
# Returns: reviewer — hand off if you're not the reviewer
pf workflow handoff reviewer
```
