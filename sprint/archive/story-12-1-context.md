# Story 12-1: Copy /solo Command to Pennyfarthing - Technical Context

## Story Overview

| Field | Value |
|-------|-------|
| Epic | 12 - Scientific Benchmarking Migration |
| Points | 3 |
| Priority | P1 |
| Repos | pennyfarthing |
| Jira | MSSCI-11286 |

## Current State

### Source Command (`thunderdome/.claude/project/commands/solo.md`)

The `/solo` command is a 298-line Claude Code command that:

1. **Executes an agent** on a scenario via `claude -p --output-format json --tools ""`
2. **Optionally judges** the response via `/judge` skill
3. **Saves results** via `/finalize-run` skill

**Critical Implementation Detail:**
The `--tools ""` flag is MANDATORY. Without it:
- Agents may use tools internally (Read, Write, Bash)
- Multi-turn conversations occur (num_turns > 1)
- Only the FINAL message is captured (often just a summary)
- Judges evaluate incomplete data → invalid scores

**Modes:**
- **Full (default):** agent → judge → finalize
- **No-judge (`--no-judge`):** raw response only (used by /duel, /relay)

**Multi-run support:** `--runs N` (1-20) with statistics and baseline comparison.

### Target Location

The command needs to be created at:
```
pennyfarthing/.claude/project/commands/solo.md
```

This directory doesn't exist yet and needs to be created.

### Path Adaptations Required

| Thunderdome Path | Pennyfarthing Path |
|------------------|-------------------|
| `.claude/pennyfarthing/personas/themes/{theme}.yaml` | `pennyfarthing-dist/personas/themes/{theme}.yaml` |
| `scenarios/**/{scenario}.yaml` | `scenarios/**/{scenario}.yaml` |
| `results/baselines/{scenario}/{role}/` | `results/baselines/{scenario}/{role}/` |
| `results/benchmarks/{scenario}/{theme}-{role}/` | `results/benchmarks/{scenario}/{theme}-{role}/` |

## Technical Approach

1. **Create directory structure:**
   - `mkdir -p .claude/project/commands`
   - `mkdir -p results/solo` (for direct solo results)

2. **Copy and adapt `solo.md`:**
   - Update theme path from `.claude/pennyfarthing/personas/themes/` to `pennyfarthing-dist/personas/themes/`
   - Verify scenario path remains `scenarios/` (same structure)
   - Ensure results paths work in Pennyfarthing context

3. **Register command:**
   - The command auto-registers via `.claude/project/commands/` directory
   - No manifest updates needed

## Files to Modify/Create

| File | Action | Description |
|------|--------|-------------|
| `.claude/project/commands/solo.md` | Create | Adapted /solo command |
| `results/solo/.gitkeep` | Create | Ensure results directory exists |

## Acceptance Criteria

- [ ] AC1: `/solo` command works in Pennyfarthing
- [ ] AC2: Executes agent with `--tools ""` flag (critical for valid results)
- [ ] AC3: Saves results to `results/solo/`
- [ ] AC4: Works with all 63 persona themes

## Testing Strategy

**Manual Testing (TEA will define more rigorous tests):**

1. **Basic execution (no-judge mode):**
   ```
   /solo discworld:dev --scenario tdd-shopping-cart --no-judge
   ```
   Expect: Raw response with character (Ponder Stibbons) voice

2. **Full evaluation (requires /judge - future story):**
   After Story 12-2:
   ```
   /solo discworld:reviewer --scenario security-review
   ```
   Expect: Granny Weatherwax reviewing code with score

3. **Multi-run (requires /judge):**
   After Story 12-2:
   ```
   /solo control:dev --scenario tdd-shopping-cart --runs 2
   ```
   Expect: Statistics and summary.yaml

**For Story 12-1 specifically:**
- Focus on `--no-judge` mode since `/judge` isn't migrated yet
- Verify theme loading from Pennyfarthing paths
- Verify scenario loading from `scenarios/` (Story 12-4 dependency)

## Dependencies & Risks

### Dependencies

| Dependency | Status | Impact |
|------------|--------|--------|
| Scenarios library (12-4) | Not started | Need at least one scenario for testing |
| Judge skill (12-2) | Not started | Full mode won't work, use `--no-judge` |
| Finalize-run (12-5) | Not started | Won't save results, display only |

**Workaround:** For initial testing, use `--no-judge` mode which doesn't require /judge or /finalize-run.

### Risks

| Risk | Mitigation |
|------|------------|
| Theme path differences break loading | Test with multiple themes, verify path resolution |
| No scenarios to test with | Can test with inline prompt if needed |
| Results directory not created | Ensure `results/solo/` exists with .gitkeep |

## Reference

- **Source:** `~/Projects/thunderdome/.claude/project/commands/solo.md`
- **Theme example:** `pennyfarthing-dist/personas/themes/discworld.yaml`
- **Epic context:** `sprint/context/epic-12-context.md`
