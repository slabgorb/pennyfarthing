# Shell Productivity Toolkit

Shell aliases, functions, and shortcuts for power users working with Claude Code and Pennyfarthing.

## Quick Setup

Add to your shell config (`~/.zshrc` or `~/.bashrc`):

```bash
# Source all utilities
source_pennyfarthing() {
  local pf_scripts="$CLAUDE_PROJECT_DIR/.claude/scripts/utils"
  [[ -d "$pf_scripts" ]] && {
    source "$pf_scripts/checkpoint.sh"
    source "$pf_scripts/retry.sh"
    source "$pf_scripts/logging.sh"
    source "$pf_scripts/file-lock.sh"
  }
}
```

## Multi-Account Management

For developers with multiple Claude Max Pro accounts.

### Account Switching Functions

```bash
# Switch to personal account
claude-personal() {
  rm -f ~/.claude
  ln -s ~/.claude-personal ~/.claude
  echo "Switched to personal Claude account"
}

# Switch to work account
claude-work() {
  rm -f ~/.claude
  ln -s ~/.claude-work ~/.claude
  echo "Switched to work Claude account"
}

# Show active account
claude-which() {
  if [[ -L ~/.claude ]]; then
    local target=$(readlink ~/.claude)
    local account=${target##*/.claude-}
    echo "Active Claude account: $account"
  else
    echo "~/.claude is not a symlink (single account mode)"
  fi
}

# Add custom accounts as needed
claude-clientx() {
  rm -f ~/.claude
  ln -s ~/.claude-clientx ~/.claude
  echo "Switched to client-x Claude account"
}
```

### Startup Account Indicator

Add to shell config for color-coded status:

```bash
# Show Claude account on shell startup
if [[ -L ~/.claude ]]; then
  local target=$(readlink ~/.claude)
  local account=${target##*/.claude-}
  case $account in
    personal) echo "\033[0;32mClaude: personal\033[0m" ;;  # Green
    work)     echo "\033[0;34mClaude: work\033[0m" ;;      # Blue
    *)        echo "\033[0;33mClaude: $account\033[0m" ;;  # Yellow
  esac
fi
```

### Check Usage Without Switching

```bash
# Check specific account usage
CLAUDE_CONFIG_DIR=~/.claude-work ccusage

# Check current account usage
ccusage
```

## Session Management

### Checkpoint System

Save and restore session state.

```bash
source .claude/scripts/utils/checkpoint.sh

# Save progress
checkpoint_save "dev-phase" "implemented user auth"
checkpoint_save "last_file" "src/main.go:42"

# Restore from checkpoint
phase=$(checkpoint_restore "dev-phase")

# List recent checkpoints
checkpoint_list          # Last 20
checkpoint_list 50       # Last 50

# Cleanup
checkpoint_rotate 100    # Keep last 100
checkpoint_clear         # Remove all
```

### Context Monitoring

```bash
# Human-readable context status
.claude/scripts/check-context.sh --human

# Load into environment variables
eval $(.claude/scripts/check-context.sh)
echo "Context: $CONTEXT_PERCENT% ($CONTEXT_TOKENS tokens)"
echo "Status: $CONTEXT_STATUS"

# Check specific session
.claude/scripts/check-context.sh --session <session-id>
```

### Quick Aliases

```bash
# Context check alias
alias ctx='.claude/scripts/check-context.sh --human'

# Doctor alias
alias pfd='pennyfarthing doctor'
alias pfdf='pennyfarthing doctor --fix'
```

## Error Handling

### Retry with Backoff

```bash
source .claude/scripts/utils/retry.sh

# Retry up to 3 times, initial delay 1s, max 10s
retry_with_backoff 3 1 10 curl -s https://api.example.com/health

# Retry npm install
retry_with_backoff 5 2 30 npm install

# Fallback pattern
command_with_fallback "git pull --ff-only" "git pull --no-rebase"
```

### File Locking

```bash
source .claude/scripts/utils/file-lock.sh

# Execute under lock
with_lock ".session/state.json" exclusive update-state.sh

# Manual lock management
lock_acquire ".session/data.json" exclusive 10
# ... do work ...
lock_release ".session/data.json"

# Check if locked
if lock_status ".session/data.json"; then
  echo "File is locked"
fi

# Cleanup stale locks (>5 minutes old)
lock_cleanup
```

## Structured Logging

```bash
source .claude/scripts/utils/logging.sh

# Write logs
log_info "Starting workflow"
log_info "File processed" '"file":"src/main.go","lines":42'
log_warn "Context usage high" '"percent":75'
log_error "Command failed" '"code":1'

# View logs
log_list           # Last 20 entries
log_list 50        # Last 50 entries

# Manage logs
log_rotate 1000    # Keep last 1000 lines
log_clear          # Remove all
```

Log location: `.session/agent-logs.jsonl`

### Filter logs with jq

```bash
# Filter by level
cat .session/agent-logs.jsonl | jq 'select(.level == "ERROR")'

# Filter by agent
cat .session/agent-logs.jsonl | jq 'select(.agent == "dev")'

# Filter by time
cat .session/agent-logs.jsonl | jq 'select(.timestamp > "2026-01-12T15:00:00Z")'
```

## Script Patterns

### Error Handling Boilerplate

```bash
#!/usr/bin/env bash
set -euo pipefail

# Cleanup on exit
trap "rm -rf $TMPDIR" EXIT
```

### Color-Coded Output

