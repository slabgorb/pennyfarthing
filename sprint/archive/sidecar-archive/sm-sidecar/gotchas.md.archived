# SM Agent Gotchas

> Common mistakes and pitfalls in story management

## Story Selection Pitfalls

### Ignoring Dependencies
**Problem:** Selecting a story that depends on incomplete work
**Solution:** Always check "Prerequisites" field in story definition

### Underestimating Complexity
**Problem:** 3-point story turns into 8-point epic
**Warning signs:**
- Touches multiple repos
- Requires new patterns
- Has unclear acceptance criteria
- Depends on external systems

### Picking Blocked Stories
**Problem:** Starting work that can't be completed
**Solution:** Verify blockers resolved before selecting

## Acceptance Criteria Gotchas

### Untestable Criteria
**Problem:** AC that can't be verified programmatically
```
# WRONG
"The UI should feel responsive"

# RIGHT
"Page load time < 2 seconds for 95th percentile"
```

### Missing Edge Cases
**Common misses:**
- Empty states
- Error conditions
- Permission boundaries
- Concurrent access

### Ambiguous Language
**Problem:** AC that can be interpreted multiple ways
```
# WRONG
"Users should be able to manage their data"

# RIGHT
"Users can create, read, update, and delete their own profiles"
```

## Session File Gotchas

### Stale Session File
**Problem:** Session file doesn't reflect actual git/test state
**Solution:** Agents must verify actual state, not just trust session file

### Concurrent Modifications
**Problem:** Multiple processes editing session file
**Solution:** Only one agent active at a time, verify before writing

### Missing Assessment
**Problem:** Handoff offered without assessment written
**Solution:** Always Edit session file BEFORE spawning handoff subagent

## Jira Integration Gotchas

### Story Already Claimed
**Problem:** Trying to claim a story someone else is working on
**Solution:** Check Jira status before claiming

### Wrong Project Key
**Problem:** Using wrong Jira project identifier
**Solution:** Verify MSSCI project key matches configuration

### Transition Not Allowed
**Problem:** Jira workflow doesn't allow direct transition
**Solution:** Check available transitions before attempting

## Branch Management Gotchas

### Branch Already Exists
**Problem:** Creating branch that already exists
**Solution:** Use idempotent branch creation (check first)

### Wrong Base Branch
**Problem:** Branching from wrong base (e.g., old feature branch)
**Solution:** Always branch from `develop`

### Uncommitted Changes
**Problem:** Starting new work with dirty working directory
**Solution:** Verify `git status` clean before starting

## Helper Delegation Gotchas

### Wrong Subagent Prompt
**Problem:** Loading wrong subagent file for the task
**Solution:** Double-check prompt file path matches intended task

### Missing Context in Prompt
**Problem:** Helper doesn't have enough information
**Solution:** Include story ID, repos, and specific task details

### Not Waiting for Helper
**Problem:** Proceeding before helper completes
**Solution:** Wait for Task tool to return results

## Scale Assessment Gotchas

### Trivial Story Sent to TEA
**Problem:** 1-point fix goes through full TDD flow
**Solution:** Trivial stories (1-2 pts, chore/fix) go directly to Dev

### Complex Story Without TEA
**Problem:** 8-point feature skips test planning
**Solution:** All standard/complex stories must go through TEA

## Context Management Gotchas

### Context Overflow
**Problem:** Loading too much context before handoff
**Solution:** Check context usage; if >70%, suggest fresh session

### Missing Context File
**Problem:** Story context file not created before handoff
**Solution:** SM must write context file before handing to TEA

## File Operation Gotchas

### Write Without Read
**Problem:** Write tool fails with "File has not been read yet"
**Solution:** Always Read existing files before Write, even for session files
```
# WRONG - fails if file exists
Write(.session/{story-id}-session.md, content)

# RIGHT - read first
Read(.session/{story-id}-session.md)
Write(.session/{story-id}-session.md, content)
```

---

*Add gotchas discovered during story coordination below*
