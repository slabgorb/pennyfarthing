# Debugging Claude Code Sessions

Guide for debugging Claude Code sessions when things go wrong, including verbose mode, log interpretation, failure patterns, and recovery techniques.

## Quick Diagnostics

```bash
# Check installation health
pennyfarthing doctor

# Check context usage
.pennyfarthing/scripts/core/check-context.sh --human

# View recent logs
source .pennyfarthing/scripts/utils/logging.sh && log_list 20

# List checkpoints
source .pennyfarthing/scripts/utils/checkpoint.sh && checkpoint_list
```

## Verbose Mode

Enable detailed output for troubleshooting.

### Environment Variable

```bash
# Enable for all commands
export PENNYFARTHING_VERBOSE=true

# Enable per-command
PENNYFARTHING_VERBOSE=true pennyfarthing doctor
```

### Script Flag

Most scripts support `--verbose`:

```bash
.pennyfarthing/scripts/agent-session.sh start dev --verbose
.pennyfarthing/scripts/core/check-context.sh --verbose
```

### Verbose Output Style

When verbose mode is enabled, output includes:
- Step-by-step reasoning
- Decision trade-offs
- Edge cases and alternatives
- Architecture context
- Potential side effects

## Context Monitoring

### Check Current Usage

```bash
# Human-readable output
.pennyfarthing/scripts/core/check-context.sh --human

# Example output:
# ✅ Context: 65% (130000 tokens) - OK to continue
# ⚠️  Context: 78% (156000 tokens) - AUTO-HANDOFF recommended
```

### Load into Environment

```bash
# Load context variables
eval $(.pennyfarthing/scripts/core/check-context.sh)

# Available variables:
echo $CONTEXT_TOKENS    # 130000
echo $CONTEXT_PERCENT   # 65
echo $CONTEXT_STATUS    # OK or HIGH
echo $HANDOFF_MODE      # ask or auto
```

### Check Specific Session

```bash
.pennyfarthing/scripts/core/check-context.sh --session <session-id>
```

### Thresholds

Configured in `.claude/settings.local.json`:

```json
{
  "context_budget": {
    "warning_threshold": 70,
    "critical_threshold": 85,
    "max_tokens": 200000
  }
}
```

| Level | Threshold | Action |
|-------|-----------|--------|
| OK | < 70% | Continue normally |
| Warning | 70-85% | Consider handoff |
| Critical | > 85% | Circuit breaker triggers |

## Log Interpretation

### Structured Logging

Pennyfarthing uses JSON-structured logs for machine-readable debugging.

```bash
source .pennyfarthing/scripts/utils/logging.sh

# Write logs
log_info "Starting workflow"
log_info "File processed" '"file":"src/main.go","lines":42'
log_warn "Context usage high" '"percent":75'
log_error "Command failed" '"test":"test_auth","exit_code":1'

# View logs
log_list           # Last 20 entries
log_list 50        # Last 50 entries

# Manage logs
log_rotate 1000    # Keep last 1000 lines
log_clear          # Remove all entries
```

### Log Location

`.session/agent-logs.jsonl`

### Log Format

```json
{
  "timestamp": "2026-01-12T15:53:42Z",
  "level": "INFO",
  "agent": "dev",
  "message": "File processed",
  "session_id": "story-30-2",
  "file": "src/main.go",
  "lines": 42
}
```

### Filtering Logs

```bash
# Filter by level
cat .session/agent-logs.jsonl | jq 'select(.level == "ERROR")'

# Filter by agent
cat .session/agent-logs.jsonl | jq 'select(.agent == "dev")'

# Filter by time range
cat .session/agent-logs.jsonl | jq 'select(.timestamp > "2026-01-12T15:00:00Z")'
```

### Color-Coded Output

Console output uses colors:
- **Green** - INFO messages
- **Yellow** - WARN messages
- **Red** - ERROR messages

## Failure Patterns

### Pattern: Context Exhaustion

**Symptoms:**
- Tools randomly blocked mid-task
- "Context circuit breaker triggered" message

