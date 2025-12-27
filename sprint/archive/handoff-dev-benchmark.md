# Handoff: Developer Agent TDD Benchmark

## Context

Created a new TDD-based benchmark for developer agents: `dev-002-tdd-shopping-cart.yaml`

The previous benchmark (dev-001) tested bug detection, not true TDD. The new benchmark:
- Provides failing tests (26 test cases)
- Developer must implement code to pass them
- Measures TDD discipline: minimal code, no over-engineering

## Task: Run Dev Agent Benchmarks

Run the DEV-002 TDD benchmark across all themes using Opus subagents.

### Themes to Test

1. `discworld` - Ponder Stibbons
2. `star-trek-tos` - Scotty
3. `star-trek` - Geordi La Forge
4. `literary-classics` - Passepartout
5. `minimalist` - Developer (no persona)
6. `jane-austen` - (check dev persona)
7. `shakespeare` - (check dev persona)

### Benchmark File

`/Users/keithavery/Projects/pennyfarthing/benchmarks/test-cases/dev/dev-002-tdd-shopping-cart.yaml`

### Scoring Rubric

Use the enhanced scoring rubric at:
`/Users/keithavery/Projects/pennyfarthing/benchmarks/enhanced-scoring-rubric.md`

Adapted for TDD:
- **Tests Passing (50%)**: How many of 26 tests pass
- **Minimal Code (20%)**: Did they avoid over-engineering
- **Code Quality (20%)**: Clean, idiomatic implementation
- **TDD Discipline (10%)**: No test modification, matches contracts

### How to Run Each Benchmark

For each theme:

1. **Set theme** (conceptually - inject via prompt)
2. **Provide the test file and stub** from dev-002
3. **Ask agent to implement** the shopping cart
4. **Evaluate the response** using the rubric

### Prompt Template for Each Run

```
You are the Developer agent. Your persona is [PERSONA_NAME] from [THEME].

## Your Task

Implement the shopping cart to make all tests pass. The tests are provided below.

RULES:
1. Write ONLY code needed to pass tests - no extra features
2. Do not modify the tests
3. Follow TDD principles: minimal implementation

## Test File (DO NOT MODIFY)

[INSERT shopping_cart_test.go content]

## Stub to Implement

[INSERT shopping_cart.go stub content]

## Your Implementation

Provide your complete implementation of shopping_cart.go.
```

### Output Format for Each Run

Save results to: `benchmarks/results/dev-002-{theme}-{timestamp}.yaml`

```yaml
benchmark_id: dev-002
theme: [theme name]
persona: [persona name]
run_timestamp: [ISO timestamp]
model: opus

results:
  tests_passing:
    passed: [number]
    failed: [number]
    score: [0-100]

  minimal_code:
    penalties: [list of anti-patterns found]
    deductions: [total deductions]
    score: [0-100]

  code_quality:
    idiomatic_go: [1-5]
    clear_logic: [1-5]
    proper_types: [1-5]
    no_bugs: [1-5]
    score: [0-100]

  tdd_discipline:
    test_modification: [yes/no]
    contract_match: [yes/no]
    score: [0-100]

overall_score: [weighted composite]

implementation: |
  [full implementation code]

notes: |
  [evaluator observations]
```

### Parallel Execution

Run themes in parallel using Task tool with subagent_type=general-purpose, model=opus.

Launch 3-4 at a time to avoid overwhelming the system.

## Files Created This Session

- `benchmarks/test-cases/dev/dev-002-tdd-shopping-cart.yaml` - New TDD benchmark

## Next Steps

1. Read the benchmark file to get test content
2. Read theme files to get dev personas
3. Launch parallel Opus agents for each theme
4. Collect and compare results
5. Write summary comparison report
