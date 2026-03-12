---
parent: context-epic-45.md
workflow: tdd
---

# Story 45-1: Add gold_standard schema to scenarios

## Business Context

This is the foundation story for the Gold Standard References epic. Without a schema for gold standards, there's no structured place to store human-graded calibration data. Judges score agent responses using BARS rubric anchors, but those anchors are abstract — they describe what a "7-8" looks like in general, not for a specific scenario. Gold standards provide scenario-specific calibration anchors.

Story 45-1 adds the data structure only. It does not wire gold standards into the judge (45-2), populate them (45-3), or measure their impact (45-4). Those all depend on this schema existing first.

## Technical Guardrails

### Pattern to Follow
Follow the exact pattern established by multi_judge.py (story 44-1):
- **Dataclasses** for schema types (`GoldStandard`, `GoldStandardScores`)
- **Validation function** (`validate_gold_standard()`) returning `{success, errors[], warnings[]}`
- **Module** in `pennyfarthing-dist/src/pf/benchmark/gold_standard.py`
- **Tests** in `pennyfarthing-dist/src/pf/tests/test_gold_standard.py`
- **pytest** with class-per-AC structure and descriptive test names

### Key Files
| File | Action |
|------|--------|
| `pennyfarthing-dist/src/pf/benchmark/gold_standard.py` | **Create** — dataclasses + validation |
| `pennyfarthing-dist/src/pf/tests/test_gold_standard.py` | **Create** — failing tests (RED) |
| `pennyfarthing-dist/src/pf/benchmark/__init__.py` | **Extend** — export new module |
| `pennyfarthing-dist/workflows/scenario-builder/templates/scenario-code.template.yaml` | **Extend** — add gold_standard placeholder |
| `pennyfarthing-dist/workflows/scenario-builder/templates/scenario-open.template.yaml` | **Extend** — add gold_standard placeholder |

### ADR-0034 Constraints (Implementation Consistency Rules)
- `gold_standard.graded_by` must be a human identifier — validator MUST reject "ai", "auto", "claude", "agent"
- `gold_standard` is nullable (optional) — when present, validate structure; when absent, no error
- Null semantics: individual fields within gold_standard can be null (means "not yet populated"), but if gold_standard block exists, `graded_by` is required
- Return result objects `{success, data?, error?}` — don't throw

### Conventions
- snake_case for all fields and Python identifiers
- Scores are floats in range 1-10 (matching BARS band scale)
- BARS dimensions: correctness, depth, quality, persona (always these four, always 25% weight each)

## Scope Boundaries

**In scope:**
- `GoldStandard` dataclass with fields: response_id, graded_by, scores, rationale, response_summary
- `GoldStandardScores` dataclass with fields: correctness, depth, quality, persona (all Optional[float])
- `validate_gold_standard(data: dict) -> dict` function
- Validation rules: graded_by required when block present, scores in 1-10 range, reject AI identifiers
- Tests covering all ACs
- Template placeholders in both scenario builder templates

**Out of scope:**
- Wiring gold standards into the judge prompt (story 45-2)
- Populating gold standards for real scenarios (story 45-3)
- Measuring variance impact (story 45-4)
- Modifying existing scenarios to add gold_standard fields
- Any changes to schema.yaml (that's a separate concern)

## AC Context

### AC1: gold_standard is an optional field on scenario YAML
- When a scenario YAML has no `gold_standard` key, validation passes (no error, no warning)
- When present, the gold_standard block is validated for structure
- Test: validate a scenario dict with no gold_standard key → success

### AC2: Schema defines the structure for gold standard reference data
- `GoldStandard` dataclass with: response_id (str|None), graded_by (str|None), scores (GoldStandardScores|None), rationale (str|None), response_summary (str|None)
- `GoldStandardScores` dataclass with: correctness (float|None), depth (float|None), quality (float|None), persona (float|None)
- Test: construct valid GoldStandard, verify all fields accessible

### AC3: Validation function follows multi_judge pattern
- `validate_gold_standard(data: dict) -> dict` returns `{"valid": True}` or `{"valid": False, "errors": [...]}`
- Validates: graded_by present when block exists, scores in 1-10 range, graded_by not an AI identifier
- Test: valid data → valid:True; missing graded_by → valid:False with error

### AC4: graded_by rejects AI identifiers (ADR-0034 Rule #6)
- Reject: "ai", "auto", "claude", "agent" (case-insensitive)
- Accept: "keith.avery", "human-reviewer-1", any other string
- Test: each rejected identifier → valid:False with specific error message

### AC5: Score values validated in BARS range
- Each score dimension (correctness, depth, quality, persona) must be 1-10 when present
- null/None is acceptable (means "not yet scored")
- Values outside 1-10 → validation error
- Test: score of 0 → error; score of 11 → error; score of 7.5 → valid; null → valid

### AC6: Scenario templates updated with gold_standard placeholder
- Both `scenario-code.template.yaml` and `scenario-open.template.yaml` include a commented `gold_standard` section
- Placeholder shows the expected structure but with null values
- Test: read each template file, verify gold_standard section exists