**Diagnosis:**
```bash
.pennyfarthing/scripts/core/check-context.sh --human
# Shows: ⚠️ Context: 87% (174000 tokens) - CRITICAL
```

**Recovery:**
1. Save current state: `checkpoint_save "phase" "summary"`
2. Update session file with progress
3. Commit pending changes
4. Use `/pf-session continue` to resume

### Pattern: Session File Corruption

**Symptoms:**
- "File has not been read yet" errors
- Inconsistent workflow state
- Multiple agents claiming same story

**Diagnosis:**
```bash
# Check session file integrity
cat .session/{story-id}-session.md | head -50

# Look for merge conflicts or truncation
grep -E "^<<<<|^====|^>>>>" .session/*.md
```

**Recovery:**
1. Read session file before any writes
2. Use session-specific files, not shared state
3. Restore from checkpoint if needed

### Pattern: Git Lock Deadlock

**Symptoms:**
- "Unable to create .git/index.lock"
- Git commands hang or fail

**Diagnosis:**
```bash
# Check for lock file
ls -la .git/index.lock

# Check for running git processes
ps aux | grep git
```

**Recovery:**
```bash
# Remove stale lock (only if no git process running)
rm .git/index.lock

# Use non-locking commands in hooks
git diff-index --quiet HEAD --    # Instead of git status
git ls-files --modified           # Instead of git diff
```

### Pattern: Path Resolution Failure

**Symptoms:**
- "Command not found" in hooks
- Scripts fail when Claude runs from subdirectory

**Diagnosis:**
```bash
# Check current directory
pwd

# Verify CLAUDE_PROJECT_DIR
echo $CLAUDE_PROJECT_DIR
```

**Recovery:**
Use absolute paths with `$CLAUDE_PROJECT_DIR`:
```bash
# WRONG
./scripts/my-hook.sh

# CORRECT
"$CLAUDE_PROJECT_DIR/.pennyfarthing/scripts/my-hook.sh"
```

### Pattern: Symlink Target Missing

**Symptoms:**
- "No such file or directory" errors
- Commands exist but don't work

**Diagnosis:**
```bash
# Find broken symlinks
find .claude -type l ! -exec test -e {} \; -print

# Check specific symlink
ls -la .claude/commands/my-command.md
```

**Recovery:**
```bash
# Auto-repair with doctor
pennyfarthing doctor --fix

# Or reinitialize
pennyfarthing init --force
```

### Pattern: Agent Handoff Failure

**Symptoms:**
- Next agent doesn't pick up work
- Session file missing assessment

**Diagnosis:**
```bash
# Check session file for assessment
grep -A 10 "## Assessment" .session/{story-id}-session.md
```

**Recovery:**
Write assessment BEFORE spawning handoff subagent:
```markdown
## Dev Assessment
- Tests: All passing
- Implementation: Complete
- Ready for review: Yes
```

## Recovery Techniques

### Checkpoint System

Save and restore session state across interruptions.

```bash
source .pennyfarthing/scripts/utils/checkpoint.sh

# Save checkpoint
checkpoint_save "dev-phase" "implemented user auth, tests passing"

# List recent checkpoints
checkpoint_list

# Restore from checkpoint
data=$(checkpoint_restore "dev-phase")
echo "Restored: $data"

# Cleanup
checkpoint_rotate 100    # Keep last 100 entries
```

**Checkpoint Location:** `.session/checkpoints.log`

**Format:** `ISO_TIMESTAMP|LABEL|DATA`

### Retry with Backoff

Automatically retry flaky operations.

```bash
source .pennyfarthing/scripts/utils/retry.sh

# Retry up to 3 times with exponential backoff
# Initial delay: 1s, max delay: 10s
retry_with_backoff 3 1 10 curl -s https://api.example.com/health

# With custom parameters
retry_with_backoff 5 2 30 npm install
```

**Parameters:**
1. MAX_ATTEMPTS - How many times to try
2. INITIAL_DELAY - First retry delay (seconds)
3. MAX_DELAY - Maximum delay cap (seconds)
4. COMMAND... - Command to execute

