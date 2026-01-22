# Epic 7: Agent Performance Benchmarking Suite - Technical Context

## Epic Overview
- **Epic ID:** epic-7
- **Jira:** MSSCI-11494
- **Points:** 23 total (7 completed)
- **Priority:** P2 (Strategic)
- **Repos:** pennyfarthing

## Goal
Expand benchmarks/ with comprehensive performance testing. Measure token usage, latency, success rates, cost per agent. Generate performance regression reports.

## Stories in Epic

| Story | Title | Pts | Status | Priority |
|-------|-------|-----|--------|----------|
| 7-1 | Create benchmark runner framework | 3 | backlog | P1 |
| 7-2 | Expand Job-Fair with Role-Selective Execution | 5 | done | P1 |
| 7-4 | Aggregate Job-Fair Results into Benchmark Statistics | 3 | backlog | P2 |

## Existing Infrastructure

### Core Scripts

**1. `scripts/solo-runner.sh`** (345 lines)
- Foundation script for single agent execution
- Pipeline: agent → judge → JSON output
- Supports cross-role testing via `--as` flag
- Critical patterns:
  - Pipe syntax: `cat | claude -p --output-format json --tools ""`
  - File redirection for outputs (NOT `$()` capture)
  - Response validation: ≥100 chars before judging
  - Three-method score extraction fallback

**2. `scripts/job-fair-runner.sh`** (279 lines)
- Theme evaluation: all characters × all roles
- Creates test matrix with parallel execution
- Generates summary.yaml with rankings
- Dev role has dual sub-competency testing (codegen + debug)

### Commands

| Command | Purpose |
|---------|---------|
| `/solo` | Run single agent on scenario with judging |
| `/benchmark` | Compare persona vs control baseline (statistical) |
| `/benchmark-control` | Create control baseline (10 runs) |
| `/job-fair` | Full theme evaluation across all roles |

### Judge Skill

Unified 4-point rubric (25% each):
- **Correctness:** Technical accuracy
- **Depth:** Thoroughness, root causes
- **Quality:** Clarity, actionability
- **Persona:** Character embodiment

Formula: `weighted_total = sum(dimension_score × 2.5)` capped at 100

### Data Flow

```
Scenarios (YAML) → Solo Runner → Agent Response → Judge → Score JSON
                                                      ↓
                                              Finalize Run → Results
```

### Directory Structure

```
internal/results/
├── baselines/{scenario}/{role}/summary.yaml   # Control baselines (n≥10)
├── benchmarks/{scenario}/{theme}-{role}/      # Persona run results
scenarios/
├── {category}/                                # dev, architect, code-review, etc.
│   └── {scenario-name}.yaml                   # Challenge definition
```

## Critical Technical Requirements

### Shell Execution Rules (MUST FOLLOW)

1. **Use pipe syntax** for claude CLI:
   ```bash
   cat "$prompt_file" | claude -p --output-format json --tools ""
   ```
   NOT heredocs (fail in subagents)

2. **File redirection** for outputs:
   ```bash
   claude ... > "$output_file"
   ```
   NOT `$()` variable capture (causes zsh parse errors)

3. **Write tool** for prompts:
   ```bash
   # Use Write tool to create prompt file
   # NOT echo in Bash
   ```

4. **`--tools ""`** flag mandatory to prevent multi-turn tool usage

### Proof-of-Work Validation

Before any comparison, validate:
- Baseline proof fields exist
- Response text ≥200 chars
- Positive token counts
- Sample size ≥5 for baselines

### Statistical Measures

- **Cohen's d effect size:** `(contestant_mean - baseline_mean) / pooled_std_dev`
- **95% Confidence Interval** for difference
- **Significance:** p < 0.05 if CI excludes 0
- **Efficiency:** tokens per point

Effect size interpretation:
| Range | Label |
|-------|-------|
| < 0.2 | Negligible |
| 0.2-0.5 | Small |
| 0.5-0.8 | Medium |
| > 0.8 | Large |

## Key Learnings from Story 7-2

### Scenario Selection Analysis

