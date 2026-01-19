# Tactical Agent Behavior (Shared)

**This file defines common behavior for tactical agents (SM, TEA, Dev, Reviewer).**

Auto-loaded by `/prime --agent <name>` for tactical agents only.

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
   Working directory: $CLAUDE_PROJECT_DIR
   ```
   This is your absolute reference point!

2. **Always use absolute paths for cd:**
   ```bash
   # WRONG - relative cd fails if you're already somewhere else
   cd myrepo && just test

   # CORRECT - absolute path always works
   cd $CLAUDE_PROJECT_DIR && just test
   ```

3. **Best Practice - Explicit cd in every Bash call that needs a specific directory:**
   ```bash
   # Single repo project
   cd $CLAUDE_PROJECT_DIR && git push -u origin feat/branch
   cd $CLAUDE_PROJECT_DIR && just test

   # Multi-repo project (use repo-utils.sh)
   source $CLAUDE_PROJECT_DIR/scripts/repo-utils.sh
   for repo in $(get_repo_names); do
       cd $CLAUDE_PROJECT_DIR/$(get_repo_path "$repo") && $(get_test_command "$repo")
   done
   ```

### Why This Works

- Absolute paths work from ANY directory
- No need to track where you are
- Explicit `cd` in every command that needs it = no confusion
- The `&&` ensures the command only runs if cd succeeds

---

## Single-Repo Projects

For projects where Pennyfarthing is installed directly in the repo (not as an orchestrator):

### Configuration

```yaml
# .claude/project/repos.yaml
repos:
  my-project:
    path: .              # "." means project root IS the repo
    type: service        # or: api, ui, cli, lib, monorepo
    language: go         # or: typescript, python, rust, etc.
    test_command: just test
    build_command: just build
    lint_command: just lint
```

### Key Differences from Multi-Repo

| Aspect | Multi-Repo | Single-Repo |
|--------|------------|-------------|
| `path` | `api/`, `ui/` | `.` (project root) |
| Branches | One per repo | One branch total |
| PRs | Multiple PRs | Single PR |
| `cd` pattern | `cd $PROJECT_ROOT/$repo_path` | `cd $PROJECT_ROOT` |

### Commands Still Work

The same repo-utils functions work — they just iterate over one repo:

```bash
source $CLAUDE_PROJECT_DIR/scripts/repo-utils.sh

# Returns single repo name
get_repos  # → "my-project"

# Path is "." so this works:
cd $CLAUDE_PROJECT_DIR/$(get_repo_path "my-project")
# Equivalent to: cd $CLAUDE_PROJECT_DIR/.

# Test command
$(get_test_command "my-project")  # → "just test"
```

### Simplified Patterns

For single-repo, you can also just work directly:

```bash
# Direct approach (single-repo only)
cd $CLAUDE_PROJECT_DIR && just test
cd $CLAUDE_PROJECT_DIR && just build

# Still works with repo-utils (recommended for consistency)
for repo in $(get_repos); do
    cd $CLAUDE_PROJECT_DIR/$(get_repo_path "$repo")
    eval "$(get_test_command "$repo")"
done
```

---

## Multi-Repo Operations

For projects with multiple repositories, use `repo-utils.sh` for dynamic iteration.

### Loading Repo Configuration

```bash
source $CLAUDE_PROJECT_DIR/scripts/repo-utils.sh

# Check configuration mode
if is_legacy_mode; then
    echo "Using legacy API_REPO/UI_REPO mode"
else
    echo "Using repos.yaml configuration"
fi

# Show current configuration
show_config
```

### Iterating Through Repos

```bash
source $CLAUDE_PROJECT_DIR/scripts/repo-utils.sh

# All repos
for repo in $(get_repos); do
    repo_path=$(get_repo_path "$repo")
    repo_type=$(get_repo_type "$repo")

    echo "=== $repo ($repo_type) ==="
    cd $CLAUDE_PROJECT_DIR/$repo_path
    git status --short
done

# Filter by type (api, ui, adapter, service, shared, lib)
for repo in $(get_repos_of_type "api"); do
    cd $CLAUDE_PROJECT_DIR/$(get_repo_path "$repo")
    # API-specific operations
done

# Build order (respects dependencies)
for repo in $(get_build_order); do
    cd $CLAUDE_PROJECT_DIR/$(get_repo_path "$repo")
    eval "$(get_build_command "$repo")"
done
```

### Getting Repo Information

```bash
source $CLAUDE_PROJECT_DIR/scripts/repo-utils.sh

# For a specific repo
repo="conductor-api"
get_repo_path "$repo"      # conductor-api
get_repo_type "$repo"      # api
get_repo_language "$repo"  # go
get_test_command "$repo"   # just test
get_build_command "$repo"  # just build
get_lint_command "$repo"   # golangci-lint run
get_dependencies "$repo"   # comma-separated list or empty
```

### Running Tests Across Repos

```bash
source $CLAUDE_PROJECT_DIR/scripts/repo-utils.sh

