---
name: peloton
description: |
  Automated team pipeline via tmux panes. Run a full TDD workflow (TEA → Dev → Reviewer)
  against a peloton scenario, aggregate results, and score against ground truth.
  Use when running benchmark pipeline replays or automated team assessments.
args: "start <scenario.yaml> [--theme NAME] [--model MODEL]"
---

# /peloton - Automated Team Pipeline

Run a full TDD agent pipeline in tmux panes with scoring against ground truth.

## Quick Reference

| Command | CLI | Purpose |
|---------|-----|---------|
| `/peloton start <file>` | `pf peloton start <scenario.yaml>` | Run full pipeline from scenario |
| `/peloton start <file> --theme dune` | `pf peloton start <file> --theme dune` | Override agent theme |
| `/peloton start <file> --model <m>` | `pf peloton start <file> --model <m>` | Override agent model |

## What It Does

1. **Loads scenario** — reads peloton scenario YAML (phases, ground truth, context)
2. **Spawns panes** — creates dedicated tmux panes for TEA, Dev, and Reviewer
3. **Drives workflow** — injects agent prompts, waits for completion, captures output
4. **Resolves gates** — validates phase transitions via BikeLane gate resolution
5. **Aggregates results** — collects findings into `pipeline.yaml`
6. **Scores** — compares against ground truth, produces `score.yaml` with precision/recall

## Scenario YAML Format

```yaml
id: scenario-name
title: Human-readable title
story_id: 148-8
jira: MSSCI-16421
repo_path: .
base_commit: abc123
branch: feat/test
phases:
  - tea
  - dev
  - reviewer
ground_truth:
  - id: F1
    title: Missing null check
    severity: medium
    weight: 2
    category: safety
    phase_ideal: reviewer
    description: No null check on user input
```

## Output Structure

```
internal/results/pipeline-replay/<scenario-id>/run-N/
├── pipeline.yaml    # Aggregated phase outputs
└── score.yaml       # Precision/recall metrics
```

## Prerequisites

- tmux server running on `pf` socket (`pf frame start`)
- Valid scenario YAML file

## Related

- `/tmux` — pane management
- `guides/peloton.md` — peloton benchmark methodology
- `pf benchmark replay` — existing benchmark CLI