Current job-fair has poor differentiation:
| Role | Current Scenario | Std Dev | Problem |
|------|------------------|---------|---------|
| dev | race-condition-cache | 0.63 | Essentially noise |
| reviewer | order-service | 1.45 | Low signal |
| tea | payment-processor-tests | 3.75 | Acceptable |
| sm | sprint-planning-conflict | 2.29 | Acceptable |

**Recommended optimal scenarios:**
| Role | Recommended | Std Dev | Improvement |
|------|-------------|---------|-------------|
| dev-codegen | tdd-shopping-cart | 7.30 | +1059% |
| dev-debug | astropy-12907 | 8.54 | Real OSS bug |
| reviewer | security-review | 9.44 | +551% |
| architect | legacy-modernization | 3.25 | +51% |

### Dev Sub-Competency Model

Dev is the ONLY role with dual-scenario testing:

```
┌─────────────────────────────────────────────────────────────┐
│ dev-codegen: Tests TDD discipline, minimal implementation   │
│   Scenario: tdd-shopping-cart (std=7.30)                    │
│   Baseline: mean=85.8, n=10                                 │
├─────────────────────────────────────────────────────────────┤
│ dev-debug: Tests crisis debugging, root cause analysis      │
│   Scenario: astropy-12907 (std=8.54)                        │
│   Baseline: mean=77.5, n=10                                 │
└─────────────────────────────────────────────────────────────┘
```

## Story 7-1 Specific Context

### Acceptance Criteria
1. Evaluate existing scripts against goals (document what exists vs needed)
2. `scripts/benchmark-runner.sh` functional
3. Loads `benchmarks/*.yaml` test cases
4. Execute benchmarks against agents
5. Outputs structured results

### What Already Exists vs What's Needed

| Feature | Exists | Location | Gap |
|---------|--------|----------|-----|
| Single agent execution | ✓ | solo-runner.sh | None |
| Multi-agent matrix | ✓ | job-fair-runner.sh | None |
| YAML scenario loading | ✓ | yq parsing | None |
| Judge evaluation | ✓ | Judge skill | None |
| Unified benchmark-runner.sh | ✗ | N/A | **NEEDED** |
| benchmarks/*.yaml test cases | ? | Check dir | May need creation |
| Structured JSON output | ✓ | Both runners | Format standardization |

### Potential Approach

The existing infrastructure is robust. Story 7-1 may be about:
1. **Documenting** what exists (AC1)
2. **Creating** a unified entry point (`benchmark-runner.sh`) that wraps solo/job-fair
3. **Standardizing** test case format in `benchmarks/*.yaml`
4. **Ensuring** consistent output structure

### Files to Review/Modify

| File | Action |
|------|--------|
| `scripts/solo-runner.sh` | Reference (working) |
| `scripts/job-fair-runner.sh` | Reference (working) |
| `scripts/benchmark-runner.sh` | **Create** (new unified entry) |
| `benchmarks/*.yaml` | **Create/standardize** test cases |
| `pennyfarthing-dist/commands/benchmark.md` | Reference |

## Testing Strategy

1. **Unit tests** for YAML loading (if creating new loader)
2. **Integration tests** running actual benchmarks (with --dry-run or mock)
3. **Validation tests** for output format correctness
4. **E2E test** running full benchmark suite

## Dependencies & Risks

- **Low risk:** Building on proven infrastructure
- **Dependency:** Requires `claude` CLI, `yq`, `jq` available
- **Risk:** Shell execution patterns must follow rules exactly

## Reference Files

- `scripts/solo-runner.sh` - Single run execution
- `scripts/job-fair-runner.sh` - Matrix execution
- `pennyfarthing-dist/commands/solo.md` - Command spec
- `pennyfarthing-dist/commands/benchmark.md` - Comparison spec
- `pennyfarthing-dist/commands/job-fair.md` - Theme evaluation spec
- `pennyfarthing-dist/skills/judge/SKILL.md` - Evaluation rubric
- `internal/results/baselines/tdd-shopping-cart/dev/summary.yaml` - Baseline format example
