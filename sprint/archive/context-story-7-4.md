# Story 7-4: Aggregate Job-Fair Results into Benchmark Statistics - Technical Context

## Story Overview

| Field | Value |
|-------|-------|
| Story ID | 7-4 |
| Title | Aggregate Job-Fair Results into Benchmark Statistics |
| Points | 3 |
| Priority | P2 |
| Epic | 7 (Agent Performance Benchmarking Suite) |
| Jira | MSSCI-11389 |
| Repo | pennyfarthing |

## Problem Statement

Job-fair runs generate per-theme benchmark data in `internal/results/job-fair/{theme}-{timestamp}/summary.yaml`, but this data isn't aggregated across themes. We need:

1. **Cross-theme statistics** - How do roles perform across ALL themes, not just one?
2. **Top performer identification** - Which characters consistently excel across themes?
3. **Baseline incorporation** - Job-fair control runs should feed into overall baselines
4. **Historical trends** - Track benchmark quality over time (score variance, completion rates)

## Current State

### What Exists

**Job-fair produces per-theme results:**
```
internal/results/job-fair/
├── 1984-20260106T015755Z/
│   ├── summary.yaml      # Champions, matrix, rankings for this theme
│   └── runs/{role}/{char}/run_N.json
├── shakespeare-20260105/
└── discworld-20260104/
```

**Per-theme summary.yaml contains:**
- `champions`: Per-role winners with scores
- `matrix`: Character → Role → Score grid
- `overall_rankings`: Characters sorted by average
- `role_rankings`: Within-role rankings
- `insights`: Theme-specific findings

**benchmark-integration.ts provides analytics but NOT aggregation:**
- `loadBenchmarkData()` - Loads one scenario/role
- `calculateOceanCorrelation()` - OCEAN trait analysis
- `generateBenchmarkReport()` - Single-scenario reports

### What's Missing

1. **No cross-theme aggregation** - Can't answer "Who's the best Dev across all themes?"
2. **No historical tracking** - No way to compare job-fair quality over time
3. **Job-fair results isolated** - Don't feed into baseline calculations
4. **No variance analysis** - Don't know which roles have consistent performers

## Technical Approach

### 1. Aggregation Script (`scripts/aggregate-job-fair.sh`)

Shell script that:
- Scans all `internal/results/job-fair/*/summary.yaml` files
- Extracts per-theme champions and matrices
- Calculates cross-theme statistics
- Outputs to `internal/results/job-fair/aggregate/`

```bash
# Pseudocode
for theme_dir in internal/results/job-fair/*/; do
  summary=$(cat "$theme_dir/summary.yaml")
  # Extract champions, matrix, rankings
  # Accumulate into aggregate structures
done
# Calculate mean, variance, top performers by role
# Write aggregate/summary.yaml
```

### 2. TypeScript Aggregator (`packages/core/src/scripts/job-fair-aggregator.ts`)

TypeScript module for programmatic access:

```typescript
interface AggregateStats {
  themes_included: string[];
  last_updated: string;
  by_role: {
    [role: string]: {
      mean_score: number;
      std_dev: number;
      top_performers: Array<{ character: string; theme: string; score: number }>;
      baseline_comparison: number; // vs control baseline
    };
  };
  overall_champions: Array<{ character: string; theme: string; avg_score: number }>;
  historical_trend: Array<{ date: string; mean: number; variance: number }>;
}

export function aggregateJobFairResults(): AggregateStats;
export function getTopPerformers(role: string, limit?: number): Performer[];
export function getRoleStatistics(role: string): RoleStats;
export function getHistoricalTrend(role?: string): TrendPoint[];
```

### 3. Aggregate Storage Structure

```
internal/results/job-fair/
├── aggregate/
│   ├── summary.yaml       # Cross-theme aggregate stats
│   ├── by-role/
│   │   ├── dev.yaml       # Dev-specific aggregation
│   │   ├── reviewer.yaml
│   │   ├── tea.yaml
│   │   ├── sm.yaml
│   │   └── architect.yaml
│   └── history/
│       ├── 2026-01-06.yaml  # Daily snapshot
│       └── 2026-01-07.yaml
├── {theme}-{timestamp}/    # Existing per-theme results
└── ...
```

### 4. Historical Trend Tracking

Each aggregation run appends a snapshot to track:
- Mean score by role over time
- Score variance (benchmark quality signal)
- Theme coverage (how many themes have results)
- Completion rate (successful runs / attempted)

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `scripts/aggregate-job-fair.sh` | Create | Shell aggregation script |
| `packages/core/src/scripts/job-fair-aggregator.ts` | Create | TypeScript aggregation module |
| `internal/results/job-fair/aggregate/` | Create dir | Aggregated results storage |
| `pennyfarthing-dist/commands/job-fair.md` | Modify | Document aggregation integration |

## Acceptance Criteria

1. **Job-fair results contribute to overall benchmark statistics**
   - Aggregation script combines all theme summary.yaml files
   - Cross-theme statistics calculated and stored

2. **Baseline calculations incorporate job-fair control runs**
   - Control baselines from job-fair feed into `internal/results/baselines/`
   - Comparison to baselines shown in aggregate stats

3. **Scenario performance tracked across themes**
   - Per-role statistics show performance across all themes
   - Identify which scenarios are consistent vs variable

4. **Summary statistics available (mean by role, variance, top performers)**
   - `aggregate/summary.yaml` contains all summary stats
   - Top N performers per role identified
   - Variance calculated to measure benchmark quality

5. **Historical trend tracking for benchmark quality**
   - Daily snapshots in `aggregate/history/`
   - Trend data shows score changes over time
   - Can detect benchmark quality regression

## Testing Strategy

1. **Unit tests for aggregator functions**
   - Test with mock summary.yaml data
   - Verify mean, std_dev calculations
   - Test empty/partial data handling

2. **Integration tests**
   - Run aggregation on actual job-fair results
   - Verify output format matches specification
   - Test historical append behavior

3. **Shell script tests**
   - Test with missing directories
   - Test incremental aggregation
   - Verify YAML output validity

## Dependencies

- `yq` for YAML processing in shell
- `yaml` npm package for TypeScript
- Existing job-fair results in `internal/results/job-fair/`
- Baseline data in `internal/results/baselines/`

## Risks

| Risk | Mitigation |
|------|------------|
| No job-fair results exist yet | Script handles empty state gracefully |
| Inconsistent summary.yaml formats | Validate structure before processing |
| Large number of themes slows aggregation | Cache intermediate results |

## Related Work

- **Story 7-1** (in progress): Benchmark runner framework - provides foundation
- **Story 7-2** (done): Job-fair role-selective execution - produces the data we aggregate
- **benchmark-integration.ts**: Existing analytics patterns to follow
