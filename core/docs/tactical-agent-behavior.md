# Tactical Agent Behavior (Shared)

**This file defines common behavior for tactical agents (SM, TEA, Dev, Reviewer).**

**Inherits from:** `shared-agent-behavior.md` - load that first for sidecar, confidence, and reasoning protocols.

Tactical agents work on story-scoped tasks within the TDD flow: SM → TEA → Dev → Reviewer

---

## Critical Pattern: Bash Tool with Absolute Paths

⚠️ **ALL tactical agents must follow this pattern when using the Bash tool.**

### The Problem

The Bash tool maintains a persistent working directory across calls, but relative `cd` commands fail when already in a different directory. This is the #1 source of frustration and wasted time.

**Symptoms:**
- `cd API && just test` fails with "no such file or directory: API"
- Already in `API` but trying to `cd API` again
- Commands fail because assuming wrong directory

### The Solution: Always Use Absolute Paths

1. **At session start, use the PROJECT_ROOT from the `<env>` block:**
   ```
   Working directory: $PROJECT_ROOT
   ```
   This is your absolute reference point!

2. **Always use absolute paths for cd:**
   ```bash
   # WRONG - relative cd fails if you're already somewhere else
   cd API && just test

   # CORRECT - absolute path always works
   cd $PROJECT_ROOT/$API_REPO && just test
   ```

3. **Best Practice - Explicit cd in every Bash call that needs a specific directory:**
   ```bash
   # Push API branch (from anywhere)
   cd $PROJECT_ROOT/$API_REPO && git push -u origin feat/branch

   # Push UI branch (from anywhere)
   cd $PROJECT_ROOT/$UI_REPO && git push -u origin feat/branch

   # Test API (from anywhere)
   cd $PROJECT_ROOT/$API_REPO && just test

   # Run tests in both repos (parallel calls)
   # Call 1:
   cd $PROJECT_ROOT/$API_REPO && just test
   # Call 2:
   cd $PROJECT_ROOT/$UI_REPO && npm test
   ```

### Why This Works

- Absolute paths work from ANY directory
- No need to track where you are
- Explicit `cd` in every command that needs it = no confusion
- The `&&` ensures the command only runs if cd succeeds

---

## Skill References for Subagents

When spawning subagents that need specialized knowledge, reference the appropriate skill file in the prompt:

### Testing
```
Read the testing skill at .claude/skills/testing/SKILL.md for test commands.
For troubleshooting, see .claude/skills/testing/references/troubleshooting.md
```

### Just Commands
```
Read the just skill at .claude/skills/just/SKILL.md for available commands.
```

### Code Patterns
```
Read .claude/skills/dev-patterns/SKILL.md for common patterns and fixes.
```

**Why this matters:** Subagents don't automatically load skills. Including the skill reference in the prompt ensures they have access to project-specific commands and patterns.

---

### For Worktrees

Same pattern - use absolute paths:
```bash
# WRONG
cd worktrees/11-2/API && just test

# CORRECT
cd $PROJECT_ROOT/worktrees/11-2/$API_REPO && just test
```

---

## On Activation (All Tactical Agents)

Every tactical agent MUST perform these steps on activation:

### Step 1: Check for Active Work

**Session File Naming Convention:**
- Main checkout: `.session/current_work.md`
- Worktree: `.session/current_work_wt_{epic}_{story}.md` (e.g., `current_work_wt_5_3a.md`)
- Worktree directory: `worktrees/wt_{epic}_{story}/` (matches session filename)

```bash
cd $PROJECT_ROOT

# Find ALL active session files with single glob pattern
SESSIONS=($(ls .session/current_work*.md 2>/dev/null))

# Separate main vs worktree sessions
MAIN_SESSION=""
WORKTREE_SESSIONS=()

for f in "${SESSIONS[@]}"; do
    if [[ "$f" == *"_wt_"* ]]; then
        WORKTREE_SESSIONS+=("$f")
    else
        MAIN_SESSION="$f"
    fi
done
```

