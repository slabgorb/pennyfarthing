# Story 37-16: Agent High-Context Circuit Breaker Not Triggering - Summary

**Completed:** 2026-01-16
**Points:** 3
**Priority:** P1
**Workflow:** TDD

## What Was Built

Fixed a bug where the context circuit breaker hook (`context-circuit-breaker.sh`) was never invoked because it wasn't registered in the project's `.claude/settings.local.json` file. The hook script existed in the template but wasn't applied to the actual project. Also aligned UI threshold colors in Cyclist with the backend circuit breaker thresholds (70% warning, 85% critical).

## Key Technical Decisions

1. **Config separation**: Moved `context_budget` configuration to `.pennyfarthing/config.local.yaml` rather than `.claude/settings.local.json`. This properly separates Pennyfarthing-specific config from Claude SDK hook configuration. The SDK's schema validation rejected custom fields anyway.

2. **Graceful fallbacks**: The `check-context.sh` script now reads from YAML (preferred) with JSON fallback, then built-in defaults. This ensures the circuit breaker works even without explicit configuration.

3. **Threshold alignment**: Unified UI and backend thresholds - warning at 70%, danger/critical at 85%. Previously UI used 50%/80% which was confusing since warnings didn't match when the circuit breaker would actually trigger.

## Implementation Patterns

- **PreToolUse hooks**: Circuit breaker uses `Edit|Write|Bash|Task` matcher to intercept destructive operations
- **Exit code 2**: Claude Code hook protocol - exit 2 blocks the tool, exit 0 allows
- **YAML with Python**: Shell scripts can use Python + PyYAML for config parsing with clean fallback chains

## Files Modified

### pennyfarthing repo:
- `.claude/settings.local.json` - Added circuit-breaker hook to PreToolUse
- `.pennyfarthing/config.local.yaml` - Added context_budget section (warning: 70, critical: 85)
- `pennyfarthing-dist/scripts/check-context.sh` - Enhanced to read from YAML with JSON fallback
- `pennyfarthing-dist/agents/generic-sm-setup.md` - Documented correct session file header format
- `tests/resilience/test_context_circuit_breaker.sh` - Added AC4 tests for project settings

### cyclist repo:
- `packages/cyclist/src/public/js/stats-strip.js` - Aligned thresholds: COMPACT_IMMINENT=70, warning=70%, danger=85%
- `packages/cyclist/tests/B-22-stats-strip.test.ts` - Added AC6 tests for threshold alignment

## Test Results

- Shell tests: 24/24 passing (includes 4 new AC4 tests)
- Cyclist tests: 40/40 passing (includes 3 new AC6 tests)

## Lessons for Future Work

1. **Template vs project settings**: Hooks in templates must be explicitly copied to project settings. The `pennyfarthing init` command should handle this, but manual projects need verification.

2. **Session file format matters**: Cyclist's story parser expects exact header format `# Story {ID}: {Title}`. Deviations like `# Story {ID} Session: Title` break detection.

3. **Threshold consistency**: When adding UI indicators for backend limits, always verify the thresholds match. Document the source of truth in code comments.

## Root Cause

The circuit breaker hook existed at `pennyfarthing-dist/scripts/hooks/context-circuit-breaker.sh` and was referenced in the settings template, but the actual project's `.claude/settings.local.json` never had it registered. The hook was never invoked because Claude Code only runs hooks that are registered in the active settings file.
