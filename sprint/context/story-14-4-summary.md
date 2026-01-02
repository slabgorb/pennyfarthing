# Story 14-4: Create Debugging Challenge Scenarios - Completion Summary

## What Was Built

Created 10 debugging challenge scenarios in YAML format with TRAIL error taxonomy for Epic 14's OCEAN personality correlation research. Each scenario contains realistic bugs categorized as reasoning, planning, or execution errors - the three error types from Patronus AI's TRAIL benchmark. The scenarios range from easy (off-by-one loops) to hard (race conditions, SQL injection) and include comprehensive test coverage.

## Key Technical Decisions

1. **Error taxonomy mapping**: Used TRAIL's three-category model (reasoning/planning/execution) rather than traditional severity-based bug classification, enabling research into whether OCEAN personality traits correlate with specific error types.

2. **Mixed vs single-type scenarios**: Created both single-type scenarios (6) for clean taxonomy isolation and mixed-type scenarios (4) for realistic debugging challenges. This balance supports both controlled experiments and real-world validation.

3. **Schema extension**: Extended `scenarios/schema.yaml` with `error_type` field on baseline_issues, making taxonomy consistent across all scenario types.

## Implementation Patterns

- **Scenario structure**: Each scenario follows consistent format - id, name, title, category, difficulty, prompt, code block, baseline_issues (by severity), scoring rubric
- **Error type distribution**: 21 reasoning, 24 planning, 16 execution - balanced coverage across all TRAIL categories
- **Test validation**: 22 acceptance criteria tests validate structure, distribution requirements, and schema compliance

## Files Modified

**10 Scenarios Created:**
- `scenarios/debugging/off-by-one-loop.yaml` - Easy, execution
- `scenarios/debugging/null-check-missing.yaml` - Easy, execution
- `scenarios/debugging/simple-logic-error.yaml` - Easy, reasoning
- `scenarios/debugging/async-control-flow.yaml` - Medium, planning
- `scenarios/debugging/resource-leak.yaml` - Medium, planning
- `scenarios/debugging/input-validation.yaml` - Medium, mixed
- `scenarios/debugging/error-handling.yaml` - Medium, mixed
- `scenarios/debugging/race-condition.yaml` - Hard, planning
- `scenarios/debugging/sql-injection.yaml` - Hard, reasoning
- `scenarios/debugging/auth-bypass.yaml` - Hard, mixed

**Supporting Files:**
- `scenarios/schema.yaml` - Extended with error_type field
- `src/scripts/debugging-scenarios.test.ts` - 22 validation tests
- `pennyfarthing-dist/personas/TRAIL-OCEAN-MAPPING.md` - Research documentation

## Lessons for Future Work

1. **Line number references**: When referencing lines in code blocks within YAML, numbers refer to the code content starting at line 1, not the YAML file line. Document this convention.

2. **Single vs mixed classification**: A scenario is "mixed" if it has even one issue with a different error_type. Consider making classification explicit in scenario metadata rather than computed.

3. **Difficulty calibration**: Current calibration is intuitive (easy = mechanical bugs, hard = security/concurrency). Future work could add empirical baseline scores from control runs.
