# Troubleshooting Guide

Comprehensive troubleshooting for common errors and recovery procedures in Pennyfarthing.

## Quick Diagnostics

```bash
# Check installation health
pf doctor --fix

# Check context usage
.pennyfarthing/scripts/core/check-context.sh --human

# List recent checkpoints
source .pennyfarthing/scripts/lib/checkpoint.sh && checkpoint_list

# Verify git state
git diff-index --quiet HEAD -- && echo "Clean" || echo "Dirty"
```

## Common Errors

### Installation Issues

#### "Command not found: pennyfarthing"

**Cause:** CLI not installed or not in PATH.

**Solution:**
```bash
# Install globally (not recommended, prefer local install)
npm install -g @pennyfarthing/core

# Or use npx
pf doctor
```

#### "Symlinks broken or missing"

**Cause:** Symlinks in `.claude/` point to non-existent targets.

**Solution:**
```bash
# Auto-repair broken symlinks
pf doctor --fix

# Or reinitialize
pf setup --force
```

#### "config.local.yaml missing"

**Cause:** Theme configuration file missing.

**Solution:**
```bash
pf doctor --fix
# Creates default config.local.yaml
```

### Path Resolution Errors

#### "Command not found" in hooks

**Cause:** Relative paths break when Claude runs from subdirectories.

**Solution:** Always use `$CLAUDE_PROJECT_DIR` in hook commands:
```bash
# WRONG
./scripts/my-hook.sh

# CORRECT
"$CLAUDE_PROJECT_DIR/.pennyfarthing/scripts/my-hook.sh"
```

#### "Scripts path not found"

**Cause:** Path divergence between old and new script locations.

**Solution:** Scripts are now in `.pennyfarthing/scripts/` (symlinked to `pennyfarthing-dist/scripts/`). Update with:
```bash
pf setup
```

### Git and File Lock Issues

#### "Unable to create .git/index.lock"

**Cause:** Another git process is running or a stale lock file exists.

**Solution:**
```bash
# Check for stale lock
ls -la .git/index.lock

# Remove if stale (no active git process)
rm .git/index.lock

# Use non-locking git commands in hooks
git diff-index --quiet HEAD --    # Instead of git status
git ls-files --modified           # Instead of git diff
```

#### "Symlink gotcha: can't git add"

**Cause:** Attempting to commit through symlinks.

**Solution:** Commit to actual source, not symlinked convenience directories:
```bash
# WRONG - commits to symlink
git add .claude/commands/my-command.md

# CORRECT - commits to source
git add pennyfarthing-dist/commands/my-command.md
```

### Session and Workflow Errors

#### "File has not been read yet"

**Cause:** Write tool called before reading the file.

**Solution:** Always read before writing:
```bash
# In agent code, read first
Read .session/story-session.md
# Then write
Write .session/story-session.md
```

#### "Session file corruption"

**Cause:** Multiple agents writing to shared files concurrently.

**Solution:** Use session-local files:
```bash
# AVOID shared mutable state
.session/current-agent          # Can corrupt

# USE session-specific files
.session/{story-id}-session.md  # Isolated per story
```

#### "Handoff failed - assessment missing"

**Cause:** Agent assessment not written before spawning handoff subagent.

**Solution:** Write assessment to session file BEFORE spawning handoff:
```markdown
## Dev Assessment
- Tests: All passing
- Implementation: Complete
- Ready for review: Yes
```
Then spawn: `handoff` subagent

### Test Failures

#### "Tests timing out"

**Cause:** Test infrastructure not running or container issues.

**Solution:**
```bash
# Check Docker containers
docker ps

# Restart test infrastructure
just test-setup

# Increase timeout if needed
TEST_TIMEOUT=60000 pnpm test
```

#### "No tests to run"

**Cause:** Test pattern doesn't match any test files.

**Language-specific patterns:**

| Language | Flag | Behavior |
|----------|------|----------|
| Go | `-run "Pattern"` | Regex, case-sensitive, matches function names |
| JavaScript | `-t "pattern"` | Substring, case-insensitive |

```bash
# Go - case matters
go test -run "TestUser"     # Works
go test -run "testuser"     # No matches

# JavaScript - case doesn't matter
pnpm test -- -t "user"       # Matches TestUser, testUser, etc.
```

#### "Tests passing locally but failing in CI"

**Causes:**
- Missing environment variables
- Database state not clean
- Race conditions

**Solutions:**
```bash
# Check env vars match CI
diff <(env | sort) <(cat .env.ci | sort)

# Run with race detection (Go)
go test -race ./...

# Ensure clean database state
just db-reset && npm test
```

