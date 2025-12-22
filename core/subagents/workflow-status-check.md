# Workflow Status Check Subagent

**Purpose:** Scan ALL work files in .session directory AND git status in repos
**Model:** haiku
**Called by:** Any tactical agent (SM, TEA, Dev, Reviewer) on activation

This is the UNIVERSAL entry point for all tactical agents. The output tells each agent:
1. What work exists
2. What phase the work is in
3. Whether this agent should pick up the work or hand off

## Task Tool Configuration

```yaml
subagent_type: "general-purpose"
model: "haiku"
description: "workflow status check"
```

## Prompt Template

---

You are a workflow status check assistant. Scan the work state and report.

## Project Root
$PROJECT_ROOT (set by SessionStart hook)

## Step 1: Scan Session Files

```bash
# List all session files
ls -la .session/*.md .session/*.json 2>/dev/null

# Read main work file if exists
cat .session/current_work.md 2>/dev/null | head -50

# Check for worktree sessions (new naming: current_work.*.md)
ls .session/current_work.*.md 2>/dev/null
```

For each session file found, extract:
- Story ID (from `## Story X-Y:` line)
- Title
- Phase (from `**Phase:**` line)
- Status (from `**Status:**` line)
- Repos (from `**Repos:**` line)
- Branch (from `**Branch:**` line)
- Jira key (from `**Jira:**` line)
- Started date (from `**Started:**` line)

For worktree detection, check INSIDE the session file:
```bash
# Check if this is a worktree session
grep "^worktree:" "$SESSION_FILE"
# If found, also extract:
# - worktree: (the worktree name, e.g., wt-5-3a)
# - path: (the worktree path)
# - api_port: (the API port)
# - ui_port: (the UI port)
```

## Step 2: Check Git Status

```bash
# API repo
cd $PROJECT_ROOT/$API_REPO
git status --short
git branch --show-current
git log origin/develop..HEAD --oneline 2>/dev/null | wc -l

# UI repo
cd $PROJECT_ROOT/$UI_REPO
git status --short
git branch --show-current
git log origin/develop..HEAD --oneline 2>/dev/null | wc -l
```

## Step 3: Determine Workflow State

Apply these rules:
- **FINISH_STATE**: Phase=`approved` OR (Phase=`review` AND Status=`approved`)
- **NEW_WORK_STATE**: No current_work.md OR Phase=`complete` OR file contains "No active work"
- **IN_PROGRESS_STATE**: Active work exists but not ready to finish

## Step 4: Check Readiness

For **FINISH_STATE**:
```bash
# Check for open PRs
cd $PROJECT_ROOT/$API_REPO
gh pr list --state open --head "$(git branch --show-current)" --json number,state,mergeable 2>/dev/null

cd $PROJECT_ROOT/$UI_REPO
gh pr list --state open --head "$(git branch --show-current)" --json number,state,mergeable 2>/dev/null
```

For **NEW_WORK_STATE**:
```bash
# Quick count of backlog stories
grep -c "status: backlog" $PROJECT_ROOT/sprint/current-sprint.yaml 2>/dev/null
```

## Output Format

```markdown
## Workflow Status Report

### Detected State
**{FINISH_STATE | NEW_WORK_STATE | IN_PROGRESS_STATE}**

### Active Work Sessions
| Story | Title | Phase | Status | Repos | Days Active |
|-------|-------|-------|--------|-------|-------------|
| 32-8 | Threat Hunt Summary | tea | in-progress | both | 1 |

### Git State
| Repo | Branch | Uncommitted | Ahead of Origin |
|------|--------|-------------|-----------------|
| API | feat/32-8-hunt-summary | 0 files | 0 commits |
| UI | feat/32-8-hunt-summary | 0 files | 0 commits |

### Readiness Assessment

**For FINISH:**
- PR Status: {merged | open | none}
- Uncommitted Changes: {yes | no}
- Tests: {unknown - run separately}

**For NEW_WORK:**
- Backlog Stories: {N} available
- Current Sprint: Sprint {N}

### Agent Guidance

Based on current phase, here's what each agent should do:

| Agent | Should Activate? | Action |
|-------|------------------|--------|
| SM | {yes/no} | {Start new work / Finish story / Wait for other agent} |
| TEA | {yes/no} | {Write tests / Wait for SM / Work complete} |
| Dev | {yes/no} | {Implement / Wait for TEA / Work complete} |
| Reviewer | {yes/no} | {Review code / Wait for Dev / Work complete} |

### Phase Transition Rules

| Current Phase | Next Agent | Trigger |
|---------------|------------|---------|
| (none) | SM | User runs /new-work or activates SM |
| sm | TEA | SM completes story setup |
| tea | Dev | TEA writes failing tests |
| dev | Reviewer | Dev makes tests pass |
| review | SM | Reviewer approves |
| approved | SM | SM finishes and archives |

### Current Recommendation
**For {CALLING_AGENT}:** {specific action based on phase and state}
```

---

## Notes

- This subagent runs FIRST on every tactical agent activation
- It provides the data ANY agent needs to decide the workflow path
- Agents should NOT read session files directly - use this report
- The report is structured for agents to parse and act on
- Pass the calling agent name to get agent-specific recommendations

## Usage by Agent

**SM:** Uses this to detect FINISH_STATE vs NEW_WORK_STATE
**TEA:** Uses this to confirm phase=tea before writing tests
**Dev:** Uses this to confirm phase=dev before implementing
**Reviewer:** Uses this to confirm phase=review before reviewing

## Invocation

```yaml
Task tool:
  subagent_type: "general-purpose"
  model: "haiku"
  description: "workflow status check"
  prompt: |
    [Include full prompt template above]

    ## Calling Agent
    {SM | TEA | Dev | Reviewer}
```

---

## Error Recovery

If any step fails, follow this protocol:

### Retry Pattern
1. **Log the failure:** Note which step failed and why
2. **Diagnose:** What specifically went wrong?
3. **Adjust:** Try a different approach (max 2 retries)
4. **Escalate:** If still failing, report to calling agent

### Common Failures and Fixes

| Failure | Diagnosis | Fix |
|---------|-----------|-----|
| Session file unreadable | Permissions or corruption | Report - manual inspection needed |
| Git command failed | Not in repo directory | Use absolute paths |
| gh CLI failed | Not authenticated or rate limited | Report - user may need to run gh auth |
| Parse error | Unexpected file format | Report raw content for manual parsing |

### Partial Results

If some checks succeed and others fail:
- Report what DID work
- Mark failed checks as "UNKNOWN"
- Provide enough info for calling agent to decide

### Escalation Format

If unable to complete status check:
```
STATUS CHECK INCOMPLETE

Steps succeeded: [list]
Steps failed: [list with errors]

Partial status: [what we know]
Recommended action: [what calling agent should do]
```

**Never silently fail.** Always report what happened.
