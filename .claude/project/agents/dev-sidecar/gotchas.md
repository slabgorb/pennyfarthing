# Dev Agent Gotchas

> Pennyfarthing-specific implementation pitfalls

## Path Issues

### Relative Path Failures
**Problem:** Using relative paths that assume current directory
**Solution:** Always use `$PROJECT_ROOT/$REPO_NAME` pattern

### Hook Paths in settings.local.json
**Problem:** Relative paths break when Claude runs from subdirectories
**Solution:** Use `$CLAUDE_PROJECT_DIR` for all hook commands

## Handoff Gotchas

### Not Writing Assessment
**Problem:** Offering handoff without writing assessment to session file
**Solution:** Always Edit session file BEFORE spawning handoff subagent

### Incomplete PR Description
**Problem:** PR description missing context for reviewer
**Solution:** Include summary, test plan, and acceptance criteria references

## Scripts Path Resolution

### run.sh Looking in Wrong Location
**Problem:** `run.sh` was hardcoded to look for scripts at `.claude/pennyfarthing/scripts/` but npm-installed projects have scripts at `.claude/scripts/` (symlinked to node_modules)
**Root cause:** Path divergence between dogfooding setup and npm installation:
- Pennyfarthing repo: `.claude/pennyfarthing/` → `../pennyfarthing-dist/`
- npm-installed: `.claude/scripts/` → `node_modules/pennyfarthing/pennyfarthing-dist/scripts/`
**Solution v1 (4.0.1):** Changed to `.claude/scripts` only - BROKE dogfooding
**Solution v2 (4.0.2):** Try `.claude/scripts` first, fall back to `.claude/pennyfarthing/scripts`
**Lesson:** When fixing path issues, test BOTH dogfooding AND npm installation scenarios
**Fixed:** 2024-12-31

## Benchmark Data Issues

### Missing Baseline Comparisons on Benchmark Page
**Problem:** Benchmark page shows "N/A" for Control and Delta columns
**Root cause:** Data architecture mismatch between storage and loader:
- Baselines stored in `results/baselines/{scenario}/{role}/summary.yaml`
- Themed results stored in `results/benchmarks/{scenario}/{theme-role}/summary.yaml`
- `benchmark-loader.ts` only reads from `results/benchmarks/`, ignores `results/baselines/`
- Themed summaries lack embedded `baseline_comparison` section

**Example:**
- `results/baselines/django-10097/dev/summary.yaml` → control mean: 65.50
- `results/benchmarks/django-10097/breaking-bad-dev/summary.yaml` → mean: 64.38, NO baseline_comparison
- Expected delta: -1.12 (theme underperforms control)

**Solution:** Update `showcase/src/lib/benchmark-loader.ts` to:
1. Load baselines from `results/baselines/` first
2. Match each themed summary to its baseline (same scenario + role)
3. Calculate `delta = theme.mean - baseline.mean` at load time

**Discovered:** 2026-01-03

---

*Add implementation gotchas discovered during development below*
