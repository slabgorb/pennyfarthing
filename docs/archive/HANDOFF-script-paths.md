# Handoff: Script Path Fixes

## Status: IN PROGRESS

## Context
We're consolidating scripts across pennyfarthing, Pennyfarthing, and siemulator. The goal is to have pennyfarthing manage all shared scripts and deploy them consistently.

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

## What's DONE

### 1. Fix Script Path References (COMPLETE - 2025-12-23)
Updated all script references in `core/` files to use the `./scripts/run.sh <script>` pattern:
- `core/commands/git-cleanup.md` - fixed 5 references
- `core/commands/sync-epic-to-jira.md` - fixed 4 references
- `core/commands/parallel-work.md` - fixed 2 references
- `core/commands/create-branches-from-story.md` - fixed 6 references
- `core/commands/sync-work-with-sprint.md` - fixed 1 reference
- `core/commands/release.md` - fixed 1 reference
- `core/guides/worktree-mode.md` - fixed 3 references
- `core/guides/tactical-agent-behavior.md` - fixed 3 references
- `core/guides/agent-template-*.md` - fixed 3 references
- `core/agents/*.md` - fixed 7 exit instructions
- `core/subagents/sm-*.md` - fixed 2 references

### 2. Verify run.sh Handles Utils (COMPLETE)
The `run.sh` script already correctly searches `scripts/`, `scripts/utils/`, and `scripts/hooks/`.

### 3. Clean Up Pennyfarthing Duplicates (COMPLETE - 2025-12-23)
Removed duplicate scripts from Pennyfarthing/scripts/:
- `git-status-all.sh`, `jira-claim-story.sh`, `jira-lib.sh`, `jira-sync-story.sh`
- `find-related-work.sh`, `check-status.sh`, `create-feature-branches.sh`

Pennyfarthing-specific scripts preserved:
- `build-all.sh`, `start-all.sh`, `dev-setup.sh`, etc. (~40 scripts)

### 4. Reinstall Pennyfarthing in Pennyfarthing (COMPLETE - 2025-12-23)
```
pf uninstall --force
pf setup --force
pf doctor  # All checks passed
```

### 5. Reinstall Pennyfarthing in Siemulator (COMPLETE - 2025-12-23)
```
pf uninstall --force
pf setup --force
pf doctor  # All checks passed
```

## Status: COMPLETE

All script path fixes have been applied:
1. Core files use `./scripts/run.sh <script>` pattern
2. run.sh deployed to Pennyfarthing and siemulator
3. Duplicate scripts removed from Pennyfarthing
4. All projects pass `pf doctor`

## Key Insight
The `run.sh` bootstrap handles finding scripts in `scripts/`, `scripts/utils/`, and `scripts/hooks/`:
```bash
./scripts/run.sh <script-name.sh> [args]
```

This works whether the script is in `scripts/` root or any subdirectory.
