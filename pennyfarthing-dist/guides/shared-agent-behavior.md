# Shared Agent Behavior (All Agents)

**This file defines behavior common to ALL agents - strategic and tactical.**

Every agent MUST follow these protocols.

---

## Environment Setup

### $CLAUDE_PROJECT_DIR

All paths use `$CLAUDE_PROJECT_DIR` as the base:

```bash
# Available from <env> block at session start
Working directory: /path/to/project  # This IS $CLAUDE_PROJECT_DIR
```

**Always use absolute paths:**
```bash
# CORRECT
cd $CLAUDE_PROJECT_DIR/API && just test

# WRONG - relative paths fail
cd API && just test
```

---

## Sidecar Memory System

Every agent has a sidecar directory for project-specific memory that persists across sessions.

### Sidecar Location

```
.claude/project/agents/{agent}-sidecar/
├── patterns.md      # Implementation patterns discovered
├── gotchas.md       # Things that bite you
└── decisions.md     # Past architectural decisions
```

### Loading Sidecar (MANDATORY on Activation)

**Every agent MUST load their sidecar on activation:**

```bash
AGENT_NAME="{your-agent}"  # dev, tea, sm, reviewer, architect, etc.
SIDECAR_DIR="$CLAUDE_PROJECT_DIR/.claude/project/agents/${AGENT_NAME}-sidecar"

if [ -d "$SIDECAR_DIR" ]; then
    echo "=== Loading Sidecar Memory ==="
    cat "$SIDECAR_DIR/patterns.md" 2>/dev/null | head -100
    cat "$SIDECAR_DIR/gotchas.md" 2>/dev/null | head -50
    cat "$SIDECAR_DIR/decisions.md" 2>/dev/null | head -50
fi
```

**After loading, internalize:**
- Patterns that apply to current work
- Gotchas to watch for
- Decisions that constrain options

### Capturing Learnings (MANDATORY before Handoff/Exit)

**Before handing off or exiting, ask yourself:**

1. Did I discover a pattern worth remembering?
2. Did I hit a gotcha that wasted time?
3. Did I make a decision that future work should know?

**If YES to any, append to the appropriate sidecar file:**

```markdown
---
## [YYYY-MM-DD] [Story-ID or Context] Brief Title

**Context:** What situation triggered this
**Learning:** What we discovered
**Apply When:** When to use this knowledge
```

### What Goes Where

| File | Content | Example |
|------|---------|---------|
| `patterns.md` | How to do things well | "Use errgroup for parallel DB calls" |
| `gotchas.md` | Mistakes to avoid | "npm needs --legacy-peer-deps" |
| `decisions.md` | Why we chose X over Y | "Don't refactor PaymentService" |

### When NOT to Write

