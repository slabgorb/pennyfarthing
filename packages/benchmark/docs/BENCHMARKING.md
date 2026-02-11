# Scientific Benchmarking Guide

Pennyfarthing provides a scientific benchmarking system for measuring persona performance against standardized scenarios. This guide explains how to use the benchmarking commands and interpret results.

## Prerequisites

### For Sequential Runs
No special setup required. Sequential benchmarks (one at a time) use standard interactive prompts.

### For Parallel Runs
Running multiple benchmarks simultaneously via subagents requires explicit permissions. Run:

```bash
pennyfarthing doctor --fix
```

This adds the required permissions for parallel execution. See [PERMISSIONS.md](PERMISSIONS.md#benchmarking-permissions-parallel-runs) for details.

## Overview

The benchmarking system allows you to:
- Run agents on standardized scenarios
- Create control baselines for comparison
- Calculate statistical significance (Cohen's d effect size)
- Correlate OCEAN personality profiles with performance

## Commands

### `/solo` - Single Agent Evaluation

Run a single agent on a scenario.

```bash
/solo discworld:reviewer --scenario order-service
/solo ted-lasso:sm --scenario sprint-planning-conflict --runs 4
/solo control:dev --scenario tdd-shopping-cart --no-judge
/solo shakespeare:prospero --as dev --scenario django-10554
```

**Arguments:**
- `theme:agent` - Persona and role (e.g., `discworld:reviewer`)
- `--scenario <name>` - Scenario from `scenarios/` directory
- `--as <role>` - (Optional) Cross-role testing: run character as different role
- `--runs N` - Number of runs (default: 1, max: 20)
- `--no-judge` - Skip evaluation, return raw response

**Output:**
- Agent response with character embodiment
- Judge evaluation (unless `--no-judge`)
- Score out of 100 with dimension breakdown
- Results saved to `results/solo/` or `results/benchmarks/`

### `/benchmark-control` - Create Baseline

Create a control baseline for a scenario. Required before comparing personas.

```bash
/benchmark-control reviewer --scenario order-service
/benchmark-control dev --scenario tdd-shopping-cart --runs 10
```

**Arguments:**
- `agent` - Role to benchmark (sm, dev, reviewer, architect, tea)
- `--scenario <name>` - (Optional) Scenario name, or choose interactively
- `--runs N` - Number of runs (default: 10 for baselines)

**Output:**
- Baseline saved to `results/baselines/{scenario}/{role}/`
- Summary with mean, standard deviation, 95% CI

### `/benchmark` - Compare Against Baseline

Compare a persona's performance against the control baseline.

```bash
/benchmark discworld reviewer --scenario order-service
/benchmark the-expanse sm --scenario sprint-planning-conflict --runs 8
/benchmark shakespeare prospero --as dev --scenario django-10554
```

**Arguments:**
- `theme` - Persona theme (e.g., `discworld`, `the-expanse`)
- `agent` - Role to benchmark (or character name if using `--as`)
- `--as <role>` - (Optional) Cross-role testing: run any character as any role
- `--scenario <name>` - (Optional) Scenario name, or choose interactively
- `--runs N` - Number of runs (default: 4)

**Output:**
- Comparison against baseline with effect size
- Results saved to `results/benchmarks/{scenario}/{theme}-{role}/`

## Scenarios

Scenarios are standardized challenges located in `scenarios/`:

```
scenarios/
├── schema.yaml          # Scenario format specification
├── README.md            # Scenario authoring guide
├── architecture/        # Architect challenges
├── code-review/         # Reviewer challenges
├── dev/                 # Developer challenges
├── sm/                  # Scrum Master challenges
├── tea/                 # Test Engineer challenges
└── debug/               # Debugging challenges
```

### Scenario Format

Each scenario is a YAML file with:

```yaml
name: order-service
title: "E-commerce Order Service Review"
difficulty: medium
category: code-review

prompt: |
  Review the following order processing service...

code: |
  // Code to review (optional)
  function processOrder(order) { ... }

# Optional: Expected findings for checklist-based scoring
baseline_issues:
  critical:
    - id: SQL_INJECTION
      description: "Unsanitized user input in query"
  high:
    - id: MISSING_VALIDATION
      description: "No input validation on order amounts"
```

### Difficulty Calibration

| Difficulty | Expected Score Range | Description |
|------------|---------------------|-------------|
| easy | 85-100 | Most agents succeed |
| medium | 70-85 | Moderate challenge |
| hard | 55-70 | Significant challenge |
| extreme | <55 | Most agents struggle |

## Evaluation Rubrics

### Generic Rubric (25% each)

| Dimension | Criteria |
|-----------|----------|
| **Correctness** | Technical accuracy. Right issues? Valid solutions? |
| **Depth** | Thoroughness. Root causes? Implications? |
| **Quality** | Clarity and actionability. Organized? Useful? |
| **Persona** | Character embodiment. Consistent? Added value? |

### Checklist Rubric (for scenarios with baseline_issues)

| Component | Weight | Scoring |
|-----------|--------|---------|
| Detection | 50% | critical×15 + high×10 + medium×5 + low×2 |
| Quality | 25% | Explanations + actionable fixes |
| Persona | 25% | In-character + professional tone |

## Statistical Analysis

### Effect Size (Cohen's d)

Measures the magnitude of difference between persona and baseline:

| Cohen's d | Interpretation |
|-----------|----------------|
| < 0.2 | Negligible |
| 0.2 - 0.5 | Small |
| 0.5 - 0.8 | Medium |
| > 0.8 | Large |

### 95% Confidence Interval

If the confidence interval doesn't include 0, the difference is statistically significant (p < 0.05).

## Results Structure

```
results/
├── solo/                    # Single runs (not benchmarking)
│   └── {timestamp}-{theme}-{role}.json
├── baselines/               # Control baselines
│   └── {scenario}/
│       └── {role}/
│           ├── runs/
│           │   ├── run_1.json
│           │   └── judge_1.json
│           └── summary.yaml
├── benchmarks/              # Persona comparisons
│   └── {scenario}/
│       └── {theme}-{role}/
│           ├── runs/
│           │   ├── run_1.json
│           │   └── judge_1.json
│           └── summary.yaml
└── job-fair/                # Job fair results
    └── {theme}-{timestamp}/
        └── report.md
```

### Summary.yaml Format

```yaml
agent:
  theme: discworld
  role: reviewer
  spec: discworld:reviewer
  character: Lord Vetinari

scenario:
  name: order-service
  category: code-review
  difficulty: medium

statistics:
  n: 4
  mean: 85.50
  std_dev: 3.42
  min: 81
  max: 89
  scores: [81, 85, 87, 89]

baseline_comparison:
  control_mean: 78.30
  control_stddev: 4.21
  delta: +7.20
  cohens_d: 1.87

runs:
  - run_1.json
  - run_2.json
  - run_3.json
  - run_4.json
```

## OCEAN Correlation

Pennyfarthing tracks OCEAN (Big Five) personality profiles for all personas. The `benchmark-integration.ts` module correlates these with benchmark performance:

```typescript
import { calculateOceanCorrelation } from './scripts/benchmark-integration.js';

const correlation = calculateOceanCorrelation('order-service', 'reviewer');
// Returns which OCEAN dimensions correlate with better performance
```

### Interpreting Correlations

- **Positive correlation**: Higher trait scores → better performance
- **Negative correlation**: Lower trait scores → better performance
- **Effect size**: Magnitude of the correlation in points

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `BENCHMARK_PATH` | Override benchmark results location | `./results` |

## Example Workflow

```bash
# 1. Create baseline for reviewer role (run 10 times)
/benchmark-control reviewer --scenario order-service

# 2. Benchmark a persona against baseline
/benchmark discworld reviewer --scenario order-service --runs 4

# 3. Benchmark another persona
/benchmark the-expanse reviewer --scenario order-service --runs 4

# 4. Cross-role benchmark (character in different role)
/benchmark shakespeare prospero --as dev --scenario django-10554 --runs 4

# 5. View results
cat results/benchmarks/order-service/discworld-reviewer/summary.yaml
```

## Integrity Requirements

The benchmarking system enforces strict integrity:

1. **Proof-of-Work**: All runs include timestamps, token counts, and full responses
2. **Validation**: `/finalize-run` skill validates all data before saving
3. **No Fabrication**: Missing or invalid data is rejected, not estimated
4. **Tool Restriction**: `/solo` uses `--tools ""` to prevent multi-turn contamination

## Related Files

- `scenarios/schema.yaml` - Full scenario schema
- `scenarios/README.md` - Scenario authoring guide
- `commands/solo.md` - Solo command implementation
- `commands/benchmark.md` - Benchmark command implementation
- `skills/judge/SKILL.md` - Evaluation rubrics
- `skills/finalize-run/SKILL.md` - Result validation
- `src/benchmark-integration.ts` - OCEAN correlation module

---

## TRAIL-OCEAN Research

For hypothesis-driven research correlating OCEAN dimensions with error detection:

- [TRAIL-OCEAN Hypothesis Mapping](../../../pennyfarthing-dist/personas/TRAIL-OCEAN-MAPPING.md) - Complete hypothesis document

## Legacy Framework

Note: The legacy framework (using `just` commands) is documented in [docs/archive/benchmarks-legacy.md](../../../docs/archive/benchmarks-legacy.md). The current system uses `/solo`, `/benchmark-control`, and `/benchmark`.