### Step 2: Handle Multiple Sessions

If multiple sessions exist, list them and ask:

```
Multiple active work sessions found:
- current_work.md (main checkout) - Story 5-2
- current_work_wt_11_2.md (worktree) - Story 11-2

Which session? (Enter name or number)
```

**Extracting worktree name from session filename:**
```bash
# current_work_wt_5_3a.md → wt_5_3a
WORKTREE_NAME=$(basename "$SESSION_FILE" .md | sed 's/current_work_//')
WORKTREE_DIR="worktrees/$WORKTREE_NAME"
```

### Step 3: Check Phase and Handoff Status

Read the selected session file and parse:
- **Phase:** field (sm, tea, dev, review, approved) - PRIMARY handoff indicator
- **Status:** field (e.g., `in-progress`, `review`)
- **Feature Branch:** field for branch name
- **Repos:** field to determine which repos are affected
- **Scope:** field (backend/frontend/both) - determines which test patterns to use

**Phase Values (for handoff detection):**
| Phase | Current Agent | Next Agent |
|-------|---------------|------------|
| `sm` | SM setting up | TEA |
| `tea` | TEA writing tests | Dev |
| `dev` | Dev implementing | Reviewer |
| `review` | Reviewer reviewing | SM (if approved) or Dev (if rejected) |
| `approved` | Ready for finish | SM |

```bash
# Extract scope from session file
SCOPE=$(grep "^\*\*Scope:\*\*" $SESSION_FILE | cut -d: -f2 | xargs | tr '[:upper:]' '[:lower:]')

# If scope not in session file, derive from repos
if [ -z "$SCOPE" ]; then
    REPOS=$(grep "^\*\*Repos:\*\*" $SESSION_FILE | cut -d: -f2 | xargs | tr '[:upper:]' '[:lower:]')
    case "$REPOS" in
        api) SCOPE="backend" ;;
        ui) SCOPE="frontend" ;;
        *) SCOPE="both" ;;
    esac
fi
```

### Step 4: Verify Actual State (CRITICAL)

**MANDATORY:** Before offering to start work, verify the actual state matches the session file.

```bash
cd $PROJECT_ROOT

# Check for uncommitted work in affected repos
REPOS=$(grep "^\*\*Repos:\*\*" $SESSION_FILE | cut -d: -f2 | xargs | tr '[:upper:]' '[:lower:]')

case "$REPOS" in
    *api*)
        echo "=== API Status ==="
        cd API && git status --short
        cd ..
        ;;
esac

case "$REPOS" in
    *ui*)
        echo "=== UI Status ==="
        cd UI && git status --short
        cd ..
        ;;
esac
```

**If uncommitted changes exist:**
1. Report them to the user immediately
2. Ask: "Session file says [status] but I found uncommitted work. What should I do?"
3. Options: commit & continue, discard, or investigate

**If implementing (Dev agent), also verify test state:**
```bash
# Run tests to confirm actual RED/GREEN state
cd API && just test ./... 2>&1 | tail -5
cd ../UI && npm test -- --run 2>&1 | tail -10
```

**If test state differs from session file:**
1. Report: "Session says RED but tests are GREEN" (or vice versa)
2. Update session file to reflect reality
3. Offer appropriate next action

**Why this matters:** Session files can become stale if a previous session crashed, was interrupted, or forgot to update. Always trust `git status` and test results over documentation.

---

### Step 5: Create/Checkout Feature Branches

**MANDATORY:** All tactical agents must ensure they're on the correct branches before starting work.

