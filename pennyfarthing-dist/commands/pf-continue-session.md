---
description: Resume work from a saved checkpoint after context circuit breaker
---

# Continue Session

<purpose>
Recovery command for resuming work after the context circuit breaker (85% threshold) halts execution. Loads saved checkpoints and resumes the appropriate agent to continue where you left off.
</purpose>

<when-to-use>
- After context circuit breaker blocks further work
- After a session timeout or interruption
- When returning to work saved with `checkpoint_save`
- To recover from any context overflow situation
</when-to-use>

<usage>
```
/continue-session [--list] [--story-id ID]
```

| Option | Description |
|--------|-------------|
| (none) | Interactive: show checkpoints, let user choose |
| `--list` | Just display available checkpoints, don't restore |
| `--story-id ID` | Resume specific story directly (skip selection) |
</usage>

<on-invoke>

## Step 1: Check for Circuit Breaker Agent

First, check if the circuit breaker saved an active agent:

```bash
source "${PROJECT_ROOT:-.}/.pennyfarthing/scripts/lib/checkpoint.sh"
SAVED_AGENT=$(checkpoint_restore "circuit_breaker_agent")
if [[ -n "$SAVED_AGENT" ]]; then
    echo "Circuit breaker saved agent: $SAVED_AGENT"
else
    echo "No circuit breaker agent found"
fi
```

**If a saved agent is found:**
- Invoke that agent's command (e.g., `/sm`, `/dev`, `/tea`, `/reviewer`)
- The agent will be primed with FULL tier context (fresh session)
- This restores the exact agent that was active when the circuit breaker triggered

```markdown
## Circuit Breaker Recovery

The circuit breaker saved your active agent: **{SAVED_AGENT}**

Invoking `/{SAVED_AGENT}` to restore with full context...
```

Then invoke the Skill tool with skill="{SAVED_AGENT}" to activate the agent.

**If no saved agent**, continue to Step 2 below.

## Step 2: Scan for Checkpoints

Run bash to check for saved checkpoints:

```bash
CHECKPOINT_FILE="${PROJECT_ROOT:-.}/.session/checkpoints.log"
if [[ -f "$CHECKPOINT_FILE" ]]; then
    echo "=== Recent Checkpoints ==="
    tail -20 "$CHECKPOINT_FILE"
else
    echo "No checkpoints found."
fi
```

## Step 3: Parse and Present Options (if no saved agent)

If checkpoints exist, parse and present them:

```markdown
## Available Checkpoints

| # | Timestamp | Label | Data |
|---|-----------|-------|------|
| 1 | 2026-01-06T14:30:22Z | phase:3-4 | dev |
| 2 | 2026-01-06T14:28:15Z | context:3-4 | Working on continue-session command |

Which checkpoint would you like to restore? (Enter number or 'all' for most recent of each label)
```

Output `<!-- CYCLIST:CHOICES:checkpoint -->` marker, then use AskUserQuestion to let user choose.

## Step 4: Restore Checkpoint

Source the checkpoint utilities and restore:

```bash
# Source checkpoint utilities
source "${PROJECT_ROOT:-.}/.pennyfarthing/scripts/lib/checkpoint.sh"

# Restore by label
PHASE=$(checkpoint_restore "phase:${STORY_ID}")
CONTEXT=$(checkpoint_restore "context:${STORY_ID}")
FILES=$(checkpoint_restore "files:${STORY_ID}")

echo "Restored checkpoint:"
echo "  Phase: $PHASE"
echo "  Context: $CONTEXT"
echo "  Files: $FILES"
```

## Step 5: Find Session File

Look for the matching session file:

```bash
SESSION_FILE=".session/${STORY_ID}-session.md"
if [[ -f "$SESSION_FILE" ]]; then
    echo "Found session file: $SESSION_FILE"
    head -20 "$SESSION_FILE"
else
    echo "Warning: No session file found for story $STORY_ID"
fi
```

## Step 6: Resume Appropriate Agent

Based on the restored phase, invoke the appropriate agent:

| Phase | Agent | Command |
|-------|-------|---------|
| `setup` or `sm` | TEA | `/tea` |
| `tea` or `red` | Dev | `/dev` |
| `dev` or `green` | Reviewer | `/reviewer` |
| `review` | Reviewer | `/reviewer` |
| `approved` | SM | `/sm` (finish flow) |

Present to user:
```markdown
## Session Restored

**Story:** {STORY_ID} - {title from session}
**Phase:** {PHASE}
**Context:** {CONTEXT}

Ready to continue with **{Agent Name}**.

The checkpoint shows you were working on: {CONTEXT}

[Continue] [Show more details] [Cancel]
```

</on-invoke>

<checkpoint-labels>
Standard checkpoint labels include the story ID:

| Label Pattern | Purpose | Example |
|---------------|---------|---------|
| `circuit_breaker_agent` | **Auto-saved** by circuit breaker | `circuit_breaker_agent` → `dev` |
| `phase:{story-id}` | Workflow phase | `phase:3-4` → `dev` |
| `context:{story-id}` | Work summary | `context:3-4` → `Implementing validation` |
| `files:{story-id}` | Key files | `files:3-4` → `src/api.ts,src/utils.ts` |
| `branch:{story-id}` | Git branch | `branch:3-4` → `feat/3-4-session` |
</checkpoint-labels>

<no-checkpoints>
If no checkpoints are found:

```markdown
## No Checkpoints Found

No saved checkpoints exist in `.session/checkpoints.log`.

**Options:**
1. `/work` - Check for active session files
2. `/new-work` - Start fresh with a new story
3. Check git stash: `git stash list`
```
</no-checkpoints>

<stale-checkpoint-warning>
If checkpoint is older than 24 hours:

```markdown
## Stale Checkpoint Warning

The most recent checkpoint is from **{timestamp}** ({hours} hours ago).

The codebase may have changed significantly since then.

**Options:**
1. [Restore anyway] - Load this checkpoint
2. [Check git log] - See what changed since checkpoint
3. [Start fresh] - Begin new work with `/new-work`
```
</stale-checkpoint-warning>

<integration>
This command completes the circuit breaker workflow:

1. Agent works normally
2. Context reaches 85% → circuit breaker triggers
3. Circuit breaker **automatically saves** the active agent to `circuit_breaker_agent` checkpoint
4. User starts new Claude session
5. User runs `/continue-session`
6. Command reads `circuit_breaker_agent` checkpoint
7. Agent is invoked with `/{agent}` command → FULL tier context injection
8. Agent resumes with complete persona, behavior guide, and session context
</integration>

<reference>
- **Checkpoint API:** `.pennyfarthing/scripts/lib/checkpoint.sh`
- **Circuit Breaker:** `scripts/hooks/context-circuit-breaker.sh`
- **Related:** `/work`, `/new-work`
- **Session Files:** `.session/{story-id}-session.md`
</reference>
