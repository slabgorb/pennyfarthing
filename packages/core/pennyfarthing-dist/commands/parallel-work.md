---
description: Start parallel work in a new worktree
---

```bash
./scripts/run.sh core/agent-session.sh start "parallel-work"
```

<parallel-work-flow>
## Parallel Work Setup

Start a new story in a worktree while keeping main checkout intact.

### Step 1: Create Worktree

```bash
# Get story info from user
read -p "Story ID (e.g., 5-3a): " STORY_ID
read -p "Branch name (e.g., feat/5-3a-feature): " BRANCH_NAME

# Create worktree
WORKTREE_NAME="wt-${STORY_ID}"
./scripts/run.sh git/worktree-manager.sh create "$WORKTREE_NAME" "$BRANCH_NAME"

# Get port configuration
eval $(./scripts/run.sh git/worktree-manager.sh ports "$WORKTREE_NAME")
```

### Step 2: Create Session File

Create `.session/${STORY_ID}-session.md` with:

```markdown
# Story ${STORY_ID}: [Title]

## Worktree Context
worktree: ${WORKTREE_NAME}
path: ${WORKTREE_PATH}
api_port: ${API_PORT}
ui_port: ${UI_PORT}

## Story Info
- **Epic:** [from sprint]
- **Points:** [from sprint]
- **Repos:** Both

## Phase
sm

## Status
setup

## Acceptance Criteria
- [ ] AC1
- [ ] AC2
```

### Step 3: Hand to SM

Invoke SM to complete story setup in the worktree context.
</parallel-work-flow>

<agent-activation>
1. Load persona from theme config → `agents.sm`
2. Load and follow `.pennyfarthing/agents/sm.md`
3. SM will detect worktree session and work in that context
</agent-activation>

<agent-exit>
On exit: Capture learnings to sidecar, run `run.sh core/agent-session.sh stop`
</agent-exit>