```bash
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
```

### Dry-Run Pattern

```bash
DRY_RUN=${DRY_RUN:-false}

run() {
  if $DRY_RUN; then
    echo "[DRY-RUN] $*"
  else
    "$@"
  fi
}

# Usage
run git commit -m "message"
```

### Directory Resolution

```bash
# Script directory
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Project root
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Find .claude directory (works from any subdirectory)
find_claude_root() {
  local d="$PWD"
  while [[ ! -d "$d/.claude" ]] && [[ "$d" != "/" ]]; do
    d="$(dirname "$d")"
  done
  echo "$d"
}
```

## Parallel Execution

### Launch parallel jobs with staggered starts

```bash
PIDS=()
for task in "${TASKS[@]}"; do
  run_task "$task" > "output-$task.txt" 2>&1 &
  PIDS+=($!)

  # Stagger to avoid rate limiting
  sleep 2
done

# Wait and collect results
FAILED=0
for i in "${!PIDS[@]}"; do
  pid="${PIDS[$i]}"
  task="${TASKS[$i]}"
  if wait "$pid"; then
    echo "  [OK] $task"
  else
    echo "  [FAIL] $task"
    FAILED=$((FAILED + 1))
  fi
done

exit $FAILED
```

## Data Processing

### YAML with yq

```bash
# Extract data
yq -r '.agents | to_entries[] | "\(.key):\(.value.character)"' theme.yaml

# Case-insensitive lookup
yq -r ".agents | to_entries[] | select(.value.character | test(\"(?i)$query\")) | .key" theme.yaml
```

### JSON with jq

```bash
# Build JSON output
jq -n \
  --arg run_id "$RUN_ID" \
  --argjson cost "$COST" \
  --rawfile response response.txt \
  '{
    run_id: $run_id,
    cost: $cost,
    response: $response
  }'
```

## Quick Diagnostics

```bash
# Full health check
pennyfarthing doctor --fix

# Context status
.claude/scripts/check-context.sh --human

# Recent checkpoints
source .claude/scripts/utils/checkpoint.sh && checkpoint_list

# Git state
git diff-index --quiet HEAD -- && echo "Clean" || echo "Dirty"

# Find broken symlinks
find .claude -type l ! -exec test -e {} \; -print
```

## Terminal Efficiency

### Useful Aliases

```bash
# Pennyfarthing shortcuts
alias pf='pennyfarthing'
alias pfd='pennyfarthing doctor'
alias ctx='.claude/scripts/check-context.sh --human'

# Git shortcuts for sessions
alias gs='git status -s'
alias gd='git diff'
alias gds='git diff --staged'
alias gc='git commit'

# Quick navigation
alias cdc='cd $CLAUDE_PROJECT_DIR'
alias cds='cd $CLAUDE_PROJECT_DIR/.session'
```

### Path Safety

Always use absolute paths in hooks and scripts:

```bash
# WRONG - breaks in subdirectories
./scripts/my-hook.sh

# CORRECT - always works
"$CLAUDE_PROJECT_DIR/.claude/scripts/my-hook.sh"
```

### Git Lock Recovery

```bash
# Check for stale lock
ls -la .git/index.lock

# Remove if no git process running
rm .git/index.lock

# Use non-locking commands in hooks
git diff-index --quiet HEAD --    # Instead of git status
git ls-files --modified           # Instead of git diff
```

## Complete Shell Config

Add this block to `~/.zshrc` or `~/.bashrc`:

```bash
# === Pennyfarthing Productivity ===

# Multi-account switching
claude-personal() { rm -f ~/.claude; ln -s ~/.claude-personal ~/.claude; echo "Claude: personal"; }
claude-work() { rm -f ~/.claude; ln -s ~/.claude-work ~/.claude; echo "Claude: work"; }
claude-which() {
  [[ -L ~/.claude ]] && echo "Claude: ${$(readlink ~/.claude)##*/.claude-}" || echo "Single account"
}

# Quick commands
alias pf='pennyfarthing'
alias pfd='pennyfarthing doctor'
alias pfdf='pennyfarthing doctor --fix'

# Context monitoring
ctx() {
  local script="${CLAUDE_PROJECT_DIR:-.}/.claude/scripts/check-context.sh"
  [[ -x "$script" ]] && "$script" --human || echo "Not in a Pennyfarthing project"
}

# Source utilities when in project
pf-source() {
  local utils="${CLAUDE_PROJECT_DIR:-.}/.claude/scripts/utils"
  [[ -d "$utils" ]] && {
    source "$utils/checkpoint.sh"
    source "$utils/retry.sh"
    source "$utils/logging.sh"
    source "$utils/file-lock.sh"
    echo "Pennyfarthing utilities loaded"
  }
}

# Startup account indicator
if [[ -L ~/.claude ]]; then
  local acct=${$(readlink ~/.claude)##*/.claude-}
  case $acct in
    personal) echo "\033[0;32mClaude: personal\033[0m" ;;
    work)     echo "\033[0;34mClaude: work\033[0m" ;;
    *)        echo "\033[0;33mClaude: $acct\033[0m" ;;
  esac
fi
```

## See Also

- [Multi-Account Setup](MULTI-ACCOUNT-SETUP.md) - Detailed account configuration
- [Debugging Sessions](DEBUGGING-SESSIONS.md) - Session troubleshooting
- [Troubleshooting](TROUBLESHOOTING.md) - Error recovery
