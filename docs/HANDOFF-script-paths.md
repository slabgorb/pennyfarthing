# Handoff: Script Path Fixes

## Status: IN PROGRESS

## Context
We're consolidating scripts across pennyfarthing, conductor, and siemulator. The goal is to have pennyfarthing manage all shared scripts and deploy them consistently.

## What's Done

### 1. Bootstrap Script (COMPLETE)
- Created `scripts/run.sh` that finds PROJECT_ROOT via `.claude/` marker
- Updated all command files to use `./scripts/run.sh agent-session.sh` pattern
- This solves the absolute path problem for subrepos

### 2. Added Missing Scripts to Assets (COMPLETE)
Root scripts now deployed:
- `run.sh`, `agent-session.sh`, `check-context.sh`, `repo-utils.sh`
- `worktree-manager.sh`, `release.sh`, `uninstall.sh`

Utility scripts now in `assets/scripts/utils/`:
- `git-status-all.sh`, `jira-lib.sh`, `jira-claim-story.sh`, `jira-sync-story.sh`
- `sync-epic-to-jira.sh`, `find-related-work.sh`, `create-feature-branches.sh`, `check-status.sh`
- Plus existing: `checkpoint.sh`, `file-lock.sh`, `logging.sh`, `repo-scan.sh`, `retry.sh`, `test-setup.sh`

### 3. Released v2.0.0-beta.3 (COMPLETE)
- Pushed to origin with tag

## What's NOT Done

### 1. Fix Script Path References
The utility scripts are in `scripts/utils/` but references in core files point to wrong paths:

```
# WRONG - points to scripts/ root
./scripts/git-status-all.sh
$CLAUDE_PROJECT_DIR/scripts/jira-claim-story.sh

# CORRECT - should point to utils/
./scripts/run.sh utils/git-status-all.sh
./scripts/run.sh utils/jira-claim-story.sh
```

**Files to update:**
- `core/commands/git-cleanup.md` - references `./scripts/git-status-all.sh`
- `core/subagents/sm-story-setup.md` - references `jira-claim-story.sh`
- `core/commands/sync-epic-to-jira.md` - references jira scripts
- `core/guides/tactical-agent-behavior.md` - references `create-feature-branches.sh`
- Need to grep for all `.sh` references and fix paths

### 2. Update run.sh to Handle Utils
The `run.sh` script already handles utils path - verify it works:
```bash
if [[ -f "$PROJECT_ROOT/scripts/$SCRIPT_NAME" ]]; then
    exec "$PROJECT_ROOT/scripts/$SCRIPT_NAME" "$@"
elif [[ -f "$PROJECT_ROOT/scripts/utils/$SCRIPT_NAME" ]]; then
    exec "$PROJECT_ROOT/scripts/utils/$SCRIPT_NAME" "$@"
```

### 3. Clean Up Conductor Duplicates
Conductor has duplicate scripts that should be removed after pennyfarthing update:

**Remove from conductor/scripts/ (managed by pennyfarthing):**
- `agent-session.sh`
- `check-context.sh`
- `repo-utils.sh`
- `worktree-manager.sh`
- `git-status-all.sh`
- `jira-claim-story.sh`
- `jira-sync-story.sh`
- `sync-epic-to-jira.sh`
- `find-related-work.sh`
- `create-feature-branches.sh`
- `check-status.sh`
- All hooks: `session-start.sh`, `pre-edit-check.sh`, `git-pre-commit-pennyfarthing.sh`
- All utils: `checkpoint.sh`, `file-lock.sh`, `logging.sh`, etc.

**Keep in conductor/scripts/ (project-specific):**
- `build-all.sh`, `start-all.sh`, `test-all.sh`
- `dev-setup.sh`, `setup-mcp.sh`, `setup-standalone.sh`
- `jira-sync.sh` (different from jira-sync-story.sh)
- `manage-sprint.sh`, `sprint-common.sh`
- And ~25 more conductor-specific scripts

### 4. Reinstall Pennyfarthing in Conductor
```bash
cd /Users/keithavery/Projects/conductor
pennyfarthing uninstall --force
pennyfarthing init --force
pennyfarthing doctor
```

### 5. Reinstall Pennyfarthing in Siemulator
```bash
cd /Users/keithavery/Projects/siemulator
pennyfarthing uninstall --force
pennyfarthing init --force
pennyfarthing doctor
```

## Commands to Continue

```bash
# 1. Find all script references that need fixing
grep -rn '\.sh' /Users/keithavery/Projects/pennyfarthing/core/ --include="*.md" | grep -E '\./scripts/[a-z]' | grep -v run.sh

# 2. Update references to use run.sh pattern
# Example: ./scripts/git-status-all.sh → ./scripts/run.sh git-status-all.sh

# 3. Rebuild and test
npm run build
cd /Users/keithavery/Projects/siemulator && pennyfarthing update --force

# 4. Clean conductor
cd /Users/keithavery/Projects/conductor
# Remove duplicates, then pennyfarthing init
```

## Key Insight
The `run.sh` bootstrap already handles finding scripts in both `scripts/` and `scripts/utils/`, so the pattern should be:
```bash
./scripts/run.sh <script-name.sh> [args]
```

This works whether the script is in `scripts/` root or `scripts/utils/`.
