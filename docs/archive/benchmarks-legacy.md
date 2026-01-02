# Persona Benchmark Framework

Measures how different agent personas perform on identical tasks.

## Hypothesis

Persona traits affect actual behavior, not just communication style:
- "Uncompromising" reviewers may find more bugs
- "Methodical" testers may achieve better coverage
- "Patient" architects may explore more options

## Test Categories

### 1. Code Review (`test-cases/code-review/`)
Files with **known bugs** seeded at specific locations.
- Measure: Detection rate, false positives, severity accuracy

### 2. Test Writing (`test-cases/test-writing/`)
Code modules requiring tests.
- Measure: Edge cases identified, coverage patterns, test quality

### 3. Architecture (`test-cases/architecture/`)
Design problems with multiple valid approaches.
- Measure: Options considered, trade-offs identified, completeness

## Metrics

### Quantitative
| Metric | Description | Collection |
|--------|-------------|------------|
| `issues_found` | Bugs correctly identified | Count against known list |
| `false_positives` | Non-issues flagged | Count |
| `edge_cases` | Boundary conditions identified | Count against known list |
| `options_considered` | Alternatives explored | Count |
| `completeness` | Coverage of known concerns | Percentage |

### Qualitative (1-5 scale)
| Metric | Description |
|--------|-------------|
| `persona_consistency` | Stayed in character throughout |
| `explanation_quality` | Clarity of reasoning |
| `actionability` | How usable is the output |
| `engagement` | Would you enjoy working with this persona |

## Running Benchmarks

```bash
# Run single benchmark
just persona-benchmark code-review-1 discworld

# Run full suite across all personas
just persona-benchmark-suite

# Compare results
just persona-benchmark-compare
```

## Results Format

Results are stored in `results/{timestamp}-{persona}-{test-case}.yaml`:

```yaml
benchmark:
  test_case: code-review-1
  persona: discworld
  agent: reviewer
  timestamp: 2024-01-15T10:30:00Z

quantitative:
  issues_found: 7
  issues_expected: 10
  false_positives: 1
  detection_rate: 0.70

qualitative:
  persona_consistency: 5
  explanation_quality: 4
  actionability: 4
  engagement: 5

notes: |
  Found the SQL injection but missed the race condition.
  Stayed in Granny Weatherwax character throughout.
```

## Analysis

After running benchmarks, analyze with:

```bash
just persona-benchmark-analyze
```

Produces:
- Detection rates by persona
- False positive rates by persona
- Qualitative score averages
- Statistical significance tests
- Recommendations
