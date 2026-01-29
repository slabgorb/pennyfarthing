# Meta Scripts

**These scripts are NOT distributed to users.** They are for Pennyfarthing framework development only.

## Contents

| Script | Purpose |
|--------|---------|
| `deploy.sh` | Release Pennyfarthing (version bump, tag, push, GitHub release) |
| `benchmark-runner.{sh,js}` | Run persona benchmarks |
| `job-fair-*.sh` | Job Fair character evaluations |
| `aggregate-benchmark-stats.{sh,js}` | Aggregate benchmark results |
| `solo-runner.sh` | Run single agent on a scenario |
| `parallel-benchmark.sh` | Parallel benchmark execution |
| `consolidate-job-fair.sh` | Consolidate Job Fair results |
| `convert-jobfair-to-benchmarks.sh` | Format conversion |
| `generate-leaderboard.sh` | Build leaderboard from benchmarks |
| `regenerate-summaries.sh` | Regenerate benchmark summaries |
| `cyclist-debug.mjs` | Debug Cyclist connection |
| `handoff-cli.{sh,js}` | Test handoff flow |
| `verify-visual-mapping.js` | Verify theme visual mappings |
| `migrate-assets-to-slug.sh` | One-time migration script |
| `resize-portraits.sh` | Resize portrait images |
| `resolve-portrait.mjs` | Portrait resolution logic |

## Usage

Run from pennyfarthing repo root:

```bash
# Release a new version
./scripts/deploy.sh --dry-run patch
./scripts/deploy.sh patch

# Run benchmarks
./scripts/benchmark-runner.sh --theme mash --agent sm

# Job Fair
./scripts/job-fair-runner.sh mash
```

## Where Should My Script Go?

**Put it here if:**
- It's for framework development/CI only
- Users should NOT have access to it
- It uses GPU/heavy dependencies (keep in meta, not distributed)

**Put it in `pennyfarthing-dist/scripts/` if:**
- Users need it for their workflows
- It's part of the sprint/story/jira tooling

See `CLAUDE.md` for the full decision tree.
