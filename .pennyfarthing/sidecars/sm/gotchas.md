# SM Agent Gotchas

> Pennyfarthing-specific story management pitfalls

## Session File Gotchas

### Write Without Read
**Problem:** Write tool fails with "File has not been read yet"
**Solution:** Always Read existing files before Write

### Missing Assessment
**Problem:** Handoff offered without assessment written
**Solution:** Always Edit session file BEFORE spawning handoff subagent

## Scale Assessment Gotchas

### Trivial Story Sent to TEA
**Problem:** 1-point fix goes through full TDD flow
**Solution:** Trivial stories (1-2 pts, chore/fix) go directly to Dev

### Complex Story Without TEA
**Problem:** 8-point feature skips test planning
**Solution:** All standard/complex stories must go through TEA

## Cleanup Gotchas

### Benchmark Results Are Valuable
**Problem:** Untracked files in `internal/results/baselines/*/dev/runs/` look like temp artifacts
**Reality:** These are valuable benchmark run results
**Solution:** NEVER delete files in `internal/results/baselines/`. Ask user first.

## Command/Skill Discovery

### Missing Symlink for New Commands
**Problem:** New command in `pennyfarthing-dist/commands/` not discoverable
**Solution:** Create symlink: `cd .claude/commands && ln -s ../../pennyfarthing-dist/commands/{name}.md`

### Skill Not Discovered
**Problem:** CLI command fails, skill wasn't loaded
**Solution:** Check if there's a skill for that tool (`/jira`, `/just`, etc.) before troubleshooting

## Jira Gotchas

### NEVER GUESS JIRA IDs
Local IDs like `31-18` are NOT Jira keys. Valid keys: `MSSCI-XXXXX`.
Always look up, query, create, or ask - never fabricate.

### Wrong Field Name
Use `jira:` not `jira_key:` in sprint YAML.

### Canceled Spelling
Use American: "Canceled" not "Cancelled"

## Subagent Data Freshness

### Stale epic context data
**Problem:** workflow-status-check reports cached story counts
**Solution:** Verify against `sprint/current-sprint.yaml` before presenting to user
