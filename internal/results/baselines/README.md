# Baselines

Control agent reference data for statistical comparison.

## What Belongs Here

**ONLY control theme runs.** The `control` theme is a minimal agent with no persona depth - just role instructions. This provides a scientific baseline to measure persona effectiveness.

## Structure

```
baselines/
└── {scenario}/
    └── {role}/                    # dev, reviewer, sm, architect, tea
        ├── runs/
        │   ├── run_1.json         # Raw agent response + tokens
        │   ├── judge_1.json       # Judge evaluation
        │   ├── run_2.json
        │   ├── judge_2.json
        │   └── ...
        └── summary.yaml           # Aggregated statistics
```

## Example

```
baselines/
├── race-condition-cache/
│   └── dev/
│       ├── runs/
│       │   ├── run_1.json
│       │   ├── judge_1.json
│       │   └── ... (10 runs recommended)
│       └── summary.yaml
└── order-service/
    └── reviewer/
        ├── runs/
        └── summary.yaml
```

## Creating Baselines

```bash
# Create a baseline with 10 runs (recommended for statistical reliability)
/benchmark-control dev --scenario race-condition-cache

# Or use the full command
/benchmark control dev --scenario race-condition-cache --runs 10
```

## Summary Format

```yaml
# Control:{role} Baseline for {scenario}
# Generated: {ISO8601 timestamp}

scenario: {scenario-name}
agent: control:{role}
sample_size: {n}

statistics:
  total:
    mean: 77.5
    std_dev: 2.3
    min: 74
    max: 82
  dimensions:
    correctness: { mean: 9.0, std_dev: 0.5 }
    depth: { mean: 8.0, std_dev: 0.3 }
    quality: { mean: 9.0, std_dev: 0.4 }
    persona: { mean: 5.0, std_dev: 0.0 }  # Always low for control

efficiency:
  avg_input_tokens: 2500
  avg_output_tokens: 700
  tokens_per_point: 8.91

runs:
  - run_1.json
  - run_2.json
  # ...
```

## Usage

Baselines are used by `/benchmark` to calculate:
- Mean difference (persona vs control)
- Cohen's d effect size
- Statistical significance (95% CI)

## Important

- Minimum 5 runs recommended, 10 preferred
- Do NOT put persona runs here - those go in `benchmarks/`
- Each scenario/role combination gets one baseline
