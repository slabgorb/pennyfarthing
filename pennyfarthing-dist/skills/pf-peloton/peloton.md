---
name: peloton
description: |
  Concurrent agent team pipeline via tmux panes. Agents (TEA, Dev, Reviewer) run
  simultaneously in separate tmux panes, with work passing between them in real time.
  Peloton replay simulates this flow against a known scenario for benchmarking and scoring.
args: "start <scenario.yaml> [--theme NAME] [--model MODEL]"
---

# /peloton - Concurrent Agent Pipeline

Run a full agent team in parallel tmux panes with automated work handoff.

## Concept

**Peloton** = the cycling term for the main group riding together. In Pennyfarthing,
it means agents running concurrently in separate tmux panes:

- **TEA** pane — writes failing tests (RED phase)
- **Dev** pane — implements to make tests pass (GREEN phase)
- **Reviewer** pane — evaluates code quality and spec compliance

All panes exist simultaneously. When one agent completes its phase, its output
is captured and injected into the next agent's pane as context. The pipeline
flows through the panes like riders in a peloton drafting off each other.

## Two Modes

### Live Mode
Spawn real agents against real work. Agents run the full TDD workflow with
gate resolution and phase markers, producing real commits and assessments.

### Replay Mode
Simulate the pipeline against a benchmark scenario with known ground truth.
Score the pipeline's ability to catch findings. Used for measuring agent
effectiveness across themes, models, and prompt configurations.

## Quick Reference

| Command | Purpose |
|---------|---------|
| `pf peloton start <scenario.yaml>` | Run pipeline from scenario |
| `pf peloton start <file> --theme dune` | Override agent theme |
| `pf peloton start <file> --model <m>` | Override agent model |

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
ground_truth:        # For replay scoring
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
└── score.yaml       # Precision/recall metrics (replay mode)
```

## Prerequisites

- tmux server running on `pf` socket (`pf frame start`)
- Scenario YAML file

## Related

- `/tmux` — pane management
- `guides/peloton.md` — peloton benchmark methodology
- `pf benchmark replay` — lower-level benchmark harness