```bash
cd $PROJECT_ROOT

# Extract from session file
BRANCH=$(grep "Feature Branch:" $SESSION_FILE | cut -d: -f2 | xargs)
REPOS=$(grep "Repos:" $SESSION_FILE | cut -d: -f2 | xargs | tr '[:upper:]' '[:lower:]')

# Map repo field to script parameter
# "API" → "api", "UI" → "ui", "Both" → "all", etc.
case "$REPOS" in
    *api*ui* | *ui*api* | both) REPOS="all" ;;
    *api*) REPOS="api" ;;
    *ui*) REPOS="ui" ;;
    *sim-ui*) REPOS="sim-ui" ;;
    *sim*) REPOS="sim" ;;
    *) REPOS="all" ;;  # Default to all if unclear
esac

# Create or checkout branches (idempotent, includes verification)
./scripts/create-feature-branches.sh "$BRANCH" "$REPOS"
```

**What this does:**
- ✅ Creates branches if they don't exist (from develop)
- ✅ Checks out existing branches if they do exist
- ✅ Verifies branches are correct
- ✅ Shows sync status with remote
- ✅ Works in both main checkout and worktrees

**Never skip this step.** It ensures consistency across all agents in the TDD flow.

### Step 6: Offer to Start if Handed Off

If this agent is the "Next Agent", offer to start immediately:

| Agent | Match Pattern | Action |
|-------|---------------|--------|
| TEA | `Next Agent: TEA` or `Next Agent: Igor` | Offer to write tests |
| Dev | `Next Agent: Dev` or `Next Agent: Ponder` | Offer to implement |
| Reviewer | `Next Agent: Reviewer` or `Next Agent: Granny` or status=`review` | Offer to review |

**Offer format:**
```
I see [Story ID] is ready for [my task].
The handoff indicates I'm next.

**Story:** [title]
**Phase:** [current] → [next]
**Location:** [main checkout | worktrees/{name}]

Say 'yes' to start, or ask me something else.
```

### Step 7: If Not Handed Off

Show the agent's task menu and wait for selection.

## Session File Location

Tactical agents work with these session files:

| Mode | Session File | Work Location |
|------|--------------|---------------|
| Standard | `.session/current_work.md` | Main checkout (`API/`, `UI/`) |
| Worktree | `.session/current_work_wt_{epic}_{story}.md` | Worktree (`worktrees/wt_{epic}_{story}/API/`, etc.) |

**Examples:**
- `current_work.md` → main checkout
- `current_work_wt_5_3a.md` → `worktrees/wt_5_3a/`
- `current_work_wt_11_2.md` → `worktrees/wt_11_2/`

**Always check the session file for:**
- `Phase:` field to determine whose turn it is (sm, tea, dev, review, approved)
- `Repos:` field to know which subrepos to work in
- `Feature Branch:` field for branch names

## Phase Assessment Templates (MANDATORY)

Each agent MUST document their work using the structured template for their phase. This is what makes handoffs reliable.

### SM Assessment Template
```markdown
## SM Assessment

**Story:** {ID} - {title}
**Points:** {N} | **Priority:** {P0/P1/P2}
**Repos:** api | ui | both
**Branch:** feat/{story-id}-{description}

**Acceptance Criteria:**
- [ ] AC1: {criterion}
- [ ] AC2: {criterion}

**Technical Notes:** {any context Dev/TEA needs}
**Jira:** {MSSCI-XXXX} (claimed)

**Handoff:** To TEA for test writing
```
**Handoff phrase:** "TEA, Story X-Y is ready. Write failing tests for these ACs."

---

### TEA Assessment Template
```markdown
## TEA Assessment

**Tests Required:** Yes | No
**Reason:** {if No: documentation/config/dependency update}

**Test Files:** (if Yes)
- `path/to/test_file.go` - {description}
- `path/to/component.test.tsx` - {description}

**Tests Written:** {N} tests covering {M} ACs
**Status:** RED (failing - ready for Dev)

**Handoff:** To Dev for implementation
```
**Handoff phrase:** "Dev, tests are RED and ready. Make them GREEN."

---

### Dev Assessment Template
```markdown
## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `path/to/file.go` - {description}
- `path/to/Component.tsx` - {description}

**Tests:** {N}/{N} passing (GREEN)
**PR:** #{number} - {title}
**Branch:** {branch-name} (pushed)

**Handoff:** To Reviewer for code review
```
**Handoff phrase:** "Reviewer, PR #{N} is ready. All tests GREEN."

