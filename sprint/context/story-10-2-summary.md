# Story 10-2 Summary: Document Helper Delegation Pattern

**Completed:** 2026-01-06
**Points:** 2
**Epic:** 10 - Multi-Agent Choreography Patterns

## What Was Built

Created comprehensive documentation for the Opus-to-Haiku helper delegation pattern—the foundational choreography mechanism used throughout Pennyfarthing. The 488-line guide covers invocation patterns, prompt construction, result handling, error recovery, and five anti-patterns to avoid. This completes the second pattern document in Epic 10's documentation initiative.

## Key Technical Decisions

1. **Two-Tier Architecture Documentation:** Documented the clear separation between Opus (reasoning) and Haiku (mechanical execution), emphasizing that this division preserves context budget while maintaining quality.

2. **Real Examples Over Abstract Patterns:** Used actual line references from existing subagent files (`workflow-status-check.md`, `tea-handoff.md`, `sm-story-setup.md`) rather than synthetic examples, ensuring documentation stays grounded in working code.

3. **Decision Heuristic Tree:** Included a concrete decision tree for when to delegate vs. handle inline, making the delegation criteria actionable rather than philosophical.

## Implementation Patterns

- **Placeholder Substitution:** `{value}` markers in prompts replaced by calling agent before spawn
- **Structured Output Format:** Subagents return structured data blocks that parent agents can parse
- **Error Escalation Protocol:** Three-tier escalation (retry → adjust → escalate) with clear format for returning failures
- **State Detection as Foundation:** `workflow-status-check` serves as canonical example of state detection delegation

## Files Modified

| File | Change |
|------|--------|
| `pennyfarthing-dist/guides/patterns/helper-delegation-pattern.md` | Created (488 lines) |
| `sprint/current-sprint.yaml` | PR link added |

## Lessons for Future Work

1. **Documentation follows code patterns:** The helper delegation pattern emerged organically from implementation; documenting it after the fact required tracing through multiple files. Future patterns should be documented as they're implemented.

2. **Line references require verification:** Reviewer caught that all 8 line references needed verification against source files—documentation with code references needs the same review rigor as code itself.

3. **Sibling consistency matters:** Following the exact structure of `tdd-flow-pattern.md` made review faster and ensures users can navigate between pattern documents predictably.

4. **Forward references are acceptable:** Referencing planned future documents (approval-gates, fan-out-fan-in) is consistent with how the codebase handles planned work—documented in references but not yet implemented.
