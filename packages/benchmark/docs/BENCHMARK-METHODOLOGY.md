# Benchmark Tier Methodology

This document explains how theme benchmark tiers are computed and what they mean.

## Overview

Benchmark tiers measure how well a theme's personas perform compared to a **control baseline** (no persona applied). Higher tiers indicate better performance vs control.

## Tier Definitions

| Tier | Delta vs Control | Description |
|------|------------------|-------------|
| S | >= +7 | Elite - top performers that significantly outperform control |
| A | >= +5 | Excellent - strong positive impact vs control |
| B | >= +3 | Strong - solid performers with measurable improvement |
| C | >= +1 | Good - above average, slight improvement |
| D | < +1 | Average/Below - no measurable improvement or worse |
| U | — | Unbenchmarked - no benchmark data available |

## How Tiers Are Computed

### Data Source

Tiers are computed from **Job Fair** benchmark results in `internal/results/job-fair/*/summary.yaml`. Each run tests all characters in a theme across multiple agent roles.

### Normalization

Benchmark runs exist in two formats with different role sets:
- **Old format:** dev, reviewer, sm, tea (4 roles)
- **New format:** dev-codegen, dev-debug, reviewer, sm, tea, architect (6 roles)

To enable fair comparison across formats, we normalize dev roles:

```
dev-codegen + dev-debug → averaged "dev" score
```

Final comparison uses 4 normalized roles: **dev, reviewer, sm, tea**

### Algorithm

1. **Find summary files** in `internal/results/job-fair/*/`

2. **Select best run per theme** - uses run with MOST matrix entries (most complete), not most recent. Minimum 20 entries required.

3. **Normalize dev roles** - if dev-codegen/dev-debug exist, average them into synthetic "dev"

4. **Compute role deltas** - for each role, compare theme mean vs control baseline mean

5. **Average deltas** - mean delta across all 4 normalized roles

6. **Assign tier** based on mean delta thresholds

### Formula

```
delta_role = theme_mean_role - baseline_mean_role
mean_delta = sum(delta_role) / 4  # across dev, reviewer, sm, tea
tier = threshold(mean_delta)
```

## Relationship to Zeitgeist Scores

Benchmark tiers measure **performance** - do personas help or hurt task completion?

Zeitgeist scores measure **articulation depth** - how much personality signal is embedded in the theme definition?

These are orthogonal dimensions:
- A theme can have high Zeitgeist (rich personalities) but low tier (poor performance)
- A theme can have low Zeitgeist (minimal personality) but high tier (great performance)

The ideal is high scores on both dimensions.

## Running the Tier Script

```bash
# Dry run - show what would change
pennyfarthing-dist/scripts/theme/compute-theme-tiers.js --dry-run

# Apply changes to theme files
pennyfarthing-dist/scripts/theme/compute-theme-tiers.js

# Verbose output with skipped runs
pennyfarthing-dist/scripts/theme/compute-theme-tiers.js --dry-run --verbose
```

## Current Distribution

As of 2026-01-23:

| Tier | Count | Percentage |
|------|-------|------------|
| S | 8 | 10% |
| A | 25 | 32% |
| B | 27 | 35% |
| C | 4 | 5% |
| D | 13 | 17% |
| U | 25 | — |

## Key Design Decisions

1. **Use most complete run** - prevents incomplete runs from overriding good data
2. **Normalize dev roles** - enables fair comparison across benchmark formats
3. **Minimum 20 entries** - ensures statistical significance
4. **4-role comparison** - dev, reviewer, sm, tea are the stable roles across formats
