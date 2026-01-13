# Story 31-7: Generic Workflow-Driven Handoff Subagent - Summary

## What Was Built
Single `generic-handoff.ts` module in `packages/core/src/workflow/` that replaces the logic of 5 hardcoded handoff subagents. The module provides functions to find phases, determine next phase (including rejection loops), check gate conditions, and format phase transitions for session files.

## Key Technical Decisions
- **TypeScript in packages/core**: Implementation lives in the core package as reusable workflow logic, not as a markdown agent definition
- **Gate type dispatch**: Switch statement handles `tests_fail`, `tests_pass`, `approval`, `manual` gate types
- **Rejection loop logic**: `getNextPhase()` with `verdict: 'rejected'` searches backwards for most recent `tests_pass` gate phase
- **Duration formatting**: Human-readable durations (30m, 2h 30m) for phase history tables

## Implementation Patterns
- Interface-first design with `GateContext`, `NextPhaseOptions`, `GateCheckResult`, `PhaseTransitionParams`
- Null-safe phase lookup using optional chaining and nullish coalescing
- Integration tests load actual `tdd.yaml` and `trivial.yaml` workflow files

## Files Modified
- `packages/core/src/workflow/generic-handoff.ts` (new - 344 lines)
- `packages/core/src/workflow/generic-handoff.test.ts` (new - 641 lines)

## Lessons for Future Work
- The 5 original handoff markdown files (`tea-handoff.md`, etc.) still exist and are used by agents. This TypeScript module provides the logic; the agent definitions still need updating to use it
- Story 31-8 (eliminate redundant test runs) can leverage this by caching test results with timestamps in session file
