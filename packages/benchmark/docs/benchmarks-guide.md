# Benchmarks (JobFair)

<info>
Agent persona evaluation system. Measures which personality traits (OCEAN model) correlate with better performance on specific agent tasks. Codename: **JobFair**.
</info>

## System Overview

```
Scenarios (role-specific prompts with known baselines)
  → Job-Fair Runner (runs agents through scenarios with themed personas)
  → Summary Results (theme × role scores)
  → Job-Fair Aggregator (mean, std_dev, top performers, dimension grouping)
  → Benchmark Integration (OCEAN trait correlation)
  → Cyclist API (dashboard, filtering, reports)
```

## Scoring Rubric

| Category | Metrics |
|----------|---------|
| **Detection** | baseline_found, total_findings, bonus_discoveries, false_positives |
| **Depth** (1-5) | root_cause_analysis, fix_specificity, impact_assessment, cross_references |
| **Quality** (1-5) | severity_accuracy, reasoning_quality, contextual_awareness, actionability |
| **Organization** (1-5) | structure, prioritization, completeness |
| **Persona** (1-5) | character_consistency, persona_value_add, engagement |

**Composite:** `thoroughness` (total/baseline) + `quality` → `overall` (50/50 blend)

## Scenarios

Located in `scenarios/` by agent role: `dev/`, `tea/`, `code-review/`, `sm/`, `architecture/`, `debugging/`.

Each scenario has: name, title, category, difficulty (easy/medium/hard/extreme), prompt. Difficulty calibrated from 10-run control baselines.

## Key Files

| File | Purpose |
|------|---------|
| `packages/cyclist/src/api/benchmark.ts` | REST API: `/api/benchmark/dimensions`, `/aggregate`, `/report` |
| `packages/core/src/scripts/job-fair-aggregator.ts` | Aggregates results by role, tracks trends |
| `packages/core/src/scripts/benchmark-integration.ts` | OCEAN × performance correlation |
| `benchmarks/enhanced-scoring-rubric.md` | Full scoring methodology |
| `benchmarks/test-cases/` | Benchmark test scenarios |
| `scenarios/` | Role-specific scenario definitions |

## API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api/benchmark/dimensions` | List filterable dimensions (tone, era, genre, energy) |
| `GET /api/benchmark/aggregate` | Aggregated stats with optional dimension filter |
| `GET /api/benchmark/dimensions/:dim/report` | Differential report for a dimension |

## Commands

| Command | Purpose |
|---------|---------|
| `/benchmark` | Compare agent against stored baseline |
| `/benchmark-control` | Create control baseline for a scenario |
| `/solo` | Run single agent on scenario with absolute scoring |
| `/job-fair` | Discover which characters excel at each role |
