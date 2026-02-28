# Helper Delegation Pattern

**Pattern Type:** Strategic-to-Tactical Delegation
**Agents Involved:** Opus (strategic), Haiku (mechanical)
**Coordination Mechanism:** Task tool with `subagent_type`

## Problem Statement

AI agents face a fundamental tension between strategic reasoning and mechanical execution:

1. **Context Waste:** Opus-level models burn expensive context on mechanical tasks (git commands, file scanning, session updates)
2. **Instruction Drift:** Agents tend to ignore multi-step markdown instructions during handoffs, leading to incomplete state updates
3. **Reliability Gap:** Strategic agents make creative decisions well but may skip critical mechanical steps
4. **Cost Inefficiency:** Using expensive models for simple, deterministic tasks is wasteful

Without delegation, agents may:
- Forget to update session files during handoffs
- Skip verification steps (tests, lint, git status)
- Burn context on repetitive scanning operations
- Make mechanical errors that a simpler, focused agent wouldn't

## Solution

Delegate mechanical work to **Haiku subagents** via Claude Code's Task tool. This creates a two-tier architecture:

```
Opus Agent (strategic)
    │
    ├── Makes decisions, analyzes problems, writes code
    │
    └── Delegates mechanical work via Task tool
            │
            ├── sm-setup (research backlog or setup story)
            ├── sm-finish (preflight checks or execute finish)
            ├── sm-handoff (SM→TEA/Dev with Jira/branch verification)
            ├── handoff (TEA/Dev/Reviewer phase transitions)
            ├── reviewer-preflight (test/lint data gathering)
            └── testing-runner (test execution)
```

The key insight: **Make critical behaviors AUTOMATIC via subagent delegation** rather than relying on agents to follow markdown instructions.

## State Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      HELPER DELEGATION FLOW                              │
└─────────────────────────────────────────────────────────────────────────┘

    ┌──────────────────┐
    │   Opus Agent     │
    │   (strategic)    │
    └────────┬─────────┘
             │
             │ Task tool invocation
             │ subagent_type: "sm-setup"
             │
             ▼
    ┌──────────────────┐
    │  Haiku Subagent  │
    │   (mechanical)   │
    └────────┬─────────┘
             │
             │ Executes bash, reads files,
             │ updates session, returns report
             │
             ▼
    ┌──────────────────┐
    │  Structured      │
    │  Markdown Report │
    └────────┬─────────┘
             │
             │ Opus receives result,
             │ continues strategic work
             │
             ▼
    ┌──────────────────┐
    │   Opus Agent     │
    │   (continues)    │
    └──────────────────┘
```

### Delegation Categories

```
┌─────────────────────────────────────────────────────────────────────────┐
│ CATEGORY          │ SUBAGENT               │ PURPOSE                    │
├───────────────────┼────────────────────────┼────────────────────────────┤
│ Setup/Init        │ sm-setup       │ Research or setup (MODE)   │
│                   │ sm-handoff             │ SM→TEA/Dev with Jira/branch│
├───────────────────┼────────────────────────┼────────────────────────────┤
│ Phase Handoff     │ handoff        │ TEA/Dev/Reviewer transitions│
├───────────────────┼────────────────────────┼────────────────────────────┤
│ Verification      │ reviewer-preflight     │ Gather facts before review │
│                   │ testing-runner         │ Execute tests, report      │
├───────────────────┼────────────────────────┼────────────────────────────┤
│ Finish/Cleanup    │ sm-finish      │ Preflight or execute (PHASE)│
└─────────────────────────────────────────────────────────────────────────┘
```

## Implementation

### Invocation Pattern

Use Claude Code's Task tool with the `subagent_type` parameter:

```yaml
Task tool:
  subagent_type: "sm-setup"
  model: "haiku"                           # Optional, defaults to haiku
  description: "Research backlog"
  prompt: |
    MODE: research
    PROJECT_ROOT: $CLAUDE_PROJECT_DIR

    Scan sprint backlog and report available stories.
