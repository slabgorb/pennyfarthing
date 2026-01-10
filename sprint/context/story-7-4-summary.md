# Story 7-4: Aggregate Job-Fair Results into Benchmark Statistics - Summary

## What Was Built

A unified `aggregate-benchmark-stats.sh/js` script that scans all consolidated job-fair results and generates comprehensive benchmark statistics. Outputs `internal/results/aggregate-stats.yaml` with per-role statistics, theme rankings, and control baseline comparisons.

## Key Technical Decisions

1. **Node.js over pure Bash:** Followed the story 7-1 pattern using Node.js with yq for YAML parsing. This provides reliable field extraction and clean statistical calculations.

2. **Population standard deviation:** Used n (not n-1) for std_dev since we're calculating the census of all available runs, not sampling from a population.

3. **Custom YAML serializer:** Implemented a simple toYaml() function for output formatting. Works correctly for the nested structure; could use js-yaml in future if complexity grows.

## Implementation Patterns

- **yq field extraction:** `yqGet()`, `yqKeys()`, `yqNumber()` helpers wrap execSync calls to yq
- **Statistics calculation:** `calculateStats()` computes mean, std_dev, n, min, max from arrays
- **Theme loading:** `loadThemeData()` extracts character scores per role from consolidated summaries
- **Rankings generation:** Theme averages sorted descending by mean per role

## Files Modified

| File | Change |
|------|--------|
| `scripts/aggregate-benchmark-stats.sh` | Created - Shell wrapper (8 lines) |
| `scripts/aggregate-benchmark-stats.js` | Created - Node.js implementation (~200 lines) |
| `tests/integration/test_aggregate_benchmark_stats.sh` | Created - 40 integration tests |
| `internal/results/aggregate-stats.yaml` | Generated - 22 themes, ~210 lines |

## Output Structure

```yaml
metadata:
  generated_at: <timestamp>
  themes_processed: 22
  source: internal/results/job-fair/consolidated/

roles:
  dev-codegen: {mean, std_dev, n, min, max}
  dev-debug: ...
  reviewer: ...
  tea: ...
  sm: ...
  architect: ...

rankings:
  dev-codegen:
    - {theme: a-team, mean: 83.5}
    - {theme: blade-runner, mean: 83}
    ...

control:
  baseline: from job-fair-runner.sh
  dev-codegen: {mean, baseline_mean, vs_baseline}
  ...
```

## Lessons for Future Work

1. **Zero scores are filtered intentionally:** The tea role has zeros in control theme (no TEA scenarios in control runs), so we filter `mean > 0` to avoid skewing statistics.

2. **Hardcoded baselines are OK:** The BASELINES object matches job-fair-runner.sh exactly. If baselines change, update both files.

3. **yq is reliable for YAML parsing:** The execSync + yq pattern from story 7-1 works well and avoids adding npm dependencies.

4. **Rankings enable quick theme comparison:** Sorted descending by mean, the rankings section immediately shows which themes perform best per role.

## Key Metrics from Generated Output

| Role | Mean | Std Dev | N | Best Theme |
|------|------|---------|---|------------|
| dev-codegen | 72.99 | 13.45 | 110 | a-team (83.5) |
| dev-debug | 63.57 | 6.68 | 110 | foundation (68.5) |
| reviewer | 86.48 | 4.14 | 110 | discworld (89.5) |
| tea | 83.56 | 3.49 | 105 | the-expanse (87.5) |
| sm | 87.79 | 7.56 | 105 | the-expanse (91.5) |
| architect | 79.45 | 5.24 | 109 | dune (84.5) |
