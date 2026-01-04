# Benchmarks

Persona agent performance data for comparison against control baselines.

## What Belongs Here

**All non-control theme runs.** These are agents with full persona depth (character, style, catchphrases) being evaluated against scenarios.

## Structure

```
benchmarks/
└── {scenario}/
    └── {theme}-{role}/            # discworld-dev, jane-austen-reviewer
        ├── runs/
        │   ├── run_1.json         # Raw agent response + tokens
        │   ├── judge_1.json       # Judge evaluation
        │   ├── run_2.json
        │   ├── judge_2.json
        │   └── ...
        └── summary.yaml           # Aggregated statistics + baseline comparison
```

## Example

```
benchmarks/
├── race-condition-cache/
│   ├── discworld-dev/
│   │   ├── runs/
│   │   │   ├── run_1.json
│   │   │   ├── judge_1.json
│   │   │   └── ... (4 runs typical)
│   │   └── summary.yaml
│   ├── jane-austen-dev/
│   │   ├── runs/
│   │   └── summary.yaml
│   └── shakespeare-dev/
│       ├── runs/
│       └── summary.yaml
└── order-service/
    ├── discworld-reviewer/
    └── star-trek-tng-reviewer/
```

## Running Benchmarks

```bash
# Run 4 evaluations (default) and compare to baseline
/benchmark discworld dev --scenario race-condition-cache

# Run more for tighter statistics
/benchmark jane-austen reviewer --scenario order-service --runs 8
```

## Summary Format

```yaml
# Benchmark Summary: {theme}:{role} on {scenario}
# Generated: {ISO8601 timestamp}

agent:
  theme: discworld
  role: dev
  spec: discworld:dev
  character: Ponder Stibbons

scenario:
  name: race-condition-cache
  category: dev
  difficulty: extreme

statistics:
  n: 4
  mean: 88.50
  std_dev: 1.73
  min: 86
  max: 91
  scores: [86, 88, 89, 91]

dimensions:
  detection: { mean: 9.2, std_dev: 0.5 }
  depth: { mean: 8.8, std_dev: 0.3 }
  quality: { mean: 8.5, std_dev: 0.4 }
  persona: { mean: 8.0, std_dev: 0.6 }

efficiency:
  avg_input_tokens: 2800
  avg_output_tokens: 850
  tokens_per_point: 9.60

baseline_comparison:
  control_mean: 76.80
  control_stddev: 0.63
  delta: +11.70
  cohens_d: 8.99
  significant: true

runs:
  - run_1.json
  - run_2.json
  - run_3.json
  - run_4.json
```

## Interpretation

| Cohen's d | Effect Size | Meaning |
|-----------|-------------|---------|
| < 0.2 | Negligible | No practical difference from control |
| 0.2 - 0.5 | Small | Minor improvement |
| 0.5 - 0.8 | Medium | Meaningful improvement |
| > 0.8 | Large | Substantial improvement |

## Important

- Always create baseline first: `/benchmark-control {role} --scenario {name}`
- Benchmark runs are compared against the matching baseline
- Summary includes baseline comparison stats when baseline exists
- Even single runs (n=1) get a summary.yaml for consistency
