---
name: dev-patterns
description: Common development patterns, fixes, and gotchas. Use when implementing features, debugging issues, or avoiding known pitfalls.
allowed_tools: [Read, Glob, Grep, Task]
---

# Dev Patterns Skill

## Overview

This skill captures common development patterns, fixes, and gotchas that apply across projects using the pennyfarthing agent framework.

## Critical Patterns

### Bash Tool Working Directory

**Problem:** The Bash tool maintains a persistent working directory. Relative `cd` commands fail when already in a different directory.

**Symptoms:**
- `cd API && just test` fails with "no such file or directory"
- Commands fail because assuming wrong directory

**Solution:** Always use absolute paths with `$CLAUDE_PROJECT_DIR`:

```bash
# WRONG - relative cd fails if you're already somewhere else
cd API && just test

# CORRECT - absolute path always works
cd $CLAUDE_PROJECT_DIR/API && just test
```

**Best Practice:** Explicit `cd` with absolute path in every Bash call:

```bash
# Single-repo: from anywhere - always works
cd $CLAUDE_PROJECT_DIR && git push -u origin feat/branch
cd $CLAUDE_PROJECT_DIR && just test

# Multi-repo: use repo-utils.sh for dynamic lookup
source $CLAUDE_PROJECT_DIR/scripts/repo-utils.sh
cd $CLAUDE_PROJECT_DIR/$(get_repo_path "myrepo") && just test
```

### TypeScript Type Imports

**Problem:** Build fails with `verbatimModuleSyntax` errors.

**Solution:** Use `import type` for type-only imports:

```typescript
// WRONG - causes build errors
import { User, Ticket } from '@/types';

// CORRECT
import type { User, Ticket } from '@/types';
```

### Go Error Handling

**Problem:** Silent failures when errors aren't checked.

**Solution:** Always handle errors explicitly:

```go
// WRONG - ignores error
result, _ := doSomething()

// CORRECT
result, err := doSomething()
if err != nil {
    return fmt.Errorf("doSomething failed: %w", err)
}
```

### UUID Parsing

**Problem:** Invalid UUIDs cause panics or unexpected behavior.

**Solution:** Always validate UUID parsing:

```go
// WRONG - panics on invalid UUID
id := uuid.MustParse(rawID)

// CORRECT
id, err := uuid.Parse(rawID)
if err != nil {
    return fmt.Errorf("invalid UUID: %w", err)
}
```

## HTTP Status Codes

Use appropriate status codes consistently:

| Code | When to Use |
|------|-------------|
| `200 OK` | Successful GET, PUT, PATCH |
| `201 Created` | Successful POST creating new resource |
| `204 No Content` | Successful DELETE |
| `400 Bad Request` | Invalid input (validation errors) |
| `401 Unauthorized` | Missing or invalid authentication |
| `403 Forbidden` | Authenticated but not authorized |
| `404 Not Found` | Resource doesn't exist |
| `409 Conflict` | Resource state conflict (duplicate) |
| `500 Internal Server Error` | Server-side error (always log it!) |

<details>
<summary><strong>Test Patterns</strong></summary>

### Test Isolation

Each test should:
1. Set up its own state
2. Clean up after itself
3. Not depend on other tests' state

```go
func TestCreate(t *testing.T) {
    // Setup
    db := testutil.NewTestDB(t)
    defer db.Cleanup()

    // Test
    result, err := Create(db, input)

    // Assert
    require.NoError(t, err)
    assert.Equal(t, expected, result)
}
```

### Table-Driven Tests

```go
func TestValidate(t *testing.T) {
    tests := []struct {
        name    string
        input   string
        wantErr bool
    }{
        {"valid input", "good", false},
        {"empty input", "", true},
        {"too long", strings.Repeat("x", 1000), true},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            err := Validate(tt.input)
            if tt.wantErr {
                assert.Error(t, err)
            } else {
                assert.NoError(t, err)
            }
        })
    }
}
```

</details>

## Common Gotchas

1. **Working directory** - Always use `$CLAUDE_PROJECT_DIR` for absolute paths
2. **Type imports** - Use `import type` for TypeScript types
3. **Error handling** - Never ignore errors in Go
4. **UUID parsing** - Always validate, never panic
5. **Test isolation** - Each test manages its own state

## Turn-Efficient Patterns

Minimize API round-trips by batching operations and parallelizing where possible. Each tool call is a "turn" - fewer turns means faster completion.

### Batch Bash Commands

Chain related commands with `&&` instead of separate calls:

```bash
# INEFFICIENT - 3 turns
git status
git branch --show-current
git log -1 --oneline

# EFFICIENT - 1 turn
git status && git branch --show-current && git log -1 --oneline
```

For git workflows, batch the entire operation:

```bash
# INEFFICIENT - 3 turns
git add .
git commit -m "feat: add feature"
git push -u origin $(git branch --show-current)

# EFFICIENT - 1 turn
git add . && git commit -m "feat: add feature" && git push -u origin $(git branch --show-current)
```

### Parallel Tool Calls

When operations are independent, invoke multiple tools in the same turn:

```
# INEFFICIENT - 3 sequential turns
Turn 1: Read file A
Turn 2: Read file B
Turn 3: Read file C

# EFFICIENT - 1 parallel turn
Turn 1: Read file A, Read file B, Read file C (parallel)
```

**When to parallelize:**
- Reading multiple independent files
- Spawning subagents that don't depend on each other's results
- Running Glob and Grep searches simultaneously
- Fetching multiple web resources

**When NOT to parallelize:**
- Operations where later calls depend on earlier results
- Writes that might conflict
- Sequential logic (must read before edit)

### Smart File Operations

Use Grep's internal file reading instead of Read + manual search:

