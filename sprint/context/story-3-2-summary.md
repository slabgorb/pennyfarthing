# Story 3-2: Add automatic warning at 70% threshold

## What Was Built

Added a PreToolUse hook that monitors context usage and warns agents when approaching limits. The hook outputs actionable warnings at 70% (caution) and 85% (critical), helping agents know when to wrap up and hand off.

## Key Technical Decisions

1. **Hook-based injection** - Used Claude Code's PreToolUse hook mechanism to inject warnings into agent context without blocking tool execution.

2. **Reused check-context.sh** - Leveraged existing context checking infrastructure rather than duplicating token parsing logic.

3. **Two-tier warnings** - 70% triggers "consider wrapping up", 85% triggers "wrap up immediately". Prepares for story 3-3 circuit breaker.

4. **Selective tool matching** - Hook runs on Edit|Write|Bash|Task (high-impact tools) rather than all tools to balance coverage vs. performance.

## Implementation Patterns

- Graceful degradation: Hook exits 0 silently if context check fails
- Environment variable overrides: WARNING_THRESHOLD and CRITICAL_THRESHOLD can be overridden
- Concise warnings: Messages are actionable but don't waste context tokens

## Files Modified

| File | Change |
|------|--------|
| `pennyfarthing-dist/scripts/hooks/context-warning.sh` | New hook (67 lines) |
| `pennyfarthing-dist/templates/settings.local.json.template` | Added PreToolUse registration |

## Lessons for Future Work

- PreToolUse hooks can inject context without blocking - useful for warnings, hints, reminders
- Hook performance matters when running on every tool call - consider caching or sampling for expensive checks
- Story 3-3 (circuit breaker at 85%) can build on this by changing exit code to 2 to block
