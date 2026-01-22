# Story 3-3: Circuit Breaker at 85% - Summary

## What Was Built

A context circuit breaker hook (`context-circuit-breaker.sh`) that blocks tool execution when context usage reaches 85% or higher. Unlike the warning hook (story 3-2) which only warns, this hook **blocks** Claude from continuing, forcing a graceful handoff. The hook provides clear recovery instructions including checkpoint save commands, session update guidance, and references to the `/continue-session` command.

## Key Technical Decisions

1. **Separate Hook (Not Modifying context-warning.sh)**: Kept warnings and hard stops separate for cleaner configuration and easier enable/disable of either feature independently.

2. **Graceful Degradation**: Three fallback paths ensure the hook fails-open (allows tools) if check-context.sh is unavailable, returns garbage, or fails silently. This prevents the circuit breaker from inadvertently blocking all operations.

3. **Exit 2 for Blocking**: Uses Claude Code's PreToolUse hook protocol where exit 2 blocks the tool and stderr content is shown to Claude as an error message.

4. **Hook Ordering**: Registered after context-warning.sh so users see the warning before the block message.

## Implementation Patterns

- **Hook Structure**: Mirrors `context-warning.sh` exactly (lines 10-27 nearly identical) for consistency
- **stdin Consumption**: Uses `cat > /dev/null` per PreToolUse hook protocol
- **Environment Variables**: Uses `CRITICAL_THRESHOLD` with default 85% for configurability
- **Defensive Sourcing**: Adds `2>/dev/null || true` to find-root.sh source (improvement over reference)

## Files Modified

| File | Change |
|------|--------|
| `pennyfarthing-dist/scripts/hooks/context-circuit-breaker.sh` | NEW - 61 lines, blocking hook |
| `pennyfarthing-dist/templates/settings.local.json.template` | +9 lines, hook registration |
| `tests/resilience/test_context_circuit_breaker.sh` | NEW - 300 lines, 20 tests |

## Lessons for Future Work

1. **Pattern Improvement Identified**: The defensive `|| true` pattern for sourcing find-root.sh is more robust than the existing pattern in context-warning.sh. Consider backporting this improvement.

2. **Test Pattern**: Shell-based tests using grep patterns against hook files are effective for behavior verification without needing to mock complex Claude Code infrastructure.

3. **Recovery UX**: Clear, numbered action lists in error messages help agents understand what to do when blocked. The checkpoint_save instruction format with `{phase}` and `{work_summary}` placeholders guides agents to provide useful context.

## Acceptance Criteria Verified

- [x] AC1: Circuit breaker triggers at 85% context usage (8 tests)
- [x] AC2: Checkpoint saved before break - instructions provided (3 tests)
- [x] AC3: Clear instructions for resumption (7 tests)