- Trivial learnings (obvious to any developer)
- One-time fixes (won't apply again)
- Already in project docs

---

## Confidence Protocol

Before taking significant actions, assess confidence:

| Level | Indicators | Action |
|-------|-----------|--------|
| **HIGH** | Matches sidecar patterns, clear requirements | Proceed autonomously |
| **MEDIUM** | Some unknowns, first time for this pattern | Ask before risky actions |
| **LOW** | Architectural changes, security-sensitive | Always ask user first |

### Expressing Uncertainty

When uncertain, SAY SO:

```
GOOD: "I'm not sure if this is the right approach. Here's my reasoning..."
GOOD: "I found two options. Let me explain the tradeoffs..."
BAD: [silently picks one approach without mentioning alternatives]
```

---

## Reasoning Mode (Toggleable)

**Default:** Quiet mode - internal reasoning, show only key decisions

**Verbose mode:** User says "verbose mode" to see full reasoning chain

### When Verbose Mode is ON

```
THOUGHT: [what you're trying to accomplish]
ACTION: [tool/command you'll use]
OBSERVATION: [what was the result]
REFLECT: [did it work? what next?]
```

### When Quiet Mode is ON (Default)

Show only:
- Key decisions and reasoning
- Results and outcomes
- Questions and blockers

---

## Session File Awareness

Check for active work on activation:

```bash
cd $CLAUDE_PROJECT_DIR

# Check for session files
if [ -f ".session/{STORY_ID}-session.md" ]; then
    echo "=== Active Work Session ==="
    head -50 .session/{STORY_ID}-session.md
fi

# Check for worktree sessions
ls .session/*-session.md (with worktree field) 2>/dev/null
```

---

## Skills Usage

Agents invoke skills based on task:

| Skill | When to Use |
|-------|-------------|
| `/sprint-context` | Sprint status, backlog, story context |
| `/testing` | Running tests, TDD workflow |
| `/dev-patterns` | Implementation patterns, common fixes |
| `/code-review` | Review checklists and patterns |
| `/story-management` | Story creation, sizing, sprint workflow |
| `/just` | Run just recipes for project tasks |
| `/jira` | Jira CLI commands for sprint management |
| `/theme` | Manage persona themes |
| `/mermaid` | Generate diagrams in markdown |
| `/changelog` | Maintain changelogs, auto-generate release notes |

See `/help` or the `pennyfarthing-dist/skills/` directory for all available skills.

---

## Structured Output Markers (Cyclist Integration)

Emit HTML comment markers to enable 100% accurate quick-action button detection in Cyclist.

### Marker Format

```html
<!-- CYCLIST:TYPE:value -->
```

| Marker | Usage | Example |
|--------|-------|---------|
| `HANDOFF` | Agent handoff | `<!-- CYCLIST:HANDOFF:/tea -->` |
| `QUESTION` | Yes/No questions | `<!-- CYCLIST:QUESTION:yesno -->` |
| `CHOICES` | Numbered choices | `<!-- CYCLIST:CHOICES:1,2,3 -->` |

### When to Emit

- **Before handoffs:** Include marker after handoff text
- **Before yes/no questions:** Include marker after question
- **Before numbered choices:** Include marker listing choice numbers

### Example Usage

```markdown
Ready to hand off to the Caterpillar for test writing.

**Invoke `/tea` to begin the RED phase.**

<!-- CYCLIST:HANDOFF:/tea -->
```

```markdown
Shall I proceed with the implementation?

<!-- CYCLIST:QUESTION:yesno -->
```

```markdown
Which approach do you prefer?

1. Option A - Simple approach
2. Option B - More flexible
3. Option C - Full featured

<!-- CYCLIST:CHOICES:1,2,3 -->
```

### Key Points

- Markers are **invisible** to users (HTML comments)
- Markers are **optional** - pattern detection still works as fallback
- Place marker at **end of message** after relevant text
- Use **exact agent names**: `/sm`, `/tea`, `/dev`, `/reviewer`, `/architect`, etc.

---

## Handoff Action Protocol

When handing off to the next agent in a workflow, the `generic-handoff` subagent determines
what action to take based on context usage AND the user's handoff mode preference.

### Handoff Mode Setting

The user's preference is stored in `.pennyfarthing/cyclist.yaml`:

```yaml
handoff_mode: auto   # or "manual"
```

The handoff subagent reads this setting and returns an `Action` field.

### Action Values

| Action | Meaning | What to Do |
|--------|---------|------------|
| `INVOKE_DIRECTLY` | Auto mode + context OK | **Immediately invoke next agent** - do NOT ask permission |
| `USER_INVOKE` | Manual mode | Tell user: "Ready for {Agent}. Invoke `/{agent}` when ready." |
| `FRESH_SESSION` | Context too high (>70%) | Tell user: "Context high. Start fresh session with `/{agent}`" |

### CRITICAL: Follow the Action

When handoff returns `Action: INVOKE_DIRECTLY`:
- **DO** immediately use the Skill tool to invoke the next agent
- **DO NOT** ask "Shall I proceed?" or "Ready to hand off?"
- **DO NOT** wait for user confirmation

Asking permission when auto-handoff is enabled defeats the purpose of the setting.

### Example Flow

```
1. Agent completes work
2. Agent writes assessment to session file
3. Agent spawns generic-handoff subagent
4. Subagent returns: "Action: INVOKE_DIRECTLY"
5. Agent IMMEDIATELY invokes: Skill tool with skill: "{next-agent}"
```

### Handoff Marker

Always include the Cyclist marker at the end of handoff messages:

```html
<!-- CYCLIST:HANDOFF:/{next-agent} -->
```

This enables quick-action buttons in the Cyclist UI, but the agent must still
invoke the skill when Action is `INVOKE_DIRECTLY`.

---

## Turn Efficiency Protocol

Minimize API round-trips by parallelizing independent operations and batching commands.

### Core Principles

1. **Parallelize file reads** - Read multiple independent files in one turn
2. **Batch bash commands** - Combine git/shell operations with `&&`
3. **Spawn subagents in parallel** - When results don't depend on each other

### Examples

**File reads:**
```
# EFFICIENT: Read session + context + related files in one turn
Read: .session/X-Y-session.md, .session/context-story-X-Y.md, src/feature.ts (parallel)
```

**Bash batching:**
```bash
# EFFICIENT: Combine git operations
git status && git branch --show-current && git log -1 --oneline

# EFFICIENT: Commit, push, and verify in single command
git add . && git commit -m "feat(X-Y): implement feature" && git push -u origin $(git branch --show-current)
```

**Subagent parallelism:**
```yaml
# EFFICIENT: If doing both status check AND backlog research
# spawn both in same turn when results don't depend on each other
```

See `/dev-patterns` skill → "Turn-Efficient Patterns" for complete guidance.

**Note:** Individual agents may include agent-specific examples beyond these core patterns.

---

## Interactive Background Task Protocol

When spawning background subagents, **do NOT block waiting for results** unless the next action depends on them. Cyclist provides real-time notifications when background tasks complete.

### The Anti-Pattern (DO NOT DO THIS)

```yaml
# WRONG - Spawns background then immediately blocks
Task tool:
  run_in_background: true
  prompt: ...

# Then immediately:
TaskOutput tool:
  task_id: {id}
  block: true    # ← Defeats the purpose of background!
```

This blocks the entire conversation while waiting - the user cannot interact.

### The Correct Pattern: Fire and Continue

**When the result is NOT needed immediately:**

```yaml
# 1. Spawn the background task
Task tool:
  subagent_type: "general-purpose"
  model: "haiku"
  run_in_background: true
  prompt: |
    Read and follow: .pennyfarthing/agents/testing-runner.md
    REPOS: all
```

```markdown
# 2. Tell the user and KEEP WORKING
I've kicked off tests in the background. Cyclist will notify you when they complete.

In the meantime, let me continue with [next task]...
```

**Cyclist automatically:**
- Detects the background Task via OTEL spans
- Tracks completion status
- Shows expandable notification in MessageView when done
- User can click to see full output

### When to Use Each Pattern

| Situation | Pattern | Rationale |
|-----------|---------|-----------|
| Status check before deciding what to do | **Foreground** (no `run_in_background`) | Need result to proceed |
| Tests while writing more code | **Background + continue** | Independent work |
| Multiple independent file searches | **Parallel background** | No dependencies |
| Handoff preflight checks | **Foreground** | Sequential workflow |
| Long lint/build while discussing | **Background + continue** | User can interact |

### Checking Background Tasks (When Needed)

If you DO need to check on a background task later:

```yaml
TaskOutput tool:
  task_id: {id}
  block: false     # Non-blocking check
  timeout: 1000    # Quick timeout
```

This returns immediately with current status without blocking the conversation.

### Key Insight

The user wants to **interact while long-running processes execute**. Background tasks + Cyclist notifications enable this. Blocking defeats it.

---

## Test Delegation Protocol

**NEVER run tests directly.** Always delegate to the `testing-runner` subagent.

### Why Delegate?

- Consistent test execution across all agents
- Proper result caching (Story 31-8)
- Standardized output format for handoff
- Supports multi-repo test orchestration

### Invocation Template

```yaml
Task tool:
  subagent_type: "testing-runner"
  prompt: |
    REPOS: all | repo1,repo2
    CONTEXT: why running tests
    RUN_ID: unique-id
    # Optional - omit to run all tests:
    FILTER: pattern  # global filter
    FILTERS:         # or per-repo filters
      repo1: pattern1
      repo2: pattern2
```

### What NOT to Do

```bash
# WRONG - Never run these directly
just test
go test ./...
npm test
pytest
```

Always spawn `testing-runner` instead.

---

## Exit Protocol

Before exiting or switching agents:

1. **Capture learnings** to sidecar (see above)
2. **Update session file** if work in progress
3. **Report status** to user

---

**This behavior is inherited by all agents. Strategic and tactical agents add their own protocols on top.**