---

### Reviewer Assessment Template
```markdown
## Reviewer Assessment

**PR:** #{number}
**Verdict:** APPROVED | REJECTED

**If APPROVED:**
**Quality:** Tests comprehensive, code follows patterns
**Handoff:** To SM for finish-story workflow

**If REJECTED:**
**Issues Found:**
- {severity}: {issue} → {fix required}
- {severity}: {issue} → {fix required}

**Handoff:** Back to Dev for fixes
```
**Handoff phrase (approved):** "SM, Story X-Y is approved and ready to be finished."
**Handoff phrase (rejected):** "Dev, {N} issues found. See assessment for details."

---

## Session File Update (MANDATORY Before Handoff)

> **🚨 CRITICAL: WRITE BEFORE YOU OFFER**
>
> The #1 handoff failure is offering to hand off before writing the assessment to disk.
> Never say "Ready for Reviewer" or "Ready for Dev" until YOU have written YOUR assessment.
> The subagent does NOT write the assessment - YOU do.

### The Correct Handoff Sequence

```
1. COMPLETE your work (tests written, code implemented, review done)
2. WRITE your Assessment section to the session file (using Edit tool)
3. VERIFY the assessment is written (read the file back or check Edit output)
4. SPAWN the handoff subagent (it verifies and updates status/workflow checkboxes)
5. WAIT for subagent to complete and report success
6. ONLY THEN offer the next agent handoff
```

### What YOU Write vs What SUBAGENT Writes

| Agent | YOU Write (Assessment) | SUBAGENT Updates |
|-------|------------------------|------------------|
| TEA | `## TEA Assessment` with test files, RED status | Workflow checkbox, Phase, Next Agent |
| Dev | `## Dev Assessment` with files changed, PR link | Workflow checkbox, Phase, Next Agent |
| Reviewer | `## Reviewer Assessment` with verdict, issues | Workflow checkbox, Phase, Next Agent |

### Before Spawning Handoff Subagent

**YOU must have already written:**
```markdown
## {Agent} Assessment

{All required fields from the template below}

**Handoff:** To {next agent} for {next task}
```

**Verify your assessment exists:**
```bash
grep -A 20 "## Dev Assessment" .session/current_work.md  # For Dev
grep -A 20 "## Reviewer Assessment" .session/current_work.md  # For Reviewer
```

If the assessment is NOT in the file, do NOT spawn the subagent yet.

### Common Mistake

```
❌ WRONG:
1. Dev: "All tests GREEN, PR created!"
2. Dev: [spawns handoff subagent]
3. Dev: "Ready for Reviewer!"
4. Reviewer: [activates, finds no Dev Assessment in session file]

✅ CORRECT:
1. Dev: "All tests GREEN, PR created!"
2. Dev: [uses Edit tool to write Dev Assessment to session file]
3. Dev: [verifies assessment was written]
4. Dev: [spawns handoff subagent]
5. Dev: [waits for subagent to report success]
6. Dev: "Ready for Reviewer!"
7. Reviewer: [activates, reads Dev Assessment, knows what to review]
```

The subagent will verify the assessment exists and update workflow checkboxes.

## Skills Usage

Tactical agents invoke skills naturally based on their task:

| Skill | When to Use |
|-------|-------------|
| `/testing` | Running tests, writing tests, TDD workflow |
| `/dev-patterns` | Implementation patterns, common gotchas |
| `/sprint-context` | Sprint status, backlog, story context |

### Scope Values

| Session Repos | Scope | Testing Skill Reference |
|---------------|-------|-------------------------|
| `api` | `backend` | `references/backend-patterns.md` |
| `ui` | `frontend` | `references/frontend-patterns.md` |
| `both` | `both` | Full skill + both pattern refs |

## Worktree Awareness

When working in a worktree:

