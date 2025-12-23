# Story 1-4c: Add Structured Logging Utility - Technical Context

## Story Overview
- **Epic:** 1 - Agentic Best Practices Implementation
- **Points:** 2 (Trivial)
- **Priority:** P2
- **Jira:** MSSCI-11126
- **Repos:** pennyfarthing

## Current State

Existing utility scripts in `scripts/utils/`:
- `retry.sh` - Exponential backoff, well-documented functions
- `checkpoint.sh` - Pipe-delimited format, writes to `.session/checkpoints.log`
- `repo-scan.sh` - Git status scanning

Current logging patterns:
- `deploy.sh` and `release.sh` have simple colored logging (`log_info`, `log_warn`, `log_error`)
- `checkpoint.sh` uses ISO timestamps and pipe-delimited format
- Session hooks already set `$SESSION_ID` and `$PROJECT_ROOT` environment variables

## Technical Approach

Create `scripts/utils/logging.sh` following existing utility patterns:
1. Three core functions: `log_info`, `log_warn`, `log_error`
2. JSON output format for structured logging
3. Leverage existing environment variables (`$SESSION_ID`, `$AGENT_NAME`, `$PROJECT_ROOT`)
4. Write to `.session/agent-logs.jsonl` (JSON Lines format for easy parsing)

## Files to Create

| File | Purpose |
|------|---------|
| `scripts/utils/logging.sh` | New structured logging utility |

## Acceptance Criteria
- [ ] AC1: logging.sh provides log_info, log_warn, log_error functions
- [ ] AC2: JSON output format with timestamp, level, agent, message
- [ ] AC3: Integrates with existing session file workflow

## Testing Strategy

Manual verification:
```bash
source scripts/utils/logging.sh
AGENT_NAME="test" log_info "Test message"
# Should output JSON to stdout and append to .session/agent-logs.jsonl
```

## Implementation Notes

- Follow existing utility script patterns (shebang, header comments, function docs)
- Use `date -u +"%Y-%m-%dT%H:%M:%SZ"` for ISO timestamps (matches checkpoint.sh)
- Default `AGENT_NAME` to "unknown" if not set
- Include optional `--agent` parameter override
- Consider adding `log_rotate` function similar to checkpoint.sh