# Run tests in all repos
run_all_tests

# Run tests for specific type
run_tests_of_type "api"

# Manual iteration with custom logic
for repo in $(get_repos); do
    test_cmd=$(get_test_command "$repo")
    if [ -n "$test_cmd" ]; then
        cd $CLAUDE_PROJECT_DIR/$(get_repo_path "$repo")
        eval "$test_cmd" 2>&1 | tee $CLAUDE_PROJECT_DIR/.session/test-${STORY_ID}-${repo}.log
    fi
done
```

### Filtering Repos by Session Scope

```bash
source $CLAUDE_PROJECT_DIR/scripts/repo-utils.sh

# Extract scope from session file
REPOS=$(grep "^\*\*Repos:\*\*" $SESSION_FILE | cut -d: -f2 | xargs)

# filter_repos handles: all, both, api, ui, adapter, or comma-separated names
for repo in $(filter_repos "$REPOS"); do
    # Work on this repo
done
```

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
cd worktrees/11-2/myrepo && just test

# CORRECT (single-repo)
cd $CLAUDE_PROJECT_DIR/worktrees/11-2 && just test

# CORRECT (multi-repo with dynamic lookup)
WORKTREE="$CLAUDE_PROJECT_DIR/worktrees/11-2"
source $CLAUDE_PROJECT_DIR/scripts/repo-utils.sh
cd $WORKTREE/$(get_repo_path "myrepo") && just test
```

---

## On Activation (All Tactical Agents)

Every tactical agent MUST perform these steps on activation:

### Step 1: Check for Active Work

**Session File Naming Convention:**
- Pattern: `.session/{story-id}-session.md`
- Examples: `2-1-session.md`, `5-3a-session.md`, `epic-4-session.md`
- Story ID matches sprint YAML (e.g., story `id: "2-1"` → `2-1-session.md`)

```bash
cd $CLAUDE_PROJECT_DIR

# Find ALL session files
SESSIONS=($(ls .session/*-session.md 2>/dev/null))

# Each session is named after its story ID
# e.g., 2-1-session.md, 5-3a-session.md
```

### Step 2: Handle Multiple Sessions

If multiple sessions exist, check which are relevant to this agent:

```bash
cd $CLAUDE_PROJECT_DIR

# Find sessions relevant to this agent based on Phase
MY_SESSIONS=()
for f in .session/*-session.md; do
    PHASE=$(grep "^\*\*Phase:\*\*" "$f" | sed 's/.*\*\* //')
    case "$AGENT_TYPE" in
        sm)       [[ "$PHASE" =~ ^(sm-setup|approved)$ ]] && MY_SESSIONS+=("$f") ;;
        tea)      [[ "$PHASE" == "tea" ]] && MY_SESSIONS+=("$f") ;;
        dev)      [[ "$PHASE" == "dev" ]] && MY_SESSIONS+=("$f") ;;
        reviewer) [[ "$PHASE" == "review" ]] && MY_SESSIONS+=("$f") ;;
    esac
done
```

**If multiple relevant sessions exist, ask:**
```
Multiple sessions need my attention:
- 2-1-session.md (Phase: dev) - Story 2-1: Add logging
- 5-3a-session.md (Phase: dev) - Story 5-3a: Fix auth bug

Which session should I work on?
```

**Detecting worktree context from session file content:**
```bash
# Read worktree info from session file (if present)
if grep -q "^worktree:" "$SESSION_FILE"; then
    WORKTREE_NAME=$(grep "^worktree:" "$SESSION_FILE" | cut -d' ' -f2)
    WORKTREE_PATH=$(grep "^path:" "$SESSION_FILE" | cut -d' ' -f2)
fi
```

See `pennyfarthing-dist/guides/worktree-mode.md` for complete worktree documentation.

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
cd $CLAUDE_PROJECT_DIR

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
cd $CLAUDE_PROJECT_DIR

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
./scripts/run.sh create-feature-branches.sh "$BRANCH" "$REPOS"
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

Tactical agents work with session files named after story IDs:

| Pattern | Example | Description |
|---------|---------|-------------|
| `{story-id}-session.md` | `2-1-session.md` | Story 2-1 from sprint |
| `{story-id}-session.md` | `5-3a-session.md` | Story 5-3a (worktree variant) |
| `epic-{id}-session.md` | `epic-4-session.md` | Epic-level work |

**Discovery:** `ls .session/*-session.md`
**Traceability:** Story ID → `sprint/current-sprint.yaml`

**For worktree sessions, check the Worktree Context section:**
```yaml
## Worktree Context
worktree: wt-5-3a
path: /path/to/worktrees/wt-5-3a
api_port: 8082
ui_port: 5175
```

