# Workflow — Examples

## Listing & Viewing

```bash
# List all available workflows
pf.sh workflow list

# Show TDD workflow details
pf.sh workflow show tdd

# Show current session's workflow
pf.sh workflow show

# Show trivial workflow
pf.sh workflow show trivial
```

## Checking State

```bash
# Check current workflow state
pf.sh workflow check
pf.sh workflow check --json

# Who owns the "review" phase in TDD?
pf.sh workflow phase-check tdd review
# Returns: reviewer

# Who owns the "implement" phase in trivial?
pf.sh workflow phase-check trivial implement
# Returns: dev

# Get workflow type
pf.sh workflow type tdd
# Returns: phased

pf.sh workflow type architecture
# Returns: stepped

# Emit handoff marker for Cyclist
pf.sh workflow handoff reviewer
```

## Stepped Workflows (BikeLane)

```bash
# Start architecture workflow in create mode (default)
pf.sh workflow start architecture

# Start in validate mode
pf.sh workflow start architecture --mode validate

# Check progress
pf.sh workflow status

# Resume after interruption
pf.sh workflow resume
pf.sh workflow resume architecture

# Complete current step and advance
pf.sh workflow complete-step
pf.sh workflow complete-step architecture --step 3
```

## Phase Repair

```bash
# Preview phase fix
pf.sh workflow fix-phase 56-1 review --dry-run

# Fix phase to review (after Dev completed)
pf.sh workflow fix-phase 56-1 review

# Fix phase to approved (after Reviewer approved)
pf.sh workflow fix-phase 56-1 approved

# Using Jira key
pf.sh workflow fix-phase MSSCI-12190 approved
```

## Switching Workflow Mid-Session

1. Verify the target workflow exists:
   ```bash
   pf.sh workflow show trivial
   ```

2. Edit the session file:
   - Open `.session/{story-id}-session.md`
   - Change `**Workflow:**` line to new workflow name

3. Continue with the new workflow's agent sequence.

## Common Scenarios

### Story upgraded from trivial to TDD
```bash
# Check current state
pf.sh workflow check --json
# Edit session to change workflow from trivial to tdd
# Fix phase to match where you are
pf.sh workflow fix-phase 56-1 red
```

### Agent activated on wrong phase
```bash
# Check who owns the current phase
pf.sh workflow phase-check tdd review
# Returns: reviewer — hand off if you're not the reviewer
pf.sh workflow handoff reviewer
```
