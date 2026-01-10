# Story 7-1: Create Benchmark Runner Framework - Technical Context

## Story Overview
- **Epic:** 7 (Agent Performance Benchmarking Suite)
- **Points:** 3 (standard - TEA flow)
- **Priority:** P1
- **Repos:** pennyfarthing
- **Jira:** MSSCI-11390

## Description
Build reusable framework for running benchmarks:
- Load test cases from YAML
- Execute against agents
- Collect metrics

First: Evaluate existing infrastructure (job-fair-runner.sh, solo-runner.sh) against these goals. Plan and implement improvements.

## Acceptance Criteria
- [ ] AC1: Evaluate existing scripts against goals (document what exists vs needed)
- [ ] AC2: `scripts/benchmark-runner.sh` functional
- [ ] AC3: Loads `benchmarks/*.yaml` test cases
- [ ] AC4: Execute benchmarks against agents
- [ ] AC5: Outputs structured results

## Current State Analysis

### What Already Exists

| Component | Location | Status |
|-----------|----------|--------|
| Single run execution | `scripts/solo-runner.sh` (345 lines) | Working |
| Matrix execution | `scripts/job-fair-runner.sh` (279 lines) | Working |
| Test case YAML files | `benchmarks/test-cases/` | 10 files exist |
| Judge evaluation | `pennyfarthing-dist/skills/judge/SKILL.md` | Working |
| Commands | `/solo`, `/benchmark`, `/job-fair` | Documented |
| Results storage | `internal/results/`, `benchmarks/results/` | Established |

### Test Cases Available

```
benchmarks/test-cases/
├── architecture/
│   ├── arch-001-notification-system.yaml
│   └── arch-002-migration-dilemma.yaml
├── code-review/
│   ├── cr-001-user-service.yaml
│   └── cr-002-order-service.yaml
├── dev/
│   ├── dev-001-buggy-service.yaml
│   └── dev-002-tdd-shopping-cart.yaml
├── pm/
│   └── pm-002-prioritization-crisis.yaml
├── sm/
│   └── sm-001-feature-breakdown.yaml
├── tea/
│   └── tea-001-payment-processor.yaml
└── test-writing/
    └── tw-001-calculator.yaml
```

### Test Case Format (from dev-001-buggy-service.yaml)

```yaml
id: dev-001
name: Buggy User Service Fix
category: dev
difficulty: hard
agent: dev
version: 1.0

description: |
  A user service with multiple bugs...

instructions: |
  Review and fix this user service...

code:
  language: go
  filename: user_service.go
  content: |
    # Full code here

baseline_issues:
  critical:
    - id: SQL_INJECTION_REGISTER
      location: "lines 42-44"
      description: "SQL injection via string formatting"
  high:
    - id: INSECURE_SESSION_TOKEN
      ...
  medium:
    - ...
  low:
    - ...

bonus_issues:
  security:
    - ...
  reliability:
    - ...

scoring:
  baseline_issues: 22
  bonus_issues: 11
```

## Gap Analysis

### What's Missing: Unified `benchmark-runner.sh`

The existing scripts are specialized:
- `solo-runner.sh` - Single agent, single scenario
- `job-fair-runner.sh` - Full matrix (all characters × all roles)

**Missing:** A unified entry point that:
1. Loads test cases from `benchmarks/test-cases/*.yaml`
2. Routes to appropriate runner based on mode
3. Aggregates results consistently
4. Supports different run configurations

### Proposed Architecture

```
benchmark-runner.sh
├── --mode solo     → Calls solo-runner.sh
├── --mode matrix   → Calls job-fair-runner.sh
├── --mode suite    → NEW: Run all test cases for a role
└── --mode catalog  → NEW: List available test cases
```

## Technical Approach

### Option A: Thin Wrapper
Create `benchmark-runner.sh` as a dispatcher that:
1. Parses arguments to determine mode
2. Discovers test cases from `benchmarks/test-cases/`
3. Delegates to existing runners
4. Standardizes output format

**Pros:** Leverages working infrastructure, low risk
**Cons:** Another layer of indirection

### Option B: Consolidated Runner
Refactor solo-runner.sh to handle test case loading internally.

**Pros:** Single source of truth
**Cons:** Higher risk, more changes

### Recommended: Option A (Thin Wrapper)

The existing runners are battle-tested. A thin wrapper provides:
- Unified entry point
- Test case discovery
- Output standardization
- Minimal risk

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `scripts/benchmark-runner.sh` | **CREATE** | Unified entry point |
| `pennyfarthing-dist/commands/run-benchmark.md` | **CREATE** | Command spec (optional) |

## Implementation Details

### benchmark-runner.sh Responsibilities

```bash
# 1. Parse arguments
benchmark-runner.sh [--mode MODE] [--category CAT] [--case CASE] [AGENT_SPEC]

# 2. Modes
--mode catalog   # List available test cases
--mode solo      # Run single agent on single case
--mode suite     # Run agent on all cases in category
--mode matrix    # Full job-fair execution

# 3. Test case discovery
find benchmarks/test-cases -name "*.yaml" | sort

# 4. Delegate to existing runners
solo-runner.sh $AGENT_SPEC $SCENARIO $OUTPUT_DIR

# 5. Output structured results
{
  "mode": "solo",
  "agent": "rome:dev",
  "test_case": "dev-001",
  "score": 85.5,
  "tokens": { "input": 4500, "output": 1200 },
  "duration_ms": 45000
}
```

### Critical Shell Rules (MUST FOLLOW)

1. **Pipe syntax** for claude CLI:
   ```bash
   cat "$prompt_file" | claude -p --output-format json --tools ""
   ```

2. **File redirection** for outputs:
   ```bash
   claude ... > "$output_file"
   ```

3. **`--tools ""`** flag mandatory

## Testing Strategy

### Tests to Write (RED phase)

1. **test_catalog_mode** - Lists available test cases
2. **test_solo_mode** - Runs single test case
3. **test_suite_mode** - Runs all cases in category
4. **test_yaml_loading** - Parses test case YAML correctly
5. **test_output_format** - Validates JSON output structure
6. **test_error_handling** - Handles missing files, bad YAML

### Test Approach

Since this is shell scripting:
- Use `bats` (Bash Automated Testing System) or simple shell test scripts
- Mock the claude CLI for fast tests
- Validate JSON output with `jq`

## Dependencies & Risks

- **Low risk:** Building on proven runners
- **Dependency:** Requires `yq`, `jq`, existing runners
- **Risk:** Shell execution patterns must follow rules

## Reference Files

- `scripts/solo-runner.sh` - Foundation (working)
- `scripts/job-fair-runner.sh` - Matrix logic (working)
- `benchmarks/test-cases/dev/dev-001-buggy-service.yaml` - Test case format
- `sprint/context/epic-7-tech-context.md` - Epic context