**Always check the session file for:**
- `Phase:` field to determine whose turn it is (sm, tea, dev, review, approved)
- `Workflow:` field to know which workflow is active (tdd, trivial, etc.)
- `Phase Started:` field for when the current phase began (ISO 8601)
- `Repos:` field to know which subrepos to work in
- `Feature Branch:` field for branch names
- `worktree:` field if working in a worktree (use `path:` for commands)

## Workflow Tracking Section

Every session file includes a `## Workflow Tracking` section that tracks workflow state and phase history:

```markdown
## Workflow Tracking
**Workflow:** tdd
**Phase:** dev
**Phase Started:** 2026-01-13T14:30:00Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| sm | 2026-01-13T14:00:00Z | 2026-01-13T14:15:00Z | 15m |
| tea | 2026-01-13T14:15:00Z | 2026-01-13T14:30:00Z | 15m |
| dev | 2026-01-13T14:30:00Z | - | - |
```

**Field extraction (grep-friendly):**
```bash
# Extract workflow name (defaults to "tdd" if missing for backward compatibility)
WORKFLOW=$(grep "^\*\*Workflow:\*\*" "$SESSION_FILE" | head -1 | sed 's/\*\*Workflow:\*\* //' | xargs)
[ -z "$WORKFLOW" ] && WORKFLOW="tdd"

# Extract current phase
PHASE=$(grep "^\*\*Phase:\*\*" "$SESSION_FILE" | head -1 | sed 's/\*\*Phase:\*\* //' | xargs)

# Extract phase started timestamp
PHASE_STARTED=$(grep "^\*\*Phase Started:\*\*" "$SESSION_FILE" | head -1 | sed 's/\*\*Phase Started:\*\* //' | xargs)
```

**On phase transition:** Handoff subagents update this section:
1. Set previous phase's Ended timestamp and calculate Duration
2. Update `**Phase:**` to new phase name
3. Update `**Phase Started:**` to current timestamp
4. Add new row to Phase History table

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
grep -A 20 "## Dev Assessment" "$SESSION_FILE"  # For Dev
grep -A 20 "## Reviewer Assessment" "$SESSION_FILE"  # For Reviewer
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

When working in a worktree, read context from the session file:

```bash
# Get worktree path from session file
WORKTREE_PATH=$(grep "^path:" "$SESSION_FILE" | cut -d' ' -f2)

# Use worktree path for all commands (single-repo)
cd $WORKTREE_PATH && just test

# Multi-repo: iterate with repo-utils
source $CLAUDE_PROJECT_DIR/scripts/repo-utils.sh
for repo in $(get_repo_names); do
    cd $WORKTREE_PATH/$(get_repo_path "$repo") && $(get_test_command "$repo")
done
```

**Ports are in the session file:**
```bash
API_PORT=$(grep "^api_port:" "$SESSION_FILE" | cut -d' ' -f2)
UI_PORT=$(grep "^ui_port:" "$SESSION_FILE" | cut -d' ' -f2)
```

**See `core/guides/worktree-mode.md` for complete worktree documentation.**

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

**Helper prompts are in:** `.pennyfarthing/agents/`

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

## Auto-Invoke Next Agent (Context-Aware)

**After handoff helper succeeds**, check context usage to decide whether to auto-invoke or defer:

```bash
eval $(./scripts/run.sh check-context.sh)
# Returns: HANDOFF_MODE=auto (<60%) or HANDOFF_MODE=ask (>60%)
```

### If HANDOFF_MODE=auto (< 60% context)

**Use the Skill tool to invoke the next agent directly.** Do not wait for user input.

| Current Agent | Next Agent | Skill Invocation |
|---------------|------------|------------------|
| SM | TEA | `Skill(tea)` |
| SM (trivial) | Dev | `Skill(dev)` |
| TEA | Dev | `Skill(dev)` |
| Dev | Reviewer | `Skill(reviewer)` |
| Reviewer (approved) | SM | `Skill(sm)` |
| Reviewer (rejected) | Dev | `Skill(dev)` |

**Example flow:**
```
1. Dev completes implementation, spawns handoff helper
2. Helper updates session file, reports success
3. Dev runs: eval $(./scripts/run.sh check-context.sh)
4. Result: HANDOFF_MODE=auto (context at 45%)
5. Dev uses Skill tool: skill="reviewer"
6. Reviewer activates automatically, continues work
```

### If HANDOFF_MODE=ask (> 60% context)

**Do not auto-invoke.** Tell the user to start a fresh session:

```
Context is at {N}% - recommend fresh session for next agent.
Run `/{next-agent}` in a new conversation to continue.
```

### Why This Matters

- Auto-invoke keeps momentum when context allows
- Fresh sessions prevent context overflow and degraded performance
- The 70% threshold leaves buffer for the next agent's work