### Fallback Commands

Try primary command, fall back to alternative.

```bash
source .pennyfarthing/scripts/utils/retry.sh

# Git pull with fallback
command_with_fallback "git pull --ff-only" "git pull --no-rebase"

# npm with fallback
command_with_fallback "npm ci" "npm install"
```

### File Locking

Prevent concurrent access corruption.

```bash
source .pennyfarthing/scripts/utils/file-lock.sh

# Execute under lock
with_lock ".session/state.json" exclusive update-state.sh

# Manual lock management
lock_acquire ".session/data.json" exclusive 10
# ... do work ...
lock_release ".session/data.json"

# Check lock status
if lock_status ".session/checkpoints.log"; then
    echo "File is currently locked"
fi

# Cleanup stale locks (older than 5 minutes)
lock_cleanup
```

## Circuit Breaker

Automatic protection at 85% context usage.

### When It Triggers

The circuit breaker:
1. Monitors context usage before each tool call
2. Blocks Edit, Write, Bash, and Task tools at critical threshold
3. Returns exit code 2 to prevent execution
4. Provides recovery instructions

### Error Message

```
CONTEXT CIRCUIT BREAKER TRIGGERED

Required actions:
1. checkpoint_save "{phase}" "summary"
2. Update session file with progress
3. Commit pending changes
4. Invoke /pf-session continue

DO NOT attempt further tool calls
```

### Recovery Procedure

1. **Save state immediately**
   ```bash
   source .pennyfarthing/scripts/utils/checkpoint.sh
   checkpoint_save "dev-phase" "implemented auth, need review"
   ```

2. **Update session file** - Note current progress and next steps

3. **Commit pending work**
   ```bash
   git add -A && git commit -m "WIP: checkpoint before context handoff"
   ```

4. **Resume in new session**
   ```
   /pf-session continue
   ```

## Doctor Command

Comprehensive health check with auto-repair.

```bash
# Check everything
pennyfarthing doctor

# Auto-fix issues
pennyfarthing doctor --fix
```

### Checks Performed

| Check | What It Verifies |
|-------|------------------|
| Prerequisites | Node.js, npm, yq, jira CLI |
| Symlinks | .claude/pennyfarthing, git hooks, scripts |
| Build status | dist/ is up to date |
| Broken symlinks | Finds and can remove dead links |
| Settings | .claude/settings.local.json exists |
| Persona config | Theme configuration valid |

### Output Codes

| Status | Color | Meaning |
|--------|-------|---------|
| OK | Green | Working correctly |
| WARN | Yellow | Non-critical issue |
| FAIL | Red | Needs attention |
| FIX | Green | Auto-repaired |

## Cyclist Visual Debugging

Use Cyclist for visual session debugging.

### Audit Log

View all tool executions in the Audit Log tab:
- Timestamp and duration
- Tool name and input
- Success/failure status
- Export to JSON/CSV

### Diff History

Navigate through file edits:
- Previous/next buttons (j/k keys)
- View modes: partial, combined, original, current
- Position indicator

### Stats Strip

Monitor in real-time:
- Token usage (input/output)
- Context percentage with color coding
- Tool call count
- Estimated cost

## Common Issues Reference

| Issue | Quick Fix |
|-------|-----------|
| Context exhausted | `checkpoint_save` → commit → `/pf-session continue` |
| Symlinks broken | `pennyfarthing doctor --fix` |
| Git locked | `rm .git/index.lock` (if stale) |
| Path errors | Use `$CLAUDE_PROJECT_DIR` |
| Session corrupt | Read before write, use session-specific files |
| Agent stuck | Check session file for missing assessment |
| Tools blocked | Check context with `check-context.sh --human` |

## See Also

- [Troubleshooting Guide](TROUBLESHOOTING.md) - Error catalog with solutions
- [Cyclist Guide](CYCLIST-GUIDE.md) - Visual debugging terminal
- [Configuration](CONFIGURATION.md) - Settings reference