```

### Placeholder Substitution

Subagent definitions use placeholders that the calling agent fills:

```markdown
# Subagent Definition (.pennyfarthing/agents/tea-handoff.md)
---
name: tea-handoff
tools: Bash, Read, Edit, Grep
model: haiku
---
You are a workflow handoff assistant for story {STORY_ID}.

Session file: .session/{STORY_ID}-session.md
Test files: {TEST_FILE_LIST}
Failing count: {FAILING_COUNT}
```

When invoking:
```yaml
Task tool:
  subagent_type: "tea-handoff"
  prompt: |
    STORY_ID: 5-2
    TEST_FILE_LIST: internal/service/feature_test.go
    FAILING_COUNT: 4
    PASSING_COUNT: 0
```

### Subagent Definition Structure

Each subagent follows this template (see `agents/*.md`):

```markdown
---
name: subagent-name
description: One-line description
tools: Bash, Read, Edit, Grep    # Limited tool set
model: haiku                       # Fast, cheap model
---
You are a [role] assistant. [Brief purpose].

## Placeholders
- `{PLACEHOLDER}` - Description

## Project Root
$CLAUDE_PROJECT_DIR (set by SessionStart hook)

## Step 1: [First Action]
```bash
# Bash commands with placeholders
```

## Step 2: [Second Action]
[More steps...]

## Output Format
```markdown
## [Report Title]
[Structured output template]
```

## Error Recovery
[Retry pattern and escalation format]
```

### Real Example: tea-handoff

**Pre-flight Verification** (from `agents/tea-handoff.md:29-40`):

```bash
# Check TEA Assessment exists
grep -q "## TEA Assessment" .session/{STORY_ID}-session.md
# If NOT found: STOP
```

**Subagent-to-Subagent Delegation** (lines 42-67):

```yaml
# tea-handoff spawns testing-runner for verification
subagent_type: "general-purpose"
model: "haiku"
prompt: |
  Run tests and report results.
  Run ID: {STORY_ID}-tea
  Context: Verify tests are RED
```

**Session Update** (lines 79-92):

```markdown
1. Read current session file
2. Add "TEA Assessment" section
3. Mark workflow checkbox complete
4. Add log entry: "Tests are RED. Ready for Dev."
```

### Result Handling

Subagents return structured markdown that the calling Opus agent parses:

```markdown
## Pre-Flight Report: Story 5-2

### Test Results
| Repo | Passed | Failed | Status |
|------|--------|--------|--------|
| API  | 0      | 4      | RED    |

### Readiness
**Ready for Dev:** Yes
```

The Opus agent reads this report and decides next steps—it doesn't re-execute the mechanical work.

## When to Use

### Delegate When:

| Scenario | Subagent | Why |
|----------|----------|-----|
| Creating branches/sessions | `sm-setup MODE=setup` | Git operations are deterministic |
| Verifying test state | `testing-runner` | Test execution is mechanical |
| Updating session files | `handoff` | State updates must be reliable |
| Gathering review data | `reviewer-preflight` | Fact-finding, not judgment |
| Sprint file updates | `sm-finish` | Archiving is mechanical |

### Don't Delegate When:

| Scenario | Why Keep in Opus |
|----------|------------------|
| Making architectural decisions | Requires strategic reasoning |
| Writing code/tests | Creative work needs full context |
| Code review judgment | Adversarial analysis is strategic |
| User interaction decisions | Context-dependent choices |
| Error diagnosis | May need creative problem solving |

### Decision Heuristic

```
Is the task...
├── Deterministic (same input → same output)?
│   └── YES → Delegate
├── Requiring judgment or creativity?
│   └── NO → Keep in Opus
├── Repetitive across sessions?
│   └── YES → Delegate
├── Involving file scanning/git operations?
│   └── YES → Delegate
└── Making decisions that affect flow?
    └── Keep in Opus
```

## Error Recovery

### Subagent Retry Pattern

From `agents/sm-setup.md` (Error Recovery section):

```
1. Log the failure: Note which step failed and why
2. Diagnose: What specifically went wrong?
3. Adjust: Try a different approach (max 2 retries)
4. Escalate: If still failing, report to calling agent
```

### Escalation Format

When subagents cannot complete their task:

```markdown
SETUP BLOCKED

Step failed: [which step]
Error: [error message]
Diagnosis: [what went wrong]

Recommended fix: [what calling agent should do]
```

### Common Failure Patterns

| Failure | Subagent | Fix |
|---------|----------|-----|
| Jira claim failed | sm-setup | Choose different story |
| Tests all GREEN | handoff | TEA must verify tests are correct |
| PR not found | handoff | Verify PR was created |
| Session file missing | any handoff | Check path, may need recreation |
| Git command failed | any | Check for uncommitted changes |

### Never Silently Fail

Subagents must always return a result, even if partial. The calling agent decides how to proceed. **Never silently fail.**

## Anti-Patterns

### Direct Execution by Opus

**Wrong:**
```
SM agent runs 50 lines of bash to scan session files,
check git status, update sprint YAML, create branch...
```
Burns context, may skip steps, prone to errors.

**Correct:**
```yaml
Task tool:
  subagent_type: "sm-setup"
  prompt: |
    MODE: setup
    STORY_ID: 5-2
    [other placeholders]
```
Haiku executes reliably, returns structured result.

### Skipping Handoff Subagents

**Wrong:**
```
TEA: "I wrote the tests. Dev, please continue."
```
Session file not updated, next agent unclear, state lost.

**Correct:**
```
TEA: spawns tea-handoff → session updated → Dev activated
```

### Overloading Subagents

**Wrong:**
```yaml
# Subagent doing too much
prompt: |
  1. Analyze code architecture
  2. Decide which tests to write
  3. Write the tests
  4. Commit them
  5. Update session
```
Mixing strategic (1-2) with mechanical (3-5).

**Correct:**
```yaml
# Opus does strategic work, then delegates mechanical
# OPUS: Decides tests, writes them
# Then:
subagent_type: "tea-handoff"
prompt: |
  STORY_ID: 5-2
  TEST_FILES: [list from Opus work]
  # Only mechanical: verify, update session
```

### Ignoring Subagent Results

**Wrong:**
```
Opus spawns sm-setup, ignores output, proceeds anyway
```

**Correct:**
```
Opus spawns sm-setup
→ Reads result (backlog stories, setup confirmation, etc.)
→ Branches logic based on result
```

### Missing Error Handling

**Wrong:**
```markdown
## Step 3: Update Sprint
Edit sprint/current-sprint.yaml
```
No error handling, silent failures possible.

**Correct:**
```markdown
## Step 3: Update Sprint
Edit sprint/current-sprint.yaml

If edit fails:
- Log: "Sprint YAML update failed"
- Diagnose: File locked? Wrong path?
- Escalate: Report to calling agent
```

## Related Patterns

- **TDD Flow Pattern** (`tdd-flow-pattern.md`): The workflow that uses delegation extensively
- **Approval Gates Pattern** (`approval-gates-pattern.md`): How delegation supports review gates
- **Fan-out/Fan-in Pattern** (`fan-out-fan-in-pattern.md`): Parallel delegation patterns

## References

### Subagent Definitions
- SM Setup/Research: `agents/sm-setup.md`
- SM Finish: `agents/sm-finish.md`
- SM Handoff: `agents/sm-handoff.md`
- Phase Transitions: `agents/handoff.md`
- Reviewer Preflight: `agents/reviewer-preflight.md`
- Testing Runner: `agents/testing-runner.md`

### Agent Definitions (Opus)
- SM: `agents/sm.md`
- TEA: `agents/tea.md`
- Dev: `agents/dev.md`
- Reviewer: `agents/reviewer.md`

### Claude Code Documentation
- Task tool: Spawns subagents with isolated context
- `subagent_type` parameter: Routes to specialized agents
- `model` parameter: Specifies haiku for mechanical work

---

*Last verified: 2026-01-06*
*Pennyfarthing v4.0.0*
