# SM Agent Gotchas

> Pennyfarthing-specific story management pitfalls

## Session File Gotchas

### Missing Assessment
**Problem:** Handoff offered without assessment written
**Solution:** Always Edit session file BEFORE spawning handoff subagent

## Jira Gotchas

### NEVER GUESS JIRA IDs
Local IDs like `31-18` are NOT Jira keys. Valid keys: `MSSCI-XXXXX`.
Always look up, query, create, or ask - never fabricate.

### Always Use --project MSSCI Flag
**Problem:** Jira CLI commands fail or behave unexpectedly without project flag
**Solution:** ALWAYS include `--project MSSCI` on move/assign commands

## Session-Sprint ID Mismatch

### Session Uses Local ID, Sprint Uses Jira Key
**Problem:** Session files created with local IDs (e.g., `53-1-session.md`) but sprint YAML stories migrated to use Jira keys as IDs (e.g., `id: MSSCI-12123`)
**Symptom:** `finish-story.sh` fails with "Could not determine Jira key" because it looks up story by session filename
**Root Cause:** Epic 53 was synced to Jira mid-flight after session file was created with old naming convention
**Solution:**
1. For immediate fix: Pass Jira key explicitly or rename session file
2. For systemic fix: Ensure session filenames match story IDs in sprint YAML
**Future Work:** Consider migration script to normalize session filenames when stories are synced to Jira

## Cleanup Gotchas

### Benchmark Results Are Valuable
**Problem:** Untracked files in `internal/results/baselines/` look like temp artifacts
**Reality:** These are valuable benchmark run results
**Solution:** NEVER delete files in `internal/results/baselines/`. Ask user first.
