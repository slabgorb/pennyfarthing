# Technical Context: Story 21-1 - /check Command

## Overview

Create a `/check` command that runs code quality gates (lint, type check, tests) and integrate it with the dev-handoff subagent to automatically verify quality before PR review.

## Architecture

### Command Location
```
pennyfarthing-dist/commands/check.md  # Source definition
.claude/commands/check.md             # Symlink (auto-created by install)
```

### Integration Point
```
pennyfarthing-dist/agents/dev-handoff.md  # Modify to call /check
```

## Existing Patterns to Follow

### Command Structure (from health-check.md)
```markdown
---
description: [one-line description]
---

<purpose>
[What this command does]
</purpose>

<when-to-use>
[Scenarios for using this command]
</when-to-use>

<execution>
[Step-by-step what the command does]
</execution>

<output-format>
[Expected output format]
</output-format>

<reference>
[Related files and commands]
</reference>
```

### Quality Gate Detection Priority
1. **justfile** - Check for `just lint`, `just typecheck`, `just test`
2. **package.json** - Check for npm scripts (lint, typecheck, test)
3. **Makefile** - Check for make targets
4. **Direct tools** - Fall back to eslint, tsc, npm test

### Current Project Quality Commands
From justfile:
```bash
just build    # Build all packages (pnpm run build)
just test     # Run tests for all packages (pnpm test)
```

From packages/cyclist/package.json:
```json
{
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "lint": "eslint src/"  // May not exist - verify
  }
}
```

## dev-handoff Current Flow

From `pennyfarthing-dist/agents/dev-handoff.md`:
```
Pre-Flight Verification:
0. Dev Assessment exists
1. Tests are GREEN        <- /check replaces this
2. Git working tree clean
3. Changes pushed
4. PR exists
```

**New flow with /check:**
```
Pre-Flight Verification:
0. Dev Assessment exists
1. Run /check (lint + typecheck + tests)  <- NEW
2. Git working tree clean
3. Changes pushed
4. PR exists
```

## Key Implementation Details

### /check Command Logic
```bash
# Pseudocode
check_lint() {
  if [[ -f justfile ]] && just --list | grep -q "^lint"; then
    just lint
  elif [[ -f package.json ]] && npm run | grep -q "lint"; then
    npm run lint
  else
    echo "No lint command found - skipping"
  fi
}

check_typecheck() {
  if [[ -f justfile ]] && just --list | grep -q "^typecheck"; then
    just typecheck
  elif [[ -f package.json ]]; then
    npx tsc --noEmit 2>/dev/null || echo "No TypeScript config"
  fi
}

check_test() {
  if [[ -f justfile ]]; then
    just test
  elif [[ -f package.json ]]; then
    npm test
  fi
}
```

### Output Format
```markdown
# /check Results

## Lint
[PASS] No linting errors
  - eslint: 0 errors, 0 warnings

## Type Check
[PASS] No type errors
  - tsc --noEmit: success

## Tests
[PASS] All tests passing
  - 245 tests passed
  - 0 tests failed

## Summary
[PASS] All checks passed - ready for review
```

### Failure Output
```markdown
# /check Results

## Lint
[FAIL] Linting errors found
  - eslint: 3 errors, 2 warnings
  - src/api/index.ts:15 - 'unused' is defined but never used

## Summary
[FAIL] 1 check failed - fix before review
```

### --skip-check Flag
When `--skip-check` is passed:
```markdown
# /check Skipped

⚠️ Quality checks bypassed with --skip-check flag.

This should only be used in emergencies. Consider running:
  /check

before requesting review.
```

## Test Strategy (for TEA)

### Test Files to Create
```
tests/check-command.test.ts  # If testing command parsing
```

### Manual Verification Tests
1. `/check` runs all three gates
2. `/check` reports pass/fail clearly
3. `/check --skip-check` bypasses checks
4. dev-handoff calls /check automatically
5. dev-handoff blocks on /check failure
6. Works with justfile recipes

### Integration Tests
- Mock project with lint errors → verify failure
- Mock project all passing → verify success
- Verify dev-handoff integration calls /check

## Dependencies

### Required Tools (checked at runtime)
- `just` (optional - detected)
- `npm` (required for Node projects)
- `tsc` (optional - for TypeScript)
- `eslint` (optional - for linting)

### Environment
- `$CLAUDE_PROJECT_DIR` - Project root (set by SessionStart hook)

## Risk Considerations

1. **Performance** - Running full test suite could be slow
   - Mitigation: Consider `--quick` flag for fast subset

2. **False Positives** - Lint rules may flag non-issues
   - Mitigation: Use project's existing lint config

3. **Missing Tools** - Some projects may not have lint/typecheck
   - Mitigation: Graceful degradation with warnings

## Related Files

| File | Purpose |
|------|---------|
| `pennyfarthing-dist/commands/health-check.md` | Pattern reference |
| `pennyfarthing-dist/agents/dev-handoff.md` | Integration target |
| `.claude/skills/testing/SKILL.md` | Test command patterns |
| `justfile` | Quality command recipes |
