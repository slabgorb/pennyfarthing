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
if [ -f ".session/current_work.md" ]; then
    echo "=== Active Work Session ==="
    head -50 .session/current_work.md
fi

# Check for worktree sessions
ls .session/current_work.wt-*.md 2>/dev/null
```

---

## Skills Usage

Agents invoke skills based on task:

| Skill | When to Use |
|-------|-------------|
| `/sprint-context` | Sprint status, backlog, story context |
| `/testing` | Running tests, TDD workflow |
| `/dev-patterns` | Implementation patterns |
| `/code-review` | Review checklist |

---

## Exit Protocol

Before exiting or switching agents:

1. **Capture learnings** to sidecar (see above)
2. **Update session file** if work in progress
3. **Report status** to user

---

**This behavior is inherited by all agents. Strategic and tactical agents add their own protocols on top.**