### Pre-flight Check Commands

**Single-repo project:**
```bash
cd $CLAUDE_PROJECT_DIR && just test
cd $CLAUDE_PROJECT_DIR && git status --porcelain
cd $CLAUDE_PROJECT_DIR && git log @{u}..HEAD --oneline
cd $CLAUDE_PROJECT_DIR && gh pr view --json url -q .url
```

**Multi-repo project (use repo-utils.sh):**
```bash
source $CLAUDE_PROJECT_DIR/scripts/repo-utils.sh
for repo in $(get_repo_names); do
    repo_path=$(get_repo_path "$repo")
    cd $CLAUDE_PROJECT_DIR/$repo_path && $(get_test_command "$repo")
    cd $CLAUDE_PROJECT_DIR/$repo_path && git status --porcelain
done
```

## Subagent Error Handling (Shared Protocol)

When spawning subagents, the **caller handles all error recovery**. Subagents just report success or structured failure.

### Subagent Return Format

Subagents return structured results:

```yaml
# Success
status: success
result: "Session updated, handoff complete"

# Failure
status: blocked
blocked_step: "verify_tests_green"
error: "3 tests failing in conductor-api"
diagnosis: "Implementation incomplete"
```

### Caller Retry Protocol

When a subagent returns `status: blocked`:

```
1. LOG the failure
   - Which subagent
   - Which step failed
   - Error message

2. DIAGNOSE
   - Is this fixable by the caller?
   - Is it a transient issue (retry might work)?
   - Does it need user intervention?

3. IF FIXABLE by caller:
   - Fix the issue (e.g., commit forgotten files)
   - Retry subagent (max 2 retries)

4. IF NOT FIXABLE:
   - Escalate to user with structured format
```

### Common Failures and Fixes

| Subagent | Failure | Caller Action |
|----------|---------|---------------|
| `testing-runner` | Tests RED | Don't retry - report to user, this is expected state info |
| `testing-runner` | Container not running | Run `ensure_test_containers`, retry |
| `*-handoff` | Assessment missing | Write assessment first, retry |
| `*-handoff` | Uncommitted changes | Commit changes, retry |
| `*-handoff` | Not pushed | Push to remote, retry |
| `workflow-status-check` | Session file unreadable | Report to user for manual inspection |
| `sm-*` | Jira CLI failed | Check `gh auth status`, report to user |

### Escalation Format

When a subagent failure can't be recovered:

```markdown
## Subagent Blocked

**Subagent:** {name}
**Step Failed:** {step}
**Error:** {message}
**Diagnosis:** {what went wrong}

**Retries:** {N}/2 attempted
**Fixable by Caller:** No

**User Action Required:**
{specific action the user needs to take}
```

### Example: Caller Handling Handoff Failure

```
1. Dev spawns `dev-handoff` subagent
2. Subagent returns:
   status: blocked
   blocked_step: "verify_pushed"
   error: "Branch not pushed to remote"

3. Dev (caller) handles:
   - Diagnose: Forgot to push
   - Fix: git push -u origin {branch}
   - Retry: Spawn dev-handoff again

4. If still failing after 2 retries:
   - Escalate to user with structured format
```

### Why Callers Handle Errors

- **Subagents stay simple** - just do the task, report result
- **Callers have context** - know what they were trying to do
- **Retry logic is consistent** - same pattern across all agents
- **Easier to debug** - failure handling in one place

---

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

---

## Dogfooding: Known Issues When Working on Pennyfarthing

When working on the Pennyfarthing framework itself, be aware of these quirks:

### Symlink Permission Issue (Epic 26)

**Problem:** Claude Code's permission system doesn't follow symlinks. The `.claude/` directory contains symlinks to `pennyfarthing-dist/`:

```
.claude/commands → pennyfarthing-dist/commands
.claude/agents → pennyfarthing-dist/agents
.claude/skills → pennyfarthing-dist/skills
```

When Claude Code prompts for permission to write to `.claude/commands/foo.md`, the permission grant **fails silently** because the actual file is at `pennyfarthing-dist/commands/foo.md`.

**Workaround:** Write directly to `pennyfarthing-dist/` instead of `.claude/`:

```bash
# WRONG - permission will fail
Write to: .claude/commands/close-epic.md

# CORRECT - works because it's the real path
Write to: pennyfarthing-dist/commands/close-epic.md
```

**Status:** Tracked in Epic 26-1. Future fix may replace symlinks with copies during `pennyfarthing init`.

### Self-Referential Context

When agents work on Pennyfarthing itself:
- Agent definitions you're reading are the same ones you're modifying
- Changes to `tactical-agent-behavior.md` affect how you behave
- Test carefully - breaking changes can break the workflow mid-session

**Best practice:** Complete and commit agent/guide changes before testing them in a new session.
