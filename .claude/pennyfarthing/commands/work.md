---
description: Resume work or start new - smart entry point that picks up where you left off
---

# Resume or Start Work

<agent-activation>
**FIRST:** Use Bash tool to run:
```bash
d="$PWD"; while [[ ! -d "$d/.claude" ]] && [[ "$d" != "/" ]]; do d="$(dirname "$d")"; done; "$d/scripts/run.sh" agent-session.sh start "orchestrator"
```
This finds the project root and loads your persona. Adopt the character shown in the output.
</agent-activation>

<purpose>
Smart entry point for picking up work after a break. Detects current workflow state and launches the appropriate agent to continue, or starts new work if nothing is in progress.
</purpose>

<workflow>
1. Spawn `workflow-status-check` subagent to scan state
2. Based on detected state, take action:

| State | Action |
|-------|--------|
| **IN_PROGRESS_STATE** | Show story, suggest agent based on phase |
| **FINISH_STATE** | Invoke SM to complete the story |
| **NEW_WORK_STATE** | Invoke `/new-work` to pick up a new story |
| **MISSING_EPIC_CONTEXT** | Prompt user to run `/start-epic` first |
</workflow>

<phase-to-agent>
When IN_PROGRESS_STATE, map the phase to the next agent:

| Phase | Agent to Invoke | What They Do |
|-------|-----------------|--------------|
| `sm` or `setup` | `/tea` | Write failing tests (RED) |
| `tea` or `red` | `/dev` | Implement to pass tests (GREEN) |
| `dev` or `green` | `/reviewer` | Code review |
| `review` | `/reviewer` | Continue review |
| `approved` | `/sm` | Finish story (archive, Jira, cleanup) |
</phase-to-agent>

<on-invoke>
**Step 1:** Run workflow status check

```
Task tool:
  subagent_type: "workflow-status-check"
  prompt: "Scan workflow state for /work command"
```

**Step 2:** Present findings to user

Example output:
```markdown
## Current Work Status

**Story 5-2:** Add 'pennyfarthing theme set' command
**Phase:** dev (GREEN)
**Status:** Tests passing, implementation complete
**Days Active:** 1

### Suggested Action
Continue with **Reviewer** to get code review.

Ready to continue? [Yes, invoke /reviewer] [No, show me options]
```

**Step 3:** On confirmation, invoke the appropriate agent

- If user confirms: invoke the suggested agent
- If user wants options: show all available actions
</on-invoke>

<no-work-found>
If no active session files exist:

```markdown
## No Active Work Found

No stories currently in progress.

**Options:**
1. `/new-work` - Pick up a story from the backlog
2. `/sprint-context` - Review current sprint status first
```

Then invoke `/new-work` or wait for user choice.
</no-work-found>

<multiple-sessions>
If multiple session files exist (parallel work):

```markdown
## Multiple Work Sessions Found

| # | Story | Phase | Worktree | Days |
|---|-------|-------|----------|------|
| 1 | 5-2 Theme Set | dev | main | 2 |
| 2 | 5-3 Theme Create | tea | wt-5-3 | 1 |

Which would you like to continue?
```

Use AskUserQuestion to let user choose, then invoke appropriate agent.
</multiple-sessions>

<reference>
- **Subagent:** `workflow-status-check.md`
- **Related:** `/new-work`, `/sm`, `/tea`, `/dev`, `/reviewer`
</reference>
