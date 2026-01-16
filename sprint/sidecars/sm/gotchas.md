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
**Reality:** These are valuable benchmark run results - judges, summaries, raw outputs
**Solution:** NEVER delete files in `internal/results/baselines/`. If cleanup is needed, ask user first. These files capture benchmark execution history even when untracked.

## Command Creation Gotchas

### Missing Symlink for New Commands
**Problem:** New command created in `pennyfarthing-dist/commands/` but `/command` not discoverable
**Cause:** Symlink in `.claude/commands/` was never created
**Solution:** When creating new commands, ALWAYS create both:
1. The actual file: `pennyfarthing-dist/commands/{name}.md`
2. The symlink: `cd .claude/commands && ln -s ../../pennyfarthing-dist/commands/{name}.md {name}.md`

Claude Code discovers commands via the `.claude/commands/` directory, not `pennyfarthing-dist/`.

## Jira Sync Gotchas

### Manual Issue Creation Creates Duplicates
**Problem:** Using `jira issue create` manually for epics/stories creates duplicates and messy state
**Cause:** Didn't read the jira skill first; didn't know about `jira-sync.sh`
**Solution:** ALWAYS read `.claude/skills/jira/SKILL.md` before ANY Jira operations. Use the provided scripts:
- `jira-sync.sh <epic>` - Sync all stories in an epic
- `jira-sync-story.sh <story>` - Sync a single story
- Use `--dry-run` first to preview changes

### Wrong Field Name for Jira Key
**Problem:** Sync script says "Not synced to Jira - skipping"
**Cause:** Used `jira_key:` instead of `jira:` in sprint YAML
**Solution:** The field is `jira:` (not `jira_key:`) for both epics and stories

### Canceled vs Cancelled
**Problem:** `jira issue move` fails with "invalid transition state"
**Solution:** Use American spelling: "Canceled" not "Cancelled"

## Handoff Marker Gotchas

### Missing Cyclist Handoff Prompt
**Problem:** After handoff subagent completes, user doesn't see the quick-action button to invoke next agent
**Cause:** Subagent output didn't include the Cyclist marker
**Solution:** Handoff subagents MUST emit `<!-- CYCLIST:HANDOFF:/agent -->` in their final output

This HTML comment is parsed by Cyclist's `quick-actions.js` to show the handoff button. Without it, the user has to manually type `/tea` or `/dev`.

**Format:**
```
<!-- CYCLIST:HANDOFF:/tea -->
```

**Files that need it:**
- `sm-handoff.md` - SM→TEA/Dev transitions
- `generic-handoff.md` - TEA→Dev→Reviewer→SM transitions

### Skill Not Discovered for CLI Commands
**Problem:** Jira assign command failed with "400 Bad Request", wasted time troubleshooting
**Cause:** `/jira` skill wasn't listed in SM agent's `<skills>` section, so it wasn't loaded
**Solution:**
1. When a CLI command fails, ALWAYS check if there's a skill for that tool (`/jira`, `/just`, etc.)
2. Skills must be listed in the agent's `<skills>` section to be auto-discovered
3. Added `/jira` to SM agent skills (2026-01-15)

**Broader lesson:** If you're doing operations with a CLI tool and hit errors, invoke the relevant skill BEFORE troubleshooting manually.

---

*Add story management gotchas discovered during coordination below*
