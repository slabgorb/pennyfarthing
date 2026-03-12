# Epic 45: Gold Standard References

## Overview

Gold Standard References adds human-graded calibration data to benchmark scenarios. When judges score agent responses, they currently have only the BARS rubric anchors to guide them — no concrete example of what a good response looks like for *this specific scenario*. Gold standards provide that anchor: 2-3 AI responses graded by a human, with the best stored as a calibration reference. This reduces inter-judge variance and central tendency bias.

**Priority:** P2
**Repo:** pennyfarthing
**Stories:** 4 (8 points)
**Jira:** MSSCI-16212

## Planning Documents

| Document | Relevant Sections |
|----------|-------------------|
| **Benchmark Scenario Baseline PRD** (`sprint/planning/benchmark-scenario-baseline-prd.md`) | FR4 (Gold Standard Process), Growth scope (human-grade gold standards for top 5 scenarios) |
| **ADR-0034** (`docs/adr/0034-benchmark-scenario-baseline-architecture.md`) | Scenario YAML Schema v2 (`gold_standard` field), Implementation Consistency Rule #6 (graded_by must be human), Component Structure (Gold Standard Store) |

## Background

### The Variance Problem

Multi-judge validation (Epic 44) established that running N=3-5 judges per agent response produces more reliable scores than a single judge. But inter-judge agreement (Krippendorff's Alpha) depends on judges interpreting the rubric consistently. BARS anchors (Epic 42) define what a "7-8" looks like in the abstract — "accurate with secondary concerns, specific implementation guidance" — but don't show what that looks like for a specific scenario about, say, database selection or GraphQL API review.

Gold standards bridge this gap. A human grades 2-3 AI responses to a scenario, assigns scores with brief rationale, and the best response becomes a calibration reference. Judges can compare against this reference to calibrate their scoring. The gold standard is not a "correct answer" — it's a calibration anchor.

### Prior Art

The pattern follows difficulty_profile (Epic 46) and red_herrings (Epic 43): add an optional structured field to scenario YAML, validate it when present, and populate it incrementally. Story 46-1 established the schema-first approach in the Python scenario validator.

### Human-in-the-Loop Constraint

ADR-0034 Rule #6: `gold_standard.graded_by` must be a human identifier. The validator rejects "ai", "auto", "claude", or "agent". This is an architectural guardrail — gold standards derive their value from human judgment. If an AI grades the calibration reference, the calibration is circular.

## Technical Architecture

### Gold Standard Schema (from ADR-0034)

```yaml
gold_standard:                    # nullable — populated by human grading only
  response_id: string | null      # identifier for the graded response
  graded_by: string | null        # human identifier (validator rejects AI identifiers)
  scores:                         # human-assigned scores per BARS dimension
    correctness: float | null
    depth: float | null
    quality: float | null
    persona: float | null
  rationale: string | null        # brief human rationale for scores
  response_summary: string | null # summary of the graded response (not full text)
```

### Key Files

| File | Role |
|------|------|
| `pennyfarthing-dist/src/pf/benchmark/scenario_validator.py` | Python validator — needs `validate_gold_standard()` |
| `pennyfarthing-dist/src/pf/tests/test_judge_anchors.py` | Existing judge anchor tests (pattern reference) |
| `pennyfarthing-dist/src/pf/tests/test_multi_judge.py` | Multi-judge tests (pattern reference) |
| `pennyfarthing-dist/src/pf/benchmark/multi_judge.py` | Multi-judge module — 45-2 will integrate gold standard here |
| `pennyfarthing-dist/skills/pf-judge/SKILL.md` | Judge skill — 45-2 will add gold standard calibration |
| `pennyfarthing-dist/workflows/scenario-builder/templates/scenario-code.template.yaml` | Code scenario template — needs `gold_standard` placeholder |
| `pennyfarthing-dist/workflows/scenario-builder/templates/scenario-open.template.yaml` | Open scenario template — needs `gold_standard` placeholder |

### Story Dependency Chain

```
45-1 (schema) → 45-2 (judge integration) → 45-3 (populate 5 scenarios) → 45-4 (variance comparison)
```

45-1 is purely schema/validation. 45-2 wires it into the judge. 45-3 requires human grading sessions. 45-4 is measurement — compare judge agreement with and without gold standards.

## Cross-Epic Dependencies

**Depends on:**
- Epic 42 (Anchored Rubric Criteria) — BARS dimensions and band definitions. **Done.**
- Epic 44 (Multi-Judge Validation) — Judge infrastructure that gold standards calibrate. **44-1/2/3 done, 44-4 remaining.**

**Depended on by:**
- Epic 44 story 44-4 (high-variance test) — benefits from gold standard calibration but doesn't strictly require it
- PRD Growth phase — "Human-grade gold standard responses for top 5 scenarios" requires 45-1 through 45-3
- Future persona effectiveness experiments — gold standards provide ground truth for measuring persona impact on score quality