```bash
# INEFFICIENT - 2 turns
Turn 1: Read entire file
Turn 2: (mentally search for pattern)

# EFFICIENT - 1 turn with context
Grep pattern with -C 5 for context
```

Use Glob with brace expansion for multiple patterns:

```bash
# INEFFICIENT - 2 turns
Glob: **/*.ts
Glob: **/*.tsx

# EFFICIENT - 1 turn
Glob: **/*.{ts,tsx}
```

<details>
<summary><strong>Compound Subagents</strong></summary>

Design subagents to do multiple related steps in one spawn:

```yaml
# INEFFICIENT - 2 subagent spawns
Spawn 1: workflow-status-check
Spawn 2: sm-file-summary

# EFFICIENT - 1 compound subagent
Spawn 1: (combined status-check + file-summary subagent)
```

**Good candidates for combining:**
- Preflight checks + handoff updates
- Status gathering + session file updates
- Test running + result parsing

**Creating Compound Subagents:**

When you notice a pattern of sequential subagent calls, consider creating a compound subagent:

1. **Identify the pattern:** Look for repeated sequences like "always call A then B"
2. **Check dependencies:** Can B start before A completes? If yes, parallelize instead.
3. **Create combined prompt:** Merge both subagents' responsibilities into one

**Example: Compound Preflight + Handoff**

Instead of:
```yaml
# Turn 1: Preflight
Task tool:
  subagent_type: "reviewer-preflight"
  prompt: |
    STORY_ID: X-Y
    ...

# Turn 2: Wait for result, then handoff
Task tool:
  subagent_type: "reviewer-handoff-approve"
  prompt: |
    STORY_ID: X-Y
    ...
```

Create a compound definition that does both:
```yaml
Task tool:
  subagent_type: "general-purpose"
  model: "haiku"
  prompt: |
    You are a combined preflight + handoff assistant.

    ## Phase 1: Pre-flight checks
    [Include preflight steps]

    ## Phase 2: If all checks pass, complete handoff
    [Include handoff steps]

    ## Output
    Report: preflight results + handoff status
```

**When NOT to combine:**
- When steps need human review between them (e.g., reviewer assessment before handoff)
- When the first step might fail often (better to fail fast)
- When prompts are already long (context limits)

</details>

### Turn Budget Guidelines

| Story Size | Target Turns |
|------------|--------------|
| 1 point (trivial) | 10-15 |
| 2 points (small) | 15-25 |
| 3 points (medium) | 25-35 |
| 5 points (large) | 35-50 |

**Techniques to reduce turns:**
1. Batch bash commands with `&&`
2. Read multiple files in parallel
3. Use Grep with context instead of Read + search
4. Combine related subagent work
5. Use brace expansion in Glob patterns
6. Spawn independent subagents in parallel
7. Run tests in background while continuing work

<details>
<summary><strong>Background Subagent Execution</strong></summary>

Run slow operations in background to continue working:

```yaml
# Spawn tests in background
Task tool:
  subagent_type: "testing-runner"
  run_in_background: true
  prompt: |
    REPOS: all
    CONTEXT: Background test run
    RUN_ID: bg-001
    SKIP_CACHE_WRITE: true
```

**Check status without blocking:**
```yaml
TaskOutput tool:
  task_id: {task_id}
  block: false
  timeout: 1000
```

**When to use background execution:**
- Test runs while writing more code
- Multiple independent file searches
- Parallel exploration of code paths
- Long-running git operations

**When NOT to use:**
- Operations where next steps depend on the result
- Operations that modify shared state
- Before commit (need to verify GREEN)
- During handoff (need synchronous verification)

</details>

<details>
<summary><strong>Background Task Tracking</strong></summary>

Use the background task tracking utilities to manage session file entries:

```bash
source $CLAUDE_PROJECT_DIR/scripts/utils/background-tasks.sh
SESSION_FILE="$CLAUDE_PROJECT_DIR/.session/${STORY_ID}-session.md"

# After spawning background task, record it:
bg_task_add "$SESSION_FILE" "$TASK_ID" "testing-runner" "Background test run"

# After checking TaskOutput, update status:
bg_task_update "$SESSION_FILE" "$TASK_ID" "completed"  # or "error"

# Clean up finished tasks:
bg_task_cleanup "$SESSION_FILE"
```

**Available functions:**
| Function | Purpose |
|----------|---------|
| `bg_task_add` | Record new background task |
| `bg_task_update` | Update task status (running/completed/error) |
| `bg_task_cleanup` | Remove completed and errored tasks |
| `bg_task_list` | Show all running tasks |
| `bg_task_check` | Return 0 if any tasks running (for conditionals) |
| `bg_task_summary` | Print counts by status |

**Lifecycle:**
1. Spawn with `run_in_background: true`
2. Record: `bg_task_add "$SESSION_FILE" "$TASK_ID" "type" "description"`
3. Continue other work
4. Periodically check `TaskOutput` with `block: false`
5. Update: `bg_task_update "$SESSION_FILE" "$TASK_ID" "completed"`
6. Cleanup: `bg_task_cleanup "$SESSION_FILE"`

</details>

<details>
<summary><strong>Example: Background Tests While Implementing</strong></summary>

```
Turn 1: Spawn testing-runner in background, continue editing
Turn 2: Make code changes
Turn 3: Check TaskOutput (still running), continue editing
Turn 4: Make more changes
Turn 5: Check TaskOutput (complete, GREEN), proceed to commit
```

This pattern saves turns by overlapping test execution with implementation work.

</details>

## Project Customization

Projects should create their own dev-patterns skill in `.claude/project/skills/dev-patterns/` with:
- Project-specific patterns and conventions
- Known pitfalls for the tech stack
- File location conventions
