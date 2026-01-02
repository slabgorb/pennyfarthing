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
**Problem:** Untracked files in `results/baselines/*/dev/runs/` look like temp artifacts
**Reality:** These are valuable benchmark run results - judges, summaries, raw outputs
**Solution:** NEVER delete files in `results/baselines/`. If cleanup is needed, ask user first. These files capture benchmark execution history even when untracked.

---

*Add story management gotchas discovered during coordination below*
