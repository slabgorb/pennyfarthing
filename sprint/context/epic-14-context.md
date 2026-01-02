# Epic 14: TRAIL-Inspired OCEAN Correlation Research

## Overview

Leverage TRAIL benchmark's agentic error taxonomy to deepen OCEAN personality → problem space correlation research. Build on existing infrastructure (630 OCEAN profiles, /judge, benchmark-integration.ts) to answer: **which OCEAN dimensions predict which error-detection capabilities?**

## Background

- **TRAIL Benchmark**: Patronus AI's evaluation of agent debugging (148 traces, 841 errors, 20+ error types)
- **TRAIL Taxonomy**: Three error categories:
  - **Reasoning**: Logic/decision-making failures (incorrect inferences, contradictions)
  - **Planning**: Task orchestration failures (sequencing, coordination, dependencies)
  - **Execution**: System/tool failures (timeouts, context overflow, tool misuse)
- **Our Goal**: Map TRAIL error categories to OCEAN dimensions, test hypotheses empirically

## Key Files

| File | Purpose |
|------|---------|
| `scenarios/schema.yaml` | Scenario validation schema - add error_type field |
| `.claude/project/skills/judge/SKILL.md` | Judge scoring - add error-detection mode |
| `src/scripts/benchmark-integration.ts` | Correlation analysis - add error type slicing |
| `pennyfarthing-dist/personas/TRAIL-OCEAN-MAPPING.md` | Hypothesis document (to create) |
| `scenarios/debugging/` | New debugging scenarios (to create) |

## Story 14-1: Schema Extension

### Current baseline_issues structure (schema.yaml lines 117-144):

```yaml
baseline_issues:
  type: object
  schema:
    critical:
      type: array
      items:
        id: string
        location: string
        description: string
    # Same for high, medium, low
```

### Required change:

Add `error_type` field to each issue item:

```yaml
items:
  id: string
  location: string
  description: string
  error_type:               # NEW
    type: string
    enum: [reasoning, planning, execution]
    required: false         # Optional for backward compatibility
    description: "TRAIL error category for correlation analysis"
```

### Validation requirements:
- Field is optional (existing scenarios must pass)
- Enum restricts to exactly three values
- Apply to all severity levels (critical, high, medium, low)

## OCEAN Hypothesis Preview (Story 14-2)

| TRAIL Category | Primary OCEAN | Secondary | Hypothesis |
|----------------|---------------|-----------|------------|
| Reasoning | **O** (Openness) | C | High-O = creative pattern recognition |
| Planning | **C** (Conscientiousness) | E | High-C = structured approach |
| Execution | **N** (Neuroticism, inverse) | C | Low-N = stable under pressure |

## Implementation Order

```
14-1 → 14-4 → 14-2 → 14-3 → 14-5
schema  scenarios  hypothesis  judge  heatmap
(1pt)   (5pts)     (2pts)      (3pts) (3pts)
```

## Success Metrics

1. At least 2 of 6 predictions show statistically significant correlation (p < 0.05)
2. Actionable recommendations: "For planning-heavy tasks, prefer High-C personas"
3. Publishable methodology in TRAIL-OCEAN-MAPPING.md
