---
description: Start a new work session with Pennyfarthing
---

# Start New Work Session

<agent-activation>
**FIRST:** Use Bash tool to run:
```bash
d="$PWD"; while [[ ! -d "$d/.claude" ]] && [[ "$d" != "/" ]]; do d="$(dirname "$d")"; done; "$d/.claude/scripts/run.sh" agent-session.sh start "sm"
```
This finds the project root and loads your persona. Adopt the character shown in the output.
</agent-activation>

<purpose>
The blessed path for starting development work. Loads SM persona and coordinates story selection and TDD flow setup.
</purpose>

<critical-reminder>
**SM does NOT code.** SM coordinates story setup and hands off to Dev or TEA.
Even trivial 1-2 point stories require handoff - SM creates context, Dev implements.
</critical-reminder>

<on-invoke>
After loading persona, execute this sequence in order:

## Step 1: Status Check (REQUIRED)
```yaml
Task tool:
  subagent_type: "workflow-status-check"
  prompt: |
    CALLING_AGENT: SM
```

Based on result:
- `FINISH_STATE` → Go to Finish Flow
- `NEW_WORK_STATE` → Continue to Step 2
- `IN_PROGRESS_STATE` → Report status, ask user what to do

## Step 2: Research Backlog
```yaml
Task tool:
  subagent_type: "generic-sm-setup"
  prompt: |
    MODE: research
```

Present available stories to user, get selection.

## Step 3: File Summary
```yaml
Task tool:
  subagent_type: "sm-file-summary"
  prompt: |
    STORY_ID: {selected-story}
    FILE_LIST: |
      {relevant files}
```

## Step 4: Write Story Context (SM does this directly)
Write `.session/context-story-{X-Y}.md` with:
- Story overview, technical approach, files to modify, ACs

## Step 5: Story Setup
```yaml
Task tool:
  subagent_type: "generic-sm-setup"
  prompt: |
    MODE: setup
    STORY_ID: {value}
    JIRA_KEY: {value}
    REPOS: {value}
    SLUG: {value}
    ASSIGNEE: {user name}
    SESSION_CONTENT: |
      {session file content}
```

## Step 6: Handoff
```yaml
Task tool:
  subagent_type: "sm-handoff"
  prompt: |
    STORY_ID: {value}
    REPOS: {value}
    TITLE: {value}
    AC_COUNT: {value}
    BRANCH_NAME: {value}
    JIRA_KEY: {value}
```

## Step 7: Invoke Next Agent
After handoff complete:
- Trivial (1-2 pts): Invoke `/dev`
- Standard (3+ pts): Invoke `/tea`
</on-invoke>

<workflow-states>
| State | Action |
|-------|--------|
| MISSING_EPIC_CONTEXT | Prompt user to run `/start-epic` first |
| FINISH_STATE | SM handles finish flow (archive, Jira, cleanup) |
| NEW_WORK_STATE | Research → present stories → create context → setup → handoff |
</workflow-states>

<gates>
**Before handoff, verify:**
- [ ] Session file exists at `.session/{story-id}-session.md`
- [ ] Story context written with ACs
- [ ] Jira claimed (or explicitly skipped)
- [ ] Branch created

Do NOT proceed to coding. Always hand off.
</gates>

<tdd-flow>
| Points | Route |
|--------|-------|
| 1-2 pts | SM → Dev (skip TEA) |
| 3-5 pts | SM → TEA → Dev → Reviewer |
| 8+ pts | SM → TEA → Dev → Reviewer |
</tdd-flow>

<reference>
- **SM Agent:** `.claude/agents/sm.md`
- **Subagents:** `workflow-status-check`, `generic-sm-setup`, `generic-sm-finish`, `sm-file-summary`, `sm-handoff`
</reference>
