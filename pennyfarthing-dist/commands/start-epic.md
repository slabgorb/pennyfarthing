---
description: Start an epic - move to current sprint and generate tech context
---

# Start Epic Workflow

**This command prepares an epic for development by moving it to the current sprint and generating technical context.**

## What This Does

1. **Validates** the epic exists in backlog or current sprint
2. **Moves** the epic to current sprint if not already there
3. **Runs** the SM agent's `epic-tech-context` task to generate technical specifications

## Prerequisites

```bash
cd $CLAUDE_PROJECT_DIR

# Verify sprint files exist
if [ ! -f "sprint/current-sprint.yaml" ] || [ ! -f "sprint/backlog.yaml" ]; then
    echo "ERROR: Sprint files not found"
    exit 1
fi

echo "Sprint files found - ready to start epic"
```

## Usage

Provide the epic ID when invoking this command:
- `epic-5` - Pennyfarthing epic (format: `epic-N`)

## Workflow Steps

### Step 0: Clean Previous Work Artifacts

Before starting a new epic, clean up stale artifacts from previous work:

```bash
cd $CLAUDE_PROJECT_DIR

# Run conservative cleanup (7+ day old artifacts)
$CLAUDE_PROJECT_DIR/scripts/run.sh misc/session-cleanup.sh --dry-run

# If dry-run looks good, run actual cleanup
$CLAUDE_PROJECT_DIR/scripts/run.sh misc/session-cleanup.sh

# Archive epic contexts for completed epics
$CLAUDE_PROJECT_DIR/scripts/run.sh misc/session-cleanup.sh --aggressive
```

This ensures a clean slate before starting new epic work and archives contexts from completed epics.

### Step 1: Identify Epic

Ask the user for the epic ID if not provided:
> "Which epic would you like to start? (e.g., epic-5, sim-epic-10)"

### Step 2: Check Epic Location

```bash
cd $CLAUDE_PROJECT_DIR

# Check if epic is in current sprint
if grep -q "^$EPIC_ID:" sprint/current-sprint.yaml; then
    echo "Epic $EPIC_ID is already in current sprint"
    EPIC_LOCATION="current"
elif grep -q "^$EPIC_ID:" sprint/backlog.yaml; then
    echo "Epic $EPIC_ID found in backlog - will move to current sprint"
    EPIC_LOCATION="backlog"
else
    echo "ERROR: Epic $EPIC_ID not found in sprint files"
    exit 1
fi
```

### Step 3: Move Epic to Current Sprint (if needed)

If the epic is in backlog:

1. **Extract** the epic block from `sprint/backlog.yaml`
2. **Add** the epic to `sprint/current-sprint.yaml` under the active work section
3. **Update** the epic status from `backlog` or `planned` to `in-progress`
4. **Remove** the epic from `sprint/backlog.yaml`

**Format for current-sprint.yaml:**
```yaml
  # ===========================================================================
  # EPIC [N]: [Name]
  # ===========================================================================
  - id: MSSCI-XXXXX
    type: epic
    title: "Epic: [Name]"
    points: [total_pts]
    completed_points: 0
    priority: P1
    status: in_progress
    stories:
      # Stories added during tech context generation
      - id: MSSCI-XXXXX
        title: "[Story title]"
        points: [N]
        priority: P2
        status: backlog
        repos: [cyclist|pennyfarthing|both]
        workflow: [tdd|trivial|agent-docs]
        acceptance_criteria:
          - [AC 1]
          - [AC 2]
```

### Step 4: Generate Epic Tech Context

Invoke the SM agent with the `epic-tech-context` task:

**Run:** `/sm` with task: `epic-tech-context` for epic `$EPIC_ID`

The SM agent will:
1. Load the epic details from current sprint
2. Analyze the codebase for relevant files
3. Generate technical context including:
   - Current state analysis
   - Technical approach
   - File modifications needed
   - API/UI changes
   - Database changes
   - Testing strategy
   - Story breakdown with acceptance criteria
4. Save context to `.session/context-epic-$EPIC_ID.md`

### Step 5: Confirm Ready

After tech context is generated:

```
✅ Epic $EPIC_ID is ready for development

Next steps:
1. Review the tech context: cat .session/context-epic-$EPIC_ID.md
2. Start first story: /new-work
3. SM will select from this epic's stories
```

## Example

```bash
# User invokes: /start-epic epic-5

# Output:
# → Checking epic-5 location...
# → Epic epic-5 found in backlog
# → Moving epic-5 to current sprint...
# → Updating status to in-progress...
# → Invoking SM for epic-tech-context...
# → [SM generates technical context]
# → ✅ Epic epic-5 is ready for development
```

## Notes

- This command does NOT start a story - use `/new-work` for that
- The epic tech context provides the foundation for story-level work
- Stories within the epic will be worked via the normal TDD flow

---

**Flow:** `/start-epic` → SM (epic-tech-context) → `/new-work` → TDD cycle
