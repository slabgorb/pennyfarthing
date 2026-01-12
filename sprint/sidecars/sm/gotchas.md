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

---

*Add story management gotchas discovered during coordination below*