#### "Container not running"

**Cause:** Integration tests require test database.

**Solution:**
```bash
# Start containers
docker-compose up -d

# Verify database connectivity
pg_isready -h localhost -p 5432

# Or use just recipe
just test-setup
```

### Context and Memory Issues

#### "Tools blocked mid-task"

**Cause:** Context budget exhausted (85% threshold).

**Solution:**
```bash
# Check current usage
.pennyfarthing/scripts/core/check-context.sh --human

# If above 70%, proactively:
# 1. Save checkpoint
source .pennyfarthing/scripts/lib/checkpoint.sh
checkpoint_save "dev-phase" "implemented user auth"

# 2. Update session file with progress
# 3. Commit pending changes
# 4. Hand off or use /pf-session continue
```

#### "Context circuit breaker triggered"

**Cause:** Automatic protection at 85% context usage.

**Recovery:**
1. The circuit breaker blocks further tool use
2. Save your current state manually
3. Commit any pending changes
4. Start fresh session with `/pf-session continue`

### Agent-Specific Issues

#### Reviewer: "Approved failing tests"

**Prevention:** Tests MUST pass before approval:
```bash
# Always run before approval
pnpm test
# or
just test
```

#### Reviewer: "Approved stub implementations"

**Prevention:** Check for TODO comments and incomplete implementations:
```bash
grep -r "TODO" src/
grep -r "throw new Error.*not implemented" src/
```

#### TEA: "Tests not actually failing"

**Verification:** Confirm tests fail for the right reason:
```bash
# Run tests and check output
pnpm test 2>&1 | grep -E "(FAIL|Error|expected)"

# Should see assertion failures, not syntax errors
```

#### SM: "Benchmark results deleted"

**Warning:** Results in `internal/results/baselines/*/dev/runs/` are valuable.

**Prevention:** Never delete without explicit confirmation.

### Background Agent Issues

#### "Background agents dying"

**Cause:** Claude process killed between messages.

**Solution:** Use persistent process model - keep process alive between messages, use `result` message type for turn boundaries.

#### "Tool detection fails"

**Cause:** Incorrect message structure parsing.

**Correct structure:**
```javascript
// Tool use is nested inside assistant messages
assistant.content[].type === 'tool_use'

// NOT at top level
message.type === 'tool_use'  // WRONG
```

## Recovery Utilities

### Retry with Backoff

```bash
source .pennyfarthing/scripts/lib/retry.sh

# Retry up to 3 times with exponential backoff
retry_with_backoff 3 1 10 curl -s https://api.example.com/health
```

### Fallback Commands

```bash
source .pennyfarthing/scripts/lib/retry.sh

# Try primary, fall back to alternative
command_with_fallback "git pull --ff-only" "git pull --no-rebase"
```

### Checkpoint System

```bash
source .pennyfarthing/scripts/lib/checkpoint.sh

# Save progress
checkpoint_save "feature-auth" "completed login endpoint"

# List checkpoints
checkpoint_list

# Restore from checkpoint
checkpoint_restore "feature-auth"
```

### File Locking

```bash
source .pennyfarthing/scripts/lib/file-lock.sh

# Execute command under lock
with_lock ".session/state.json" exclusive "update-state.sh"

# Clean up stale locks (older than 5 minutes)
lock_cleanup
```

## Debug Mode

Enable verbose output for troubleshooting:

```bash
# Set in environment
export PENNYFARTHING_VERBOSE=true

# Or per-command
PENNYFARTHING_VERBOSE=true pf doctor
```

Most scripts support `--verbose` flag:
```bash
.pennyfarthing/scripts/core/agent-session.sh start dev --verbose
```

## Decision Tree

```
Problem?
├── Installation
│   └── pf doctor --fix
├── Path errors
│   └── Use $CLAUDE_PROJECT_DIR
├── Git locks
│   └── rm .git/index.lock (if stale)
├── Tests failing
│   ├── Timeout → just test-setup
│   ├── No matches → Check pattern case
│   └── CI-only → Check env vars
├── Context exhausted
│   └── checkpoint_save → commit → /pf-session continue
└── Agent errors
    └── Check sidecar gotchas for agent
```

## Getting Help

- Run `pf doctor` for automated diagnostics
- Check agent sidecars: `.pennyfarthing/sidecars/{agent}/gotchas.md`
- Review session file: `.session/{story-id}-session.md`
- GitHub Issues: https://github.com/slabgorb/pennyfarthing/issues
