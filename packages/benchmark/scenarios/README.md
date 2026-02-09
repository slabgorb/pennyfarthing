# Thunderdome Scenarios

Battle scenarios for benchmarking AI agent personas. Each scenario defines a challenge that agents respond to, with scoring criteria for evaluation.

## Directory Structure

| Directory | Agent Role | Input | Output |
|-----------|------------|-------|--------|
| `dev/` | Developer | Tests, requirements, bugs | Code implementation |
| `tea/` | Test Engineer/Architect | Code, requirements | Test cases |
| `code-review/` | Reviewer | Code to review | Issues, suggestions |
| `sm/` | Scrum Master | Project context, constraints | Plans, decisions |
| `architecture/` | Architect | Requirements, constraints | Design decisions |
| `relay/` | Multiple (team flow) | Varies by phase | Varies by phase |
| `test/` | N/A | Test fixtures | N/A (not for agents) |

## Role Clarifications

### Dev vs TEA: The TDD Distinction

A common point of confusion: scenarios in `dev/` often have "TDD" in their names (e.g., `tdd-shopping-cart.yaml`, `event-processor-tdd.yaml`). This does NOT mean they are for the TEA agent.

**The key distinction:**

| Role | Receives | Produces | "TDD" Meaning |
|------|----------|----------|---------------|
| **Dev** | Failing tests (RED) | Code to pass tests (GREEN) | "Implement to pass given tests" |
| **TEA** | Code/requirements | New test cases | "Design tests for given code" |

**Dev scenarios (`dev/`):**
- Tests are GIVEN as input
- Agent writes CODE to make tests pass
- This is the "GREEN" phase of TDD
- Example: `tdd-shopping-cart.yaml` gives 26 Go tests; agent implements `Cart` struct

**TEA scenarios (`tea/`):**
- Code or requirements are GIVEN as input
- Agent writes TESTS to verify behavior
- This is test DESIGN, not implementation
- Example: `payment-processor-tests.yaml` gives code; agent writes test cases

### Quick Reference

```
"I have tests, I need code"     → Dev scenario (dev/)
"I have code, I need tests"     → TEA scenario (tea/)
"I have code, find problems"    → Reviewer scenario (code-review/)
"I have a project, plan it"     → SM scenario (sm/)
"I have requirements, design"   → Architect scenario (architecture/)
```

## Scenario Schema

All scenarios follow the schema defined in `schema.yaml`. Required fields:

```yaml
name: kebab-case-identifier
title: "Human Readable Title"
category: dev | tea | code-review | sm | architecture | relay
difficulty: easy | medium | hard | extreme
prompt: |
  The challenge text...
```

### Difficulty Calibration

Difficulty labels are calibrated based on 10-run control baselines:

| Difficulty | Score Range | Interpretation |
|------------|-------------|----------------|
| easy | 85-100 | Most agents succeed |
| medium | 70-85 | Moderate challenge |
| hard | 55-70 | Significant challenge |
| extreme | <55 | Most agents struggle |

**Empirical Reference Data (Epic 7):**

| Scenario | Category | Mean ± Std | Difficulty |
|----------|----------|------------|------------|
| sprint-planning-conflict | sm | 90.50 ± 2.29 | easy |
| tdd-shopping-cart | dev | 85.80 ± 3.12 | easy |
| security-review | code-review | 86.42 ± 9.44 | easy |
| dependency-deadlock | sm | 87.20 ± 2.36 | medium |
| migration-disaster | dev | 76.50 ± 4.21 | medium |
| race-condition-cache | dev | 76.80 ± 5.63 | medium |
| event-processor-tdd | dev | 65.25 ± 13.81 | hard |

## Creating New Scenarios

1. Choose the appropriate directory based on agent role
2. Follow the schema in `schema.yaml`
3. Run validation: `./project-scripts/validate-scenario.sh scenarios/<dir>/<name>.yaml`
4. Run 10-run baseline with `control:<role>` to calibrate difficulty
5. Set difficulty label based on mean score

## Calibration Guide for Scenario Authors

### Step 1: Draft Your Scenario

Start with your best estimate of difficulty. Most new scenarios land in the medium-hard range initially.

### Step 2: Run Control Baseline

```bash
# Run 10 times with control agent (no persona flair)
/solo control:<category> scenarios/<dir>/<name>.yaml --runs 10
```

### Step 3: Analyze Results

Check the baseline statistics:
- **Mean score**: Determines difficulty band
- **Standard deviation**: Indicates consistency
- **Range (min-max)**: Reveals edge cases

### Step 4: Validate & Adjust

| Observation | Problem | Action |
|-------------|---------|--------|
| Mean > 95 | Ceiling effect | Add complexity, harder edge cases |
| Mean matches expected band | Correct | Keep as-is |
| Mean lower than expected | Harder than intended | Simplify or adjust expectations |
| Std > 30 | Bimodal/inconsistent | Clarify prompt, reduce ambiguity |
| Std < 5 | Too deterministic | Add open-ended elements |
| Std = 0 | Data issue | Re-run, check judge evaluation |

### Step 5: Document Baseline

Save results to `internal/results/baselines/<scenario-name>/`:
- `baseline.json` - Run statistics
- `runs/` - Individual response files

### Common Pitfalls

**Ceiling Effects**: If control scores 95+, personas have no room to differentiate. The `security-review` scenario originally scored 99.4 and was reworked with a checklist rubric to achieve 86.42.

**Bimodal Distributions**: High variance (σ > 30) usually indicates prompt ambiguity. The `tdd-shopping-cart` scenario showed scores of 10-100 due to tool access contamination; fixing the command flags resolved it.

**Zero Variance**: All identical scores suggests judge evaluation issues, not perfect consistency. The `event-processor-tdd` scenario had σ=0 because all judge files were identical templates.

## See Also

- `schema.yaml` - Full scenario schema definition (includes `difficulty_calibration` section)
- `bracket-config.yaml` - Tournament bracket configuration
- `../internal/results/baselines/` - Control baseline data for calibration
