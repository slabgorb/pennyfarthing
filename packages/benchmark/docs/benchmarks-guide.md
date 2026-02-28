# Benchmarks Guide (JobFair)

<info>
Persona evaluation system. Measures whether themed characters outperform a no-persona control baseline on real engineering tasks. Produces statistically rigorous comparisons using Cohen's d effect sizes and precision/recall detection scoring.
</info>

**Codename:** JobFair
**Package:** `@pennyfarthing/benchmark`
**Commands:** `/benchmark`, `/benchmark-control`, `/solo`, `/job-fair`

---

## Overview

The benchmarking system answers one question: **does giving an AI agent a literary or fictional persona make it better at engineering tasks?**

Each evaluation runs an agent on a scenario (a realistic engineering challenge), scores the response with an LLM judge, and compares the result against a `control` baseline — an agent with no persona, just the raw role description. Statistical measures (Cohen's d, 95% CI) distinguish genuine improvement from noise.

**What can be measured:**
- Code review quality (detection rate of planted issues, false positive rate)
- Test writing effectiveness (edge case coverage)
- Scrum Master facilitation (behavior checklists)
- Bug investigation and debugging
- Architecture review

---

## Key Concepts

### OCEAN Personality Traits

Each character in a theme has five OCEAN scores (1–5):

| Dimension | Label | Example: High vs Low |
|-----------|-------|---------------------|
| **O** | Openness | Curious, creative vs conventional, practical |
| **C** | Conscientiousness | Thorough, organized vs flexible, spontaneous |
| **E** | Extraversion | Expressive, energetic vs reserved, contemplative |
| **A** | Agreeableness | Collaborative, warm vs direct, challenging |
| **N** | Neuroticism | Emotionally reactive vs stable, calm |

The `control` theme uses O=3 C=3 E=3 A=3 N=3 — a neutral baseline with no personality profile.

OCEAN scores enable correlation analysis: you can ask "do high-Conscientiousness characters produce better code reviews?" across all themes.

### Control Theme

The `control` theme is the experimental baseline. It has no character flavor, no catchphrases, no persona depth — just plain role descriptions. Every benchmark comparison measures performance relative to this baseline.

Running `/benchmark-control <role>` (or `/benchmark control <role>`) establishes the control mean and standard deviation for a scenario.

### Scenarios

Scenarios are YAML files defining a realistic engineering task. Each scenario has:
- A `prompt` given to the agent
- Optional `code` to review or debug
- `baseline_issues` or `baseline_criteria` used by the judge (never shown to the agent)
- A `category` (`code-review`, `dev`, `sm`, `tea`, `architecture`) and `difficulty` (`easy`, `medium`, `hard`, `extreme`)

Scenarios are stored at `scenarios/{category}/{name}.yaml` within the benchmark package.

### Judge

The judge is an LLM evaluating the agent's response using one of two rubrics:

**Generic Rubric** (no checklist provided):

| Dimension | Weight | What it measures |
|-----------|--------|-----------------|
| Correctness | 25% | Technical accuracy |
| Depth | 25% | Thoroughness, root causes |
| Quality | 25% | Clarity, actionability |
| Persona | 25% | Character embodiment |

**Checklist Rubric v2 — Precision/Recall** (for code review, dev, tea scenarios):

| Component | Max Points | Logic |
|-----------|-----------|-------|
| Recall | 30 | Weighted fraction of baseline issues found |
| Precision | 10 | Penalizes hallucinated false positives |
| Novel findings | 10 | Bonus for valid issues beyond the baseline |
| Quality | 25 | Clear explanations and actionable fixes |
| Persona | 25 | In-character delivery |

Recall is weighted 3x precision because missing a critical vulnerability is worse than a false positive. Issues carry severity weights: critical=15, high=10, medium=5, low=2.

**Behavior Checklist** (for SM scenarios):

Scores whether specific facilitation behaviors were demonstrated (5 pts each, capped at 40) plus bonus criteria (3 pts each, capped at 10).

All scores are out of 100.

### Proof-of-Work

Every run must include evidence of actual execution: `proof.agent_task_id`, `proof.agent_response_text` (>=200 chars), `proof.judge_task_id`, and non-zero token counts. The `/finalize-run` skill enforces this at save time. Fabricated runs are rejected.

---

## Commands

### `/solo` — Run a single agent on a scenario

The canonical agent execution path. Runs the agent, invokes the judge, and saves results.

```
/solo <theme:agent> --scenario <name>
/solo <theme:agent> --scenario <name> --runs 4
/solo <theme:agent> --as <role> --scenario <name>
```

**Arguments:**
- `theme:agent` — Theme and role (e.g., `discworld:reviewer`, `the-expanse:sm`)
- `--scenario` — Scenario name (required)
- `--as <role>` — Cross-role: use character's persona but give them a different role's task
- `--runs N` — Default 1, max 20
- `--no-judge` — Skip scoring, return raw response only

**Cross-role testing** with `--as` lets you ask "what happens when Granny Weatherwax (normally a reviewer) does developer work?":
```
/solo discworld:granny --as dev --scenario tdd-shopping-cart
```

Results save to `internal/results/benchmarks/{scenario}/{theme}-{role}/`.

### `/benchmark-control` — Establish a baseline

Creates the control baseline for a scenario. Shortcut for `/benchmark control <agent>`. Defaults to 10 runs for statistical reliability.

```
/benchmark-control sm
/benchmark-control reviewer --scenario order-service
/benchmark-control dev --scenario tdd-shopping-cart --runs 15
```

Baselines save to `internal/results/baselines/{scenario}/{role}/`.

### `/benchmark` — Compare a persona against baseline

Runs an agent on a scenario and compares against the established control baseline. Defaults to 4 parallel runs.

```
/benchmark <theme> <agent> [--scenario <name>] [--runs N]
```

**Simple usage (interactive scenario selection):**
```
/benchmark discworld reviewer
/benchmark the-expanse sm
```

**Direct usage:**
```
/benchmark discworld reviewer --scenario order-service
/benchmark ted-lasso dev --scenario tdd-shopping-cart --runs 8
```

**Cross-role:**
```
/benchmark shakespeare prospero --as dev --scenario django-10554
```

If `--scenario` is omitted, the command presents matching scenarios sorted by difficulty and prompts for selection.

If the baseline does not exist for the requested scenario, the command stops and tells you to run `/benchmark-control` first.

### `/job-fair` — Run all characters in a theme

Discovers how every character in a theme performs across all available roles. Useful for finding "hidden talents" (e.g., which character is best at code review, regardless of their native role).

```
/job-fair <theme>
/job-fair <theme> --runs 2
/job-fair <theme> --roles dev,reviewer
```

Shows a champion-per-role summary and a full character × role matrix. Results save to `internal/results/job-fair/{theme}-{timestamp}/summary.yaml`.

---

## Workflow: End-to-End Benchmark Run

### Step 1: Create a baseline

Before comparing, establish what "no persona" looks like on the scenario:

```
/benchmark-control reviewer --scenario order-service
```

This runs 10 parallel executions of `control:reviewer`, judges each, and saves mean and standard deviation to `internal/results/baselines/order-service/reviewer/summary.yaml`.

### Step 2: Run the contestant

```
/benchmark discworld reviewer --scenario order-service --runs 4
```

Internally this calls `/solo discworld:reviewer --scenario order-service` four times in parallel.

### Step 3: Statistical comparison

After all runs complete, the command calculates:

**Cohen's d effect size:**
```
pooled_std = sqrt((contestant_std^2 + baseline_std^2) / 2)
cohens_d = (contestant_mean - baseline_mean) / pooled_std
```

**95% Confidence Interval:**
```
se_diff = sqrt(contestant_std^2/n1 + baseline_std^2/n2)
ci = [difference - 1.96 * se_diff, difference + 1.96 * se_diff]
```

If the CI does not include 0, the difference is statistically significant at p < 0.05.

### Step 4: Interpret results

| Cohen's d | Interpretation |
|-----------|----------------|
| < 0.2 | Negligible |
| 0.2–0.5 | Small |
| 0.5–0.8 | Medium |
| > 0.8 | Large |
| > 1.2 | Very Large |

A positive d means the persona outperforms control. Negative means it underperforms.

---

## Statistical Methods

### Why Cohen's d?

Raw score differences are hard to interpret without knowing variance. Cohen's d normalizes by pooled standard deviation, making results comparable across scenarios with different difficulty levels.

### Scoring v2 (Precision/Recall)

For checklist scenarios, the judge computes precision and recall rather than a single detection score. This separates two failure modes:

- **Low recall**: Missing real issues (weighted by severity)
- **Low precision**: Hallucinating problems that don't exist

The F2 score is also computed (weights recall 2x precision) but the primary scoring formula is:
```
detection.subtotal = (recall * 30) + (precision * 10) + min(novel_valid * 3, 10)
```

### Baseline sample size

A baseline with fewer than 5 runs produces unreliable estimates. The system warns you. Use `--runs 10` or more for production baselines.

### OCEAN Correlation Analysis

The `calculateOceanCorrelation` function in `@pennyfarthing/benchmark` groups results by low (1–2) and high (4–5) values for each OCEAN dimension and measures the mean score difference. This identifies which personality traits correlate with better performance on a given role/scenario combination.

The `aggregateByDimension` function extends this to theme-level dimensions (e.g., comparing "comedy" vs "drama" themes) with pairwise significance testing.

For deeper methodology, see `pennyfarthing-dist/guides/measurement-framework.md`, which grounds Pennyfarthing's evaluation approach in Wallach et al. (2025) social science measurement theory.

---

## Output and Results

### Directory structure

```
internal/results/
├── baselines/
│   └── {scenario}/
│       └── {role}/
│           ├── runs/
│           │   ├── run_1.json
│           │   └── judge_1.json
│           └── summary.yaml
├── benchmarks/
│   └── {scenario}/
│       └── {theme}-{role}/
│           ├── runs/
│           │   ├── run_1.json
│           │   └── judge_1.json
│           └── summary.yaml
└── job-fair/
    └── {theme}-{timestamp}/
        └── summary.yaml
```

Cross-role results use `{theme}-{character}-as-{role}` as the directory name.

### summary.yaml format

```yaml
agent:
  theme: discworld
  character: Granny Weatherwax
  effective_role: reviewer
  source_role: reviewer
  spec: discworld:reviewer

scenario:
  name: order-service
  category: code-review
  difficulty: medium

statistics:
  n: 4
  mean: 84.25
  std_dev: 3.12
  min: 80.5
  max: 87.0
  scores: [82.5, 84.0, 87.0, 83.5]

efficiency:
  avg_input_tokens: 4821
  avg_output_tokens: 612
  tokens_per_point: 64.8

metadata:
  created_at: 2026-02-28T14:00:00Z
  pennyfarthing_version: 12.1.0
  model: sonnet

baseline_comparison:
  control_mean: 78.3
  control_stddev: 4.1
  delta: +5.95
```

### Leaderboard

A leaderboard template (`pennyfarthing-dist/templates/LEADERBOARD.template.md`) generates ranked tables from benchmark results. Columns include theme, character, mean score, standard deviation, sample size, delta from baseline, and Cohen's d.

The leaderboard links to an `OCEAN-ANALYSIS.md` companion file showing which personality dimensions correlate with performance on that scenario.

---

## Running Your First Benchmark

**1. Establish a baseline for the scenario you want to test:**
```
/benchmark-control reviewer --scenario order-service
```
Wait for 10 runs to complete (~2 minutes for a medium-difficulty scenario).

**2. Run a contestant persona:**
```
/benchmark discworld reviewer --scenario order-service
```
Runs 4 parallel evaluations and shows the comparison table.

**3. Read the verdict.** A Cohen's d > 0.8 with a CI that excludes 0 is a large, statistically significant result. Anything below 0.2 is noise.

**4. To explore which character in a theme is best at a role:**
```
/job-fair discworld --roles reviewer
```

---

## Tips

- **Always validate baselines**: Before comparing, spot-check that baseline run files have `proof.*` fields with real content. The `/benchmark` command does this automatically but warns you if it finds fabricated data.
- **Parallel runs**: Up to 4 runs execute in parallel. Batches of 4 are used for larger run counts.
- **Token efficiency**: The `tokens_per_point` metric in summary.yaml tracks whether a higher-scoring persona is also more token-efficient.
- **Cross-role research**: Use `--as` when you want to test whether a character's personality traits help or hurt on unfamiliar tasks, independent of their training for that role.
- **SWE-bench scenarios**: Scenarios categorized as `swe-bench` use a deterministic Python judge instead of LLM-as-judge, comparing against ground-truth patches for objective scoring.

---

## Package API

The `@pennyfarthing/benchmark` TypeScript package exports aggregation and correlation functions for use in Cyclist panels and the WheelHub API:

```typescript
import {
  aggregateJobFairResults,   // Aggregate all job-fair runs across themes
  getTopPerformers,          // Top N performers for a role
  calculateOceanCorrelation, // OCEAN dimension effects on a scenario/role
  generateCorrelationReport, // Markdown report of OCEAN correlations
  getOptimalProfile,         // Optimal OCEAN profile for a role
  getRoleRecommendations,    // Top/bottom themes for a role
  queryBenchmarks,           // Filtered query with OCEAN constraints
  generateBenchmarkReport,   // Full markdown report with faces and correlations
} from '@pennyfarthing/benchmark';
```

OCEAN filter syntax: `O>=4`, `C<=2`, `N=1` (dimension, operator, value 1–5).

Results are read from `packages/benchmark/results/benchmarks/` by default, or from the path set in the `BENCHMARK_PATH` environment variable.