1. **Navigate first:** `cd worktrees/{name}/UI` (or API)
2. **Check branch:** Branch should already exist (created by SM)
3. **Install deps if needed:** `npm install` (UI) or dependencies are shared (API)
4. **Use correct ports:** `eval $(./scripts/worktree-manager.sh ports {name})`

## Sidecar Memory (Tactical Agents)

**See `shared-agent-behavior.md` for full sidecar protocol.**

For tactical agents, key moments to check/update sidecars:

| When | Action |
|------|--------|
| **On Activation** | Load sidecar after checking handoff status (Step 7) |
| **Before Handoff** | Capture any learnings BEFORE spawning handoff subagent |
| **On Gotcha** | Immediately note it - don't wait for handoff |

### Tactical-Specific Patterns

- **TEA:** Test patterns, mocking approaches, test data gotchas
- **Dev:** Implementation patterns, API quirks, performance fixes
- **Reviewer:** Common issues found, patterns to watch for
- **SM:** Story breakdown patterns, estimation notes

---

## Completing Work (Automatic Handoff via Helper)

When done with your phase, send your helper to handle the bookkeeping.

**Helper prompts are in:** `.claude/subagents/`

| Agent | Helper | Prompt File | Purpose |
|-------|--------|-------------|---------|
| SM | Nobby | `sm-*.md` | Status checks, research, file summaries, story setup |
| TEA | Igor | `tea-handoff.md` | Update session after tests written (RED) |
| Dev | Hex | `dev-handoff.md` | Update session after PR created (GREEN) |
| Reviewer | Nanny Ogg | `reviewer-handoff-approve.md` | Mark approved, route to SM |
| Reviewer | Nanny Ogg | `reviewer-handoff-reject.md` | Route back to Dev with issues |

### Helper Model Selection

Helpers use Haiku for fast, mechanical bookkeeping:

```yaml
Task tool:
  subagent_type: "general-purpose"
  model: "haiku"  # ← Haiku for helpers
  description: "Hex handles handoff"  # Use your helper's name
  prompt: [loaded from subagent file with placeholders replaced]
```

**Helpers (Haiku) handle:**
- Workflow handoffs (updating session files, workflow checkboxes)
- Work teardown (completion checks, archival)
- Status checks and validation
- File updates and bookkeeping

**You (Opus) handle:**
- Complex code analysis or generation
- Architectural decisions
- Tasks requiring judgment

### Handoff Output

```
✓ Pre-flight: Tests 36/36 GREEN, git clean, PR #59 exists
✓ Assessment: Dev Assessment written to session file
✓ Workflow: [x] Dev marked complete

Handoff complete: Dev → Reviewer
Invoke /reviewer to continue.
```

### If Handoff Fails

Your helper reports what blocked:

```
✗ Handoff blocked

Issue: Tests failing (3 failures)
Fix: Run tests, fix failures, then retry handoff.
```

Address the issue and send your helper again.

### Pre-flight Check Commands

**For UI repo:**
```bash
cd $PROJECT_ROOT/$UI_REPO && npm test -- --run
cd $PROJECT_ROOT/$UI_REPO && git status --porcelain
cd $PROJECT_ROOT/$UI_REPO && git log @{u}..HEAD --oneline
cd $PROJECT_ROOT/$UI_REPO && gh pr view --json url -q .url
```

**For API repo:**
```bash
cd $PROJECT_ROOT/$API_REPO && just test
cd $PROJECT_ROOT/$API_REPO && git status --porcelain
```

## Agent Flow Reference

```
/new-work → SM → TEA → Dev → Reviewer → SM (finish)
              ↓      ↓     ↓         ↓
           setup  tests  impl    review
              │      │     │         │
              └──────┴─────┴─────────┘
                  helper handoffs
```

**Entry point:** `/new-work` only
**State detection:** Agents read session file on activation
**Handoffs:** Agents send helpers to update session file
**Finish:** SM handles when status = `approved`
